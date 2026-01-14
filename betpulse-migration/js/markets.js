import { probToOdds, zipPoisson } from './math.js';

export function get1X2Probs(matrix) {
    let p1 = 0, pX = 0, p2 = 0;
    for (let x = 0; x <= 20; x++) {
        for (let y = 0; y <= 20; y++) {
            if (x > y) p1 += matrix[x][y];
            else if (x === y) pX += matrix[x][y];
            else p2 += matrix[x][y];
        }
    }
    return { p1, pX, p2 };
}

export function populateHalfDetailed(matrix, prefix) {
    // BTTS
    let bttsYes = 0;
    for (let x = 1; x <= 20; x++) {
        for (let y = 1; y <= 20; y++) {
            bttsYes += matrix[x][y];
        }
    }
    let bttsNo = 1 - bttsYes;
    const bttsEl = document.getElementById(`${prefix}BttsTable`);
    if (bttsEl) {
        bttsEl.innerHTML = `
            <tr><td>Yes</td><td class="num-col">${probToOdds(bttsYes)}</td></tr>
            <tr><td>No</td><td class="num-col">${probToOdds(bttsNo)}</td></tr>
        `;
    }

    // Double Chance
    const probs = get1X2Probs(matrix);
    const dcEl = document.getElementById(`${prefix}DcTable`);
    if (dcEl) {
        dcEl.innerHTML = `
            <tr><td>1X</td><td class="num-col">${probToOdds(probs.p1 + probs.pX)}</td></tr>
            <tr><td>12</td><td class="num-col">${probToOdds(probs.p1 + probs.p2)}</td></tr>
            <tr><td>X2</td><td class="num-col">${probToOdds(probs.pX + probs.p2)}</td></tr>
        `;
    }

    // Exact Goals
    let exactHtml = "";
    for (let k = 0; k <= 4; k++) {
        let pk = 0;
        for (let x = 0; x <= k; x++) pk += matrix[x][k - x];
        exactHtml += `<tr><td>${k} Goals</td><td class="num-col">${probToOdds(pk)}</td></tr>`;
    }
    let p5plus = 1;
    for (let k = 0; k <= 4; k++) {
        for (let x = 0; x <= k; x++) p5plus -= matrix[x][k - x];
    }
    exactHtml += `<tr><td>5+ Goals</td><td class="num-col">${probToOdds(p5plus)}</td></tr>`;
    const exactEl = document.getElementById(`${prefix}ExactTable`);
    if (exactEl) exactEl.innerHTML = exactHtml;

    // Spreads
    const spreads = [[1, 2], [1, 3], [2, 3], [2, 4]];
    let spreadHtml = "";
    spreads.forEach(s => {
        let ps = 0;
        for (let goals = s[0]; goals <= s[1]; goals++) {
            for (let x = 0; x <= goals; x++) {
                if (matrix[x] && matrix[x][goals - x]) ps += matrix[x][goals - x];
            }
        }
        spreadHtml += `<tr><td>${s[0]}-${s[1]} Goals</td><td class="num-col">${probToOdds(ps)}</td></tr>`;
    });
    const spreadEl = document.getElementById(`${prefix}SpreadTable`);
    if (spreadEl) spreadEl.innerHTML = spreadHtml;
}

