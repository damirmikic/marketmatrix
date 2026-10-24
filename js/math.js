// js/math.js

import { factorial, solveShin, probToOdds } from './core/math_utils.js';

// Re-export core utilities for backwards compatibility
export { factorial, solveShin, probToOdds };

// Zero-Inflated Poisson (ZIP)
export function zipPoisson(k, lambda, omega) {
    if (k === 0) {
        return omega + (1 - omega) * Math.exp(-lambda);
    } else {
        return (1 - omega) * ((Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k));
    }
}

// Dixon-Coles Factor
const RHO = -0.13;

// Dynamic Dixon-Coles Correlation
// Adjusts rho based on expected total goals to better model low/high-scoring games
export function calculateDynamicRho(lambda, mu) {
    const total = lambda + mu;
    // Linear interpolation between bounds
    if (total <= 1.5) return -0.18;
    if (total >= 4.0) return -0.05;
    // Slope m = (-0.05 - (-0.18)) / (4.0 - 1.5) = 0.13 / 2.5 = 0.052
    return -0.18 + (total - 1.5) * 0.052;
}

export function correction(x, y, lambda, mu, rho = RHO) {
    if (x === 0 && y === 0) return 1 - (lambda * mu * rho);
    if (x === 0 && y === 1) return 1 + (lambda * rho);
    if (x === 1 && y === 0) return 1 + (mu * rho);
    if (x === 1 && y === 1) return 1 - rho;
    return 1;
}

// Updated to use ZIP and dynamic Dixon-Coles by default
export function getScoreProb(x, y, lambda, mu, omega = 0, diagInflation = 0) {
    // We treat Home/Away independent ZIP, sharing same Omega for simplicity or split if needed.
    // Standard approach: Apply Omega to both sides symmetrically or weighted.
    // For this implementation: We apply the same Omega to both Home and Away distributions.

    let base = zipPoisson(x, lambda, omega) * zipPoisson(y, mu, omega);
    // Use dynamic rho based on expected goals
    const rho = calculateDynamicRho(lambda, mu);
    let adj = correction(x, y, lambda, mu, rho);
    // Draw lever: scales scorelines with x === y (fitted so the model's draw price matches the market)
    if (x === y) adj *= (1 + diagInflation);
    return base * adj;
}


// Matrix Calculation
export function calculateMatrix(lambda, mu, omega = 0, diagInflation = 0) {
    let matrix = [];
    let sum = 0;
    // Increase check range to 20 to capture tails
    const limit = 20;

    for (let x = 0; x <= limit; x++) {
        matrix[x] = [];
        for (let y = 0; y <= limit; y++) {
            let p = getScoreProb(x, y, lambda, mu, omega, diagInflation);
            matrix[x][y] = p;
            sum += p;
        }
    }

    // Normalize
    if (sum > 0) {
        for (let x = 0; x <= limit; x++) {
            for (let y = 0; y <= limit; y++) {
                matrix[x][y] /= sum;
            }
        }
    }
    return matrix;
}

// Helper to calculate Omega from Draw Probability
export function calculateDynamicOmega(probDraw) {
    // Linear interpolation:
    // P(Draw) = 0.20 -> Omega = 0.00
    // P(Draw) = 0.35 -> Omega = 0.15
    if (probDraw <= 0.20) return 0;
    if (probDraw >= 0.35) return 0.20;
    return (probDraw - 0.20) * (0.20 / 0.15);
}

// Half-time structure
// Full time is built from the two halves, so every market (1X2, totals, HT/FT, half combos)
// comes from one joint model: FT = FH (x) SH, with the halves independent.
const HALF_GOALS = 12;   // per-half goals tracked in the convolution (tail beyond is negligible)

function normalisedShares(ratio1H, ratio2H) {
    const total = ratio1H + ratio2H;
    return { r1: ratio1H / total, r2: ratio2H / total };
}

// Distribution of the sum of two independent half scores
export function convolveMatrices(matrixFH, matrixSH, limit = 20) {
    const ft = [];
    for (let x = 0; x <= limit; x++) ft[x] = new Array(limit + 1).fill(0);
    let sum = 0;
    for (let h1 = 0; h1 <= HALF_GOALS; h1++) {
        for (let a1 = 0; a1 <= HALF_GOALS; a1++) {
            const p1 = matrixFH[h1][a1];
            if (p1 < 1e-14) continue;
            for (let h2 = 0; h2 <= HALF_GOALS; h2++) {
                if (h1 + h2 > limit) break;
                for (let a2 = 0; a2 <= HALF_GOALS; a2++) {
                    if (a1 + a2 > limit) break;
                    const p = p1 * matrixSH[h2][a2];
                    ft[h1 + h2][a1 + a2] += p;
                    sum += p;
                }
            }
        }
    }
    for (let x = 0; x <= limit; x++) for (let y = 0; y <= limit; y++) ft[x][y] /= sum;
    return ft;
}

