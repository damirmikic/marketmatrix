// Football Markets Module
// Functions for populating market tables

import { probToOdds } from './core/math_utils.js';

// Populate half-time detailed markets
export function populateHalfDetailed(matrix, half) {
    // Populate BTTS for half
    let bttsYes = 0;
    for (let x = 1; x <= 20; x++) {
        for (let y = 1; y <= 20; y++) {
            bttsYes += matrix[x][y];
        }
    }
    let bttsNo = 1 - bttsYes;

    document.getElementById(`${half}BttsTable`).innerHTML = `
        <tr><td>BTTS - Yes</td><td class="num-col prob-col">${(bttsYes * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(bttsYes)}</td></tr>
        <tr><td>BTTS - No</td><td class="num-col prob-col">${(bttsNo * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(bttsNo)}</td></tr>
    `;

    // Populate DC for half
    const dc = get1X2Probs(matrix);
    document.getElementById(`${half}DcTable`).innerHTML = `
        <tr><td>1X</td><td class="num-col prob-col">${((dc.p1 + dc.pX) * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(dc.p1 + dc.pX)}</td></tr>
        <tr><td>12</td><td class="num-col prob-col">${((dc.p1 + dc.p2) * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(dc.p1 + dc.p2)}</td></tr>
        <tr><td>X2</td><td class="num-col prob-col">${((dc.pX + dc.p2) * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(dc.pX + dc.p2)}</td></tr>
    `;

    // Populate exact goals for half
    const exactGoals = calculateExactGoals(matrix);
    let exactHtml = '';
    exactGoals.forEach(eg => {
        exactHtml += `<tr><td>${eg.score}</td><td class="num-col prob-col">${(eg.prob * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(eg.prob)}</td></tr>`;
    });
    document.getElementById(`${half}ExactTable`).innerHTML = exactHtml;

    // Populate goal spreads for half
    const spreads = calculateGoalSpreads(matrix);
    let spreadHtml = '';
    spreads.forEach(s => {
        spreadHtml += `<tr><td>${s.line > 0 ? '+' : ''}${s.line}</td><td class="num-col prob-col">${(s.prob * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(s.prob)}</td></tr>`;
    });
    document.getElementById(`${half}SpreadTable`).innerHTML = spreadHtml;
}

// Populate team markets
export function populateTeamMarkets(matrixFT, matrixFH, matrixSH, isHome, teamPrefix) {
    // Team total goals FT
    const teamMatrix = isHome ? createHomeMatrix(matrixFT) : createAwayMatrix(matrixFT);
    const lines = [0.5, 1.5, 2.5, 3.5];
    let ftHtml = '';
    lines.forEach(line => {
        let pOver = 0;
        for (let g = 0; g <= 20; g++) {
            if (g > line) pOver += teamMatrix[g];
        }
        ftHtml += `<tr><td class="line-col">${line}</td><td class="num-col">${probToOdds(pOver)}</td><td class="num-col">${probToOdds(1 - pOver)}</td></tr>`;
    });
    document.getElementById(`${teamPrefix}FtTable`).innerHTML = ftHtml;

    // Team goals 1H
    const teamMatrix1H = isHome ? createHomeMatrix(matrixFH) : createAwayMatrix(matrixFH);
    let fhHtml = '';
    [0.5, 1.5, 2.5].forEach(line => {
        let pOver = 0;
        for (let g = 0; g <= 20; g++) {
            if (g > line) pOver += teamMatrix1H[g];
        }
        fhHtml += `<tr><td class="line-col">${line}</td><td class="num-col">${probToOdds(pOver)}</td><td class="num-col">${probToOdds(1 - pOver)}</td></tr>`;
    });
    document.getElementById(`${teamPrefix}1hTable`).innerHTML = fhHtml;

    // Team goals 2H
    const teamMatrix2H = isHome ? createHomeMatrix(matrixSH) : createAwayMatrix(matrixSH);
    let shHtml = '';
    [0.5, 1.5, 2.5].forEach(line => {
        let pOver = 0;
        for (let g = 0; g <= 20; g++) {
            if (g > line) pOver += teamMatrix2H[g];
        }
        shHtml += `<tr><td class="line-col">${line}</td><td class="num-col">${probToOdds(pOver)}</td><td class="num-col">${probToOdds(1 - pOver)}</td></tr>`;
    });
    document.getElementById(`${teamPrefix}2hTable`).innerHTML = shHtml;

    // Exact goals FT
    const exactGoals = calculateExactGoals(teamMatrix);
    let exactHtml = '';
    exactGoals.slice(0, 6).forEach(eg => {
        exactHtml += `<tr><td>${eg.score}</td><td class="num-col prob-col">${(eg.prob * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(eg.prob)}</td></tr>`;
    });
    document.getElementById(`${teamPrefix}ExactTable`).innerHTML = exactHtml;

    // Goal spreads FT
    const spreads = calculateGoalSpreads(teamMatrix);
    let spreadHtml = '';
    spreads.slice(0, 5).forEach(s => {
        spreadHtml += `<tr><td>${s.line > 0 ? '+' : ''}${s.line}</td><td class="num-col prob-col">${(s.prob * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(s.prob)}</td></tr>`;
    });
    document.getElementById(`${teamPrefix}SpreadTable`).innerHTML = spreadHtml;
}