export function populateTeamMarkets(matrixFT, matrixFH, matrixSH, isHome, prefix) {
    function getMarginal(matrix, target) {
        let p = 0;
        // matrix size is 21 (0..20)
        for (let i = 0; i <= 20; i++) {
            if (isHome) {
                // Sum row i: P(Home = i)
                for (let j = 0; j <= 20; j++) p += matrix[i][j];
            } else {
                // Sum col i: P(Away = i)
                for (let j = 0; j <= 20; j++) p += matrix[j][i];
            }
            if (i === target) return p;
        }
        return 0; // Should not happen if target in range
    }

    function getMarginalOver(matrix, line) {
        let pOver = 0;
        for (let k = 0; k <= 20; k++) {
            // Determine prob of exactly k goals
            let pk = 0;
            if (isHome) {
                for (let j = 0; j <= 20; j++) pk += matrix[k][j];
            } else {
                for (let j = 0; j <= 20; j++) pk += matrix[j][k];
            }

            if (k > line) pOver += pk;
        }
        return pOver;
    }

    // FT Over/Under
    let ftHtml = "";
    [0.5, 1.5, 2.5].forEach(line => {
        const po = getMarginalOver(matrixFT, line);
        ftHtml += `<tr>
            <td class="line-col">${line}</td>
            <td class="num-col">${probToOdds(po)}</td>
            <td class="num-col">${probToOdds(1 - po)}</td>
        </tr>`;
    });
    const ftEl = document.getElementById(`${prefix}FtTable`);
    if (ftEl) ftEl.innerHTML = ftHtml;

    // Half Overs
    function getHalfHtml(matrix) {
        let html = "";
        [0.5, 1.5, 2.5].forEach(line => {
            const po = getMarginalOver(matrix, line);
            html += `<tr><td class="line-col">${line}</td><td class="num-col">${probToOdds(po)}</td><td class="num-col">${probToOdds(1 - po)}</td></tr>`;
        });
        return html;
    }
    const h1El = document.getElementById(`${prefix}1hTable`);
    const h2El = document.getElementById(`${prefix}2hTable`);
    if (h1El) h1El.innerHTML = getHalfHtml(matrixFH);
    if (h2El) h2El.innerHTML = getHalfHtml(matrixSH);

    // Exact Goals FT
    let exHtml = "";
    // Note: getMarginal reconstructs sum every time, slightly inefficient but safest and fast enough for 20x20
    for (let k = 0; k <= 3; k++) {
        let pk = 0;
        if (isHome) {
            for (let j = 0; j <= 20; j++) pk += matrixFT[k][j];
        } else {
            for (let j = 0; j <= 20; j++) pk += matrixFT[j][k];
        }
        exHtml += `<tr><td>${k} Goals</td><td class="num-col">${probToOdds(pk)}</td></tr>`;
    }

    // 4+ Goals
    let p4plus = 0;
    if (isHome) {
        for (let k = 4; k <= 20; k++) for (let j = 0; j <= 20; j++) p4plus += matrixFT[k][j];
    } else {
        for (let k = 4; k <= 20; k++) for (let j = 0; j <= 20; j++) p4plus += matrixFT[j][k];
    }
    exHtml += `<tr><td>4+ Goals</td><td class="num-col">${probToOdds(p4plus)}</td></tr>`;

    const exactEl = document.getElementById(`${prefix}ExactTable`);
    if (exactEl) exactEl.innerHTML = exHtml;

    // Spread FT
    const spreads = [[1, 2], [1, 3], [2, 3]];
    let spHtml = "";
    spreads.forEach(s => {
        let ps = 0;
        for (let k = s[0]; k <= s[1]; k++) {
            let pk = 0;
            if (isHome) {
                for (let j = 0; j <= 20; j++) pk += matrixFT[k][j];
            } else {
                for (let j = 0; j <= 20; j++) pk += matrixFT[j][k];
            }
            ps += pk;
        }
        spHtml += `<tr><td>${s[0]}-${s[1]} Goals</td><td class="num-col">${probToOdds(ps)}</td></tr>`;
    });
    const spreadEl = document.getElementById(`${prefix}SpreadTable`);
    if (spreadEl) spreadEl.innerHTML = spHtml;
}