// Half parameters -> matrices ({ fh, sh } each { lambda, mu, omega, diag })
export function matricesFromHalves(halves) {
    const m = h => calculateMatrix(h.lambda, h.mu, h.omega, h.diag);
    return { matrixFH: m(halves.fh), matrixSH: m(halves.sh) };
}

// Solver
// Fits lambda, mu and a draw lever so the model reproduces three targets exactly:
// P(home win), P(draw), P(over line). The draw is matched by a diagonal term, which moves the
// draw price without distorting the goal distribution the way a large zero-inflation would.
const DIAG_RANGE = [-0.95, 8.0];

function outcomeStats(m, line) {
    let home = 0, draw = 0, over = 0;
    for (let x = 0; x <= 20; x++) {
        for (let y = 0; y <= 20; y++) {
            const p = m[x][y];
            if (x > y) home += p;
            else if (x === y) draw += p;
            if (x + y > line) over += p;
        }
    }
    return { home, draw, over };
}

// Solve a 2x2 system J * d = r
function solve2(J, r) {
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    if (Math.abs(det) < 1e-14) return null;
    return [
        (r[0] * J[1][1] - J[0][1] * r[1]) / det,
        (J[0][0] * r[1] - r[0] * J[1][0]) / det
    ];
}

// Damped Newton on (lambda, mu) matching home win and over probability; `stats(l, m)` evaluates the model
function fitLambdaMu(start, stats, targets) {
    let x = [...start];
    const resid = v => {
        const s = stats(v[0], v[1]);
        return [targets.home - s.home, targets.over - s.over];
    };
    const norm = r => Math.max(Math.abs(r[0]), Math.abs(r[1]));
    let r = resid(x);

    for (let it = 0; it < 40 && norm(r) > 1e-7; it++) {
        const h = 1e-5;
        const J = [[0, 0], [0, 0]];
        for (let c = 0; c < 2; c++) {
            const xp = [...x]; xp[c] += h;
            const rp = resid(xp);
            J[0][c] = (rp[0] - r[0]) / h;
            J[1][c] = (rp[1] - r[1]) / h;
        }
        const d = solve2(J, [-r[0], -r[1]]);
        if (!d) break;

        let step = 1, moved = false;
        for (let k = 0; k < 12; k++) {
            const xn = [
                Math.min(8, Math.max(0.02, x[0] + step * d[0])),
                Math.min(8, Math.max(0.02, x[1] + step * d[1]))
            ];
            const rn = resid(xn);
            if (norm(rn) < norm(r)) { x = xn; r = rn; moved = true; break; }
            step /= 2;
        }
        if (!moved) break;
    }
    return { x, err: norm(r) };
}

// For each lever value, (lambda, mu) are fixed by home win + over; the draw then moves
// monotonically with the lever, so bisect the lever on the draw residual.
// `makeStats(lever)` returns the stats(l, m) function for that lever value.
function fitWithDrawLever(makeStats, targets, guess) {
    const fitAt = lever => {
        const stats = makeStats(lever);
        const fit = fitLambdaMu(guess, stats, targets);
        guess = fit.x;
        return { fit, lever, draw: stats(fit.x[0], fit.x[1]).draw };
    };

    let lo = DIAG_RANGE[0], hi = DIAG_RANGE[1];
    let best = fitAt(0);
    if (Math.abs(best.draw - targets.draw) > 1e-7) {
        const dir = best.draw < targets.draw ? 1 : -1;
        if (dir > 0) lo = 0; else hi = 0;
        const edge = fitAt(dir > 0 ? hi : lo);
        if ((edge.draw - targets.draw) * dir >= 0) {
            for (let i = 0; i < 45 && hi - lo > 1e-7; i++) {
                const mid = fitAt(0.5 * (lo + hi));
                best = mid;
                if (Math.abs(mid.draw - targets.draw) < 1e-7) break;
                if (mid.draw < targets.draw) lo = mid.lever; else hi = mid.lever;
            }
        } else {
            best = edge;     // target draw is outside the reachable range: keep the closest
        }
    }
    return { ...best, err: Math.max(best.fit.err, Math.abs(best.draw - targets.draw)) };
}

