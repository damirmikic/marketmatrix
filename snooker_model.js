// Snooker Model
// Main controller for snooker probability calculations

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
    // Get Inputs
    const hOdds = parseFloat(document.getElementById('homeOdds').value);
    const aOdds = parseFloat(document.getElementById('awayOdds').value);
    const bestOf = parseInt(document.getElementById('bestOf').value);

    // Basic validation
    if (isNaN(hOdds) || isNaN(aOdds) || isNaN(bestOf)) return;

    // --- Margin Calculations ---
    const mlMargin = ((1 / hOdds + 1 / aOdds) - 1) * 100;
    const mlMarginEl = document.getElementById('moneylineMargin');
    if (mlMarginEl) {
        mlMarginEl.textContent = `Margin: ${mlMargin.toFixed(2)}%`;
        mlMarginEl.style.color = mlMargin < 5 ? '#4ade80' : (mlMargin < 8 ? '#facc15' : '#f87171');
    }

    // --- Fair Probabilities ---
    const fairML = solveShin([hOdds, aOdds]);
    const homeWinProb = fairML[0];
    const awayWinProb = fairML[1];

    document.getElementById('homeWinProb').textContent = (homeWinProb * 100).toFixed(1) + "%";
    document.getElementById('awayWinProb').textContent = (awayWinProb * 100).toFixed(1) + "%";

    // Fair odds display
    document.getElementById('fairHome').textContent = probToOdds(homeWinProb);
    document.getElementById('fairAway').textContent = probToOdds(awayWinProb);

    // --- Calculate Frame Win Probability from Match Probability ---
    // Use reverse solver to find exact frame probability that produces the match probability
    const frameHomeProb = solveImpliedFrameProb(homeWinProb, bestOf);
    const frameAwayProb = 1 - frameHomeProb;

    // Debug log to verify accuracy
    console.log(`Market Match %: ${(homeWinProb * 100).toFixed(2)}%`);
    console.log(`Implied Frame %: ${(frameHomeProb * 100).toFixed(2)}%`);
    console.log(`Verification Match %: ${(getMatchWinProb(frameHomeProb, bestOf) * 100).toFixed(2)}%`);

    // --- Derive Expected Total Frames from Match Probability ---
    // Frames to win = ceil(bestOf / 2)
    const framesToWin = Math.ceil(bestOf / 2);

    // Closer the match (probability closer to 0.5), more frames expected
    const closeness = 1 - Math.abs(homeWinProb - 0.5) * 2;
    const minFrames = framesToWin; // Minimum frames (clean sweep)
    const maxFrames = bestOf; // Maximum frames (goes to final frame)
    const expectedTotal = minFrames + closeness * (maxFrames - minFrames) * 0.8;
    document.getElementById('expectedTotal').textContent = expectedTotal.toFixed(1);

    // --- Show Markets Area ---
    ['marketsArea', 'exactScoreArea', 'specialsArea', 'winnerTotalArea', 'frameProgressionArea'].forEach(id => {
        document.getElementById(id).classList.remove('hidden');
    });

    // --- Generate Exact Scores (based on bestOf format) ---
    const exactScores = calculateExactScores(frameHomeProb, framesToWin, bestOf);

    // Calculate expected frame difference
    let expectedFrameDiff = 0;
    exactScores.forEach(score => {
        const [home, away] = score.label.split('-').map(Number);
        expectedFrameDiff += (home - away) * score.prob;
    });

    // --- Generate Frame Handicap Table ---
    // Generate handicap lines dynamically based on bestOf format
    const maxHandicap = framesToWin - 1;
    const spreadLines = [];
    for (let i = maxHandicap; i >= 1; i--) {
        spreadLines.push(-i - 0.5);
    }
    for (let i = 1; i <= maxHandicap; i++) {
        spreadLines.push(i - 0.5);
    }

    let spreadHtml = '';
    spreadLines.forEach(line => {
        // Probability that home covers the line
        let pHomeCovers = 0;
        exactScores.forEach(score => {
            const [home, away] = score.label.split('-').map(Number);
            const frameDiff = home - away;
            // For handicap betting: Player 1 at line X covers if (home - away) > -X
            if (frameDiff > -line) {
                pHomeCovers += score.prob;
            }
        });

        pHomeCovers = Math.max(0.01, Math.min(0.99, pHomeCovers));
        const isBaseLine = Math.abs(line + expectedFrameDiff) < 0.8;
        const rowStyle = isBaseLine ? ' style="background: rgba(59, 130, 246, 0.15);"' : '';
        spreadHtml += `<tr${rowStyle}>
            <td class="line-col">${line > 0 ? '+' : ''}${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pHomeCovers)}</td>
            <td class="num-col">${probToOdds(1 - pHomeCovers)}</td>
        </tr>`;
    });
    document.getElementById('spreadTable').innerHTML = spreadHtml;

    // --- Generate Total Frames Table ---
    // Generate total lines dynamically based on bestOf
    const totalLines = [];
    for (let i = framesToWin; i < bestOf; i++) {
        totalLines.push(i + 0.5);
    }

    let totalHtml = '';
    totalLines.forEach(line => {
        // Probability of over: sum probabilities where total frames > line
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
        totalHtml += `<tr${rowStyle}>
            <td class="line-col">${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pOverLine)}</td>
            <td class="num-col">${probToOdds(1 - pOverLine)}</td>
        </tr>`;
    });
    document.getElementById('totalTable').innerHTML = totalHtml;

    // --- EXACT SCORE ---
    let exactScoreHtml = '';
    exactScores.forEach(score => {
        exactScoreHtml += `<tr>
            <td>${score.label}</td>
            <td class="num-col prob-col">${(score.prob * 100).toFixed(1)}%</td>
            <td class="num-col">${probToOdds(score.prob)}</td>
        </tr>`;
    });
    document.getElementById('exactScoreTable').innerHTML = exactScoreHtml;

    // --- ODD/EVEN ---
    // Total frames odd/even
    let pOdd = 0;
    exactScores.forEach(score => {
        const [home, away] = score.label.split('-').map(Number);
        const total = home + away;
        if (total % 2 === 1) {
            pOdd += score.prob;
        }
    });
    const pEven = 1 - pOdd;
    document.getElementById('oddEvenTable').innerHTML = `
        <tr><td>Odd</td><td class="num-col">${probToOdds(pOdd)}</td></tr>
        <tr><td>Even</td><td class="num-col">${probToOdds(pEven)}</td></tr>
    `;

    // --- BOTH/EACH PLAYER TO WIN FRAME ---
    // P(Player 1 wins at least 1 frame) = 1 - P(Player 1 wins 0 frames)
    // P(Player 2 wins at least 1 frame) = 1 - P(Player 2 wins 0 frames)
    const cleanSweepHome = exactScores.find(s => s.label === `${framesToWin}-0`)?.prob || 0;
    const cleanSweepAway = exactScores.find(s => s.label === `0-${framesToWin}`)?.prob || 0;
    const pPlayer1WinsFrame = 1 - cleanSweepAway;
    const pPlayer2WinsFrame = 1 - cleanSweepHome;
    const pBothWinFrame = 1 - cleanSweepHome - cleanSweepAway;

    document.getElementById('bothWinFrameTable').innerHTML = `
        <tr><td>Player 1 to win a frame</td><td class="num-col">${probToOdds(pPlayer1WinsFrame)}</td></tr>
        <tr><td>Player 2 to win a frame</td><td class="num-col">${probToOdds(pPlayer2WinsFrame)}</td></tr>
        <tr><td>Both to win a frame</td><td class="num-col">${probToOdds(pBothWinFrame)}</td></tr>
    `;

    // --- WINNER & TOTAL ---
    // Combine winner probabilities with total frames over/under
    let winnerTotalHtml = '';

    // Use the middle total line for winner & total combos
    const middleTotalLine = totalLines[Math.floor(totalLines.length / 2)];

    if (middleTotalLine) {
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

        // Winner & Total combinations (assuming independence)
        const homeOver = homeWinProb * pOverLine;
        const homeUnder = homeWinProb * pUnderLine;
        const awayOver = awayWinProb * pOverLine;
        const awayUnder = awayWinProb * pUnderLine;

        winnerTotalHtml += `<tr><td>Player 1 & Over ${middleTotalLine.toFixed(1)}</td><td class="num-col prob-col">${(homeOver * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(homeOver)}</td></tr>`;
        winnerTotalHtml += `<tr><td>Player 1 & Under ${middleTotalLine.toFixed(1)}</td><td class="num-col prob-col">${(homeUnder * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(homeUnder)}</td></tr>`;
        winnerTotalHtml += `<tr><td>Player 2 & Over ${middleTotalLine.toFixed(1)}</td><td class="num-col prob-col">${(awayOver * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(awayOver)}</td></tr>`;
        winnerTotalHtml += `<tr><td>Player 2 & Under ${middleTotalLine.toFixed(1)}</td><td class="num-col prob-col">${(awayUnder * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(awayUnder)}</td></tr>`;
    }
    document.getElementById('winnerTotalTable').innerHTML = winnerTotalHtml;

    // --- FRAME PROGRESSION MARKETS ---

    // 1. First Frame Winner
    document.getElementById('firstFrameTable').innerHTML = `
        <tr><td>Player 1</td><td class="num-col">${probToOdds(frameHomeProb)}</td></tr>
        <tr><td>Player 2</td><td class="num-col">${probToOdds(frameAwayProb)}</td></tr>
    `;

    // 2. First to 3 Frames
    const firstTo3HomeProb = getMatchWinProb(frameHomeProb, 5); // First to 3 = Best of 5
    const firstTo3AwayProb = 1 - firstTo3HomeProb;
    document.getElementById('firstTo3Table').innerHTML = `
        <tr><td>Player 1</td><td class="num-col">${probToOdds(firstTo3HomeProb)}</td></tr>
        <tr><td>Player 2</td><td class="num-col">${probToOdds(firstTo3AwayProb)}</td></tr>
    `;

    // 3. Result After 4 Frames
    const after4 = calculateResultAfterNFrames(frameHomeProb, 4);
    document.getElementById('after4FramesTable').innerHTML = after4.map(r =>
        `<tr><td>${r.score}</td><td class="num-col prob-col">${(r.prob * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(r.prob)}</td></tr>`
    ).join('');

    // 4. Result After 6 Frames
    const after6 = calculateResultAfterNFrames(frameHomeProb, 6);
    document.getElementById('after6FramesTable').innerHTML = after6.map(r =>
        `<tr><td>${r.score}</td><td class="num-col prob-col">${(r.prob * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(r.prob)}</td></tr>`
    ).join('');

    // 5. Result After 8 Frames
    const after8 = calculateResultAfterNFrames(frameHomeProb, 8);
    document.getElementById('after8FramesTable').innerHTML = after8.map(r =>
        `<tr><td>${r.score}</td><td class="num-col prob-col">${(r.prob * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(r.prob)}</td></tr>`
    ).join('');
}

