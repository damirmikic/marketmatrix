// NFL (American Football) Model
// Main controller for NFL probability calculations

import {
    initNFLLoader,
    handleCountryChange,
    handleLeagueChange,
    handleMatchChange,
    setRunModelCallback
} from './js/nfl_api.js';

import { probToOdds, solveShin } from './js/core/math_utils.js';

// Helper function to ensure lines ALWAYS end in .5 (never whole numbers)
// Rounds to nearest .5 value: 3.0→3.5, 3.2→3.5, 3.8→3.5, 4.3→4.5
function toHalfPoint(value) {
    return Math.round(value - 0.5) + 0.5;
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

    // Get Quarter Ratios (NFL typically has more balanced scoring than basketball)
    const q1Ratio = parseFloat(document.getElementById('q1Ratio').value) || 0.25;
    const q2Ratio = parseFloat(document.getElementById('q2Ratio').value) || 0.27; // Slightly higher Q2 (teams often score before half)
    const q3Ratio = parseFloat(document.getElementById('q3Ratio').value) || 0.23; // Slightly lower Q3 (halftime adjustments)
    const q4Ratio = parseFloat(document.getElementById('q4Ratio').value) || 0.25; // Q4 normal variance

    // Calculate half ratios from quarter ratios
    const halfRatio1H = q1Ratio + q2Ratio;
    const halfRatio2H = q3Ratio + q4Ratio;

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

    // --- Derive Expected Totals from Over/Under ---
    const fairOU = solveShin([overOdds, underOdds]);
    const pOver = fairOU[0];
    // NFL scoring: adjust expected total based on over probability
    // More conservative adjustment than basketball due to lower scoring
    const expectedTotal = totalLine + (pOver - 0.5) * 12;
    document.getElementById('expectedTotal').textContent = expectedTotal.toFixed(1);

    // --- Show Markets Area ---
    ['marketsArea', 'firstHalfArea', 'secondHalfArea', 'q1Area', 'q2Area', 'q3Area', 'q4Area',
        'teamTotalsArea', 'marginArea', 'specialsArea', 'halftimeFulltimeArea', 'winnerTotalArea',
        'handicapTotalArea'].forEach(id => {
            document.getElementById(id).classList.remove('hidden');
        });

    // --- Generate Spread Table ---
    const fairSpreadH = !isNaN(spreadHomeOdds) && !isNaN(spreadAwayOdds) ?
        solveShin([spreadHomeOdds, spreadAwayOdds])[0] : 0.5;

    // Round base spread to nearest half point (always .5)
    const baseSpread = !isNaN(spreadLine) ? spreadLine : -3.5;
    const roundedBaseSpread = toHalfPoint(baseSpread);

    // Generate spread lines from -14 to +14 (typical NFL range), half points only
    const spreadLinesClean = [];
    for (let i = -14; i <= 14; i++) {
        const halfLine = i + 0.5;
        spreadLinesClean.push(halfLine);
    }
    // Remove -0.5 and +0.5 (rare in NFL)
    const uniqueSpreadLines = [...new Set(spreadLinesClean)]
        .filter(line => Math.abs(line) !== 0.5)
        .sort((a, b) => a - b);

    let spreadHtml = '';
    uniqueSpreadLines.forEach(line => {
        // NFL: Each point shift changes prob by ~4% (more sensitive than basketball due to lower scoring)
        const probShift = (line - roundedBaseSpread) * 0.04;
        let pHomeCovers = Math.max(0.01, Math.min(0.99, fairSpreadH + probShift));
        const isBaseLine = Math.abs(line - roundedBaseSpread) < 0.6;
        const rowStyle = isBaseLine ? ' style="background: rgba(59, 130, 246, 0.15);"' : '';
        spreadHtml += `<tr${rowStyle}>
            <td class="line-col">${line > 0 ? '+' : ''}${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pHomeCovers)}</td>
            <td class="num-col">${probToOdds(1 - pHomeCovers)}</td>
        </tr>`;
    });
    document.getElementById('spreadTable').innerHTML = spreadHtml;

    // --- Generate Total Points Table ---
    const roundedBaseTotal = toHalfPoint(totalLine);

    // Generate total lines (NFL typical range: 35-65 points)
    const totalLinesClean = [];
    for (let i = -8; i <= 8; i++) {
        const line = roundedBaseTotal + i;
        const halfLine = Math.floor(line) + 0.5;
        totalLinesClean.push(halfLine);
    }
    const uniqueTotalLines = [...new Set(totalLinesClean)].sort((a, b) => a - b);

    let totalHtml = '';
    uniqueTotalLines.forEach(line => {
        // NFL: Each point shift changes prob by ~3.5% (slightly more sensitive than basketball)
        const probShift = (line - roundedBaseTotal) * 0.035;
        let pOverLine = Math.max(0.01, Math.min(0.99, pOver - probShift));
        const isBaseLine = Math.abs(line - roundedBaseTotal) < 0.6;
        const rowStyle = isBaseLine ? ' style="background: rgba(59, 130, 246, 0.15);"' : '';
        totalHtml += `<tr${rowStyle}>
            <td class="line-col">${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pOverLine)}</td>
            <td class="num-col">${probToOdds(1 - pOverLine)}</td>
        </tr>`;
    });
    document.getElementById('totalTable').innerHTML = totalHtml;

    // --- Team Totals ---
    // NFL: Team totals based on spread and total
    const marginAdj = !isNaN(spreadLine) ? spreadLine * -0.5 : 0;
    const homeExpected = (expectedTotal / 2) + marginAdj;
    const awayExpected = (expectedTotal / 2) - marginAdj;

    // Round to nearest half point
    const homeBase = toHalfPoint(homeExpected);
    const awayBase = toHalfPoint(awayExpected);

    function generateTeamTotalLines(base) {
        return [base - 1.5, base - 0.5, base + 0.5, base + 1.5];
    }

    const homeLines = generateTeamTotalLines(homeBase);
    let homeTeamHtml = '';
    homeLines.forEach(line => {
        const probShift = (line - homeBase) * 0.045;
        let pOverLine = Math.max(0.05, Math.min(0.95, 0.5 - probShift));
        const isBaseLine = Math.abs(line - homeBase) < 0.8;
        const rowStyle = isBaseLine ? ' style="background: rgba(59, 130, 246, 0.15);"' : '';
        homeTeamHtml += `<tr${rowStyle}>
            <td class="line-col">${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pOverLine)}</td>
            <td class="num-col">${probToOdds(1 - pOverLine)}</td>
        </tr>`;
    });
    document.getElementById('homeTeamTotalTable').innerHTML = homeTeamHtml;

    const awayLines = generateTeamTotalLines(awayBase);
    let awayTeamHtml = '';
    awayLines.forEach(line => {
        const probShift = (line - awayBase) * 0.045;
        let pOverLine = Math.max(0.05, Math.min(0.95, 0.5 - probShift));
        const isBaseLine = Math.abs(line - awayBase) < 0.8;
        const rowStyle = isBaseLine ? ' style="background: rgba(59, 130, 246, 0.15);"' : '';
        awayTeamHtml += `<tr${rowStyle}>
            <td class="line-col">${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pOverLine)}</td>
            <td class="num-col">${probToOdds(1 - pOverLine)}</td>
        </tr>`;
    });
    document.getElementById('awayTeamTotalTable').innerHTML = awayTeamHtml;

    // --- HALF MARKETS ---
    const spread1H = roundedBaseSpread * halfRatio1H;
    const total1H = expectedTotal * halfRatio1H;
    // Round to nearest half point (always .5)
    const spread1HBase = toHalfPoint(spread1H);
    const total1HBase = toHalfPoint(total1H);

    const spread1HLines = [spread1HBase - 3, spread1HBase - 2, spread1HBase - 1,
                           spread1HBase, spread1HBase + 1, spread1HBase + 2, spread1HBase + 3]
        .filter(l => l !== 0.0 && Math.abs(l) !== 0.5);
    let spread1HHtml = '';
    spread1HLines.forEach(line => {
        const probShift = (line - spread1HBase) * 0.07;
        let pHome = Math.max(0.05, Math.min(0.95, fairSpreadH + probShift));
        spread1HHtml += `<tr>
            <td class="line-col">${line > 0 ? '+' : ''}${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pHome)}</td>
            <td class="num-col">${probToOdds(1 - pHome)}</td>
        </tr>`;
    });
    document.getElementById('firstHalfSpreadTable').innerHTML = spread1HHtml;

    const total1HLines = [total1HBase - 2, total1HBase - 1, total1HBase,
                          total1HBase + 1, total1HBase + 2];
    let total1HHtml = '';
    total1HLines.forEach(line => {
        const probShift = (line - total1HBase) * 0.06;
        let pOver1H = Math.max(0.05, Math.min(0.95, 0.5 - probShift));
        total1HHtml += `<tr>
            <td class="line-col">${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pOver1H)}</td>
            <td class="num-col">${probToOdds(1 - pOver1H)}</td>
        </tr>`;
    });
    document.getElementById('firstHalfTotalTable').innerHTML = total1HHtml;

    // 2H markets
    const spread2H = roundedBaseSpread * halfRatio2H;
    const total2H = expectedTotal * halfRatio2H;
    // Round to nearest half point (always .5)
    const spread2HBase = toHalfPoint(spread2H);
    const total2HBase = toHalfPoint(total2H);

    const spread2HLines = [spread2HBase - 3, spread2HBase - 2, spread2HBase - 1,
                           spread2HBase, spread2HBase + 1, spread2HBase + 2, spread2HBase + 3]
        .filter(l => l !== 0.0 && Math.abs(l) !== 0.5);
    let spread2HHtml = '';
    spread2HLines.forEach(line => {
        const probShift = (line - spread2HBase) * 0.07;
        let pHome = Math.max(0.05, Math.min(0.95, fairSpreadH + probShift));
        spread2HHtml += `<tr>
            <td class="line-col">${line > 0 ? '+' : ''}${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pHome)}</td>
            <td class="num-col">${probToOdds(1 - pHome)}</td>
        </tr>`;
    });
    document.getElementById('secondHalfSpreadTable').innerHTML = spread2HHtml;

    const total2HLines = [total2HBase - 2, total2HBase - 1, total2HBase,
                          total2HBase + 1, total2HBase + 2];
    let total2HHtml = '';
    total2HLines.forEach(line => {
        const probShift = (line - total2HBase) * 0.06;
        let pOver2H = Math.max(0.05, Math.min(0.95, 0.5 - probShift));
        total2HHtml += `<tr>
            <td class="line-col">${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pOver2H)}</td>
            <td class="num-col">${probToOdds(1 - pOver2H)}</td>
        </tr>`;
    });
    document.getElementById('secondHalfTotalTable').innerHTML = total2HHtml;

    // --- QUARTER MARKETS ---
    const quarters = [
        { ratio: q1Ratio, name: 'Q1', spreadTableId: 'q1SpreadTable', totalTableId: 'q1TotalTable', dnbHomeId: 'dnbQ1Home', dnbAwayId: 'dnbQ1Away' },
        { ratio: q2Ratio, name: 'Q2', spreadTableId: 'q2SpreadTable', totalTableId: 'q2TotalTable', dnbHomeId: 'dnbQ2Home', dnbAwayId: 'dnbQ2Away' },
        { ratio: q3Ratio, name: 'Q3', spreadTableId: 'q3SpreadTable', totalTableId: 'q3TotalTable', dnbHomeId: 'dnbQ3Home', dnbAwayId: 'dnbQ3Away' },
        { ratio: q4Ratio, name: 'Q4', spreadTableId: 'q4SpreadTable', totalTableId: 'q4TotalTable', dnbHomeId: 'dnbQ4Home', dnbAwayId: 'dnbQ4Away' }
    ];

    quarters.forEach((quarter, index) => {
        const spreadQ = roundedBaseSpread * quarter.ratio;
        const totalQ = expectedTotal * quarter.ratio;
        // Round to nearest half point (always .5)
        const spreadQBase = toHalfPoint(spreadQ);
        const totalQBase = toHalfPoint(totalQ);

        // NFL quarters have relatively consistent variance
        const spreadCoef = 0.09;
        const totalCoef = 0.07;

        const spreadQLines = [spreadQBase - 2, spreadQBase - 1, spreadQBase,
                              spreadQBase + 1, spreadQBase + 2]
            .filter(l => l !== 0.0 && Math.abs(l) !== 0.5);
        let spreadQHtml = '';
        spreadQLines.forEach(line => {
            const probShift = (line - spreadQBase) * spreadCoef;
            let pHome = Math.max(0.05, Math.min(0.95, fairSpreadH + probShift));
            spreadQHtml += `<tr>
                <td class="line-col">${line > 0 ? '+' : ''}${line.toFixed(1)}</td>
                <td class="num-col">${probToOdds(pHome)}</td>
                <td class="num-col">${probToOdds(1 - pHome)}</td>
            </tr>`;
        });
        document.getElementById(quarter.spreadTableId).innerHTML = spreadQHtml;

        const totalQLines = [totalQBase - 1, totalQBase, totalQBase + 1, totalQBase + 2];
        let totalQHtml = '';
        totalQLines.forEach(line => {
            const probShift = (line - totalQBase) * totalCoef;
            let pOverQ = Math.max(0.05, Math.min(0.95, 0.5 - probShift));
            totalQHtml += `<tr>
                <td class="line-col">${line.toFixed(1)}</td>
                <td class="num-col">${probToOdds(pOverQ)}</td>
                <td class="num-col">${probToOdds(1 - pOverQ)}</td>
            </tr>`;
        });
        document.getElementById(quarter.totalTableId).innerHTML = totalQHtml;

        // Quarter DNB
        const pHomeQWins = Math.max(0.1, Math.min(0.9, fairSpreadH + (0 - spreadQBase) * spreadCoef));
        document.getElementById(quarter.dnbHomeId).textContent = probToOdds(pHomeQWins);
        document.getElementById(quarter.dnbAwayId).textContent = probToOdds(1 - pHomeQWins);
    });

    // --- WINNING MARGIN ---
    const expectedMargin = -roundedBaseSpread;
    let marginHtml = '';
    const marginProbs = estimateMarginProbs(homeWinProb, expectedMargin);
    marginProbs.forEach(m => {
        marginHtml += `<tr>
            <td>${m.label}</td>
            <td class="num-col prob-col">${(m.prob * 100).toFixed(1)}%</td>
            <td class="num-col">${probToOdds(m.prob)}</td>
        </tr>`;
    });
    document.getElementById('marginTable').innerHTML = marginHtml;

    // --- HALF DRAW NO BET ---
    const pHome1HWins = Math.max(0.1, Math.min(0.9, fairSpreadH + (0 - spread1HBase) * 0.07));
    const pHome2HWins = Math.max(0.1, Math.min(0.9, fairSpreadH + (0 - spread2HBase) * 0.07));

    document.getElementById('dnb1HHome').textContent = probToOdds(pHome1HWins);
    document.getElementById('dnb1HAway').textContent = probToOdds(1 - pHome1HWins);
    document.getElementById('dnb2HHome').textContent = probToOdds(pHome2HWins);
    document.getElementById('dnb2HAway').textContent = probToOdds(1 - pHome2HWins);

    // --- ODD/EVEN ---
    document.getElementById('oddEvenTable').innerHTML = `
        <tr><td>Odd</td><td class="num-col">${probToOdds(0.5)}</td></tr>
        <tr><td>Even</td><td class="num-col">${probToOdds(0.5)}</td></tr>
    `;

    // --- HIGHEST SCORING HALF ---
    const p1HHigher = 0.48;
    const p2HHigher = 0.45;
    const pTied = 0.07;
    document.getElementById('highScoringHalfTable').innerHTML = `
        <tr><td>1st Half</td><td class="num-col">${probToOdds(p1HHigher)}</td></tr>
        <tr><td>2nd Half</td><td class="num-col">${probToOdds(p2HHigher)}</td></tr>
        <tr><td>Tie</td><td class="num-col">${probToOdds(pTied)}</td></tr>
    `;

    // --- HALFTIME/FULLTIME ---
    const pHomeHT = pHome1HWins;
    const pAwayHT = 1 - pHome1HWins;

    const pHomeFT_givenHomeHT = Math.min(0.95, homeWinProb + 0.18);
    const pAwayFT_givenHomeHT = 1 - pHomeFT_givenHomeHT;
    const pAwayFT_givenAwayHT = Math.min(0.95, awayWinProb + 0.18);
    const pHomeFT_givenAwayHT = 1 - pAwayFT_givenAwayHT;

    const htftCombos = [
        { label: "Home/Home", prob: pHomeHT * pHomeFT_givenHomeHT },
        { label: "Home/Away", prob: pHomeHT * pAwayFT_givenHomeHT },
        { label: "Away/Home", prob: pAwayHT * pHomeFT_givenAwayHT },
        { label: "Away/Away", prob: pAwayHT * pAwayFT_givenAwayHT }
    ];

    let htftHtml = '';
    htftCombos.forEach(combo => {
        htftHtml += `<tr>
            <td>${combo.label}</td>
            <td class="num-col prob-col">${(combo.prob * 100).toFixed(1)}%</td>
            <td class="num-col">${probToOdds(combo.prob)}</td>
        </tr>`;
    });
    document.getElementById('halftimeFulltimeTable').innerHTML = htftHtml;

    // --- WINNER & TOTAL ---
    const totalLines = [roundedBaseTotal - 4, roundedBaseTotal - 2, roundedBaseTotal, roundedBaseTotal + 2, roundedBaseTotal + 4];
    let winnerTotalHtml = '';

    totalLines.forEach(line => {
        const probShift = (line - roundedBaseTotal) * 0.035;
        const pOverLine = Math.max(0.05, Math.min(0.95, pOver - probShift));
        const pUnderLine = 1 - pOverLine;

        const homeOver = homeWinProb * pOverLine;
        const homeUnder = homeWinProb * pUnderLine;
        const awayOver = awayWinProb * pOverLine;
        const awayUnder = awayWinProb * pUnderLine;

        winnerTotalHtml += `<tr><td>Home & Over ${line.toFixed(1)}</td><td class="num-col prob-col">${(homeOver * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(homeOver)}</td></tr>`;
        winnerTotalHtml += `<tr><td>Home & Under ${line.toFixed(1)}</td><td class="num-col prob-col">${(homeUnder * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(homeUnder)}</td></tr>`;
        winnerTotalHtml += `<tr><td>Away & Over ${line.toFixed(1)}</td><td class="num-col prob-col">${(awayOver * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(awayOver)}</td></tr>`;
        winnerTotalHtml += `<tr><td>Away & Under ${line.toFixed(1)}</td><td class="num-col prob-col">${(awayUnder * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(awayUnder)}</td></tr>`;
    });
    document.getElementById('winnerTotalTable').innerHTML = winnerTotalHtml;

    // --- HANDICAP & TOTAL ---
    const spreadLinesForCombo = [roundedBaseSpread - 3, roundedBaseSpread, roundedBaseSpread + 3];
    let handicapTotalHtml = '';

    spreadLinesForCombo.forEach(spreadLineCombo => {
        const spreadProbShift = (spreadLineCombo - roundedBaseSpread) * 0.04;
        const pHomeCoversSpread = Math.max(0.05, Math.min(0.95, fairSpreadH + spreadProbShift));
        const pAwayCoversSpread = 1 - pHomeCoversSpread;

        [roundedBaseTotal - 3, roundedBaseTotal, roundedBaseTotal + 3].forEach(totalLineCombo => {
            const totalProbShift = (totalLineCombo - roundedBaseTotal) * 0.035;
            const pOverTotal = Math.max(0.05, Math.min(0.95, pOver - totalProbShift));
            const pUnderTotal = 1 - pOverTotal;

            const homeSpreadOver = pHomeCoversSpread * pOverTotal;
            const homeSpreadUnder = pHomeCoversSpread * pUnderTotal;
            const awaySpreadOver = pAwayCoversSpread * pOverTotal;
            const awaySpreadUnder = pAwayCoversSpread * pUnderTotal;

            const spreadLabel = spreadLineCombo > 0 ? `+${spreadLineCombo.toFixed(1)}` : spreadLineCombo.toFixed(1);
            const awaySpreadLabel = spreadLineCombo > 0 ? spreadLineCombo.toFixed(1) : `+${Math.abs(spreadLineCombo).toFixed(1)}`;

            handicapTotalHtml += `<tr><td>Home ${spreadLabel} & Over ${totalLineCombo.toFixed(1)}</td><td class="num-col prob-col">${(homeSpreadOver * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(homeSpreadOver)}</td></tr>`;
            handicapTotalHtml += `<tr><td>Home ${spreadLabel} & Under ${totalLineCombo.toFixed(1)}</td><td class="num-col prob-col">${(homeSpreadUnder * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(homeSpreadUnder)}</td></tr>`;
            handicapTotalHtml += `<tr><td>Away ${awaySpreadLabel} & Over ${totalLineCombo.toFixed(1)}</td><td class="num-col prob-col">${(awaySpreadOver * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(awaySpreadOver)}</td></tr>`;
            handicapTotalHtml += `<tr><td>Away ${awaySpreadLabel} & Under ${totalLineCombo.toFixed(1)}</td><td class="num-col prob-col">${(awaySpreadUnder * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(awaySpreadUnder)}</td></tr>`;
        });
    });
    document.getElementById('handicapTotalTable').innerHTML = handicapTotalHtml;
}

