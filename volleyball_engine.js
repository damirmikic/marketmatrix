/**
 * Volleyball Pricing Engine
 * Core Logic: Shin's Vigorish Removal + Parameter Solver + Derivatives
 *
 * Volleyball Specifics:
 * - Best of 5 sets (first to 3 wins)
 * - Sets 1-4: Rally scoring to 25 points (must win by 2)
 * - Set 5: Rally scoring to 15 points (must win by 2)
 * - No draws possible
 */

export class VolleyballEngine {
    constructor() {
        this.MAX_ITERATIONS = 100;
        this.TOLERANCE = 0.005; // 0.5%
        this.SHIN_ITERATIONS = 20;
    }

    // ==========================================
    // PHASE 1: VIGORISH REMOVAL
    // ==========================================

    /**
     * Remove bookmaker margin using Shin's method
     * @param {number} odds1 - Team 1 odds
     * @param {number} odds2 - Team 2 odds
     * @returns {object} Fair probabilities {p1, p2, gamma}
     */
    removeVigorish(odds1, odds2) {
        if (!odds1 || !odds2 || odds1 <= 1 || odds2 <= 1) {
            throw new Error("Invalid odds input");
        }

        let gamma = 1.0;
        for (let i = 0; i < this.SHIN_ITERATIONS; i++) {
            const sumP = Math.pow(1 / odds1, gamma) + Math.pow(1 / odds2, gamma);
            const diff = sumP - 1.0;
            if (Math.abs(diff) < 1e-6) break;
            gamma += diff * 0.5;
        }

        const p1Fair = Math.pow(1 / odds1, gamma);
        const p2Fair = Math.pow(1 / odds2, gamma);
        const total = p1Fair + p2Fair;

        return {
            p1: p1Fair / total,
            p2: p2Fair / total,
            gamma: gamma
        };
    }

    // ==========================================
    // PHASE 2: SET WIN PROBABILITY CALCULATION
    // ==========================================

    /**
     * Calculate probability of winning a set given point win probability
     * Uses negative binomial distribution for rally scoring with "win by 2" rule
     * @param {number} p - Point win probability
     * @param {number} target - Target score (25 for sets 1-4, 15 for set 5)
     * @returns {number} Set win probability
     */
    calculateSetWinProb(p, target = 25) {
        // Handle edge cases
        if (p <= 0) return 0;
        if (p >= 1) return 1;

        const q = 1 - p;
        let pWinSet = 0;

        // Win before deuce (score target-k where k = 0 to target-2)
        // Final score is (target, k) where k < target-1
        // This means: win target points, opponent wins k points
        // The last point must be won by team A
        // So out of the first (target + k - 1) points, team A wins (target-1) and team B wins k
        for (let k = 0; k <= target - 2; k++) {
            const prob = this.binomialCoeff(target + k - 1, k) * Math.pow(p, target) * Math.pow(q, k);
            pWinSet += prob;
        }

        // Win from deuce (both teams at target-1 or higher, must win by 2)
        // Probability of reaching (target-1, target-1)
        const pReachDeuce = this.binomialCoeff(2 * (target - 1), target - 1) * Math.pow(p, target - 1) * Math.pow(q, target - 1);

        // From deuce, probability of team A winning by 2
        // This is equivalent to winning 2 points before opponent wins 2 points
        // P(win) = p^2 / (p^2 + q^2) (geometric series)
        const pWinFromDeuce = Math.pow(p, 2) / (Math.pow(p, 2) + Math.pow(q, 2));

        pWinSet += pReachDeuce * pWinFromDeuce;

        return pWinSet;
    }

    /**
     * Binomial probability calculation
     * P(X = k) where X ~ Binomial(n, p)
     * @param {number} n - Number of trials
     * @param {number} k - Number of successes
     * @param {number} p - Success probability
     * @returns {number} Probability
     */
    binomialProb(n, k, p) {
        if (k > n || k < 0) return 0;
        if (p === 0) return k === 0 ? 1 : 0;
        if (p === 1) return k === n ? 1 : 0;

        const coeff = this.binomialCoeff(n, k);
        return coeff * Math.pow(p, k) * Math.pow(1 - p, n - k);
    }

