/**
 * Tennis Betting Engine - Monte Carlo Simulation Based
 * Inputs: Match Winner Odds + Total Games Line
 * Outputs: Fair Prices for Sets, Handicaps, and Totals
 *
 * Key Improvements:
 * - Adaptive solver with convergence detection
 * - Proper tiebreak serve alternation
 * - Better parameter initialization
 * - Comprehensive market generation
 */

export class TennisEngine {
    constructor() {
        // Simulation batch sizes
        this.SIM_BATCH_SIZE = 1000;   // For solver iterations
        this.FINAL_SIM_SIZE = 10000;  // For final pricing

        // Solver configuration
        this.MAX_SOLVER_ITERATIONS = 50;
        this.CONVERGENCE_THRESHOLD = 0.005; // 0.5% accuracy
        this.MIN_ITERATIONS = 10; // Minimum iterations before checking convergence
    }

    /**
     * Simulate a single tennis game with proper deuce logic
     */
    simulateGame(serverHoldProb) {
        let points1 = 0;
        let points2 = 0;

        while (true) {
            // Server wins point
            if (Math.random() < serverHoldProb) {
                points1++;
            } else {
                points2++;
            }

            // Check win conditions
            if (points1 >= 4 && points1 - points2 >= 2) {
                return 1; // Server wins
            }
            if (points2 >= 4 && points2 - points1 >= 2) {
                return 2; // Returner wins
            }
        }
    }

    /**
     * Simulate a tiebreak with proper serve alternation
     * In a tiebreak: Player A serves 1, Player B serves 2, then alternate every 2 points
     */
    simulateTiebreak(p1ServeProb, p2ServeProb, p1ServesFirst) {
        let tb1 = 0;
        let tb2 = 0;
        let pointsPlayed = 0;

        while (true) {
            // Determine who serves this point
            let p1Serving;
            if (pointsPlayed === 0) {
                // First point
                p1Serving = p1ServesFirst;
            } else if (pointsPlayed === 1) {
                // Second point (opposite of first)
                p1Serving = !p1ServesFirst;
            } else {
                // After first 2 points, alternate every 2 points
                // Points 2,3 -> server 1, points 4,5 -> server 2, etc.
                const adjustedPoint = pointsPlayed - 2;
                const serverGroup = Math.floor(adjustedPoint / 2) % 2;
                p1Serving = (serverGroup === 0) ? p1ServesFirst : !p1ServesFirst;
            }

            // Play the point
            if (p1Serving) {
                if (Math.random() < p1ServeProb) tb1++; else tb2++;
            } else {
                if (Math.random() < p2ServeProb) tb2++; else tb1++;
            }

            pointsPlayed++;

            // Check win conditions (first to 7, win by 2)
            if (tb1 >= 7 && tb1 - tb2 >= 2) {
                return { winner: 1, score: `${tb1}-${tb2}` };
            }
            if (tb2 >= 7 && tb2 - tb1 >= 2) {
                return { winner: 2, score: `${tb1}-${tb2}` };
            }
        }
    }

    /**
     * Simulate a single set
     */
    simulateSet(p1ServeProb, p2ServeProb, p1ServesFirst) {
        let g1 = 0;
        let g2 = 0;
        let gamesPlayed = 0;

        while (true) {
            // Determine server for this game
            const p1Serving = (gamesPlayed % 2 === 0) ? p1ServesFirst : !p1ServesFirst;

            // Simulate game
            const gameResult = this.simulateGame(p1Serving ? p1ServeProb : p2ServeProb);
            if ((p1Serving && gameResult === 1) || (!p1Serving && gameResult === 2)) {
                g1++;
            } else {
                g2++;
            }

            gamesPlayed++;

            // Check set win conditions
            // Win 6-0, 6-1, 6-2, 6-3, 6-4
            if (g1 === 6 && g2 <= 4) {
                return { winner: 1, games1: g1, games2: g2 };
            }
            if (g2 === 6 && g1 <= 4) {
                return { winner: 2, games1: g1, games2: g2 };
            }

            // Win 7-5
            if (g1 === 7 && g2 === 5) {
                return { winner: 1, games1: g1, games2: g2 };
            }
            if (g2 === 7 && g1 === 5) {
                return { winner: 2, games1: g1, games2: g2 };
            }

            // Tiebreak at 6-6
            if (g1 === 6 && g2 === 6) {
                const tbResult = this.simulateTiebreak(p1ServeProb, p2ServeProb, p1ServesFirst);

                if (tbResult.winner === 1) {
                    return { winner: 1, games1: 7, games2: 6 };
                } else {
                    return { winner: 2, games1: 6, games2: 7 };
                }
            }
        }
    }