// Calculate BTTS combinations
export function calculateBttsCombos(matrixFH, matrixSH) {
    const pFH_Both = calculateBttsProb(matrixFH);
    const pFH_None = 1 - pFH_Both;
    const pSH_Both = calculateBttsProb(matrixSH);
    const pSH_None = 1 - pSH_Both;

    const combos = [
        { label: "FH BTTS & SH BTTS", prob: pFH_Both * pSH_Both },
        { label: "FH BTTS & SH No BTTS", prob: pFH_Both * pSH_None },
        { label: "FH No BTTS & SH BTTS", prob: pFH_None * pSH_Both },
        { label: "FH No BTTS & SH No BTTS", prob: pFH_None * pSH_None }
    ];

    let html = '';
    combos.forEach(c => {
        html += `<tr><td>${c.label}</td><td class="num-col prob-col">${(c.prob * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(c.prob)}</td></tr>`;
    });
    return html;
}

// Calculate win combinations
export function calculateWinCombos(matrixFH, matrixSH, isHome) {
    const fh1x2 = get1X2Probs(matrixFH);
    const sh1x2 = get1X2Probs(matrixSH);

    const combos = [
        { label: "FH Win & SH Win", prob: (isHome ? fh1x2.p1 : fh1x2.p2) * (isHome ? sh1x2.p1 : sh1x2.p2) },
        { label: "FH Win & SH Draw", prob: (isHome ? fh1x2.p1 : fh1x2.p2) * sh1x2.pX },
        { label: "FH Win & SH Loss", prob: (isHome ? fh1x2.p1 : fh1x2.p2) * (isHome ? sh1x2.p2 : sh1x2.p1) },
        { label: "FH Draw & SH Win", prob: fh1x2.pX * (isHome ? sh1x2.p1 : sh1x2.p2) },
        { label: "FH Draw & SH Draw", prob: fh1x2.pX * sh1x2.pX },
        { label: "FH Draw & SH Loss", prob: fh1x2.pX * (isHome ? sh1x2.p2 : sh1x2.p1) },
        { label: "FH Loss & SH Win", prob: (isHome ? fh1x2.p2 : fh1x2.p1) * (isHome ? sh1x2.p1 : sh1x2.p2) },
        { label: "FH Loss & SH Draw", prob: (isHome ? fh1x2.p2 : fh1x2.p1) * sh1x2.pX },
        { label: "FH Loss & SH Loss", prob: (isHome ? fh1x2.p2 : fh1x2.p1) * (isHome ? sh1x2.p2 : sh1x2.p1) }
    ];

    let html = '';
    combos.forEach(c => {
        html += `<tr><td>${c.label}</td><td class="num-col prob-col">${(c.prob * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(c.prob)}</td></tr>`;
    });
    return html;
}

// Update win combos extra
export function updateWinCombosExtra(matrixFH, matrixSH, isHome) {
    // Additional win combos if needed
    return '';
}

// Calculate joint combos
export function calculateJointCombos(matrixFH, matrixSH, type) {
    if (type === 'draw') {
        const fh1x2 = get1X2Probs(matrixFH);
        const sh1x2 = get1X2Probs(matrixSH);

        const combos = [
            { label: "FH Draw & SH Draw", prob: fh1x2.pX * sh1x2.pX },
            { label: "FH Draw & SH No Draw", prob: fh1x2.pX * (1 - sh1x2.pX) },
            { label: "FH No Draw & SH Draw", prob: (1 - fh1x2.pX) * sh1x2.pX },
            { label: "FH No Draw & SH No Draw", prob: (1 - fh1x2.pX) * (1 - sh1x2.pX) }
        ];

        let html = '';
        combos.forEach(c => {
            html += `<tr><td>${c.label}</td><td class="num-col prob-col">${(c.prob * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(c.prob)}</td></tr>`;
        });
        return html;
    }

    if (type === 'dc') {
        const fh1x2 = get1X2Probs(matrixFH);
        const sh1x2 = get1X2Probs(matrixSH);

        const combos = [
            { label: "FH 1X & SH 1X", prob: (fh1x2.p1 + fh1x2.pX) * (sh1x2.p1 + sh1x2.pX) },
            { label: "FH 1X & SH 12", prob: (fh1x2.p1 + fh1x2.pX) * (sh1x2.p1 + sh1x2.p2) },
            { label: "FH 1X & SH X2", prob: (fh1x2.p1 + fh1x2.pX) * (sh1x2.pX + sh1x2.p2) },
            { label: "FH 12 & SH 1X", prob: (fh1x2.p1 + fh1x2.p2) * (sh1x2.p1 + sh1x2.pX) },
            { label: "FH 12 & SH 12", prob: (fh1x2.p1 + fh1x2.p2) * (sh1x2.p1 + sh1x2.p2) },
            { label: "FH 12 & SH X2", prob: (fh1x2.p1 + fh1x2.p2) * (sh1x2.pX + sh1x2.p2) },
            { label: "FH X2 & SH 1X", prob: (fh1x2.pX + fh1x2.p2) * (sh1x2.p1 + sh1x2.pX) },
            { label: "FH X2 & SH 12", prob: (fh1x2.pX + fh1x2.p2) * (sh1x2.p1 + sh1x2.p2) },
            { label: "FH X2 & SH X2", prob: (fh1x2.pX + fh1x2.p2) * (sh1x2.pX + sh1x2.p2) }
        ];

        let html = '';
        combos.forEach(c => {
            html += `<tr><td>${c.label}</td><td class="num-col prob-col">${(c.prob * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(c.prob)}</td></tr>`;
        });
        return html;
    }

    if (type === 'htft') {
        // HT/FT combos - simplified
        const fh1x2 = get1X2Probs(matrixFH);
        const sh1x2 = get1X2Probs(matrixSH);

        const combos = [
            { label: "H/H", prob: fh1x2.p1 * sh1x2.p1 },
            { label: "H/D", prob: fh1x2.p1 * sh1x2.pX },
            { label: "H/A", prob: fh1x2.p1 * sh1x2.p2 },
            { label: "D/H", prob: fh1x2.pX * sh1x2.p1 },
            { label: "D/D", prob: fh1x2.pX * sh1x2.pX },
            { label: "D/A", prob: fh1x2.pX * sh1x2.p2 },
            { label: "A/H", prob: fh1x2.p2 * sh1x2.p1 },
            { label: "A/D", prob: fh1x2.p2 * sh1x2.pX },
            { label: "A/A", prob: fh1x2.p2 * sh1x2.p2 }
        ];

        let html = '';
        combos.forEach(c => {
            html += `<tr><td>${c.label}</td><td class="num-col prob-col">${(c.prob * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(c.prob)}</td></tr>`;
        });
        return html;
    }

    return '';
}