    /**
     * Binomial coefficient C(n, k) = n! / (k! * (n-k)!)
     */
    binomialCoeff(n, k) {
        if (k > n) return 0;
        if (k === 0 || k === n) return 1;

        // Use the more efficient calculation
        k = Math.min(k, n - k);
        let result = 1;
        for (let i = 0; i < k; i++) {
            result *= (n - i);
            result /= (i + 1);
        }
        return result;
    }

    // ==========================================
    // PHASE 3: MATCH WIN PROBABILITY CALCULATION
    // ==========================================

    /**
     * Calculate match win probability in best-of-5 sets
     * @param {number} pSet1 - Team 1 probability of winning a regular set (25 points)
     * @param {number} pSet5 - Team 1 probability of winning set 5 (15 points)
     * @returns {number} Match win probability for Team 1
     */
    calculateMatchWinProb(pSet1, pSet5) {
        // Team 1 can win 3-0, 3-1, or 3-2
        const p = pSet1;  // Prob of winning sets 1-4
        const q = 1 - p;   // Prob of losing sets 1-4
        const p5 = pSet5;  // Prob of winning set 5

        // Win 3-0: Win first 3 sets
        const p30 = Math.pow(p, 3);

        // Win 3-1: Win 3 out of first 4 sets, lose 1
        // Can lose any of the first 4 sets
        const p31 = this.binomialCoeff(4, 3) * Math.pow(p, 3) * q;

        // Win 3-2: Win 2 out of first 4 sets, then win set 5
        // Must reach 2-2, then win set 5
        const p32 = this.binomialCoeff(4, 2) * Math.pow(p, 2) * Math.pow(q, 2) * p5;

        return p30 + p31 + p32;
    }

    /**
     * Calculate expected number of sets
     * @param {number} pSet - Probability of Team 1 winning a set
     * @returns {number} Expected total sets
     */
    calculateExpectedSets(pSet) {
        const p = pSet;
        const q = 1 - p;

        // 3 sets: 3-0 or 0-3
        const p3 = Math.pow(p, 3) + Math.pow(q, 3);

        // 4 sets: 3-1 or 1-3
        const p4 = this.binomialCoeff(4, 3) * Math.pow(p, 3) * q +
                   this.binomialCoeff(4, 1) * p * Math.pow(q, 3);

        // 5 sets: All other outcomes
        const p5 = 1 - p3 - p4;

        return 3 * p3 + 4 * p4 + 5 * p5;
    }

    // ==========================================
    // PHASE 4: PARAMETER SOLVER
    // ==========================================

    /**
     * Solve for point win probability given match odds and set handicap
     * @param {number} targetPMatch - Target match win probability from odds
     * @param {number} setHandicapLine - Set handicap line (e.g., -1.5)
     * @param {number} setHandicapProb - Probability of covering set handicap
     * @returns {object} {pPoint1, pPoint2, metrics}
     */
    solveParameters(targetPMatch, setHandicapLine = null, setHandicapProb = null) {
        // Initial guess based on match probability
        // Convert match win prob to approximate point win prob
        let pPoint = 0.50 + (targetPMatch - 0.5) * 0.15;

        // Constrain to valid range
        pPoint = Math.max(0.35, Math.min(0.85, pPoint));

        let bestP = pPoint;
        let bestError = Infinity;

        // Iterative refinement
        for (let i = 0; i < this.MAX_ITERATIONS; i++) {
            // Calculate set win probabilities
            const pSet25 = this.calculateSetWinProb(pPoint, 25); // Regular sets
            const pSet15 = this.calculateSetWinProb(pPoint, 15); // Set 5

            // Calculate match win probability
            const pMatch = this.calculateMatchWinProb(pSet25, pSet15);

            // Calculate error for match win probability
            let totalError = Math.abs(pMatch - targetPMatch);

            // If set handicap is provided, include it in error calculation
            if (setHandicapLine !== null && setHandicapProb !== null) {
                // Calculate set handicap probability from exact scores
                // Note: setHandicapProb is always Team 1's probability from market odds
                const outcomes = this.getAllMatchOutcomes(pSet25, pSet15);
                let team1HandicapProb = 0;

                for (const outcome of outcomes) {
                    const margin = outcome.setsWon - outcome.setsLost;
                    // Team 1 covers the handicap if margin > -line
                    // This works for both positive and negative lines
                    if (margin > -setHandicapLine) {
                        team1HandicapProb += outcome.probability;
                    }
                }

                const handicapError = Math.abs(team1HandicapProb - setHandicapProb);
                totalError += handicapError * 0.5; // Weight handicap error less
            }

            // Track best solution
            if (totalError < bestError) {
                bestError = totalError;
                bestP = pPoint;
            }

            // Check convergence
            if (totalError < this.TOLERANCE) {
                break;
            }

            // Update point probability based on error direction
            const errorDirection = pMatch - targetPMatch;
            const learningRate = 0.02 * (1 - i / this.MAX_ITERATIONS); // Decreasing learning rate
            pPoint -= errorDirection * learningRate;

            // Constrain to valid range
            pPoint = Math.max(0.35, Math.min(0.85, pPoint));
        }

        // Use best solution found
        pPoint = bestP;

        // Calculate final metrics
        const pSet25 = this.calculateSetWinProb(pPoint, 25);
        const pSet15 = this.calculateSetWinProb(pPoint, 15);
        const pMatch = this.calculateMatchWinProb(pSet25, pSet15);
        const expectedSets = this.calculateExpectedSets(pSet25);

        return {
            pPoint1: pPoint,
            pPoint2: 1 - pPoint,
            pSet1: pSet25,
            pSet2: 1 - pSet25,
            pMatch1: pMatch,
            pMatch2: 1 - pMatch,
            expectedSets: expectedSets
        };
    }

