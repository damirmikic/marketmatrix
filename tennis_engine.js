/**
 * Tennis Pricing Engine
 * Core Logic: Shin's Vigorish Removal + Solver + Derivatives (Raw Odds)
 */

export class TennisEngine {
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
    // PHASE 2: THE SOLVER (REVERSE ENGINEERING)
    // ==========================================

    solveParameters(targetPMatch, targetTotalGames, surface = 'Hard') {
        // Surface-dependent modifiers for hold probability
        // Faster surfaces = higher hold rates, slower surfaces = lower hold rates
        const SURFACE_MODIFIERS = {
            'Grass': 1.08,
            'Hard': 1.0,
            'Clay': 0.92
        };

        const surfaceFactor = SURFACE_MODIFIERS[surface] || 1.0;

        // Initialize with surface adjustment
        let pa = (0.60 + (targetPMatch - 0.5) * 0.2) * surfaceFactor;
        let pb = (0.60 - (targetPMatch - 0.5) * 0.2) * surfaceFactor;

        // Constrain to valid probability range
        pa = Math.max(0.40, Math.min(0.99, pa));
        pb = Math.max(0.40, Math.min(0.99, pb));

        let bestPa = pa;
        let bestPb = pb;
        let minError = Infinity;

        for (let i = 0; i < this.MAX_ITERATIONS; i++) {
            const metrics = this.calculateMatchMetrics(pa, pb, surface);

            const errMatch = metrics.pMatch - targetPMatch;
            const errTotal = metrics.expTotal - targetTotalGames;

            if (Math.abs(errMatch) < this.TOLERANCE && Math.abs(errTotal) < 0.2) {
                return { pa, pb, calibration: metrics };
            }

            const gapStep = 0.05 * (targetPMatch - metrics.pMatch);
            pa += gapStep;
            pb -= gapStep;

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

        const finalMetrics = this.calculateMatchMetrics(bestPa, bestPb, surface);
        return { pa: bestPa, pb: bestPb, calibration: finalMetrics };
    }

    calculateMatchMetrics(pa, pb, surface) {
        const p_hold_a = this.probGame(pa);
        const p_hold_b = this.probGame(pb);

        const setProbs = this.runMiniSim(p_hold_a, p_hold_b, pa, pb, 5000);
        const pSetA = setProbs.pSetA;
        const pSetB = setProbs.pSetB;

        const p20 = pSetA * pSetA;
        const p21 = 2 * pSetA * pSetB * pSetA;
        const pMatchA = p20 + p21;

        const p3Sets = 1 - (p20 + pSetB * pSetB);
        const expTotal = setProbs.expGames * (2 + p3Sets);

        return {
            pMatch: pMatchA,
            expTotal: expTotal,
            pSetA,
            pSetB,
            p20, p21,
            expGamesPerSet: setProbs.expGames
        };
    }

    probGame(p) {
        const q = 1 - p;
        const win_no_deuce = Math.pow(p, 4) * (1 + 4 * q + 10 * Math.pow(q, 2));
        const reach_deuce = 20 * Math.pow(p, 3) * Math.pow(q, 3);
        const win_from_deuce = (p * p) / (p * p + q * q);
        return win_no_deuce + reach_deuce * win_from_deuce;
    }

    runMiniSim(pha, phb, pa, pb, iterations) {
        let aSets = 0;
        let totalGames = 0;

        for (let i = 0; i < iterations; i++) {
            let gA = 0, gB = 0;
            let serverA = (i % 2 === 0);

            while (true) {
                let p = serverA ? pha : phb;
                if (Math.random() < p) {
                    if (serverA) gA++; else gB++;
                } else {
                    if (serverA) gB++; else gA++;
                }
                serverA = !serverA;

                if ((gA === 6 && gB <= 4) || (gA === 7 && gB === 5)) { aSets++; break; }
                if ((gB === 6 && gA <= 4) || (gB === 7 && gA === 5)) { break; }

                if (gA === 6 && gB === 6) {
                    let tA = 0, tB = 0;
                    let tbS = serverA;
                    let serveCnt = 0;
                    while (true) {
                        let c = serveCnt % 4;
                        let sA = (c === 0 || c === 3) ? tbS : !tbS;
                        let prob = sA ? pa : pb;
                        if (Math.random() < prob) { if (sA) tA++; else tB++; }
                        else { if (sA) tB++; else tA++; }
                        serveCnt++;

                        if (tA >= 7 && tA - tB >= 2) { gA++; aSets++; break; }
                        if (tB >= 7 && tB - tA >= 2) { gB++; break; }
                    }
                    break;
                }
            }
            totalGames += (gA + gB);
        }

        return {
            pSetA: aSets / iterations,
            pSetB: 1 - (aSets / iterations),
            expGames: totalGames / iterations
        };
    }

    // ==========================================
    // PHASE 3: DERIVATIVE CONSTRUCTION
    // ==========================================

    generateDerivatives(pa, pb, calibration) {
        // 1. Set Betting (Correct Score) - RAW ODDS
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

        // 2. Set Winner (Set 1)
        const setWinner = {
            player1: this.rawOdds(pSetA),
            player2: this.rawOdds(pSetB)
        };

        // 3. Game Handicap (Normal Approximation) - 2-Way Odds
        const simStats = this.runFullSim(pa, pb, 5000);
        const mu = simStats.avgMargin;
        const sigma = simStats.stdMargin;

        const handicaps = {};
        [-5.5, -4.5, -3.5, -2.5, -1.5, 1.5, 2.5, 3.5, 4.5, 5.5].forEach(line => {
            // For handicap 'line' (e.g. -1.5), P1 covers if Margin > -line (e.g. 1.5)
            // No, wait. Spread is "Home - Away".
            // If P1 wins 6-4, 6-4. Margin = +4. 
            // Line -1.5. Result = 4 - 1.5 = 2.5 > 0. Cover.
            // Line +1.5. Result = 4 + 1.5 = 5.5 > 0. Cover.
            // So we need Probability(Margin + Line > 0) -> Prob(Margin > -Line)
            // z = (-line - mu) / sigma

            const z = (-line - mu) / sigma;
            const probP1 = 1 - this.normalCDF(z);
            const probP2 = 1 - probP1;

            handicaps[line] = {
                player1: this.rawOdds(probP1),
                player2: this.rawOdds(probP2)
            };
        });

        // 4. Tie-Break Probabilities
        const pTieBreak = simStats.tieBreakCount / (simStats.totalSets || 1);

        return {
            setBetting: prices,
            setWinner: setWinner,
            gameHandicap: handicaps,
            tieBreakProb: pTieBreak,
            mu,
            sigma
        };
    }

    // ==========================================
    // UTILITIES
    // ==========================================

    rawOdds(prob) {
        if (prob <= 0 || prob >= 1) return { prob: (prob * 100).toFixed(1) + "%", odds: "N/A" };
        return {
            prob: (prob * 100).toFixed(1) + "%",
            odds: (1 / prob).toFixed(2)
        };
    }

    runFullSim(pa, pb, iterations) {
        let totalMargin = 0;
        let marginSq = 0;
        let tieBreaks = 0;
        let totalSets = 0;

        const pha = this.probGame(pa);
        const phb = this.probGame(pb);

        for (let i = 0; i < iterations; i++) {
            let startServerA = Math.random() < 0.5;
            let setsA = 0, setsB = 0;
            let gamesA = 0, gamesB = 0;

            // Set 1
            let s1 = this.simSet(pa, pb, pha, phb, startServerA);
            gamesA += s1.gA; gamesB += s1.gB;
            if (s1.win) setsA++; else setsB++;
            if (s1.tb) tieBreaks++;

            // Set 2
            startServerA = ((s1.gA + s1.gB) % 2 !== 0) ? !startServerA : startServerA;
            let s2 = this.simSet(pa, pb, pha, phb, startServerA);
            gamesA += s2.gA; gamesB += s2.gB;
            if (s2.win) setsA++; else setsB++;
            if (s2.tb) tieBreaks++;

            // Set 3 (if needed)
            if (setsA === 1 && setsB === 1) {
                startServerA = ((s2.gA + s2.gB) % 2 !== 0) ? !startServerA : startServerA;
                let s3 = this.simSet(pa, pb, pha, phb, startServerA);
                gamesA += s3.gA; gamesB += s3.gB;
                if (s3.win) setsA++; else setsB++;
                if (s3.tb) tieBreaks++;
            }

            const margin = gamesA - gamesB;
            totalMargin += margin;
            marginSq += margin * margin;
            totalSets += (setsA + setsB);
        }

        const avgMargin = totalMargin / iterations;
        const variance = (marginSq / iterations) - (avgMargin * avgMargin);

        return {
            avgMargin,
            stdMargin: Math.sqrt(variance),
            tieBreakCount: tieBreaks,
            totalSets: totalSets
        };
    }

    simSet(pa, pb, pha, phb, serverA) {
        let gA = 0, gB = 0;
        while (true) {
            let p = serverA ? pha : phb;
            if (Math.random() < p) {
                if (serverA) gA++; else gB++;
            } else {
                if (serverA) gB++; else gA++;
            }
            serverA = !serverA;

            if ((gA === 6 && gB <= 4) || (gA === 7 && gB === 5)) return { win: true, gA, gB, tb: false };
            if ((gB === 6 && gA <= 4) || (gB === 7 && gA === 5)) return { win: false, gA, gB, tb: false };
            if (gA === 6 && gB === 6) {
                let tA = 0, tB = 0;
                let tbS = serverA;
                let cnt = 0;
                while (true) {
                    let c = cnt % 4; let sA = (c === 0 || c === 3) ? tbS : !tbS;
                    let prob = sA ? pa : pb;
                    if (Math.random() < prob) { if (sA) tA++; else tB++; } else { if (sA) tB++; else tA++; }
                    cnt++;
                    if (tA >= 7 && tA - tB >= 2) return { win: true, gA: gA + 1, gB, tb: true };
                    if (tB >= 7 && tB - tA >= 2) return { win: false, gA, gB: gB + 1, tb: true };
                }
            }
        }
    }

    normalCDF(x) {
        var t = 1 / (1 + .2316419 * Math.abs(x));
        var d = .3989423 * Math.exp(-x * x / 2);
        var prob = d * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
        if (x > 0) prob = 1 - prob;
        return prob;
    }
}
