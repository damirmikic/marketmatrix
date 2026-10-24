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

// Solver
// Fits lambda, mu and a diagonal (draw) inflation so the model reproduces the three targets
// exactly: P(home win), P(draw) and P(over line). Zero-inflation omega stays the draw-price
// heuristic; the draw itself is matched by the diagonal term, which moves the draw price
// without distorting the goal distribution the way a large omega would.
const DIAG_RANGE = [-0.6, 2.0];

function matrixStats(lambda, mu, omega, diag, line) {
    const m = calculateMatrix(lambda, mu, omega, diag);
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

// Damped Newton on (lambda, mu) matching home win and over probability for a fixed omega/diag
function fitLambdaMu(start, omega, diag, targets, line) {
    let x = [...start];
    const resid = v => {
        const s = matrixStats(v[0], v[1], omega, diag, line);
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
                Math.min(8, Math.max(0.05, x[0] + step * d[0])),
                Math.min(8, Math.max(0.05, x[1] + step * d[1]))
            ];
            const rn = resid(xn);
            if (norm(rn) < norm(r)) { x = xn; r = rn; moved = true; break; }
            step /= 2;
        }
        if (!moved) break;
    }
    return { x, err: norm(r) };
}

export function solveParameters(targetHomeWin, targetOverProb, targetLine, targetDrawProb) {
    const targets = { home: targetHomeWin, over: targetOverProb };
    const omega = calculateDynamicOmega(targetDrawProb);

    // Rough start: total just above the line, supremacy from the home/away split
    const total0 = Math.max(1.2, targetLine + 0.1);
    const awayWin = 1 - targetHomeWin - targetDrawProb;
    const share0 = Math.min(0.8, Math.max(0.2, 0.5 + (targetHomeWin - awayWin) * 0.25));
    let guess = [total0 * share0, total0 * (1 - share0)];

    // With home win + over held, the draw rises with the diagonal term: bisect on it.
    const fitAt = diag => {
        const fit = fitLambdaMu(guess, omega, diag, targets, targetLine);
        guess = fit.x;
        return { fit, diag, draw: matrixStats(fit.x[0], fit.x[1], omega, diag, targetLine).draw };
    };

    let lo = DIAG_RANGE[0], hi = DIAG_RANGE[1];
    let best = fitAt(0);
    if (Math.abs(best.draw - targetDrawProb) > 1e-7) {
        const dir = best.draw < targetDrawProb ? 1 : -1;
        if (dir > 0) lo = 0; else hi = 0;
        const edge = fitAt(dir > 0 ? hi : lo);
        if ((edge.draw - targetDrawProb) * dir >= 0) {
            for (let i = 0; i < 45 && hi - lo > 1e-7; i++) {
                const mid = fitAt(0.5 * (lo + hi));
                best = mid;
                if (Math.abs(mid.draw - targetDrawProb) < 1e-7) break;
                if (mid.draw < targetDrawProb) lo = mid.diag; else hi = mid.diag;
            }
        } else {
            best = edge;     // target draw is outside the reachable range: keep the closest
        }
    }

    const fitError = Math.max(best.fit.err, Math.abs(best.draw - targetDrawProb));
    if (fitError > 5e-4) {
        console.warn(`solveParameters: max fit error ${fitError.toFixed(4)} (draw price is outside the model's range)`);
    }

    return { lambda: best.fit.x[0], mu: best.fit.x[1], omega, diagInflation: best.diag, fitError };
}
