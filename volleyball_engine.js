/**
 * Volleyball Pricing Engine (First Set Winner Based)
 * Primary Input: First Set Winner Odds
 * Derived Outputs: Match Winner, Set Handicap, Correct Score
 */

export class VolleyballEngine {
    constructor() {
        this.SHIN_ITERATIONS = 20;
    }

    // ==========================================
    // VIGORISH REMOVAL
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
    // MATCH OUTCOMES FROM FIRST SET WINNER
    // ==========================================

    /**
     * Calculate all match outcomes from first set winner probability
     * Assumes first set probability applies to all sets
     * @param {number} pSet - Probability of Team 1 winning a set
     * @returns {Array} Array of outcomes {score, setsWon, setsLost, probability}
     */
    getAllMatchOutcomes(pSet) {
        const p = pSet;
        const q = 1 - p;

        const outcomes = [];

        // Team 1 wins 3-0
        outcomes.push({
            score: '3-0',
            setsWon: 3,
            setsLost: 0,
            probability: Math.pow(p, 3)
        });

        // Team 1 wins 3-1
        // Last set must be Team 1's 3rd win
        // In first 3 sets, Team 1 wins exactly 2: C(3,2) = 3 ways
        outcomes.push({
            score: '3-1',
            setsWon: 3,
            setsLost: 1,
            probability: this.binomialCoeff(3, 2) * Math.pow(p, 3) * q
        });

        // Team 1 wins 3-2
        // Last set must be Team 1's 3rd win
        // In first 4 sets, Team 1 wins exactly 2: C(4,2) = 6 ways
        outcomes.push({
            score: '3-2',
            setsWon: 3,
            setsLost: 2,
            probability: this.binomialCoeff(4, 2) * Math.pow(p, 3) * Math.pow(q, 2)
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
            probability: this.binomialCoeff(3, 2) * p * Math.pow(q, 3)
        });

        // Team 2 wins 3-2
        outcomes.push({
            score: '2-3',
            setsWon: 2,
            setsLost: 3,
            probability: this.binomialCoeff(4, 2) * Math.pow(p, 2) * Math.pow(q, 3)
        });

        return outcomes;
    }

    /**
     * Binomial coefficient C(n, k) = n! / (k! * (n-k)!)
     */
    binomialCoeff(n, k) {
        if (k > n) return 0;
        if (k === 0 || k === n) return 1;

        k = Math.min(k, n - k);
        let result = 1;
        for (let i = 0; i < k; i++) {
            result *= (n - i);
            result /= (i + 1);
        }
        return result;
    }

    // ==========================================
    // DERIVATIVE MARKETS
    // ==========================================

    /**
     * Generate all derivative markets from first set winner probability
     * @param {number} pFirstSet - Team 1 probability of winning first set
     * @returns {object} All derivative markets
     */
    generateDerivatives(pFirstSet) {
        // Get exact set scores using first set probability
        const exactScores = this.getAllMatchOutcomes(pFirstSet);

        // Calculate match winner from exact scores
        const matchWinner = this.calculateMatchWinner(exactScores);

        // Calculate total sets markets
        const totalSets = this.calculateTotalSetsFromScores(exactScores);

        // Calculate set handicaps
        const setHandicaps = this.calculateSetHandicapsFromScores(exactScores);

        // Calculate expected sets
        const expectedSets = this.calculateExpectedSets(exactScores);

        return {
            exactScores,
            matchWinner,
            totalSets,
            setHandicaps,
            expectedSets,
            firstSetWinner: {
                team1: pFirstSet,
                team2: 1 - pFirstSet
            }
        };
    }

    /**
     * Calculate match winner probabilities from exact scores
     */
    calculateMatchWinner(exactScores) {
        let team1Wins = 0;
        let team2Wins = 0;

        for (const outcome of exactScores) {
            if (outcome.setsWon === 3) {
                team1Wins += outcome.probability;
            } else {
                team2Wins += outcome.probability;
            }
        }

        return {
            team1: team1Wins,
            team2: team2Wins
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
     * Line represents Team 1's handicap
     * Team 1 covers if: margin > -line
     */
    calculateSetHandicapsFromScores(exactScores) {
        const lines = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5];
        const markets = [];

        for (const line of lines) {
            let team1Prob = 0;

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
     * Calculate expected number of sets
     */
    calculateExpectedSets(exactScores) {
        let expected = 0;

        for (const outcome of exactScores) {
            const totalSets = outcome.setsWon + outcome.setsLost;
            expected += totalSets * outcome.probability;
        }

        return expected;
    }
}
