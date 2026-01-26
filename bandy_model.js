// Bandy Model - UI Controller
// Handles user interactions and displays results from BandyEngine

import { initBandyLoader, handleCountryChange, handleLeagueChange, handleMatchChange, setRunModelCallback } from './js/bandy_api.js';
import { BandyEngine } from './bandy_engine.js';
import { probToOdds } from './js/core/math_utils.js';

const engine = new BandyEngine();

// UI Helper - Toggle card collapse/expand
function toggleCard(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('collapsed');
}

// Expose to window for HTML onclick handlers
window.toggleCard = toggleCard;

// Main model execution
window.runModel = function () {
    try {
        // Get inputs
        const homeOdds = parseFloat(document.getElementById('homeOdds').value);
        const drawOdds = parseFloat(document.getElementById('drawOdds').value);
        const awayOdds = parseFloat(document.getElementById('awayOdds').value);
        const totalLine = parseFloat(document.getElementById('totalGoalsLine').value);
        const overOdds = parseFloat(document.getElementById('overOdds').value);
        const underOdds = parseFloat(document.getElementById('underOdds').value);

        // Validate required inputs (1X2 odds)
        if ([homeOdds, drawOdds, awayOdds].some(isNaN)) {
            console.log('Waiting for match winner odds...');
            return;
        }

        // Check if total goals is available
        const hasTotalGoals = !isNaN(totalLine) && !isNaN(overOdds) && !isNaN(underOdds);

        // Update dynamic labels if total goals is present
        if (hasTotalGoals) {
            document.getElementById('overLabel').textContent = `Over ${totalLine}`;
            document.getElementById('underLabel').textContent = `Under ${totalLine}`;
        }

        // Calculate margins
        displayMargins(homeOdds, drawOdds, awayOdds, hasTotalGoals ? overOdds : null, hasTotalGoals ? underOdds : null);

        // Generate all markets
        const marketInputs = {
            homeOdds,
            drawOdds,
            awayOdds
        };

        // Add total goals if available
        if (hasTotalGoals) {
            marketInputs.totalLine = totalLine;
            marketInputs.overOdds = overOdds;
            marketInputs.underOdds = underOdds;
        }

        const markets = engine.generateAllMarkets(marketInputs);

        // Display all results
        displayExpectedTotal(markets.expectedTotal, markets.lambdas);
        displayMatchWinner(markets.matchWinner);
        displayHandicaps(markets.handicaps);
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
function displayMargins(homeOdds, drawOdds, awayOdds, overOdds, underOdds) {
    // 1X2 Margin
    const margin1X2 = ((1 / homeOdds + 1 / drawOdds + 1 / awayOdds) - 1) * 100;
    const marginEl = document.getElementById('matchWinnerMargin');
    if (marginEl) {
        marginEl.textContent = `Margin: ${margin1X2.toFixed(2)}%`;
        marginEl.style.color = margin1X2 < 5 ? '#4ade80' : (margin1X2 < 8 ? '#facc15' : '#f87171');
    }

    // Total Goals Margin (only if available)
    const totalMarginEl = document.getElementById('totalGoalsMargin');
    if (totalMarginEl) {
        if (overOdds && underOdds) {
            const marginTotal = ((1 / overOdds + 1 / underOdds) - 1) * 100;
            totalMarginEl.textContent = `Margin: ${marginTotal.toFixed(2)}%`;
            totalMarginEl.style.color = marginTotal < 5 ? '#4ade80' : (marginTotal < 8 ? '#facc15' : '#f87171');
        } else {
            totalMarginEl.textContent = 'Not available';
            totalMarginEl.style.color = '#64748b';
        }
    }
}

function displayExpectedTotal(expectedTotal, lambdas) {
    const el = document.getElementById('expectedTotalValue');
    if (el) {
        el.textContent = expectedTotal.toFixed(2);
    }

    const homeEl = document.getElementById('lambdaHome');
    if (homeEl) {
        homeEl.textContent = lambdas.lambdaHome.toFixed(3);
    }

    const awayEl = document.getElementById('lambdaAway');
    if (awayEl) {
        awayEl.textContent = lambdas.lambdaAway.toFixed(3);
    }
}

function displayMatchWinner(matchWinner) {
    const container = document.getElementById('matchWinnerTable');
    if (!container) return;

    let html = `
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

    container.innerHTML = html;
}

function displayHandicaps(handicaps) {
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
        html += `
            <tr>
                <td class="line-col">${lineDisplay}</td>
                <td class="num-col">${probToOdds(hc.homeCovers)}</td>
                <td class="num-col">${probToOdds(hc.awayCovers)}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

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
        const isBaseLine = Math.abs(total.line - baseLine) < 0.6;
        const rowStyle = isBaseLine ? ' style="background: rgba(59, 130, 246, 0.15);"' : '';

        html += `
            <tr${rowStyle}>
                <td class="line-col">${total.line.toFixed(1)}</td>
                <td class="num-col">${probToOdds(total.over)}</td>
                <td class="num-col">${probToOdds(total.under)}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

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

    // Winner
    if (winnerEl) {
        let html = `
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
        winnerEl.innerHTML = html;
    }

    // Total Goals
    if (totalEl) {
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

        half.totals.forEach(total => {
            html += `
                <tr>
                    <td class="line-col">${total.line.toFixed(1)}</td>
                    <td class="num-col">${probToOdds(total.over)}</td>
                    <td class="num-col">${probToOdds(total.under)}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;
        totalEl.innerHTML = html;
    }

    // BTTS
    if (bttsEl) {
        let html = `
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
        bttsEl.innerHTML = html;
    }

    // Team Totals
    if (homeTeamEl) {
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

        half.teamTotals.home.forEach(total => {
            html += `
                <tr>
                    <td class="line-col">${total.line.toFixed(1)}</td>
                    <td class="num-col">${probToOdds(total.over)}</td>
                    <td class="num-col">${probToOdds(total.under)}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;
        homeTeamEl.innerHTML = html;
    }

    if (awayTeamEl) {
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

        half.teamTotals.away.forEach(total => {
            html += `
                <tr>
                    <td class="line-col">${total.line.toFixed(1)}</td>
                    <td class="num-col">${probToOdds(total.over)}</td>
                    <td class="num-col">${probToOdds(total.under)}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;
        awayTeamEl.innerHTML = html;
    }

    // Asian Handicap
    if (handicapEl && half.handicap) {
        const lineDisplay = half.handicap.line > 0 ? `+${half.handicap.line}` : half.handicap.line;
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
                    <tr>
                        <td class="line-col">${lineDisplay}</td>
                        <td class="num-col">${probToOdds(half.handicap.homeCovers)}</td>
                        <td class="num-col">${probToOdds(half.handicap.awayCovers)}</td>
                    </tr>
                </tbody>
            </table>
        `;
        handicapEl.innerHTML = html;
    }

    // Draw No Bet
    if (dnbEl) {
        let html = `
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
        dnbEl.innerHTML = html;
    }
}

function displayFirstHalf(firstHalf) {
    displayHalfMarkets(firstHalf, 'h1');
}

function displayHTFT(htft) {
    const container = document.getElementById('htftTable');
    if (!container) return;

    let html = `
        <table>
            <thead>
                <tr>
                    <th>HT/FT</th>
                    <th>Probability</th>
                    <th>Fair Odds</th>
                </tr>
            </thead>
            <tbody>
    `;

    htft.forEach(combo => {
        html += `
            <tr>
                <td class="line-col">${combo.outcome}</td>
                <td class="num-col" style="color: #10b981; font-weight: 600;">${(combo.probability * 100).toFixed(1)}%</td>
                <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(combo.probability)}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

function displayBTTS(btts) {
    const container = document.getElementById('bttsTable');
    if (!container) return;

    let html = `
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

    container.innerHTML = html;
}

function displayDoubleChance(dc) {
    const container = document.getElementById('doubleChanceTable');
    if (!container) return;

    let html = `
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

    container.innerHTML = html;
}

function displayDrawNoBet(dnb) {
    const container = document.getElementById('dnbTable');
    if (!container) return;

    let html = `
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

    container.innerHTML = html;
}

function displayTeamTotals(teamTotals) {
    const homeEl = document.getElementById('homeTeamTotalTable');
    const awayEl = document.getElementById('awayTeamTotalTable');

    if (homeEl) {
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

        teamTotals.home.forEach(total => {
            html += `
                <tr>
                    <td class="line-col">${total.line.toFixed(1)}</td>
                    <td class="num-col">${probToOdds(total.over)}</td>
                    <td class="num-col">${probToOdds(total.under)}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;
        homeEl.innerHTML = html;
    }

    if (awayEl) {
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

        teamTotals.away.forEach(total => {
            html += `
                <tr>
                    <td class="line-col">${total.line.toFixed(1)}</td>
                    <td class="num-col">${probToOdds(total.over)}</td>
                    <td class="num-col">${probToOdds(total.under)}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;
        awayEl.innerHTML = html;
    }
}

function displayExactGoals(exactGoals) {
    const container = document.getElementById('exactGoalsTable');
    if (!container) return;

    let html = `
        <table>
            <thead>
                <tr>
                    <th>Goals</th>
                    <th>Probability</th>
                    <th>Fair Odds</th>
                </tr>
            </thead>
            <tbody>
    `;

    exactGoals.forEach(eg => {
        html += `
            <tr>
                <td class="line-col">${eg.goals} Goals</td>
                <td class="num-col" style="color: #10b981; font-weight: 600;">${(eg.probability * 100).toFixed(1)}%</td>
                <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(eg.probability)}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

function displayComboBets(comboBets, totalLine) {
    const container = document.getElementById('comboTable');
    if (!container) return;

    let html = `
        <table>
            <thead>
                <tr>
                    <th>Outcome</th>
                    <th>Probability</th>
                    <th>Fair Odds</th>
                </tr>
            </thead>
            <tbody>
    `;

    const order = ['Home & Over', 'Home & Under', 'Draw & Over', 'Draw & Under', 'Away & Over', 'Away & Under'];
    order.forEach(outcome => {
        const combo = comboBets.find(c => c.outcome === outcome);
        if (combo) {
            // Add total line to Over/Under labels
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

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

function displayGoalRanges(goalRanges) {
    const container = document.getElementById('goalRangesTable');
    if (!container) return;

    let html = `
        <table>
            <thead>
                <tr>
                    <th>Range</th>
                    <th>Probability</th>
                    <th>Fair Odds</th>
                </tr>
            </thead>
            <tbody>
    `;

    goalRanges.forEach(range => {
        html += `
            <tr>
                <td class="line-col">${range.label} Goals</td>
                <td class="num-col" style="color: #10b981; font-weight: 600;">${(range.probability * 100).toFixed(1)}%</td>
                <td class="num-col" style="color: #f59e0b; font-weight: 600;">${probToOdds(range.probability)}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Initialize API loader
    setRunModelCallback(window.runModel);
    initBandyLoader();

    // Setup event listeners for 3-level API selectors
    const countrySelect = document.getElementById('apiCountrySelect');
    const leagueSelect = document.getElementById('apiLeagueSelect');
    const matchSelect = document.getElementById('apiMatchSelect');

    if (countrySelect) {
        countrySelect.addEventListener('change', handleCountryChange);
    }

    if (leagueSelect) {
        leagueSelect.addEventListener('change', handleLeagueChange);
    }

    if (matchSelect) {
        matchSelect.addEventListener('change', handleMatchChange);
    }

    // Setup event listeners for manual input
    const inputs = ['homeOdds', 'drawOdds', 'awayOdds', 'totalGoalsLine', 'overOdds', 'underOdds'];
    const requiredInputs = ['homeOdds', 'drawOdds', 'awayOdds'];

    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', () => {
                // Check if required inputs (1X2 odds) are filled
                const requiredFilled = requiredInputs.every(inputId => {
                    const val = document.getElementById(inputId).value;
                    return val && !isNaN(parseFloat(val));
                });

                // Trigger model if required inputs are filled
                if (requiredFilled) {
                    window.runModel();
                }
            });
        }
    });
});
