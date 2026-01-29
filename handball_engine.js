/**
 * Handball Pricing Engine
 *
 * Sport Characteristics:
 * - Two 30-minute halves (60 minutes total)
 * - High-scoring: typical total ~50-60 goals per match
 * - Each team scores ~25-30 goals (xG)
 * - Fast pace with consistent scoring patterns
 * - No overtime in regular season (draws allowed)
 *
 * Model Approach:
 * - Normal (Gaussian) distribution for goal probabilities
 * - Based on 13,899 historical matches (2014-2024)
 * - High scoring allows Central Limit Theorem to apply
 * - Bivariate Normal for (Home, Away) scores with correlation
 * - Inputs: Handicap line/odds + Total Goals line/odds
 * - Solves for μ_home and μ_away (expected goals for each team)
 *
 * Historical Data Foundation:
 * - Home: μ=28.92, σ=5.10
 * - Away: μ=27.78, σ=4.85
 * - Total: μ=56.70, σ=7.18
 * - Difference: μ=1.14, σ=6.90
 * - Correlation: ρ≈0.04 (small positive correlation)
 * - Draws: 8.6%, Home wins: 54.2%, Away wins: 37.2%
 *
 * Handicaps: +/-1.5 through +/-8.5
 * Total lines: typically 48.5 - 62.5
 */

import { factorial, probToOdds } from './js/core/math_utils.js';

export class HandballEngine {
    constructor() {
        this.MAX_GOALS = 70;
        this.SOLVER_MAX_ITERATIONS = 1500;
        this.SOLVER_THRESHOLD = 0.0001;

        // Historical standard deviations (from 13,899 matches)
        // These are relatively constant across different match strengths
        this.sigmaHome = 5.10;
        this.sigmaAway = 4.85;
        this.sigmaTotalHistorical = 7.18;
        this.sigmaDiffHistorical = 6.90;

        // Correlation between home and away scores
        // Calculated from: cov = (σ²_total - σ²_home - σ²_away) / 2
        // cov = (51.56 - 26.05 - 23.52) / 2 = 0.995
        // ρ = cov / (σ_home * σ_away) = 0.995 / (5.10 * 4.85) ≈ 0.04
        this.rho = 0.04;

        // First half ratio (48.5% of full-time goals)
        this.H1_RATIO = 0.485;
    }

    // ==========================================
    // STATISTICAL FUNCTIONS - NORMAL DISTRIBUTION
    // ==========================================

    /**
     * Standard Normal CDF (Φ)
     * Using error function approximation
     */
    normalCDF(x) {
        // Abramowitz and Stegun approximation
        const t = 1 / (1 + 0.2316419 * Math.abs(x));
        const d = 0.3989423 * Math.exp(-x * x / 2);
        const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
        return x > 0 ? 1 - p : p;
    }

    /**
     * Standard Normal PDF (φ)
     */
    normalPDF(x) {
        return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
    }

    /**
     * General Normal CDF
     * P(X ≤ x) where X ~ N(μ, σ²)
     */
    normalCDFGeneral(x, mu, sigma) {
        const z = (x - mu) / sigma;
        return this.normalCDF(z);
    }

    /**
     * General Normal PDF
     * f(x) where X ~ N(μ, σ²)
     */
    normalPDFGeneral(x, mu, sigma) {
        const z = (x - mu) / sigma;
        return this.normalPDF(z) / sigma;
    }

    /**
     * Calculate probability for discrete goals using Normal distribution
     * P(X = k) ≈ P(k - 0.5 < X < k + 0.5) with continuity correction
     */
    normalDiscretePMF(k, mu, sigma) {
        const lower = k - 0.5;
        const upper = k + 0.5;
        return this.normalCDFGeneral(upper, mu, sigma) - this.normalCDFGeneral(lower, mu, sigma);
    }

    /**
     * Bivariate Normal PDF
     * f(x,y) for (X,Y) ~ BivariateNormal(μ_x, μ_y, σ_x, σ_y, ρ)
     */
    bivariateNormalPDF(x, y, muX, muY, sigmaX, sigmaY, rho) {
        const zX = (x - muX) / sigmaX;
        const zY = (y - muY) / sigmaY;
        const rho2 = rho * rho;

        const exponent = -1 / (2 * (1 - rho2)) * (zX * zX - 2 * rho * zX * zY + zY * zY);
        const coefficient = 1 / (2 * Math.PI * sigmaX * sigmaY * Math.sqrt(1 - rho2));

        return coefficient * Math.exp(exponent);
    }

