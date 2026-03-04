/**
 * Tennis Markov Engine (V3 - Exact DP Edition)
 * Uses Exact Combinatorics, Dynamic Programming, and Orthogonal Solvers.
 * - Replaces all Monte Carlo simulations with exact state-space tracking.
 * - Automatically handles Best-of-3 and Best-of-5 formats.
 * - Uses an Orthogonal Solver for instant, stable convergence.
 */

export class TennisMarkovEngine {
    constructor() {
        this.MAX_ITERATIONS = 50;
        this.TOLERANCE = 0.002;
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
            return line + (pOver - 0.5) * SLOPE_FACTOR;
        } catch (e) {
            return line;
        }
    }

    getImpliedSpread(pMatch) {
        const SPREAD_FACTOR = 14.0;
        return SPREAD_FACTOR * (pMatch - 0.5);
    }

    getDirectPlayerGames(pMatch, fairTotal) {
        const spread = this.getImpliedSpread(pMatch);
        return {
            p1: (fairTotal + spread) / 2,
            p2: (fairTotal - spread) / 2,
            spread: spread
        };
    }

    estimateSyntheticTotal(odds1, odds2, surface = 'Hard') {
        const SURFACE_BASE = { 'Grass': 23.5, 'Hard': 22.5, 'Clay': 21.5, 'Indoor': 23.5 };
        const baseTotal = SURFACE_BASE[surface] || 22.5;

        try {
            const fairProbs = this.removeVigorish(odds1, odds2);
            const pFavorite = Math.max(fairProbs.p1, fairProbs.p2);
            const COMPETITIVENESS_FACTOR = 12.0;
            return Math.max(15.0, Math.min(28.0, baseTotal - (Math.abs(pFavorite - 0.5) * COMPETITIVENESS_FACTOR)));
        } catch (e) {
            return baseTotal;
        }
    }

    // ==========================================
    // CORE PROBABILITIES (ANALYTICAL)
    // ==========================================

    probHold(p) {
        const p4 = Math.pow(p, 4);
        const p3 = Math.pow(p, 3);
        const q = 1 - p;
        const q3 = Math.pow(q, 3);

        const winNoDeuce = p4 * (1 + 4 * q + 10 * q * q);
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
                let serverIsA = k === 0 ? true : (Math.floor((k - 1) / 2) % 2 !== 0);
                let pPoint = serverIsA ? pa : (1 - pb);

                if (i + 1 >= 7 && (i + 1) - j >= 2) winA += dp[i][j] * pPoint;
                else if (i + 1 < 14) dp[i + 1][j] += dp[i][j] * pPoint;

                if (j + 1 >= 7 && (j + 1) - i >= 2) { /* winB */ }
                else if (j + 1 < 14) dp[i][j + 1] += dp[i][j] * (1 - pPoint);
            }
        }

        let p66 = dp[6][6];
        if (p66 > 0) {
            let pAA = pa * (1 - pb);
            let pBB = (1 - pa) * pb;
            winA += p66 * (pAA / (pAA + pBB));
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

                let nextA = gA + 1, nextB = gB;
                if (nextA === 6 && nextB <= 4) scores[`6-${nextB}`] = (scores[`6-${nextB}`] || 0) + dp[gA][gB] * pWinGame;
                else if (nextA === 7 && nextB === 5) scores["7-5"] = (scores["7-5"] || 0) + dp[gA][gB] * pWinGame;
                else if (nextA <= 6 || (nextA === 7 && nextB === 6)) dp[nextA][nextB] += dp[gA][gB] * pWinGame;

                nextA = gA;
                nextB = gB + 1;
                if (nextB === 6 && nextA <= 4) scores[`${nextA}-6`] = (scores[`${nextA}-6`] || 0) + dp[gA][gB] * (1 - pWinGame);
                else if (nextB === 7 && nextA === 5) scores["5-7"] = (scores["5-7"] || 0) + dp[gA][gB] * (1 - pWinGame);
                else if (nextB <= 6) dp[nextA][nextB] += dp[gA][gB] * (1 - pWinGame);
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
    // EXACT MATCH DISTRIBUTION (DP STATE MACHINE)
    // ==========================================

    generateMatchDist(phA, phB, bestOf = 3) {
        const setProbs = this.getSetScoreProbs(phA, phB);

        let pSetA = 0;
        Object.keys(setProbs).forEach((s) => {
            const [h, a] = s.split('-').map(Number);
            if (h > a) pSetA += setProbs[s];
        });
        const pSetB = 1 - pSetA;

        let matchDist = {};
        let distA = {};
        let distB = {};
        let marginDist = {};
        let setScoreDist = {};

        const addProb = (obj, key, p) => {
            obj[key] = (obj[key] || 0) + p;
        };

        const setsToWin = Math.ceil(bestOf / 2);
        // Key format: "setsA-setsB-gamesA-gamesB"
        let currentStates = new Map();
        currentStates.set('0-0-0-0', 1.0);

        while (currentStates.size > 0) {
            let nextStates = new Map();

            for (let [stateKey, p] of currentStates.entries()) {
                let [setsA, setsB, gA, gB] = stateKey.split('-').map(Number);

                if (setsA === setsToWin || setsB === setsToWin) {
                    addProb(matchDist, gA + gB, p);
                    addProb(distA, gA, p);
                    addProb(distB, gB, p);
                    addProb(marginDist, gA - gB, p);
                    addProb(setScoreDist, `${setsA}-${setsB}`, p);
                    continue;
                }

                for (let s in setProbs) {
                    let [h, a] = s.split('-').map(Number);
                    let nSA = setsA + (h > a ? 1 : 0);
                    let nSB = setsB + (a > h ? 1 : 0);
                    let nGA = gA + h;
                    let nGB = gB + a;
                    let newKey = `${nSA}-${nSB}-${nGA}-${nGB}`;
                    nextStates.set(newKey, (nextStates.get(newKey) || 0) + p * setProbs[s]);
                }
            }
            currentStates = nextStates;
        }

        return { pSetA, pSetB, matchDist, distA, distB, marginDist, setScoreDist };
    }

    // ==========================================
    // THE ORTHOGONAL SOLVER
    // ==========================================

    solveParameters(targetPMatch, targetTotalGames, surface = 'Hard', eloHoldProbs = null) {
        const SURFACE_PRIORS = { 'Grass': 0.75, 'Hard': 0.68, 'Clay': 0.60, 'Indoor': 0.73 };
        const basePrior = SURFACE_PRIORS[surface] || 0.68;

        let pa;
        let pb;
        if (eloHoldProbs && eloHoldProbs.pa && eloHoldProbs.pb) {
            const ELO_WEIGHT = 0.70;
            const SURFACE_WEIGHT = 0.30;
            pa = ELO_WEIGHT * eloHoldProbs.pa + SURFACE_WEIGHT * (basePrior + (targetPMatch - 0.5) * 0.2);
            pb = ELO_WEIGHT * eloHoldProbs.pb + SURFACE_WEIGHT * (basePrior - (targetPMatch - 0.5) * 0.2);
        } else {
            pa = basePrior + (targetPMatch - 0.5) * 0.2;
            pb = basePrior - (targetPMatch - 0.5) * 0.2;
        }

        pa = Math.max(0.40, Math.min(0.95, pa));
        pb = Math.max(0.40, Math.min(0.95, pb));

        // Auto-detect Match Format
        const bestOf = targetTotalGames > 29.5 ? 5 : 3;

        let bestPa = pa;
        let bestPb = pb;
        let minError = Infinity;

        // Orthogonal state variables
        let diff = pa - pb;
        let sum = pa + pb;

        for (let i = 0; i < this.MAX_ITERATIONS; i++) {
            const metrics = this.calculateMatchMetrics(pa, pb, bestOf);
            const errMatch = metrics.pMatch - targetPMatch;
            const errTotal = metrics.expTotal - targetTotalGames;

            const totalError = Math.abs(errMatch) + Math.abs(errTotal) / 20;
            if (totalError < minError) {
                minError = totalError;
                bestPa = pa;
                bestPb = pb;
            }

            if (Math.abs(errMatch) < this.TOLERANCE && Math.abs(errTotal) < 0.2) break;

            // Orthogonal Newton-like adjustment
            diff -= errMatch * 0.8; // Adjust relative strength
            sum -= errTotal * 0.05; // Adjust overall hold frequency

            pa = Math.max(0.40, Math.min(0.98, (sum + diff) / 2));
            pb = Math.max(0.40, Math.min(0.98, (sum - diff) / 2));
        }

        const finalMetrics = this.calculateMatchMetrics(bestPa, bestPb, bestOf);
        return { pa: bestPa, pb: bestPb, calibration: finalMetrics };
    }

    calculateMatchMetrics(pa, pb, bestOf) {
        const dist = this.generateMatchDist(pa, pb, bestOf);

        let pMatchA = 0;
        let expTotal = 0;
        let expGamesP1 = 0;
        let expGamesP2 = 0;

        for (let m in dist.marginDist) if (parseFloat(m) > 0) pMatchA += dist.marginDist[m];
        for (let g in dist.matchDist) expTotal += parseFloat(g) * dist.matchDist[g];
        for (let g in dist.distA) expGamesP1 += parseFloat(g) * dist.distA[g];
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
            marginDist: dist.marginDist,
            setScoreDist: dist.setScoreDist
        };
    }

    // ==========================================
    // DERIVATIVE MARKETS
    // ==========================================

    generateDerivatives(pa, pb, calibration, directPlayerGames = null) {
        // 1. Set Betting (Dynamic for BO3 and BO5)
        const prices = {};
        for (let score in calibration.setScoreDist) {
            prices[score] = this.rawOdds(calibration.setScoreDist[score]);
        }

        // 2. Set Winner (Set 1)
        const setWinner = {
            player1: this.rawOdds(calibration.pSetA),
            player2: this.rawOdds(calibration.pSetB)
        };

        // 3. Both to Win Set (Any match where losing player wins > 0 sets)
        let pCleanSweep = 0;
        for (let score in calibration.setScoreDist) {
            if (score.endsWith('-0') || score.startsWith('0-')) {
                pCleanSweep += calibration.setScoreDist[score];
            }
        }
        const bothToWinSet = this.rawOdds(1 - pCleanSweep);

        // 4. Game Handicap (Using exactly shifted margin dist)
        let expectedMargin = calibration.expGamesPlayer1 - calibration.expGamesPlayer2;
        let targetMargin = directPlayerGames ? directPlayerGames.spread : expectedMargin;
        let shiftMargin = targetMargin - expectedMargin;

        const handicaps = {};
        [-6.5, -5.5, -4.5, -3.5, -2.5, -1.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5].forEach((line) => {
            let probP1 = this.evaluateShiftedCDF(calibration.marginDist, -line, shiftMargin, true);
            handicaps[line] = {
                player1: this.rawOdds(probP1),
                player2: this.rawOdds(1 - probP1)
            };
        });

        // 5. Player Total Games
        const playerTotals = this.generatePlayerTotals(
            calibration.distA,
            calibration.distB,
            calibration.expGamesPlayer1,
            calibration.expGamesPlayer2,
            directPlayerGames ? directPlayerGames.p1 : calibration.expGamesPlayer1,
            directPlayerGames ? directPlayerGames.p2 : calibration.expGamesPlayer2
        );

        // 6. Tie Break Prob
        const setProbs = this.getSetScoreProbs(pa, pb);
        let pSetTieBreak = (setProbs['7-6'] || 0) + (setProbs['6-7'] || 0);
        let expSets = 0;
        for (let score in calibration.setScoreDist) {
            const [sA, sB] = score.split('-').map(Number);
            expSets += (sA + sB) * calibration.setScoreDist[score];
        }
        let pMatchTieBreak = 1 - Math.pow(1 - pSetTieBreak, expSets);

        return {
            setBetting: prices,
            setWinner: setWinner,
            bothToWinSet: bothToWinSet,
            gameHandicap: handicaps,
            playerTotals: playerTotals,
            tieBreakProb: this.rawOdds(pMatchTieBreak)
        };
    }

    generatePlayerTotals(distA, distB, exactAvgA, exactAvgB, targetAvgA, targetAvgB) {
        let shiftA = targetAvgA - exactAvgA;
        let shiftB = targetAvgB - exactAvgB;

        const genLines = (exp) => {
            const b = Math.round(exp);
            return [b - 2.5, b - 1.5, b - 0.5, b + 0.5, b + 1.5, b + 2.5];
        };

        const player1Totals = {};
        const player2Totals = {};

        genLines(targetAvgA).forEach((line) => {
            if (line > 0) {
                let pOver = this.evaluateShiftedCDF(distA, line, shiftA, true);
                player1Totals[line] = { over: this.rawOdds(pOver), under: this.rawOdds(1 - pOver) };
            }
        });

        genLines(targetAvgB).forEach((line) => {
            if (line > 0) {
                let pOver = this.evaluateShiftedCDF(distB, line, shiftB, true);
                player2Totals[line] = { over: this.rawOdds(pOver), under: this.rawOdds(1 - pOver) };
            }
        });

        return { player1: player1Totals, player2: player2Totals };
    }

    // Evaluates P(X > threshold) for a discrete distribution shifted by `shift`
    evaluateShiftedCDF(dist, threshold, shift, isOver) {
        let prob = 0;
        let evalLine = threshold - shift; // Inverse mapping

        for (let g in dist) {
            let gVal = parseFloat(g);
            if (gVal > evalLine + 0.5) {
                prob += dist[g];
            } else if (gVal > evalLine - 0.5) {
                // Smooth interpolation across the discrete boundary
                let fraction = (gVal - (evalLine - 0.5));
                prob += dist[g] * fraction;
            }
        }
        return Math.max(0.001, Math.min(0.999, prob));
    }

    rawOdds(prob) {
        if (prob <= 0 || prob >= 1) return { prob: (prob * 100).toFixed(1) + '%', odds: 'N/A' };
        return { prob: (prob * 100).toFixed(1) + '%', odds: (1 / prob).toFixed(2) };
    }
}