    // ==========================================
    // PHASE 5: MATCH OUTCOMES
    // ==========================================

    /**
     * Get all possible match outcomes with probabilities
     * @param {number} pSet - Probability of winning sets 1-4
     * @param {number} pSet5 - Probability of winning set 5
     * @returns {Array} Array of outcomes {score, setsWon, setsLost, probability}
     */
    getAllMatchOutcomes(pSet, pSet5) {
        const p = pSet;
        const q = 1 - p;
        const p5 = pSet5;
        const q5 = 1 - p5;

        const outcomes = [];

        // Team 1 wins 3-0
        outcomes.push({
            score: '3-0',
            setsWon: 3,
            setsLost: 0,
            probability: Math.pow(p, 3)
        });

        // Team 1 wins 3-1
        outcomes.push({
            score: '3-1',
            setsWon: 3,
            setsLost: 1,
            probability: this.binomialCoeff(4, 3) * Math.pow(p, 3) * q
        });

        // Team 1 wins 3-2
        outcomes.push({
            score: '3-2',
            setsWon: 3,
            setsLost: 2,
            probability: this.binomialCoeff(4, 2) * Math.pow(p, 2) * Math.pow(q, 2) * p5
        });

        // Team 2 wins 3-0
        outcomes.push({
            score: '0-3',
            setsWon: 0,
            setsLost: 3,
            probability: Math.pow(q, 3)
        });

        // Team 2 wins 3-1
        outcomes.push({
            score: '1-3',
            setsWon: 1,
            setsLost: 3,
            probability: this.binomialCoeff(4, 1) * p * Math.pow(q, 3)
        });

        // Team 2 wins 3-2
        outcomes.push({
            score: '2-3',
            setsWon: 2,
            setsLost: 3,
            probability: this.binomialCoeff(4, 2) * Math.pow(p, 2) * Math.pow(q, 2) * q5
        });

        return outcomes;
    }

    // ==========================================
    // PHASE 6: DERIVATIVE MARKETS
    // ==========================================

    /**
     * Generate all derivative markets
     * @param {object} params - Solved parameters from solveParameters
     * @returns {object} All derivative markets
     */
    generateDerivatives(params) {
        const { pPoint1, pSet1, pMatch1, expectedSets } = params;
        const pSet5 = this.calculateSetWinProb(pPoint1, 15);

        // Get exact set scores
        const exactScores = this.getAllMatchOutcomes(pSet1, pSet5);

        // Calculate total sets markets (from exact scores)
        const totalSets = this.calculateTotalSetsFromScores(exactScores);

        // Calculate set handicaps (from exact scores)
        const setHandicaps = this.calculateSetHandicapsFromScores(exactScores);

        // Calculate set winner markets (to win at least one set)
        const setWinner = this.calculateSetWinnerMarkets(exactScores);

        // Calculate first set winner
        const firstSetWinner = {
            team1: pSet1,
            team2: 1 - pSet1
        };

        // Calculate point handicaps (using point spread estimation)
        const pointHandicaps = this.calculatePointHandicapMarkets(pPoint1);

        return {
            exactScores,
            totalSets,
            setHandicaps,
            setWinner,
            firstSetWinner,
            pointHandicaps,
            expectedSets
        };
    }