    /**
     * Calculate correlation from total and difference variances
     * Given: σ²_total, σ²_diff, σ²_home, σ²_away
     * Returns: ρ (correlation coefficient)
     */
    calculateCorrelation(sigmaHome, sigmaAway, sigmaTotal) {
        const varHome = sigmaHome * sigmaHome;
        const varAway = sigmaAway * sigmaAway;
        const varTotal = sigmaTotal * sigmaTotal;

        // σ²_total = σ²_home + σ²_away + 2*ρ*σ_home*σ_away
        // Solve for ρ
        const covariance = (varTotal - varHome - varAway) / 2;
        const rho = covariance / (sigmaHome * sigmaAway);

        return Math.max(-0.99, Math.min(0.99, rho)); // Clamp to valid range
    }

    /**
     * Calculate total variance from home/away variances and correlation
     */
    calculateTotalSigma(sigmaHome, sigmaAway, rho) {
        const varHome = sigmaHome * sigmaHome;
        const varAway = sigmaAway * sigmaAway;
        const varTotal = varHome + varAway + 2 * rho * sigmaHome * sigmaAway;
        return Math.sqrt(varTotal);
    }

    /**
     * Calculate difference variance from home/away variances and correlation
     */
    calculateDiffSigma(sigmaHome, sigmaAway, rho) {
        const varHome = sigmaHome * sigmaHome;
        const varAway = sigmaAway * sigmaAway;
        const varDiff = varHome + varAway - 2 * rho * sigmaHome * sigmaAway;
        return Math.sqrt(varDiff);
    }

    /**
     * Generate probability matrix for all score combinations using Bivariate Normal
     * Discretizes the continuous bivariate normal to integer goals
     */
    generateMatrix(muHome, muAway, sigmaHome = this.sigmaHome, sigmaAway = this.sigmaAway, rho = this.rho, maxGoals = this.MAX_GOALS) {
        const matrix = [];

        // For each possible score combination, calculate probability
        // using continuity correction: P(H=h, A=a) ≈ ∫∫ f(x,y) dx dy over [h-0.5, h+0.5] × [a-0.5, a+0.5]
        // Approximated using midpoint evaluation
        for (let h = 0; h <= maxGoals; h++) {
            matrix[h] = [];
            for (let a = 0; a <= maxGoals; a++) {
                // Use midpoint and approximate as rectangle
                const prob = this.bivariateNormalPDF(h, a, muHome, muAway, sigmaHome, sigmaAway, rho);
                matrix[h][a] = prob;
            }
        }

        // Normalize to ensure probabilities sum to 1.0
        let totalProb = 0;
        for (let h = 0; h <= maxGoals; h++) {
            for (let a = 0; a <= maxGoals; a++) {
                totalProb += matrix[h][a];
            }
        }

        if (totalProb > 0) {
            for (let h = 0; h <= maxGoals; h++) {
                for (let a = 0; a <= maxGoals; a++) {
                    matrix[h][a] /= totalProb;
                }
            }
        }

        return matrix;
    }

    // ==========================================
    // VIGORISH REMOVAL
    // ==========================================

    removeVig2Way(odds1, odds2) {
        const impliedProbs = [1 / odds1, 1 / odds2];
        const total = impliedProbs.reduce((a, b) => a + b, 0);
        return impliedProbs.map(p => p / total);
    }

    removeVig3Way(odds1, oddsX, odds2) {
        const impliedProbs = [1 / odds1, 1 / oddsX, 1 / odds2];
        const total = impliedProbs.reduce((a, b) => a + b, 0);
        return impliedProbs.map(p => p / total);
    }

    // ==========================================
    // MARKET CALCULATIONS FROM MATRIX
    // ==========================================

