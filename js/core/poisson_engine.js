// Shared Poisson engine for low-scoring sports (futsal, bandy, etc.)
// Instantiate via a subclass that passes sport-specific constants to super().

import { factorial } from './math_utils.js';

export class PoissonEngine {
    /**
     * @param {object} config
     * @param {number} config.maxGoals              - Matrix truncation ceiling
     * @param {number} config.lambdaMin             - Solver lower bound
     * @param {number} config.lambdaMax             - Solver upper bound
     * @param {number} config.defaultTotalLine      - Fallback O/U line
     * @param {number[]} config.handicapLines       - AH lines to publish
     * @param {number} config.exactGoalsMax         - Last individual bucket (e.g. 8 → "9+")
     * @param {number} config.htMatrixMaxGoals      - maxGoals for half-time matrix
     * @param {number} config.halfHandicapRange     - AH search radius for HT market
     * @param {boolean} config.halfTeamTotalsMultiple - true = ±1 lines, false = central only
     * @param {Array<{label:string,min:number,max:number}>} config.goalRanges
     */
    constructor(config) {
        this.MAX_GOALS = config.maxGoals;
        this.LAMBDA_MIN = config.lambdaMin;
        this.LAMBDA_MAX = config.lambdaMax;
        this.DEFAULT_TOTAL_LINE = config.defaultTotalLine;
        this.HANDICAP_LINES = config.handicapLines;
        this.EXACT_GOALS_MAX = config.exactGoalsMax;
        this.HT_MATRIX_MAX_GOALS = config.htMatrixMaxGoals;
        this.HALF_HANDICAP_RANGE = config.halfHandicapRange;
        this.HALF_TEAM_TOTALS_MULTIPLE = config.halfTeamTotalsMultiple;
        this.GOAL_RANGES = config.goalRanges;
        this.SOLVER_MAX_ITERATIONS = 1000;
        this.SOLVER_THRESHOLD = 0.0001;
    }

    // ─── Statistical core ────────────────────────────────────────────────────

    poissonPMF(k, lambda) {
        if (lambda <= 0) return k === 0 ? 1 : 0;
        if (k < 0) return 0;
        return Math.exp(k * Math.log(lambda) - lambda - Math.log(factorial(k)));
    }

    generateMatrix(lambdaHome, lambdaAway, maxGoals = this.MAX_GOALS) {
        const matrix = [];
        let totalProb = 0;

        for (let h = 0; h <= maxGoals; h++) {
            matrix[h] = [];
            for (let a = 0; a <= maxGoals; a++) {
                matrix[h][a] = this.poissonPMF(h, lambdaHome) * this.poissonPMF(a, lambdaAway);
                totalProb += matrix[h][a];
            }
        }

        if (totalProb > 0 && Math.abs(totalProb - 1.0) > 0.001) {
            for (let h = 0; h <= maxGoals; h++)
                for (let a = 0; a <= maxGoals; a++)
                    matrix[h][a] /= totalProb;
        }

        return matrix;
    }

    // ─── Vig removal ─────────────────────────────────────────────────────────

    removeVig2Way(odds1, odds2) {
        const p = [1 / odds1, 1 / odds2];
        const t = p[0] + p[1];
        return p.map(x => x / t);
    }

    removeVig3Way(odds1, oddsX, odds2) {
        const p = [1 / odds1, 1 / oddsX, 1 / odds2];
        const t = p.reduce((a, b) => a + b, 0);
        return p.map(x => x / t);
    }

    // ─── Matrix market calculations ──────────────────────────────────────────

    calc1X2FromMatrix(matrix) {
        let homeWin = 0, draw = 0, awayWin = 0;
        const n = matrix.length - 1;
        for (let h = 0; h <= n; h++)
            for (let a = 0; a <= n; a++) {
                if (h > a) homeWin += matrix[h][a];
                else if (h === a) draw += matrix[h][a];
                else awayWin += matrix[h][a];
            }
        return { homeWin, draw, awayWin };
    }

    calcTotalFromMatrix(matrix, line) {
        let over = 0;
        const n = matrix.length - 1;
        for (let h = 0; h <= n; h++)
            for (let a = 0; a <= n; a++)
                if (h + a > line) over += matrix[h][a];
        return { over, under: 1 - over };
    }

    calcHandicap(matrix, line) {
        let homeCovers = 0;
        const n = matrix.length - 1;
        for (let h = 0; h <= n; h++)
            for (let a = 0; a <= n; a++)
                if (h + line > a) homeCovers += matrix[h][a];
        return { homeCovers, awayCovers: 1 - homeCovers };
    }

    calcBTTS(matrix) {
        let bttsYes = 0;
        const n = matrix.length - 1;
        for (let h = 1; h <= n; h++)
            for (let a = 1; a <= n; a++)
                bttsYes += matrix[h][a];
        return { yes: bttsYes, no: 1 - bttsYes };
    }