    /**
     * Calculate total sets over/under markets from exact scores
     */
    calculateTotalSetsFromScores(exactScores) {
        const markets = [];

        // Common lines: 3.5, 4.5
        for (const line of [3.5, 4.5]) {
            let pOver = 0;

            for (const outcome of exactScores) {
                const totalSets = outcome.setsWon + outcome.setsLost;
                if (totalSets > line) {
                    pOver += outcome.probability;
                }
            }

            markets.push({
                line: line,
                over: pOver,
                under: 1 - pOver
            });
        }

        return markets;
    }

    /**
     * Calculate set handicap markets from exact scores
     *
     * Handicap logic:
     * - Line represents Team 1's handicap
     * - Team 1 covers if: margin > -line
     * - Team 2 probability is: 1 - Team 1 probability
     *
     * Examples:
     * - Line -2.5: Team 1 must win by 3+ sets (margin > 2.5) → Only 3-0
     * - Line +0.5: Team 1 just needs to win (margin > -0.5) → All Team 1 wins
     * - Line +2.5: Team 1 can lose 0-3, 1-3, 2-3 (margin > -2.5) → All scores
     */
    calculateSetHandicapsFromScores(exactScores) {
        const lines = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5];
        const markets = [];

        for (const line of lines) {
            let team1Prob = 0;

            // Team 1 covers the handicap if: margin > -line
            for (const outcome of exactScores) {
                const margin = outcome.setsWon - outcome.setsLost;
                if (margin > -line) {
                    team1Prob += outcome.probability;
                }
            }

            markets.push({
                line: line,
                team1: team1Prob,
                team2: 1 - team1Prob
            });
        }

        return markets;
    }

    /**
     * Calculate set winner markets (to win at least one set)
     */
    calculateSetWinnerMarkets(exactScores) {
        let team1WinsSet = 0;
        let team2WinsSet = 0;

        for (const outcome of exactScores) {
            // Team 1 wins at least one set (any score except 0-3)
            if (outcome.setsWon > 0) {
                team1WinsSet += outcome.probability;
            }
            // Team 2 wins at least one set (any score except 3-0)
            if (outcome.setsLost > 0) {
                team2WinsSet += outcome.probability;
            }
        }

        return {
            team1: team1WinsSet,
            team2: team2WinsSet
        };
    }

    /**
     * Calculate point handicap markets (estimated)
     * Based on expected point differential per set
     */
    calculatePointHandicapMarkets(pPoint) {
        // Estimate expected points per set
        const expectedPointsTeam1 = 25 * pPoint + 5 * (pPoint - 0.5); // Rough estimate including deuce points
        const expectedPointsTeam2 = 25 * (1 - pPoint) + 5 * (0.5 - pPoint);

        const pointDiffPerSet = expectedPointsTeam1 - expectedPointsTeam2;
        const expectedSets = 4; // Average match length

        const totalPointDiff = pointDiffPerSet * expectedSets;

        // Use normal distribution approximation
        const sigma = 15; // Standard deviation for point spread

        const lines = [-15.5, -10.5, -5.5, 5.5, 10.5, 15.5];
        const markets = [];

        for (const line of lines) {
            // Calculate probability that point differential > -line
            // Using normal distribution: X ~ N(totalPointDiff, sigma)
            // P(X > -line) = 1 - P(X <= -line) = 1 - CDF((-line - mean) / sigma)
            const z = (-line - totalPointDiff) / sigma;
            const prob = 1 - this.normalCDF(z);

            markets.push({
                line: line,
                team1: prob,
                team2: 1 - prob
            });
        }

        return markets;
    }

    /**
     * Normal CDF approximation
     */
    normalCDF(x) {
        const t = 1 / (1 + 0.2316419 * Math.abs(x));
        const d = 0.3989423 * Math.exp(-x * x / 2);
        const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
        return x > 0 ? 1 - prob : prob;
    }
}
