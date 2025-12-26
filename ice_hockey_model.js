// Ice Hockey Model
// Main controller for ice hockey probability calculations

import {
    initIceHockeyLoader,
    handleCountryChange,
    handleLeagueChange,
    handleMatchChange,
    setRunModelCallback
} from './js/ice_hockey_api.js';

// --- Utility Functions ---
function probToOdds(p) {
    if (p <= 0) return "---";
    if (p >= 1) return "1.00";
    return (1 / p).toFixed(2);
}

// Simple Shin method for 3-way market (1X2)
function solveShin3Way(odds) {
    const impliedProbs = odds.map(o => 1 / o);
    const total = impliedProbs.reduce((a, b) => a + b, 0);

    // For 3-way, simple proportional adjustment
    const fairProbs = impliedProbs.map(p => p / total);
    return fairProbs;
}

// Simple Shin method for 2-way market
function solveShin2Way(odds) {
    const impliedProbs = odds.map(o => 1 / o);
    const total = impliedProbs.reduce((a, b) => a + b, 0);

    const fairProbs = impliedProbs.map(p => p / total);
    return fairProbs;
}

// Poisson probability mass function
function poisson(lambda, k) {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    let prob = Math.exp(-lambda);
    for (let i = 1; i <= k; i++) {
        prob *= lambda / i;
    }
    return prob;
}

// Calculate score matrix using Poisson distribution
function calculateScoreMatrix(lambdaHome, lambdaAway, maxGoals = 10) {
    const matrix = [];
    for (let h = 0; h <= maxGoals; h++) {
        matrix[h] = [];
        for (let a = 0; a <= maxGoals; a++) {
            matrix[h][a] = poisson(lambdaHome, h) * poisson(lambdaAway, a);
        }
    }
    return matrix;
}