export function calculateBttsCombos(matrixFH, matrixSH) {
    let pFH_GG = 0;
    for (let x = 1; x <= 7; x++) for (let y = 1; y <= 7; y++) pFH_GG += matrixFH[x][y];
    let pFH_NG = 1 - pFH_GG;

    let pSH_GG = 0;
    for (let x = 1; x <= 7; x++) for (let y = 1; y <= 7; y++) pSH_GG += matrixSH[x][y];
    let pSH_NG = 1 - pSH_GG;

    let combos = [
        { label: "GG & 4+", p: 0 },
        { label: "GG & 2-3", p: 0 },
        { label: "GG & I 1+", p: 0 },
        { label: "GG & I 2+", p: 0 },
        { label: "GG & II 1+", p: 0 },
        { label: "GG & II 2+", p: 0 },
        { label: "GG & I 1+ & II 1+", p: 0 },
        { label: "GG & 3+", p: 0 },
        { label: "IGG & 3+", p: 0 },
        { label: "IGG & 4+", p: 0 },
        { label: "ING & IIGG", p: pFH_NG * pSH_GG },
        { label: "IGG & IING", p: pFH_GG * pSH_NG },
        { label: "ING & IING", p: pFH_NG * pSH_NG },
        { label: "IGG & IIGG", p: pFH_GG * pSH_GG },
        { label: "IGG or IIGG", p: pFH_GG + pSH_GG - (pFH_GG * pSH_GG) }
    ];

    for (let h1 = 0; h1 <= 7; h1++) {
        for (let a1 = 0; a1 <= 7; a1++) {
            let p1 = matrixFH[h1][a1];
            for (let h2 = 0; h2 <= 7; h2++) {
                for (let a2 = 0; a2 <= 7; a2++) {
                    let p2 = matrixSH[h2][a2];
                    let pj = p1 * p2;
                    let hFT = h1 + h2;
                    let aFT = a1 + a2;
                    let ggFT = hFT > 0 && aFT > 0;
                    let ggFH = h1 > 0 && a1 > 0;

                    if (ggFT && (hFT + aFT >= 4)) combos[0].p += pj;    // GG & 4+
                    if (ggFT && (hFT + aFT >= 2 && hFT + aFT <= 3)) combos[1].p += pj; // GG & 2-3
                    if (ggFT && (h1 + a1 >= 1)) combos[2].p += pj;    // GG & I 1+
                    if (ggFT && (h1 + a1 >= 2)) combos[3].p += pj;    // GG & I 2+
                    if (ggFT && (h2 + a2 >= 1)) combos[4].p += pj;    // GG & II 1+
                    if (ggFT && (h2 + a2 >= 2)) combos[5].p += pj;    // GG & II 2+
                    if (ggFT && (h1 + a1 >= 1) && (h2 + a2 >= 1)) combos[6].p += pj; // GG & I 1+ & II 1+
                    if (ggFT && (hFT + aFT >= 3)) combos[7].p += pj;   // GG & 3+
                    if (ggFH && (hFT + aFT >= 3)) combos[8].p += pj;   // IGG & 3+
                    if (ggFH && (hFT + aFT >= 4)) combos[9].p += pj;   // IGG & 4+
                }
            }
        }
    }

    let html = "";
    combos.forEach(c => {
        html += `<tr><td>${c.label}</td><td class="num-col prob-col">${(c.p * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(c.p)}</td></tr>`;
    });
    return html;
}

export function updateWinCombosExtra(matrix1H, matrix2H, isHome) {
    let p12_12 = 0;
    const prefix = isHome ? "1" : "2";

    for (let h1 = 0; h1 <= 7; h1++) {
        for (let a1 = 0; a1 <= 7; a1++) {
            let p1 = matrix1H[h1][a1];
            for (let h2 = 0; h2 <= 7; h2++) {
                for (let a2 = 0; a2 <= 7; a2++) {
                    let p2 = matrix2H[h2][a2];
                    let pj = p1 * p2;
                    let hFT = h1 + h2;
                    let aFT = a1 + a2;
                    let win = isHome ? (hFT > aFT) : (aFT > hFT);

                    if (win && (h1 + a1 >= 1 && h1 + a1 <= 2) && (h2 + a2 >= 1 && h2 + a2 <= 2)) {
                        p12_12 += pj;
                    }
                }
            }
        }
    }
    return `<tr><td>${prefix} & 1-2 I & 1-2 II</td><td class="num-col prob-col">${(p12_12 * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(p12_12)}</td></tr>`;
}