    calc1X2FromMatrix(matrix) {
        let homeWin = 0, draw = 0, awayWin = 0;
        const maxGoals = matrix.length - 1;

        for (let h = 0; h <= maxGoals; h++) {
            for (let a = 0; a <= maxGoals; a++) {
                if (h > a) homeWin += matrix[h][a];
                else if (h === a) draw += matrix[h][a];
                else awayWin += matrix[h][a];
            }
        }

        return { homeWin, draw, awayWin };
    }

    /**
     * Calculate total goals probability using Normal distribution
     * More accurate than matrix summation for totals
     */
    calcTotalNormal(muHome, muAway, line) {
        const muTotal = muHome + muAway;
        const sigmaTotal = this.calculateTotalSigma(this.sigmaHome, this.sigmaAway, this.rho);

        // P(Total > line) with continuity correction
        const over = 1 - this.normalCDFGeneral(line + 0.5, muTotal, sigmaTotal);

        return { over, under: 1 - over };
    }

    calcTotalFromMatrix(matrix, line) {
        let over = 0;
        const maxGoals = matrix.length - 1;

        for (let h = 0; h <= maxGoals; h++) {
            for (let a = 0; a <= maxGoals; a++) {
                if (h + a > line) {
                    over += matrix[h][a];
                }
            }
        }

        return { over, under: 1 - over };
    }

    /**
     * Calculate handicap probability using Normal distribution
     * More accurate than matrix summation for handicaps
     */
    calcHandicapNormal(muHome, muAway, line) {
        const muDiff = muHome - muAway;
        const sigmaDiff = this.calculateDiffSigma(this.sigmaHome, this.sigmaAway, this.rho);

        // P(Home + line > Away) = P(Home - Away > -line) with continuity correction
        // For discrete goals: P(Diff > -line) ≈ P(Diff > -line - 0.5) for continuity
        const homeCovers = 1 - this.normalCDFGeneral(-line - 0.5, muDiff, sigmaDiff);

        return { homeCovers, awayCovers: 1 - homeCovers };
    }

    calcHandicap(matrix, line) {
        let homeCovers = 0;
        const maxGoals = matrix.length - 1;

        for (let h = 0; h <= maxGoals; h++) {
            for (let a = 0; a <= maxGoals; a++) {
                if (h + line > a) {
                    homeCovers += matrix[h][a];
                }
            }
        }

        return { homeCovers, awayCovers: 1 - homeCovers };
    }

    calcTeamTotal(matrix, line, isHome) {
        let over = 0;
        const maxGoals = matrix.length - 1;

        for (let h = 0; h <= maxGoals; h++) {
            for (let a = 0; a <= maxGoals; a++) {
                const teamGoals = isHome ? h : a;
                if (teamGoals > line) {
                    over += matrix[h][a];
                }
            }
        }

        return { over, under: 1 - over };
    }

    /**
     * Calculate team total using Normal distribution
     */
    calcTeamTotalNormal(mu, line, isHome) {
        const sigma = isHome ? this.sigmaHome : this.sigmaAway;

        // P(Team > line) with continuity correction
        const over = 1 - this.normalCDFGeneral(line + 0.5, mu, sigma);

        return { over, under: 1 - over };
    }

    calcExactGoals(matrix, goals) {
        let prob = 0;
        const maxGoals = matrix.length - 1;

        for (let h = 0; h <= maxGoals; h++) {
            for (let a = 0; a <= maxGoals; a++) {
                if (h + a === goals) {
                    prob += matrix[h][a];
                }
            }
        }

        return prob;
    }

    // ==========================================
    // EXPECTED GOALS SOLVER
    // ==========================================

