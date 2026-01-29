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
 * - Conway-Maxwell-Poisson (CMP) distribution for goal probabilities
 * - CMP adds dispersion parameter (nu) to model under/over-dispersion
 * - nu > 1: under-dispersion (more consistent than Poisson)
 * - nu = 1: standard Poisson
 * - nu < 1: over-dispersion (more variable than Poisson)
 * - Inputs: Handicap line/odds + Total Goals line/odds
 * - Solves for lambdaHome and lambdaAway (xG for each team)
 * - Probability matrix up to 50 goals per team
 *
 * Handicaps: +/-1.5 through +/-8.5
 * Total lines: typically 48.5 - 62.5
 */

import { factorial, probToOdds } from './js/core/math_utils.js';

export class HandballEngine {
    constructor() {
        this.MAX_GOALS = 50;
        this.SOLVER_MAX_ITERATIONS = 1500;
        this.SOLVER_THRESHOLD = 0.0001;

        // CMP dispersion parameters (nu > 1 for under-dispersion)
        // Handball scoring is more consistent than pure Poisson
        this.nuHome = 1.1;
        this.nuAway = 1.1;
    }

    // ==========================================
    // STATISTICAL FUNCTIONS
    // ==========================================

    /**
     * Conway-Maxwell-Poisson Normalization Constant
     * Z(lambda, nu) = sum_{j=0}^{maxGoals} (lambda^j / (j!)^nu)
     *
     * Cached normalization constants to avoid recomputation
     */
    cmpNormalizationCache = new Map();

    cmpNormalization(lambda, nu, maxGoals = this.MAX_GOALS) {
        const key = `${lambda.toFixed(2)}_${nu.toFixed(2)}`;
        if (this.cmpNormalizationCache.has(key)) {
            return this.cmpNormalizationCache.get(key);
        }

        let Z = 0;
        let logFactorial = 0;

        for (let j = 0; j <= maxGoals; j++) {
            // Compute log((lambda^j) / (j!)^nu)
            const logTerm = j * Math.log(lambda) - nu * logFactorial;
            Z += Math.exp(logTerm);

            // Update log(j!) for next iteration
            if (j > 0) {
                logFactorial += Math.log(j + 1);
            }
        }

        this.cmpNormalizationCache.set(key, Z);
        return Z;
    }

    /**
     * Conway-Maxwell-Poisson Probability Mass Function
     * P(X = k) = (lambda^k / (k!)^nu) / Z(lambda, nu)
     *
     * @param {number} k - Number of goals
     * @param {number} lambda - Rate parameter (xG)
     * @param {number} nu - Dispersion parameter (nu > 1 = under-dispersion)
     */
    cmpPMF(k, lambda, nu) {
        if (lambda <= 0) return k === 0 ? 1 : 0;
        if (k < 0) return 0;

        // Compute log-factorial for k
        let logFactorial = 0;
        for (let i = 2; i <= k; i++) {
            logFactorial += Math.log(i);
        }

        // Compute numerator: (lambda^k) / (k!)^nu
        const logNumerator = k * Math.log(lambda) - nu * logFactorial;
        const numerator = Math.exp(logNumerator);

        // Get normalization constant
        const Z = this.cmpNormalization(lambda, nu);

        return numerator / Z;
    }

    /**
     * Calculate expected value (mean) from CMP distribution
     * E[X] = sum(k * P(X=k)) for k=0 to maxGoals
     *
     * For CMP with nu > 1: E[X] < lambda
     * For CMP with nu < 1: E[X] > lambda
     * For nu = 1 (Poisson): E[X] = lambda
     *
     * @param {number} lambda - CMP rate parameter
     * @param {number} nu - CMP dispersion parameter
     * @param {number} maxGoals - Maximum goals to consider
     * @returns {number} Expected value (mean)
     */
    cmpExpectedValue(lambda, nu, maxGoals = this.MAX_GOALS) {
        let expectedValue = 0;
        for (let k = 0; k <= maxGoals; k++) {
            expectedValue += k * this.cmpPMF(k, lambda, nu);
        }
        return expectedValue;
    }

