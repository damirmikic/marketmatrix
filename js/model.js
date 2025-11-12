import {
    MAX_GOALS_CALC,
    RATIO_FIRST_HALF,
    RATIO_SECOND_HALF,
} from './constants.js';
import { createCSMatrix, expectedGoalsFromOdds } from './math.js';
import { clampProbability } from './utils.js';

export function buildModelFromSupremacy(supremacy, expectancy) {
    const HxG_FT = (expectancy - supremacy) / 2;
    const AxG_FT = (expectancy + supremacy) / 2;
    return buildModel(HxG_FT, AxG_FT);
}

export function buildModelFromOdds(overPrice, underPrice, homePrice, awayPrice, goalLine) {
    const solved = expectedGoalsFromOdds(overPrice, underPrice, homePrice, awayPrice, goalLine);
    if (!solved) return null;
    return buildModel(solved.lambdaH, solved.lambdaA);
}

export function buildModel(HxG_FT, AxG_FT) {
    const HxG_1H = HxG_FT * RATIO_FIRST_HALF;
    const AxG_1H = AxG_FT * RATIO_FIRST_HALF;
    const HxG_2H = HxG_FT * RATIO_SECOND_HALF;
    const AxG_2H = AxG_FT * RATIO_SECOND_HALF;

    const matrix1H = createCSMatrix(HxG_1H, AxG_1H, MAX_GOALS_CALC);
    const matrix2H = createCSMatrix(HxG_2H, AxG_2H, MAX_GOALS_CALC);

    return {
        lambdas: { HxG_FT, AxG_FT, HxG_1H, AxG_1H, HxG_2H, AxG_2H },
        matrix1H,
        matrix2H,
    };
}

export function calculateMarket(model, conditions) {
    const normalizedConditions = {
        ft_result: null, ft_total: null, ft_btts: null, ft_cs: null,
        h1_result: null, h1_total: null, h1_btts: null, h1_cs: null,
        h2_result: null, h2_total: null, h2_btts: null, h2_cs: null,
        ...conditions,
    };

    let totalProbability = 0;
    const limit = MAX_GOALS_CALC;

    for (let h1 = 0; h1 <= limit; h1 += 1) {
        for (let a1 = 0; a1 <= limit; a1 += 1) {
            const prob1H = model.matrix1H[h1][a1];
            if (!prob1H) continue;

            for (let h2 = 0; h2 <= limit; h2 += 1) {
                for (let a2 = 0; a2 <= limit; a2 += 1) {
                    const prob2H = model.matrix2H[h2][a2];
                    if (!prob2H) continue;

                    const eventProbability = prob1H * prob2H;
                    if (!eventProbability) continue;

                    if (checkConditions(h1, a1, h2, a2, normalizedConditions)) {
                        totalProbability += eventProbability;
                    }
                }
            }
        }
    }

    return totalProbability;
}

export function calculateAsianHandicap(model, homeHandicap) {
    let homeWin = 0;
    let push = 0;
    let awayWin = 0;
    const limit = MAX_GOALS_CALC;

    for (let h1 = 0; h1 <= limit; h1 += 1) {
        for (let a1 = 0; a1 <= limit; a1 += 1) {
            const prob1H = model.matrix1H[h1][a1];
            if (!prob1H) continue;

            for (let h2 = 0; h2 <= limit; h2 += 1) {
                for (let a2 = 0; a2 <= limit; a2 += 1) {
                    const prob2H = model.matrix2H[h2][a2];
                    if (!prob2H) continue;

                    const ft_h = h1 + h2;
                    const ft_a = a1 + a2;
                    const eventProbability = prob1H * prob2H;
                    const margin = ft_h + homeHandicap - ft_a;

                    if (margin > 0.01) {
                        homeWin += eventProbability;
                    } else if (margin < -0.01) {
                        awayWin += eventProbability;
                    } else {
                        push += eventProbability;
                    }
                }
            }
        }
    }

    return { homeWin, push, awayWin };
}

export function calculateHalfHandicap(homeHandicap, matrix) {
    let homeWin = 0;
    let push = 0;
    let awayWin = 0;

    for (let h = 0; h <= MAX_GOALS_CALC; h += 1) {
        for (let a = 0; a <= MAX_GOALS_CALC; a += 1) {
            const prob = matrix[h][a];
            if (!prob) continue;

            const margin = h + homeHandicap - a;
            if (margin > 0.01) {
                homeWin += prob;
            } else if (margin < -0.01) {
                awayWin += prob;
            } else {
                push += prob;
            }
        }
    }

    return { homeWin, push, awayWin };
}

export function computeHalfAggregates(matrix) {
    const teamGoals = new Array(MAX_GOALS_CALC + 1).fill(0);
    const opponentGoals = new Array(MAX_GOALS_CALC + 1).fill(0);
    const totals = new Array(MAX_GOALS_CALC * 2 + 1).fill(0);
    let btts = 0;

    for (let h = 0; h <= MAX_GOALS_CALC; h += 1) {
        for (let a = 0; a <= MAX_GOALS_CALC; a += 1) {
            const prob = matrix[h][a];
            if (!prob) continue;

            teamGoals[h] += prob;
            opponentGoals[a] += prob;
            totals[h + a] += prob;
            if (h > 0 && a > 0) {
                btts += prob;
            }
        }
    }

    return {
        homeGoals: teamGoals,
        awayGoals: opponentGoals,
        totalGoals: totals,
        btts: clampProbability(btts),
    };
}