export function calculateWinCombos(matrix1H, matrix2H, isHome) {
    let combos = {
        "Win & 1+I": 0, "Win & 2+I": 0, "Win & 2-3I": 0,
        "Win & 1+II": 0, "Win & 2+II": 0, "Win & 1+I & 1+II": 0,
        "Win & GG": 0, "Win & GGI": 0, "Win & GGII": 0,
        "Win & 1+I & 2+": 0, "Win & 1+I & 3+": 0,
        "Win & 1-3I & 1-3II": 0, "Win & 2+I & 4+": 0,
        "Win Both Halves": 0, "Win To Nil": 0, "Win Both Halves With Nil": 0,
        "WBH & 4+": 0, "Lead on HT & Not Win": 0
    };

    const prefix = isHome ? "1" : "2";

    for (let h1 = 0; h1 <= 7; h1++) {
        for (let a1 = 0; a1 <= 7; a1++) {
            let p1 = matrix1H[h1][a1];
            let s1H = isHome ? h1 : a1;
            let o1H = isHome ? a1 : h1;

            for (let h2 = 0; h2 <= 7; h2++) {
                for (let a2 = 0; a2 <= 7; a2++) {
                    let p2 = matrix2H[h2][a2];
                    let pJoint = p1 * p2;

                    let s2H = isHome ? h2 : a2;
                    let o2H = isHome ? a2 : h2;

                    let sFT = s1H + s2H;
                    let oFT = o1H + o2H;
                    let totFT = sFT + oFT;

                    let win = sFT > oFT;

                    // 1. Standard Win Combos
                    if (win) {
                        if (s1H + o1H >= 1) combos["Win & 1+I"] += pJoint;
                        if (s1H + o1H >= 2) combos["Win & 2+I"] += pJoint;
                        if (s1H + o1H >= 2 && s1H + o1H <= 3) combos["Win & 2-3I"] += pJoint;
                        if (s2H + o2H >= 1) combos["Win & 1+II"] += pJoint;
                        if (s2H + o2H >= 2) combos["Win & 2+II"] += pJoint;
                        if (s1H + o1H >= 1 && s2H + o2H >= 1) combos["Win & 1+I & 1+II"] += pJoint;
                        if (sFT >= 1 && oFT >= 1) combos["Win & GG"] += pJoint;
                        if (s1H >= 1 && o1H >= 1) combos["Win & GGI"] += pJoint;
                        if (s2H >= 1 && o2H >= 1) combos["Win & GGII"] += pJoint;
                        if (s1H + o1H >= 1 && totFT >= 2) combos["Win & 1+I & 2+"] += pJoint;
                        if (s1H + o1H >= 1 && totFT >= 3) combos["Win & 1+I & 3+"] += pJoint;
                        if ((s1H + o1H >= 1 && s1H + o1H <= 3) && (s2H + o2H >= 1 && s2H + o2H <= 3)) combos["Win & 1-3I & 1-3II"] += pJoint;
                        if (s1H + o1H >= 2 && totFT >= 4) combos["Win & 2+I & 4+"] += pJoint;

                        // Special: To Win To Nil
                        if (oFT === 0) combos["Win To Nil"] += pJoint;
                    }

                    // Special: Win Both Halves
                    if (s1H > o1H && s2H > o2H) {
                        combos["Win Both Halves"] += pJoint;
                        if (oFT === 0) combos["Win Both Halves With Nil"] += pJoint;
                        if (totFT >= 4) combos["WBH & 4+"] += pJoint;
                    }

                    // Special: Lead HT & Not Win
                    if (s1H > o1H && sFT <= oFT) {
                        combos["Lead on HT & Not Win"] += pJoint;
                    }
                }
            }
        }
    }

    let html = "";
    Object.keys(combos).forEach(key => {
        let label = key.replace("Win", prefix);
        if (label.includes("WBH")) label = label.replace("WBH", "WBH" + prefix);
        let p = combos[key];
        html += `<tr><td>${label}</td><td class="num-col prob-col">${(p * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(p)}</td></tr>`;
    });
    return html;
}