// Calculate FTS combos
export function calculateFtsCombos(lambda, mu, lambda1, mu1, lambda2, mu2, matrixFT, matrixFH, matrixSH) {
    // First team to score combinations - simplified
    const combos = [
        { label: "Home 1H", prob: 0.3 },
        { label: "Away 1H", prob: 0.3 },
        { label: "Home 2H", prob: 0.2 },
        { label: "Away 2H", prob: 0.2 }
    ];

    let html = '';
    combos.forEach(c => {
        html += `<tr><td>${c.label}</td><td class="num-col prob-col">${(c.prob * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(c.prob)}</td></tr>`;
    });
    return html;
}

// Calculate team goal combos
export function calculateTeamGoalCombos(matrixFH, matrixSH, isHome) {
    // Team goal combinations - simplified
    const combos = [
        { label: "0 FH & 0 SH", prob: 0.1 },
        { label: "0 FH & 1+ SH", prob: 0.2 },
        { label: "1+ FH & 0 SH", prob: 0.2 },
        { label: "1+ FH & 1+ SH", prob: 0.5 }
    ];

    let html = '';
    combos.forEach(c => {
        html += `<tr><td>${c.label}</td><td class="num-col prob-col">${(c.prob * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(c.prob)}</td></tr>`;
    });
    return html;
}

// Get 1X2 probabilities from matrix
export function get1X2Probs(matrix) {
    let p1 = 0, pX = 0, p2 = 0;
    for (let h = 0; h <= 20; h++) {
        for (let a = 0; a <= 20; a++) {
            if (h > a) p1 += matrix[h][a];
            else if (h === a) pX += matrix[h][a];
            else p2 += matrix[h][a];
        }
    }
    return { p1, pX, p2 };
}

// Helper functions
function calculateBttsProb(matrix) {
    let btts = 0;
    for (let h = 1; h <= 20; h++) {
        for (let a = 1; a <= 20; a++) {
            btts += matrix[h][a];
        }
    }
    return btts;
}

function calculateExactGoals(matrix) {
    const exact = [];
    for (let g = 0; g <= 5; g++) {
        let prob = 0;
        for (let h = 0; h <= 20; h++) {
            for (let a = 0; a <= 20; a++) {
                if (h + a === g) prob += matrix[h][a];
            }
        }
        exact.push({ score: g, prob });
    }
    return exact;
}

function calculateGoalSpreads(matrix) {
    const spreads = [];
    for (let line = -3; line <= 3; line++) {
        let prob = 0;
        for (let h = 0; h <= 20; h++) {
            for (let a = 0; a <= 20; a++) {
                if (h - a > line) prob += matrix[h][a];
            }
        }
        spreads.push({ line, prob });
    }
    return spreads;
}

function createHomeMatrix(matrix) {
    const home = new Array(21).fill(0);
    for (let h = 0; h <= 20; h++) {
        for (let a = 0; a <= 20; a++) {
            home[h] += matrix[h][a];
        }
    }
    return home;
}

function createAwayMatrix(matrix) {
    const away = new Array(21).fill(0);
    for (let h = 0; h <= 20; h++) {
        for (let a = 0; a <= 20; a++) {
            away[a] += matrix[h][a];
        }
    }
    return away;
}