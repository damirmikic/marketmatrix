// Table Tennis Model
// Main controller for table tennis probability calculations

import {
    initTableTennisLoader,
    handleCountryChange,
    handleLeagueChange,
    handleMatchChange,
    setRunModelCallback
} from './js/table_tennis_api.js';

// --- Utility Functions ---
function probToOdds(p) {
    if (p <= 0) return "---";
    if (p >= 1) return "1.00";
    return (1 / p).toFixed(2);
}

function solveShin(odds) {
    // Simple Shin method for 2-way market
    const impliedProbs = odds.map(o => 1 / o);
    const total = impliedProbs.reduce((a, b) => a + b, 0);
    const margin = total - 1;

    // For 2-way, simple proportional adjustment
    const fairProbs = impliedProbs.map(p => p / total);
    return fairProbs;
}

// --- Main Controller ---
function runModel() {
    // Get Inputs
    const hOdds = parseFloat(document.getElementById('homeOdds').value);
    const aOdds = parseFloat(document.getElementById('awayOdds').value);
    const spreadLine = parseFloat(document.getElementById('spreadLine').value);
    const spreadHomeOdds = parseFloat(document.getElementById('spreadHomeOdds').value);
    const spreadAwayOdds = parseFloat(document.getElementById('spreadAwayOdds').value);
    const totalLine = parseFloat(document.getElementById('totalLine').value);
    const overOdds = parseFloat(document.getElementById('overOdds').value);
    const underOdds = parseFloat(document.getElementById('underOdds').value);

    // Get Set Ratios
    const set1Ratio = parseFloat(document.getElementById('set1Ratio').value) || 0.20;
    const set2Ratio = parseFloat(document.getElementById('set2Ratio').value) || 0.20;
    const set3Ratio = parseFloat(document.getElementById('set3Ratio').value) || 0.20;
    const set4Ratio = parseFloat(document.getElementById('set4Ratio').value) || 0.20;
    const set5Ratio = parseFloat(document.getElementById('set5Ratio').value) || 0.20;

    // Basic validation
    if ([hOdds, aOdds, totalLine, overOdds, underOdds].some(isNaN)) return;

    // Update Labels
    document.getElementById('overLabel').textContent = `Over ${totalLine}`;
    document.getElementById('underLabel').textContent = `Under ${totalLine}`;

    // --- Margin Calculations ---
    // Moneyline Margin
    const mlMargin = ((1 / hOdds + 1 / aOdds) - 1) * 100;
    const mlMarginEl = document.getElementById('moneylineMargin');
    if (mlMarginEl) {
        mlMarginEl.textContent = `Margin: ${mlMargin.toFixed(2)}%`;
        mlMarginEl.style.color = mlMargin < 5 ? '#4ade80' : (mlMargin < 8 ? '#facc15' : '#f87171');
    }

    // Spread Margin
    if (!isNaN(spreadHomeOdds) && !isNaN(spreadAwayOdds)) {
        const spreadMargin = ((1 / spreadHomeOdds + 1 / spreadAwayOdds) - 1) * 100;
        const spreadMarginEl = document.getElementById('spreadMargin');
        if (spreadMarginEl) {
            spreadMarginEl.textContent = `Margin: ${spreadMargin.toFixed(2)}%`;
            spreadMarginEl.style.color = spreadMargin < 5 ? '#4ade80' : (spreadMargin < 8 ? '#facc15' : '#f87171');
        }
    }

    // Total Margin
    const totalMargin = ((1 / overOdds + 1 / underOdds) - 1) * 100;
    const totalMarginEl = document.getElementById('totalMargin');
    if (totalMarginEl) {
        totalMarginEl.textContent = `Margin: ${totalMargin.toFixed(2)}%`;
        totalMarginEl.style.color = totalMargin < 5 ? '#4ade80' : (totalMargin < 8 ? '#facc15' : '#f87171');
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

    // --- Derive Expected Total Sets from Over/Under ---
    const fairOU = solveShin([overOdds, underOdds]);
    const pOver = fairOU[0];
    // Table tennis best of 5: total can be 3, 4, or 5 sets
    // If P(Over 3.5) = high, expect 4 or 5 sets
    const expectedTotal = totalLine + (pOver - 0.5) * 2;
    document.getElementById('expectedTotal').textContent = expectedTotal.toFixed(1);

    // --- Show Markets Area ---
    ['marketsArea', 'set1Area', 'set2Area', 'set3Area', 'set4Area', 'set5Area',
        'exactScoreArea', 'specialsArea', 'winnerTotalArea', 'handicapTotalArea'].forEach(id => {
            document.getElementById(id).classList.remove('hidden');
        });

    // --- Generate Set Handicap Table ---
    // Get fair probability at the base line
    const fairSpreadH = !isNaN(spreadHomeOdds) && !isNaN(spreadAwayOdds) ?
        solveShin([spreadHomeOdds, spreadAwayOdds])[0] : 0.5;

    // Round base spread to nearest half point
    const baseSpread = !isNaN(spreadLine) ? spreadLine : -1.5;
    const roundedBaseSpread = Math.round(baseSpread * 2) / 2;

    // Generate lines from -2.5 to +2.5 in 0.5 increments
    const spreadLines = [];
    for (let i = -2.5; i <= 2.5; i += 0.5) {
        spreadLines.push(i);
    }

    let spreadHtml = '';
    spreadLines.forEach(line => {
        // Each half-set shift changes prob by ~15%
        const probShift = (line - roundedBaseSpread) * 0.15;
        let pHomeCovers = Math.max(0.01, Math.min(0.99, fairSpreadH + probShift));
        const isBaseLine = Math.abs(line - roundedBaseSpread) < 0.3;
        const rowStyle = isBaseLine ? ' style="background: rgba(59, 130, 246, 0.15);"' : '';
        spreadHtml += `<tr${rowStyle}>
            <td class="line-col">${line > 0 ? '+' : ''}${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pHomeCovers)}</td>
            <td class="num-col">${probToOdds(1 - pHomeCovers)}</td>
        </tr>`;
    });
    document.getElementById('spreadTable').innerHTML = spreadHtml;

    // --- Generate Total Sets Table ---
    // Round base total to nearest half point
    const roundedBaseTotal = Math.round(totalLine * 2) / 2;

    // Generate lines from 2.5 to 4.5 in 0.5 increments
    const totalLines = [2.5, 3.5, 4.5];

    let totalHtml = '';
    totalLines.forEach(line => {
        // Each half-set shift changes prob by ~20%
        const probShift = (line - roundedBaseTotal) * 0.20;
        let pOverLine = Math.max(0.01, Math.min(0.99, pOver - probShift));
        const isBaseLine = Math.abs(line - roundedBaseTotal) < 0.3;
        const rowStyle = isBaseLine ? ' style="background: rgba(59, 130, 246, 0.15);"' : '';
        totalHtml += `<tr${rowStyle}>
            <td class="line-col">${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pOverLine)}</td>
            <td class="num-col">${probToOdds(1 - pOverLine)}</td>
        </tr>`;
    });
    document.getElementById('totalTable').innerHTML = totalHtml;

    // --- INDIVIDUAL SET MARKETS ---
    // For each set, the probability is roughly equal with slight home advantage
    const sets = [
        { ratio: set1Ratio, name: 'Set 1', player1Id: 'set1Player1', player2Id: 'set1Player2' },
        { ratio: set2Ratio, name: 'Set 2', player1Id: 'set2Player1', player2Id: 'set2Player2' },
        { ratio: set3Ratio, name: 'Set 3', player1Id: 'set3Player1', player2Id: 'set3Player2' },
        { ratio: set4Ratio, name: 'Set 4', player1Id: 'set4Player1', player2Id: 'set4Player2' },
        { ratio: set5Ratio, name: 'Set 5', player1Id: 'set5Player1', player2Id: 'set5Player2' }
    ];

    sets.forEach(set => {
        // Each set win probability is approximately the same as match probability
        // with slight variation based on set importance (later sets might be more balanced)
        const setHomeProb = Math.max(0.1, Math.min(0.9, homeWinProb + (Math.random() - 0.5) * 0.05));
        document.getElementById(set.player1Id).textContent = probToOdds(setHomeProb);
        document.getElementById(set.player2Id).textContent = probToOdds(1 - setHomeProb);
    });

    // --- EXACT SCORE ---
    // Calculate probabilities for all possible scores in best of 5
    // Possible outcomes: 3-0, 3-1, 3-2, 2-3, 1-3, 0-3
    const exactScores = calculateExactScores(homeWinProb);
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
    // Total sets odd/even
    // In best of 5: 3 sets = odd, 4 sets = even, 5 sets = odd
    // Roughly: P(3) + P(5) vs P(4)
    const pOdd = exactScores.filter(s => s.label === '3-0' || s.label === '0-3' || s.label === '3-2' || s.label === '2-3')
        .reduce((sum, s) => sum + s.prob, 0);
    const pEven = 1 - pOdd;
    document.getElementById('oddEvenTable').innerHTML = `
        <tr><td>Odd</td><td class="num-col">${probToOdds(pOdd)}</td></tr>
        <tr><td>Even</td><td class="num-col">${probToOdds(pEven)}</td></tr>
    `;

    // --- FIVE SETTER ---
    // P(match goes to 5 sets) = P(3-2) + P(2-3)
    const pFiveSets = exactScores.filter(s => s.label === '3-2' || s.label === '2-3')
        .reduce((sum, s) => sum + s.prob, 0);
    document.getElementById('fiveSetterTable').innerHTML = `
        <tr><td>Yes</td><td class="num-col">${probToOdds(pFiveSets)}</td></tr>
        <tr><td>No</td><td class="num-col">${probToOdds(1 - pFiveSets)}</td></tr>
    `;

    // --- WINNER & TOTAL ---
    // Combine winner probabilities with total sets over/under
    const totalLinesForCombo = [3.5];
    let winnerTotalHtml = '';

    totalLinesForCombo.forEach(line => {
        const probShift = (line - roundedBaseTotal) * 0.20;
        const pOverLine = Math.max(0.05, Math.min(0.95, pOver - probShift));
        const pUnderLine = 1 - pOverLine;

        // Winner & Total combinations
        const homeOver = homeWinProb * pOverLine;
        const homeUnder = homeWinProb * pUnderLine;
        const awayOver = awayWinProb * pOverLine;
        const awayUnder = awayWinProb * pUnderLine;

        winnerTotalHtml += `<tr><td>Player 1 & Over ${line.toFixed(1)}</td><td class="num-col prob-col">${(homeOver * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(homeOver)}</td></tr>`;
        winnerTotalHtml += `<tr><td>Player 1 & Under ${line.toFixed(1)}</td><td class="num-col prob-col">${(homeUnder * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(homeUnder)}</td></tr>`;
        winnerTotalHtml += `<tr><td>Player 2 & Over ${line.toFixed(1)}</td><td class="num-col prob-col">${(awayOver * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(awayOver)}</td></tr>`;
        winnerTotalHtml += `<tr><td>Player 2 & Under ${line.toFixed(1)}</td><td class="num-col prob-col">${(awayUnder * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(awayUnder)}</td></tr>`;
    });
    document.getElementById('winnerTotalTable').innerHTML = winnerTotalHtml;

    // --- HANDICAP & TOTAL ---
    // Combine handicap (spread) probabilities with total sets
    const spreadLinesForCombo = [roundedBaseSpread - 0.5, roundedBaseSpread, roundedBaseSpread + 0.5];
    let handicapTotalHtml = '';

    spreadLinesForCombo.forEach(spreadLineCombo => {
        const spreadProbShift = (spreadLineCombo - roundedBaseSpread) * 0.15;
        const pHomeCoversSpread = Math.max(0.05, Math.min(0.95, fairSpreadH + spreadProbShift));
        const pAwayCoversSpread = 1 - pHomeCoversSpread;

        // For each spread line, combine with total line
        [3.5].forEach(totalLineCombo => {
            const totalProbShift = (totalLineCombo - roundedBaseTotal) * 0.20;
            const pOverTotal = Math.max(0.05, Math.min(0.95, pOver - totalProbShift));
            const pUnderTotal = 1 - pOverTotal;

            // Handicap & Total combinations
            const homeSpreadOver = pHomeCoversSpread * pOverTotal;
            const homeSpreadUnder = pHomeCoversSpread * pUnderTotal;
            const awaySpreadOver = pAwayCoversSpread * pOverTotal;
            const awaySpreadUnder = pAwayCoversSpread * pUnderTotal;

            const spreadLabel = spreadLineCombo > 0 ? `+${spreadLineCombo.toFixed(1)}` : spreadLineCombo.toFixed(1);

            handicapTotalHtml += `<tr><td>Player 1 ${spreadLabel} & Over ${totalLineCombo.toFixed(1)}</td><td class="num-col prob-col">${(homeSpreadOver * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(homeSpreadOver)}</td></tr>`;
            handicapTotalHtml += `<tr><td>Player 1 ${spreadLabel} & Under ${totalLineCombo.toFixed(1)}</td><td class="num-col prob-col">${(homeSpreadUnder * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(homeSpreadUnder)}</td></tr>`;
            handicapTotalHtml += `<tr><td>Player 2 ${spreadLineCombo > 0 ? spreadLineCombo.toFixed(1) : `+${Math.abs(spreadLineCombo).toFixed(1)}`} & Over ${totalLineCombo.toFixed(1)}</td><td class="num-col prob-col">${(awaySpreadOver * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(awaySpreadOver)}</td></tr>`;
            handicapTotalHtml += `<tr><td>Player 2 ${spreadLineCombo > 0 ? spreadLineCombo.toFixed(1) : `+${Math.abs(spreadLineCombo).toFixed(1)}`} & Under ${totalLineCombo.toFixed(1)}</td><td class="num-col prob-col">${(awaySpreadUnder * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(awaySpreadUnder)}</td></tr>`;
        });
    });
    document.getElementById('handicapTotalTable').innerHTML = handicapTotalHtml;
}

// Helper function to calculate exact score probabilities
function calculateExactScores(homeWinProb) {
    // Best of 5 table tennis
    // Possible scores: 3-0, 3-1, 3-2, 2-3, 1-3, 0-3

    // Simplified model: each set is independent with same win probability
    const p = homeWinProb;
    const q = 1 - p;

    // Binomial probabilities for best of 5
    // 3-0: win 3 straight = p^3
    const p30 = p * p * p;

    // 3-1: win 3 out of first 4, with 4th being a loss that comes before the 3rd win
    // = C(3,1) * p^3 * q^1 (choose which of first 3 games to lose)
    const p31 = 3 * p * p * p * q;

    // 3-2: win 3 out of first 5, with 5th being a loss that comes before the 3rd win
    // = C(4,2) * p^3 * q^2
    const p32 = 6 * p * p * p * q * q;

    // 2-3: away wins 3-2
    const p23 = 6 * q * q * q * p * p;

    // 1-3: away wins 3-1
    const p13 = 3 * q * q * q * p;

    // 0-3: away wins 3-0
    const p03 = q * q * q;

    // Normalize
    const total = p30 + p31 + p32 + p23 + p13 + p03;

    return [
        { label: '3-0', prob: p30 / total },
        { label: '3-1', prob: p31 / total },
        { label: '3-2', prob: p32 / total },
        { label: '2-3', prob: p23 / total },
        { label: '1-3', prob: p13 / total },
        { label: '0-3', prob: p03 / total }
    ];
}

// Make global
window.runModel = runModel;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    // Set up API loader
    setRunModelCallback(runModel);
    initTableTennisLoader();

    // Wire up dropdowns
    document.getElementById('apiCountrySelect').addEventListener('change', handleCountryChange);
    document.getElementById('apiLeagueSelect').addEventListener('change', handleLeagueChange);
    document.getElementById('apiMatchSelect').addEventListener('change', handleMatchChange);

    // Initial run
    runModel();
});
