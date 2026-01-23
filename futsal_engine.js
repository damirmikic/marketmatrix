/**
 * Futsal Pricing Engine
 *
 * Sport Characteristics:
 * - Played indoors on hard court (38-42m x 18-25m)
 * - 5 players per team (including goalkeeper)
 * - Two 20-minute halves
 * - Fast-paced, high-action game
 * - Moderate scoring (typical: 4-6 goals/match)
 * - No offside rule
 * - Smaller, heavier ball with less bounce
 * - Unlimited substitutions
 *
 * Model Approach:
 * - Poisson distribution for goal probabilities
 * - Lambda values typically in 2.0-3.5 range
 * - Two halves (50/50 split)
 * - Handicaps: ±0.5, ±1.5, ±2.5, ±3.5
 * - Total lines: 3.5, 4.5, 5.5, 6.5, 7.5
 */

import { factorial, probToOdds } from './js/core/math_utils.js';

export class FutsalEngine {
    constructor() {
        this.MAX_GOALS = 12;
        this.SOLVER_MAX_ITERATIONS = 1000;
        this.SOLVER_THRESHOLD = 0.0001;
    }

    // ==========================================
    // STATISTICAL FUNCTIONS
    // ==========================================

    /**
     * Poisson Probability Mass Function
     * P(X = k) = (λ^k * e^-λ) / k!
     */
    poissonPMF(k, lambda) {
        if (lambda <= 0) return k === 0 ? 1 : 0;
        if (k < 0) return 0;

        // Using log-space for numerical stability
        const logProb = k * Math.log(lambda) - lambda - Math.log(factorial(k));
        return Math.exp(logProb);
    }

