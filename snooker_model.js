// Snooker Model - UI Controller
// Handles user interactions and displays results

import {
    initSnookerLoader,
    handleCountryChange,
    handleLeagueChange,
    handleMatchChange,
    setRunModelCallback
} from './js/snooker_api.js';

import { probToOdds, solveShin } from './js/core/math_utils.js';

// --- Main Controller ---
function runModel() {
    try {
        // Get Inputs
        const hOdds = parseFloat(document.getElementById('homeOdds').value);
        const aOdds = parseFloat(document.getElementById('awayOdds').value);
        const bestOf = parseInt(document.getElementById('bestOf').value);

        // Basic validation
        if (isNaN(hOdds) || isNaN(aOdds) || isNaN(bestOf)) return;

        // Calculate margins
        displayMargin(hOdds, aOdds);

        // Fair Probabilities
        const fairML = solveShin([hOdds, aOdds]);
        const homeWinProb = fairML[0];
        const awayWinProb = fairML[1];

        // Calculate frame win probability from match probability
        const frameHomeProb = solveImpliedFrameProb(homeWinProb, bestOf);
        const frameAwayProb = 1 - frameHomeProb;

        // Frames to win
        const framesToWin = Math.ceil(bestOf / 2);

        // Expected total frames
        const closeness = 1 - Math.abs(homeWinProb - 0.5) * 2;
        const minFrames = framesToWin;
        const maxFrames = bestOf;
        const expectedTotal = minFrames + closeness * (maxFrames - minFrames) * 0.8;

        // Display model parameters
        displayModelParams(homeWinProb, awayWinProb, expectedTotal);

        // Generate exact scores
        const exactScores = calculateExactScores(frameHomeProb, framesToWin, bestOf);

        // Calculate expected frame difference
        let expectedFrameDiff = 0;
        exactScores.forEach(score => {
            const [home, away] = score.label.split('-').map(Number);
            expectedFrameDiff += (home - away) * score.prob;
        });

        // Display all markets
        displayMatchWinner(homeWinProb, awayWinProb);
        displayExactScore(exactScores);
        displayFrameHandicap(exactScores, framesToWin, expectedFrameDiff);
        displayTotalFrames(exactScores, framesToWin, bestOf, expectedTotal);
        displayWinnerTotal(exactScores, homeWinProb, awayWinProb, framesToWin, bestOf);
        displayOddEven(exactScores);
        displayBothWinFrame(exactScores, framesToWin);
        displayFirstFrame(frameHomeProb, frameAwayProb);
        displayFirstTo3(frameHomeProb);
        displayAfterNFrames(frameHomeProb);

        // Show markets
        showMarkets();

    } catch (e) {
        console.error("Model Error:", e);
    }
}

// --- Display Functions ---

function displayMargin(hOdds, aOdds) {
    const mlMargin = ((1 / hOdds + 1 / aOdds) - 1) * 100;
    const mlMarginEl = document.getElementById('moneylineMargin');
    if (mlMarginEl) {
        mlMarginEl.textContent = `Margin: ${mlMargin.toFixed(2)}%`;
        mlMarginEl.style.color = mlMargin < 5 ? '#4ade80' : (mlMargin < 8 ? '#facc15' : '#f87171');
    }
}

function displayModelParams(homeWinProb, awayWinProb, expectedTotal) {
    const homeEl = document.getElementById('homeWinProb');
    const awayEl = document.getElementById('awayWinProb');
    const totalEl = document.getElementById('expectedTotal');

    if (homeEl) homeEl.textContent = (homeWinProb * 100).toFixed(1) + "%";
    if (awayEl) awayEl.textContent = (awayWinProb * 100).toFixed(1) + "%";
    if (totalEl) totalEl.textContent = expectedTotal.toFixed(1);

    // Show model params card
    const modelParamsCard = document.getElementById('modelParamsCard');
    if (modelParamsCard) modelParamsCard.classList.remove('hidden');
}

function displayMatchWinner(homeWinProb, awayWinProb) {
    const container = document.getElementById('matchWinnerTable');
    if (!container) return;

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Player</th>
                    <th>Probability</th>
                    <th>Fair Odds</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="line-col">Player 1</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(homeWinProb * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(homeWinProb)}</td>
                </tr>
                <tr>
                    <td class="line-col">Player 2</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(awayWinProb * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(awayWinProb)}</td>
                </tr>
            </tbody>
        </table>
    `;
}

function displayExactScore(exactScores) {
    const container = document.getElementById('exactScoreTable');
    if (!container) return;

    let html = `
        <table>
            <thead>
                <tr>
                    <th>Score</th>
                    <th class="num-col">Prob</th>
                    <th class="num-col">Odds</th>
                </tr>
            </thead>
            <tbody>
    `;

    exactScores.forEach(score => {
        html += `
            <tr>
                <td>${score.label}</td>
                <td class="num-col" style="color: #10b981; font-weight: 600;">${(score.prob * 100).toFixed(1)}%</td>
                <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(score.prob)}</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