    /**
     * Modified Bessel function of the first kind I_k(x)
     * Used in the Skellam distribution for handicap pricing
     * Computed via series expansion for numerical stability
     */
    besselI(k, x) {
        const absK = Math.abs(k);
        const halfX = x / 2;
        let sum = 0;

        // Series: I_k(x) = sum_{m=0}^{inf} (x/2)^{2m+k} / (m! * (m+k)!)
        for (let m = 0; m <= 80; m++) {
            let logTerm = (2 * m + absK) * Math.log(halfX);
            // log(m!) + log((m+absK)!)
            let logDenom = 0;
            for (let i = 2; i <= m; i++) logDenom += Math.log(i);
            for (let i = 2; i <= m + absK; i++) logDenom += Math.log(i);
            logTerm -= logDenom;
            const term = Math.exp(logTerm);
            sum += term;
            if (term < 1e-15 * sum && m > 5) break;
        }

        return sum;
    }

    /**
     * Skellam Distribution
     * P(X - Y = k) where X ~ Poisson(lambda_h), Y ~ Poisson(lambda_a)
     * P(k) = e^{-(lh + la)} * (lh/la)^{k/2} * I_k(2*sqrt(lh*la))
     *
     * Efficient for handicap calculations without full matrix summation
     */
    skellamPMF(k, lambdaHome, lambdaAway) {
        const sqrtProd = 2 * Math.sqrt(lambdaHome * lambdaAway);
        const logPrefix = -(lambdaHome + lambdaAway) + (k / 2) * Math.log(lambdaHome / lambdaAway);
        const bessel = this.besselI(k, sqrtProd);

        return Math.exp(logPrefix) * bessel;
    }