    /**
     * Solve for expected goals (μ_home, μ_away) using handicap and total goals inputs
     *
     * Inputs:
     * - handicapLine: e.g., -2.5 (home favored by 2.5)
     * - targetHomeCovers: fair probability home covers handicap
     * - totalLine: e.g., 55.5
     * - targetOver: fair probability of over totalLine
     *
     * Outputs:
     * - muHome: Expected goals for home team
     * - muAway: Expected goals for away team
     *
     * Using Normal distributions:
     * - Total ~ N(μ_home + μ_away, σ²_total)
     * - Diff ~ N(μ_home - μ_away, σ²_diff)
     */
    solveMeans(handicapLine, targetHomeCovers, totalLine, targetOver) {
        // Calculate sigmas using historical correlation
        const sigmaTotal = this.calculateTotalSigma(this.sigmaHome, this.sigmaAway, this.rho);
        const sigmaDiff = this.calculateDiffSigma(this.sigmaHome, this.sigmaAway, this.rho);

        // Invert Normal CDF to get mean from probability
        // For total: P(Total > totalLine) = targetOver
        // P(Total > totalLine + 0.5) = targetOver (continuity correction)
        // P((Total - μ_total)/σ_total > (totalLine + 0.5 - μ_total)/σ_total) = targetOver
        // 1 - Φ((totalLine + 0.5 - μ_total)/σ_total) = targetOver
        // Φ((totalLine + 0.5 - μ_total)/σ_total) = 1 - targetOver

        // Solve for μ_total
        const zTotal = this.inverseNormalCDF(1 - targetOver);
        const muTotal = totalLine + 0.5 - zTotal * sigmaTotal;

        // For handicap: P(Diff > -handicapLine) = targetHomeCovers
        // With continuity: P(Diff > -handicapLine - 0.5) = targetHomeCovers
        const zDiff = this.inverseNormalCDF(1 - targetHomeCovers);
        const muDiff = -handicapLine - 0.5 - zDiff * sigmaDiff;

        // Solve system:
        // μ_home + μ_away = muTotal
        // μ_home - μ_away = muDiff
        const muHome = (muTotal + muDiff) / 2;
        const muAway = (muTotal - muDiff) / 2;

        // Ensure reasonable bounds
        const minMu = 10;
        const maxMu = 45;

        return {
            muHome: Math.max(minMu, Math.min(maxMu, muHome)),
            muAway: Math.max(minMu, Math.min(maxMu, muAway)),
            converged: true,
            convergenceError: 0
        };
    }

    /**
     * Inverse Normal CDF (approximation)
     * Given probability p, returns z such that Φ(z) = p
     */
    inverseNormalCDF(p) {
        // Beasley-Springer-Moro algorithm
        const a0 = 2.50662823884;
        const a1 = -18.61500062529;
        const a2 = 41.39119773534;
        const a3 = -25.44106049637;
        const b0 = -8.47351093090;
        const b1 = 23.08336743743;
        const b2 = -21.06224101826;
        const b3 = 3.13082909833;
        const c0 = 0.3374754822726147;
        const c1 = 0.9761690190917186;
        const c2 = 0.1607979714918209;
        const c3 = 0.0276438810333863;
        const c4 = 0.0038405729373609;
        const c5 = 0.0003951896511919;
        const c6 = 0.0000321767881768;
        const c7 = 0.0000002888167364;
        const c8 = 0.0000003960315187;

        if (p <= 0) return -10;
        if (p >= 1) return 10;

        const y = p - 0.5;

        if (Math.abs(y) < 0.42) {
            const r = y * y;
            return y * (((a3 * r + a2) * r + a1) * r + a0) /
                   ((((b3 * r + b2) * r + b1) * r + b0) * r + 1);
        }

        let r = p;
        if (y > 0) r = 1 - p;
        r = Math.log(-Math.log(r));

        const z = c0 + r * (c1 + r * (c2 + r * (c3 + r * (c4 + r * (c5 + r * (c6 + r * (c7 + r * c8)))))));

        return y < 0 ? -z : z;
    }

    // ==========================================
    // MARKET GENERATION
    // ==========================================

