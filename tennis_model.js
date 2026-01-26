import * as TennisAPI from './js/tennis_api.js';
import { TennisMarkovEngine } from './js/tennis_markov_engine.js';
import { BaseModel } from './js/base_model.js';

class TennisModel extends BaseModel {
    constructor() {
        super(new TennisMarkovEngine());
        this.currentPlayer1 = null;
        this.currentPlayer2 = null;
        this.currentSurface = 'Hard';
        this.currentTour = 'ATP'; // Default to ATP
    }

    runModel(surface = 'Hard') {
        try {
        const odds1 = parseFloat(document.getElementById('player1Odds').value);
        const odds2 = parseFloat(document.getElementById('player2Odds').value);
        let totalLine = parseFloat(document.getElementById('totalGamesLine').value);

        // Read Over/Under odds if present
        const oddsOver = parseFloat(document.getElementById('oddsOver')?.value);
        const oddsUnder = parseFloat(document.getElementById('oddsUnder')?.value);

        const surfaceToUse = surface || this.currentSurface || 'Hard';
        document.getElementById('surfaceBadge').textContent = surfaceToUse;
        this.currentSurface = surfaceToUse;

        if (!odds1 || !odds2) return;

        const eloHoldProbs = null;

        // PHASE 2: Handle Synthetic Total and Fair Total Adjustment
        let isSynthetic = false;
        let isAdjusted = false;
        let targetTotal = totalLine;

        const totalLineInput = document.getElementById('totalGamesLine');

        const { engine } = this;

        // Step 1: Check if Total Line is missing -> Generate Synthetic Total
        if (!totalLine || isNaN(totalLine)) {
            targetTotal = engine.estimateSyntheticTotal(odds1, odds2, surfaceToUse);
            totalLineInput.value = targetTotal.toFixed(1);
            isSynthetic = true;

            // Visual feedback for synthetic data
            totalLineInput.style.borderColor = '#f97316'; // Orange
            totalLineInput.style.borderWidth = '2px';
            totalLineInput.title = 'Estimated based on Match Odds & Surface';
        }
        // Step 2: If Over/Under odds are present -> Calculate Fair Total
        else if (oddsOver && oddsUnder && !isNaN(oddsOver) && !isNaN(oddsUnder)) {
            targetTotal = engine.calculateExpectedTotalFromOdds(totalLine, oddsOver, oddsUnder);
            isAdjusted = true;

            // Visual feedback for adjusted data
            totalLineInput.style.borderColor = '#3b82f6'; // Blue
            totalLineInput.style.borderWidth = '2px';
            totalLineInput.title = `Fair Total: ${targetTotal.toFixed(2)} (Adjusted from ${totalLine} using O/U odds)`;
        }
        // Step 3: Normal case - use raw line
        else {
            // Reset styling for normal input
            totalLineInput.style.borderColor = '';
            totalLineInput.style.borderWidth = '';
            totalLineInput.title = '';
        }

        // Display total info
        const totalInfoEl = document.getElementById('totalInfo');
        if (totalInfoEl) {
            if (isSynthetic) {
                totalInfoEl.textContent = `(Est)`;
                totalInfoEl.style.color = '#f97316';
            } else if (isAdjusted) {
                totalInfoEl.textContent = `(Fair: ${targetTotal.toFixed(2)})`;
                totalInfoEl.style.color = '#3b82f6';
            } else {
                totalInfoEl.textContent = '';
            }
        }

        // 1. De-vig
        const fairParams = engine.removeVigorish(odds1, odds2);
        displayFairValue(fairParams);

        // 2. Calculate Direct Player Expected Games (market-driven, bypasses simulation)
        let directPlayerGames = null;
        if (targetTotal && oddsOver && oddsUnder && !isNaN(oddsOver) && !isNaN(oddsUnder)) {
            // Use the fair total already calculated (or targetTotal if not adjusted)
            directPlayerGames = engine.getDirectPlayerGames(fairParams.p1, targetTotal);
            console.log('Direct Player Games (market-driven):', directPlayerGames);
        }

        // 3. Solve (with adjusted/synthetic total)
        const result = engine.solveParameters(fairParams.p1, targetTotal, surfaceToUse, eloHoldProbs);
        displayParameters(result, directPlayerGames);

        // 4. Derivatives (pass directPlayerGames for market-driven handicap calculation)
        const derivatives = engine.generateDerivatives(result.pa, result.pb, result.calibration, directPlayerGames);
        displayDerivatives(derivatives);

        // Show all result cards + markets container
        document.querySelectorAll('.card.hidden, .tab-container.hidden').forEach(el => el.classList.remove('hidden'));

        } catch (e) {
            console.error("Model Error:", e);
        }
    }
}

function displayFairValue(fair) {
    document.getElementById('fairP1').textContent = (1 / fair.p1).toFixed(2);
    document.getElementById('fairP2').textContent = (1 / fair.p2).toFixed(2);
}