// Default first-half zero-inflation boost ("feeling out" period) used when the first half is
// not calibrated to market prices
const FH_OMEGA_BOOST = 1.5;

/**
 * Fit the model to full-time targets (home win, over line, draw).
 * firstHalf (optional): { home, draw, over, line } fair first-half probabilities. When given, the
 * first half is fitted to them (own lambda/mu/draw lever) and the second half is then solved so the
 * full-time targets still hold; otherwise the goal split comes from ratio1H / ratio2H.
 */
export function solveParameters(targetHomeWin, targetOverProb, targetLine, targetDrawProb,
                                ratio1H = 0.45, ratio2H = 0.55, firstHalf = null, options = {}) {
    const omega = calculateDynamicOmega(targetDrawProb);
    const { r1, r2 } = normalisedShares(ratio1H, ratio2H);
    const ftTargets = { home: targetHomeWin, draw: targetDrawProb, over: targetOverProb };

    // Rough start: total just above the line, supremacy from the home/away split
    const total0 = Math.max(1.2, targetLine + 0.1);
    const awayWin = 1 - targetHomeWin - targetDrawProb;
    const share0 = Math.min(0.8, Math.max(0.2, 0.5 + (targetHomeWin - awayWin) * 0.25));
    const guess = [total0 * share0, total0 * (1 - share0)];

    let fh, fitError = 0;

    if (firstHalf) {
        // 1. First half fitted to its own market prices
        const omega1 = options.fhOmega !== undefined ? options.fhOmega : 0;
        const fhFit = fitWithDrawLever(
            diag => (l, m) => outcomeStats(calculateMatrix(l, m, omega1, diag), firstHalf.line),
            { home: firstHalf.home, draw: firstHalf.draw, over: firstHalf.over },
            [guess[0] * r1, guess[1] * r1]
        );
        fh = { lambda: fhFit.fit.x[0], mu: fhFit.fit.x[1], omega: omega1, diag: fhFit.lever };
        fitError = Math.max(fitError, fhFit.err);

        // 2. Second half solved so full time reproduces the full-time targets
        const omega2 = omega * r2;
        const matrixFH = calculateMatrix(fh.lambda, fh.mu, fh.omega, fh.diag);
        const shFit = fitWithDrawLever(
            diag => (l, m) => outcomeStats(convolveMatrices(matrixFH, calculateMatrix(l, m, omega2, diag)), targetLine),
            ftTargets,
            [Math.max(0.05, guess[0] - fh.lambda), Math.max(0.05, guess[1] - fh.mu)]
        );
        fitError = Math.max(fitError, shFit.err);
        const sh = { lambda: shFit.fit.x[0], mu: shFit.fit.x[1], omega: omega2, diag: shFit.lever };

        if (fitError > 5e-4) console.warn(`solveParameters: max fit error ${fitError.toFixed(4)}`);
        return {
            lambda: fh.lambda + sh.lambda, mu: fh.mu + sh.mu, omega, diagInflation: sh.diag,
            halves: { fh, sh }, calibratedFirstHalf: true, fitError
        };
    }

    // Uncalibrated: split by ratios, first-half zero-inflation boosted, draw lever in the second half
    const shFit = fitWithDrawLever(
        diag => (l, m) => {
            const fhM = calculateMatrix(l * r1, m * r1, omega * FH_OMEGA_BOOST);
            const shM = calculateMatrix(l * r2, m * r2, omega * r2, diag);
            return outcomeStats(convolveMatrices(fhM, shM), targetLine);
        },
        ftTargets, guess
    );
    fitError = shFit.err;
    if (fitError > 5e-4) {
        console.warn(`solveParameters: max fit error ${fitError.toFixed(4)} (draw price is outside the model's range)`);
    }
    const [l, m] = shFit.fit.x;
    return {
        lambda: l, mu: m, omega, diagInflation: shFit.lever,
        halves: {
            fh: { lambda: l * r1, mu: m * r1, omega: omega * FH_OMEGA_BOOST, diag: 0 },
            sh: { lambda: l * r2, mu: m * r2, omega: omega * r2, diag: shFit.lever }
        },
        calibratedFirstHalf: false, fitError
    };
}