    /**
     * Generate all markets from input odds
     * Primary inputs: handicap line/odds + total goals line/odds
     */
    generateAllMarkets(inputs) {
        const {
            handicapLine,
            handicapHomeOdds,
            handicapAwayOdds,
            totalLine,
            overOdds,
            underOdds
        } = inputs;

        // Remove vig from handicap
        const fairHandicap = this.removeVig2Way(handicapHomeOdds, handicapAwayOdds);
        const targetHomeCovers = fairHandicap[0];

        // Remove vig from total goals
        const fairTotal = this.removeVig2Way(overOdds, underOdds);
        const targetOver = fairTotal[0];

        // Solve for expected goals
        const means = this.solveMeans(handicapLine, targetHomeCovers, totalLine, targetOver);

        // Generate full-time matrix using Bivariate Normal
        const matrixFT = this.generateMatrix(
            means.muHome,
            means.muAway,
            this.sigmaHome,
            this.sigmaAway,
            this.rho,
            this.MAX_GOALS
        );

        // Half-time matrix (48.5% of full-time expected goals)
        const matrixHT = this.generateMatrix(
            means.muHome * this.H1_RATIO,
            means.muAway * this.H1_RATIO,
            this.sigmaHome * Math.sqrt(this.H1_RATIO),
            this.sigmaAway * Math.sqrt(this.H1_RATIO),
            this.rho,
            40
        );

        // Calculate all markets
        const markets = {
            means,
            sigmaHome: this.sigmaHome,
            sigmaAway: this.sigmaAway,
            rho: this.rho,
            expectedGoals: {
                home: means.muHome,
                away: means.muAway,
                total: means.muHome + means.muAway
            },
            expectedTotal: means.muHome + means.muAway,

            // 1X2 Markets (derived from matrix)
            matchWinner: this.calc1X2FromMatrix(matrixFT),

            // Handicap Markets (using Normal distribution for accuracy)
            handicaps: this.generateHandicapMarkets(means, handicapLine),

            // Total Goals Markets (using Normal distribution for accuracy)
            totals: this.generateTotalGoalsMarkets(means, totalLine),

            // First Half Markets
            firstHalf: this.generateHalfMarkets(
                means.muHome * this.H1_RATIO,
                means.muAway * this.H1_RATIO,
                'First Half',
                totalLine
            ),

            // HT/FT Market
            htft: this.generateHTFT(matrixHT, matrixFT),

            // Special Markets
            doubleChance: this.generateDoubleChance(matrixFT),
            drawNoBet: this.generateDrawNoBet(matrixFT),

            // Team Totals (using Normal distribution)
            teamTotals: this.generateTeamTotals(means.muHome, means.muAway),

            // Exact Goals
            exactGoals: this.generateExactGoals(matrixFT),

            // Combo Bets
            comboBets: this.generateComboBets(matrixFT, totalLine),

            // Goal Ranges
            goalRanges: this.generateGoalRanges(matrixFT)
        };

        return markets;
    }

    generateHandicapMarkets(means, centralLine) {
        // Generate lines around the central handicap
        const lines = [];
        for (let offset = -4; offset <= 4; offset++) {
            const line = centralLine + offset;
            // Keep half-integer lines
            if (line % 1 !== 0) {
                lines.push(line);
            } else {
                lines.push(line + 0.5);
                lines.push(line - 0.5);
            }
        }

        // Deduplicate and sort
        const uniqueLines = [...new Set(lines)].sort((a, b) => a - b);

        const markets = [];
        for (const line of uniqueLines) {
            // Use Normal distribution for handicap calculation
            const result = this.calcHandicapNormal(means.muHome, means.muAway, line);
            markets.push({
                line,
                homeCovers: result.homeCovers,
                awayCovers: result.awayCovers
            });
        }

        return markets;
    }

    generateTotalGoalsMarkets(means, centralLine) {
        const lines = [];
        for (let offset = -5; offset <= 5; offset++) {
            const line = centralLine + offset;
            if (line >= 30.5) {
                lines.push(line);
            }
        }

        const markets = [];
        for (const line of lines) {
            // Use Normal distribution for total calculation
            const result = this.calcTotalNormal(means.muHome, means.muAway, line);
            markets.push({ line, over: result.over, under: result.under });
        }

        return markets;
    }

