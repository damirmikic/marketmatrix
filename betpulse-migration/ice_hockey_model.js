// Ice Hockey Model
// Advanced probability calculations with gradient descent solver

import {
    initIceHockeyLoader,
    handleCountryChange,
    handleLeagueChange,
    handleMatchChange,
    setRunModelCallback
} from './js/ice_hockey_api.js';

import { factorial, probToOdds } from './js/core/math_utils.js';

// --- Statistical Helper Functions ---

// Poisson Probability Mass Function
function poissonPMF(k, lambda) {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    if (k < 0) return 0;

    // Using log-space for numerical stability
    const logProb = k * Math.log(lambda) - lambda - Math.log(factorial(k));
    return Math.exp(logProb);
}

// --- Probability Functions ---

// Remove vig (bookmaker margin) - proportional method
function removeVig(odds) {
    const impliedProbs = odds.map(o => 1 / o);
    const total = impliedProbs.reduce((a, b) => a + b, 0);
    const fairProbs = impliedProbs.map(p => p / total);
    return fairProbs;
}

// --- Matrix Generation ---

function generateMatrix(lambdaHome, lambdaAway, maxGoals = 14) {
    const matrix = [];
    let totalProb = 0;

    // Generate initial matrix
    for (let h = 0; h <= maxGoals; h++) {
        matrix[h] = [];
        for (let a = 0; a <= maxGoals; a++) {
            matrix[h][a] = poissonPMF(h, lambdaHome) * poissonPMF(a, lambdaAway);
            totalProb += matrix[h][a];
        }
    }

    // Normalize to ensure sum = 1.0
    if (totalProb > 0 && Math.abs(totalProb - 1.0) > 0.001) {
        for (let h = 0; h <= maxGoals; h++) {
            for (let a = 0; a <= maxGoals; a++) {
                matrix[h][a] /= totalProb;
            }
        }
    }

    return matrix;
}

// --- Market Calculations from Matrix ---

function calc1X2FromMatrix(matrix) {
    let homeWin = 0, draw = 0, awayWin = 0;
    const maxGoals = matrix.length - 1;

    for (let h = 0; h <= maxGoals; h++) {
        for (let a = 0; a <= maxGoals; a++) {
            if (h > a) homeWin += matrix[h][a];
            else if (h === a) draw += matrix[h][a];
            else awayWin += matrix[h][a];
        }
    }

    return { homeWin, draw, awayWin };
}

function calcTotalFromMatrix(matrix, line) {
    let over = 0;
    const maxGoals = matrix.length - 1;

    for (let h = 0; h <= maxGoals; h++) {
        for (let a = 0; a <= maxGoals; a++) {
            if (h + a > line) {
                over += matrix[h][a];
            }
        }
    }

    return { over, under: 1 - over };
}

// Dynamic Empty Net Factor
// Adjusts based on league scoring environment (total line)
function getEmptyNetFactor(totalLine) {
    // Base 15% at 5.5 line
    // Increase by 2% for every 1.0 increase in line
    return 0.15 + (totalLine - 5.5) * 0.02;
}

function calcHandicap(matrix, line, totalLine = 5.5) {
    // line is from home team perspective (negative means home is favorite)
    // Home covers if: homeScore + line > awayScore
    let homeCovers = 0;
    const maxGoals = matrix.length - 1;

    // 1. Calculate Standard Poisson Probability
    for (let h = 0; h <= maxGoals; h++) {
        for (let a = 0; a <= maxGoals; a++) {
            if (h + line > a) {
                homeCovers += matrix[h][a];
            }
        }
    }

    // 2. EMPTY NET ADJUSTMENT (The "Hockey Factor")
    // When leading by 1 goal late, losing team pulls goalie
    // Dynamic factor based on league scoring environment
    const EN_FACTOR = getEmptyNetFactor(totalLine);

    // Calculate probability of exactly 1-goal win for Home and Away
    let probHomeWinBy1 = 0;
    let probAwayWinBy1 = 0;

    for (let i = 0; i < maxGoals; i++) {
        if (i + 1 <= maxGoals) probHomeWinBy1 += matrix[i + 1][i]; // 1-0, 2-1, 3-2...
        if (i + 1 <= maxGoals) probAwayWinBy1 += matrix[i][i + 1]; // 0-1, 1-2, 2-3...
    }

    if (line === -1.5) {
        // Home is favorite. Shift from "Win by 1" to "Win by 2+"
        homeCovers += (probHomeWinBy1 * EN_FACTOR);
    } else if (line === 1.5) {
        // Away is favorite. Home covers if losing by ≤1
        // But some "Lose by 1" become "Lose by 2" (empty net against)
        homeCovers -= (probAwayWinBy1 * EN_FACTOR);
    } else if (line === -2.5) {
        // Less impact, but still some boost from multi-goal empty nets
        homeCovers += (probHomeWinBy1 * EN_FACTOR * 0.5);
    } else if (line === 2.5) {
        homeCovers -= (probAwayWinBy1 * EN_FACTOR * 0.5);
    }

    return { homeCovers, awayCovers: 1 - homeCovers };
}

