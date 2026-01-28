import * as VolleyballAPI from './js/volleyball_api.js';
import { VolleyballEngine } from './volleyball_engine.js';

const engine = new VolleyballEngine();

window.runModel = function () {
    try {
        const team1Odds = parseFloat(document.getElementById('firstSetTeam1Odds').value);
        const team2Odds = parseFloat(document.getElementById('firstSetTeam2Odds').value);

        if (!team1Odds || !team2Odds) return;

        // 1. De-vig first set winner odds
        const fairFirstSet = engine.removeVigorish(team1Odds, team2Odds);

        // 2. Generate all derivatives from first set winner probability
        const derivatives = engine.generateDerivatives(fairFirstSet.p1);

        // 3. Display results
        displayFirstSetWinner(derivatives.firstSetWinner, fairFirstSet);
        displayMatchWinner(derivatives.matchWinner);
        displayExactScores(derivatives.exactScores);
        displaySetHandicapMarkets(derivatives.setHandicaps);
        displayTotalSetsMarkets(derivatives.totalSets);
        displayExpectedSets(derivatives.expectedSets);

        // Show tab container
        document.getElementById('marketsTabContainer').classList.remove('hidden');

    } catch (e) {
        console.error("Model Error:", e);
    }
};

function displayFirstSetWinner(firstSetWinner, fairOdds) {
    const container = document.getElementById('firstSetWinnerTable');
    if (!container) return;

    const team1Prob = firstSetWinner.team1 * 100;
    const team2Prob = firstSetWinner.team2 * 100;
    const team1FairOdds = (1 / firstSetWinner.team1).toFixed(2);
    const team2FairOdds = (1 / firstSetWinner.team2).toFixed(2);

    let html = `
        <table>
            <thead>
                <tr>
                    <th>Team</th>
                    <th>Probability</th>
                    <th>Fair Odds</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="line-col">Team 1</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${team1Prob.toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${team1FairOdds}</td>
                </tr>
                <tr>
                    <td class="line-col">Team 2</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${team2Prob.toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${team2FairOdds}</td>
                </tr>
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

function displayMatchWinner(matchWinner) {
    const container = document.getElementById('matchWinnerTable');
    if (!container) return;

    const team1Prob = matchWinner.team1 * 100;
    const team2Prob = matchWinner.team2 * 100;
    const team1Odds = (1 / matchWinner.team1).toFixed(2);
    const team2Odds = (1 / matchWinner.team2).toFixed(2);

    let html = `
        <table>
            <thead>
                <tr>
                    <th>Team</th>
                    <th>Probability</th>
                    <th>Fair Odds</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="line-col">Team 1</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${team1Prob.toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${team1Odds}</td>
                </tr>
                <tr>
                    <td class="line-col">Team 2</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${team2Prob.toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${team2Odds}</td>
                </tr>
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

function displayExactScores(exactScores) {
    const container = document.getElementById('exactScoresTable');
    if (!container) return;

    let html = `
        <table>
            <thead>
                <tr>
                    <th>Score</th>
                    <th>Probability</th>
                    <th>Fair Odds</th>
                </tr>
            </thead>
            <tbody>
    `;

    exactScores.forEach(outcome => {
        const probability = outcome.probability * 100;
        const odds = probability > 0 ? (1 / outcome.probability).toFixed(2) : '∞';

        html += `
            <tr>
                <td class="line-col">${outcome.score}</td>
                <td class="num-col" style="color: #10b981; font-weight: 600;">${probability.toFixed(1)}%</td>
                <td class="num-col" style="color: #f59e0b; font-weight: 600;">${odds}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

function displaySetHandicapMarkets(setHandicaps) {
    const container = document.getElementById('setHandicapTable');
    if (!container) return;

    let html = `
        <table>
            <thead>
                <tr>
                    <th>Line</th>
                    <th>Team 1 Prob</th>
                    <th>Team 1 Odds</th>
                    <th>Team 2 Prob</th>
                    <th>Team 2 Odds</th>
                </tr>
            </thead>
            <tbody>
    `;

    setHandicaps.forEach(market => {
        const team1Prob = market.team1 * 100;
        const team2Prob = market.team2 * 100;
        const team1Odds = market.team1 > 0 ? (1 / market.team1).toFixed(2) : '∞';
        const team2Odds = market.team2 > 0 ? (1 / market.team2).toFixed(2) : '∞';

        const lineDisplay = market.line > 0 ? `+${market.line}` : market.line;

        html += `
            <tr>
                <td class="line-col">${lineDisplay}</td>
                <td class="num-col" style="color: #10b981; font-weight: 600;">${team1Prob.toFixed(1)}%</td>
                <td class="num-col" style="color: #f59e0b; font-weight: 600;">${team1Odds}</td>
                <td class="num-col" style="color: #10b981; font-weight: 600;">${team2Prob.toFixed(1)}%</td>
                <td class="num-col" style="color: #f59e0b; font-weight: 600;">${team2Odds}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

function displayTotalSetsMarkets(totalSets) {
    const container = document.getElementById('totalSetsTable');
    if (!container) return;

    let html = `
        <table>
            <thead>
                <tr>
                    <th>Line</th>
                    <th>Over Prob</th>
                    <th>Over Odds</th>
                    <th>Under Prob</th>
                    <th>Under Odds</th>
                </tr>
            </thead>
            <tbody>
    `;

    totalSets.forEach(market => {
        const overProb = market.over * 100;
        const underProb = market.under * 100;
        const overOdds = market.over > 0 ? (1 / market.over).toFixed(2) : '∞';
        const underOdds = market.under > 0 ? (1 / market.under).toFixed(2) : '∞';

        html += `
            <tr>
                <td class="line-col">${market.line}</td>
                <td class="num-col" style="color: #10b981; font-weight: 600;">${overProb.toFixed(1)}%</td>
                <td class="num-col" style="color: #f59e0b; font-weight: 600;">${overOdds}</td>
                <td class="num-col" style="color: #10b981; font-weight: 600;">${underProb.toFixed(1)}%</td>
                <td class="num-col" style="color: #f59e0b; font-weight: 600;">${underOdds}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

function displayExpectedSets(expectedSets) {
    const container = document.getElementById('expectedSetsValue');
    if (!container) return;
    container.textContent = expectedSets.toFixed(2);
}

// Initialize API on page load
document.addEventListener('DOMContentLoaded', () => {
    VolleyballAPI.setRunModelCallback(window.runModel);
    VolleyballAPI.initLoader();

    // Setup event listeners for dropdowns
    const leagueSelect = document.getElementById('leagueSelect');
    const matchSelect = document.getElementById('matchSelect');

    if (leagueSelect) {
        leagueSelect.addEventListener('change', VolleyballAPI.handleLeagueChange);
    }

    if (matchSelect) {
        matchSelect.addEventListener('change', VolleyballAPI.handleMatchChange);
    }

    // Setup event listeners for manual input
    const inputs = ['firstSetTeam1Odds', 'firstSetTeam2Odds'];
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', () => {
                const team1Odds = document.getElementById('firstSetTeam1Odds').value;
                const team2Odds = document.getElementById('firstSetTeam2Odds').value;
                if (team1Odds && team2Odds) {
                    window.runModel();
                }
            });
        }
    });
});
