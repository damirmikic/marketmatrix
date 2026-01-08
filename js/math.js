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
export function correction(x, y, lambda, mu, rho = RHO) {
    if (x === 0 && y === 0) return 1 - (lambda * mu * rho);
    if (x === 0 && y === 1) return 1 + (lambda * rho);
    if (x === 1 && y === 0) return 1 + (mu * rho);
    if (x === 1 && y === 1) return 1 - rho;
    return 1;
}

// Updated to use ZIP by default
export function getScoreProb(x, y, lambda, mu, omega = 0) {
    // We treat Home/Away independent ZIP, sharing same Omega for simplicity or split if needed.
    // Standard approach: Apply Omega to both sides symmetrically or weighted.
    // For this implementation: We apply the same Omega to both Home and Away distributions.

    let base = zipPoisson(x, lambda, omega) * zipPoisson(y, mu, omega);
    let adj = correction(x, y, lambda, mu, RHO);
    return base * adj;
}


// Matrix Calculation
export function calculateMatrix(lambda, mu, omega = 0) {
    let matrix = [];
    let sum = 0;
    // Increase check range to 20 to capture tails
    const limit = 20;

    for (let x = 0; x <= limit; x++) {
        matrix[x] = [];
        for (let y = 0; y <= limit; y++) {
            let p = getScoreProb(x, y, lambda, mu, omega);
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
export function solveParameters(targetHomeWin, targetOverProb, targetLine, targetDrawProb) {
    let lambda = 1.4;
    let mu = 1.0;
    let lr = 0.1;
    let maxIter = 500;

    // Calculate Omega once based on target draw probability
    const omega = calculateDynamicOmega(targetDrawProb);

    for (let i = 0; i < maxIter; i++) {
        let probs = calculateMatrix(lambda, mu, omega);

        let currHome = 0;
        let currOver = 0;

        for (let x = 0; x <= 20; x++) {
            for (let y = 0; y <= 20; y++) {
                let p = probs[x][y];
                if (x > y) currHome += p;
                if (x + y > targetLine) currOver += p;
            }
        }

        let errHome = targetHomeWin - currHome;
        let errOver = targetOverProb - currOver;

        if (Math.abs(errHome) < 0.0001 && Math.abs(errOver) < 0.0001) break;

        lambda += lr * (errHome + 0.5 * errOver);
        mu += lr * (-errHome + 0.5 * errOver);

        if (lambda < 0.01) lambda = 0.01;
        if (mu < 0.01) mu = 0.01;
    }

    return { lambda, mu, omega };
}