    /**
     * Generate probability matrix for all score combinations using CMP
     * Uses independent Conway-Maxwell-Poisson distributions for each team
     *
     * @param {number} lambdaHome - CMP lambda parameter for home team (not equal to xG when nu≠1)
     * @param {number} lambdaAway - CMP lambda parameter for away team (not equal to xG when nu≠1)
     * @param {number} nuHome - Home team dispersion parameter
     * @param {number} nuAway - Away team dispersion parameter
     * @param {number} maxGoals - Maximum goals per team in matrix
     */
    generateMatrix(lambdaHome, lambdaAway, nuHome = this.nuHome, nuAway = this.nuAway, maxGoals = this.MAX_GOALS) {
        const matrix = [];
        let totalProb = 0;

        // Independent CMP distribution
        for (let h = 0; h <= maxGoals; h++) {
            matrix[h] = [];
            for (let a = 0; a <= maxGoals; a++) {
                matrix[h][a] = this.cmpPMF(h, lambdaHome, nuHome) * this.cmpPMF(a, lambdaAway, nuAway);
                totalProb += matrix[h][a];
            }
        }

        // Normalize (should be close to 1.0 already)
        if (totalProb > 0 && Math.abs(totalProb - 1.0) > 0.001) {
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

    /**
     * Efficient handicap calculation using Skellam distribution
     * Avoids full matrix summation for alternative handicap lines
     *
     * WARNING: This assumes standard Poisson (nu=1.0) and will give
     * inconsistent results with CMP models (nu≠1.0). Use calcHandicap()
     * with the CMP matrix instead for accurate probabilities.
     */
    calcHandicapSkellam(lambdaHome, lambdaAway, line) {
        // P(home covers) = P(X - Y > -line) = P(X - Y >= ceil(-line))
        // For half-integer lines: P(home covers) = sum_{k=ceil(-line)}^{inf} Skellam(k)
        const threshold = Math.ceil(-line);
        let homeCovers = 0;

        // Sum from threshold to a reasonable max (margin difference rarely exceeds 30)
        for (let k = threshold; k <= 40; k++) {
            homeCovers += this.skellamPMF(k, lambdaHome, lambdaAway);
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
    // XG SOLVER
    // ==========================================

    /**
     * Solve for CMP lambda parameters using handicap and total goals inputs
     *
     * Note: Lambda parameters are NOT equal to expected goals when nu≠1.
     * Use cmpExpectedValue() to calculate actual xG from lambda.
     *
     * Inputs:
     * - handicapLine: e.g., -2.5 (home favored by 2.5)
     * - targetHomeCovers: fair probability home covers handicap
     * - totalLine: e.g., 55.5
     * - targetOver: fair probability of over totalLine
     *
     * Outputs:
     * - lambdaHome: CMP lambda parameter for home team
     * - lambdaAway: CMP lambda parameter for away team
     *
     * Solving system:
     * 1. Total goals probability matches targetOver
     * 2. Handicap probability matches targetHomeCovers
     */
    solveLambdas(handicapLine, targetHomeCovers, totalLine, targetOver) {
        // Initial estimates
        // From total line: expectedTotal ~ totalLine + small adjustment from over probability
        let expectedTotal = totalLine + (targetOver - 0.5) * 4;
        // From handicap: difference ~ -handicapLine adjusted by probability
        let diff = -handicapLine + (targetHomeCovers - 0.5) * 6;

        let lambdaHome = (expectedTotal + diff) / 2;
        let lambdaAway = (expectedTotal - diff) / 2;

        // Dynamic lambda limits based on total line
        // For high-scoring matches (>60), increase upper limit
        // CMP with nu>1 requires higher lambdas than Poisson for same total
        const minLambda = 10;
        const maxLambda = Math.max(50, totalLine * 0.9);

        // Clamp initial values
        lambdaHome = Math.max(minLambda, Math.min(maxLambda, lambdaHome));
        lambdaAway = Math.max(minLambda, Math.min(maxLambda, lambdaAway));

        let learningRate = 0.08;
        let bestError = Infinity;
        let bestLambdaHome = lambdaHome;
        let bestLambdaAway = lambdaAway;

        for (let iter = 0; iter < this.SOLVER_MAX_ITERATIONS; iter++) {
            // Generate matrix using CMP distribution
            const matrix = this.generateMatrix(lambdaHome, lambdaAway, this.nuHome, this.nuAway, this.MAX_GOALS);

            // Calculate current model predictions
            const modelHandicap = this.calcHandicap(matrix, handicapLine);
            const modelTotal = this.calcTotalFromMatrix(matrix, totalLine);

            // Calculate errors
            const errorHandicap = targetHomeCovers - modelHandicap.homeCovers;
            const errorTotal = targetOver - modelTotal.over;

            const totalError = Math.abs(errorHandicap) + Math.abs(errorTotal);

            // Track best solution
            if (totalError < bestError) {
                bestError = totalError;
                bestLambdaHome = lambdaHome;
                bestLambdaAway = lambdaAway;
            }

            if (totalError < this.SOLVER_THRESHOLD) break;

            // Handicap error adjusts difference (lambdaHome up, lambdaAway down or vice versa)
            // Total error adjusts both in same direction
            const handicapAdj = errorHandicap * learningRate * 3;
            const totalAdj = errorTotal * learningRate * 3;

            lambdaHome += handicapAdj + totalAdj;
            lambdaAway += -handicapAdj + totalAdj;

            // Constrain to reasonable handball xG ranges
            lambdaHome = Math.max(minLambda, Math.min(maxLambda, lambdaHome));
            lambdaAway = Math.max(minLambda, Math.min(maxLambda, lambdaAway));

            // Decay learning rate
            learningRate *= 0.997;
        }

        // Log warning if convergence failed
        if (bestError > 0.01) {
            console.warn(`Solver convergence warning: Total error ${(bestError * 100).toFixed(2)}%`);
            console.warn(`This may indicate incompatible constraints for the CMP model`);
        }

        return {
            lambdaHome: bestLambdaHome,
            lambdaAway: bestLambdaAway,
            converged: bestError < this.SOLVER_THRESHOLD,
            convergenceError: bestError
        };
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

        // Solve for xG (lambdas)
        const lambdas = this.solveLambdas(handicapLine, targetHomeCovers, totalLine, targetOver);

        // Generate full-time matrix using CMP distribution
        const matrixFT = this.generateMatrix(
            lambdas.lambdaHome,
            lambdas.lambdaAway,
            this.nuHome,
            this.nuAway,
            this.MAX_GOALS
        );

        // Half-time matrix (50% of full-time xG)
        const matrixHT = this.generateMatrix(
            lambdas.lambdaHome * 0.5,
            lambdas.lambdaAway * 0.5,
            this.nuHome,
            this.nuAway,
            30
        );

        // Calculate actual expected values from CMP distribution
        const expectedHome = this.cmpExpectedValue(lambdas.lambdaHome, this.nuHome);
        const expectedAway = this.cmpExpectedValue(lambdas.lambdaAway, this.nuAway);

        // Calculate all markets
        const markets = {
            lambdas,
            nuHome: this.nuHome,
            nuAway: this.nuAway,
            expectedGoals: {
                home: expectedHome,
                away: expectedAway,
                total: expectedHome + expectedAway
            },
            expectedTotal: expectedHome + expectedAway,

            // 1X2 Markets (derived from matrix)
            matchWinner: this.calc1X2FromMatrix(matrixFT),

            // Handicap Markets
            handicaps: this.generateHandicapMarkets(matrixFT, lambdas, handicapLine),

            // Total Goals Markets
            totals: this.generateTotalGoalsMarkets(matrixFT, totalLine),

            // First Half Markets
            firstHalf: this.generateHalfMarkets(
                lambdas.lambdaHome * 0.5,
                lambdas.lambdaAway * 0.5,
                this.nuHome,
                this.nuAway,
                'First Half',
                totalLine
            ),

            // HT/FT Market
            htft: this.generateHTFT(matrixHT, matrixFT),

            // Special Markets
            doubleChance: this.generateDoubleChance(matrixFT),
            drawNoBet: this.generateDrawNoBet(matrixFT),

            // Team Totals
            teamTotals: this.generateTeamTotals(matrixFT, expectedHome, expectedAway),

            // Exact Goals
            exactGoals: this.generateExactGoals(matrixFT),

            // Combo Bets
            comboBets: this.generateComboBets(matrixFT, totalLine),

            // Goal Ranges
            goalRanges: this.generateGoalRanges(matrixFT)
        };

        return markets;
    }

    generateHandicapMarkets(matrix, lambdas, centralLine) {
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
            // Use matrix-based calculation for consistency with solver and match winner
            const result = this.calcHandicap(matrix, line);
            markets.push({
                line,
                homeCovers: result.homeCovers,
                awayCovers: result.awayCovers
            });
        }

        return markets;
    }

    generateTotalGoalsMarkets(matrix, centralLine) {
        const lines = [];
        for (let offset = -5; offset <= 5; offset++) {
            const line = centralLine + offset;
            if (line >= 30.5) {
                lines.push(line);
            }
        }

        const markets = [];
        for (const line of lines) {
            const result = this.calcTotalFromMatrix(matrix, line);
            markets.push({ line, over: result.over, under: result.under });
        }

        return markets;
    }

    generateHalfMarkets(lambdaHome, lambdaAway, nuHome, nuAway, name, totalLine) {
        const matrix = this.generateMatrix(lambdaHome, lambdaAway, nuHome, nuAway, 30);

        // Calculate expected values from lambdas for finding balanced lines
        const expectedHome = this.cmpExpectedValue(lambdaHome, nuHome, 30);
        const expectedAway = this.cmpExpectedValue(lambdaAway, nuAway, 30);

        const result1X2 = this.calc1X2FromMatrix(matrix);

        // Half totals
        const halfCentral = Math.floor(totalLine / 2) + 0.5;
        const totals = [];
        const totalLines = [halfCentral - 2, halfCentral - 1, halfCentral, halfCentral + 1, halfCentral + 2].filter(l => l >= 10.5);
        for (const line of totalLines) {
            const result = this.calcTotalFromMatrix(matrix, line);
            totals.push({ line, over: result.over, under: result.under });
        }

        // Half team totals - find most balanced lines (closest to 50/50)
        let bestHomeLine = null;
        let bestHomeDiff = Infinity;
        // Round to nearest 0.5 to ensure clean betting lines
        const homeMin = Math.max(5.5, Math.floor((expectedHome - 4) * 2) / 2 + 0.5);
        const homeMax = Math.ceil((expectedHome + 4) * 2) / 2 - 0.5;

        for (let testLine = homeMin; testLine <= homeMax; testLine += 0.5) {
            const result = this.calcTeamTotal(matrix, testLine, true);
            const diff = Math.abs(result.over - 0.5);
            if (diff < bestHomeDiff) {
                bestHomeDiff = diff;
                bestHomeLine = testLine;
            }
        }

        let bestAwayLine = null;
        let bestAwayDiff = Infinity;
        // Round to nearest 0.5 to ensure clean betting lines
        const awayMin = Math.max(5.5, Math.floor((expectedAway - 4) * 2) / 2 + 0.5);
        const awayMax = Math.ceil((expectedAway + 4) * 2) / 2 - 0.5;

        for (let testLine = awayMin; testLine <= awayMax; testLine += 0.5) {
            const result = this.calcTeamTotal(matrix, testLine, false);
            const diff = Math.abs(result.over - 0.5);
            if (diff < bestAwayDiff) {
                bestAwayDiff = diff;
                bestAwayLine = testLine;
            }
        }

        // Use fallback if no balanced line found
        if (bestHomeLine === null) bestHomeLine = Math.max(5.5, Math.round(expectedHome - 0.5) + 0.5);
        if (bestAwayLine === null) bestAwayLine = Math.max(5.5, Math.round(expectedAway - 0.5) + 0.5);

        const teamTotals = { home: [], away: [] };

        const homeLines = [bestHomeLine - 1, bestHomeLine, bestHomeLine + 1].filter(l => l >= 5.5);
        for (const line of homeLines) {
            const result = this.calcTeamTotal(matrix, line, true);
            teamTotals.home.push({ line, over: result.over, under: result.under });
        }

        const awayLines = [bestAwayLine - 1, bestAwayLine, bestAwayLine + 1].filter(l => l >= 5.5);
        for (const line of awayLines) {
            const result = this.calcTeamTotal(matrix, line, false);
            teamTotals.away.push({ line, over: result.over, under: result.under });
        }

        // Asian Handicap - find most balanced line
        let bestLine = 0;
        let bestDiff = 1.0;
        for (let testLine = -6; testLine <= 6; testLine += 0.5) {
            const result = this.calcHandicap(matrix, testLine);
            const diff = Math.abs(result.homeCovers - 0.5);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestLine = testLine;
            }
        }

        const handicap = this.calcHandicap(matrix, bestLine);

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

    generateTeamTotals(matrix, expectedHome, expectedAway) {
        // Find most balanced line for home team (closest to 50/50)
        let bestHomeLine = null;
        let bestHomeDiff = Infinity;
        // Round to nearest 0.5 to ensure clean betting lines
        const homeMin = Math.max(15.5, Math.floor((expectedHome - 6) * 2) / 2 + 0.5);
        const homeMax = Math.ceil((expectedHome + 6) * 2) / 2 - 0.5;

        for (let testLine = homeMin; testLine <= homeMax; testLine += 0.5) {
            const result = this.calcTeamTotal(matrix, testLine, true);
            const diff = Math.abs(result.over - 0.5);
            if (diff < bestHomeDiff) {
                bestHomeDiff = diff;
                bestHomeLine = testLine;
            }
        }

        // Find most balanced line for away team (closest to 50/50)
        let bestAwayLine = null;
        let bestAwayDiff = Infinity;
        // Round to nearest 0.5 to ensure clean betting lines
        const awayMin = Math.max(15.5, Math.floor((expectedAway - 6) * 2) / 2 + 0.5);
        const awayMax = Math.ceil((expectedAway + 6) * 2) / 2 - 0.5;

        for (let testLine = awayMin; testLine <= awayMax; testLine += 0.5) {
            const result = this.calcTeamTotal(matrix, testLine, false);
            const diff = Math.abs(result.over - 0.5);
            if (diff < bestAwayDiff) {
                bestAwayDiff = diff;
                bestAwayLine = testLine;
            }
        }

        // Use fallback if no balanced line found
        if (bestHomeLine === null) bestHomeLine = Math.max(20.5, Math.round(expectedHome - 0.5) + 0.5);
        if (bestAwayLine === null) bestAwayLine = Math.max(20.5, Math.round(expectedAway - 0.5) + 0.5);

        const homeLines = [bestHomeLine - 2, bestHomeLine - 1, bestHomeLine, bestHomeLine + 1, bestHomeLine + 2].filter(l => l >= 15.5);
        const awayLines = [bestAwayLine - 2, bestAwayLine - 1, bestAwayLine, bestAwayLine + 1, bestAwayLine + 2].filter(l => l >= 15.5);

        const home = [];
        const away = [];

        for (const line of homeLines) {
            const result = this.calcTeamTotal(matrix, line, true);
            home.push({ line, over: result.over, under: result.under });
        }

        for (const line of awayLines) {
            const result = this.calcTeamTotal(matrix, line, false);
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