// Helper function to estimate margin probability bands for NFL
function estimateMarginProbs(homeWinProb, expectedMargin, stdDev = 10) {
    // NFL has slightly lower standard deviation than basketball (10 vs 12)
    const probs = [];

    // Home margins
    if (homeWinProb > 0) {
        probs.push({ label: 'Home 1-3', prob: homeWinProb * normalInRange(expectedMargin, stdDev, 1, 3) });
        probs.push({ label: 'Home 4-7', prob: homeWinProb * normalInRange(expectedMargin, stdDev, 4, 7) });
        probs.push({ label: 'Home 8-14', prob: homeWinProb * normalInRange(expectedMargin, stdDev, 8, 14) });
        probs.push({ label: 'Home 15-21', prob: homeWinProb * normalInRange(expectedMargin, stdDev, 15, 21) });
        probs.push({ label: 'Home 22+', prob: homeWinProb * normalInRange(expectedMargin, stdDev, 22, 50) });
    }

    // Away margins
    const awayWinProb = 1 - homeWinProb;
    if (awayWinProb > 0) {
        probs.push({ label: 'Away 1-3', prob: awayWinProb * normalInRange(-expectedMargin, stdDev, 1, 3) });
        probs.push({ label: 'Away 4-7', prob: awayWinProb * normalInRange(-expectedMargin, stdDev, 4, 7) });
        probs.push({ label: 'Away 8-14', prob: awayWinProb * normalInRange(-expectedMargin, stdDev, 8, 14) });
        probs.push({ label: 'Away 15-21', prob: awayWinProb * normalInRange(-expectedMargin, stdDev, 15, 21) });
        probs.push({ label: 'Away 22+', prob: awayWinProb * normalInRange(-expectedMargin, stdDev, 22, 50) });
    }

    // Normalize
    const total = probs.reduce((sum, p) => sum + p.prob, 0);
    probs.forEach(p => p.prob = p.prob / total);

    return probs;
}

// Simple normal distribution range probability
function normalInRange(mean, std, low, high) {
    const midpoint = (low + high) / 2;
    const distance = Math.abs(midpoint - mean) / std;
    return Math.max(0.02, Math.exp(-0.5 * distance * distance) * (high - low) / (std * 2.5));
}

// Make global
window.runModel = runModel;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    setRunModelCallback(runModel);
    initNFLLoader();

    // Wire up dropdowns
    document.getElementById('apiCountrySelect').addEventListener('change', handleCountryChange);
    document.getElementById('apiLeagueSelect').addEventListener('change', handleLeagueChange);
    document.getElementById('apiMatchSelect').addEventListener('change', handleMatchChange);

    // Initial run
    runModel();
});
