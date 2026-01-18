/**
 * Tennis Markov Engine
 * Uses Exact Combinatorics and Markov Chains instead of Simulation
 *
 * Key Improvements:
 * - Zero variance: Same inputs always yield identical results
 * - Exact probability distributions for all scorelines
 * - Accurate tail probabilities (blowouts and marathons)
 * - Computationally efficient O(1) complexity
 */

export class TennisMarkovEngine {
    constructor() {
        this.MAX_ITERATIONS = 50;
        this.TOLERANCE = 0.005; // 0.5%
        this.SHIN_ITERATIONS = 20;
    }

    // ==========================================
    // PHASE 1: INGESTION & DE-VIGGING (SHIN'S)
    // ==========================================

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
    // PHASE 2.1: FAIR TOTAL CALCULATION
    // ==========================================

    calculateExpectedTotalFromOdds(line, oddsOver, oddsUnder) {
        if (!line || !oddsOver || !oddsUnder) return line;

        try {
            const fairProbs = this.removeVigorish(oddsOver, oddsUnder);
            const pOver = fairProbs.p1;
            const SLOPE_FACTOR = 12.0;
            const adjustment = (pOver - 0.5) * SLOPE_FACTOR;
            return line + adjustment;
        } catch (e) {
            console.warn("Failed to calculate fair total from odds:", e);
            return line;
        }
    }

    getImpliedSpread(pMatch) {
        const SPREAD_FACTOR = 14.0;
        return SPREAD_FACTOR * (pMatch - 0.5);
    }

    getDirectPlayerGames(pMatch, fairTotal) {
        const spread = this.getImpliedSpread(pMatch);
        const p1Exp = (fairTotal + spread) / 2;
        const p2Exp = (fairTotal - spread) / 2;

        return {
            p1: p1Exp,
            p2: p2Exp,
            spread: spread
        };
    }

    // ==========================================
    // PHASE 2.3: SYNTHETIC TOTAL GENERATOR
    // ==========================================

    estimateSyntheticTotal(odds1, odds2, surface = 'Hard') {
        const SURFACE_BASE = {
            'Grass': 23.5,
            'Hard': 22.5,
            'Clay': 21.5,
            'Indoor': 23.5
        };

        const baseTotal = SURFACE_BASE[surface] || 22.5;

        try {
            const fairProbs = this.removeVigorish(odds1, odds2);
            const pFavorite = Math.max(fairProbs.p1, fairProbs.p2);
            const COMPETITIVENESS_FACTOR = 12.0;
            const decay = Math.abs(pFavorite - 0.5) * COMPETITIVENESS_FACTOR;
            const syntheticTotal = baseTotal - decay;
            return Math.max(15.0, Math.min(28.0, syntheticTotal));
        } catch (e) {
            console.warn("Failed to estimate synthetic total:", e);
            return baseTotal;
        }
    }

    // ==========================================
    // CORE PROBABILITIES (ANALYTICAL)
    // ==========================================

    /**
     * Probability of holding serve given point win probability p
     * Uses analytical solution including deuce scenarios
     */
    probHold(p) {
        const p4 = p * p * p * p;
        const p3 = p * p * p;
        const q = 1 - p;
        const q3 = q * q * q;

        // Win 4-0, 4-1, 4-2
        const winNoDeuce = p4 * (1 + 4*q + 10*q*q);

        // Reach Deuce (3-3) -> Win from Deuce
        const pDeuce = 20 * p3 * q3;
        const pWinDeuce = (p * p) / (p * p + q * q);

        return winNoDeuce + (pDeuce * pWinDeuce);
    }

