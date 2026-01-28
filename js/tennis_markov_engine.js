/**
 * Tennis Markov Engine
 * Uses Exact Combinatorics and Markov Chains.
 * * FIX v2: Corrected Game Handicap Calculation
 * - Previous version assumed independence between P1 and P2 total games.
 * - This version calculates margin distribution directly from match paths (preserving correlation).
 */

export class TennisMarkovEngine {
    constructor() {
        this.MAX_ITERATIONS = 50;
        this.TOLERANCE = 0.005; // 0.5%
        this.SHIN_ITERATIONS = 20;
    }

    // ==========================================
    // PHASE 1: INGESTION & DE-VIGGING
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
            return baseTotal;
        }
    }

    // ==========================================
    // CORE PROBABILITIES (ANALYTICAL)
    // ==========================================

    probHold(p) {
        const p4 = p ** 4;
        const p3 = p ** 3;
        const q = 1 - p;
        const q3 = q ** 3;

        // Win 4-0, 4-1, 4-2
        const winNoDeuce = p4 * (1 + 4 * q + 10 * q * q);

        // Reach Deuce (3-3) -> Win from Deuce
        const pDeuce = 20 * p3 * q3;
        const pWinDeuce = (p * p) / (p * p + q * q);

        return winNoDeuce + (pDeuce * pWinDeuce);
    }

    probTiebreak(pa, pb) {
        let dp = Array(15).fill().map(() => Array(15).fill(0));
        dp[0][0] = 1.0;
        let winA = 0;

        for (let i = 0; i < 14; i++) {
            for (let j = 0; j < 14; j++) {
                if (dp[i][j] === 0) continue;

                let k = (i + j);
                let serverIsA;
                if (k === 0) {
                    serverIsA = true;
                } else {
                    let sequenceIdx = k - 1;
                    serverIsA = (Math.floor(sequenceIdx / 2) % 2 !== 0);
                }

                let pPoint = serverIsA ? pa : (1 - pb);

                if (i + 1 >= 7 && (i + 1) - j >= 2) {
                    winA += dp[i][j] * pPoint;
                } else if (i + 1 < 14) {
                    dp[i + 1][j] += dp[i][j] * pPoint;
                }

                if (j + 1 >= 7 && (j + 1) - i >= 2) {
                    // winB
                } else if (j + 1 < 14) {
                    dp[i][j + 1] += dp[i][j] * (1 - pPoint);
                }
            }
        }

        let p66 = dp[6][6];
        if (p66 > 0) {
            let pAA = pa * (1 - pb);
            let pBB = (1 - pa) * pb;
            let winFrom66 = pAA / (pAA + pBB);
            winA += p66 * winFrom66;
        }

        return winA;
    }

    holdToPoint(hold) {
        if (hold < 0.01) return 0.01;
        if (hold > 0.99) return 0.99;
        if (hold < 0.5) return 0.5;

        let p = 0.5 + (hold - 0.5) * 0.35;
        for (let i = 0; i < 5; i++) {
            const h = this.probHold(p);
            const error = h - hold;
            if (Math.abs(error) < 0.001) break;
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

    getSetScoreProbs(phA, phB) {
        let dp = Array(8).fill().map(() => Array(8).fill(0));
        dp[0][0] = 1.0;
        let scores = {};

        for (let gA = 0; gA <= 6; gA++) {
            for (let gB = 0; gB <= 6; gB++) {
                if (dp[gA][gB] === 0) continue;

                let serverIsA = (gA + gB) % 2 === 0;
                let pWinGame = serverIsA ? phA : (1 - phB);

                let nextA = gA + 1;
                let nextB = gB;

                if (nextA === 6 && nextB <= 4) {
                    scores[`6-${nextB}`] = (scores[`6-${nextB}`] || 0) + dp[gA][gB] * pWinGame;
                } else if (nextA === 7 && nextB === 5) {
                    scores["7-5"] = (scores["7-5"] || 0) + dp[gA][gB] * pWinGame;
                } else if (nextA <= 6 || (nextA === 7 && nextB === 6)) {
                    if (nextA <= 6) dp[nextA][nextB] += dp[gA][gB] * pWinGame;
                }

                nextA = gA;
                nextB = gB + 1;

                if (nextB === 6 && nextA <= 4) {
                    scores[`${nextA}-6`] = (scores[`${nextA}-6`] || 0) + dp[gA][gB] * (1 - pWinGame);
                } else if (nextB === 7 && nextA === 5) {
                    scores["5-7"] = (scores["5-7"] || 0) + dp[gA][gB] * (1 - pWinGame);
                } else if (nextB <= 6) {
                    dp[nextA][nextB] += dp[gA][gB] * (1 - pWinGame);
                }
            }
        }

        if (dp[6][6] > 0) {
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

    generateMatchDist(phA, phB) {
        const setProbs = this.getSetScoreProbs(phA, phB);

        // 1. Calculate P(A wins Set)
        let pSetA = 0;
        Object.keys(setProbs).forEach(s => {
            const [h, a] = s.split('-').map(Number);
            if (h > a) pSetA += setProbs[s];
        });
        const pSetB = 1 - pSetA;

        // 2. Exact Distributions
        let matchDist = {}; // Total Games
        let distA = {};     // Player A Games
        let distB = {};     // Player B Games
        let marginDist = {}; // Exact Margin (A - B)

        const addProb = (obj, key, p) => {
            obj[key] = (obj[key] || 0) + p;
        };

        // Convolve paths
        for (let s1 in setProbs) {
            let [h1, a1] = s1.split('-').map(Number);
            let p1 = setProbs[s1];

            for (let s2 in setProbs) {
                let [h2, a2] = s2.split('-').map(Number);
                let p2 = setProbs[s2];

                let winner1 = (h1 > a1) ? 'A' : 'B';
                let winner2 = (h2 > a2) ? 'A' : 'B';

                // Match ends 2-0
                if (winner1 === winner2) {
                    let totalH = h1 + h2;
                    let totalA = a1 + a2;
                    let pPath = p1 * p2;

                    addProb(matchDist, totalH + totalA, pPath);
                    addProb(distA, totalH, pPath);
                    addProb(distB, totalA, pPath);
                    addProb(marginDist, totalH - totalA, pPath); // Preserves correlation
                }
                // Match goes to 3 sets
                else {
                    for (let s3 in setProbs) {
                        let [h3, a3] = s3.split('-').map(Number);
                        let p3 = setProbs[s3];

                        let totalH = h1 + h2 + h3;
                        let totalA = a1 + a2 + a3;
                        let pPath = p1 * p2 * p3;

                        addProb(matchDist, totalH + totalA, pPath);
                        addProb(distA, totalH, pPath);
                        addProb(distB, totalA, pPath);
                        addProb(marginDist, totalH - totalA, pPath); // Preserves correlation
                    }
                }
            }
        }

        return {
            pSetA,
            pSetB,
            matchDist,
            distA,
            distB,
            marginDist
        };
    }

    // ==========================================
    // THE SOLVER
    // ==========================================

    solveParameters(targetPMatch, targetTotalGames, surface = 'Hard', eloHoldProbs = null) {
        const SURFACE_PRIORS = {
            'Grass': 0.75, 'Hard': 0.68, 'Clay': 0.60, 'Indoor': 0.73
        };
        const basePrior = SURFACE_PRIORS[surface] || 0.68;

        let pa, pb;
        if (eloHoldProbs && eloHoldProbs.pa && eloHoldProbs.pb) {
            const ELO_WEIGHT = 0.70;
            const SURFACE_WEIGHT = 0.30;
            const adjPa = basePrior + (targetPMatch - 0.5) * 0.2;
            const adjPb = basePrior - (targetPMatch - 0.5) * 0.2;
            pa = ELO_WEIGHT * eloHoldProbs.pa + SURFACE_WEIGHT * adjPa;
            pb = ELO_WEIGHT * eloHoldProbs.pb + SURFACE_WEIGHT * adjPb;
        } else {
            pa = basePrior + (targetPMatch - 0.5) * 0.2;
            pb = basePrior - (targetPMatch - 0.5) * 0.2;
        }

        pa = Math.max(0.40, Math.min(0.99, pa));
        pb = Math.max(0.40, Math.min(0.99, pb));

        let bestPa = pa;
        let bestPb = pb;
        let minError = Infinity;

        for (let i = 0; i < this.MAX_ITERATIONS; i++) {
            const metrics = this.calculateMatchMetrics(pa, pb);
            const errMatch = metrics.pMatch - targetPMatch;
            const errTotal = metrics.expTotal - targetTotalGames;

            if (Math.abs(errMatch) < this.TOLERANCE && Math.abs(errTotal) < 0.2) {
                return { pa, pb, calibration: metrics };
            }

            pa += 0.05 * (targetPMatch - metrics.pMatch);
            pb -= 0.05 * (targetPMatch - metrics.pMatch);
            pa += 0.01 * (targetTotalGames - metrics.expTotal);
            pb += 0.01 * (targetTotalGames - metrics.expTotal);

            pa = Math.max(0.40, Math.min(0.99, pa));
            pb = Math.max(0.40, Math.min(0.99, pb));

            const totalError = Math.abs(errMatch) + Math.abs(errTotal) / 20;
            if (totalError < minError) {
                minError = totalError;
                bestPa = pa;
                bestPb = pb;
            }
        }

        return { pa: bestPa, pb: bestPb, calibration: this.calculateMatchMetrics(bestPa, bestPb) };
    }

    calculateMatchMetrics(pa, pb) {
        const dist = this.generateMatchDist(pa, pb);
        const p20 = dist.pSetA * dist.pSetA;
        const p21 = 2 * dist.pSetA * dist.pSetB * dist.pSetA;
        const pMatchA = p20 + p21;

        let expTotal = 0;
        for (let g in dist.matchDist) expTotal += parseFloat(g) * dist.matchDist[g];

        let expGamesP1 = 0;
        for (let g in dist.distA) expGamesP1 += parseFloat(g) * dist.distA[g];

        let expGamesP2 = 0;
        for (let g in dist.distB) expGamesP2 += parseFloat(g) * dist.distB[g];

        return {
            pMatch: pMatchA,
            expTotal: expTotal,
            pSetA: dist.pSetA,
            pSetB: dist.pSetB,
            expGamesPlayer1: expGamesP1,
            expGamesPlayer2: expGamesP2,
            matchDist: dist.matchDist,
            distA: dist.distA,
            distB: dist.distB,
            marginDist: dist.marginDist // Critical for correct handicaps
        };
    }

    // ==========================================
    // DERIVATIVE MARKETS
    // ==========================================

    generateDerivatives(pa, pb, calibration, directPlayerGames = null) {
        const pSetA = calibration.pSetA;
        const pSetB = calibration.pSetB;
        const p20 = pSetA * pSetA;
        const p02 = pSetB * pSetB;
        const p21 = 2 * pSetA * pSetB * pSetA;
        const p12 = 2 * pSetB * pSetA * pSetB;
        const total = p20 + p02 + p21 + p12;

        const prices = {
            "2-0": this.rawOdds(p20 / total),
            "0-2": this.rawOdds(p02 / total),
            "2-1": this.rawOdds(p21 / total),
            "1-2": this.rawOdds(p12 / total)
        };

        const setWinner = {
            player1: this.rawOdds(pSetA),
            player2: this.rawOdds(pSetB)
        };

        const bothToWinSet = this.rawOdds(p21 + p12);

        // --- GAME HANDICAP FIX ---
        // Use the EXACT margin distribution calculated during convolution.
        // This preserves the correlation between P1 and P2 games.
        // P(P1 covers -4.5) = P(Margin > 4.5)
        const marginDist = calibration.marginDist;
        const handicaps = {};

        [-5.5, -4.5, -3.5, -2.5, -1.5, 1.5, 2.5, 3.5, 4.5, 5.5].forEach(line => {
            let probP1 = 0;
            for (let m in marginDist) {
                if (parseFloat(m) > -line) {
                    probP1 += marginDist[m];
                }
            }
            const probP2 = 1 - probP1;

            handicaps[line] = {
                player1: this.rawOdds(probP1),
                player2: this.rawOdds(probP2)
            };
        });

        // Player Totals
        const playerTotals = this.generatePlayerTotals(
            calibration.distA,
            calibration.distB,
            directPlayerGames ? directPlayerGames.p1 : calibration.expGamesPlayer1,
            directPlayerGames ? directPlayerGames.p2 : calibration.expGamesPlayer2
        );

        // Tie Break Prob (Approx)
        const setProbs = this.getSetScoreProbs(pa, pb);
        let pTieBreak = (setProbs["7-6"] || 0) + (setProbs["6-7"] || 0);
        const p3Sets = 1 - (p20 + pSetB * pSetB);
        pTieBreak = pTieBreak * (2 + p3Sets) / 3;

        return {
            setBetting: prices,
            setWinner: setWinner,
            bothToWinSet: bothToWinSet,
            gameHandicap: handicaps,
            playerTotals: playerTotals,
            tieBreakProb: this.rawOdds(pTieBreak)
        };
    }

    generatePlayerTotals(distA, distB, avgA, avgB) {
        const player1Totals = {};
        const player2Totals = {};
        const genLines = (exp) => {
            const b = Math.round(exp);
            return [b - 2.5, b - 1.5, b - 0.5, b + 0.5, b + 1.5, b + 2.5];
        };

        genLines(avgA).forEach(line => {
            if (line > 0) {
                let pOver = 0;
                for (let g in distA) if (parseFloat(g) > line) pOver += distA[g];
                player1Totals[line] = { over: this.rawOdds(pOver), under: this.rawOdds(1 - pOver) };
            }
        });

        genLines(avgB).forEach(line => {
            if (line > 0) {
                let pOver = 0;
                for (let g in distB) if (parseFloat(g) > line) pOver += distB[g];
                player2Totals[line] = { over: this.rawOdds(pOver), under: this.rawOdds(1 - pOver) };
            }
        });

        return { player1: player1Totals, player2: player2Totals };
    }

    rawOdds(prob) {
        if (prob <= 0.001 || prob >= 0.999) return { prob: (prob * 100).toFixed(1) + "%", odds: "N/A" };
        return { prob: (prob * 100).toFixed(1) + "%", odds: (1 / prob).toFixed(2) };
    }
}
