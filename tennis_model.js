// Tennis Model - Monte Carlo Simulation Based
// Calculates serve hold percentages from market odds, then derives all markets

import * as TennisAPI from './js/tennis_api.js';
import { TennisEngine } from './tennis_engine.js';

// Initialize the Monte Carlo engine
const tennisEngine = new TennisEngine();

// Remove vigorish and get fair probabilities
function removeFair(odds1, odds2) {
    const imp1 = 1 / odds1;
    const imp2 = 1 / odds2;
    const total = imp1 + imp2;

    return {
        prob1: imp1 / total,
        prob2: imp2 / total,
        margin: ((total - 1) * 100).toFixed(2)
    };
}

// Calculate first set winner probability from match winner probability
function calcFirstSetProb(pMatch) {
    const z = 3.25 * pMatch - 1.72;
    const pFirstSet = 1 / (1 + Math.exp(-z));
    return pFirstSet;
}

// Main model runner
window.runModel = function() {
    try {
        // Get input values
        const player1Odds = parseFloat(document.getElementById('player1Odds').value);
        const player2Odds = parseFloat(document.getElementById('player2Odds').value);
        const totalGamesLine = parseFloat(document.getElementById('totalGamesLine').value);

        // Validate inputs
        if (!player1Odds || !player2Odds) {
            return; // Need at least match winner odds
        }

        if (!totalGamesLine || totalGamesLine <= 0) {
            alert('Please enter a Total Games line. The model requires both match winner odds and total games to calculate hold percentages.');
            return;
        }

        // Calculate fair probabilities for match winner
        const matchFair = removeFair(player1Odds, player2Odds);

        // Update margin display
        document.getElementById('moneylineMargin').textContent = `Margin: ${matchFair.margin}%`;

        // Run Monte Carlo engine
        console.log('=== Running Monte Carlo Tennis Engine ===');
        const results = tennisEngine.generatePrices(player1Odds, player2Odds, totalGamesLine);

        console.log('Calibration:', results.calibration);

        // Display calibrated parameters
        displayParameters(results.calibration);

        // Display match odds
        displayMatchOdds(matchFair);

        // Display first set winner
        const pFirstSet1 = calcFirstSetProb(matchFair.prob1);
        const pFirstSet2 = 1 - pFirstSet1;
        displayFirstSetWinner(pFirstSet1, pFirstSet2);

        // Display all derived markets from simulation
        displayCorrectScores(results.markets.setBetting);
        displaySetHandicaps(results.markets.setHandicaps);
        displayGameHandicaps(results.markets.gameHandicaps);
        displayTotalGames(results.markets.totalGames);

        // Show all result areas
        document.getElementById('parametersArea')?.classList.remove('hidden');
        document.getElementById('marketsArea')?.classList.remove('hidden');
        document.getElementById('firstSetArea')?.classList.remove('hidden');
        document.getElementById('exactScoreArea')?.classList.remove('hidden');

    } catch (error) {
        console.error('Error running model:', error);
        alert('Error running model: ' + error.message);
    }
};

// Display calibrated parameters
function displayParameters(calibration) {
    document.getElementById('p1HoldRate').textContent = calibration.p1HoldRate;
    document.getElementById('p2HoldRate').textContent = calibration.p2HoldRate;
    document.getElementById('simWinProb').textContent = calibration.simulatedWinProb;
    document.getElementById('simTotalGames').textContent = calibration.simulatedTotalGames;
}

// Display match odds
function displayMatchOdds(fair) {
    document.getElementById('fairPlayer1').textContent = (1 / fair.prob1).toFixed(2);
    document.getElementById('fairPlayer2').textContent = (1 / fair.prob2).toFixed(2);
}

// Display first set winner
function displayFirstSetWinner(pFirstSet1, pFirstSet2) {
    const tbody = document.getElementById('firstSetWinnerTable');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td>Player 1</td>
            <td class="num-col">${(pFirstSet1 * 100).toFixed(2)}%</td>
            <td class="num-col">${(1 / pFirstSet1).toFixed(2)}</td>
        </tr>
        <tr>
            <td>Player 2</td>
            <td class="num-col">${(pFirstSet2 * 100).toFixed(2)}%</td>
            <td class="num-col">${(1 / pFirstSet2).toFixed(2)}</td>
        </tr>
    `;
}

// Display correct scores from simulation
function displayCorrectScores(setBetting) {
    const tbody = document.getElementById('correctScoreTable');
    if (!tbody) return;

    const scores = [
        { score: '2-0', data: setBetting['2-0'] },
        { score: '2-1', data: setBetting['2-1'] },
        { score: '1-2', data: setBetting['1-2'] },
        { score: '0-2', data: setBetting['0-2'] }
    ];

    let html = '';
    scores.forEach(({ score, data }) => {
        if (data && data.odds) {
            html += `
                <tr>
                    <td>${score}</td>
                    <td class="num-col">${data.prob}</td>
                    <td class="num-col">${data.odds}</td>
                </tr>
            `;
        }
    });

    tbody.innerHTML = html;
}

// Display set handicaps from simulation
function displaySetHandicaps(setHandicaps) {
    const tbody = document.getElementById('setHandicapTable');
    if (!tbody) return;

    let html = '';
    for (const [line, handicap] of Object.entries(setHandicaps)) {
        const lineNum = parseFloat(line);
        if (handicap.player1 && handicap.player1.odds) {
            html += `
                <tr>
                    <td>${lineNum > 0 ? '+' : ''}${lineNum.toFixed(1)}</td>
                    <td class="num-col">${handicap.player1.odds}</td>
                    <td class="num-col">${handicap.player2.odds}</td>
                </tr>
            `;
        }
    }

    tbody.innerHTML = html;
}

// Display game handicaps from simulation
function displayGameHandicaps(gameHandicaps) {
    const tbody = document.getElementById('gameHandicapTable');
    if (!tbody) return;

    let html = '';
    for (const [line, handicap] of Object.entries(gameHandicaps)) {
        const lineNum = parseFloat(line);
        if (handicap.player1 && handicap.player1.odds) {
            html += `
                <tr>
                    <td>${lineNum > 0 ? '+' : ''}${lineNum.toFixed(1)}</td>
                    <td class="num-col">${handicap.player1.odds}</td>
                    <td class="num-col">${handicap.player2.odds}</td>
                </tr>
            `;
        }
    }

    tbody.innerHTML = html;
}

// Display total games from simulation
function displayTotalGames(totalGamesMarkets) {
    const tbody = document.getElementById('totalGamesTable');
    if (!tbody) return;

    let html = '';
    for (const [line, totals] of Object.entries(totalGamesMarkets)) {
        const lineNum = parseFloat(line);
        if (totals.over && totals.over.odds) {
            html += `
                <tr>
                    <td>${lineNum.toFixed(1)}</td>
                    <td class="num-col">${totals.over.odds}</td>
                    <td class="num-col">${totals.under.odds}</td>
                </tr>
            `;
        }
    }

    tbody.innerHTML = html;
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    // Set up API callback
    TennisAPI.setRunModelCallback(window.runModel);

    // Initialize match loader
    await TennisAPI.initLoader();

    // Set up event listeners
    document.getElementById('tournamentSelect')?.addEventListener('change', TennisAPI.handleTournamentChange);
    document.getElementById('matchSelect')?.addEventListener('change', TennisAPI.handleMatchChange);

    // Add input listeners for manual changes
    const inputs = document.querySelectorAll('input[type="number"]');
    inputs.forEach(input => {
        input.addEventListener('input', window.runModel);
    });
});
