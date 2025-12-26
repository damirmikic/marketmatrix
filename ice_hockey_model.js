// Ice Hockey Model
// Advanced probability calculations with gradient descent solver

import {
    initIceHockeyLoader,
    handleCountryChange,
    handleLeagueChange,
    handleMatchChange,
    setRunModelCallback
} from './js/ice_hockey_api.js';

// --- Statistical Helper Functions ---

// Memoized factorial function
const factorialCache = {};
function factorial(n) {
    if (n === 0 || n === 1) return 1;
    if (factorialCache[n]) return factorialCache[n];

    let result = 1;
    for (let i = 2; i <= n; i++) {
        result *= i;
    }
    factorialCache[n] = result;
    return result;
}

// Poisson Probability Mass Function
function poissonPMF(k, lambda) {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    if (k < 0) return 0;

    // Using log-space for numerical stability
    const logProb = k * Math.log(lambda) - lambda - Math.log(factorial(k));
    return Math.exp(logProb);
}

// --- Probability Functions ---

function probToOdds(p) {
    if (p <= 0) return "---";
    if (p >= 1) return "1.00";
    return (1 / p).toFixed(2);
}

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

function calcHandicap(matrix, line) {
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
    // ~15% of 1-goal leads turn into 2-goal wins via empty net
    const EN_FACTOR = 0.15;

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

    // Get Period 3 API Markets
    const p3HomeOdds = parseFloat(document.getElementById('p3HomeOdds').value);
    const p3DrawOdds = parseFloat(document.getElementById('p3DrawOdds').value);
    const p3AwayOdds = parseFloat(document.getElementById('p3AwayOdds').value);
    const p3TotalLine = parseFloat(document.getElementById('p3TotalLine').value);
    const p3OverOdds = parseFloat(document.getElementById('p3OverOdds').value);
    const p3UnderOdds = parseFloat(document.getElementById('p3UnderOdds').value);

    // Get Period Ratios
    const p1Ratio = parseFloat(document.getElementById('p1Ratio').value) || 0.333;
    const p2Ratio = parseFloat(document.getElementById('p2Ratio').value) || 0.333;
    const p3Ratio = parseFloat(document.getElementById('p3Ratio').value) || 0.334;

    // Basic validation
    if ([hOdds, dOdds, aOdds, totalGoalsLine, overOdds, underOdds].some(isNaN)) return;

    // Update Labels
    document.getElementById('overLabel').textContent = `Over ${totalGoalsLine}`;
    document.getElementById('underLabel').textContent = `Under ${totalGoalsLine}`;

    if (!isNaN(p3TotalLine)) {
        document.getElementById('p3OverLabel').textContent = `Over ${p3TotalLine}`;
        document.getElementById('p3UnderLabel').textContent = `Under ${p3TotalLine}`;
    }

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

    // Period 3 Winner Margin
    if (!isNaN(p3HomeOdds) && !isNaN(p3DrawOdds) && !isNaN(p3AwayOdds)) {
        const p3WinMargin = ((1 / p3HomeOdds + 1 / p3DrawOdds + 1 / p3AwayOdds) - 1) * 100;
        const p3WinMarginEl = document.getElementById('p3WinnerMargin');
        if (p3WinMarginEl) {
            p3WinMarginEl.textContent = `Margin: ${p3WinMargin.toFixed(2)}%`;
            p3WinMarginEl.style.color = p3WinMargin < 5 ? '#4ade80' : (p3WinMargin < 8 ? '#facc15' : '#f87171');
        }
    }

    // Period 3 Total Margin
    if (!isNaN(p3OverOdds) && !isNaN(p3UnderOdds)) {
        const p3TotalMargin = ((1 / p3OverOdds + 1 / p3UnderOdds) - 1) * 100;
        const p3TotalMarginEl = document.getElementById('p3TotalMargin');
        if (p3TotalMarginEl) {
            p3TotalMarginEl.textContent = `Margin: ${p3TotalMargin.toFixed(2)}%`;
            p3TotalMarginEl.style.color = p3TotalMargin < 5 ? '#4ade80' : (p3TotalMargin < 8 ? '#facc15' : '#f87171');
        }
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
     'exactScoreArea', 'specialMarketsArea', 'teamTotalsArea'].forEach(id => {
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
        const result = calcHandicap(matrixFT, line);
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
