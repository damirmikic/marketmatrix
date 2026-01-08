import { solveShin, probToOdds } from './js/core/math_utils.js';
import { solveParameters, calculateMatrix } from './js/math.js';

import {
    populateHalfDetailed,
    populateTeamMarkets,
    calculateBttsCombos,
    calculateWinCombos,
    updateWinCombosExtra,
    calculateJointCombos,
    calculateFtsCombos,
    calculateTeamGoalCombos,
    get1X2Probs
} from './js/markets.js';

import {
    initApiLoader,
    handleCountryChange,
    handleLeagueChange,
    loadEventDetails,
    setRunModelCallback
} from './js/api.js';

import { updateBuilderMatrices } from './js/bet_builder.js';

// --- UI Helpers ---
function toggleCard(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('collapsed');
}

function toggleAllCards() {
    const btn = document.getElementById('toggleAllBtn');
    const cards = document.querySelectorAll('.card:not(.hidden)');
    const isCollapsing = btn.textContent.includes('Collapse');

    cards.forEach(card => {
        if (isCollapsing) {
            card.classList.add('collapsed');
        } else {
            card.classList.remove('collapsed');
        }
    });

    btn.textContent = isCollapsing ? "Expand All" : "Collapse All";
}

// Make globally available for HTML onclick attributes
window.toggleCard = toggleCard;
window.toggleAllCards = toggleAllCards;