// Helper function to calculate exact score probabilities
function calculateExactScores(frameWinProb, framesToWin, bestOf) {
    // Calculate all possible exact scores in a best-of-X match
    // Uses frame win probability derived from reverse solver (solveImpliedFrameProb)
    // which finds the exact p such that getMatchWinProb(p, bestOf) = targetMatchProb

    const p = frameWinProb;
    const q = 1 - p;
    const scores = [];

    // Generate all possible winning scores
    // Winner needs framesToWin, loser has 0 to (framesToWin - 1)

    for (let loserFrames = 0; loserFrames < framesToWin; loserFrames++) {
        // Home wins framesToWin to loserFrames
        const homeWins = framesToWin;
        const totalFramesPlayed = homeWins + loserFrames;

        // Binomial probability: C(totalFramesPlayed - 1, loserFrames) * p^framesToWin * q^loserFrames
        // The last frame must be won by the winner, so we choose from the previous frames
        const prob = binomialCoefficient(totalFramesPlayed - 1, loserFrames) *
                     Math.pow(p, framesToWin) * Math.pow(q, loserFrames);

        scores.push({
            label: `${homeWins}-${loserFrames}`,
            prob: prob
        });
    }

    for (let loserFrames = 0; loserFrames < framesToWin; loserFrames++) {
        // Away wins framesToWin to loserFrames
        const awayWins = framesToWin;
        const totalFramesPlayed = awayWins + loserFrames;

        const prob = binomialCoefficient(totalFramesPlayed - 1, loserFrames) *
                     Math.pow(q, framesToWin) * Math.pow(p, loserFrames);

        scores.push({
            label: `${loserFrames}-${awayWins}`,
            prob: prob
        });
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

// Helper function to calculate binomial coefficient
function binomialCoefficient(n, k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;

    let result = 1;
    for (let i = 1; i <= k; i++) {
        result *= (n - i + 1) / i;
    }
    return result;
}

// Helper function to calculate result distribution after N frames
function calculateResultAfterNFrames(frameHomeProb, totalFrames) {
    // Calculate probability of each possible score after exactly N frames
    // Uses binomial distribution: P(k wins in n trials) = C(n,k) * p^k * (1-p)^(n-k)

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

// --- NEW SOLVER FUNCTIONS ---

// 1. Forward Function: Calculate Match Win % given Frame Win %
function getMatchWinProb(p, bestOf) {
    if (bestOf % 2 === 0) bestOf++; // Handle edge case if even
    const framesToWin = Math.ceil(bestOf / 2);
    const q = 1 - p;
    let matchWinProb = 0;

    // Sum probabilities of winning framesToWin-0, framesToWin-1, ... framesToWin-(framesToWin-1)
    for (let lost = 0; lost < framesToWin; lost++) {
        // Negative Binomial PDF:
        // Prob of winning Nth frame exactly at trial (N+lost)
        // = nCr(N + lost - 1, lost) * p^N * q^lost
        const framesPlayed = framesToWin + lost;
        const prob = binomialCoefficient(framesPlayed - 1, lost) * Math.pow(p, framesToWin) * Math.pow(q, lost);
        matchWinProb += prob;
    }
    return matchWinProb;
}

// 2. Reverse Solver: Find Frame % that outputs Target Match %
function solveImpliedFrameProb(targetMatchProb, bestOf) {
    // Binary Search
    let low = 0.01;
    let high = 0.99;
    let mid = 0.5;
    let iter = 0;

    // Optimization: If target is 50%, frame is 50%
    if (Math.abs(targetMatchProb - 0.5) < 0.001) return 0.5;

    while (iter < 50) { // 50 iterations is plenty for high precision
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
