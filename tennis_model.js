import * as TennisAPI from './js/tennis_api.js';
import { TennisEngine } from './tennis_engine.js';

const engine = new TennisEngine();

window.runModel = function (surface = 'Hard') {
    try {
        const odds1 = parseFloat(document.getElementById('player1Odds').value);
        const odds2 = parseFloat(document.getElementById('player2Odds').value);
        const totalLine = parseFloat(document.getElementById('totalGamesLine').value);

        if (surface) document.getElementById('surfaceBadge').textContent = surface;

        if (!odds1 || !odds2 || !totalLine) return;

        // 1. De-vig
        const fairParams = engine.removeVigorish(odds1, odds2);
        displayFairValue(fairParams);

        // 2. Solve
        const result = engine.solveParameters(fairParams.p1, totalLine, surface);
        displayParameters(result);

        // 3. Derivatives
        const derivatives = engine.generateDerivatives(result.pa, result.pb, result.calibration);
        displayDerivatives(derivatives);

        document.querySelectorAll('.card.hidden').forEach(c => c.classList.remove('hidden'));

    } catch (e) {
        console.error("Model Error:", e);
    }
};

function displayFairValue(fair) {
    document.getElementById('fairP1').textContent = (1 / fair.p1).toFixed(2);
    document.getElementById('fairP2').textContent = (1 / fair.p2).toFixed(2);
}

function displayParameters(result) {
    document.getElementById('p1Hold').textContent = (result.pa * 100).toFixed(1) + '%';
    document.getElementById('p2Hold').textContent = (result.pb * 100).toFixed(1) + '%';
    document.getElementById('modelTotal').textContent = result.calibration.expTotal.toFixed(2);
    document.getElementById('fairWin').textContent = (result.calibration.pMatch * 100).toFixed(1) + '%';
}

function displayDerivatives(d) {
    // Set Betting
    const sb = d.setBetting;
    const scores = ['2-0', '2-1', '0-2', '1-2'];
    let html = '';
    scores.forEach(s => {
        html += `<tr><td>${s}</td><td>${sb[s].prob}</td><td>${sb[s].odds}</td></tr>`;
    });
    document.getElementById('correctScoreTable').innerHTML = html;

    // Set Winner (Set 1)
    const sw = d.setWinner;
    const swTable = document.getElementById('setWinnerTable');
    if (swTable) {
        swTable.innerHTML = `
            <tr><td>Player 1</td><td>${sw.player1.prob}</td><td>${sw.player1.odds}</td></tr>
            <tr><td>Player 2</td><td>${sw.player2.prob}</td><td>${sw.player2.odds}</td></tr>
        `;
    }

    // Game Handicap
    const gh = d.gameHandicap;
    let ghHtml = '';
    const lines = [-5.5, -4.5, -3.5, -2.5, -1.5, 1.5, 2.5, 3.5, 4.5, 5.5];

    lines.forEach(l => {
        if (gh[l]) {
            ghHtml += `<tr><td>${l > 0 ? '+' : ''}${l}</td><td>${gh[l].player1.odds}</td><td>${gh[l].player2.odds}</td></tr>`;
        }
    });
    document.getElementById('gameHandicapTable').innerHTML = ghHtml;

    // Tie Break
    document.getElementById('tbProb').textContent = (d.tieBreakProb * 100).toFixed(1) + '%';
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
    TennisAPI.setRunModelCallback(window.runModel);
    await TennisAPI.initLoader();

    document.getElementById('tournamentSelect').addEventListener('change', TennisAPI.handleTournamentChange);
    document.getElementById('matchSelect').addEventListener('change', TennisAPI.handleMatchChange);

    const inputs = document.querySelectorAll('input');
    inputs.forEach(i => i.addEventListener('input', () => window.runModel(document.getElementById('surfaceBadge').textContent)));
});