function displayParameters(result, directPlayerGames = null) {
    document.getElementById('p1Hold').textContent = (result.pa * 100).toFixed(1) + '%';
    document.getElementById('p2Hold').textContent = (result.pb * 100).toFixed(1) + '%';
    document.getElementById('modelTotal').textContent = result.calibration.expTotal.toFixed(2);
    document.getElementById('fairWin').textContent = (result.calibration.pMatch * 100).toFixed(1) + '%';

    // Display expected games per player
    // Prioritize direct market-driven calculation if available, otherwise use simulation
    if (directPlayerGames) {
        // Use direct statistical calculation (bypasses solver/simulation)
        document.getElementById('p1Games').textContent = directPlayerGames.p1.toFixed(1);
        document.getElementById('p2Games').textContent = directPlayerGames.p2.toFixed(1);

        // Visual indicator that this is using direct calculation
        const p1GamesEl = document.getElementById('p1Games');
        const p2GamesEl = document.getElementById('p2Games');
        if (p1GamesEl && p2GamesEl) {
            p1GamesEl.title = `Direct calculation from market odds (Spread: ${directPlayerGames.spread > 0 ? '+' : ''}${directPlayerGames.spread.toFixed(1)})`;
            p2GamesEl.title = `Direct calculation from market odds (Spread: ${directPlayerGames.spread > 0 ? '+' : ''}${directPlayerGames.spread.toFixed(1)})`;
        }
    } else if (result.calibration.expGamesPlayer1 !== undefined) {
        // Fallback to simulation-based calculation
        document.getElementById('p1Games').textContent = result.calibration.expGamesPlayer1.toFixed(1);
        document.getElementById('p2Games').textContent = result.calibration.expGamesPlayer2.toFixed(1);

        const p1GamesEl = document.getElementById('p1Games');
        const p2GamesEl = document.getElementById('p2Games');
        if (p1GamesEl && p2GamesEl) {
            p1GamesEl.title = 'Simulation-based calculation';
            p2GamesEl.title = 'Simulation-based calculation';
        }
    }

}

function displayDerivatives(d) {
    // Set Betting
    const sb = d.setBetting;
    const scores = ['2-0', '2-1', '0-2', '1-2'];
    let html = '';
    scores.forEach(s => {
        html += `<tr>
            <td style="text-align: left;">${s}</td>
            <td style="text-align: center;">${sb[s].prob}</td>
            <td style="text-align: center;">${sb[s].odds}</td>
        </tr>`;
    });
    document.getElementById('correctScoreTable').innerHTML = html;

    // Set Winner (Set 1)
    const sw = d.setWinner;
    const swTable = document.getElementById('setWinnerTable');
    if (swTable) {
        swTable.innerHTML = `
            <tr>
                <td style="text-align: left;">Player 1</td>
                <td style="text-align: center;">${sw.player1.prob}</td>
                <td style="text-align: center;">${sw.player1.odds}</td>
            </tr>
            <tr>
                <td style="text-align: left;">Player 2</td>
                <td style="text-align: center;">${sw.player2.prob}</td>
                <td style="text-align: center;">${sw.player2.odds}</td>
            </tr>
        `;
    }

    // Both to Win Set
    const btwsEl = document.getElementById('bothToWinSetProb');
    if (btwsEl && d.bothToWinSet) {
        btwsEl.textContent = `${d.bothToWinSet.prob} (${d.bothToWinSet.odds})`;
    }

    // Game Handicap
    const gh = d.gameHandicap;
    let ghHtml = '';
    const lines = [-5.5, -4.5, -3.5, -2.5, -1.5, 1.5, 2.5, 3.5, 4.5, 5.5];

    lines.forEach(l => {
        if (gh[l]) {
            ghHtml += `<tr>
                <td style="text-align: left;">${l > 0 ? '+' : ''}${l}</td>
                <td style="text-align: center;">${gh[l].player1.odds}</td>
                <td style="text-align: center;">${gh[l].player2.odds}</td>
            </tr>`;
        }
    });
    document.getElementById('gameHandicapTable').innerHTML = ghHtml;

    // Player Total Games
    if (d.playerTotals) {
        displayPlayerTotals(d.playerTotals);
    }

    // Tie Break
    document.getElementById('tbProb').textContent = (d.tieBreakProb * 100).toFixed(1) + '%';
}

/**
 * Display Player Total Games markets
 */
function displayPlayerTotals(playerTotals) {
    // Player 1 Totals
    const p1Table = document.getElementById('player1TotalsTable');
    if (p1Table && playerTotals.player1) {
        let html = '';
        Object.keys(playerTotals.player1).sort((a, b) => parseFloat(a) - parseFloat(b)).forEach(line => {
            const market = playerTotals.player1[line];
            html += `<tr>
                <td style="text-align: left; padding: 8px;">${line}</td>
                <td style="text-align: center; padding: 8px;">${market.over.odds}</td>
                <td style="text-align: center; padding: 8px;">${market.under.odds}</td>
            </tr>`;
        });
        p1Table.innerHTML = html;
    }

    // Player 2 Totals
    const p2Table = document.getElementById('player2TotalsTable');
    if (p2Table && playerTotals.player2) {
        let html = '';
        Object.keys(playerTotals.player2).sort((a, b) => parseFloat(a) - parseFloat(b)).forEach(line => {
            const market = playerTotals.player2[line];
            html += `<tr>
                <td style="text-align: left; padding: 8px;">${line}</td>
                <td style="text-align: center; padding: 8px;">${market.over.odds}</td>
                <td style="text-align: center; padding: 8px;">${market.under.odds}</td>
            </tr>`;
        });
        p2Table.innerHTML = html;
    }
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Tennis API
    TennisAPI.setRunModelCallback(window.runModel);
    await TennisAPI.initLoader();

    document.getElementById('tournamentSelect').addEventListener('change', TennisAPI.handleTournamentChange);
    document.getElementById('matchSelect').addEventListener('change', TennisAPI.handleMatchChange);

    const inputs = document.querySelectorAll('input');
    inputs.forEach(i => i.addEventListener('input', () => window.runModel(document.getElementById('surfaceBadge').textContent)));
});

const tennisModel = new TennisModel();
window.runModel = (surface) => tennisModel.runModel(surface);
window.setCurrentPlayers = (p1, p2, surface, tour) => {
    tennisModel.currentPlayer1 = p1;
    tennisModel.currentPlayer2 = p2;
    tennisModel.currentSurface = surface;
    tennisModel.currentTour = tour;
};