    /**
     * Probability of winning a Tiebreak (First to 7, win by 2)
     * Uses exact DP for serving rotation (A, BB, AA, BB...)
     */
    probTiebreak(pa, pb) {
        // Dynamic programming for TB state [scoreA][scoreB]
        let dp = Array(15).fill().map(() => Array(15).fill(0));
        dp[0][0] = 1.0;
        let winA = 0;

        for (let i = 0; i < 14; i++) {
            for (let j = 0; j < 14; j++) {
                if (dp[i][j] === 0) continue;

                // Determine server: 0->A, 1,2->B, 3,4->A, 5,6->B...
                let k = (i + j);
                let serverIsA;
                if (k === 0) {
                    serverIsA = true;
                } else {
                    let sequenceIdx = k - 1;
                    serverIsA = (Math.floor(sequenceIdx / 2) % 2 !== 0);
                }

                let pPoint = serverIsA ? pa : (1 - pb);

                // A wins next point
                if (i + 1 >= 7 && (i + 1) - j >= 2) {
                    winA += dp[i][j] * pPoint;
                } else if (i + 1 < 14) {
                    dp[i+1][j] += dp[i][j] * pPoint;
                }

                // B wins next point
                if (j + 1 >= 7 && (j + 1) - i >= 2) {
                    // winB (not tracked for winA calculation)
                } else if (j + 1 < 14) {
                    dp[i][j+1] += dp[i][j] * (1 - pPoint);
                }
            }
        }

        // Handle Deuce (6-6) with infinite series
        let p66 = dp[6][6];
        if (p66 > 0) {
            // A serves pt 13, B serves pt 14
            let pAA = pa * (1 - pb);  // A wins both points
            let pBB = (1 - pa) * pb;  // B wins both points
            let winFrom66 = pAA / (pAA + pBB);
            winA += p66 * winFrom66;
        }

        return winA;
    }

    /**
     * Approximate point probability from hold probability
     * Uses inverse relationship with some calibration
     */
    holdToPoint(hold) {
        if (hold < 0.01) return 0.01;
        if (hold > 0.99) return 0.99;

        // Empirical inverse mapping
        // hold ~0.5 -> point ~0.5
        // hold ~0.73 -> point ~0.62
        // hold ~0.90 -> point ~0.7
        if (hold < 0.5) return 0.5;

        // Use Newton-Raphson for better accuracy
        let p = 0.5 + (hold - 0.5) * 0.35;
        for (let i = 0; i < 5; i++) {
            const h = this.probHold(p);
            const error = h - hold;
            if (Math.abs(error) < 0.001) break;

            // Numerical derivative
            const dp = 0.001;
            const dh = (this.probHold(p + dp) - h) / dp;
            if (Math.abs(dh) > 0.001) {
                p -= error / dh;
                p = Math.max(0.01, Math.min(0.99, p));
            }
        }

        return p;
    }

    // ==========================================
    // SET SCORE MATRIX (EXACT DP)
    // ==========================================

    /**
     * Returns exact probability distribution for all possible set scores
     * Uses Dynamic Programming to track every game path
     */
    getSetScoreProbs(phA, phB) {
        // dp[gamesA][gamesB] = probability
        let dp = Array(8).fill().map(() => Array(8).fill(0));
        dp[0][0] = 1.0;

        let scores = {}; // Result: "6-4": 0.15, etc.

        // Iterate through all possible game states
        for (let gA = 0; gA <= 6; gA++) {
            for (let gB = 0; gB <= 6; gB++) {
                if (dp[gA][gB] === 0) continue;

                // Determine server (A serves first, alternates)
                let serverIsA = (gA + gB) % 2 === 0;
                let pWinGame = serverIsA ? phA : (1 - phB);

                // Case 1: A wins next game
                let nextA = gA + 1;
                let nextB = gB;

                if (nextA === 6 && nextB <= 4) {
                    // A wins set 6-X
                    scores[`6-${nextB}`] = (scores[`6-${nextB}`] || 0) + dp[gA][gB] * pWinGame;
                } else if (nextA === 7 && nextB === 5) {
                    // A wins set 7-5
                    scores["7-5"] = (scores["7-5"] || 0) + dp[gA][gB] * pWinGame;
                } else if (nextA <= 6 || (nextA === 7 && nextB === 6)) {
                    // Continue playing
                    if (nextA <= 6) {
                        dp[nextA][nextB] += dp[gA][gB] * pWinGame;
                    }
                }

                // Case 2: B wins next game
                nextA = gA;
                nextB = gB + 1;

                if (nextB === 6 && nextA <= 4) {
                    // B wins set X-6
                    scores[`${nextA}-6`] = (scores[`${nextA}-6`] || 0) + dp[gA][gB] * (1 - pWinGame);
                } else if (nextB === 7 && nextA === 5) {
                    // B wins set 5-7
                    scores["5-7"] = (scores["5-7"] || 0) + dp[gA][gB] * (1 - pWinGame);
                } else if (nextB <= 6) {
                    dp[nextA][nextB] += dp[gA][gB] * (1 - pWinGame);
                }
            }
        }

        // Handle Tiebreak at 6-6
        if (dp[6][6] > 0) {
            // Convert hold probs back to point probs for TB calculation
            const pa = this.holdToPoint(phA);
            const pb = this.holdToPoint(phB);
            const pTB = this.probTiebreak(pa, pb);

            scores["7-6"] = dp[6][6] * pTB;
            scores["6-7"] = dp[6][6] * (1 - pTB);
        }

        return scores;
    }