    /**
     * Simulate a complete match (best of 3 sets)
     */
    simulateMatch(p1ServeProb, p2ServeProb) {
        let sets1 = 0;
        let sets2 = 0;
        let games1Total = 0;
        let games2Total = 0;
        const setScores = [];

        // P1 serves first in the match
        let p1ServesFirstThisSet = true;

        // Best of 3 sets
        while (sets1 < 2 && sets2 < 2) {
            const setResult = this.simulateSet(p1ServeProb, p2ServeProb, p1ServesFirstThisSet);

            games1Total += setResult.games1;
            games2Total += setResult.games2;
            setScores.push(`${setResult.games1}-${setResult.games2}`);

            if (setResult.winner === 1) {
                sets1++;
            } else {
                sets2++;
            }

            // In tennis, the player who didn't serve first in the previous set serves first in the next
            // This is determined by the total games played in the previous set
            const totalGamesInSet = setResult.games1 + setResult.games2;
            if (totalGamesInSet % 2 === 1) {
                // Odd number of games, flip the serve
                p1ServesFirstThisSet = !p1ServesFirstThisSet;
            }
            // If even number of games, same player serves first
        }

        return {
            winner: sets1 > sets2 ? 1 : 2,
            sets1,
            sets2,
            totalGames: games1Total + games2Total,
            margin: games1Total - games2Total,
            scoreStr: `${sets1}-${sets2}`,
            setScores
        };
    }

    /**
     * Calculate match statistics from multiple simulations
     */
    runSimulations(p1ServeProb, p2ServeProb, numSimulations) {
        const stats = {
            matches: 0,
            p1Wins: 0,
            totalGamesSum: 0,
            // Set betting
            sets_2_0: 0,
            sets_2_1: 0,
            sets_0_2: 0,
            sets_1_2: 0,
            // Game totals tracking
            gameCounts: [],
            // Margin tracking
            margins: []
        };

        for (let i = 0; i < numSimulations; i++) {
            const result = this.simulateMatch(p1ServeProb, p2ServeProb);
            stats.matches++;

            if (result.winner === 1) stats.p1Wins++;
            stats.totalGamesSum += result.totalGames;
            stats.gameCounts.push(result.totalGames);
            stats.margins.push(result.margin);

            // Set betting
            if (result.scoreStr === "2-0") stats.sets_2_0++;
            else if (result.scoreStr === "2-1") stats.sets_2_1++;
            else if (result.scoreStr === "0-2") stats.sets_0_2++;
            else if (result.scoreStr === "1-2") stats.sets_1_2++;
        }

        return stats;
    }

