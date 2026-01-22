/**
 * Bandy Pricing Engine
 *
 * Sport Characteristics:
 * - Played on large ice surface (90-110m x 45-65m)
 * - 11 players per team (like soccer)
 * - Two 45-minute halves (not three periods like hockey)
 * - Small ball instead of puck
 * - Higher scoring than ice hockey (typical: 6-7 goals/match)
 * - No overtime/shootout (or rare)
 * - No empty net situations
 *
 * Model Approach:
 * - Poisson distribution for goal probabilities
 * - Higher lambda values than ice hockey (3-4 range vs 2.5-3.5)
 * - Two halves (50/50 split)
 * - Handicaps: ±1.5, ±2.5, ±3.5, ±4.5
 * - Total lines: 5.5, 6.5, 7.5, 8.5
 */

import { factorial, probToOdds } from './js/core/math_utils.js';

export class BandyEngine {
    constructor() {
        this.MAX_GOALS = 14;
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
     * No empty net adjustments (unlike ice hockey)
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
     */
    solveLambdas(targetHomeWin, targetDraw, targetOver, totalLine) {
        // Initialize lambdas - bandy typically has higher scoring than ice hockey
        let lambdaHome = totalLine / 2;
        let lambdaAway = totalLine / 2;

        let learningRate = 0.05;

        for (let iter = 0; iter < this.SOLVER_MAX_ITERATIONS; iter++) {
            // Generate matrix with current lambdas
            const matrix = this.generateMatrix(lambdaHome, lambdaAway);

            // Calculate model predictions
            const model1X2 = this.calc1X2FromMatrix(matrix);
            const modelTotal = this.calcTotalFromMatrix(matrix, totalLine);

            // Calculate errors
            const errorHomeWin = targetHomeWin - model1X2.homeWin;
            const errorDraw = targetDraw - model1X2.draw;
            const errorOver = targetOver - modelTotal.over;

            // Total error
            const totalError = Math.abs(errorHomeWin) + Math.abs(errorDraw) + Math.abs(errorOver);

            // Check convergence
            if (totalError < this.SOLVER_THRESHOLD) {
                break;
            }

            // Adjust lambdas based on errors
            const homeAdjustment = errorHomeWin * learningRate * 2;
            const totalAdjustment = errorOver * learningRate;

            lambdaHome += homeAdjustment + totalAdjustment;
            lambdaAway -= homeAdjustment * 0.5;
            lambdaAway += totalAdjustment;

            // Constrain lambdas to reasonable bounds for bandy
            lambdaHome = Math.max(0.5, Math.min(10.0, lambdaHome));
            lambdaAway = Math.max(0.5, Math.min(10.0, lambdaAway));

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
     */
    generateAllMarkets(inputs) {
        const {
            homeOdds,
            drawOdds,
            awayOdds,
            totalLine,
            overOdds,
            underOdds
        } = inputs;

        // Remove vig to get fair probabilities
        const fair1X2 = this.removeVig3Way(homeOdds, drawOdds, awayOdds);
        const fairOU = this.removeVig2Way(overOdds, underOdds);

        const targetHomeWin = fair1X2[0];
        const targetDraw = fair1X2[1];
        const targetAwayWin = fair1X2[2];
        const targetOver = fairOU[0];

        // Solve for lambdas
        const lambdas = this.solveLambdas(targetHomeWin, targetDraw, targetOver, totalLine);

        // Generate full-time matrix
        const matrixFT = this.generateMatrix(lambdas.lambdaHome, lambdas.lambdaAway);

        // Calculate all markets
        const markets = {
            lambdas: lambdas,
            expectedTotal: lambdas.lambdaHome + lambdas.lambdaAway,

            // 1X2 Markets
            matchWinner: this.calc1X2FromMatrix(matrixFT),

            // Handicap Markets
            handicaps: this.generateHandicapMarkets(matrixFT),

            // Total Goals Markets
            totals: this.generateTotalGoalsMarkets(matrixFT),

            // Half-Time Markets (50% of full-time lambdas)
            firstHalf: this.generateHalfMarkets(lambdas.lambdaHome * 0.5, lambdas.lambdaAway * 0.5, 'First Half'),
            secondHalf: this.generateHalfMarkets(lambdas.lambdaHome * 0.5, lambdas.lambdaAway * 0.5, 'Second Half'),

            // Special Markets
            btts: this.calcBTTS(matrixFT),
            doubleChance: this.generateDoubleChance(matrixFT),
            drawNoBet: this.generateDrawNoBet(matrixFT),

            // Team Totals
            teamTotals: this.generateTeamTotals(matrixFT),

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
        const lines = [-4.5, -3.5, -2.5, -1.5, 1.5, 2.5, 3.5, 4.5];
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

    generateTotalGoalsMarkets(matrix) {
        const lines = [4.5, 5.5, 6.5, 7.5, 8.5, 9.5];
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

    generateHalfMarkets(lambdaHome, lambdaAway, name) {
        const matrix = this.generateMatrix(lambdaHome, lambdaAway, 10);

        const result1X2 = this.calc1X2FromMatrix(matrix);
        const btts = this.calcBTTS(matrix);

        // Half totals (typical lines: 2.5, 3.5, 4.5)
        const totals = [];
        for (const line of [2.5, 3.5, 4.5]) {
            const result = this.calcTotalFromMatrix(matrix, line);
            totals.push({ line, over: result.over, under: result.under });
        }

        // Half team totals (typical lines: 1.5, 2.5, 3.5)
        const teamTotals = {
            home: [],
            away: []
        };

        for (const line of [1.5, 2.5, 3.5]) {
            const homeResult = this.calcTeamTotal(matrix, line, true);
            const awayResult = this.calcTeamTotal(matrix, line, false);

            teamTotals.home.push({ line, over: homeResult.over, under: homeResult.under });
            teamTotals.away.push({ line, over: awayResult.over, under: awayResult.under });
        }

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
            teamTotals
        };
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

    generateTeamTotals(matrix) {
        const lines = [2.5, 3.5, 4.5];
        const home = [];
        const away = [];

        for (const line of lines) {
            const homeResult = this.calcTeamTotal(matrix, line, true);
            const awayResult = this.calcTeamTotal(matrix, line, false);

            home.push({ line, over: homeResult.over, under: homeResult.under });
            away.push({ line, over: awayResult.over, under: awayResult.under });
        }

        return { home, away };
    }

    generateExactGoals(matrix) {
        const goals = [];

        // 0-10 goals
        for (let g = 0; g <= 10; g++) {
            const prob = this.calcExactGoals(matrix, g);
            goals.push({ goals: g, probability: prob });
        }

        // 11+ goals
        let prob11Plus = 0;
        const maxGoals = matrix.length - 1;
        for (let h = 0; h <= maxGoals; h++) {
            for (let a = 0; a <= maxGoals; a++) {
                if (h + a >= 11) {
                    prob11Plus += matrix[h][a];
                }
            }
        }
        goals.push({ goals: '11+', probability: prob11Plus });

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
            { label: '0-3', min: 0, max: 3 },
            { label: '0-4', min: 0, max: 4 },
            { label: '0-5', min: 0, max: 5 },
            { label: '2-4', min: 2, max: 4 },
            { label: '2-5', min: 2, max: 5 },
            { label: '2-6', min: 2, max: 6 },
            { label: '3-5', min: 3, max: 5 },
            { label: '3-6', min: 3, max: 6 },
            { label: '3-7', min: 3, max: 7 },
            { label: '4-6', min: 4, max: 6 },
            { label: '4-7', min: 4, max: 7 },
            { label: '4-8', min: 4, max: 8 },
            { label: '5-7', min: 5, max: 7 },
            { label: '5-8', min: 5, max: 8 },
            { label: '5-9', min: 5, max: 9 },
            { label: '6-8', min: 6, max: 8 },
            { label: '6-9', min: 6, max: 9 },
            { label: '7-9', min: 7, max: 9 },
            { label: '7-10', min: 7, max: 10 },
            { label: '8-10', min: 8, max: 10 }
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