    calcTeamTotal(matrix, line, isHome) {
        let over = 0;
        const n = matrix.length - 1;
        for (let h = 0; h <= n; h++)
            for (let a = 0; a <= n; a++)
                if ((isHome ? h : a) > line) over += matrix[h][a];
        return { over, under: 1 - over };
    }

    calcExactGoals(matrix, goals) {
        let prob = 0;
        const n = matrix.length - 1;
        for (let h = 0; h <= n; h++)
            for (let a = 0; a <= n; a++)
                if (h + a === goals) prob += matrix[h][a];
        return prob;
    }

    // ─── Lambda solver ────────────────────────────────────────────────────────

    solveLambdas(targetHomeWin, targetDraw, targetOver = null, totalLine = this.DEFAULT_TOTAL_LINE) {
        let lambdaHome = totalLine / 2;
        let lambdaAway = totalLine / 2;
        let learningRate = 0.05;
        const hasTotal = targetOver !== null;

        for (let iter = 0; iter < this.SOLVER_MAX_ITERATIONS; iter++) {
            const matrix = this.generateMatrix(lambdaHome, lambdaAway);
            const model1X2 = this.calc1X2FromMatrix(matrix);

            const errorHomeWin = targetHomeWin - model1X2.homeWin;
            const errorDraw = targetDraw - model1X2.draw;
            let totalError = Math.abs(errorHomeWin) + Math.abs(errorDraw);
            let totalAdjustment = 0;

            if (hasTotal) {
                const errorOver = targetOver - this.calcTotalFromMatrix(matrix, totalLine).over;
                totalError += Math.abs(errorOver);
                totalAdjustment = errorOver * learningRate;
            }

            if (totalError < this.SOLVER_THRESHOLD) break;

            const homeAdjustment = errorHomeWin * learningRate * 2;
            lambdaHome = Math.max(this.LAMBDA_MIN, Math.min(this.LAMBDA_MAX, lambdaHome + homeAdjustment + totalAdjustment));
            lambdaAway = Math.max(this.LAMBDA_MIN, Math.min(this.LAMBDA_MAX, lambdaAway - homeAdjustment * 0.5 + totalAdjustment));
            learningRate *= 0.995;
        }

        return { lambdaHome, lambdaAway };
    }

    // ─── Market generators ────────────────────────────────────────────────────

    generateAllMarkets(inputs) {
        const { homeOdds, drawOdds, awayOdds, overOdds, underOdds } = inputs;
        const totalLine = inputs.totalLine ?? this.DEFAULT_TOTAL_LINE;

        const fair1X2 = this.removeVig3Way(homeOdds, drawOdds, awayOdds);
        const targetOver = (overOdds && underOdds) ? this.removeVig2Way(overOdds, underOdds)[0] : null;
        const lambdas = this.solveLambdas(fair1X2[0], fair1X2[1], targetOver, totalLine);

        const matrixFT = this.generateMatrix(lambdas.lambdaHome, lambdas.lambdaAway);
        const matrixHT = this.generateMatrix(lambdas.lambdaHome * 0.5, lambdas.lambdaAway * 0.5, this.HT_MATRIX_MAX_GOALS);

        return {
            lambdas,
            expectedTotal: lambdas.lambdaHome + lambdas.lambdaAway,
            matchWinner: this.calc1X2FromMatrix(matrixFT),
            handicaps: this.generateHandicapMarkets(matrixFT),
            totals: this.generateTotalGoalsMarkets(matrixFT, totalLine),
            firstHalf: this.generateHalfMarkets(lambdas.lambdaHome * 0.5, lambdas.lambdaAway * 0.5, 'First Half', totalLine),
            htft: this.generateHTFT(matrixHT, matrixFT),
            btts: this.calcBTTS(matrixFT),
            doubleChance: this.generateDoubleChance(matrixFT),
            drawNoBet: this.generateDrawNoBet(matrixFT),
            teamTotals: this.generateTeamTotals(matrixFT, lambdas.lambdaHome, lambdas.lambdaAway),
            exactGoals: this.generateExactGoals(matrixFT),
            comboBets: this.generateComboBets(matrixFT, totalLine),
            goalRanges: this.generateGoalRanges(matrixFT)
        };
    }

    generateHandicapMarkets(matrix) {
        return this.HANDICAP_LINES.map(line => ({
            line,
            homeCovers: this.calcHandicap(matrix, line).homeCovers,
            awayCovers: this.calcHandicap(matrix, line).awayCovers
        }));
    }

    generateTotalGoalsMarkets(matrix, centralLine) {
        return [centralLine - 2, centralLine - 1, centralLine, centralLine + 1, centralLine + 2].map(line => ({
            line,
            ...this.calcTotalFromMatrix(matrix, line)
        }));
    }

