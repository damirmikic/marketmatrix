// Handball Model - UI Controller
// Handles user interactions and displays results from HandballEngine
// Inputs: Handicap line/odds + Total Goals line/odds

import * as HandballAPI from './js/handball_api.js';
import { HandballEngine } from './handball_engine.js';
import { probToOdds } from './js/core/math_utils.js';

const engine = new HandballEngine();

// UI Helper - Toggle card collapse/expand
function toggleCard(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('collapsed');
}

window.toggleCard = toggleCard;

// Main model execution
window.runModel = function () {
    try {
        // Get inputs
        const handicapLine = parseFloat(document.getElementById('handicapLine').value);
        const handicapHomeOdds = parseFloat(document.getElementById('handicapHomeOdds').value);
        const handicapAwayOdds = parseFloat(document.getElementById('handicapAwayOdds').value);
        const totalLine = parseFloat(document.getElementById('totalGoalsLine').value);
        const overOdds = parseFloat(document.getElementById('overOdds').value);
        const underOdds = parseFloat(document.getElementById('underOdds').value);

        // Validate all inputs required
        if ([handicapLine, handicapHomeOdds, handicapAwayOdds, totalLine, overOdds, underOdds].some(isNaN)) {
            console.log('Waiting for all inputs...');
            return;
        }

        // Update dynamic labels
        document.getElementById('handicapHomeLabel').textContent = `Home (${handicapLine > 0 ? '+' : ''}${handicapLine})`;
        document.getElementById('handicapAwayLabel').textContent = `Away (${(-handicapLine) > 0 ? '+' : ''}${-handicapLine})`;
        document.getElementById('overLabel').textContent = `Over ${totalLine}`;
        document.getElementById('underLabel').textContent = `Under ${totalLine}`;

        // Calculate margins
        displayMargins(handicapHomeOdds, handicapAwayOdds, overOdds, underOdds);

        // Generate all markets
        const markets = engine.generateAllMarkets({
            handicapLine,
            handicapHomeOdds,
            handicapAwayOdds,
            totalLine,
            overOdds,
            underOdds
        });

        // Display all results
        displayModelParams(markets);
        displayMatchWinner(markets.matchWinner);
        displayHandicaps(markets.handicaps, handicapLine);
        displayTotalGoals(markets.totals, totalLine);
        displayFirstHalf(markets.firstHalf);
        displayHTFT(markets.htft);
        displayBTTS(markets.btts);
        displayDoubleChance(markets.doubleChance);
        displayDrawNoBet(markets.drawNoBet);
        displayTeamTotals(markets.teamTotals);
        displayExactGoals(markets.exactGoals);
        displayComboBets(markets.comboBets, totalLine);
        displayGoalRanges(markets.goalRanges);

        // Show all result cards
        document.querySelectorAll('.card.hidden').forEach(c => c.classList.remove('hidden'));

    } catch (e) {
        console.error("Model Error:", e);
    }
};

// Display functions
function displayMargins(handicapHome, handicapAway, overOdds, underOdds) {
    const marginHC = ((1 / handicapHome + 1 / handicapAway) - 1) * 100;
    const hcEl = document.getElementById('handicapMargin');
    if (hcEl) {
        hcEl.textContent = `Margin: ${marginHC.toFixed(2)}%`;
        hcEl.style.color = marginHC < 5 ? '#4ade80' : (marginHC < 8 ? '#facc15' : '#f87171');
    }

    const marginTotal = ((1 / overOdds + 1 / underOdds) - 1) * 100;
    const totalEl = document.getElementById('totalGoalsMargin');
    if (totalEl) {
        totalEl.textContent = `Margin: ${marginTotal.toFixed(2)}%`;
        totalEl.style.color = marginTotal < 5 ? '#4ade80' : (marginTotal < 8 ? '#facc15' : '#f87171');
    }
}

function displayModelParams(markets) {
    const el = document.getElementById('expectedTotalValue');
    if (el) el.textContent = markets.expectedTotal.toFixed(2);

    const homeEl = document.getElementById('lambdaHome');
    if (homeEl) homeEl.textContent = markets.lambdas.lambdaHome.toFixed(2);

    const awayEl = document.getElementById('lambdaAway');
    if (awayEl) awayEl.textContent = markets.lambdas.lambdaAway.toFixed(2);

    const rhoEl = document.getElementById('rhoValue');
    if (rhoEl) rhoEl.textContent = markets.rho.toFixed(3);
}

