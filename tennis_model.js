import * as TennisAPI from './js/tennis_api.js';
import { TennisMarkovEngine } from './js/tennis_markov_engine.js';
import { tennisEloService } from './js/tennis_elo_service.js';
import { tennisWtaEloService } from './js/tennis_wta_elo_service.js';
import { BaseModel } from './js/base_model.js';
import { isValidOdds } from './js/core/math_utils.js';

// Module-level variables used by standalone display functions
let currentPlayer1 = null;
let currentPlayer2 = null;
let currentSurface = 'Hard';
let currentTour = 'ATP';

// Cached DOM element references — populated in DOMContentLoaded
const el = {};

class TennisModel extends BaseModel {
    constructor() {
        super(new TennisMarkovEngine());
        this.currentPlayer1 = null;
        this.currentPlayer2 = null;
        this.currentSurface = 'Hard';
        this.currentTour = 'ATP';
    }

    runModel(surface = 'Hard') {
    try {
        const odds1 = parseFloat(el.player1Odds.value);
        const odds2 = parseFloat(el.player2Odds.value);
        let totalLine = parseFloat(el.totalGamesLine.value);

        // Read Over/Under odds if present
        const oddsOver = parseFloat(el.oddsOver?.value);
        const oddsUnder = parseFloat(el.oddsUnder?.value);

        if (surface) {
            el.surfaceBadge.textContent = surface;
            this.currentSurface = surface;
        }

        if (isNaN(odds1) || isNaN(odds2)) return;
        if (!isValidOdds(odds1) || !isValidOdds(odds2)) {
            this.showError('Match odds must be between 1.01 and 1001');
            return;
        }
        this.clearError();

        // Fetch Elo-based hold probabilities if player names are available
        let eloHoldProbs = null;
        if (this.currentPlayer1 && this.currentPlayer2) {
            const eloService = this.currentTour === 'WTA' ? tennisWtaEloService : tennisEloService;
            eloHoldProbs = eloService.getEloAdjustedHoldProbs(
                this.currentPlayer1,
                this.currentPlayer2,
                surface
            );
        }

        // PHASE 2: Handle Synthetic Total and Fair Total Adjustment
        let isSynthetic = false;
        let isAdjusted = false;
        let targetTotal = totalLine;

        // Step 1: Check if Total Line is missing -> Generate Synthetic Total
        if (!totalLine || isNaN(totalLine)) {
            targetTotal = this.engine.estimateSyntheticTotal(odds1, odds2, surface);
            el.totalGamesLine.value = targetTotal.toFixed(1);
            isSynthetic = true;

            // Visual feedback for synthetic data
            el.totalGamesLine.style.borderColor = '#f97316'; // Orange
            el.totalGamesLine.style.borderWidth = '2px';
            el.totalGamesLine.title = 'Estimated based on Match Odds & Surface';
        }
        // Step 2: If Over/Under odds are present -> Calculate Fair Total
        else if (oddsOver && oddsUnder && !isNaN(oddsOver) && !isNaN(oddsUnder)) {
            targetTotal = this.engine.calculateExpectedTotalFromOdds(totalLine, oddsOver, oddsUnder);
            isAdjusted = true;

            // Visual feedback for adjusted data
            el.totalGamesLine.style.borderColor = '#3b82f6'; // Blue
            el.totalGamesLine.style.borderWidth = '2px';
            el.totalGamesLine.title = `Fair Total: ${targetTotal.toFixed(2)} (Adjusted from ${totalLine} using O/U odds)`;
        }
        // Step 3: Normal case - use raw line
        else {
            el.totalGamesLine.style.borderColor = '';
            el.totalGamesLine.style.borderWidth = '';
            el.totalGamesLine.title = '';
        }

        // Display total info
        if (el.totalInfo) {
            if (isSynthetic) {
                el.totalInfo.textContent = `(Est)`;
                el.totalInfo.style.color = '#f97316';
            } else if (isAdjusted) {
                el.totalInfo.textContent = `(Fair: ${targetTotal.toFixed(2)})`;
                el.totalInfo.style.color = '#3b82f6';
            } else {
                el.totalInfo.textContent = '';
            }
        }

        // 1. De-vig
        const fairParams = this.engine.removeVigorish(odds1, odds2);
        displayFairValue(fairParams);

        // 2. Calculate Direct Player Expected Games (market-driven, bypasses simulation)
        let directPlayerGames = null;
        if (targetTotal && oddsOver && oddsUnder && !isNaN(oddsOver) && !isNaN(oddsUnder)) {
            directPlayerGames = this.engine.getDirectPlayerGames(fairParams.p1, targetTotal);
        }

        // 3. Solve (with adjusted/synthetic total and Elo-enhanced priors)
        const result = this.engine.solveParameters(fairParams.p1, targetTotal, surface, eloHoldProbs);
        displayParameters(result, eloHoldProbs, directPlayerGames);

        // 4. Derivatives (pass directPlayerGames for market-driven handicap calculation)
        const derivatives = this.engine.generateDerivatives(result.pa, result.pb, result.calibration, directPlayerGames);
        displayDerivatives(derivatives);

        // Show params card and tab container
        el.paramsCard.classList.remove('hidden');
        el.marketsTabContainer.classList.remove('hidden');

    } catch (e) {
        console.error('Model Error:', e);
        this.showError(e.message || 'Calculation failed');
    }
}
}

