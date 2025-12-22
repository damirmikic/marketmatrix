// js/math.js

// Factorial cache
const factCache = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];
export function factorial(n) {
    if (n < 0) return 1;
    if (n < factCache.length) return factCache[n];
    return n * factorial(n - 1);
}

// Standard Poisson
export function poisson(k, lambda) {
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
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

export function getScoreProb(x, y, lambda, mu) {
    let base = poisson(x, lambda) * poisson(y, mu);
    let adj = correction(x, y, lambda, mu, RHO);
    return base * adj;
}

// Shin's Method
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

// Matrix Calculation
export function calculateMatrix(lambda, mu) {
    let matrix = [];
    for (let x = 0; x <= 10; x++) {
        matrix[x] = [];
        for (let y = 0; y <= 10; y++) {
            matrix[x][y] = getScoreProb(x, y, lambda, mu);
        }
    }
    return matrix;
}

// Solver
export function solveParameters(targetHomeWin, targetOverProb, targetLine) {
    let lambda = 1.4; 
    let mu = 1.0;     
    let lr = 0.1;     
    let maxIter = 500;

    for (let i = 0; i < maxIter; i++) {
        let probs = calculateMatrix(lambda, mu);

        let currHome = 0;
        let currOver = 0;

        for (let x = 0; x <= 10; x++) {
            for (let y = 0; y <= 10; y++) {
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

    return { lambda, mu };
}

export function probToOdds(p) {
    return p > 0 ? (1 / p).toFixed(2) : "∞";
}