function displayFrameHandicap(exactScores, framesToWin, expectedFrameDiff) {
    const container = document.getElementById('spreadTable');
    if (!container) return;

    // Generate handicap lines: most balanced line +/- 3 lines using .5 values
    const baseLine = -Math.round(expectedFrameDiff) + 0.5;
    const spreadLines = [];
    for (let i = -3; i <= 3; i++) {
        spreadLines.push(baseLine + i);
    }

    let html = `
        <table>
            <thead>
                <tr>
                    <th>Line</th>
                    <th class="num-col">Player 1</th>
                    <th class="num-col">Player 2</th>
                </tr>
            </thead>
            <tbody>
    `;

    spreadLines.forEach(line => {
        let pHomeCovers = 0;
        exactScores.forEach(score => {
            const [home, away] = score.label.split('-').map(Number);
            const frameDiff = home - away;
            if (frameDiff > -line) {
                pHomeCovers += score.prob;
            }
        });

        pHomeCovers = Math.max(0.01, Math.min(0.99, pHomeCovers));
        const isBaseLine = Math.abs(line + expectedFrameDiff) < 0.8;
        const rowStyle = isBaseLine ? ' style="background: rgba(59, 130, 246, 0.15);"' : '';

        html += `
            <tr${rowStyle}>
                <td class="line-col">${line > 0 ? '+' : ''}${line.toFixed(1)}</td>
                <td class="num-col">${probToOdds(pHomeCovers)}</td>
                <td class="num-col">${probToOdds(1 - pHomeCovers)}</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

function displayTotalFrames(exactScores, framesToWin, bestOf, expectedTotal) {
    const container = document.getElementById('totalTable');
    if (!container) return;

    // Generate total lines: most balanced line +/- 3 lines using .5 values
    const baseTotal = Math.round(expectedTotal) + 0.5;
    const totalLines = [];
    for (let i = -3; i <= 3; i++) {
        const line = baseTotal + i;
        if (line >= framesToWin + 0.5 && line <= bestOf - 0.5) {
            totalLines.push(line);
        }
    }

    let html = `
        <table>
            <thead>
                <tr>
                    <th>Line</th>
                    <th class="num-col">Over</th>
                    <th class="num-col">Under</th>
                </tr>
            </thead>
            <tbody>
    `;

    totalLines.forEach(line => {
        let pOverLine = 0;
        exactScores.forEach(score => {
            const [home, away] = score.label.split('-').map(Number);
            const totalFrames = home + away;
            if (totalFrames > line) {
                pOverLine += score.prob;
            }
        });

        pOverLine = Math.max(0.01, Math.min(0.99, pOverLine));
        const isBaseLine = Math.abs(line - expectedTotal) < 0.8;
        const rowStyle = isBaseLine ? ' style="background: rgba(59, 130, 246, 0.15);"' : '';

        html += `
            <tr${rowStyle}>
                <td class="line-col">${line.toFixed(1)}</td>
                <td class="num-col">${probToOdds(pOverLine)}</td>
                <td class="num-col">${probToOdds(1 - pOverLine)}</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

function displayWinnerTotal(exactScores, homeWinProb, awayWinProb, framesToWin, bestOf) {
    const container = document.getElementById('winnerTotalTable');
    if (!container) return;

    // Generate total lines
    const totalLines = [];
    for (let i = framesToWin; i < bestOf; i++) {
        totalLines.push(i + 0.5);
    }

    const middleTotalLine = totalLines[Math.floor(totalLines.length / 2)];
    if (!middleTotalLine) return;

    // Calculate P(Over) from exact scores
    let pOverLine = 0;
    exactScores.forEach(score => {
        const [home, away] = score.label.split('-').map(Number);
        const totalFrames = home + away;
        if (totalFrames > middleTotalLine) {
            pOverLine += score.prob;
        }
    });

    const pUnderLine = 1 - pOverLine;

    // Winner & Total combinations
    const homeOver = homeWinProb * pOverLine;
    const homeUnder = homeWinProb * pUnderLine;
    const awayOver = awayWinProb * pOverLine;
    const awayUnder = awayWinProb * pUnderLine;

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Market</th>
                    <th class="num-col">Prob</th>
                    <th class="num-col">Odds</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Player 1 & Over ${middleTotalLine.toFixed(1)}</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(homeOver * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(homeOver)}</td>
                </tr>
                <tr>
                    <td>Player 1 & Under ${middleTotalLine.toFixed(1)}</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(homeUnder * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(homeUnder)}</td>
                </tr>
                <tr>
                    <td>Player 2 & Over ${middleTotalLine.toFixed(1)}</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(awayOver * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(awayOver)}</td>
                </tr>
                <tr>
                    <td>Player 2 & Under ${middleTotalLine.toFixed(1)}</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(awayUnder * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(awayUnder)}</td>
                </tr>
            </tbody>
        </table>
    `;
}

function displayOddEven(exactScores) {
    const container = document.getElementById('oddEvenTable');
    if (!container) return;

    let pOdd = 0;
    exactScores.forEach(score => {
        const [home, away] = score.label.split('-').map(Number);
        const total = home + away;
        if (total % 2 === 1) {
            pOdd += score.prob;
        }
    });
    const pEven = 1 - pOdd;

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Outcome</th>
                    <th>Probability</th>
                    <th>Fair Odds</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="line-col">Odd</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(pOdd * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(pOdd)}</td>
                </tr>
                <tr>
                    <td class="line-col">Even</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(pEven * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(pEven)}</td>
                </tr>
            </tbody>
        </table>
    `;
}

function displayBothWinFrame(exactScores, framesToWin) {
    const container = document.getElementById('bothWinFrameTable');
    if (!container) return;

    const cleanSweepHome = exactScores.find(s => s.label === `${framesToWin}-0`)?.prob || 0;
    const cleanSweepAway = exactScores.find(s => s.label === `0-${framesToWin}`)?.prob || 0;
    const pPlayer1WinsFrame = 1 - cleanSweepAway;
    const pPlayer2WinsFrame = 1 - cleanSweepHome;
    const pBothWinFrame = 1 - cleanSweepHome - cleanSweepAway;

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Outcome</th>
                    <th>Probability</th>
                    <th>Fair Odds</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="line-col">Player 1 to win a frame</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(pPlayer1WinsFrame * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(pPlayer1WinsFrame)}</td>
                </tr>
                <tr>
                    <td class="line-col">Player 2 to win a frame</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(pPlayer2WinsFrame * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(pPlayer2WinsFrame)}</td>
                </tr>
                <tr>
                    <td class="line-col">Both to win a frame</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(pBothWinFrame * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(pBothWinFrame)}</td>
                </tr>
            </tbody>
        </table>
    `;
}

function displayFirstFrame(frameHomeProb, frameAwayProb) {
    const container = document.getElementById('firstFrameTable');
    if (!container) return;

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Player</th>
                    <th>Probability</th>
                    <th>Fair Odds</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="line-col">Player 1</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(frameHomeProb * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(frameHomeProb)}</td>
                </tr>
                <tr>
                    <td class="line-col">Player 2</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(frameAwayProb * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(frameAwayProb)}</td>
                </tr>
            </tbody>
        </table>
    `;
}

function displayFirstTo3(frameHomeProb) {
    const container = document.getElementById('firstTo3Table');
    if (!container) return;

    const firstTo3HomeProb = getMatchWinProb(frameHomeProb, 5); // First to 3 = Best of 5
    const firstTo3AwayProb = 1 - firstTo3HomeProb;

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Player</th>
                    <th>Probability</th>
                    <th>Fair Odds</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="line-col">Player 1</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(firstTo3HomeProb * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(firstTo3HomeProb)}</td>
                </tr>
                <tr>
                    <td class="line-col">Player 2</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(firstTo3AwayProb * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(firstTo3AwayProb)}</td>
                </tr>
            </tbody>
        </table>
    `;
}

function displayAfterNFrames(frameHomeProb) {
    // Result After 4 Frames
    const after4Container = document.getElementById('after4FramesTable');
    if (after4Container) {
        const after4 = calculateResultAfterNFrames(frameHomeProb, 4);
        after4Container.innerHTML = buildAfterFramesTable(after4);
    }

    // Result After 6 Frames
    const after6Container = document.getElementById('after6FramesTable');
    if (after6Container) {
        const after6 = calculateResultAfterNFrames(frameHomeProb, 6);
        after6Container.innerHTML = buildAfterFramesTable(after6);
    }

    // Result After 8 Frames
    const after8Container = document.getElementById('after8FramesTable');
    if (after8Container) {
        const after8 = calculateResultAfterNFrames(frameHomeProb, 8);
        after8Container.innerHTML = buildAfterFramesTable(after8);
    }
}

function buildAfterFramesTable(results) {
    let html = `
        <table>
            <thead>
                <tr>
                    <th>Score</th>
                    <th class="num-col">Prob</th>
                    <th class="num-col">Odds</th>
                </tr>
            </thead>
            <tbody>
    `;

    results.forEach(r => {
        html += `
            <tr>
                <td>${r.score}</td>
                <td class="num-col" style="color: #10b981; font-weight: 600;">${(r.prob * 100).toFixed(1)}%</td>
                <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(r.prob)}</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    return html;
}

function showMarkets() {
    const marketsContainer = document.getElementById('marketsTabContainer');
    if (marketsContainer) {
        marketsContainer.classList.remove('hidden');
    }
}

// --- Helper Functions ---

function calculateExactScores(frameWinProb, framesToWin, bestOf) {
    const p = frameWinProb;
    const q = 1 - p;
    const scores = [];

    for (let loserFrames = 0; loserFrames < framesToWin; loserFrames++) {
        const homeWins = framesToWin;
        const totalFramesPlayed = homeWins + loserFrames;
        const prob = binomialCoefficient(totalFramesPlayed - 1, loserFrames) *
                     Math.pow(p, framesToWin) * Math.pow(q, loserFrames);
        scores.push({ label: `${homeWins}-${loserFrames}`, prob: prob });
    }

    for (let loserFrames = 0; loserFrames < framesToWin; loserFrames++) {
        const awayWins = framesToWin;
        const totalFramesPlayed = awayWins + loserFrames;
        const prob = binomialCoefficient(totalFramesPlayed - 1, loserFrames) *
                     Math.pow(q, framesToWin) * Math.pow(p, loserFrames);
        scores.push({ label: `${loserFrames}-${awayWins}`, prob: prob });
    }

    // Normalize probabilities
    const total = scores.reduce((sum, s) => sum + s.prob, 0);
    scores.forEach(s => s.prob = s.prob / total);

    // Sort by home frames descending, then away frames ascending
    scores.sort((a, b) => {
        const [aHome, aAway] = a.label.split('-').map(Number);
        const [bHome, bAway] = b.label.split('-').map(Number);
        if (bHome !== aHome) return bHome - aHome;
        return aAway - bAway;
    });

    return scores;
}

function binomialCoefficient(n, k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;

    let result = 1;
    for (let i = 1; i <= k; i++) {
        result *= (n - i + 1) / i;
    }
    return result;
}

function calculateResultAfterNFrames(frameHomeProb, totalFrames) {
    const p = frameHomeProb;
    const q = 1 - p;
    const results = [];

    for (let homeWins = 0; homeWins <= totalFrames; homeWins++) {
        const awayWins = totalFrames - homeWins;
        const prob = binomialCoefficient(totalFrames, homeWins) *
                     Math.pow(p, homeWins) *
                     Math.pow(q, awayWins);

        results.push({
            score: `${homeWins}-${awayWins}`,
            prob: prob,
            homeWins: homeWins,
            awayWins: awayWins
        });
    }

    // Sort by probability descending
    results.sort((a, b) => b.prob - a.prob);

    return results;
}

function getMatchWinProb(p, bestOf) {
    if (bestOf % 2 === 0) bestOf++;
    const framesToWin = Math.ceil(bestOf / 2);
    const q = 1 - p;
    let matchWinProb = 0;

    for (let lost = 0; lost < framesToWin; lost++) {
        const framesPlayed = framesToWin + lost;
        const prob = binomialCoefficient(framesPlayed - 1, lost) * Math.pow(p, framesToWin) * Math.pow(q, lost);
        matchWinProb += prob;
    }
    return matchWinProb;
}

function solveImpliedFrameProb(targetMatchProb, bestOf) {
    let low = 0.01;
    let high = 0.99;
    let mid = 0.5;
    let iter = 0;

    if (Math.abs(targetMatchProb - 0.5) < 0.001) return 0.5;

    while (iter < 50) {
        mid = (low + high) / 2;
        const calcProb = getMatchWinProb(mid, bestOf);

        if (Math.abs(calcProb - targetMatchProb) < 0.0001) {
            return mid;
        }

        if (calcProb < targetMatchProb) {
            low = mid;
        } else {
            high = mid;
        }
        iter++;
    }
    return mid;
}

// Make global
window.runModel = runModel;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    // Set up API loader
    setRunModelCallback(runModel);
    initSnookerLoader();

    // Wire up dropdowns
    document.getElementById('apiCountrySelect').addEventListener('change', handleCountryChange);
    document.getElementById('apiLeagueSelect').addEventListener('change', handleLeagueChange);
    document.getElementById('apiMatchSelect').addEventListener('change', handleMatchChange);

    // Initial run
    runModel();
});