    generateHalfMarkets(muHome, muAway, name, totalLine) {
        const sigmaHome = this.sigmaHome * Math.sqrt(this.H1_RATIO);
        const sigmaAway = this.sigmaAway * Math.sqrt(this.H1_RATIO);

        const matrix = this.generateMatrix(muHome, muAway, sigmaHome, sigmaAway, this.rho, 40);

        const result1X2 = this.calc1X2FromMatrix(matrix);

        // Half totals
        const halfCentral = Math.floor(totalLine / 2) + 0.5;
        const totals = [];
        const totalLines = [halfCentral - 2, halfCentral - 1, halfCentral, halfCentral + 1, halfCentral + 2].filter(l => l >= 10.5);
        for (const line of totalLines) {
            const sigmaTotalHalf = this.calculateTotalSigma(sigmaHome, sigmaAway, this.rho);
            const muTotal = muHome + muAway;
            const over = 1 - this.normalCDFGeneral(line + 0.5, muTotal, sigmaTotalHalf);
            totals.push({ line, over, under: 1 - over });
        }

        // Half team totals - find most balanced lines (closest to 50/50)
        let bestHomeLine = Math.floor(muHome) + 0.5;
        let bestAwayLine = Math.floor(muAway) + 0.5;

        const teamTotals = { home: [], away: [] };

        const homeLines = [bestHomeLine - 1, bestHomeLine, bestHomeLine + 1].filter(l => l >= 5.5);
        for (const line of homeLines) {
            const over = 1 - this.normalCDFGeneral(line + 0.5, muHome, sigmaHome);
            teamTotals.home.push({ line, over, under: 1 - over });
        }

        const awayLines = [bestAwayLine - 1, bestAwayLine, bestAwayLine + 1].filter(l => l >= 5.5);
        for (const line of awayLines) {
            const over = 1 - this.normalCDFGeneral(line + 0.5, muAway, sigmaAway);
            teamTotals.away.push({ line, over, under: 1 - over });
        }

        // Asian Handicap - find most balanced line
        const muDiff = muHome - muAway;
        const sigmaDiff = this.calculateDiffSigma(sigmaHome, sigmaAway, this.rho);

        // Find line where home covers ≈ 0.5
        // We want: P(Diff > -line) ≈ 0.5
        // So: -line ≈ muDiff
        // line ≈ -muDiff
        let bestLine = -muDiff;
        bestLine = Math.round(bestLine * 2) / 2; // Round to nearest 0.5

        const handicap = this.calcHandicapNormal(muHome, muAway, bestLine);

        // Draw No Bet
        const dnb = {
            home: result1X2.homeWin / (1 - result1X2.draw),
            away: result1X2.awayWin / (1 - result1X2.draw)
        };

        return {
            name,
            winner: result1X2,
            totals,
            dnb,
            teamTotals,
            handicap: {
                line: bestLine,
                homeCovers: handicap.homeCovers,
                awayCovers: handicap.awayCovers
            }
        };
    }

    generateHTFT(halfMatrix, fullMatrix) {
        const ht = this.calc1X2FromMatrix(halfMatrix);
        const ft = this.calc1X2FromMatrix(fullMatrix);

        return [
            { outcome: 'Home/Home', probability: ht.homeWin * ft.homeWin },
            { outcome: 'Home/Draw', probability: ht.homeWin * ft.draw },
            { outcome: 'Home/Away', probability: ht.homeWin * ft.awayWin },
            { outcome: 'Draw/Home', probability: ht.draw * ft.homeWin },
            { outcome: 'Draw/Draw', probability: ht.draw * ft.draw },
            { outcome: 'Draw/Away', probability: ht.draw * ft.awayWin },
            { outcome: 'Away/Home', probability: ht.awayWin * ft.homeWin },
            { outcome: 'Away/Draw', probability: ht.awayWin * ft.draw },
            { outcome: 'Away/Away', probability: ht.awayWin * ft.awayWin }
        ];
    }

    generateDoubleChance(matrix) {
        const r = this.calc1X2FromMatrix(matrix);
        return {
            homeOrDraw: r.homeWin + r.draw,
            homeOrAway: r.homeWin + r.awayWin,
            drawOrAway: r.draw + r.awayWin
        };
    }

    generateDrawNoBet(matrix) {
        const r = this.calc1X2FromMatrix(matrix);
        return {
            home: r.homeWin / (1 - r.draw),
            away: r.awayWin / (1 - r.draw)
        };
    }

