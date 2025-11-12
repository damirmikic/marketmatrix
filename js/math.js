import { MAX_GOALS_CALC } from './constants.js';

const FACTORIALS = (() => {
    const cache = [1];
    for (let i = 1; i <= 60; i += 1) {
        cache[i] = cache[i - 1] * i;
    }
    return cache;
})();

export function poisson(lambda, k) {
    if (lambda < 0 || k < 0) return 0;
    if (k >= FACTORIALS.length) return 0;
    return (lambda ** k * Math.exp(-lambda)) / FACTORIALS[k];
}

export function createCSMatrix(lambdaH, lambdaA, maxGoals = MAX_GOALS_CALC) {
    const matrix = [];
    const poissonH = [];
    const poissonA = [];

    for (let k = 0; k <= maxGoals; k += 1) {
        poissonH[k] = poisson(lambdaH, k);
        poissonA[k] = poisson(lambdaA, k);
    }

    for (let h = 0; h <= maxGoals; h += 1) {
        matrix[h] = [];
        for (let a = 0; a <= maxGoals; a += 1) {
            matrix[h][a] = poissonH[h] * poissonA[a];
        }
    }

    return matrix;
}

export function homeAndUnderProbs(lambdaH, lambdaA, goalLine) {
    const limit = 20;
    const poissonH = [];
    const poissonA = [];

    for (let i = 0; i <= limit; i += 1) {
        poissonH[i] = poisson(lambdaH, i);
        poissonA[i] = poisson(lambdaA, i);
    }

    let home = 0;
    let away = 0;
    let under = 0;
    let over = 0;

    for (let i = 0; i <= limit; i += 1) {
        for (let j = 0; j <= limit; j += 1) {
            const prob = poissonH[i] * poissonA[j];
            if (!prob) continue;

            if (i > j) {
                home += prob;
            } else if (j > i) {
                away += prob;
            }

            if (i + j < goalLine) {
                under += prob;
            } else if (i + j > goalLine) {
                over += prob;
            }
        }
    }

    const twoWay = home + away;
    const totals = under + over;

    return {
        home: twoWay > 0 ? home / twoWay : 0,
        under: totals > 0 ? under / totals : 0,
    };
}

export function expectedGoalsFromOdds(overPrice, underPrice, homePrice, awayPrice, goalLine) {
    if ([overPrice, underPrice, homePrice, awayPrice].some((v) => !Number.isFinite(v) || v <= 0)) {
        return null;
    }

    const invOver = 1 / overPrice;
    const invUnder = 1 / underPrice;
    const invHome = 1 / homePrice;
    const invAway = 1 / awayPrice;

    const totalsDen = invOver + invUnder;
    const sidesDen = invHome + invAway;

    if (totalsDen <= 0 || sidesDen <= 0) {
        return null;
    }

    const normalizedUnder = invUnder / totalsDen;
    const normalizedHome = invHome / sidesDen;

    let totalGoals = Number.isFinite(goalLine) ? goalLine : 2.5;
    if (totalGoals < 0.01) totalGoals = 0.01;
    let supremacy = 0;

    let homeExpected = totalGoals / 2 + supremacy / 2;
    let awayExpected = totalGoals / 2 - supremacy / 2;

    let output = homeAndUnderProbs(homeExpected, awayExpected, goalLine);
    if (!output) {
        return null;
    }

    let increment = output.under > normalizedUnder ? 0.05 : -0.05;
    if (Math.abs(output.under - normalizedUnder) < 1e-6) {
        increment = 0;
    }

    let error = Math.abs(output.under - normalizedUnder);
    let previousError = 1;
    let guard = 0;

    while (increment !== 0 && error < previousError && guard < 1000) {
        totalGoals = Math.max(0.01, totalGoals + increment);
        homeExpected = totalGoals / 2 + supremacy / 2;
        awayExpected = totalGoals / 2 - supremacy / 2;
        output = homeAndUnderProbs(homeExpected, awayExpected, goalLine);
        previousError = error;
        error = Math.abs(output.under - normalizedUnder);
        guard += 1;
    }

    if (increment !== 0) {
        totalGoals = Math.max(0.01, totalGoals - increment);
        homeExpected = totalGoals / 2 + supremacy / 2;
        awayExpected = totalGoals / 2 - supremacy / 2;
        output = homeAndUnderProbs(homeExpected, awayExpected, goalLine);
    }

    increment = output.home > normalizedHome ? -0.05 : 0.05;
    if (Math.abs(output.home - normalizedHome) < 1e-6) {
        increment = 0;
    }
    error = Math.abs(output.home - normalizedHome);
    previousError = 1;
    guard = 0;

    while (increment !== 0 && error < previousError && guard < 1000) {
        supremacy += increment;
        homeExpected = totalGoals / 2 + supremacy / 2;
        awayExpected = totalGoals / 2 - supremacy / 2;
        output = homeAndUnderProbs(homeExpected, awayExpected, goalLine);
        previousError = error;
        error = Math.abs(output.home - normalizedHome);
        guard += 1;
    }

    if (increment !== 0) {
        supremacy -= increment;
        homeExpected = totalGoals / 2 + supremacy / 2;
        awayExpected = totalGoals / 2 - supremacy / 2;
    }

    return {
        lambdaH: homeExpected,
        lambdaA: awayExpected,
    };
}