export function calculateJointCombos(matrix1H, matrix2H, type) {
    let results = [];
    if (type === 'draw') {
        results = [
            { label: "X & 0-2", check: (h1, a1, h2, a2, hFT, aFT) => (hFT === aFT) && (hFT + aFT <= 2) },
            { label: "X & 2+", check: (h1, a1, h2, a2, hFT, aFT) => (hFT === aFT) && (hFT + aFT >= 2) },
            { label: "X & 3+", check: (h1, a1, h2, a2, hFT, aFT) => (hFT === aFT) && (hFT + aFT >= 3) },
            { label: "X & 4+", check: (h1, a1, h2, a2, hFT, aFT) => (hFT === aFT) && (hFT + aFT >= 4) },
            { label: "X & GG", check: (h1, a1, h2, a2, hFT, aFT) => (hFT === aFT) && (hFT >= 1 && aFT >= 1) },
            { label: "X & 2+I", check: (h1, a1, h2, a2, hFT, aFT) => (hFT === aFT) && (h1 + a1 >= 2) },
            { label: "X & GGI", check: (h1, a1, h2, a2, hFT, aFT) => (hFT === aFT) && (h1 >= 1 && a1 >= 1) },
            { label: "X & NGI", check: (h1, a1, h2, a2, hFT, aFT) => (hFT === aFT) && (h1 === 0 || a1 === 0) },
            { label: "X & GGII", check: (h1, a1, h2, a2, hFT, aFT) => (hFT === aFT) && (h2 >= 1 && a2 >= 1) },
            { label: "X & NGII", check: (h1, a1, h2, a2, hFT, aFT) => (hFT === aFT) && (h2 === 0 || a2 === 0) },
            { label: "X & 1-3 I & 1-3 II", check: (h1, a1, h2, a2, hFT, aFT) => (hFT === aFT) && (h1 + a1 >= 1 && h1 + a1 <= 3) && (h2 + a2 >= 1 && h2 + a2 <= 3) },
            { label: "X & 2+I & 4+", check: (h1, a1, h2, a2, hFT, aFT) => (hFT === aFT) && (h1 + a1 >= 2) && (hFT + aFT >= 4) },
            { label: "X & 1-2 I & 1-2 II", check: (h1, a1, h2, a2, hFT, aFT) => (hFT === aFT) && (h1 + a1 >= 1 && h1 + a1 <= 2) && (h2 + a2 >= 1 && h2 + a2 <= 2) },
            { label: "X & 0-2 I & 0-2 II", check: (h1, a1, h2, a2, hFT, aFT) => (hFT === aFT) && (h1 + a1 <= 2) && (h2 + a2 <= 2) },
            { label: "X & 0-2 I & 1-3 II", check: (h1, a1, h2, a2, hFT, aFT) => (hFT === aFT) && (h1 + a1 <= 2) && (h2 + a2 >= 1 && h2 + a2 <= 3) }
        ];
    } else if (type === 'dc') {
        const dcMarkets = [
            // Base 1X, X2, 12 conditions
            { cond: (hFT, aFT) => hFT >= aFT, prefix: "1X" },
            { cond: (hFT, aFT) => aFT >= hFT, prefix: "X2" },
            { cond: (hFT, aFT) => hFT !== aFT, prefix: "12" }
        ];

        const goalChecks = [
            { label: "2+", check: (h, a) => (h + a) >= 2 },
            { label: "3+", check: (h, a) => (h + a) >= 3 },
            { label: "0-3", check: (h, a) => (h + a) <= 3 },
            { label: "0-1", check: (h, a) => (h + a) <= 1 },
            { label: "0-2", check: (h, a) => (h + a) <= 2 },
            { label: "4+", check: (h, a) => (h + a) >= 4 },
            { label: "0-4", check: (h, a) => (h + a) <= 4 },
            { label: "5+", check: (h, a) => (h + a) >= 5 },
            { label: "1-2", check: (h, a) => (h + a) >= 1 && (h + a) <= 2 },
            { label: "1-3", check: (h, a) => (h + a) >= 1 && (h + a) <= 3 },
            { label: "2-3", check: (h, a) => (h + a) >= 2 && (h + a) <= 3 },
            { label: "2-4", check: (h, a) => (h + a) >= 2 && (h + a) <= 4 },
            { label: "2-5", check: (h, a) => (h + a) >= 2 && (h + a) <= 5 },
            { label: "3-4", check: (h, a) => (h + a) >= 3 && (h + a) <= 4 },
            { label: "3-5", check: (h, a) => (h + a) >= 3 && (h + a) <= 5 },
            { label: "3-6", check: (h, a) => (h + a) >= 3 && (h + a) <= 6 },
            { label: "4-6", check: (h, a) => (h + a) >= 4 && (h + a) <= 6 },
            // Half-time Mixed
            { label: "1-2 I & 1-2 II", check: (h, a, h1, a1, h2, a2) => (h1 + a1 >= 1 && h1 + a1 <= 2) && (h2 + a2 >= 1 && h2 + a2 <= 2) },
            { label: "1-3 I & 1-3 II", check: (h, a, h1, a1, h2, a2) => (h1 + a1 >= 1 && h1 + a1 <= 3) && (h2 + a2 >= 1 && h2 + a2 <= 3) },
            { label: "I2+ & 4+", check: (h, a, h1, a1, h2, a2) => (h1 + a1 >= 2) && (h + a >= 4) }
        ];

        dcMarkets.forEach(m => {
            goalChecks.forEach(g => {
                results.push({
                    label: `${m.prefix} & ${g.label}`,
                    check: (h1, a1, h2, a2, hFT, aFT) => m.cond(hFT, aFT) && g.check(hFT, aFT, h1, a1, h2, a2)
                });
            });
        });
    } else if (type === 'htft') {
        results = [
            // 1-1 Combinations
            { label: "1-1 & 2+", check: (h1, a1, h2, a2, hFT, aFT) => (h1 > a1 && hFT > aFT) && (hFT + aFT >= 2) },
            { label: "1-1 & 0-2", check: (h1, a1, h2, a2, hFT, aFT) => (h1 > a1 && hFT > aFT) && (hFT + aFT <= 2) },
            { label: "1-1 & 3+", check: (h1, a1, h2, a2, hFT, aFT) => (h1 > a1 && hFT > aFT) && (hFT + aFT >= 3) },
            { label: "1-1 & 0-3", check: (h1, a1, h2, a2, hFT, aFT) => (h1 > a1 && hFT > aFT) && (hFT + aFT <= 3) },
            { label: "1-1 & 4+", check: (h1, a1, h2, a2, hFT, aFT) => (h1 > a1 && hFT > aFT) && (hFT + aFT >= 4) },
            { label: "1-1 & 0-4", check: (h1, a1, h2, a2, hFT, aFT) => (h1 > a1 && hFT > aFT) && (hFT + aFT <= 4) },

            // X-1 Combinations
            { label: "X-1 & 0-1", check: (h1, a1, h2, a2, hFT, aFT) => (h1 === a1 && hFT > aFT) && (hFT + aFT <= 1) },
            { label: "X-1 & 2+", check: (h1, a1, h2, a2, hFT, aFT) => (h1 === a1 && hFT > aFT) && (hFT + aFT >= 2) },
            { label: "X-1 & 0-2", check: (h1, a1, h2, a2, hFT, aFT) => (h1 === a1 && hFT > aFT) && (hFT + aFT <= 2) },
            { label: "X-1 & 3+", check: (h1, a1, h2, a2, hFT, aFT) => (h1 === a1 && hFT > aFT) && (hFT + aFT >= 3) },
            { label: "X-1 & 0-3", check: (h1, a1, h2, a2, hFT, aFT) => (h1 === a1 && hFT > aFT) && (hFT + aFT <= 3) },
            { label: "X-1 & 4+", check: (h1, a1, h2, a2, hFT, aFT) => (h1 === a1 && hFT > aFT) && (hFT + aFT >= 4) },

            // 2-2 Combinations
            { label: "2-2 & 2+", check: (h1, a1, h2, a2, hFT, aFT) => (a1 > h1 && aFT > hFT) && (hFT + aFT >= 2) },
            { label: "2-2 & 0-2", check: (h1, a1, h2, a2, hFT, aFT) => (a1 > h1 && aFT > hFT) && (hFT + aFT <= 2) },
            { label: "2-2 & 3+", check: (h1, a1, h2, a2, hFT, aFT) => (a1 > h1 && aFT > hFT) && (hFT + aFT >= 3) },
            { label: "2-2 & 0-3", check: (h1, a1, h2, a2, hFT, aFT) => (a1 > h1 && aFT > hFT) && (hFT + aFT <= 3) },
            { label: "2-2 & 4+", check: (h1, a1, h2, a2, hFT, aFT) => (a1 > h1 && aFT > hFT) && (hFT + aFT >= 4) },
            { label: "2-2 & 0-4", check: (h1, a1, h2, a2, hFT, aFT) => (a1 > h1 && aFT > hFT) && (hFT + aFT <= 4) },

            // X-2 Combinations
            { label: "X-2 & 0-1", check: (h1, a1, h2, a2, hFT, aFT) => (a1 === h1 && aFT > hFT) && (hFT + aFT <= 1) },
            { label: "X-2 & 2+", check: (h1, a1, h2, a2, hFT, aFT) => (a1 === h1 && aFT > hFT) && (hFT + aFT >= 2) },
            { label: "X-2 & 0-2", check: (h1, a1, h2, a2, hFT, aFT) => (a1 === h1 && aFT > hFT) && (hFT + aFT <= 2) },
            { label: "X-2 & 3+", check: (h1, a1, h2, a2, hFT, aFT) => (a1 === h1 && aFT > hFT) && (hFT + aFT >= 3) },
            { label: "X-2 & 0-3", check: (h1, a1, h2, a2, hFT, aFT) => (a1 === h1 && aFT > hFT) && (hFT + aFT <= 3) },
            { label: "X-2 & 4+", check: (h1, a1, h2, a2, hFT, aFT) => (a1 === h1 && aFT > hFT) && (hFT + aFT >= 4) },

            // X-X Combinations
            { label: "X-X & 2+", check: (h1, a1, h2, a2, hFT, aFT) => (h1 === a1 && hFT === aFT) && (hFT + aFT >= 2) },
            { label: "X-X & 3+", check: (h1, a1, h2, a2, hFT, aFT) => (h1 === a1 && hFT === aFT) && (hFT + aFT >= 3) },
            { label: "X-X & 0-2", check: (h1, a1, h2, a2, hFT, aFT) => (h1 === a1 && hFT === aFT) && (hFT + aFT <= 2) },

            { label: "1-1 & 1-2 I & 1-2 II", check: (h1, a1, h2, a2, hFT, aFT) => (h1 > a1 && hFT > aFT) && (h1 + a1 >= 1 && h1 + a1 <= 2) && (h2 + a2 >= 1 && h2 + a2 <= 2) },
            { label: "2-2 & 1-2 I & 1-2 II", check: (h1, a1, h2, a2, hFT, aFT) => (a1 > h1 && aFT > hFT) && (h1 + a1 >= 1 && h1 + a1 <= 2) && (h2 + a2 >= 1 && h2 + a2 <= 2) },
            { label: "1-1 & 1-3 I & 1-3 II", check: (h1, a1, h2, a2, hFT, aFT) => (h1 > a1 && hFT > aFT) && (h1 + a1 >= 1 && h1 + a1 <= 3) && (h2 + a2 >= 1 && h2 + a2 <= 3) },
            { label: "2-2 & 1-3 I & 1-3 II", check: (h1, a1, h2, a2, hFT, aFT) => (a1 > h1 && aFT > hFT) && (h1 + a1 >= 1 && h1 + a1 <= 3) && (h2 + a2 >= 1 && h2 + a2 <= 3) },
            { label: "1-1 & I2+ & 4+", check: (h1, a1, h2, a2, hFT, aFT) => (h1 > a1 && hFT > aFT) && (h1 + a1 >= 2) && (hFT + aFT >= 4) },
            { label: "2-2 & I2+ & 4+", check: (h1, a1, h2, a2, hFT, aFT) => (a1 > h1 && aFT > hFT) && (h1 + a1 >= 2) && (hFT + aFT >= 4) }
        ];
    }

    let probs = results.map(r => ({ label: r.label, p: 0 }));

    for (let h1 = 0; h1 <= 7; h1++) {
        for (let a1 = 0; a1 <= 7; a1++) {
            let p1 = matrix1H[h1][a1];
            for (let h2 = 0; h2 <= 7; h2++) {
                for (let a2 = 0; a2 <= 7; a2++) {
                    let p2 = matrix2H[h2][a2];
                    let pj = p1 * p2;
                    let hFT = h1 + h2;
                    let aFT = a1 + a2;

                    probs.forEach((obj, idx) => {
                        if (results[idx].check(h1, a1, h2, a2, hFT, aFT)) {
                            obj.p += pj;
                        }
                    });
                }
            }
        }
    }

    let html = "";
    probs.forEach(obj => {
        html += `<tr><td>${obj.label}</td><td class="num-col prob-col">${(obj.p * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(obj.p)}</td></tr>`;
    });
    return html;
}