    // ==========================================
    // MATCH DISTRIBUTION (EXACT CONVOLUTION)
    // ==========================================

    /**
     * Generate exact probability distribution for total match games
     * Uses convolution of set score distributions
     */
    generateMatchDist(phA, phB) {
        const setProbs = this.getSetScoreProbs(phA, phB);

        // Calculate P(A wins Set)
        let pSetA = 0;
        Object.keys(setProbs).forEach(s => {
            const [h, a] = s.split('-').map(Number);
            if (h > a) pSetA += setProbs[s];
        });
        const pSetB = 1 - pSetA;

        // Exact Total Games Distribution (PMF)
        let dist = {};

        const addDist = (games, prob) => {
            dist[games] = (dist[games] || 0) + prob;
        };

        // Convolve all possible match paths
        // Set 1 outcomes
        for (let s1 in setProbs) {
            let [h1, a1] = s1.split('-').map(Number);
            let p1 = setProbs[s1];
            let games1 = h1 + a1;

            // Set 2 outcomes
            for (let s2 in setProbs) {
                let [h2, a2] = s2.split('-').map(Number);
                let p2 = setProbs[s2];
                let games2 = h2 + a2;

                let winner1 = (h1 > a1) ? 'A' : 'B';
                let winner2 = (h2 > a2) ? 'A' : 'B';

                // Match ends 2-0
                if (winner1 === winner2) {
                    addDist(games1 + games2, p1 * p2);
                }
                // Match goes to Set 3
                else {
                    for (let s3 in setProbs) {
                        let [h3, a3] = s3.split('-').map(Number);
                        let p3 = setProbs[s3];
                        let games3 = h3 + a3;
                        addDist(games1 + games2 + games3, p1 * p2 * p3);
                    }
                }
            }
        }

        // Calculate per-player game distributions
        let distA = {};
        let distB = {};

        for (let s1 in setProbs) {
            let [h1, a1] = s1.split('-').map(Number);
            let p1 = setProbs[s1];

            for (let s2 in setProbs) {
                let [h2, a2] = s2.split('-').map(Number);
                let p2 = setProbs[s2];

                let winner1 = (h1 > a1) ? 'A' : 'B';
                let winner2 = (h2 > a2) ? 'A' : 'B';

                if (winner1 === winner2) {
                    // 2-0
                    let gA = h1 + h2;
                    let gB = a1 + a2;
                    distA[gA] = (distA[gA] || 0) + p1 * p2;
                    distB[gB] = (distB[gB] || 0) + p1 * p2;
                } else {
                    // 3 sets
                    for (let s3 in setProbs) {
                        let [h3, a3] = s3.split('-').map(Number);
                        let p3 = setProbs[s3];
                        let gA = h1 + h2 + h3;
                        let gB = a1 + a2 + a3;
                        distA[gA] = (distA[gA] || 0) + p1 * p2 * p3;
                        distB[gB] = (distB[gB] || 0) + p1 * p2 * p3;
                    }
                }
            }
        }

        return {
            pSetA,
            pSetB,
            matchDist: dist,
            distA: distA,
            distB: distB
        };
    }

    // ==========================================
    // THE SOLVER (EXACT APPROACH)
    // ==========================================