// Calculate Moneyline including OT/Shootout
function calcMoneylineOT(regulation1X2) {
    const { homeWin, draw, awayWin } = regulation1X2;

    // In OT/Shootout, the superior team's edge is reduced
    // OT is 3v3 (higher variance), Shootouts are nearly 50/50
    // We flatten the regulation edge by ~25% for the OT portion
    const regHomeStrength = homeWin / (homeWin + awayWin);
    const otHomeStrength = 0.5 + (regHomeStrength - 0.5) * 0.75; // Flatten edge

    const homeML = homeWin + (draw * otHomeStrength);
    const awayML = awayWin + (draw * (1 - otHomeStrength));

    return { homeML, awayML };
}

// --- Lambda Solver (Gradient Descent) ---

function solveLambdas(targetHomeWin, targetDraw, targetOver, totalLine) {
    // Initialize lambdas
    let lambdaHome = totalLine / 2;
    let lambdaAway = totalLine / 2;

    const maxIterations = 1000;
    const threshold = 0.0001;
    let learningRate = 0.05;

    for (let iter = 0; iter < maxIterations; iter++) {
        // Generate matrix with current lambdas
        const matrix = generateMatrix(lambdaHome, lambdaAway);

        // Calculate model predictions
        const model1X2 = calc1X2FromMatrix(matrix);
        const modelTotal = calcTotalFromMatrix(matrix, totalLine);

        // Calculate errors
        const errorHomeWin = targetHomeWin - model1X2.homeWin;
        const errorDraw = targetDraw - model1X2.draw;
        const errorOver = targetOver - modelTotal.over;

        // Total error
        const totalError = Math.abs(errorHomeWin) + Math.abs(errorDraw) + Math.abs(errorOver);

        // Check convergence
        if (totalError < threshold) {
            break;
        }

        // Adjust lambdas based on errors
        // If model predicts too few home wins, increase lambdaHome
        // If model predicts too low total, increase both lambdas

        const homeAdjustment = errorHomeWin * learningRate * 2;
        const totalAdjustment = errorOver * learningRate;

        lambdaHome += homeAdjustment + totalAdjustment;
        lambdaAway -= homeAdjustment * 0.5;  // Less sensitive
        lambdaAway += totalAdjustment;

        // Constrain lambdas to reasonable bounds
        lambdaHome = Math.max(0.3, Math.min(8.0, lambdaHome));
        lambdaAway = Math.max(0.3, Math.min(8.0, lambdaAway));

        // Decay learning rate
        learningRate *= 0.995;
    }

    return { lambdaHome, lambdaAway };
}