// --- Main Controller ---
function runModel() {
    // Get Inputs
    const h = parseFloat(document.getElementById('homeOdds').value);
    const d = parseFloat(document.getElementById('drawOdds').value);
    const a = parseFloat(document.getElementById('awayOdds').value);
    const line = parseFloat(document.getElementById('goalLine').value);
    const o = parseFloat(document.getElementById('overOdds').value);
    const u = parseFloat(document.getElementById('underOdds').value);

    // Basic validation
    if ([h, d, a, line, o, u].some(isNaN)) return;

    // Update Labels
    document.getElementById('overLabel').textContent = `Over ${line} Odds`;
    document.getElementById('underLabel').textContent = `Under ${line} Odds`;

    // Margin Calculation (1x2)
    const margin = ((1 / h + 1 / d + 1 / a) - 1) * 100;
    const marginEl = document.getElementById('oneWtMargin');
    if (marginEl) {
        marginEl.textContent = `Margin: ${margin.toFixed(2)}%`;
        // Optional: color coding
        marginEl.style.color = margin < 5 ? '#4ade80' : (margin < 8 ? '#facc15' : '#f87171');
    }

    // Margin Calculation (Goals)
    const marginGoals = ((1 / o + 1 / u) - 1) * 100;
    const marginGoalsEl = document.getElementById('goalsMargin');
    if (marginGoalsEl) {
        marginGoalsEl.textContent = `Margin: ${marginGoals.toFixed(2)}%`;
        marginGoalsEl.style.color = marginGoals < 5 ? '#4ade80' : (marginGoals < 8 ? '#facc15' : '#f87171');
    }

    // 1. Get True Probabilities (Shin Method)
    const true1x2 = solveShin([h, d, a]);
    const trueOU = solveShin([o, u]);

    // Display Shin 1x2 Probs
    document.getElementById('shinHome').textContent = (true1x2[0] * 100).toFixed(1) + "%";
    document.getElementById('shinDraw').textContent = (true1x2[1] * 100).toFixed(1) + "%";
    document.getElementById('shinAway').textContent = (true1x2[2] * 100).toFixed(1) + "%";

    // Display Fair Odds
    document.getElementById('fairOddsHome').textContent = (1 / true1x2[0]).toFixed(2);
    document.getElementById('fairOddsDraw').textContent = (1 / true1x2[1]).toFixed(2);
    document.getElementById('fairOddsAway').textContent = (1 / true1x2[2]).toFixed(2);

    const targetHome = true1x2[0];
    const targetDraw = true1x2[1]; // Get Target Draw Prob
    const targetOver = trueOU[0];

    // 2. Solve for xG (and Omega)
    const params = solveParameters(targetHome, targetOver, line, targetDraw);

    // Display Parameters
    document.getElementById('xgHome').textContent = params.lambda.toFixed(3);
    document.getElementById('xgAway').textContent = params.mu.toFixed(3);
    document.getElementById('zipOmega').textContent = params.omega.toFixed(2);

    // Show all hidden areas
    [
        'ftArea', 'fhArea', 'shArea', 'homeTeamArea', 'awayTeamArea',
        'goalComboArea', 'drawComboArea', 'dcComboArea', 'htftComboArea',
        'homeGoalComboArea', 'awayGoalComboArea', 'bttsComboArea', 'ftsComboArea', 'ahArea'
    ].forEach(id => document.getElementById(id).classList.remove('hidden'));

    // 3. Generate Matrices (Pass Omega)
    // Read half ratios from input (default 45/55 if unavailable)
    const ratio1HEl = document.getElementById('ratio1H');
    const ratio2HEl = document.getElementById('ratio2H');
    const ratio1H = ratio1HEl ? parseFloat(ratio1HEl.value) / 100 : 0.45;
    const ratio2H = ratio2HEl ? parseFloat(ratio2HEl.value) / 100 : 0.55;

    const matrixFT = calculateMatrix(params.lambda, params.mu, params.omega);
    const matrixFH = calculateMatrix(params.lambda * ratio1H, params.mu * ratio1H, params.omega * ratio1H);
    // ZIP usually applies to the *event* count. Zero goals in half is different.
    // Standard ZIP for half-time is complex. 
    // HEURISTIC: We will scale Omega linearly with time for simplicity or keep it constant?
    // Let's keep it simple: The "Zero Bonus" is a property of the match defensiveness.
    // However, P(0) in half is naturally Check.
    // Let's use scaled Lambda/Mu but keep Omega constant (or scaled down?).
    // A smaller time interval naturally has more zeros. A fixed additive zero-prob might be too strong for a half.
    // Let's scale Omega by half ratio for halves as a reasonable heuristic for now.
    const matrixSH = calculateMatrix(params.lambda * ratio2H, params.mu * ratio2H, params.omega * ratio2H);

    // --- MARKET GENERATION ---

    // Total Goals Table (FT)
    const lines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5];
    let tgHtml = "";
    lines.forEach(line => {
        let pOver = 0;
        for (let x = 0; x <= 20; x++) {
            for (let y = 0; y <= 20; y++) {
                if (x + y > line) pOver += matrixFT[x][y];
            }
        }
        tgHtml += `<tr>
            <td class="line-col">${line}</td>
            <td class="num-col">${probToOdds(pOver)}</td>
            <td class="num-col">${probToOdds(1 - pOver)}</td>
        </tr>`;
    });
    document.getElementById('totalGoalsTable').innerHTML = tgHtml;

    // BTTS Market (FT)
    let bttsYes = 0;
    for (let x = 1; x <= 20; x++) {
        for (let y = 1; y <= 20; y++) {
            bttsYes += matrixFT[x][y];
        }
    }
    let bttsNo = 1 - bttsYes;

    document.getElementById('bttsTable').innerHTML = `
        <tr><td>BTTS - Yes</td><td class="num-col prob-col">${(bttsYes * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(bttsYes)}</td></tr>
        <tr><td>BTTS - No</td><td class="num-col prob-col">${(bttsNo * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(bttsNo)}</td></tr>
    `;

    // Total Goals Range (FT)
    const totalSpreads = [
        [1, 2], [1, 3], [1, 4], [1, 5], [2, 3], [2, 4], [2, 5],
        [3, 4], [3, 5], [4, 5], [4, 6], [5, 6], [2, 6], [3, 6]
    ];
    let tsHtml = "";
    totalSpreads.forEach(s => {
        let ps = 0;
        for (let x = 0; x <= 20; x++) {
            for (let y = 0; y <= 20; y++) {
                let total = x + y;
                if (total >= s[0] && total <= s[1]) ps += matrixFT[x][y];
            }
        }
        tsHtml += `<tr><td>${s[0]}-${s[1]} Goals</td><td class="num-col prob-col">${(ps * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(ps)}</td></tr>`;
    });
    document.getElementById('totalSpreadTable').innerHTML = tsHtml;

    // Result & Totals (Combo 2.5)
    let comboProbs = {
        "H & Over": 0, "H & Under": 0,
        "D & Over": 0, "D & Under": 0,
        "A & Over": 0, "A & Under": 0
    };

    for (let x = 0; x <= 20; x++) {
        for (let y = 0; y <= 20; y++) {
            let p = matrixFT[x][y];
            let total = x + y;
            if (x > y) {
                if (total > 2.5) comboProbs["H & Over"] += p;
                else comboProbs["H & Under"] += p;
            } else if (x === y) {
                if (total > 2.5) comboProbs["D & Over"] += p;
                else comboProbs["D & Under"] += p;
            } else {
                if (total > 2.5) comboProbs["A & Over"] += p;
                else comboProbs["A & Under"] += p;
            }
        }
    }

    let comboHtml = "";
    Object.keys(comboProbs).forEach(key => {
        let p = comboProbs[key];
        comboHtml += `<tr><td>${key} 2.5</td><td class="num-col prob-col">${(p * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(p)}</td></tr>`;
    });
    document.getElementById('comboTable').innerHTML = comboHtml;

    // Half Goals (Common Logic)
    const fhLines = [0.5, 1.5, 2.5, 3.5];
    function getHalfGoalsHtml(m) {
        let html = "";
        fhLines.forEach(line => {
            let pOver = 0;
            for (let x = 0; x <= 20; x++) {
                for (let y = 0; y <= 20; y++) {
                    if (x + y > line) pOver += m[x][y];
                }
            }
            html += `<tr>
                <td class="line-col">${line}</td>
                <td class="num-col">${probToOdds(pOver)}</td>
                <td class="num-col">${probToOdds(1 - pOver)}</td>
            </tr>`;
        });
        return html;
    }
    document.getElementById('fhGoalsTable').innerHTML = getHalfGoalsHtml(matrixFH);
    document.getElementById('shGoalsTable').innerHTML = getHalfGoalsHtml(matrixSH);

    // FT 1X2 & DC Tables
    const ft1x2 = get1X2Probs(matrixFT);
    document.getElementById('ftDcTable').innerHTML = `
        <tr><td>1X</td><td class="num-col prob-col">${((ft1x2.p1 + ft1x2.pX) * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(ft1x2.p1 + ft1x2.pX)}</td></tr>
        <tr><td>12</td><td class="num-col prob-col">${((ft1x2.p1 + ft1x2.p2) * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(ft1x2.p1 + ft1x2.p2)}</td></tr>
        <tr><td>X2</td><td class="num-col prob-col">${((ft1x2.pX + ft1x2.p2) * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(ft1x2.pX + ft1x2.p2)}</td></tr>
    `;

    // Draw No Bet
    const pDnbHome = ft1x2.p1 / (ft1x2.p1 + ft1x2.p2);
    const pDnbAway = ft1x2.p2 / (ft1x2.p1 + ft1x2.p2);
    document.getElementById('ftDnbTable').innerHTML = `
        <tr><td>Home</td><td class="num-col prob-col">${(pDnbHome * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(pDnbHome)}</td></tr>
        <tr><td>Away</td><td class="num-col prob-col">${(pDnbAway * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(pDnbAway)}</td></tr>
    `;

    // Asian Handicap
    function getAhProb(line, matrix) {
        let pHome = 0, pPush = 0, pAway = 0;
        for (let x = 0; x <= 20; x++) {
            for (let y = 0; y <= 20; y++) {
                let p = matrix[x][y];
                if (x + line > y) pHome += p;
                else if (Math.abs((x + line) - y) < 0.01) pPush += p;
                else pAway += p;
            }
        }
        const adjPHome = (pHome + pAway > 0) ? (pHome / (pHome + pAway)) : 0;
        const adjPAway = (pHome + pAway > 0) ? (pAway / (pHome + pAway)) : 0;
        return { h: adjPHome, a: adjPAway };
    }

    const ahSpreads = [0, -0.5, 0.5, -1, 1, -1.5, 1.5, -2, 2, -2.5, 2.5];
    let ahHtml = "";
    ahSpreads.forEach(L => {
        const probs = getAhProb(L, matrixFT);
        const lineStr = L > 0 ? `+${L}` : L;
        ahHtml += `<tr>
            <td>AH ${lineStr}</td>
            <td class="num-col">${probToOdds(probs.h)}</td>
            <td class="num-col">${probToOdds(probs.a)}</td>
        </tr>`;
    });
    document.getElementById('ahTable').innerHTML = ahHtml;

    // Half 1X2s
    const fh1x2 = get1X2Probs(matrixFH);
    const sh1x2 = get1X2Probs(matrixSH);

    document.getElementById('fh1x2Table').innerHTML = `
        <tr><td>1H Home</td><td class="num-col prob-col">${(fh1x2.p1 * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(fh1x2.p1)}</td></tr>
        <tr><td>1H Draw</td><td class="num-col prob-col">${(fh1x2.pX * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(fh1x2.pX)}</td></tr>
        <tr><td>1H Away</td><td class="num-col prob-col">${(fh1x2.p2 * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(fh1x2.p2)}</td></tr>
    `;

    // 1H Draw No Bet
    const pDnbHome1H = fh1x2.p1 / (fh1x2.p1 + fh1x2.p2);
    const pDnbAway1H = fh1x2.p2 / (fh1x2.p1 + fh1x2.p2);
    document.getElementById('fhDnbTable').innerHTML = `
        <tr><td>1H Home</td><td class="num-col prob-col">${(pDnbHome1H * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(pDnbHome1H)}</td></tr>
        <tr><td>1H Away</td><td class="num-col prob-col">${(pDnbAway1H * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(pDnbAway1H)}</td></tr>
    `;

    document.getElementById('sh1x2Table').innerHTML = `
        <tr><td>2H Home</td><td class="num-col prob-col">${(sh1x2.p1 * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(sh1x2.p1)}</td></tr>
        <tr><td>2H Draw</td><td class="num-col prob-col">${(sh1x2.pX * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(sh1x2.pX)}</td></tr>
        <tr><td>2H Away</td><td class="num-col prob-col">${(sh1x2.p2 * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(sh1x2.p2)}</td></tr>
    `;

    // 2H Draw No Bet
    const pDnbHome2H = sh1x2.p1 / (sh1x2.p1 + sh1x2.p2);
    const pDnbAway2H = sh1x2.p2 / (sh1x2.p1 + sh1x2.p2);
    document.getElementById('shDnbTable').innerHTML = `
        <tr><td>2H Home</td><td class="num-col prob-col">${(pDnbHome2H * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(pDnbHome2H)}</td></tr>
        <tr><td>2H Away</td><td class="num-col prob-col">${(pDnbAway2H * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(pDnbAway2H)}</td></tr>
    `;

    // Detailed Markets (Delegated to markets.js)
    populateHalfDetailed(matrixFH, "fh");
    populateHalfDetailed(matrixSH, "sh");

    populateTeamMarkets(matrixFT, matrixFH, matrixSH, true, "home");
    populateTeamMarkets(matrixFT, matrixFH, matrixSH, false, "away");

    // HT/FT
    function getOutcome(h, a) {
        if (h > a) return "1";
        if (h === a) return "X";
        return "2";
    }

    let htftProbs = { "11": 0, "1X": 0, "12": 0, "X1": 0, "XX": 0, "X2": 0, "21": 0, "2X": 0, "22": 0 };
    for (let h1 = 0; h1 <= 7; h1++) { // Optimize nesting limit, 7 is usually safe for HT
        for (let a1 = 0; a1 <= 7; a1++) {
            let p1 = matrixFH[h1][a1];
            let outcome1 = getOutcome(h1, a1);
            for (let h2 = 0; h2 <= 7; h2++) {
                for (let a2 = 0; a2 <= 7; a2++) {
                    let p2 = matrixSH[h2][a2];
                    let outcome2 = getOutcome(h1 + h2, a1 + a2);
                    htftProbs[outcome1 + outcome2] += (p1 * p2);
                }
            }
        }
    }
    let htftHtml = "";
    Object.keys(htftProbs).forEach(key => {
        let label = key[0] + "/" + key[1];
        let p = htftProbs[key];
        htftHtml += `<tr><td>${label}</td><td class="num-col prob-col">${(p * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(p)}</td></tr>`;
    });
    document.getElementById('htftTable').innerHTML = htftHtml;

    // Interval Combos (Hard to completely separate due to specific logic, but delegated what we could)
    // Re-implementing specific Interval Combos here or moving entire block?
    // The original file had a massive block for "Interval Combos". 
    // I will use a helper from markets.js or simply keep the logic here if it's too tailored.
    // For now, I'll calculate it here to ensure identical functionality, leveraging math helpers.

    function getRangeProb(matrix, min, max) {
        let p = 0;
        for (let x = 0; x <= 20; x++) {
            for (let y = 0; y <= 20; y++) {
                let tot = x + y;
                if (tot >= min && tot <= max) p += matrix[x][y];
            }
        }
        return p;
    }

    // ... (Variables pI_0_1, etc.)
    const pI_0_1 = getRangeProb(matrixFH, 0, 1);
    const pI_0_2 = getRangeProb(matrixFH, 0, 2);
    const pI_1plus = getRangeProb(matrixFH, 1, 100);
    const pI_1_2 = getRangeProb(matrixFH, 1, 2);
    const pI_1_3 = getRangeProb(matrixFH, 1, 3);
    const pI_2plus = getRangeProb(matrixFH, 2, 100);
    const pI_2_3 = getRangeProb(matrixFH, 2, 3);

    const pII_0_1 = getRangeProb(matrixSH, 0, 1);
    const pII_0_2 = getRangeProb(matrixSH, 0, 2);
    const pII_0_3 = getRangeProb(matrixSH, 0, 3);
    const pII_1plus = getRangeProb(matrixSH, 1, 100);
    const pII_1_2 = getRangeProb(matrixSH, 1, 2);
    const pII_1_3 = getRangeProb(matrixSH, 1, 3);
    const pII_2plus = getRangeProb(matrixSH, 2, 100);
    const pII_2_3 = getRangeProb(matrixSH, 2, 3);

    function getMixedRangeCombo(min1H, max1H, minTotal, maxTotal) {
        let prob = 0;
        for (let h1 = 0; h1 <= 7; h1++) {
            for (let a1 = 0; a1 <= 7; a1++) {
                let p1 = matrixFH[h1][a1];
                let tot1 = h1 + a1;
                if (tot1 >= min1H && tot1 <= max1H) {
                    for (let h2 = 0; h2 <= 7; h2++) {
                        for (let a2 = 0; a2 <= 7; a2++) {
                            let p2 = matrixSH[h2][a2];
                            let totFT = tot1 + h2 + a2;
                            if (totFT >= minTotal && totFT <= maxTotal) {
                                prob += (p1 * p2);
                            }
                        }
                    }
                }
            }
        }
        return prob;
    }

    const intervalCombos = [
        { label: "0-1 I & 1+ II", p: pI_0_1 * pII_1plus },
        { label: "0-1 I & 1-2 II", p: pI_0_1 * pII_1_2 },
        { label: "0-1 I & 1-3 II", p: pI_0_1 * pII_1_3 },
        { label: "0-2 I & 1-2 II", p: pI_0_2 * pII_1_2 },
        { label: "0-2 I & 1-3 II", p: pI_0_2 * pII_1_3 },
        { label: "0-2 I & 2+ II", p: pI_0_2 * pII_2plus },
        { label: "0-2 I & 2-3 II", p: pI_0_2 * pII_2_3 },
        { label: "1+ I & 0-1 II", p: pI_1plus * pII_0_1 },
        { label: "1+ I & 0-2 II", p: pI_1plus * pII_0_2 },
        { label: "1+ I & 1-2 II", p: pI_1plus * pII_1_2 },
        { label: "1+ I & 1-3 II", p: pI_1plus * pII_1_3 },
        { label: "1+ I & 2-3 II", p: pI_1plus * pII_2_3 },
        { label: "1-2 I & 0-1 II", p: pI_1_2 * pII_0_1 },
        { label: "1-2 I & 0-2 II", p: pI_1_2 * pII_0_2 },
        { label: "1-2 I & 0-3 II", p: pI_1_2 * pII_0_3 },
        { label: "1-2 I & 1+ II", p: pI_1_2 * pII_1plus },
        { label: "1-2 I & 1-3 II", p: pI_1_2 * pII_1_3 },
        { label: "1-2 I & 2+ II", p: pI_1_2 * pII_2plus },
        { label: "1-2 I & 2-3 II", p: pI_1_2 * pII_2_3 },
        { label: "1-3 I & 1+ II", p: pI_1_3 * pII_1plus },
        { label: "1-3 I & 1-2 II", p: pI_1_3 * pII_1_2 },
        { label: "1-3 I & 1-3 II", p: pI_1_3 * pII_1_3 },
        { label: "1-3 I & 2+ II", p: pI_1_3 * pII_2plus },
        { label: "1-2 I & 1-2 II", p: pI_1_2 * pII_1_2 },
        { label: "2+ I & 2-3 II", p: pI_2plus * pII_2_3 },
        { label: "2-3 I & 0-1 II", p: pI_2_3 * pII_0_1 },
        { label: "2-3 I & 0-2 II", p: pI_2_3 * pII_0_2 },
        { label: "2-3 I & 1+ II", p: pI_2_3 * pII_1plus },
        { label: "2-3 I & 1-2 II", p: pI_2_3 * pII_1_2 },
        { label: "2-3 I & 1-3 II", p: pI_2_3 * pII_1_3 },
        { label: "2-3 I & 2+ II", p: pI_2_3 * pII_2plus },
        { label: "2-3 I & 2-3 II", p: pI_2_3 * pII_2_3 },
        { label: "2+ I & 0-1 II", p: pI_2plus * pII_0_1 },
        { label: "0-1 I & 2+ II", p: pI_0_1 * pII_2plus },
        { label: "0-1 I & 2-3 II", p: pI_0_1 * pII_2_3 },
        { label: "1-3 I & Total 3+", p: getMixedRangeCombo(1, 3, 3, 100) },
        { label: "1-2 I & Total 3+", p: getMixedRangeCombo(1, 2, 3, 100) },
        { label: "1-2 I & Total 4+", p: getMixedRangeCombo(1, 2, 4, 100) },
        { label: "2-3 I & Total 4+", p: getMixedRangeCombo(2, 3, 4, 100) },
        { label: "0-1 I & 0-1 II", p: pI_0_1 * pII_0_1 },
        { label: "0-1 I & 0-2 II", p: pI_0_1 * pII_0_2 },
        { label: "0-1 I & 0-3 II", p: pI_0_1 * pII_0_3 },
        { label: "0-2 I & 0-1 II", p: pI_0_2 * pII_0_1 }
    ];

    let icHtml = "";
    intervalCombos.forEach(c => {
        icHtml += `<tr><td>${c.label}</td><td class="num-col prob-col">${(c.p * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(c.p)}</td></tr>`;
    });
    document.getElementById('intervalComboTable').innerHTML = icHtml;

    // BTTS Combos
    document.getElementById('bttsComboTable').innerHTML = calculateBttsCombos(matrixFH, matrixSH);

    // Win Combos
    document.getElementById('homeWinComboTable').innerHTML = calculateWinCombos(matrixFH, matrixSH, true);
    document.getElementById('awayWinComboTable').innerHTML = calculateWinCombos(matrixFH, matrixSH, false);

    // Add extra Win combos
    document.getElementById('homeWinComboTable').innerHTML += updateWinCombosExtra(matrixFH, matrixSH, true);
    document.getElementById('awayWinComboTable').innerHTML += updateWinCombosExtra(matrixFH, matrixSH, false);

    // Goal Combos (Home/Away)
    document.getElementById('homeGoalComboTable').innerHTML = calculateTeamGoalCombos(matrixFH, matrixSH, true);
    document.getElementById('awayGoalComboTable').innerHTML = calculateTeamGoalCombos(matrixFH, matrixSH, false);

    // FTS Combos
    document.getElementById('ftsComboTable').innerHTML = calculateFtsCombos(
        params.lambda, params.mu,
        params.lambda * 0.45, params.mu * 0.45,
        params.lambda * 0.55, params.mu * 0.55,
        matrixFT, matrixFH, matrixSH
    );

    // Multi-calc tables
    document.getElementById('drawComboTable').innerHTML = calculateJointCombos(matrixFH, matrixSH, 'draw');
    document.getElementById('dcComboTable').innerHTML = calculateJointCombos(matrixFH, matrixSH, 'dc');
    document.getElementById('htftComboTable').innerHTML = calculateJointCombos(matrixFH, matrixSH, 'htft');

    // Update Bet Builder
    updateBuilderMatrices(matrixFH, matrixSH);
}

// Make global
window.runModel = runModel;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Inject API Styles
    const style = document.createElement('style');
    style.textContent = `
        .api-match-item:hover { background-color: #f1f5f9 !important; }
        .api-match-item:active { background-color: #e2e8f0 !important; }
    `;
    document.head.appendChild(style);

    const cSelect = document.getElementById('apiCountrySelect');
    const lSelect = document.getElementById('apiLeagueSelect');
    const mSelect = document.getElementById('apiMatchSelect');

    if (cSelect) cSelect.addEventListener('change', handleCountryChange);
    if (lSelect) lSelect.addEventListener('change', handleLeagueChange);
    if (mSelect) mSelect.addEventListener('change', () => {
        if (mSelect.value) loadEventDetails(mSelect.value);
    });

    // Provide the runModel callback to the API module
    setRunModelCallback(runModel);

    // Start
    initApiLoader();
    runModel();
});