function displayMatchWinner(matchWinner) {
    const container = document.getElementById('matchWinnerTable');
    if (!container) return;

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
                    <td class="line-col">Home</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(matchWinner.homeWin * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(matchWinner.homeWin)}</td>
                </tr>
                <tr>
                    <td class="line-col">Draw</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(matchWinner.draw * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(matchWinner.draw)}</td>
                </tr>
                <tr>
                    <td class="line-col">Away</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(matchWinner.awayWin * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(matchWinner.awayWin)}</td>
                </tr>
            </tbody>
        </table>
    `;
}

function displayHandicaps(handicaps, baseLine) {
    const container = document.getElementById('handicapTable');
    if (!container) return;

    let html = `
        <table>
            <thead>
                <tr>
                    <th>Line</th>
                    <th>Home Odds</th>
                    <th>Away Odds</th>
                </tr>
            </thead>
            <tbody>
    `;

    handicaps.forEach(hc => {
        const lineDisplay = hc.line > 0 ? `+${hc.line}` : hc.line;
        const isBase = Math.abs(hc.line - baseLine) < 0.6;
        const rowStyle = isBase ? ' style="background: rgba(59, 130, 246, 0.15);"' : '';

        html += `
            <tr${rowStyle}>
                <td class="line-col">${lineDisplay}</td>
                <td class="num-col">${probToOdds(hc.homeCovers)}</td>
                <td class="num-col">${probToOdds(hc.awayCovers)}</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

function displayTotalGoals(totals, baseLine) {
    const container = document.getElementById('totalGoalsTable');
    if (!container) return;

    let html = `
        <table>
            <thead>
                <tr>
                    <th>Line</th>
                    <th>Over Odds</th>
                    <th>Under Odds</th>
                </tr>
            </thead>
            <tbody>
    `;

    totals.forEach(total => {
        const isBase = Math.abs(total.line - baseLine) < 0.6;
        const rowStyle = isBase ? ' style="background: rgba(59, 130, 246, 0.15);"' : '';

        html += `
            <tr${rowStyle}>
                <td class="line-col">${total.line.toFixed(1)}</td>
                <td class="num-col">${probToOdds(total.over)}</td>
                <td class="num-col">${probToOdds(total.under)}</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

function displayHalfMarkets(half, containerId) {
    const winnerEl = document.getElementById(`${containerId}WinnerTable`);
    const totalEl = document.getElementById(`${containerId}TotalTable`);
    const bttsEl = document.getElementById(`${containerId}BttsTable`);
    const homeTeamEl = document.getElementById(`${containerId}HomeTeamTable`);
    const awayTeamEl = document.getElementById(`${containerId}AwayTeamTable`);
    const handicapEl = document.getElementById(`${containerId}HandicapTable`);
    const dnbEl = document.getElementById(`${containerId}DnbTable`);

    if (winnerEl) {
        winnerEl.innerHTML = `
            <table>
                <thead><tr><th>Outcome</th><th>Probability</th><th>Fair Odds</th></tr></thead>
                <tbody>
                    <tr>
                        <td class="line-col">Home</td>
                        <td class="num-col" style="color: #10b981; font-weight: 600;">${(half.winner.homeWin * 100).toFixed(1)}%</td>
                        <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(half.winner.homeWin)}</td>
                    </tr>
                    <tr>
                        <td class="line-col">Draw</td>
                        <td class="num-col" style="color: #10b981; font-weight: 600;">${(half.winner.draw * 100).toFixed(1)}%</td>
                        <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(half.winner.draw)}</td>
                    </tr>
                    <tr>
                        <td class="line-col">Away</td>
                        <td class="num-col" style="color: #10b981; font-weight: 600;">${(half.winner.awayWin * 100).toFixed(1)}%</td>
                        <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(half.winner.awayWin)}</td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    if (totalEl) {
        let html = `<table><thead><tr><th>Line</th><th>Over Odds</th><th>Under Odds</th></tr></thead><tbody>`;
        half.totals.forEach(total => {
            html += `<tr><td class="line-col">${total.line.toFixed(1)}</td><td class="num-col">${probToOdds(total.over)}</td><td class="num-col">${probToOdds(total.under)}</td></tr>`;
        });
        html += `</tbody></table>`;
        totalEl.innerHTML = html;
    }

    if (bttsEl) {
        bttsEl.innerHTML = `
            <table>
                <thead><tr><th>Outcome</th><th>Probability</th><th>Fair Odds</th></tr></thead>
                <tbody>
                    <tr>
                        <td class="line-col">Yes</td>
                        <td class="num-col" style="color: #10b981; font-weight: 600;">${(half.btts.yes * 100).toFixed(1)}%</td>
                        <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(half.btts.yes)}</td>
                    </tr>
                    <tr>
                        <td class="line-col">No</td>
                        <td class="num-col" style="color: #10b981; font-weight: 600;">${(half.btts.no * 100).toFixed(1)}%</td>
                        <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(half.btts.no)}</td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    if (homeTeamEl) {
        let html = `<table><thead><tr><th>Line</th><th>Over Odds</th><th>Under Odds</th></tr></thead><tbody>`;
        half.teamTotals.home.forEach(t => {
            html += `<tr><td class="line-col">${t.line.toFixed(1)}</td><td class="num-col">${probToOdds(t.over)}</td><td class="num-col">${probToOdds(t.under)}</td></tr>`;
        });
        html += `</tbody></table>`;
        homeTeamEl.innerHTML = html;
    }

    if (awayTeamEl) {
        let html = `<table><thead><tr><th>Line</th><th>Over Odds</th><th>Under Odds</th></tr></thead><tbody>`;
        half.teamTotals.away.forEach(t => {
            html += `<tr><td class="line-col">${t.line.toFixed(1)}</td><td class="num-col">${probToOdds(t.over)}</td><td class="num-col">${probToOdds(t.under)}</td></tr>`;
        });
        html += `</tbody></table>`;
        awayTeamEl.innerHTML = html;
    }

    if (handicapEl && half.handicap) {
        const lineDisplay = half.handicap.line > 0 ? `+${half.handicap.line}` : half.handicap.line;
        handicapEl.innerHTML = `
            <table>
                <thead><tr><th>Line</th><th>Home Odds</th><th>Away Odds</th></tr></thead>
                <tbody>
                    <tr>
                        <td class="line-col">${lineDisplay}</td>
                        <td class="num-col">${probToOdds(half.handicap.homeCovers)}</td>
                        <td class="num-col">${probToOdds(half.handicap.awayCovers)}</td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    if (dnbEl) {
        dnbEl.innerHTML = `
            <table>
                <thead><tr><th>Outcome</th><th>Probability</th><th>Fair Odds</th></tr></thead>
                <tbody>
                    <tr>
                        <td class="line-col">Home DNB</td>
                        <td class="num-col" style="color: #10b981; font-weight: 600;">${(half.dnb.home * 100).toFixed(1)}%</td>
                        <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(half.dnb.home)}</td>
                    </tr>
                    <tr>
                        <td class="line-col">Away DNB</td>
                        <td class="num-col" style="color: #10b981; font-weight: 600;">${(half.dnb.away * 100).toFixed(1)}%</td>
                        <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(half.dnb.away)}</td>
                    </tr>
                </tbody>
            </table>
        `;
    }
}

function displayFirstHalf(firstHalf) {
    displayHalfMarkets(firstHalf, 'h1');
}

function displayHTFT(htft) {
    const container = document.getElementById('htftTable');
    if (!container) return;

    let html = `<table><thead><tr><th>HT/FT</th><th>Probability</th><th>Fair Odds</th></tr></thead><tbody>`;

    htft.forEach(combo => {
        html += `
            <tr>
                <td class="line-col">${combo.outcome}</td>
                <td class="num-col" style="color: #10b981; font-weight: 600;">${(combo.probability * 100).toFixed(1)}%</td>
                <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(combo.probability)}</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

function displayBTTS(btts) {
    const container = document.getElementById('bttsTable');
    if (!container) return;

    container.innerHTML = `
        <table>
            <thead><tr><th>Outcome</th><th>Probability</th><th>Fair Odds</th></tr></thead>
            <tbody>
                <tr>
                    <td class="line-col">Yes</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(btts.yes * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(btts.yes)}</td>
                </tr>
                <tr>
                    <td class="line-col">No</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(btts.no * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(btts.no)}</td>
                </tr>
            </tbody>
        </table>
    `;
}

function displayDoubleChance(dc) {
    const container = document.getElementById('doubleChanceTable');
    if (!container) return;

    container.innerHTML = `
        <table>
            <thead><tr><th>Outcome</th><th>Probability</th><th>Fair Odds</th></tr></thead>
            <tbody>
                <tr>
                    <td class="line-col">Home or Draw</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(dc.homeOrDraw * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(dc.homeOrDraw)}</td>
                </tr>
                <tr>
                    <td class="line-col">Home or Away</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(dc.homeOrAway * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(dc.homeOrAway)}</td>
                </tr>
                <tr>
                    <td class="line-col">Draw or Away</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(dc.drawOrAway * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(dc.drawOrAway)}</td>
                </tr>
            </tbody>
        </table>
    `;
}

function displayDrawNoBet(dnb) {
    const container = document.getElementById('dnbTable');
    if (!container) return;

    container.innerHTML = `
        <table>
            <thead><tr><th>Outcome</th><th>Probability</th><th>Fair Odds</th></tr></thead>
            <tbody>
                <tr>
                    <td class="line-col">Home DNB</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(dnb.home * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(dnb.home)}</td>
                </tr>
                <tr>
                    <td class="line-col">Away DNB</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(dnb.away * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(dnb.away)}</td>
                </tr>
            </tbody>
        </table>
    `;
}

function displayTeamTotals(teamTotals) {
    const homeEl = document.getElementById('homeTeamTotalTable');
    const awayEl = document.getElementById('awayTeamTotalTable');

    if (homeEl) {
        let html = `<table><thead><tr><th>Line</th><th>Over Odds</th><th>Under Odds</th></tr></thead><tbody>`;
        teamTotals.home.forEach(t => {
            html += `<tr><td class="line-col">${t.line.toFixed(1)}</td><td class="num-col">${probToOdds(t.over)}</td><td class="num-col">${probToOdds(t.under)}</td></tr>`;
        });
        html += `</tbody></table>`;
        homeEl.innerHTML = html;
    }

    if (awayEl) {
        let html = `<table><thead><tr><th>Line</th><th>Over Odds</th><th>Under Odds</th></tr></thead><tbody>`;
        teamTotals.away.forEach(t => {
            html += `<tr><td class="line-col">${t.line.toFixed(1)}</td><td class="num-col">${probToOdds(t.over)}</td><td class="num-col">${probToOdds(t.under)}</td></tr>`;
        });
        html += `</tbody></table>`;
        awayEl.innerHTML = html;
    }
}

function displayExactGoals(exactGoals) {
    const container = document.getElementById('exactGoalsTable');
    if (!container) return;

    let html = `<table><thead><tr><th>Goals</th><th>Probability</th><th>Fair Odds</th></tr></thead><tbody>`;

    exactGoals.forEach(eg => {
        html += `
            <tr>
                <td class="line-col">${eg.goals} Goals</td>
                <td class="num-col" style="color: #10b981; font-weight: 600;">${(eg.probability * 100).toFixed(1)}%</td>
                <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(eg.probability)}</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

function displayComboBets(comboBets, totalLine) {
    const container = document.getElementById('comboTable');
    if (!container) return;

    let html = `<table><thead><tr><th>Outcome</th><th>Probability</th><th>Fair Odds</th></tr></thead><tbody>`;

    const order = ['Home & Over', 'Home & Under', 'Draw & Over', 'Draw & Under', 'Away & Over', 'Away & Under'];
    order.forEach(outcome => {
        const combo = comboBets.find(c => c.outcome === outcome);
        if (combo) {
            const displayOutcome = combo.outcome.replace('Over', `Over ${totalLine.toFixed(1)}`).replace('Under', `Under ${totalLine.toFixed(1)}`);
            html += `
                <tr>
                    <td class="line-col">${displayOutcome}</td>
                    <td class="num-col" style="color: #10b981; font-weight: 600;">${(combo.probability * 100).toFixed(1)}%</td>
                    <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(combo.probability)}</td>
                </tr>
            `;
        }
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

function displayGoalRanges(goalRanges) {
    const container = document.getElementById('goalRangesTable');
    if (!container) return;

    let html = `<table><thead><tr><th>Range</th><th>Probability</th><th>Fair Odds</th></tr></thead><tbody>`;

    goalRanges.forEach(range => {
        html += `
            <tr>
                <td class="line-col">${range.label} Goals</td>
                <td class="num-col" style="color: #10b981; font-weight: 600;">${(range.probability * 100).toFixed(1)}%</td>
                <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(range.probability)}</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    HandballAPI.setRunModelCallback(window.runModel);
    HandballAPI.initLoader();

    const leagueSelect = document.getElementById('leagueSelect');
    const matchSelect = document.getElementById('matchSelect');

    if (leagueSelect) {
        leagueSelect.addEventListener('change', HandballAPI.handleLeagueChange);
    }

    if (matchSelect) {
        matchSelect.addEventListener('change', HandballAPI.handleMatchChange);
    }

    // Setup event listeners for manual input
    const inputs = ['handicapLine', 'handicapHomeOdds', 'handicapAwayOdds', 'totalGoalsLine', 'overOdds', 'underOdds'];

    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', () => {
                const allFilled = inputs.every(inputId => {
                    const val = document.getElementById(inputId).value;
                    return val && !isNaN(parseFloat(val));
                });

                if (allFilled) {
                    window.runModel();
                }
            });
        }
    });
});