export function calculateFtsCombos(lamFT, muFT, lamFH, muFH, lamSH, muSH, matrixFT, matrixFH, matrixSH) {
    const ratioFT_H = lamFT / (lamFT + muFT);
    const ratioFT_A = muFT / (lamFT + muFT);

    const ratioFH_H = lamFH / (lamFH + muFH);
    const ratioFH_A = muFH / (lamFH + muFH);

    const ratioSH_H = lamSH / (lamSH + muSH);
    const ratioSH_A = muSH / (lamSH + muSH);

    // Basic FT
    const pFT_0_0 = matrixFT[0][0];
    const pFT_AnyGoal = 1 - pFT_0_0;

    // Basic FH
    const pFH_0_0 = matrixFH[0][0];
    const pFH_AnyGoal = 1 - pFH_0_0;

    // Basic SH
    const pSH_0_0 = matrixSH[0][0];
    const pSH_AnyGoal = 1 - pSH_0_0;

    // Result and Total helpers
    let p1 = 0, pX = 0, p2 = 0, p2plus = 0, p3plus = 0;
    for (let x = 0; x <= 20; x++) {
        for (let y = 0; y <= 20; y++) {
            let p = matrixFT[x][y];
            if (x > y) p1 += p;
            else if (x === y) pX += p;
            else p2 += p;

            if (x + y >= 2) p2plus += p;
            if (x + y >= 3) p3plus += p;
        }
    }

    const pX_Strict = pX - pFT_0_0; // Draw with at least 1 goal

    const combos = [
        // FT
        { label: "T1", p: pFT_AnyGoal * ratioFT_H },
        { label: "no", p: pFT_0_0 },
        { label: "T2", p: pFT_AnyGoal * ratioFT_A },
        // 1H
        { label: "T1 I", p: pFH_AnyGoal * ratioFH_H },
        { label: "no I", p: pFH_0_0 },
        { label: "T2 I", p: pFH_AnyGoal * ratioFH_A },
        // 2H
        { label: "T1 II", p: pSH_AnyGoal * ratioSH_H },
        { label: "no II", p: pSH_0_0 },
        { label: "T2 II", p: pSH_AnyGoal * ratioSH_A },
        // Result & FTS
        { label: "1 & T1", p: p1 * ratioFT_H },
        { label: "1 & T2", p: p1 * ratioFT_A },
        { label: "2 & T1", p: p2 * ratioFT_H },
        { label: "2 & T2", p: p2 * ratioFT_A },
        { label: "X & T1", p: pX_Strict * ratioFT_H },
        { label: "X & T2", p: pX_Strict * ratioFT_A },
        // Goals & FTS
        { label: "T1 & 2+", p: p2plus * ratioFT_H },
        { label: "T2 & 2+", p: p2plus * ratioFT_A },
        { label: "T1 & 3+", p: p3plus * ratioFT_H },
        { label: "T2 & 3+", p: p3plus * ratioFT_A }
    ];

    let html = "";
    combos.forEach(c => {
        html += `<tr><td>${c.label}</td><td class="num-col prob-col">${(c.p * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(c.p)}</td></tr>`;
    });
    return html;
}