    /**
     * Improved solver with adaptive learning rate and convergence detection
     */
    solveParameters(targetWinProb, targetTotalGames) {
        // Better initial guess based on inputs
        // High total games -> both players hold serve well
        // Win prob drives the difference between players

        const avgHoldRate = 0.55 + (targetTotalGames - 20) * 0.01; // Scale with total
        const holdDiff = (targetWinProb - 0.5) * 0.4; // Difference based on win prob

        let p1 = Math.max(0.40, Math.min(0.95, avgHoldRate + holdDiff));
        let p2 = Math.max(0.40, Math.min(0.95, avgHoldRate - holdDiff));

        let learningRate = 0.08; // Initial learning rate
        let prevErrorSum = Infinity;
        let bestP1 = p1;
        let bestP2 = p2;
        let bestErrorSum = Infinity;

        console.log(`\nSolver Target: Win ${(targetWinProb * 100).toFixed(1)}%, Total ${targetTotalGames} games`);

        for (let iteration = 0; iteration < this.MAX_SOLVER_ITERATIONS; iteration++) {
            // Run simulation batch
            const stats = this.runSimulations(p1, p2, this.SIM_BATCH_SIZE);

            const currentWinProb = stats.p1Wins / stats.matches;
            const currentTotal = stats.totalGamesSum / stats.matches;

            // Calculate errors (weighted)
            const errorWin = targetWinProb - currentWinProb;
            const errorTotal = targetTotalGames - currentTotal;

            // Calculate combined error for convergence check
            // Give more weight to win probability accuracy
            const errorSum = Math.abs(errorWin) * 2.5 + Math.abs(errorTotal) / 25;

            // Track best solution
            if (errorSum < bestErrorSum) {
                bestErrorSum = errorSum;
                bestP1 = p1;
                bestP2 = p2;
            }

            // Log progress every 5 iterations
            if (iteration % 5 === 0 || iteration < 3) {
                console.log(`  Iter ${iteration}: P1=${(p1*100).toFixed(1)}% P2=${(p2*100).toFixed(1)}% | Win=${(currentWinProb*100).toFixed(1)}% Total=${currentTotal.toFixed(1)} Err=${errorSum.toFixed(3)}`);
            }

            // Check convergence after minimum iterations
            if (iteration >= this.MIN_ITERATIONS) {
                if (errorSum < this.CONVERGENCE_THRESHOLD) {
                    console.log(`✓ Converged at iteration ${iteration}`);
                    break;
                }

                // Adaptive learning rate based on error trend
                if (errorSum > prevErrorSum * 1.05) {
                    // Error increased significantly, reduce learning rate more
                    learningRate *= 0.7;
                } else if (errorSum > prevErrorSum) {
                    // Error increased slightly, reduce learning rate
                    learningRate *= 0.85;
                } else if (errorSum < prevErrorSum * 0.8) {
                    // Error decreased significantly, slightly increase learning rate
                    learningRate = Math.min(0.12, learningRate * 1.08);
                }
            }

            prevErrorSum = errorSum;

            // Update parameters using improved gradient heuristics
            // Win probability is more sensitive to hold rate differences
            // Total games is affected by both sum and product of hold rates

            // Proportional + Derivative adjustments
            const winAdjustBase = errorWin * learningRate * 0.35;
            const totalAdjustBase = errorTotal * learningRate * 0.012;

            // Apply adjustments with different scaling for balanced vs one-sided matches
            const winDominance = Math.abs(targetWinProb - 0.5);
            const winScale = 1.0 + winDominance * 0.5; // Increase adjustment for one-sided matches

            const p1Adjust = totalAdjustBase + (winAdjustBase * winScale);
            const p2Adjust = totalAdjustBase - (winAdjustBase * winScale);

            p1 += p1Adjust;
            p2 += p2Adjust;

            // Clamp to realistic bounds (40% to 95% hold rate)
            p1 = Math.max(0.40, Math.min(0.95, p1));
            p2 = Math.max(0.40, Math.min(0.95, p2));

            // If we're stuck, use best solution so far
            if (iteration === this.MAX_SOLVER_ITERATIONS - 1 && errorSum > this.CONVERGENCE_THRESHOLD) {
                p1 = bestP1;
                p2 = bestP2;
                console.log(`  Using best solution found (error: ${bestErrorSum.toFixed(3)})`);
            }
        }

        console.log(`Final: P1 Hold ${(p1*100).toFixed(1)}%, P2 Hold ${(p2*100).toFixed(1)}%\n`);

        return { p1, p2 };
    }

