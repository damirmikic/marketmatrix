import * as VolleyballAPI from './js/volleyball_api.js';
import { VolleyballEngine } from './volleyball_engine.js';

const engine = new VolleyballEngine();

// UI Helper - Toggle card collapse/expand
function toggleCard(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('collapsed');
}

// Expose to window for HTML onclick handlers
window.toggleCard = toggleCard;

window.runModel = function () {
    try {
        const team1Odds = parseFloat(document.getElementById('team1Odds').value);
        const team2Odds = parseFloat(document.getElementById('team2Odds').value);

        if (!team1Odds || !team2Odds) return;

        // Get set handicap inputs if available
        const setHandicapLine = parseFloat(document.getElementById('setHandicapLine').value);
        const setHandicapTeam1 = parseFloat(document.getElementById('setHandicapTeam1').value);
        const setHandicapTeam2 = parseFloat(document.getElementById('setHandicapTeam2').value);

        // 1. De-vig match odds
        const fairMatchOdds = engine.removeVigorish(team1Odds, team2Odds);
        displayFairValue(fairMatchOdds);

        // 2. De-vig set handicap if available
        let fairSetHandicap = null;
        if (setHandicapTeam1 && setHandicapTeam2) {
            fairSetHandicap = engine.removeVigorish(setHandicapTeam1, setHandicapTeam2);
        }

        // 3. Solve parameters
        const result = engine.solveParameters(
            fairMatchOdds.p1,
            setHandicapLine || null,
            fairSetHandicap ? fairSetHandicap.p1 : null
        );
        displayParameters(result);

        // 4. Generate derivatives
        const derivatives = engine.generateDerivatives(result);
        displayDerivatives(derivatives);

        // Show all result cards
        document.querySelectorAll('.card.hidden').forEach(c => c.classList.remove('hidden'));

    } catch (e) {
        console.error("Model Error:", e);
    }
};

function displayFairValue(fair) {
    document.getElementById('fairTeam1').textContent = (1 / fair.p1).toFixed(2);
    document.getElementById('fairTeam2').textContent = (1 / fair.p2).toFixed(2);
    document.getElementById('fairP1Pct').textContent = (fair.p1 * 100).toFixed(1) + '%';
    document.getElementById('fairP2Pct').textContent = (fair.p2 * 100).toFixed(1) + '%';
}

function displayParameters(result) {
    // Point Win Probabilities
    document.getElementById('team1PointProb').textContent = (result.pPoint1 * 100).toFixed(1) + '%';
    document.getElementById('team2PointProb').textContent = (result.pPoint2 * 100).toFixed(1) + '%';

    // Set Win Probabilities
    document.getElementById('team1SetProb').textContent = (result.pSet1 * 100).toFixed(1) + '%';
    document.getElementById('team2SetProb').textContent = (result.pSet2 * 100).toFixed(1) + '%';

    // Match Win Probabilities (verification)
    document.getElementById('modelMatch1').textContent = (result.pMatch1 * 100).toFixed(1) + '%';
    document.getElementById('modelMatch2').textContent = (result.pMatch2 * 100).toFixed(1) + '%';

    // Expected Sets
    document.getElementById('expectedSets').textContent = result.expectedSets.toFixed(2);
}

function displayDerivatives(derivatives) {
    // Display Exact Set Scores
    displayExactScores(derivatives.exactScores);

    // Display Total Sets Markets
    displayTotalSetsMarkets(derivatives.totalSets);

    // Display Set Handicap Markets
    displaySetHandicapMarkets(derivatives.setHandicaps);

    // Display Point Handicap Markets
    displayPointHandicapMarkets(derivatives.pointHandicaps);
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
                    <th>Odds</th>
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
                <td class="num-col">${probability.toFixed(1)}%</td>
                <td class="num-col">${odds}</td>
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
                <td class="num-col">${overProb.toFixed(1)}%</td>
                <td class="num-col">${overOdds}</td>
                <td class="num-col">${underProb.toFixed(1)}%</td>
                <td class="num-col">${underOdds}</td>
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
                <td class="num-col">${team1Prob.toFixed(1)}%</td>
                <td class="num-col">${team1Odds}</td>
                <td class="num-col">${team2Prob.toFixed(1)}%</td>
                <td class="num-col">${team2Odds}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

function displayPointHandicapMarkets(pointHandicaps) {
    const container = document.getElementById('pointHandicapTable');
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

    pointHandicaps.forEach(market => {
        const team1Prob = market.team1 * 100;
        const team2Prob = market.team2 * 100;
        const team1Odds = market.team1 > 0 ? (1 / market.team1).toFixed(2) : '∞';
        const team2Odds = market.team2 > 0 ? (1 / market.team2).toFixed(2) : '∞';

        const lineDisplay = market.line > 0 ? `+${market.line}` : market.line;

        html += `
            <tr>
                <td class="line-col">${lineDisplay}</td>
                <td class="num-col">${team1Prob.toFixed(1)}%</td>
                <td class="num-col">${team1Odds}</td>
                <td class="num-col">${team2Prob.toFixed(1)}%</td>
                <td class="num-col">${team2Odds}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;
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
    const inputs = ['team1Odds', 'team2Odds', 'setHandicapLine', 'setHandicapTeam1', 'setHandicapTeam2'];
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', () => {
                // Auto-run model when inputs change
                const team1Odds = document.getElementById('team1Odds').value;
                const team2Odds = document.getElementById('team2Odds').value;
                if (team1Odds && team2Odds) {
                    window.runModel();
                }
            });
        }
    });
});