function displayFairValue(fair) {
    el.fairP1.textContent = (1 / fair.p1).toFixed(2);
    el.fairP2.textContent = (1 / fair.p2).toFixed(2);
}

function displayParameters(result, eloHoldProbs = null, directPlayerGames = null) {
    el.p1Hold.textContent = (result.pa * 100).toFixed(1) + '%';
    el.p2Hold.textContent = (result.pb * 100).toFixed(1) + '%';
    el.modelTotal.textContent = result.calibration.expTotal.toFixed(2);
    el.fairWin.textContent = (result.calibration.pMatch * 100).toFixed(1) + '%';

    // Prioritize direct market-driven calculation if available, otherwise use simulation
    if (directPlayerGames) {
        el.p1Games.textContent = directPlayerGames.p1.toFixed(1);
        el.p2Games.textContent = directPlayerGames.p2.toFixed(1);
        el.p1Games.title = `Direct calculation from market odds (Spread: ${directPlayerGames.spread > 0 ? '+' : ''}${directPlayerGames.spread.toFixed(1)})`;
        el.p2Games.title = `Direct calculation from market odds (Spread: ${directPlayerGames.spread > 0 ? '+' : ''}${directPlayerGames.spread.toFixed(1)})`;
    } else if (result.calibration.expGamesPlayer1 !== undefined) {
        el.p1Games.textContent = result.calibration.expGamesPlayer1.toFixed(1);
        el.p2Games.textContent = result.calibration.expGamesPlayer2.toFixed(1);
        el.p1Games.title = 'Simulation-based calculation';
        el.p2Games.title = 'Simulation-based calculation';
    }

    displayEloRatings(eloHoldProbs);
}

