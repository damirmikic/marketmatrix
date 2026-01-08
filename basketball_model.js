// Basketball Model
// Main controller for basketball probability calculations

import {
    initBasketballLoader,
    handleCountryChange,
    handleLeagueChange,
    handleMatchChange,
    setRunModelCallback
} from './js/basketball_api.js';

import { probToOdds, solveShin } from './js/core/math_utils.js';

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
    
    // Get Quarter Ratios
    const q1Ratio = parseFloat(document.getElementById('q1Ratio').value) || 0.25;
    const q2Ratio = parseFloat(document.getElementById('q2Ratio').value) || 0.25;
    const q3Ratio = parseFloat(document.getElementById('q3Ratio').value) || 0.25;
    const q4Ratio = parseFloat(document.getElementById('q4Ratio').value) || 0.25;
    
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
    // Using: P(Over) = 1 - Normal_CDF((line - mean) / std)
    // This is complex without the std. For simplicity, assume 50/50 at line means expected = line
    const fairOU = solveShin([overOdds, underOdds]);
    const pOver = fairOU[0];
    // Very rough estimate: if P(Over) = 0.5, expected total ≈ line
    // Adjust: higher P(Over) means expected is above line
    // Simple linear approximation: expectedTotal ≈ line + (pOver - 0.5) * 20
    const expectedTotal = totalLine + (pOver - 0.5) * 20;
    document.getElementById('expectedTotal').textContent = expectedTotal.toFixed(1);

    // --- Show Markets Area ---
    ['marketsArea', 'firstHalfArea', 'secondHalfArea', 'q1Area', 'q2Area', 'q3Area', 'q4Area',
        'teamTotalsArea', 'marginArea', 'specialsArea', 'halftimeFulltimeArea', 'winnerTotalArea',
        'handicapTotalArea'].forEach(id => {
            document.getElementById(id).classList.remove('hidden');
        });

    // --- Generate Spread Table ---
    // Get fair probability at the base line
    const fairSpreadH = !isNaN(spreadHomeOdds) && !isNaN(spreadAwayOdds) ?
        solveShin([spreadHomeOdds, spreadAwayOdds])[0] : 0.5;

    // Round base spread to nearest half point
    const baseSpread = !isNaN(spreadLine) ? spreadLine : -3.5;
    const roundedBaseSpread = Math.round(baseSpread * 2) / 2;

    // Generate lines from -8 to +8 from base, always half points
    const spreadLines = [];
    for (let offset = -8; offset <= 8; offset += 1) {
        spreadLines.push(roundedBaseSpread + offset + 0.5 * (offset % 2 === 0 ? 0 : 0));
    }
    // Simpler: just generate -8 to +8 in 1-point increments, ensure half points
    const spreadLinesClean = [];
    for (let i = -8; i <= 8; i++) {
        const line = roundedBaseSpread + i;
        // Ensure it's a half point (ends in .5)
        const halfLine = Math.floor(line) + 0.5;
        spreadLinesClean.push(halfLine);
    }
    // Remove duplicates, exclude -0.5 and +0.5, and sort
    const uniqueSpreadLines = [...new Set(spreadLinesClean)]
        .filter(line => Math.abs(line) !== 0.5)
        .sort((a, b) => a - b);

    let spreadHtml = '';
    uniqueSpreadLines.forEach(line => {
        // Each point shift changes prob by ~3.5%
        // More negative line = harder for home = lower probability
        // Line -10.5 vs base -3.5: offset = -10.5 - (-3.5) = -7, prob should DROP
        const probShift = (line - roundedBaseSpread) * 0.035;
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
    // Round base total to nearest half point
    const roundedBaseTotal = Math.round(totalLine * 2) / 2;

    // Generate lines from -8 to +8 from base, always half points
    const totalLinesClean = [];
    for (let i = -8; i <= 8; i++) {
        const line = roundedBaseTotal + i;
        const halfLine = Math.floor(line) + 0.5;
        totalLinesClean.push(halfLine);
    }
    const uniqueTotalLines = [...new Set(totalLinesClean)].sort((a, b) => a - b);

    let totalHtml = '';
    uniqueTotalLines.forEach(line => {
        // Each point shift changes prob by ~3%
        const probShift = (line - roundedBaseTotal) * 0.03;
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

    // --- Team Totals (Simple Approximation) ---
    // Home expected = (expectedTotal / 2) + (spreadLine * -0.5)
    // Away expected = (expectedTotal / 2) - (spreadLine * -0.5)
    const marginAdj = !isNaN(spreadLine) ? spreadLine * -0.5 : 0;
    const homeExpected = (expectedTotal / 2) + marginAdj;
    const awayExpected = (expectedTotal / 2) - marginAdj;

    // Round to half points
    const homeBase = Math.floor(homeExpected) + 0.5;
    const awayBase = Math.floor(awayExpected) + 0.5;

    // Generate 4 lines: base-1, base, base+1, base+2 (always half points, 1-point increments)
    function generateTeamTotalLines(base) {
        return [base - 1, base, base + 1, base + 2];
    }

    // Generate home team total lines
    const homeLines = generateTeamTotalLines(homeBase);
    let homeTeamHtml = '';
    homeLines.forEach(line => {
        const probShift = (line - homeBase) * 0.04;
        let pOverLine = Math.max(0.05, Math.min(0.95, 0.5 - probShift));
        const isBaseLine = Math.abs(line - homeBase) < 1.1 && line > homeBase - 1;
        const rowStyle = isBaseLine ? ' style="background: rgba(59, 130, 246, 0.15);"' : '';
        homeTeamHtml += `<tr${rowStyle}>
            <td class="line-col">${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pOverLine)}</td>
            <td class="num-col">${probToOdds(1 - pOverLine)}</td>
        </tr>`;
    });
    document.getElementById('homeTeamTotalTable').innerHTML = homeTeamHtml;

    // Generate away team total lines
    const awayLines = generateTeamTotalLines(awayBase);
    let awayTeamHtml = '';
    awayLines.forEach(line => {
        const probShift = (line - awayBase) * 0.04;
        let pOverLine = Math.max(0.05, Math.min(0.95, 0.5 - probShift));
        const isBaseLine = Math.abs(line - awayBase) < 1.1 && line > awayBase - 1;
        const rowStyle = isBaseLine ? ' style="background: rgba(59, 130, 246, 0.15);"' : '';
        awayTeamHtml += `<tr${rowStyle}>
            <td class="line-col">${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pOverLine)}</td>
            <td class="num-col">${probToOdds(1 - pOverLine)}</td>
        </tr>`;
    });
    document.getElementById('awayTeamTotalTable').innerHTML = awayTeamHtml;

    // --- HALF MARKETS ---
    // Use calculated ratios from quarter inputs
    // 1H expected spread and total
    const spread1H = roundedBaseSpread * halfRatio1H;
    const total1H = expectedTotal * halfRatio1H;
    const spread1HBase = Math.floor(spread1H) + 0.5; // force to half points
    const total1HBase = Math.floor(total1H) + 0.5;

    // Generate 1H Spread table (5 lines), exclude 0.0, ±0.5
    const spread1HLines = [spread1HBase - 2, spread1HBase - 1, spread1HBase, spread1HBase + 1, spread1HBase + 2]
        .filter(l => l !== 0.0 && Math.abs(l) !== 0.5);
    let spread1HHtml = '';
    spread1HLines.forEach(line => {
        const probShift = (line - spread1HBase) * 0.06;
        let pHome = Math.max(0.05, Math.min(0.95, fairSpreadH + probShift));
        spread1HHtml += `<tr>
            <td class="line-col">${line > 0 ? '+' : ''}${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pHome)}</td>
            <td class="num-col">${probToOdds(1 - pHome)}</td>
        </tr>`;
    });
    document.getElementById('firstHalfSpreadTable').innerHTML = spread1HHtml;

    // Generate 1H Total table (4 lines)
    const total1HLines = [total1HBase - 2, total1HBase - 1, total1HBase, total1HBase + 1];
    let total1HHtml = '';
    total1HLines.forEach(line => {
        const probShift = (line - total1HBase) * 0.05;
        let pOver1H = Math.max(0.05, Math.min(0.95, 0.5 - probShift));
        total1HHtml += `<tr>
            <td class="line-col">${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pOver1H)}</td>
            <td class="num-col">${probToOdds(1 - pOver1H)}</td>
        </tr>`;
    });
    document.getElementById('firstHalfTotalTable').innerHTML = total1HHtml;

    // 2H markets (similar logic)
    const spread2H = roundedBaseSpread * halfRatio2H;
    const total2H = expectedTotal * halfRatio2H;
    const spread2HBase = Math.floor(spread2H) + 0.5; // force to half points
    const total2HBase = Math.floor(total2H) + 0.5;

    const spread2HLines = [spread2HBase - 2, spread2HBase - 1, spread2HBase, spread2HBase + 1, spread2HBase + 2]
        .filter(l => l !== 0.0 && Math.abs(l) !== 0.5);
    let spread2HHtml = '';
    spread2HLines.forEach(line => {
        const probShift = (line - spread2HBase) * 0.06;
        let pHome = Math.max(0.05, Math.min(0.95, fairSpreadH + probShift));
        spread2HHtml += `<tr>
            <td class="line-col">${line > 0 ? '+' : ''}${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pHome)}</td>
            <td class="num-col">${probToOdds(1 - pHome)}</td>
        </tr>`;
    });
    document.getElementById('secondHalfSpreadTable').innerHTML = spread2HHtml;

    const total2HLines = [total2HBase - 2, total2HBase - 1, total2HBase, total2HBase + 1];
    let total2HHtml = '';
    total2HLines.forEach(line => {
        const probShift = (line - total2HBase) * 0.05;
        let pOver2H = Math.max(0.05, Math.min(0.95, 0.5 - probShift));
        total2HHtml += `<tr>
            <td class="line-col">${line.toFixed(1)}</td>
            <td class="num-col">${probToOdds(pOver2H)}</td>
            <td class="num-col">${probToOdds(1 - pOver2H)}</td>
        </tr>`;
    });
    document.getElementById('secondHalfTotalTable').innerHTML = total2HHtml;

    // --- QUARTER MARKETS ---
    // Generate markets for each quarter using the quarter ratios
    const quarters = [
        { ratio: q1Ratio, name: 'Q1', spreadTableId: 'q1SpreadTable', totalTableId: 'q1TotalTable', dnbHomeId: 'dnbQ1Home', dnbAwayId: 'dnbQ1Away' },
        { ratio: q2Ratio, name: 'Q2', spreadTableId: 'q2SpreadTable', totalTableId: 'q2TotalTable', dnbHomeId: 'dnbQ2Home', dnbAwayId: 'dnbQ2Away' },
        { ratio: q3Ratio, name: 'Q3', spreadTableId: 'q3SpreadTable', totalTableId: 'q3TotalTable', dnbHomeId: 'dnbQ3Home', dnbAwayId: 'dnbQ3Away' },
        { ratio: q4Ratio, name: 'Q4', spreadTableId: 'q4SpreadTable', totalTableId: 'q4TotalTable', dnbHomeId: 'dnbQ4Home', dnbAwayId: 'dnbQ4Away' }
    ];

    quarters.forEach(quarter => {
        // Expected spread and total for this quarter
        const spreadQ = roundedBaseSpread * quarter.ratio;
        const totalQ = expectedTotal * quarter.ratio;

        // Force spread to half points (never whole numbers)
        const spreadQBase = Math.floor(spreadQ) + 0.5;
        const totalQBase = Math.floor(totalQ) + 0.5;

        // Generate Quarter Spread table (5 lines on half points), exclude 0.0, ±0.5
        const spreadQLines = [spreadQBase - 2, spreadQBase - 1, spreadQBase, spreadQBase + 1, spreadQBase + 2]
            .filter(l => l !== 0.0 && Math.abs(l) !== 0.5);
        let spreadQHtml = '';
        spreadQLines.forEach(line => {
            const probShift = (line - spreadQBase) * 0.08;
            let pHome = Math.max(0.05, Math.min(0.95, fairSpreadH + probShift));
            spreadQHtml += `<tr>
                <td class="line-col">${line > 0 ? '+' : ''}${line.toFixed(1)}</td>
                <td class="num-col">${probToOdds(pHome)}</td>
                <td class="num-col">${probToOdds(1 - pHome)}</td>
            </tr>`;
        });
        document.getElementById(quarter.spreadTableId).innerHTML = spreadQHtml;

        // Generate Quarter Total table (4 lines on half points)
        const totalQLines = [totalQBase - 1, totalQBase, totalQBase + 1, totalQBase + 2];
        let totalQHtml = '';
        totalQLines.forEach(line => {
            const probShift = (line - totalQBase) * 0.06;
            let pOverQ = Math.max(0.05, Math.min(0.95, 0.5 - probShift));
            totalQHtml += `<tr>
                <td class="line-col">${line.toFixed(1)}</td>
                <td class="num-col">${probToOdds(pOverQ)}</td>
                <td class="num-col">${probToOdds(1 - pOverQ)}</td>
            </tr>`;
        });
        document.getElementById(quarter.totalTableId).innerHTML = totalQHtml;

        // Quarter DNB - who wins the quarter (excluding ties)
        const pHomeQWins = Math.max(0.1, Math.min(0.9, fairSpreadH + (0 - spreadQBase) * 0.08));
        document.getElementById(quarter.dnbHomeId).textContent = probToOdds(pHomeQWins);
        document.getElementById(quarter.dnbAwayId).textContent = probToOdds(1 - pHomeQWins);
    });

    // --- WINNING MARGIN ---
    // Based on home win prob and spread, estimate margin bands
    const marginBands = [
        { label: 'Home 1-5', check: (h, a) => h > a && (h - a) <= 5 },
        { label: 'Home 6-10', check: (h, a) => h > a && (h - a) > 5 && (h - a) <= 10 },
        { label: 'Home 11-15', check: (h, a) => h > a && (h - a) > 10 && (h - a) <= 15 },
        { label: 'Home 16+', check: (h, a) => h > a && (h - a) > 15 },
        { label: 'Away 1-5', check: (h, a) => a > h && (a - h) <= 5 },
        { label: 'Away 6-10', check: (h, a) => a > h && (a - h) > 5 && (a - h) <= 10 },
        { label: 'Away 11-15', check: (h, a) => a > h && (a - h) > 10 && (a - h) <= 15 },
        { label: 'Away 16+', check: (h, a) => a > h && (a - h) > 15 }
    ];
    // Rough probability distribution based on home win prob
    // Home wins by margin: roughly normal around expected margin
    const expectedMargin = -roundedBaseSpread; // positive = home leads
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
    // DNB for halves - who wins the half (excluding tied halves)
    // Based on spread for the half, calculate DNB odds
    // P(Home wins half) ≈ P(Home covers -0.5 spread)
    const pHome1HWins = Math.max(0.1, Math.min(0.9, fairSpreadH + (0 - spread1HBase) * 0.06));
    const pHome2HWins = Math.max(0.1, Math.min(0.9, fairSpreadH + (0 - spread2HBase) * 0.06));

    document.getElementById('dnb1HHome').textContent = probToOdds(pHome1HWins);
    document.getElementById('dnb1HAway').textContent = probToOdds(1 - pHome1HWins);
    document.getElementById('dnb2HHome').textContent = probToOdds(pHome2HWins);
    document.getElementById('dnb2HAway').textContent = probToOdds(1 - pHome2HWins);

    // --- ODD/EVEN ---
    // Total points odd/even is roughly 50/50
    document.getElementById('oddEvenTable').innerHTML = `
        <tr><td>Odd</td><td class="num-col">${probToOdds(0.5)}</td></tr>
        <tr><td>Even</td><td class="num-col">${probToOdds(0.5)}</td></tr>
    `;

    // --- HIGHEST SCORING HALF ---
    // 2nd half usually has slightly more points
    const p1HHigher = 0.42;
    const p2HHigher = 0.48;
    const pTied = 0.10;
    document.getElementById('highScoringHalfTable').innerHTML = `
        <tr><td>1st Half</td><td class="num-col">${probToOdds(p1HHigher)}</td></tr>
        <tr><td>2nd Half</td><td class="num-col">${probToOdds(p2HHigher)}</td></tr>
        <tr><td>Tie</td><td class="num-col">${probToOdds(pTied)}</td></tr>
    `;

    // --- HALFTIME/FULLTIME ---
    // Calculate probabilities for all HT/FT combinations
    // Basketball doesn't have draws, so we only have 4 combinations:
    // Home/Home, Home/Away, Away/Home, Away/Away
    const pHomeHT = pHome1HWins;
    const pAwayHT = 1 - pHome1HWins;
    
    // Conditional probabilities for FT given HT result
    // If Home leads at HT, they're more likely to win FT
    const pHomeFT_givenHomeHT = Math.min(0.95, homeWinProb + 0.15);
    const pAwayFT_givenHomeHT = 1 - pHomeFT_givenHomeHT;
    
    // If Away leads at HT, they're more likely to win FT
    const pAwayFT_givenAwayHT = Math.min(0.95, awayWinProb + 0.15);
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

    // --- WINNER & TOTAL (incl. OT) ---
    // Combine winner probabilities with total points over/under
    const totalLines = [roundedBaseTotal - 4, roundedBaseTotal - 2, roundedBaseTotal, roundedBaseTotal + 2, roundedBaseTotal + 4];
    let winnerTotalHtml = '';
    
    totalLines.forEach(line => {
        const probShift = (line - roundedBaseTotal) * 0.03;
        const pOverLine = Math.max(0.05, Math.min(0.95, pOver - probShift));
        const pUnderLine = 1 - pOverLine;
        
        // Winner & Total combinations
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

    // --- HANDICAP & TOTAL (incl. OT) ---
    // Combine handicap (spread) probabilities with total points
    const spreadLinesForCombo = [roundedBaseSpread - 2, roundedBaseSpread, roundedBaseSpread + 2];
    let handicapTotalHtml = '';
    
    spreadLinesForCombo.forEach(spreadLineCombo => {
        const spreadProbShift = (spreadLineCombo - roundedBaseSpread) * 0.035;
        const pHomeCoversSpread = Math.max(0.05, Math.min(0.95, fairSpreadH + spreadProbShift));
        const pAwayCoversSpread = 1 - pHomeCoversSpread;
        
        // For each spread line, combine with different total lines
        [roundedBaseTotal - 2, roundedBaseTotal, roundedBaseTotal + 2].forEach(totalLineCombo => {
            const totalProbShift = (totalLineCombo - roundedBaseTotal) * 0.03;
            const pOverTotal = Math.max(0.05, Math.min(0.95, pOver - totalProbShift));
            const pUnderTotal = 1 - pOverTotal;
            
            // Handicap & Total combinations
            const homeSpreadOver = pHomeCoversSpread * pOverTotal;
            const homeSpreadUnder = pHomeCoversSpread * pUnderTotal;
            const awaySpreadOver = pAwayCoversSpread * pOverTotal;
            const awaySpreadUnder = pAwayCoversSpread * pUnderTotal;
            
            const spreadLabel = spreadLineCombo > 0 ? `+${spreadLineCombo.toFixed(1)}` : spreadLineCombo.toFixed(1);
            
            handicapTotalHtml += `<tr><td>Home ${spreadLabel} & Over ${totalLineCombo.toFixed(1)}</td><td class="num-col prob-col">${(homeSpreadOver * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(homeSpreadOver)}</td></tr>`;
            handicapTotalHtml += `<tr><td>Home ${spreadLabel} & Under ${totalLineCombo.toFixed(1)}</td><td class="num-col prob-col">${(homeSpreadUnder * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(homeSpreadUnder)}</td></tr>`;
            handicapTotalHtml += `<tr><td>Away ${spreadLineCombo > 0 ? spreadLineCombo.toFixed(1) : `+${Math.abs(spreadLineCombo).toFixed(1)}`} & Over ${totalLineCombo.toFixed(1)}</td><td class="num-col prob-col">${(awaySpreadOver * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(awaySpreadOver)}</td></tr>`;
            handicapTotalHtml += `<tr><td>Away ${spreadLineCombo > 0 ? spreadLineCombo.toFixed(1) : `+${Math.abs(spreadLineCombo).toFixed(1)}`} & Under ${totalLineCombo.toFixed(1)}</td><td class="num-col prob-col">${(awaySpreadUnder * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(awaySpreadUnder)}</td></tr>`;
        });
    });
    document.getElementById('handicapTotalTable').innerHTML = handicapTotalHtml;
}

// Helper function to estimate margin probability bands
function estimateMarginProbs(homeWinProb, expectedMargin) {
    // Rough estimation based on normal distribution
    const probs = [];
    const stdDev = 12; // typical basketball game std

    // Home margins
    if (homeWinProb > 0) {
        probs.push({ label: 'Home 1-5', prob: homeWinProb * normalInRange(expectedMargin, stdDev, 1, 5) });
        probs.push({ label: 'Home 6-10', prob: homeWinProb * normalInRange(expectedMargin, stdDev, 6, 10) });
        probs.push({ label: 'Home 11-15', prob: homeWinProb * normalInRange(expectedMargin, stdDev, 11, 15) });
        probs.push({ label: 'Home 16+', prob: homeWinProb * normalInRange(expectedMargin, stdDev, 16, 50) });
    }

    // Away margins
    const awayWinProb = 1 - homeWinProb;
    if (awayWinProb > 0) {
        probs.push({ label: 'Away 1-5', prob: awayWinProb * normalInRange(-expectedMargin, stdDev, 1, 5) });
        probs.push({ label: 'Away 6-10', prob: awayWinProb * normalInRange(-expectedMargin, stdDev, 6, 10) });
        probs.push({ label: 'Away 11-15', prob: awayWinProb * normalInRange(-expectedMargin, stdDev, 11, 15) });
        probs.push({ label: 'Away 16+', prob: awayWinProb * normalInRange(-expectedMargin, stdDev, 16, 50) });
    }

    // Normalize
    const total = probs.reduce((sum, p) => sum + p.prob, 0);
    probs.forEach(p => p.prob = p.prob / total);

    return probs;
}

// Simple normal distribution range probability
function normalInRange(mean, std, low, high) {
    // Rough approximation using linear interpolation
    const midpoint = (low + high) / 2;
    const distance = Math.abs(midpoint - mean) / std;
    return Math.max(0.02, Math.exp(-0.5 * distance * distance) * (high - low) / (std * 2.5));
}

// Make global
window.runModel = runModel;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    // Set up API loader
    setRunModelCallback(runModel);
    initBasketballLoader();

    // Wire up dropdowns
    document.getElementById('apiCountrySelect').addEventListener('change', handleCountryChange);
    document.getElementById('apiLeagueSelect').addEventListener('change', handleLeagueChange);
    document.getElementById('apiMatchSelect').addEventListener('change', handleMatchChange);

    // Initial run
    runModel();
});
