import * as TennisAPI from './js/tennis_api.js';
import { TennisEngine } from './tennis_engine.js';
import { tennisEloService } from './js/tennis_elo_service.js';

const engine = new TennisEngine();

// Store current match players for Elo lookup
let currentPlayer1 = null;
let currentPlayer2 = null;
let currentSurface = 'Hard';

window.runModel = function (surface = 'Hard') {
    try {
        const odds1 = parseFloat(document.getElementById('player1Odds').value);
        const odds2 = parseFloat(document.getElementById('player2Odds').value);
        let totalLine = parseFloat(document.getElementById('totalGamesLine').value);

        // Read Over/Under odds if present
        const oddsOver = parseFloat(document.getElementById('oddsOver')?.value);
        const oddsUnder = parseFloat(document.getElementById('oddsUnder')?.value);

        if (surface) {
            document.getElementById('surfaceBadge').textContent = surface;
            currentSurface = surface;
        }

        if (!odds1 || !odds2) return;

        // Fetch Elo-based hold probabilities if player names are available
        let eloHoldProbs = null;
        if (currentPlayer1 && currentPlayer2) {
            eloHoldProbs = tennisEloService.getEloAdjustedHoldProbs(
                currentPlayer1,
                currentPlayer2,
                surface
            );

            if (eloHoldProbs) {
                console.log('Using Elo-enhanced priors:', eloHoldProbs);
            }
        }

        // PHASE 2: Handle Synthetic Total and Fair Total Adjustment
        let isSynthetic = false;
        let isAdjusted = false;
        let targetTotal = totalLine;

        const totalLineInput = document.getElementById('totalGamesLine');

        // Step 1: Check if Total Line is missing -> Generate Synthetic Total
        if (!totalLine || isNaN(totalLine)) {
            targetTotal = engine.estimateSyntheticTotal(odds1, odds2, surface);
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

        // 2. Solve (with adjusted/synthetic total and Elo-enhanced priors)
        const result = engine.solveParameters(fairParams.p1, targetTotal, surface, eloHoldProbs);
        displayParameters(result, eloHoldProbs);

        // 3. Derivatives
        const derivatives = engine.generateDerivatives(result.pa, result.pb, result.calibration);
        displayDerivatives(derivatives);

        // Show all result cards including Elo card
        document.querySelectorAll('.card.hidden').forEach(c => c.classList.remove('hidden'));

    } catch (e) {
        console.error("Model Error:", e);
    }
};

function displayFairValue(fair) {
    document.getElementById('fairP1').textContent = (1 / fair.p1).toFixed(2);
    document.getElementById('fairP2').textContent = (1 / fair.p2).toFixed(2);
}

function displayParameters(result, eloHoldProbs = null) {
    document.getElementById('p1Hold').textContent = (result.pa * 100).toFixed(1) + '%';
    document.getElementById('p2Hold').textContent = (result.pb * 100).toFixed(1) + '%';
    document.getElementById('modelTotal').textContent = result.calibration.expTotal.toFixed(2);
    document.getElementById('fairWin').textContent = (result.calibration.pMatch * 100).toFixed(1) + '%';

    // Display expected games per player
    if (result.calibration.expGamesPlayer1 !== undefined) {
        document.getElementById('p1Games').textContent = result.calibration.expGamesPlayer1.toFixed(1);
    }
    if (result.calibration.expGamesPlayer2 !== undefined) {
        document.getElementById('p2Games').textContent = result.calibration.expGamesPlayer2.toFixed(1);
    }

    // Display Elo ratings if available
    displayEloRatings(eloHoldProbs);
}

/**
 * Display Elo ratings and related data
 */
function displayEloRatings(eloHoldProbs) {
    const eloInfoEl = document.getElementById('eloInfo');
    if (!eloInfoEl) return;

    if (!currentPlayer1 || !currentPlayer2) {
        eloInfoEl.innerHTML = '<p class="text-sm text-gray-500">Select a match to see Elo ratings</p>';
        return;
    }

    const player1Data = tennisEloService.getPlayerData(currentPlayer1);
    const player2Data = tennisEloService.getPlayerData(currentPlayer2);

    if (!player1Data || !player2Data) {
        eloInfoEl.innerHTML = '<p class="text-sm text-yellow-600">⚠️ Elo data not available for these players</p>';
        return;
    }

    // Get surface-specific Elo
    const player1Elo = tennisEloService.getPlayerElo(currentPlayer1, currentSurface);
    const player2Elo = tennisEloService.getPlayerElo(currentPlayer2, currentSurface);

    // Calculate Elo-based win probability
    const eloWinProb = tennisEloService.calculateWinProbability(currentPlayer1, currentPlayer2, currentSurface);

    const eloEnhanced = eloHoldProbs ? '✓ Elo-Enhanced' : '';

    eloInfoEl.innerHTML = `
        <div class="space-y-2">
            <div class="flex justify-between items-center">
                <h4 class="font-semibold text-sm">Elo Ratings (${currentSurface})</h4>
                ${eloEnhanced ? '<span class="text-xs text-green-600 font-medium">' + eloEnhanced + '</span>' : ''}
            </div>
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <div class="font-medium text-gray-700">${player1Data.name}</div>
                    <div class="text-gray-600">Elo: <span class="font-mono">${player1Elo.toFixed(0)}</span></div>
                    <div class="text-gray-600">ATP: #${player1Data.atpRank || 'N/A'}</div>
                </div>
                <div>
                    <div class="font-medium text-gray-700">${player2Data.name}</div>
                    <div class="text-gray-600">Elo: <span class="font-mono">${player2Elo.toFixed(0)}</span></div>
                    <div class="text-gray-600">ATP: #${player2Data.atpRank || 'N/A'}</div>
                </div>
            </div>
            ${eloWinProb ? `
                <div class="mt-2 pt-2 border-t">
                    <div class="text-xs text-gray-600">
                        Elo Win Probability:
                        <span class="font-mono font-semibold">${(eloWinProb * 100).toFixed(1)}%</span> -
                        <span class="font-mono font-semibold">${((1 - eloWinProb) * 100).toFixed(1)}%</span>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

/**
 * Update current match players (called from tennis_api.js)
 */
window.setCurrentPlayers = function(player1, player2, surface = 'Hard') {
    currentPlayer1 = player1;
    currentPlayer2 = player2;
    currentSurface = surface;
    console.log('Players set:', player1, 'vs', player2, 'on', surface);
};

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
    // Initialize Elo service
    try {
        await tennisEloService.fetchEloRatings();
        console.log('Elo ratings loaded successfully');
    } catch (error) {
        console.warn('Failed to load Elo ratings:', error);
        // Continue even if Elo data fails to load
    }

    // Initialize Tennis API
    TennisAPI.setRunModelCallback(window.runModel);
    await TennisAPI.initLoader();

    document.getElementById('tournamentSelect').addEventListener('change', TennisAPI.handleTournamentChange);
    document.getElementById('matchSelect').addEventListener('change', TennisAPI.handleMatchChange);

    const inputs = document.querySelectorAll('input');
    inputs.forEach(i => i.addEventListener('input', () => window.runModel(document.getElementById('surfaceBadge').textContent)));
});