function displayEloRatings(eloHoldProbs) {
    if (!el.eloInfo) return;

    if (!currentPlayer1 || !currentPlayer2) {
        el.eloInfo.innerHTML = '<p class="text-sm text-gray-500">Select a match to see Elo ratings</p>';
        return;
    }

    const eloService = currentTour === 'WTA' ? tennisWtaEloService : tennisEloService;

    const player1Data = eloService.getPlayerData(currentPlayer1);
    const player2Data = eloService.getPlayerData(currentPlayer2);

    if (!player1Data || !player2Data) {
        el.eloInfo.innerHTML = `<p class="text-sm text-yellow-600">⚠️ ${currentTour} Elo data not available for these players</p>`;
        return;
    }

    const player1Elo = eloService.getPlayerElo(currentPlayer1, currentSurface);
    const player2Elo = eloService.getPlayerElo(currentPlayer2, currentSurface);
    const eloWinProb = eloService.calculateWinProbability(currentPlayer1, currentPlayer2, currentSurface);

    const eloEnhanced = eloHoldProbs ? '✓ Elo-Enhanced' : '';
    const rankLabel = currentTour === 'WTA' ? 'WTA' : 'ATP';
    const player1Rank = currentTour === 'WTA' ? player1Data.wtaRank : player1Data.atpRank;
    const player2Rank = currentTour === 'WTA' ? player2Data.wtaRank : player2Data.atpRank;

    el.eloInfo.innerHTML = `
        <div class="space-y-2">
            <div class="flex justify-between items-center">
                <h4 class="font-semibold text-sm">${currentTour} Elo Ratings (${currentSurface})</h4>
                ${eloEnhanced ? '<span class="text-xs text-green-600 font-medium">' + eloEnhanced + '</span>' : ''}
            </div>
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <div class="font-medium text-gray-700">${player1Data.name}</div>
                    <div class="text-gray-600">Elo: <span class="font-mono">${player1Elo.toFixed(0)}</span></div>
                    <div class="text-gray-600">${rankLabel}: #${player1Rank || 'N/A'}</div>
                </div>
                <div>
                    <div class="font-medium text-gray-700">${player2Data.name}</div>
                    <div class="text-gray-600">Elo: <span class="font-mono">${player2Elo.toFixed(0)}</span></div>
                    <div class="text-gray-600">${rankLabel}: #${player2Rank || 'N/A'}</div>
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
    el.correctScoreTable.innerHTML = html;

    // Set Winner (Set 1)
    const sw = d.setWinner;
    if (el.setWinnerTable) {
        el.setWinnerTable.innerHTML = `
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

    // Additional Markets (Tie Break + Both to Win Set)
    if (el.additionalMarketsTable) {
        let addHtml = '';
        if (d.tieBreakProb) {
            addHtml += `<tr>
                <td style="text-align: left;">Tie Break (Match)</td>
                <td style="text-align: center;">${d.tieBreakProb.prob}</td>
                <td style="text-align: center;">${d.tieBreakProb.odds}</td>
            </tr>`;
        }
        if (d.bothToWinSet) {
            addHtml += `<tr>
                <td style="text-align: left;">Both to Win Set</td>
                <td style="text-align: center;">${d.bothToWinSet.prob}</td>
                <td style="text-align: center;">${d.bothToWinSet.odds}</td>
            </tr>`;
        }
        el.additionalMarketsTable.innerHTML = addHtml;
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
    el.gameHandicapTable.innerHTML = ghHtml;

    if (d.playerTotals) {
        displayPlayerTotals(d.playerTotals);
    }
}

function displayPlayerTotals(playerTotals) {
    if (el.player1TotalsTable && playerTotals.player1) {
        let html = '';
        Object.keys(playerTotals.player1).sort((a, b) => parseFloat(a) - parseFloat(b)).forEach(line => {
            const market = playerTotals.player1[line];
            html += `<tr>
                <td style="text-align: left; padding: 8px;">${line}</td>
                <td style="text-align: center; padding: 8px;">${market.over.odds}</td>
                <td style="text-align: center; padding: 8px;">${market.under.odds}</td>
            </tr>`;
        });
        el.player1TotalsTable.innerHTML = html;
    }

    if (el.player2TotalsTable && playerTotals.player2) {
        let html = '';
        Object.keys(playerTotals.player2).sort((a, b) => parseFloat(a) - parseFloat(b)).forEach(line => {
            const market = playerTotals.player2[line];
            html += `<tr>
                <td style="text-align: left; padding: 8px;">${line}</td>
                <td style="text-align: center; padding: 8px;">${market.over.odds}</td>
                <td style="text-align: center; padding: 8px;">${market.under.odds}</td>
            </tr>`;
        });
        el.player2TotalsTable.innerHTML = html;
    }
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
    // Cache DOM elements
    el.player1Odds = document.getElementById('player1Odds');
    el.player2Odds = document.getElementById('player2Odds');
    el.totalGamesLine = document.getElementById('totalGamesLine');
    el.oddsOver = document.getElementById('oddsOver');
    el.oddsUnder = document.getElementById('oddsUnder');
    el.surfaceBadge = document.getElementById('surfaceBadge');
    el.totalInfo = document.getElementById('totalInfo');
    el.paramsCard = document.getElementById('paramsCard');
    el.marketsTabContainer = document.getElementById('marketsTabContainer');
    el.fairP1 = document.getElementById('fairP1');
    el.fairP2 = document.getElementById('fairP2');
    el.p1Hold = document.getElementById('p1Hold');
    el.p2Hold = document.getElementById('p2Hold');
    el.modelTotal = document.getElementById('modelTotal');
    el.fairWin = document.getElementById('fairWin');
    el.p1Games = document.getElementById('p1Games');
    el.p2Games = document.getElementById('p2Games');
    el.eloInfo = document.getElementById('eloInfo');
    el.correctScoreTable = document.getElementById('correctScoreTable');
    el.setWinnerTable = document.getElementById('setWinnerTable');
    el.additionalMarketsTable = document.getElementById('additionalMarketsTable');
    el.gameHandicapTable = document.getElementById('gameHandicapTable');
    el.player1TotalsTable = document.getElementById('player1TotalsTable');
    el.player2TotalsTable = document.getElementById('player2TotalsTable');
    el.tournamentSelect = document.getElementById('tournamentSelect');
    el.matchSelect = document.getElementById('matchSelect');

    // Initialize both ATP and WTA Elo services
    try {
        await Promise.all([
            tennisEloService.fetchEloRatings(),
            tennisWtaEloService.fetchEloRatings()
        ]);
    } catch (error) {
        console.warn('Failed to load Elo ratings:', error);
    }

    // Initialize Tennis API
    TennisAPI.setRunModelCallback(window.runModel);
    await TennisAPI.initLoader();

    el.tournamentSelect.addEventListener('change', TennisAPI.handleTournamentChange);
    el.matchSelect.addEventListener('change', TennisAPI.handleMatchChange);

    const inputs = document.querySelectorAll('input');
    inputs.forEach(i => i.addEventListener('input', () => window.runModel(el.surfaceBadge.textContent)));
});

const tennisModel = new TennisModel();
window.setCurrentPlayers = (p1, p2, surface, tour) => {
    tennisModel.currentPlayer1 = p1;
    tennisModel.currentPlayer2 = p2;
    tennisModel.currentSurface = surface;
    tennisModel.currentTour = tour;
    currentPlayer1 = p1;
    currentPlayer2 = p2;
    currentSurface = surface;
    currentTour = tour;
};