    generateTeamTotals(muHome, muAway) {
        // Find most balanced line for home team (closest to 50/50)
        const bestHomeLine = Math.floor(muHome) + 0.5;
        const bestAwayLine = Math.floor(muAway) + 0.5;

        const homeLines = [bestHomeLine - 2, bestHomeLine - 1, bestHomeLine, bestHomeLine + 1, bestHomeLine + 2].filter(l => l >= 15.5);
        const awayLines = [bestAwayLine - 2, bestAwayLine - 1, bestAwayLine, bestAwayLine + 1, bestAwayLine + 2].filter(l => l >= 15.5);

        const home = [];
        const away = [];

        for (const line of homeLines) {
            const result = this.calcTeamTotalNormal(muHome, line, true);
            home.push({ line, over: result.over, under: result.under });
        }

        for (const line of awayLines) {
            const result = this.calcTeamTotalNormal(muAway, line, false);
            away.push({ line, over: result.over, under: result.under });
        }

        return {
            home,
            away,
            balancedLines: { home: bestHomeLine, away: bestAwayLine }
        };
    }

    generateExactGoals(matrix) {
        const goals = [];

        // Handball: typical range 40-70 total goals
        for (let g = 35; g <= 70; g++) {
            const prob = this.calcExactGoals(matrix, g);
            goals.push({ goals: g, probability: prob });
        }

        // Under 35
        let probUnder35 = 0;
        const maxGoals = matrix.length - 1;
        for (let h = 0; h <= maxGoals; h++) {
            for (let a = 0; a <= maxGoals; a++) {
                if (h + a < 35) probUnder35 += matrix[h][a];
            }
        }
        goals.unshift({ goals: '<35', probability: probUnder35 });

        // Over 70
        let probOver70 = 0;
        for (let h = 0; h <= maxGoals; h++) {
            for (let a = 0; a <= maxGoals; a++) {
                if (h + a > 70) probOver70 += matrix[h][a];
            }
        }
        goals.push({ goals: '71+', probability: probOver70 });

        return goals;
    }

    generateComboBets(matrix, totalLine) {
        const comboMap = {
            'Home & Over': 0,
            'Home & Under': 0,
            'Draw & Over': 0,
            'Draw & Under': 0,
            'Away & Over': 0,
            'Away & Under': 0
        };
        const maxGoals = matrix.length - 1;

        for (let h = 0; h <= maxGoals; h++) {
            for (let a = 0; a <= maxGoals; a++) {
                const total = h + a;
                const prob = matrix[h][a];
                const isOver = total > totalLine;

                if (h > a) {
                    comboMap[isOver ? 'Home & Over' : 'Home & Under'] += prob;
                } else if (h === a) {
                    comboMap[isOver ? 'Draw & Over' : 'Draw & Under'] += prob;
                } else {
                    comboMap[isOver ? 'Away & Over' : 'Away & Under'] += prob;
                }
            }
        }

        const combos = [];
        for (const [outcome, probability] of Object.entries(comboMap)) {
            combos.push({ outcome, probability });
        }

        return combos;
    }

    generateGoalRanges(matrix) {
        const ranges = [
            { label: '35-45', min: 35, max: 45 },
            { label: '40-50', min: 40, max: 50 },
            { label: '42-52', min: 42, max: 52 },
            { label: '45-55', min: 45, max: 55 },
            { label: '48-55', min: 48, max: 55 },
            { label: '48-58', min: 48, max: 58 },
            { label: '50-58', min: 50, max: 58 },
            { label: '50-60', min: 50, max: 60 },
            { label: '52-58', min: 52, max: 58 },
            { label: '52-60', min: 52, max: 60 },
            { label: '55-60', min: 55, max: 60 },
            { label: '55-62', min: 55, max: 62 },
            { label: '55-65', min: 55, max: 65 },
            { label: '58-62', min: 58, max: 62 },
            { label: '58-65', min: 58, max: 65 },
            { label: '60-65', min: 60, max: 65 },
            { label: '60-68', min: 60, max: 68 },
            { label: '62-68', min: 62, max: 68 },
            { label: '65-70', min: 65, max: 70 },
            { label: '65-75', min: 65, max: 75 }
        ];

        const results = [];
        const maxGoals = matrix.length - 1;

        for (const range of ranges) {
            let prob = 0;
            for (let h = 0; h <= maxGoals; h++) {
                for (let a = 0; a <= maxGoals; a++) {
                    const total = h + a;
                    if (total >= range.min && total <= range.max) {
                        prob += matrix[h][a];
                    }
                }
            }
            results.push({ label: range.label, probability: prob });
        }

        return results;
    }
}