    /**
     * Generate probability matrix for all score combinations
     * Returns matrix[home][away] = probability of that score
     */
    generateMatrix(lambdaHome, lambdaAway, maxGoals = this.MAX_GOALS) {
        const matrix = [];
        let totalProb = 0;

        // Generate initial matrix
        for (let h = 0; h <= maxGoals; h++) {
            matrix[h] = [];
            for (let a = 0; a <= maxGoals; a++) {
                matrix[h][a] = this.poissonPMF(h, lambdaHome) * this.poissonPMF(a, lambdaAway);
                totalProb += matrix[h][a];
            }
        }

        // Normalize to ensure sum = 1.0
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

    /**
     * Remove bookmaker margin - proportional method
     * Simple and effective for 2-way markets
     */
    removeVig2Way(odds1, odds2) {
        const impliedProbs = [1 / odds1, 1 / odds2];
        const total = impliedProbs.reduce((a, b) => a + b, 0);
        return impliedProbs.map(p => p / total);
    }

    /**
     * Remove bookmaker margin - proportional method for 3-way markets
     */
    removeVig3Way(odds1, oddsX, odds2) {
        const impliedProbs = [1 / odds1, 1 / oddsX, 1 / odds2];
        const total = impliedProbs.reduce((a, b) => a + b, 0);
        return impliedProbs.map(p => p / total);
    }

    // ==========================================
    // MARKET CALCULATIONS FROM MATRIX
    // ==========================================

    /**
     * Calculate 1X2 (Match Winner) from matrix
     */
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
     * Calculate Total Goals Over/Under from matrix
     */
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
     * Calculate Asian Handicap from matrix
     * @param {Array} matrix - Probability matrix
     * @param {number} line - Handicap line (from home team perspective)
     */
    calcHandicap(matrix, line) {
        let homeCovers = 0;
        const maxGoals = matrix.length - 1;

        for (let h = 0; h <= maxGoals; h++) {
            for (let a = 0; a <= maxGoals; a++) {
                // Home covers if: homeScore + line > awayScore
                if (h + line > a) {
                    homeCovers += matrix[h][a];
                }
            }
        }

        return { homeCovers, awayCovers: 1 - homeCovers };
    }

    /**
     * Calculate Both Teams To Score
     */
    calcBTTS(matrix) {
        let bttsYes = 0;
        const maxGoals = matrix.length - 1;

        for (let h = 1; h <= maxGoals; h++) {
            for (let a = 1; a <= maxGoals; a++) {
                bttsYes += matrix[h][a];
            }
        }

        return { yes: bttsYes, no: 1 - bttsYes };
    }

    /**
     * Calculate Team Total Goals
     */
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
     * Calculate Exact Goals probability
     */
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
    // LAMBDA SOLVER (Gradient Descent)
    // ==========================================

    /**
     * Solve for optimal lambdas using gradient descent
     * Fits lambdas to match target probabilities from market odds
     * @param {number} targetHomeWin - Target probability for home win
     * @param {number} targetDraw - Target probability for draw
     * @param {number} targetOver - Target probability for over (optional)
     * @param {number} totalLine - Total goals line (optional, defaults to 5.5)
     */
    solveLambdas(targetHomeWin, targetDraw, targetOver = null, totalLine = 5.5) {
        // Initialize lambdas - futsal typically has moderate scoring
        let lambdaHome = totalLine / 2;
        let lambdaAway = totalLine / 2;

        let learningRate = 0.05;
        const hasTotal = targetOver !== null;

        for (let iter = 0; iter < this.SOLVER_MAX_ITERATIONS; iter++) {
            // Generate matrix with current lambdas
            const matrix = this.generateMatrix(lambdaHome, lambdaAway);

            // Calculate model predictions
            const model1X2 = this.calc1X2FromMatrix(matrix);

            // Calculate errors
            const errorHomeWin = targetHomeWin - model1X2.homeWin;
            const errorDraw = targetDraw - model1X2.draw;

            let totalError = Math.abs(errorHomeWin) + Math.abs(errorDraw);
            let totalAdjustment = 0;

            // Only use total goals error if available
            if (hasTotal) {
                const modelTotal = this.calcTotalFromMatrix(matrix, totalLine);
                const errorOver = targetOver - modelTotal.over;
                totalError += Math.abs(errorOver);
                totalAdjustment = errorOver * learningRate;
            }

            // Check convergence
            if (totalError < this.SOLVER_THRESHOLD) {
                break;
            }

            // Adjust lambdas based on errors
            const homeAdjustment = errorHomeWin * learningRate * 2;

            lambdaHome += homeAdjustment + totalAdjustment;
            lambdaAway -= homeAdjustment * 0.5;
            lambdaAway += totalAdjustment;

            // Constrain lambdas to reasonable bounds for futsal
            lambdaHome = Math.max(0.5, Math.min(8.0, lambdaHome));
            lambdaAway = Math.max(0.5, Math.min(8.0, lambdaAway));

            // Decay learning rate
            learningRate *= 0.995;
        }

        return { lambdaHome, lambdaAway };
    }

    // ==========================================
    // MARKET GENERATION
    // ==========================================

    /**
     * Generate all markets from input odds
     * totalLine, overOdds, and underOdds are optional
     */
    generateAllMarkets(inputs) {
        const {
            homeOdds,
            drawOdds,
            awayOdds,
            totalLine = 5.5,
            overOdds,
            underOdds
        } = inputs;

        // Remove vig to get fair probabilities
        const fair1X2 = this.removeVig3Way(homeOdds, drawOdds, awayOdds);

        const targetHomeWin = fair1X2[0];
        const targetDraw = fair1X2[1];
        const targetAwayWin = fair1X2[2];

        // Check if total goals odds are available
        const hasTotalGoals = overOdds && underOdds;
        let targetOver = null;

        if (hasTotalGoals) {
            const fairOU = this.removeVig2Way(overOdds, underOdds);
            targetOver = fairOU[0];
        }

        // Solve for lambdas
        const lambdas = this.solveLambdas(targetHomeWin, targetDraw, targetOver, totalLine);

        // Generate full-time matrix
        const matrixFT = this.generateMatrix(lambdas.lambdaHome, lambdas.lambdaAway);

        // Generate half-time matrix for HT/FT
        const matrixHT = this.generateMatrix(lambdas.lambdaHome * 0.5, lambdas.lambdaAway * 0.5, 8);

        // Calculate all markets
        const markets = {
            lambdas: lambdas,
            expectedTotal: lambdas.lambdaHome + lambdas.lambdaAway,

            // 1X2 Markets
            matchWinner: this.calc1X2FromMatrix(matrixFT),

            // Handicap Markets
            handicaps: this.generateHandicapMarkets(matrixFT),

            // Total Goals Markets
            totals: this.generateTotalGoalsMarkets(matrixFT, totalLine),

            // Half-Time Markets (50% of full-time lambdas)
            firstHalf: this.generateHalfMarkets(lambdas.lambdaHome * 0.5, lambdas.lambdaAway * 0.5, 'First Half', totalLine),

            // HT/FT Market
            htft: this.generateHTFT(matrixHT, matrixFT),

            // Special Markets
            btts: this.calcBTTS(matrixFT),
            doubleChance: this.generateDoubleChance(matrixFT),
            drawNoBet: this.generateDrawNoBet(matrixFT),

            // Team Totals
            teamTotals: this.generateTeamTotals(matrixFT, lambdas.lambdaHome, lambdas.lambdaAway),

            // Exact Goals
            exactGoals: this.generateExactGoals(matrixFT),

            // Combo Bets
            comboBets: this.generateComboBets(matrixFT, totalLine),

            // Goal Ranges
            goalRanges: this.generateGoalRanges(matrixFT)
        };

        return markets;
    }

    generateHandicapMarkets(matrix) {
        const lines = [-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5];
        const markets = [];

        for (const line of lines) {
            const result = this.calcHandicap(matrix, line);
            markets.push({
                line: line,
                homeCovers: result.homeCovers,
                awayCovers: result.awayCovers
            });
        }

        return markets;
    }

    generateTotalGoalsMarkets(matrix, centralLine) {
        // Generate lines: central -2, -1, 0, +1, +2
        const lines = [
            centralLine - 2,
            centralLine - 1,
            centralLine,
            centralLine + 1,
            centralLine + 2
        ];
        const markets = [];

        for (const line of lines) {
            const result = this.calcTotalFromMatrix(matrix, line);
            markets.push({
                line: line,
                over: result.over,
                under: result.under
            });
        }

        return markets;
    }

    generateHalfMarkets(lambdaHome, lambdaAway, name, totalLine) {
        const matrix = this.generateMatrix(lambdaHome, lambdaAway, 8);

        const result1X2 = this.calc1X2FromMatrix(matrix);
        const btts = this.calcBTTS(matrix);

        // Half totals - central line is half of full-time total, always use .5 values
        const halfCentral = Math.floor(totalLine / 2) + 0.5;
        const totals = [];

        // Generate lines ensuring they're all .5 values and non-negative
        const totalLines = [halfCentral - 1, halfCentral, halfCentral + 1].filter(line => line >= 0.5);
        for (const line of totalLines) {
            const result = this.calcTotalFromMatrix(matrix, line);
            totals.push({ line, over: result.over, under: result.under });
        }

        // Half team totals - show only the most balanced line
        // Always round to X.5 value (never whole numbers) and ensure non-negative
        const homeCentral = Math.max(0.5, Math.round(lambdaHome - 0.5) + 0.5);
        const awayCentral = Math.max(0.5, Math.round(lambdaAway - 0.5) + 0.5);

        const teamTotals = {
            home: [],
            away: []
        };

        // For first half, show only one most balanced line
        const homeResult = this.calcTeamTotal(matrix, homeCentral, true);
        teamTotals.home.push({ line: homeCentral, over: homeResult.over, under: homeResult.under });

        const awayResult = this.calcTeamTotal(matrix, awayCentral, false);
        teamTotals.away.push({ line: awayCentral, over: awayResult.over, under: awayResult.under });

        // Asian Handicap - find the most balanced line (closest to 50/50 odds)
        let bestHandicapLine = 0;
        let bestDiff = 1.0; // Start with max possible difference from 0.5

        // Test lines from -2.5 to +2.5 in 0.5 increments (smaller range for half)
        for (let testLine = -2.5; testLine <= 2.5; testLine += 0.5) {
            const testResult = this.calcHandicap(matrix, testLine);
            const diff = Math.abs(testResult.homeCovers - 0.5);

            if (diff < bestDiff) {
                bestDiff = diff;
                bestHandicapLine = testLine;
            }
        }

        const handicap = this.calcHandicap(matrix, bestHandicapLine);

        // Draw No Bet
        const dnb = {
            home: result1X2.homeWin / (1 - result1X2.draw),
            away: result1X2.awayWin / (1 - result1X2.draw)
        };

        return {
            name,
            winner: result1X2,
            totals,
            btts,
            dnb,
            teamTotals,
            handicap: {
                line: bestHandicapLine,
                homeCovers: handicap.homeCovers,
                awayCovers: handicap.awayCovers
            }
        };
    }

    /**
     * Generate Half-Time/Full-Time market
     * Calculates probabilities for all 9 combinations of HT and FT results
     * Uses correlation assumption: results are independent for simplicity
     */
    generateHTFT(halfMatrix, fullMatrix) {
        const ht = this.calc1X2FromMatrix(halfMatrix);
        const ft = this.calc1X2FromMatrix(fullMatrix);

        // Calculate all 9 combinations
        // Assuming independence (simplified model)
        const combinations = [
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

        return combinations;
    }

    generateDoubleChance(matrix) {
        const result1X2 = this.calc1X2FromMatrix(matrix);

        return {
            homeOrDraw: result1X2.homeWin + result1X2.draw,
            homeOrAway: result1X2.homeWin + result1X2.awayWin,
            drawOrAway: result1X2.draw + result1X2.awayWin
        };
    }

    generateDrawNoBet(matrix) {
        const result1X2 = this.calc1X2FromMatrix(matrix);

        return {
            home: result1X2.homeWin / (1 - result1X2.draw),
            away: result1X2.awayWin / (1 - result1X2.draw)
        };
    }

    generateTeamTotals(matrix, lambdaHome, lambdaAway) {
        // Central line is based on lambda (always round to X.5 value) and ensure non-negative
        const homeCentral = Math.max(0.5, Math.round(lambdaHome - 0.5) + 0.5);
        const awayCentral = Math.max(0.5, Math.round(lambdaAway - 0.5) + 0.5);

        // Generate lines: central -1, 0, +1 (filter out negative values)
        const homeLines = [homeCentral - 1, homeCentral, homeCentral + 1].filter(line => line >= 0.5);
        const awayLines = [awayCentral - 1, awayCentral, awayCentral + 1].filter(line => line >= 0.5);

        const home = [];
        const away = [];

        for (const line of homeLines) {
            const homeResult = this.calcTeamTotal(matrix, line, true);
            home.push({ line, over: homeResult.over, under: homeResult.under });
        }

        for (const line of awayLines) {
            const awayResult = this.calcTeamTotal(matrix, line, false);
            away.push({ line, over: awayResult.over, under: awayResult.under });
        }

        return { home, away };
    }

    generateExactGoals(matrix) {
        const goals = [];

        // 0-8 goals
        for (let g = 0; g <= 8; g++) {
            const prob = this.calcExactGoals(matrix, g);
            goals.push({ goals: g, probability: prob });
        }

        // 9+ goals
        let prob9Plus = 0;
        const maxGoals = matrix.length - 1;
        for (let h = 0; h <= maxGoals; h++) {
            for (let a = 0; a <= maxGoals; a++) {
                if (h + a >= 9) {
                    prob9Plus += matrix[h][a];
                }
            }
        }
        goals.push({ goals: '9+', probability: prob9Plus });

        return goals;
    }

    generateComboBets(matrix, totalLine) {
        const combos = [];
        const maxGoals = matrix.length - 1;

        // Initialize combo objects
        const comboMap = {
            'Home & Over': 0,
            'Home & Under': 0,
            'Draw & Over': 0,
            'Draw & Under': 0,
            'Away & Over': 0,
            'Away & Under': 0
        };

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

        // Convert to array
        for (const [outcome, probability] of Object.entries(comboMap)) {
            combos.push({ outcome, probability });
        }

        return combos;
    }

    generateGoalRanges(matrix) {
        const ranges = [
            { label: '0-2', min: 0, max: 2 },
            { label: '0-3', min: 0, max: 3 },
            { label: '0-4', min: 0, max: 4 },
            { label: '2-3', min: 2, max: 3 },
            { label: '2-4', min: 2, max: 4 },
            { label: '2-5', min: 2, max: 5 },
            { label: '3-4', min: 3, max: 4 },
            { label: '3-5', min: 3, max: 5 },
            { label: '3-6', min: 3, max: 6 },
            { label: '4-5', min: 4, max: 5 },
            { label: '4-6', min: 4, max: 6 },
            { label: '4-7', min: 4, max: 7 },
            { label: '5-6', min: 5, max: 6 },
            { label: '5-7', min: 5, max: 7 },
            { label: '5-8', min: 5, max: 8 },
            { label: '6-7', min: 6, max: 7 },
            { label: '6-8', min: 6, max: 8 },
            { label: '7-8', min: 7, max: 8 },
            { label: '7-9', min: 7, max: 9 },
            { label: '8-9', min: 8, max: 9 }
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

            results.push({
                label: range.label,
                probability: prob
            });
        }

        return results;
    }
}