// Estimate lambda values from 1X2 odds and total goals
function estimateLambdas(homeProb, drawProb, awayProb, expectedTotal) {
    // Simple estimation based on win probabilities and expected total
    // Home advantage factor
    const homeAdvantage = (homeProb - awayProb) * 0.5;

    const lambdaHome = (expectedTotal / 2) + homeAdvantage;
    const lambdaAway = (expectedTotal / 2) - homeAdvantage;

    return {
        lambdaHome: Math.max(0.5, lambdaHome),
        lambdaAway: Math.max(0.5, lambdaAway)
    };
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
    // Moneyline (1X2) Margin
    const mlMargin = ((1 / hOdds + 1 / dOdds + 1 / aOdds) - 1) * 100;
    const mlMarginEl = document.getElementById('moneylineMargin');
    if (mlMarginEl) {
        mlMarginEl.textContent = `Margin: ${mlMargin.toFixed(2)}%`;
        mlMarginEl.style.color = mlMargin < 5 ? '#4ade80' : (mlMargin < 8 ? '#facc15' : '#f87171');
    }

    // Puck Line Margin
    if (!isNaN(puckHomeOdds) && !isNaN(puckAwayOdds)) {
        const puckMargin = ((1 / puckHomeOdds + 1 / puckAwayOdds) - 1) * 100;
        const puckMarginEl = document.getElementById('puckLineMargin');
        if (puckMarginEl) {
            puckMarginEl.textContent = `Margin: ${puckMargin.toFixed(2)}%`;
            puckMarginEl.style.color = puckMargin < 5 ? '#4ade80' : (puckMargin < 8 ? '#facc15' : '#f87171');
        }
    }

    // Total Goals Margin
    const totalMargin = ((1 / overOdds + 1 / underOdds) - 1) * 100;
    const totalMarginEl = document.getElementById('totalGoalsMargin');
    if (totalMarginEl) {
        totalMarginEl.textContent = `Margin: ${totalMargin.toFixed(2)}%`;
        totalMarginEl.style.color = totalMargin < 5 ? '#4ade80' : (totalMargin < 8 ? '#facc15' : '#f87171');
    }

    // --- Fair Probabilities ---
    const fair1X2 = solveShin3Way([hOdds, dOdds, aOdds]);
    const homeWinProb = fair1X2[0];
    const drawProb = fair1X2[1];
    const awayWinProb = fair1X2[2];

    document.getElementById('homeWinProb').textContent = (homeWinProb * 100).toFixed(1) + "%";
    document.getElementById('drawProb').textContent = (drawProb * 100).toFixed(1) + "%";
    document.getElementById('awayWinProb').textContent = (awayWinProb * 100).toFixed(1) + "%";

    // Fair odds display
    document.getElementById('fairHome').textContent = probToOdds(homeWinProb);
    document.getElementById('fairDraw').textContent = probToOdds(drawProb);
    document.getElementById('fairAway').textContent = probToOdds(awayWinProb);

    // --- Derive Expected Total Goals from Over/Under ---
    const fairOU = solveShin2Way([overOdds, underOdds]);
    const pOver = fairOU[0];
    // Estimate: if P(Over) = 0.5, expected total ≈ line
    // Adjust: higher P(Over) means expected is above line
    const expectedTotal = totalGoalsLine + (pOver - 0.5) * 4;
    document.getElementById('expectedTotal').textContent = expectedTotal.toFixed(2);

    // --- Estimate Poisson Parameters ---
    const lambdas = estimateLambdas(homeWinProb, drawProb, awayWinProb, expectedTotal);
    document.getElementById('lambdaHome').textContent = lambdas.lambdaHome.toFixed(3);
    document.getElementById('lambdaAway').textContent = lambdas.lambdaAway.toFixed(3);

    // --- Generate Score Matrix ---
    const matrixFT = calculateScoreMatrix(lambdas.lambdaHome, lambdas.lambdaAway, 10);

    // --- Show Markets Area ---
    ['marketsArea', 'puckLineArea', 'totalGoalsArea', 'periodMarketsArea',
     'exactScoreArea', 'specialMarketsArea'].forEach(id => {
        document.getElementById(id).classList.remove('hidden');
    });

    // --- Generate Match Result (1X2) Table ---
    let matchResultHtml = `
        <tr>
            <td>Home Win</td>
            <td class="num-col prob-col">${(homeWinProb * 100).toFixed(1)}%</td>
            <td class="num-col">${probToOdds(homeWinProb)}</td>
        </tr>
        <tr>
            <td>Draw</td>
            <td class="num-col prob-col">${(drawProb * 100).toFixed(1)}%</td>
            <td class="num-col">${probToOdds(drawProb)}</td>
        </tr>
        <tr>
            <td>Away Win</td>
            <td class="num-col prob-col">${(awayWinProb * 100).toFixed(1)}%</td>
            <td class="num-col">${probToOdds(awayWinProb)}</td>
        </tr>
    `;
    document.getElementById('matchResultTable').innerHTML = matchResultHtml;

    // --- Generate Puck Line Table ---
    const fairPuckLine = !isNaN(puckHomeOdds) && !isNaN(puckAwayOdds) ?
        solveShin2Way([puckHomeOdds, puckAwayOdds])[0] : 0.5;

    const basePuckLine = !isNaN(puckLine) ? puckLine : -1.5;
    const puckLines = [];
    for (let i = -3; i <= 3; i++) {
        const line = basePuckLine + (i * 0.5);
        if (Math.abs(line) >= 0.5) { // Exclude -0.5 and +0.5
            puckLines.push(line);
        }
    }

    let puckLineHtml = '';
    puckLines.forEach(line => {
        // Each 0.5 goal shift changes prob by ~7%
        const probShift = (line - basePuckLine) * 0.07;
        let pHomeCovers = Math.max(0.01, Math.min(0.99, fairPuckLine + probShift));
        const isBaseLine = Math.abs(line - basePuckLine) < 0.3;
        const rowStyle = isBaseLine ? ' style="background: rgba(59, 130, 246, 0.15);"' : '';
        puckLineHtml += `<tr${rowStyle}>
            <td class="line-col">${line > 0 ? '+' : ''}${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pHomeCovers)}</td>
            <td class="num-col">${probToOdds(1 - pHomeCovers)}</td>
        </tr>`;
    });
    document.getElementById('puckLineTable').innerHTML = puckLineHtml;

    // --- Generate Total Goals Table ---
    const totalGoalsLines = [3.5, 4.5, 5.5, 6.5, 7.5, 8.5];
    let totalGoalsHtml = '';

    totalGoalsLines.forEach(line => {
        // Calculate actual probability from matrix
        let pOverLine = 0;
        for (let h = 0; h <= 10; h++) {
            for (let a = 0; a <= 10; a++) {
                if (h + a > line) {
                    pOverLine += matrixFT[h][a];
                }
            }
        }
        const isBaseLine = Math.abs(line - totalGoalsLine) < 0.6;
        const rowStyle = isBaseLine ? ' style="background: rgba(59, 130, 246, 0.15);"' : '';
        totalGoalsHtml += `<tr${rowStyle}>
            <td class="line-col">${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pOverLine)}</td>
            <td class="num-col">${probToOdds(1 - pOverLine)}</td>
        </tr>`;
    });
    document.getElementById('totalGoalsTable').innerHTML = totalGoalsHtml;

    // --- PERIOD MARKETS ---
    const periods = [
        { ratio: p1Ratio, name: 'P1', winTableId: 'p1WinTable', totalTableId: 'p1TotalTable' },
        { ratio: p2Ratio, name: 'P2', winTableId: 'p2WinTable', totalTableId: 'p2TotalTable' },
        { ratio: p3Ratio, name: 'P3', winTableId: 'p3WinTable', totalTableId: 'p3TotalTable' }
    ];

    periods.forEach(period => {
        // Expected goals for this period
        const periodLambdaHome = lambdas.lambdaHome * period.ratio;
        const periodLambdaAway = lambdas.lambdaAway * period.ratio;

        // Period matrix
        const periodMatrix = calculateScoreMatrix(periodLambdaHome, periodLambdaAway, 8);

        // Calculate period win probabilities
        let pHomeWin = 0, pDraw = 0, pAwayWin = 0;
        for (let h = 0; h <= 8; h++) {
            for (let a = 0; a <= 8; a++) {
                if (h > a) pHomeWin += periodMatrix[h][a];
                else if (h === a) pDraw += periodMatrix[h][a];
                else pAwayWin += periodMatrix[h][a];
            }
        }

        // Period Winner Table (1X2)
        let periodWinHtml = `
            <tr>
                <td>Home</td>
                <td class="num-col prob-col">${(pHomeWin * 100).toFixed(1)}%</td>
                <td class="num-col">${probToOdds(pHomeWin)}</td>
            </tr>
            <tr>
                <td>Draw</td>
                <td class="num-col prob-col">${(pDraw * 100).toFixed(1)}%</td>
                <td class="num-col">${probToOdds(pDraw)}</td>
            </tr>
            <tr>
                <td>Away</td>
                <td class="num-col prob-col">${(pAwayWin * 100).toFixed(1)}%</td>
                <td class="num-col">${probToOdds(pAwayWin)}</td>
            </tr>
        `;
        document.getElementById(period.winTableId).innerHTML = periodWinHtml;

        // Period Total Goals
        const periodTotalLines = [0.5, 1.5, 2.5];
        let periodTotalHtml = '';
        periodTotalLines.forEach(line => {
            let pOver = 0;
            for (let h = 0; h <= 8; h++) {
                for (let a = 0; a <= 8; a++) {
                    if (h + a > line) pOver += periodMatrix[h][a];
                }
            }
            periodTotalHtml += `<tr>
                <td class="line-col">${line.toFixed(1)}</td>
                <td class="num-col">${probToOdds(pOver)}</td>
                <td class="num-col">${probToOdds(1 - pOver)}</td>
            </tr>`;
        });
        document.getElementById(period.totalTableId).innerHTML = periodTotalHtml;
    });

    // --- Exact Score Table ---
    const exactScores = [];
    for (let h = 0; h <= 6; h++) {
        for (let a = 0; a <= 6; a++) {
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

    // --- Both Teams To Score ---
    let bttsYes = 0;
    for (let h = 1; h <= 10; h++) {
        for (let a = 1; a <= 10; a++) {
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
    const homeOrDraw = homeWinProb + drawProb;
    const homeOrAway = homeWinProb + awayWinProb;
    const drawOrAway = drawProb + awayWinProb;

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
}

// Make global
window.runModel = runModel;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    // Set up API loader
    setRunModelCallback(runModel);
    initIceHockeyLoader();

    // Wire up dropdowns
    document.getElementById('apiCountrySelect').addEventListener('change', handleCountryChange);
    document.getElementById('apiLeagueSelect').addEventListener('change', handleLeagueChange);
    document.getElementById('apiMatchSelect').addEventListener('change', handleMatchChange);

    // Initial run
    runModel();
});