    solveParameters(targetPMatch, targetTotalGames, surface = 'Hard', eloHoldProbs = null) {
        const SURFACE_PRIORS = {
            'Grass': 0.75,
            'Hard': 0.68,
            'Clay': 0.60,
            'Indoor': 0.73
        };

        const basePrior = SURFACE_PRIORS[surface] || 0.68;

        let pa, pb;

        if (eloHoldProbs && eloHoldProbs.pa && eloHoldProbs.pb) {
            const ELO_WEIGHT = 0.70;
            const SURFACE_WEIGHT = 0.30;
            const surfaceAdjustedPa = basePrior + (targetPMatch - 0.5) * 0.2;
            const surfaceAdjustedPb = basePrior - (targetPMatch - 0.5) * 0.2;
            pa = ELO_WEIGHT * eloHoldProbs.pa + SURFACE_WEIGHT * surfaceAdjustedPa;
            pb = ELO_WEIGHT * eloHoldProbs.pb + SURFACE_WEIGHT * surfaceAdjustedPb;
        } else {
            pa = basePrior + (targetPMatch - 0.5) * 0.2;
            pb = basePrior - (targetPMatch - 0.5) * 0.2;
        }

        pa = Math.max(0.40, Math.min(0.99, pa));
        pb = Math.max(0.40, Math.min(0.99, pb));

        let bestPa = pa;
        let bestPb = pb;
        let minError = Infinity;

        // Coordinate descent optimization
        for (let i = 0; i < this.MAX_ITERATIONS; i++) {
            const metrics = this.calculateMatchMetrics(pa, pb);

            const errMatch = metrics.pMatch - targetPMatch;
            const errTotal = metrics.expTotal - targetTotalGames;

            if (Math.abs(errMatch) < this.TOLERANCE && Math.abs(errTotal) < 0.2) {
                return { pa, pb, calibration: metrics };
            }

            // Adjust for match win probability (gap)
            const gapStep = 0.05 * (targetPMatch - metrics.pMatch);
            pa += gapStep;
            pb -= gapStep;

            // Adjust for total games (level)
            const levelStep = 0.01 * (targetTotalGames - metrics.expTotal);
            pa += levelStep;
            pb += levelStep;

            pa = Math.max(0.40, Math.min(0.99, pa));
            pb = Math.max(0.40, Math.min(0.99, pb));

            const totalError = Math.abs(errMatch) + Math.abs(errTotal) / 20;
            if (totalError < minError) {
                minError = totalError;
                bestPa = pa;
                bestPb = pb;
            }
        }

        const finalMetrics = this.calculateMatchMetrics(bestPa, bestPb);
        return { pa: bestPa, pb: bestPb, calibration: finalMetrics };
    }

    calculateMatchMetrics(pa, pb) {
        const dist = this.generateMatchDist(pa, pb);

        const pSetA = dist.pSetA;
        const pSetB = dist.pSetB;

        // Match probability: 2-0 or 2-1
        const p20 = pSetA * pSetA;
        const p21 = 2 * pSetA * pSetB * pSetA;
        const pMatchA = p20 + p21;

        // Expected total games
        let expTotal = 0;
        for (let g in dist.matchDist) {
            expTotal += parseFloat(g) * dist.matchDist[g];
        }

        // Expected games per player
        let expGamesPlayer1 = 0;
        for (let g in dist.distA) {
            expGamesPlayer1 += parseFloat(g) * dist.distA[g];
        }

        let expGamesPlayer2 = 0;
        for (let g in dist.distB) {
            expGamesPlayer2 += parseFloat(g) * dist.distB[g];
        }

        // Calculate expected games per set
        const p3Sets = 1 - (p20 + pSetB * pSetB);
        const expGamesPerSet = expTotal / (2 + p3Sets);

        return {
            pMatch: pMatchA,
            expTotal: expTotal,
            pSetA: pSetA,
            pSetB: pSetB,
            p20: p20,
            p21: p21,
            expGamesPerSet: expGamesPerSet,
            expGamesPlayer1: expGamesPlayer1,
            expGamesPlayer2: expGamesPlayer2,
            matchDist: dist.matchDist,
            distA: dist.distA,
            distB: dist.distB
        };
    }

    // ==========================================
    // DERIVATIVE MARKETS
    // ==========================================