export function computeGoalAggregates(model) {
    const homeGoals = new Array(MAX_GOALS_CALC * 2 + 1).fill(0);
    const awayGoals = new Array(MAX_GOALS_CALC * 2 + 1).fill(0);
    const totalGoals = new Array(MAX_GOALS_CALC * 4 + 1).fill(0);

    let homeBothHalves = 0;
    let awayBothHalves = 0;
    let bothHalvesOver15 = 0;
    let bothHalvesUnder15 = 0;
    let half1Higher = 0;
    let half2Higher = 0;
    let halvesEqual = 0;

    for (let h1 = 0; h1 <= MAX_GOALS_CALC; h1 += 1) {
        for (let a1 = 0; a1 <= MAX_GOALS_CALC; a1 += 1) {
            const prob1 = model.matrix1H[h1][a1];
            if (!prob1) continue;

            for (let h2 = 0; h2 <= MAX_GOALS_CALC; h2 += 1) {
                for (let a2 = 0; a2 <= MAX_GOALS_CALC; a2 += 1) {
                    const prob2 = model.matrix2H[h2][a2];
                    if (!prob2) continue;

                    const prob = prob1 * prob2;
                    if (!prob) continue;

                    const ftH = h1 + h2;
                    const ftA = a1 + a2;
                    const total = ftH + ftA;
                    const half1Total = h1 + a1;
                    const half2Total = h2 + a2;

                    homeGoals[ftH] += prob;
                    awayGoals[ftA] += prob;
                    totalGoals[total] += prob;

                    if (h1 > 0 && h2 > 0) homeBothHalves += prob;
                    if (a1 > 0 && a2 > 0) awayBothHalves += prob;
                    if (half1Total >= 2 && half2Total >= 2) bothHalvesOver15 += prob;
                    if (half1Total <= 1 && half2Total <= 1) bothHalvesUnder15 += prob;

                    if (half1Total > half2Total) {
                        half1Higher += prob;
                    } else if (half2Total > half1Total) {
                        half2Higher += prob;
                    } else {
                        halvesEqual += prob;
                    }
                }
            }
        }
    }

    return {
        homeGoals,
        awayGoals,
        totalGoals,
        homeBothHalves: clampProbability(homeBothHalves),
        awayBothHalves: clampProbability(awayBothHalves),
        bothHalvesOver15: clampProbability(bothHalvesOver15),
        bothHalvesUnder15: clampProbability(bothHalvesUnder15),
        half1Higher: clampProbability(half1Higher),
        half2Higher: clampProbability(half2Higher),
        halvesEqual: clampProbability(halvesEqual),
    };
}

function checkConditions(h1, a1, h2, a2, conditions) {
    if (conditions.h1_result) {
        if (conditions.h1_result === '1' && !(h1 > a1)) return false;
        if (conditions.h1_result === 'X' && !(h1 === a1)) return false;
        if (conditions.h1_result === '2' && !(h1 < a1)) return false;
        if (conditions.h1_result === '1X' && !(h1 >= a1)) return false;
        if (conditions.h1_result === '12' && !(h1 !== a1)) return false;
        if (conditions.h1_result === 'X2' && !(h1 <= a1)) return false;
    }
    if (conditions.h1_total) {
        const total = h1 + a1;
        const { type, value } = conditions.h1_total;
        if (type === 'o' && !(total > value)) return false;
        if (type === 'u' && !(total < value)) return false;
        if (type === '=' && !(total === value)) return false;
    }
    if (conditions.h1_btts !== null) {
        const btts = h1 > 0 && a1 > 0;
        if (conditions.h1_btts !== btts) return false;
    }
    if (conditions.h1_cs) {
        if (conditions.h1_cs.h !== h1 || conditions.h1_cs.a !== a1) return false;
    }

    if (conditions.h2_result) {
        if (conditions.h2_result === '1' && !(h2 > a2)) return false;
        if (conditions.h2_result === 'X' && !(h2 === a2)) return false;
        if (conditions.h2_result === '2' && !(h2 < a2)) return false;
        if (conditions.h2_result === '1X' && !(h2 >= a2)) return false;
        if (conditions.h2_result === '12' && !(h2 !== a2)) return false;
        if (conditions.h2_result === 'X2' && !(h2 <= a2)) return false;
    }
    if (conditions.h2_total) {
        const total = h2 + a2;
        const { type, value } = conditions.h2_total;
        if (type === 'o' && !(total > value)) return false;
        if (type === 'u' && !(total < value)) return false;
        if (type === '=' && !(total === value)) return false;
    }

    const ft_h = h1 + h2;
    const ft_a = a1 + a2;

    if (conditions.ft_result) {
        if (conditions.ft_result === '1' && !(ft_h > ft_a)) return false;
        if (conditions.ft_result === 'X' && !(ft_h === ft_a)) return false;
        if (conditions.ft_result === '2' && !(ft_h < ft_a)) return false;
        if (conditions.ft_result === '1X' && !(ft_h >= ft_a)) return false;
        if (conditions.ft_result === '12' && !(ft_h !== ft_a)) return false;
        if (conditions.ft_result === 'X2' && !(ft_h <= ft_a)) return false;
    }
    if (conditions.ft_total) {
        const total = ft_h + ft_a;
        const { type, value } = conditions.ft_total;
        if (type === 'o' && !(total > value)) return false;
        if (type === 'u' && !(total < value)) return false;
        if (type === '=' && !(total === value)) return false;
    }
    if (conditions.ft_btts !== null) {
        const btts = ft_h > 0 && ft_a > 0;
        if (conditions.ft_btts !== btts) return false;
    }
    if (conditions.ft_cs) {
        if (conditions.ft_cs.h !== ft_h || conditions.ft_cs.a !== ft_a) return false;
    }

    return true;
}