export function calculateTeamGoalCombos(matrixFH, matrixSH, isHome) {
    let results = [
        { label: "1+I & 2+II", check: (h1, a1, h2, a2) => (isHome ? h1 : a1) >= 1 && (isHome ? h2 : a2) >= 2 },
        { label: "2+I & 1+II", check: (h1, a1, h2, a2) => (isHome ? h1 : a1) >= 2 && (isHome ? h2 : a2) >= 1 },
        { label: "2+I & 2+II", check: (h1, a1, h2, a2) => (isHome ? h1 : a1) >= 2 && (isHome ? h2 : a2) >= 2 },
        { label: "2+ & GG", check: (h1, a1, h2, a2) => (isHome ? (h1 + h2) : (a1 + a2)) >= 2 && (h1 + h2 >= 1 && a1 + a2 >= 1) },
        { label: "0-1 I & 0-1 II", check: (h1, a1, h2, a2) => (isHome ? h1 : a1) <= 1 && (isHome ? h2 : a2) <= 1 },
        { label: "0-1 I & 0-2 II", check: (h1, a1, h2, a2) => (isHome ? h1 : a1) <= 1 && (isHome ? h2 : a2) <= 2 },
        { label: "0-2 I & 0-1 II", check: (h1, a1, h2, a2) => (isHome ? h1 : a1) <= 2 && (isHome ? h2 : a2) <= 1 },
        { label: "0-2 I & 0-2 II", check: (h1, a1, h2, a2) => (isHome ? h1 : a1) <= 2 && (isHome ? h2 : a2) <= 2 },
        { label: "1+I & T 2+", check: (h1, a1, h2, a2) => (isHome ? h1 : a1) >= 1 && (isHome ? (h1 + h2) : (a1 + a2)) >= 2 },
        { label: "1+I & T 3+", check: (h1, a1, h2, a2) => (isHome ? h1 : a1) >= 1 && (isHome ? (h1 + h2) : (a1 + a2)) >= 3 },
        { label: "1+I & 1+II", check: (h1, a1, h2, a2) => (isHome ? h1 : a1) >= 1 && (isHome ? h2 : a2) >= 1 },
        { label: "no 1+I & 1+II", check: (h1, a1, h2, a2) => !((isHome ? h1 : a1) >= 1 && (isHome ? h2 : a2) >= 1) },
        { label: "3+ & GG", check: (h1, a1, h2, a2) => (isHome ? (h1 + h2) : (a1 + a2)) >= 3 && (h1 + h2 >= 1 && a1 + a2 >= 1) },
        {
            label: "1-2 I & 1-2 II", check: (h1, a1, h2, a2) => {
                let s1 = isHome ? h1 : a1;
                let s2 = isHome ? h2 : a2;
                return (s1 >= 1 && s1 <= 2) && (s2 >= 1 && s2 <= 2);
            }
        }
    ];

    let probs = results.map(r => ({ label: r.label, p: 0 }));
    const prefix = isHome ? "T1" : "T2";

    for (let h1 = 0; h1 <= 7; h1++) {
        for (let a1 = 0; a1 <= 7; a1++) {
            let p1 = matrixFH[h1][a1];
            for (let h2 = 0; h2 <= 7; h2++) {
                for (let a2 = 0; a2 <= 7; a2++) {
                    let p2 = matrixSH[h2][a2];
                    let pj = p1 * p2;

                    probs.forEach((obj, idx) => {
                        if (results[idx].check(h1, a1, h2, a2)) {
                            obj.p += pj;
                        }
                    });
                }
            }
        }
    }

    let html = "";
    probs.forEach(obj => {
        let labelText = obj.label.startsWith("no") ? "no " + prefix + " " + obj.label.substring(3) : prefix + " " + obj.label;
        html += `<tr><td>${labelText}</td><td class="num-col prob-col">${(obj.p * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(obj.p)}</td></tr>`;
    });
    return html;
}