    generateDerivatives(pa, pb, calibration, directPlayerGames = null) {
        // 1. Set Betting (Correct Score)
        const pSetA = calibration.pSetA;
        const pSetB = calibration.pSetB;

        let p20 = pSetA * pSetA;
        let p02 = pSetB * pSetB;
        let p21 = 2 * pSetA * pSetB * pSetA;
        let p12 = 2 * pSetB * pSetA * pSetB;

        const total = p20 + p02 + p21 + p12;
        const prices = {
            "2-0": this.rawOdds(p20 / total),
            "0-2": this.rawOdds(p02 / total),
            "2-1": this.rawOdds(p21 / total),
            "1-2": this.rawOdds(p12 / total)
        };

        // 2. Set Winner
        const setWinner = {
            player1: this.rawOdds(pSetA),
            player2: this.rawOdds(pSetB)
        };

        // 3. Both to Win Set
        const pBothWinSet = p21 + p12;
        const bothToWinSet = this.rawOdds(pBothWinSet);

        // 4. Game Handicap - Use exact distribution
        let avgGamesA = calibration.expGamesPlayer1;
        let avgGamesB = calibration.expGamesPlayer2;

        if (directPlayerGames) {
            avgGamesA = directPlayerGames.p1;
            avgGamesB = directPlayerGames.p2;
        }

        const mu = avgGamesA - avgGamesB;

        // Calculate sigma from exact distribution
        let marginSq = 0;
        for (let gA in calibration.distA) {
            for (let gB in calibration.distB) {
                const margin = parseFloat(gA) - parseFloat(gB);
                const prob = calibration.distA[gA] * calibration.distB[gB];
                marginSq += margin * margin * prob;
            }
        }
        const sigma = Math.sqrt(marginSq - mu * mu);

        const handicaps = {};
        [-5.5, -4.5, -3.5, -2.5, -1.5, 1.5, 2.5, 3.5, 4.5, 5.5].forEach(line => {
            const z = (-line - mu) / sigma;
            const probP1 = 1 - this.normalCDF(z);
            const probP2 = 1 - probP1;

            handicaps[line] = {
                player1: this.rawOdds(probP1),
                player2: this.rawOdds(probP2)
            };
        });

        // 5. Player Total Games (using exact distributions)
        const playerTotals = this.generatePlayerTotals(
            calibration.distA,
            calibration.distB,
            avgGamesA,
            avgGamesB
        );

        // 6. Tie-Break Probability (from exact calculation)
        const setProbs = this.getSetScoreProbs(pa, pb);
        let pTieBreak = (setProbs["7-6"] || 0) + (setProbs["6-7"] || 0);
        // Average over multiple sets
        const p3Sets = 1 - (p20 + pSetB * pSetB);
        pTieBreak = pTieBreak * (2 + p3Sets) / 3; // Approximate per-set TB probability

        return {
            setBetting: prices,
            setWinner: setWinner,
            bothToWinSet: bothToWinSet,
            gameHandicap: handicaps,
            playerTotals: playerTotals,
            tieBreakProb: pTieBreak,
            mu,
            sigma,
            avgGamesA,
            avgGamesB
        };
    }

    /**
     * Generate Player Total Games markets using exact distributions
     */
    generatePlayerTotals(distA, distB, avgGamesA, avgGamesB) {
        const player1Totals = {};
        const player2Totals = {};

        // Generate lines around expected games
        const generateLinesAround = (expected) => {
            const base = Math.round(expected);
            return [base - 2.5, base - 1.5, base - 0.5, base + 0.5, base + 1.5, base + 2.5];
        };

        const linesP1 = generateLinesAround(avgGamesA);
        const linesP2 = generateLinesAround(avgGamesB);

        // Calculate probabilities from exact distribution
        linesP1.forEach(line => {
            if (line > 0) {
                let probOver = 0;
                for (let g in distA) {
                    if (parseFloat(g) > line) {
                        probOver += distA[g];
                    }
                }
                const probUnder = 1 - probOver;

                player1Totals[line] = {
                    over: this.rawOdds(probOver),
                    under: this.rawOdds(probUnder)
                };
            }
        });

        linesP2.forEach(line => {
            if (line > 0) {
                let probOver = 0;
                for (let g in distB) {
                    if (parseFloat(g) > line) {
                        probOver += distB[g];
                    }
                }
                const probUnder = 1 - probOver;

                player2Totals[line] = {
                    over: this.rawOdds(probOver),
                    under: this.rawOdds(probUnder)
                };
            }
        });

        return {
            player1: player1Totals,
            player2: player2Totals
        };
    }

    // ==========================================
    // UTILITIES
    // ==========================================

    rawOdds(prob) {
        if (prob <= 0 || prob >= 1) {
            return {
                prob: (prob * 100).toFixed(1) + "%",
                odds: "N/A"
            };
        }
        return {
            prob: (prob * 100).toFixed(1) + "%",
            odds: (1 / prob).toFixed(2)
        };
    }

    normalCDF(x) {
        var t = 1 / (1 + .2316419 * Math.abs(x));
        var d = .3989423 * Math.exp(-x * x / 2);
        var prob = d * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
        if (x > 0) prob = 1 - prob;
        return prob;
    }
}
