// js/core/math_utils.js
// Core mathematical utility functions used across all sports models

/**
 * Factorial function with caching for performance
 * Used in Poisson distributions and other statistical calculations
 */
const factCache = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];
export function factorial(n) {
    if (n < 0) return 1;
    if (n < factCache.length) return factCache[n];
    return n * factorial(n - 1);
}

/**
 * Shin's Method for removing bookmaker margin (vig)
 * Returns fair probabilities from biased odds using iterative solving
 * @param {number[]} oddsArr - Array of decimal odds
 * @returns {number[]} Array of fair probabilities that sum to 1
 */
export function solveShin(oddsArr) {
    const sumImplied = oddsArr.reduce((sum, o) => sum + (1 / o), 0);
    const m = sumImplied - 1;

    if (m <= 0) return oddsArr.map(o => 1 / o);

    let z = 0.01;
    for (let i = 0; i < 50; i++) {
        let sumProb = oddsArr.reduce((sum, o) => {
            const pImplied = 1 / o;
            const p = (Math.sqrt(z ** 2 + 4 * (1 - z) * (pImplied ** 2 / sumImplied)) - z) / (2 * (1 - z));
            return sum + p;
        }, 0);

        if (Math.abs(sumProb - 1) < 1e-7) break;
        z += (sumProb - 1) * 0.5;
        if (z < 0) z = 0;
        if (z > 1) z = 0.99;
    }

    return oddsArr.map(o => {
        const pImplied = 1 / o;
        return (Math.sqrt(z ** 2 + 4 * (1 - z) * (pImplied ** 2 / sumImplied)) - z) / (2 * (1 - z));
    });
}

/**
 * Convert probability to decimal odds
 * @param {number} p - Probability (0 to 1)
 * @returns {string} Decimal odds formatted to 2 decimal places
 */
export function probToOdds(p) {
    return p > 0 ? (1 / p).toFixed(2) : "∞";
}