// --- Main Controller ---
function runModel() {
    // Get Inputs
    const hOdds = parseFloat(document.getElementById('homeOdds').value);
    const dOdds = parseFloat(document.getElementById('drawOdds').value);
    const aOdds = parseFloat(document.getElementById('awayOdds').value);
    const puckLine = parseFloat(document.getElementById('puckLine').value);
    const puckHomeOdds = parseFloat(document.getElementById('puckHomeOdds').value);
    const puckAwayOdds = parseFloat(document.getElementById('puckAwayOdds').value);
    const totalGoalsLine = parseFloat(document.getElementById('totalGoalsLine').value);
    const overOdds = parseFloat(document.getElementById('overOdds').value);
    const underOdds = parseFloat(document.getElementById('underOdds').value);

    // Get Period Ratios
    const p1Ratio = parseFloat(document.getElementById('p1Ratio').value) || 0.333;
    const p2Ratio = parseFloat(document.getElementById('p2Ratio').value) || 0.333;
    const p3Ratio = parseFloat(document.getElementById('p3Ratio').value) || 0.334;

    // Basic validation
    if ([hOdds, dOdds, aOdds, totalGoalsLine, overOdds, underOdds].some(isNaN)) return;

    // Update Labels
    document.getElementById('overLabel').textContent = `Over ${totalGoalsLine}`;
    document.getElementById('underLabel').textContent = `Under ${totalGoalsLine}`;

    // --- Margin Calculations ---
    const mlMargin = ((1 / hOdds + 1 / dOdds + 1 / aOdds) - 1) * 100;
    const mlMarginEl = document.getElementById('moneylineMargin');
    if (mlMarginEl) {
        mlMarginEl.textContent = `Margin: ${mlMargin.toFixed(2)}%`;
        mlMarginEl.style.color = mlMargin < 5 ? '#4ade80' : (mlMargin < 8 ? '#facc15' : '#f87171');
    }

    if (!isNaN(puckHomeOdds) && !isNaN(puckAwayOdds)) {
        const puckMargin = ((1 / puckHomeOdds + 1 / puckAwayOdds) - 1) * 100;
        const puckMarginEl = document.getElementById('puckLineMargin');
        if (puckMarginEl) {
            puckMarginEl.textContent = `Margin: ${puckMargin.toFixed(2)}%`;
            puckMarginEl.style.color = puckMargin < 5 ? '#4ade80' : (puckMargin < 8 ? '#facc15' : '#f87171');
        }
    }

    const totalMargin = ((1 / overOdds + 1 / underOdds) - 1) * 100;
    const totalMarginEl = document.getElementById('totalGoalsMargin');
    if (totalMarginEl) {
        totalMarginEl.textContent = `Margin: ${totalMargin.toFixed(2)}%`;
        totalMarginEl.style.color = totalMargin < 5 ? '#4ade80' : (totalMargin < 8 ? '#facc15' : '#f87171');
    }

    // --- Remove Vig (Get Fair Probabilities) ---
    const fair1X2 = removeVig([hOdds, dOdds, aOdds]);
    const fairOU = removeVig([overOdds, underOdds]);

    const targetHomeWin = fair1X2[0];
    const targetDraw = fair1X2[1];
    const targetAwayWin = fair1X2[2];
    const targetOver = fairOU[0];

    // Display fair probabilities
    document.getElementById('homeWinProb').textContent = (targetHomeWin * 100).toFixed(1) + "%";
    document.getElementById('drawProb').textContent = (targetDraw * 100).toFixed(1) + "%";
    document.getElementById('awayWinProb').textContent = (targetAwayWin * 100).toFixed(1) + "%";

    document.getElementById('fairHome').textContent = probToOdds(targetHomeWin);
    document.getElementById('fairDraw').textContent = probToOdds(targetDraw);
    document.getElementById('fairAway').textContent = probToOdds(targetAwayWin);

    // --- Solve for Lambdas using Gradient Descent ---
    const lambdas = solveLambdas(targetHomeWin, targetDraw, targetOver, totalGoalsLine);

    const expectedTotal = lambdas.lambdaHome + lambdas.lambdaAway;
    document.getElementById('expectedTotal').textContent = expectedTotal.toFixed(2);
    document.getElementById('lambdaHome').textContent = lambdas.lambdaHome.toFixed(3);
    document.getElementById('lambdaAway').textContent = lambdas.lambdaAway.toFixed(3);

    // --- Generate Full-Time Score Matrix ---
    const matrixFT = generateMatrix(lambdas.lambdaHome, lambdas.lambdaAway, 14);

    // --- Show Markets Area ---
    ['marketsArea', 'puckLineArea', 'totalGoalsArea', 'periodMarketsArea',
     'period3MarketsArea', 'exactScoreArea', 'specialMarketsArea', 'teamTotalsArea',
     'comboBetsArea', 'exactGoalsArea', 'spreadGoalsArea'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('hidden');
    });

    // --- Calculate regulation 1X2 for Moneyline (incl OT) ---
    const result1X2 = calc1X2FromMatrix(matrixFT);

    // --- Moneyline (Including OT/Shootout) ---
    const moneylineOT = calcMoneylineOT(result1X2);
    let moneylineHtml = `
        <tr>
            <td>Home</td>
            <td class="num-col prob-col">${(moneylineOT.homeML * 100).toFixed(1)}%</td>
            <td class="num-col">${probToOdds(moneylineOT.homeML)}</td>
        </tr>
        <tr>
            <td>Away</td>
            <td class="num-col prob-col">${(moneylineOT.awayML * 100).toFixed(1)}%</td>
            <td class="num-col">${probToOdds(moneylineOT.awayML)}</td>
        </tr>
    `;
    document.getElementById('moneylineTable').innerHTML = moneylineHtml;

    // --- Puck Line (Handicap) ---
    // Generate specific lines with empty net adjustments
    const puckLines = [-3.5, -2.5, -1.5, 1.5, 2.5, 3.5];

    let puckLineHtml = '';
    puckLines.forEach(line => {
        const result = calcHandicap(matrixFT, line, totalGoalsLine);
        puckLineHtml += `<tr>
            <td class="line-col">${line > 0 ? '+' : ''}${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(result.homeCovers)}</td>
            <td class="num-col">${probToOdds(result.awayCovers)}</td>
        </tr>`;
    });
    document.getElementById('puckLineTable').innerHTML = puckLineHtml;

    // --- Total Goals ---
    const totalGoalsLines = [3.5, 4.5, 5.5, 6.5, 7.5, 8.5];
    let totalGoalsHtml = '';

    totalGoalsLines.forEach(line => {
        const result = calcTotalFromMatrix(matrixFT, line);
        const isBaseLine = Math.abs(line - totalGoalsLine) < 0.6;
        const rowStyle = isBaseLine ? ' style="background: rgba(59, 130, 246, 0.15);"' : '';
        totalGoalsHtml += `<tr${rowStyle}>
            <td class="line-col">${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(result.over)}</td>
            <td class="num-col">${probToOdds(result.under)}</td>
        </tr>`;
    });
    document.getElementById('totalGoalsTable').innerHTML = totalGoalsHtml;

    // --- PERIOD MARKETS ---
    const periods = [
        { ratio: p1Ratio, name: 'P1', winTableId: 'p1WinTable', totalTableId: 'p1TotalTable', dnbTableId: 'p1DnbTable', bttsTableId: 'p1BttsTable', teamHomeId: 'p1TeamHomeTable', teamAwayId: 'p1TeamAwayTable' },
        { ratio: p2Ratio, name: 'P2', winTableId: 'p2WinTable', totalTableId: 'p2TotalTable', dnbTableId: 'p2DnbTable', bttsTableId: 'p2BttsTable', teamHomeId: 'p2TeamHomeTable', teamAwayId: 'p2TeamAwayTable' },
        { ratio: p3Ratio, name: 'P3', winTableId: 'p3WinTable', totalTableId: 'p3TotalTable', dnbTableId: 'p3DnbTable', bttsTableId: 'p3BttsTable', teamHomeId: 'p3TeamHomeTable', teamAwayId: 'p3TeamAwayTable' }
    ];

    periods.forEach(period => {
        const periodLambdaHome = lambdas.lambdaHome * period.ratio;
        const periodLambdaAway = lambdas.lambdaAway * period.ratio;
        const periodMatrix = generateMatrix(periodLambdaHome, periodLambdaAway, 10);

        // Period Winner (1X2)
        const period1X2 = calc1X2FromMatrix(periodMatrix);
        let periodWinHtml = `
            <tr>
                <td>Home</td>
                <td class="num-col prob-col">${(period1X2.homeWin * 100).toFixed(1)}%</td>
                <td class="num-col">${probToOdds(period1X2.homeWin)}</td>
            </tr>
            <tr>
                <td>Draw</td>
                <td class="num-col prob-col">${(period1X2.draw * 100).toFixed(1)}%</td>
                <td class="num-col">${probToOdds(period1X2.draw)}</td>
            </tr>
            <tr>
                <td>Away</td>
                <td class="num-col prob-col">${(period1X2.awayWin * 100).toFixed(1)}%</td>
                <td class="num-col">${probToOdds(period1X2.awayWin)}</td>
            </tr>
        `;
        document.getElementById(period.winTableId).innerHTML = periodWinHtml;

        // Period Total Goals
        const periodTotalLines = [0.5, 1.5, 2.5];
        let periodTotalHtml = '';
        periodTotalLines.forEach(line => {
            const result = calcTotalFromMatrix(periodMatrix, line);
            periodTotalHtml += `<tr>
                <td class="line-col">${line.toFixed(1)}</td>
                <td class="num-col">${probToOdds(result.over)}</td>
                <td class="num-col">${probToOdds(result.under)}</td>
            </tr>`;
        });
        document.getElementById(period.totalTableId).innerHTML = periodTotalHtml;

        // Period Draw No Bet (DNB)
        const pWinNoDrawHome = period1X2.homeWin / (1 - period1X2.draw);
        const pWinNoDrawAway = period1X2.awayWin / (1 - period1X2.draw);
        let periodDnbHtml = `
            <tr>
                <td>Home DNB</td>
                <td class="num-col prob-col">${(pWinNoDrawHome * 100).toFixed(1)}%</td>
                <td class="num-col">${probToOdds(pWinNoDrawHome)}</td>
            </tr>
            <tr>
                <td>Away DNB</td>
                <td class="num-col prob-col">${(pWinNoDrawAway * 100).toFixed(1)}%</td>
                <td class="num-col">${probToOdds(pWinNoDrawAway)}</td>
            </tr>
        `;
        if (document.getElementById(period.dnbTableId)) {
            document.getElementById(period.dnbTableId).innerHTML = periodDnbHtml;
        }

        // Period BTTS (Both Teams To Score)
        let pBttsYes = 0;
        for (let h = 1; h <= 10; h++) {
            for (let a = 1; a <= 10; a++) {
                pBttsYes += periodMatrix[h][a];
            }
        }
        const pBttsNo = 1 - pBttsYes;
        let periodBttsHtml = `
            <tr>
                <td>Yes</td>
                <td class="num-col prob-col">${(pBttsYes * 100).toFixed(1)}%</td>
                <td class="num-col">${probToOdds(pBttsYes)}</td>
            </tr>
            <tr>
                <td>No</td>
                <td class="num-col prob-col">${(pBttsNo * 100).toFixed(1)}%</td>
                <td class="num-col">${probToOdds(pBttsNo)}</td>
            </tr>
        `;
        if (document.getElementById(period.bttsTableId)) {
            document.getElementById(period.bttsTableId).innerHTML = periodBttsHtml;
        }

        // Period Team Totals
        const periodTeamLines = [0.5, 1.5, 2.5];

        // Home Team Total
        let periodTeamHomeHtml = '';
        periodTeamLines.forEach(line => {
            let pOver = 0;
            for (let h = 0; h <= 10; h++) {
                for (let a = 0; a <= 10; a++) {
                    if (h > line) pOver += periodMatrix[h][a];
                }
            }
            periodTeamHomeHtml += `<tr>
                <td class="line-col">${line.toFixed(1)}</td>
                <td class="num-col">${probToOdds(pOver)}</td>
                <td class="num-col">${probToOdds(1 - pOver)}</td>
            </tr>`;
        });
        if (document.getElementById(period.teamHomeId)) {
            document.getElementById(period.teamHomeId).innerHTML = periodTeamHomeHtml;
        }

        // Away Team Total
        let periodTeamAwayHtml = '';
        periodTeamLines.forEach(line => {
            let pOver = 0;
            for (let h = 0; h <= 10; h++) {
                for (let a = 0; a <= 10; a++) {
                    if (a > line) pOver += periodMatrix[h][a];
                }
            }
            periodTeamAwayHtml += `<tr>
                <td class="line-col">${line.toFixed(1)}</td>
                <td class="num-col">${probToOdds(pOver)}</td>
                <td class="num-col">${probToOdds(1 - pOver)}</td>
            </tr>`;
        });
        if (document.getElementById(period.teamAwayId)) {
            document.getElementById(period.teamAwayId).innerHTML = periodTeamAwayHtml;
        }
    });

    // --- PERIOD 3 DEDICATED MARKETS ---
    const p3LambdaHome = lambdas.lambdaHome * p3Ratio;
    const p3LambdaAway = lambdas.lambdaAway * p3Ratio;
    const p3Matrix = generateMatrix(p3LambdaHome, p3LambdaAway, 10);

    // Determine Period 3 total line based on full-time line
    const p3TotalLine = totalGoalsLine <= 5.5 ? 1.5 : 2.5;

    // Period 3 1X2
    const p3Result = calc1X2FromMatrix(p3Matrix);
    let p3_1x2Html = `
        <tr>
            <td>Home</td>
            <td class="num-col prob-col">${(p3Result.homeWin * 100).toFixed(1)}%</td>
            <td class="num-col">${probToOdds(p3Result.homeWin)}</td>
        </tr>
        <tr>
            <td>Draw</td>
            <td class="num-col prob-col">${(p3Result.draw * 100).toFixed(1)}%</td>
            <td class="num-col">${probToOdds(p3Result.draw)}</td>
        </tr>
        <tr>
            <td>Away</td>
            <td class="num-col prob-col">${(p3Result.awayWin * 100).toFixed(1)}%</td>
            <td class="num-col">${probToOdds(p3Result.awayWin)}</td>
        </tr>
    `;
    if (document.getElementById('period3_1x2Table')) {
        document.getElementById('period3_1x2Table').innerHTML = p3_1x2Html;
    }

    // Period 3 Total Goals
    const p3Total = calcTotalFromMatrix(p3Matrix, p3TotalLine);
    let p3TotalHtml = `
        <tr>
            <td class="line-col">${p3TotalLine.toFixed(1)}</td>
            <td class="num-col">${probToOdds(p3Total.over)}</td>
            <td class="num-col">${probToOdds(p3Total.under)}</td>
        </tr>
    `;
    if (document.getElementById('period3TotalTable')) {
        document.getElementById('period3TotalTable').innerHTML = p3TotalHtml;
    }

    // --- COMBO BET: 1X2 & Total (Regular Time) ---
    const comboResults = [];
    const comboTotalLine = totalGoalsLine;

    // Calculate probabilities for each combination
    for (let h = 0; h <= 14; h++) {
        for (let a = 0; a <= 14; a++) {
            const total = h + a;
            const prob = matrixFT[h][a];

            if (h > a) {
                // Home Win
                if (total > comboTotalLine) {
                    const idx = comboResults.findIndex(r => r.outcome === 'Home & Over');
                    if (idx >= 0) comboResults[idx].prob += prob;
                    else comboResults.push({ outcome: 'Home & Over', prob });
                } else {
                    const idx = comboResults.findIndex(r => r.outcome === 'Home & Under');
                    if (idx >= 0) comboResults[idx].prob += prob;
                    else comboResults.push({ outcome: 'Home & Under', prob });
                }
            } else if (h === a) {
                // Draw
                if (total > comboTotalLine) {
                    const idx = comboResults.findIndex(r => r.outcome === 'Draw & Over');
                    if (idx >= 0) comboResults[idx].prob += prob;
                    else comboResults.push({ outcome: 'Draw & Over', prob });
                } else {
                    const idx = comboResults.findIndex(r => r.outcome === 'Draw & Under');
                    if (idx >= 0) comboResults[idx].prob += prob;
                    else comboResults.push({ outcome: 'Draw & Under', prob });
                }
            } else {
                // Away Win
                if (total > comboTotalLine) {
                    const idx = comboResults.findIndex(r => r.outcome === 'Away & Over');
                    if (idx >= 0) comboResults[idx].prob += prob;
                    else comboResults.push({ outcome: 'Away & Over', prob });
                } else {
                    const idx = comboResults.findIndex(r => r.outcome === 'Away & Under');
                    if (idx >= 0) comboResults[idx].prob += prob;
                    else comboResults.push({ outcome: 'Away & Under', prob });
                }
            }
        }
    }

    // Display Combo Bets
    let comboHtml = '';
    const comboOrder = ['Home & Over', 'Home & Under', 'Draw & Over', 'Draw & Under', 'Away & Over', 'Away & Under'];
    comboOrder.forEach(outcome => {
        const combo = comboResults.find(r => r.outcome === outcome);
        if (combo) {
            comboHtml += `<tr>
                <td>${outcome.replace('&', `& ${comboTotalLine > 0 ? (outcome.includes('Over') ? 'O' : 'U') + comboTotalLine.toFixed(1) : ''}`)}</td>
                <td class="num-col prob-col">${(combo.prob * 100).toFixed(1)}%</td>
                <td class="num-col">${probToOdds(combo.prob)}</td>
            </tr>`;
        }
    });
    if (document.getElementById('comboTable')) {
        document.getElementById('comboTable').innerHTML = comboHtml;
    }

    // --- EXACT GOALS MARKET ---
    const exactGoals = [];
    for (let g = 0; g <= 10; g++) {
        let prob = 0;
        for (let h = 0; h <= 14; h++) {
            for (let a = 0; a <= 14; a++) {
                if (h + a === g) {
                    prob += matrixFT[h][a];
                }
            }
        }
        exactGoals.push({ goals: g, prob });
    }

    // 11+ goals
    let prob11Plus = 0;
    for (let h = 0; h <= 14; h++) {
        for (let a = 0; a <= 14; a++) {
            if (h + a >= 11) {
                prob11Plus += matrixFT[h][a];
            }
        }
    }
    exactGoals.push({ goals: '11+', prob: prob11Plus });

    let exactGoalsHtml = '';
    exactGoals.forEach(eg => {
        exactGoalsHtml += `<tr>
            <td>${eg.goals} Goals</td>
            <td class="num-col prob-col">${(eg.prob * 100).toFixed(1)}%</td>
            <td class="num-col">${probToOdds(eg.prob)}</td>
        </tr>`;
    });
    if (document.getElementById('exactGoalsTable')) {
        document.getElementById('exactGoalsTable').innerHTML = exactGoalsHtml;
    }

    // --- MATCH SCORE RANGES (Detailed) ---
    const matchScoreRanges = [
        // Individual totals
        { label: '3', minH: 0, maxH: 3, minA: 0, maxA: 3, exact: 3 },
        { label: '4', minH: 0, maxH: 4, minA: 0, maxA: 4, exact: 4 },
        { label: '5', minH: 0, maxH: 5, minA: 0, maxA: 5, exact: 5 },
        { label: '6', minH: 0, maxH: 6, minA: 0, maxA: 6, exact: 6 },
        { label: '7', minH: 0, maxH: 7, minA: 0, maxA: 7, exact: 7 },
        { label: '8', minH: 0, maxH: 8, minA: 0, maxA: 8, exact: 8 },
        // Ranges starting with 2
        { label: '2-3', minTotal: 2, maxTotal: 3 },
        { label: '2-4', minTotal: 2, maxTotal: 4 },
        { label: '2-5', minTotal: 2, maxTotal: 5 },
        { label: '2-6', minTotal: 2, maxTotal: 6 },
        { label: '2-7', minTotal: 2, maxTotal: 7 },
        { label: '2-8', minTotal: 2, maxTotal: 8 },
        { label: '2-9', minTotal: 2, maxTotal: 9 },
        // Ranges starting with 3
        { label: '3-4', minTotal: 3, maxTotal: 4 },
        { label: '3-5', minTotal: 3, maxTotal: 5 },
        { label: '3-6', minTotal: 3, maxTotal: 6 },
        { label: '3-7', minTotal: 3, maxTotal: 7 },
        { label: '3-8', minTotal: 3, maxTotal: 8 },
        { label: '3-9', minTotal: 3, maxTotal: 9 },
        // Ranges starting with 4
        { label: '4-5', minTotal: 4, maxTotal: 5 },
        { label: '4-6', minTotal: 4, maxTotal: 6 },
        { label: '4-7', minTotal: 4, maxTotal: 7 },
        { label: '4-8', minTotal: 4, maxTotal: 8 },
        { label: '4-9', minTotal: 4, maxTotal: 9 },
        // Ranges starting with 5
        { label: '5-6', minTotal: 5, maxTotal: 6 },
        { label: '5-7', minTotal: 5, maxTotal: 7 },
        { label: '5-8', minTotal: 5, maxTotal: 8 },
        { label: '5-9', minTotal: 5, maxTotal: 9 },
        // Ranges starting with 6
        { label: '6-7', minTotal: 6, maxTotal: 7 },
        { label: '6-8', minTotal: 6, maxTotal: 8 },
        { label: '6-9', minTotal: 6, maxTotal: 9 },
        // Ranges starting with 7
        { label: '7-8', minTotal: 7, maxTotal: 8 },
        { label: '7-9', minTotal: 7, maxTotal: 9 },
        // Last range
        { label: '8-9', minTotal: 8, maxTotal: 9 }
    ];

    let spreadGoalsHtml = '';
    matchScoreRanges.forEach(range => {
        let prob = 0;

        if (range.exact !== undefined) {
            // Exact total goals
            for (let h = 0; h <= 14; h++) {
                for (let a = 0; a <= 14; a++) {
                    if (h + a === range.exact) {
                        prob += matrixFT[h][a];
                    }
                }
            }
        } else {
            // Range of totals
            for (let h = 0; h <= 14; h++) {
                for (let a = 0; a <= 14; a++) {
                    const total = h + a;
                    if (total >= range.minTotal && total <= range.maxTotal) {
                        prob += matrixFT[h][a];
                    }
                }
            }
        }

        spreadGoalsHtml += `<tr>
            <td>${range.label}</td>
            <td class="num-col prob-col">${(prob * 100).toFixed(1)}%</td>
            <td class="num-col">${probToOdds(prob)}</td>
        </tr>`;
    });
    if (document.getElementById('spreadGoalsTable')) {
        document.getElementById('spreadGoalsTable').innerHTML = spreadGoalsHtml;
    }

    // --- Full-Time Team Totals ---
    const teamTotalLines = [2.5, 3.5, 4.5];

    // Home Team Total
    let homeTeamHtml = '';
    teamTotalLines.forEach(line => {
        let pOver = 0;
        for (let h = 0; h <= 14; h++) {
            for (let a = 0; a <= 14; a++) {
                if (h > line) pOver += matrixFT[h][a];
            }
        }
        homeTeamHtml += `<tr>
            <td class="line-col">${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pOver)}</td>
            <td class="num-col">${probToOdds(1 - pOver)}</td>
        </tr>`;
    });
    if (document.getElementById('homeTeamTotalTable')) {
        document.getElementById('homeTeamTotalTable').innerHTML = homeTeamHtml;
    }

    // Away Team Total
    let awayTeamHtml = '';
    teamTotalLines.forEach(line => {
        let pOver = 0;
        for (let h = 0; h <= 14; h++) {
            for (let a = 0; a <= 14; a++) {
                if (a > line) pOver += matrixFT[h][a];
            }
        }
        awayTeamHtml += `<tr>
            <td class="line-col">${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pOver)}</td>
            <td class="num-col">${probToOdds(1 - pOver)}</td>
        </tr>`;
    });
    if (document.getElementById('awayTeamTotalTable')) {
        document.getElementById('awayTeamTotalTable').innerHTML = awayTeamHtml;
    }

    // --- Exact Score ---
    const exactScores = [];
    for (let h = 0; h <= 8; h++) {
        for (let a = 0; a <= 8; a++) {
            exactScores.push({ h, a, prob: matrixFT[h][a] });
        }
    }
    exactScores.sort((a, b) => b.prob - a.prob);

    let exactScoreHtml = '';
    exactScores.slice(0, 20).forEach(score => {
        exactScoreHtml += `<tr>
            <td>${score.h} - ${score.a}</td>
            <td class="num-col prob-col">${(score.prob * 100).toFixed(1)}%</td>
            <td class="num-col">${probToOdds(score.prob)}</td>
        </tr>`;
    });
    document.getElementById('exactScoreTable').innerHTML = exactScoreHtml;

    // --- Both Teams To Score (Full-Time) ---
    let bttsYes = 0;
    for (let h = 1; h <= 14; h++) {
        for (let a = 1; a <= 14; a++) {
            bttsYes += matrixFT[h][a];
        }
    }
    const bttsNo = 1 - bttsYes;

    document.getElementById('bttsTable').innerHTML = `
        <tr>
            <td>Yes</td>
            <td class="num-col prob-col">${(bttsYes * 100).toFixed(1)}%</td>
            <td class="num-col">${probToOdds(bttsYes)}</td>
        </tr>
        <tr>
            <td>No</td>
            <td class="num-col prob-col">${(bttsNo * 100).toFixed(1)}%</td>
            <td class="num-col">${probToOdds(bttsNo)}</td>
        </tr>
    `;

    // --- Double Chance ---
    const homeOrDraw = result1X2.homeWin + result1X2.draw;
    const homeOrAway = result1X2.homeWin + result1X2.awayWin;
    const drawOrAway = result1X2.draw + result1X2.awayWin;

    document.getElementById('doubleChanceTable').innerHTML = `
        <tr>
            <td>Home or Draw</td>
            <td class="num-col prob-col">${(homeOrDraw * 100).toFixed(1)}%</td>
            <td class="num-col">${probToOdds(homeOrDraw)}</td>
        </tr>
        <tr>
            <td>Home or Away</td>
            <td class="num-col prob-col">${(homeOrAway * 100).toFixed(1)}%</td>
            <td class="num-col">${probToOdds(homeOrAway)}</td>
        </tr>
        <tr>
            <td>Draw or Away</td>
            <td class="num-col prob-col">${(drawOrAway * 100).toFixed(1)}%</td>
            <td class="num-col">${probToOdds(drawOrAway)}</td>
        </tr>
    `;

    // --- Draw No Bet (Full-Time) ---
    const ftDnbHome = result1X2.homeWin / (1 - result1X2.draw);
    const ftDnbAway = result1X2.awayWin / (1 - result1X2.draw);

    if (document.getElementById('dnbTable')) {
        document.getElementById('dnbTable').innerHTML = `
            <tr>
                <td>Home DNB</td>
                <td class="num-col prob-col">${(ftDnbHome * 100).toFixed(1)}%</td>
                <td class="num-col">${probToOdds(ftDnbHome)}</td>
            </tr>
            <tr>
                <td>Away DNB</td>
                <td class="num-col prob-col">${(ftDnbAway * 100).toFixed(1)}%</td>
                <td class="num-col">${probToOdds(ftDnbAway)}</td>
            </tr>
        `;
    }
}

// Make global
window.runModel = runModel;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    setRunModelCallback(runModel);
    initIceHockeyLoader();

    document.getElementById('apiCountrySelect').addEventListener('change', handleCountryChange);
    document.getElementById('apiLeagueSelect').addEventListener('change', handleLeagueChange);
    document.getElementById('apiMatchSelect').addEventListener('change', handleMatchChange);

    runModel();
});