    /**
     * Generate comprehensive betting markets
     */
    generatePrices(p1Odds, p2Odds, totalLine) {
        // 1. Calculate fair probability (remove vig)
        const imp1 = 1 / p1Odds;
        const imp2 = 1 / p2Odds;
        const marketVig = imp1 + imp2;
        const trueProb1 = imp1 / marketVig;

        // 2. Solve for serve hold probabilities
        const { p1, p2 } = this.solveParameters(trueProb1, totalLine);

        // 3. Run large simulation for pricing
        console.log(`Running ${this.FINAL_SIM_SIZE} simulations for final pricing...`);
        const stats = this.runSimulations(p1, p2, this.FINAL_SIM_SIZE);

        // 4. Calculate market probabilities
        const markets = this.calculateMarkets(stats, totalLine);

        return {
            calibration: {
                p1HoldRate: (p1 * 100).toFixed(1) + '%',
                p2HoldRate: (p2 * 100).toFixed(1) + '%',
                simulatedWinProb: (stats.p1Wins / stats.matches * 100).toFixed(1) + '%',
                simulatedTotalGames: (stats.totalGamesSum / stats.matches).toFixed(1)
            },
            markets
        };
    }

    /**
     * Calculate all betting markets from simulation statistics
     */
    calculateMarkets(stats, totalLine) {
        const n = stats.matches;

        const toOdds = (count) => {
            const prob = count / n;
            return prob > 0 ? (1 / prob).toFixed(2) : null;
        };

        const toProb = (count) => {
            return (count / n * 100).toFixed(2) + '%';
        };

        // Set Betting Markets
        const setBetting = {
            '2-0': { odds: toOdds(stats.sets_2_0), prob: toProb(stats.sets_2_0) },
            '2-1': { odds: toOdds(stats.sets_2_1), prob: toProb(stats.sets_2_1) },
            '0-2': { odds: toOdds(stats.sets_0_2), prob: toProb(stats.sets_0_2) },
            '1-2': { odds: toOdds(stats.sets_1_2), prob: toProb(stats.sets_1_2) }
        };

        // Total Games Markets (multiple lines)
        const totalGamesMarkets = {};
        const lines = [19.5, 20.5, 21.5, 22.5, 23.5, 24.5, 25.5];

        lines.forEach(line => {
            const over = stats.gameCounts.filter(g => g > line).length;
            const under = n - over;
            totalGamesMarkets[line] = {
                over: { odds: toOdds(over), prob: toProb(over) },
                under: { odds: toOdds(under), prob: toProb(under) }
            };
        });

        // Set Handicaps
        const setHandicaps = {};
        const setLines = [-1.5, 1.5];

        setLines.forEach(line => {
            let p1Covers, p2Covers;
            if (line === -1.5) {
                // P1 -1.5: needs to win 2-0
                p1Covers = stats.sets_2_0;
                p2Covers = n - p1Covers;
            } else if (line === 1.5) {
                // P1 +1.5: covers unless loses 0-2
                p2Covers = stats.sets_0_2;
                p1Covers = n - p2Covers;
            }

            setHandicaps[line] = {
                player1: { odds: toOdds(p1Covers), prob: toProb(p1Covers) },
                player2: { odds: toOdds(p2Covers), prob: toProb(p2Covers) }
            };
        });

        // Game Handicaps
        const gameHandicaps = {};
        const gameLines = [-5.5, -3.5, -1.5, 1.5, 3.5, 5.5];

        gameLines.forEach(line => {
            const p1Covers = stats.margins.filter(m => m > line).length;
            const p2Covers = n - p1Covers;

            gameHandicaps[line] = {
                player1: { odds: toOdds(p1Covers), prob: toProb(p1Covers) },
                player2: { odds: toOdds(p2Covers), prob: toProb(p2Covers) }
            };
        });

        return {
            setBetting,
            totalGames: totalGamesMarkets,
            setHandicaps,
            gameHandicaps
        };
    }
}