    generateHalfMarkets(lambdaHome, lambdaAway, name, totalLine) {
        const matrix = this.generateMatrix(lambdaHome, lambdaAway, this.HT_MATRIX_MAX_GOALS);
        const result1X2 = this.calc1X2FromMatrix(matrix);
        const btts = this.calcBTTS(matrix);

        const halfCentral = Math.floor(totalLine / 2) + 0.5;
        const totals = [halfCentral - 1, halfCentral, halfCentral + 1]
            .filter(l => l >= 0.5)
            .map(l => ({ line: l, ...this.calcTotalFromMatrix(matrix, l) }));

        const homeCentral = Math.max(0.5, Math.round(lambdaHome - 0.5) + 0.5);
        const awayCentral = Math.max(0.5, Math.round(lambdaAway - 0.5) + 0.5);
        const teamTotals = { home: [], away: [] };

        if (this.HALF_TEAM_TOTALS_MULTIPLE) {
            [homeCentral - 1, homeCentral, homeCentral + 1].filter(l => l >= 0.5).forEach(l => {
                teamTotals.home.push({ line: l, ...this.calcTeamTotal(matrix, l, true) });
            });
            [awayCentral - 1, awayCentral, awayCentral + 1].filter(l => l >= 0.5).forEach(l => {
                teamTotals.away.push({ line: l, ...this.calcTeamTotal(matrix, l, false) });
            });
        } else {
            teamTotals.home.push({ line: homeCentral, ...this.calcTeamTotal(matrix, homeCentral, true) });
            teamTotals.away.push({ line: awayCentral, ...this.calcTeamTotal(matrix, awayCentral, false) });
        }

        let bestHandicapLine = 0, bestDiff = 1.0;
        for (let l = -this.HALF_HANDICAP_RANGE; l <= this.HALF_HANDICAP_RANGE; l += 0.5) {
            const diff = Math.abs(this.calcHandicap(matrix, l).homeCovers - 0.5);
            if (diff < bestDiff) { bestDiff = diff; bestHandicapLine = l; }
        }
        const handicap = this.calcHandicap(matrix, bestHandicapLine);

        const dnb = {
            home: result1X2.homeWin / (1 - result1X2.draw),
            away: result1X2.awayWin / (1 - result1X2.draw)
        };

        return { name, winner: result1X2, totals, btts, dnb, teamTotals, handicap: { line: bestHandicapLine, homeCovers: handicap.homeCovers, awayCovers: handicap.awayCovers } };
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
        const { homeWin, draw, awayWin } = this.calc1X2FromMatrix(matrix);
        return { homeOrDraw: homeWin + draw, homeOrAway: homeWin + awayWin, drawOrAway: draw + awayWin };
    }

    generateDrawNoBet(matrix) {
        const { homeWin, draw, awayWin } = this.calc1X2FromMatrix(matrix);
        return { home: homeWin / (1 - draw), away: awayWin / (1 - draw) };
    }

    generateTeamTotals(matrix, lambdaHome, lambdaAway) {
        const homeCentral = Math.max(0.5, Math.round(lambdaHome - 0.5) + 0.5);
        const awayCentral = Math.max(0.5, Math.round(lambdaAway - 0.5) + 0.5);
        const home = [homeCentral - 1, homeCentral, homeCentral + 1]
            .filter(l => l >= 0.5)
            .map(l => ({ line: l, ...this.calcTeamTotal(matrix, l, true) }));
        const away = [awayCentral - 1, awayCentral, awayCentral + 1]
            .filter(l => l >= 0.5)
            .map(l => ({ line: l, ...this.calcTeamTotal(matrix, l, false) }));
        return { home, away };
    }

    generateExactGoals(matrix) {
        const goals = [];
        for (let g = 0; g <= this.EXACT_GOALS_MAX; g++) {
            goals.push({ goals: g, probability: this.calcExactGoals(matrix, g) });
        }
        const bucketMin = this.EXACT_GOALS_MAX + 1;
        const n = matrix.length - 1;
        let prob = 0;
        for (let h = 0; h <= n; h++)
            for (let a = 0; a <= n; a++)
                if (h + a >= bucketMin) prob += matrix[h][a];
        goals.push({ goals: `${bucketMin}+`, probability: prob });
        return goals;
    }

    generateComboBets(matrix, totalLine) {
        const comboMap = {
            'Home & Over': 0, 'Home & Under': 0,
            'Draw & Over': 0, 'Draw & Under': 0,
            'Away & Over': 0, 'Away & Under': 0
        };
        const n = matrix.length - 1;
        for (let h = 0; h <= n; h++) {
            for (let a = 0; a <= n; a++) {
                const isOver = h + a > totalLine;
                const key = h > a ? 'Home' : h === a ? 'Draw' : 'Away';
                comboMap[`${key} & ${isOver ? 'Over' : 'Under'}`] += matrix[h][a];
            }
        }
        return Object.entries(comboMap).map(([outcome, probability]) => ({ outcome, probability }));
    }

    generateGoalRanges(matrix) {
        const n = matrix.length - 1;
        return this.GOAL_RANGES.map(({ label, min, max }) => {
            let prob = 0;
            for (let h = 0; h <= n; h++)
                for (let a = 0; a <= n; a++) {
                    const t = h + a;
                    if (t >= min && t <= max) prob += matrix[h][a];
                }
            return { label, probability: prob };
        });
    }
}
