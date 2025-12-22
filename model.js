/**
 * DIXON-COLES & MATH UTILITIES
 */

// Factorial cache for performance
const factCache = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];
function factorial(n) {
    if (n < 0) return 1;
    if (n < factCache.length) return factCache[n];
    return n * factorial(n - 1);
}

// Standard Poisson
function poisson(k, lambda) {
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

// Dixon-Coles Adjustment Factor (Rho)
// Using standard rho approx -0.13, or can be derived. 
// We use a fixed rho for stability in this demo.
const RHO = -0.13;

function correction(x, y, lambda, mu, rho) {
    if (x === 0 && y === 0) return 1 - (lambda * mu * rho);
    if (x === 0 && y === 1) return 1 + (lambda * rho);
    if (x === 1 && y === 0) return 1 + (mu * rho);
    if (x === 1 && y === 1) return 1 - rho;
    return 1;
}

// Calculate probability of a specific scoreline
function getScoreProb(x, y, lambda, mu) {
    let base = poisson(x, lambda) * poisson(y, mu);
    let adj = correction(x, y, lambda, mu, RHO);
    return base * adj;
}

/**
 * SHIN'S METHOD FOR VIG REMOVAL
 */
function solveShin(oddsArr) {
    const sumImplied = oddsArr.reduce((sum, o) => sum + (1 / o), 0);
    const m = sumImplied - 1; // Margin

    if (m <= 0) return oddsArr.map(o => 1 / o);

    let z = 0.01; // Initial guess for Shin's Z (proportion of insider traders)
    for (let i = 0; i < 50; i++) {
        let sumProb = oddsArr.reduce((sum, o) => {
            const pImplied = 1 / o;
            const p = (Math.sqrt(z ** 2 + 4 * (1 - z) * (pImplied ** 2 / sumImplied)) - z) / (2 * (1 - z));
            return sum + p;
        }, 0);

        if (Math.abs(sumProb - 1) < 1e-7) break;
        z += (sumProb - 1) * 0.5; // Simple Newton-like adjustment
        if (z < 0) z = 0;
        if (z > 1) z = 0.99;
    }

    return oddsArr.map(o => {
        const pImplied = 1 / o;
        return (Math.sqrt(z ** 2 + 4 * (1 - z) * (pImplied ** 2 / sumImplied)) - z) / (2 * (1 - z));
    });
}

/**
 * SOLVER LOGIC
 */

// We want to find lambda, mu such that Model(HomeWin) = Target(HomeWin) AND Model(OverLine) = Target(OverLine)
function solveParameters(targetHomeWin, targetOverProb, targetLine) {
    let lambda = 1.4; // Initial guess
    let mu = 1.0;     // Initial guess
    let lr = 0.1;     // Learning rate
    let maxIter = 500;

    for (let i = 0; i < maxIter; i++) {
        let probs = calculateMatrix(lambda, mu);

        let currHome = 0;
        let currOver = 0;

        // Sum probabilities from matrix
        for (let x = 0; x <= 10; x++) {
            for (let y = 0; y <= 10; y++) {
                let p = probs[x][y];
                if (x > y) currHome += p;
                if (x + y > targetLine) currOver += p;
            }
        }

        let errHome = targetHomeWin - currHome;
        let errOver = targetOverProb - currOver;

        if (Math.abs(errHome) < 0.0001 && Math.abs(errOver) < 0.0001) break;

        // Heuristic Gradient Descent
        lambda += lr * (errHome + 0.5 * errOver);
        mu += lr * (-errHome + 0.5 * errOver);

        // Prevent negative values
        if (lambda < 0.01) lambda = 0.01;
        if (mu < 0.01) mu = 0.01;
    }

    return { lambda, mu };
}

function calculateMatrix(lambda, mu, isHalf = false) {
    let matrix = [];
    for (let x = 0; x <= 10; x++) {
        matrix[x] = [];
        for (let y = 0; y <= 10; y++) {
            // For half-time matrices, we typically only apply Dixon-Coles if the lambda/mu 
            // are representing the full game or if we specifically adjust rho.
            // For simplicity, we'll apply it consistently but scaled.
            matrix[x][y] = getScoreProb(x, y, lambda, mu);
        }
    }
    return matrix;
}



function probToOdds(p) {
    return p > 0 ? (1 / p).toFixed(2) : "∞";
}

function runModel() {
    // Get Inputs
    const h = parseFloat(document.getElementById('homeOdds').value);
    const d = parseFloat(document.getElementById('drawOdds').value);
    const a = parseFloat(document.getElementById('awayOdds').value);
    const line = parseFloat(document.getElementById('goalLine').value);
    const o = parseFloat(document.getElementById('overOdds').value);
    const u = parseFloat(document.getElementById('underOdds').value);

    if ([h, d, a, line, o, u].some(isNaN)) return;

    // Update Labels
    document.getElementById('overLabel').textContent = `Over ${line} Odds`;
    document.getElementById('underLabel').textContent = `Under ${line} Odds`;

    // 1. Get True Probabilities (Shin Method)
    const true1x2 = solveShin([h, d, a]);
    const trueOU = solveShin([o, u]);

    // Display Shin 1x2 Probs
    document.getElementById('shinHome').textContent = (true1x2[0] * 100).toFixed(1) + "%";
    document.getElementById('shinDraw').textContent = (true1x2[1] * 100).toFixed(1) + "%";
    document.getElementById('shinAway').textContent = (true1x2[2] * 100).toFixed(1) + "%";

    const targetHome = true1x2[0];
    const targetOver = trueOU[0];

    // 2. Solve for xG
    const params = solveParameters(targetHome, targetOver, line);

    // Display Parameters
    document.getElementById('xgHome').textContent = params.lambda.toFixed(3);
    document.getElementById('xgAway').textContent = params.mu.toFixed(3);
    document.getElementById('ftArea').classList.remove('hidden');
    document.getElementById('fhArea').classList.remove('hidden');
    document.getElementById('shArea').classList.remove('hidden');
    document.getElementById('homeTeamArea').classList.remove('hidden');
    document.getElementById('awayTeamArea').classList.remove('hidden');
    document.getElementById('goalComboArea').classList.remove('hidden');
    document.getElementById('drawComboArea').classList.remove('hidden');
    document.getElementById('dcComboArea').classList.remove('hidden');
    document.getElementById('htftComboArea').classList.remove('hidden');
    document.getElementById('homeGoalComboArea').classList.remove('hidden');
    document.getElementById('awayGoalComboArea').classList.remove('hidden');

    // 3. Generate Matrices & Markets
    const matrixFT = calculateMatrix(params.lambda, params.mu);
    const matrixFH = calculateMatrix(params.lambda * 0.45, params.mu * 0.45);
    const matrixSH = calculateMatrix(params.lambda * 0.55, params.mu * 0.55);

    // Total Goals Table
    const lines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5];
    let tgHtml = "";
    lines.forEach(line => {
        let pOver = 0;
        for (let x = 0; x <= 10; x++) {
            for (let y = 0; y <= 10; y++) {
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

    // BTTS Market
    let bttsYes = 0;
    for (let x = 1; x <= 10; x++) {
        for (let y = 1; y <= 10; y++) {
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
        for (let x = 0; x <= 10; x++) {
            for (let y = 0; y <= 10; y++) {
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

    for (let x = 0; x <= 10; x++) {
        for (let y = 0; y <= 10; y++) {
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

    // 1st Half Goals
    const fhLines = [0.5, 1.5, 2.5, 3.5];
    let fhHtml = "";
    fhLines.forEach(line => {
        let pOver = 0;
        for (let x = 0; x <= 10; x++) {
            for (let y = 0; y <= 10; y++) {
                if (x + y > line) pOver += matrixFH[x][y];
            }
        }
        fhHtml += `<tr>
            <td class="line-col">${line}</td>
            <td class="num-col">${probToOdds(pOver)}</td>
            <td class="num-col">${probToOdds(1 - pOver)}</td>
        </tr>`;
    });
    document.getElementById('fhGoalsTable').innerHTML = fhHtml;

    // 2nd Half Goals
    let shHtml = "";
    fhLines.forEach(line => {
        let pOver = 0;
        for (let x = 0; x <= 10; x++) {
            for (let y = 0; y <= 10; y++) {
                if (x + y > line) pOver += matrixSH[x][y];
            }
        }
        shHtml += `<tr>
            <td class="line-col">${line}</td>
            <td class="num-col">${probToOdds(pOver)}</td>
            <td class="num-col">${probToOdds(1 - pOver)}</td>
        </tr>`;
    });
    document.getElementById('shGoalsTable').innerHTML = shHtml;

    // Interval 1X2s
    function get1X2Probs(matrix) {
        let p1 = 0, pX = 0, p2 = 0;
        for (let x = 0; x <= 10; x++) {
            for (let y = 0; y <= 10; y++) {
                if (x > y) p1 += matrix[x][y];
                else if (x === y) pX += matrix[x][y];
                else p2 += matrix[x][y];
            }
        }
        return { p1, pX, p2 };
    }

    const ft1x2 = get1X2Probs(matrixFT);
    document.getElementById('ftDcTable').innerHTML = `
        <tr><td>1X</td><td class="num-col prob-col">${((ft1x2.p1 + ft1x2.pX) * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(ft1x2.p1 + ft1x2.pX)}</td></tr>
        <tr><td>12</td><td class="num-col prob-col">${((ft1x2.p1 + ft1x2.p2) * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(ft1x2.p1 + ft1x2.p2)}</td></tr>
        <tr><td>X2</td><td class="num-col prob-col">${((ft1x2.pX + ft1x2.p2) * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(ft1x2.pX + ft1x2.p2)}</td></tr>
    `;

    const fh1x2 = get1X2Probs(matrixFH);
    const sh1x2 = get1X2Probs(matrixSH);

    document.getElementById('fh1x2Table').innerHTML = `
        <tr><td>1H Home</td><td class="num-col prob-col">${(fh1x2.p1 * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(fh1x2.p1)}</td></tr>
        <tr><td>1H Draw</td><td class="num-col prob-col">${(fh1x2.pX * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(fh1x2.pX)}</td></tr>
        <tr><td>1H Away</td><td class="num-col prob-col">${(fh1x2.p2 * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(fh1x2.p2)}</td></tr>
    `;

    document.getElementById('sh1x2Table').innerHTML = `
        <tr><td>2H Home</td><td class="num-col prob-col">${(sh1x2.p1 * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(sh1x2.p1)}</td></tr>
        <tr><td>2H Draw</td><td class="num-col prob-col">${(sh1x2.pX * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(sh1x2.pX)}</td></tr>
        <tr><td>2H Away</td><td class="num-col prob-col">${(sh1x2.p2 * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(sh1x2.p2)}</td></tr>
    `;

    // ADDED: Detailed Half Markets
    function populateHalfDetailed(matrix, prefix) {
        // BTTS
        let bttsYes = 0;
        for (let x = 1; x <= 10; x++) {
            for (let y = 1; y <= 10; y++) {
                bttsYes += matrix[x][y];
            }
        }
        let bttsNo = 1 - bttsYes;
        document.getElementById(`${prefix}BttsTable`).innerHTML = `
            <tr><td>Yes</td><td class="num-col">${probToOdds(bttsYes)}</td></tr>
            <tr><td>No</td><td class="num-col">${probToOdds(bttsNo)}</td></tr>
        `;

        // Double Chance
        const probs = get1X2Probs(matrix);
        document.getElementById(`${prefix}DcTable`).innerHTML = `
            <tr><td>1X</td><td class="num-col">${probToOdds(probs.p1 + probs.pX)}</td></tr>
            <tr><td>12</td><td class="num-col">${probToOdds(probs.p1 + probs.p2)}</td></tr>
            <tr><td>X2</td><td class="num-col">${probToOdds(probs.pX + probs.p2)}</td></tr>
        `;

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
        document.getElementById(`${prefix}ExactTable`).innerHTML = exactHtml;

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
        document.getElementById(`${prefix}SpreadTable`).innerHTML = spreadHtml;
    }

    populateHalfDetailed(matrixFH, "fh");
    populateHalfDetailed(matrixSH, "sh");

    // ADDED: Team Specific Markets
    function populateTeamMarkets(lamFT, lamFH, lamSH, prefix) {
        function pK(k, l) { return poisson(k, l); }
        function pOver(target, l) {
            let p = 0;
            for (let i = 0; i <= 10; i++) if (i > target) p += pK(i, l);
            return p;
        }

        // FT Over/Under
        let ftHtml = "";
        [0.5, 1.5, 2.5].forEach(line => {
            const po = pOver(line, lamFT);
            ftHtml += `<tr>
                <td class="line-col">${line}</td>
                <td class="num-col">${probToOdds(po)}</td>
                <td class="num-col">${probToOdds(1 - po)}</td>
            </tr>`;
        });
        document.getElementById(`${prefix}FtTable`).innerHTML = ftHtml;

        // Half Overs
        function getHalfHtml(l) {
            let html = "";
            [0.5, 1.5, 2.5].forEach(line => {
                const po = pOver(line, l);
                html += `<tr><td class="line-col">${line}</td><td class="num-col">${probToOdds(po)}</td><td class="num-col">${probToOdds(1 - po)}</td></tr>`;
            });
            return html;
        }
        document.getElementById(`${prefix}1hTable`).innerHTML = getHalfHtml(lamFH);
        document.getElementById(`${prefix}2hTable`).innerHTML = getHalfHtml(lamSH);

        // Exact Goals FT
        let exHtml = "";
        for (let k = 0; k <= 3; k++) {
            exHtml += `<tr><td>${k} Goals</td><td class="num-col">${probToOdds(pK(k, lamFT))}</td></tr>`;
        }
        let p4plus = 1;
        for (let k = 0; k <= 3; k++) p4plus -= pK(k, lamFT);
        exHtml += `<tr><td>4+ Goals</td><td class="num-col">${probToOdds(p4plus)}</td></tr>`;
        document.getElementById(`${prefix}ExactTable`).innerHTML = exHtml;

        // Spread FT
        const spreads = [[1, 2], [1, 3], [2, 3]];
        let spHtml = "";
        spreads.forEach(s => {
            let ps = 0;
            for (let k = s[0]; k <= s[1]; k++) ps += pK(k, lamFT);
            spHtml += `<tr><td>${s[0]}-${s[1]} Goals</td><td class="num-col">${probToOdds(ps)}</td></tr>`;
        });
        document.getElementById(`${prefix}SpreadTable`).innerHTML = spHtml;
    }

    populateTeamMarkets(params.lambda, params.lambda * 0.45, params.lambda * 0.55, "home");
    populateTeamMarkets(params.mu, params.mu * 0.45, params.mu * 0.55, "away");

    // HT/FT Combinations
    // Outcomes: 1: Home Win, X: Draw, 2: Away Win
    function getOutcome(h, a) {
        if (h > a) return "1";
        if (h === a) return "X";
        return "2";
    }

    let htftProbs = { "11": 0, "1X": 0, "12": 0, "X1": 0, "XX": 0, "X2": 0, "21": 0, "2X": 0, "22": 0 };

    for (let h1 = 0; h1 <= 10; h1++) {
        for (let a1 = 0; a1 <= 10; a1++) {
            let p1 = matrixFH[h1][a1];
            let outcome1 = getOutcome(h1, a1);

            for (let h2 = 0; h2 <= 10; h2++) {
                for (let a2 = 0; a2 <= 10; a2++) {
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

    // Expanded Goals Combinations (Intervals & Mixed)
    function getRangeProb(matrix, min, max) {
        let p = 0;
        for (let x = 0; x <= 10; x++) {
            for (let y = 0; y <= 10; y++) {
                let tot = x + y;
                if (tot >= min && tot <= max) p += matrix[x][y];
            }
        }
        return p;
    }

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

    // Mixed Combinations (Total Goals)
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
        // Image 1
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

        // Image 2
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

        // Mixed (Total)
        { label: "1-3 I & Total 3+", p: getMixedRangeCombo(1, 3, 3, 100) },
        { label: "1-2 I & Total 3+", p: getMixedRangeCombo(1, 2, 3, 100) },
        { label: "1-2 I & Total 4+", p: getMixedRangeCombo(1, 2, 4, 100) },
        { label: "2-3 I & Total 4+", p: getMixedRangeCombo(2, 3, 4, 100) },

        // Under block
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

    // ADDED: Win & Goal Combinations (Home & Away)
    function calculateWinCombos(matrix1H, matrix2H, isHome) {
        let combos = {
            "Win & 1+I": 0, "Win & 2+I": 0, "Win & 2-3I": 0,
            "Win & 1+II": 0, "Win & 2+II": 0, "Win & 1+I & 1+II": 0,
            "Win & GG": 0, "Win & GGI": 0, "Win & GGII": 0,
            "Win & 1+I & 2+": 0, "Win & 1+I & 3+": 0,
            "Win & 1-3I & 1-3II": 0, "Win & 2+I & 4+": 0
        };

        const prefix = isHome ? "1" : "2";

        for (let h1 = 0; h1 <= 7; h1++) {
            for (let a1 = 0; a1 <= 7; a1++) {
                let p1 = matrix1H[h1][a1];
                let tot1H = h1 + a1;

                for (let h2 = 0; h2 <= 7; h2++) {
                    for (let a2 = 0; a2 <= 7; a2++) {
                        let p2 = matrix2H[h2][a2];
                        let pJoint = p1 * p2;

                        let hFT = h1 + h2;
                        let aFT = a1 + a2;
                        let totFT = hFT + aFT;
                        let tot2H = h2 + a2;

                        let win = isHome ? (hFT > aFT) : (aFT > hFT);
                        if (!win) continue;

                        // 1. Win & 1+I
                        if (tot1H >= 1) combos["Win & 1+I"] += pJoint;
                        // 2. Win & 2+I
                        if (tot1H >= 2) combos["Win & 2+I"] += pJoint;
                        // 3. Win & 2-3I
                        if (tot1H >= 2 && tot1H <= 3) combos["Win & 2-3I"] += pJoint;
                        // 4. Win & 1+II
                        if (tot2H >= 1) combos["Win & 1+II"] += pJoint;
                        // 5. Win & 2+II
                        if (tot2H >= 2) combos["Win & 2+II"] += pJoint;
                        // 6. Win & 1+I & 1+II
                        if (tot1H >= 1 && tot2H >= 1) combos["Win & 1+I & 1+II"] += pJoint;
                        // 7. Win & GG
                        if (hFT >= 1 && aFT >= 1) combos["Win & GG"] += pJoint;
                        // 8. Win & GGI
                        if (h1 >= 1 && a1 >= 1) combos["Win & GGI"] += pJoint;
                        // 9. Win & GGII
                        if (h2 >= 1 && a2 >= 1) combos["Win & GGII"] += pJoint;
                        // 10. Win & 1+I & 2+
                        if (tot1H >= 1 && totFT >= 2) combos["Win & 1+I & 2+"] += pJoint;
                        // 11. Win & 1+I & 3+
                        if (tot1H >= 1 && totFT >= 3) combos["Win & 1+I & 3+"] += pJoint;
                        // 12. Win & 1-3I & 1-3II
                        if (tot1H >= 1 && tot1H <= 3 && tot2H >= 1 && tot2H <= 3) combos["Win & 1-3I & 1-3II"] += pJoint;
                        // 13. Win & 2+I & 4+
                        if (tot1H >= 2 && totFT >= 4) combos["Win & 2+I & 4+"] += pJoint;
                    }
                }
            }
        }

        let html = "";
        Object.keys(combos).forEach(key => {
            let label = key.replace("Win", prefix);
            let p = combos[key];
            html += `<tr><td>${label}</td><td class="num-col prob-col">${(p * 100).toFixed(1)}%</td><td class="num-col">${probToOdds(p)}</td></tr>`;
        });
        return html;
    }

    function calculateJointCombos(matrix1H, matrix2H, type) {
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
            results = [
                { label: "1X & 1-2 I & 1-2 II", check: (h1, a1, h2, a2, hFT, aFT) => (hFT >= aFT) && (h1 + a1 >= 1 && h1 + a1 <= 2) && (h2 + a2 >= 1 && h2 + a2 <= 2) },
                { label: "X2 & 1-2 I & 1-2 II", check: (h1, a1, h2, a2, hFT, aFT) => (aFT >= hFT) && (h1 + a1 >= 1 && h1 + a1 <= 2) && (h2 + a2 >= 1 && h2 + a2 <= 2) },
                { label: "1X & 1-3 I & 1-3 II", check: (h1, a1, h2, a2, hFT, aFT) => (hFT >= aFT) && (h1 + a1 >= 1 && h1 + a1 <= 3) && (h2 + a2 >= 1 && h2 + a2 <= 3) },
                { label: "X2 & 1-3 I & 1-3 II", check: (h1, a1, h2, a2, hFT, aFT) => (aFT >= hFT) && (h1 + a1 >= 1 && h1 + a1 <= 3) && (h2 + a2 >= 1 && h2 + a2 <= 3) },
                { label: "1X & I2+ & 4+", check: (h1, a1, h2, a2, hFT, aFT) => (hFT >= aFT) && (h1 + a1 >= 2) && (hFT + aFT >= 4) },
                { label: "X2 & I2+ & 4+", check: (h1, a1, h2, a2, hFT, aFT) => (aFT >= hFT) && (h1 + a1 >= 2) && (hFT + aFT >= 4) }
            ];
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

    document.getElementById('drawComboTable').innerHTML = calculateJointCombos(matrixFH, matrixSH, 'draw');
    document.getElementById('dcComboTable').innerHTML = calculateJointCombos(matrixFH, matrixSH, 'dc');
    document.getElementById('htftComboTable').innerHTML = calculateJointCombos(matrixFH, matrixSH, 'htft');

    // Update Win Combos with the new 1-2 1-2 market
    function updateWinCombosExtra(matrix1H, matrix2H, isHome) {
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

    document.getElementById('homeWinComboTable').innerHTML = calculateWinCombos(matrixFH, matrixSH, true);
    document.getElementById('awayWinComboTable').innerHTML = calculateWinCombos(matrixFH, matrixSH, false);

    document.getElementById('homeWinComboTable').innerHTML += updateWinCombosExtra(matrixFH, matrixSH, true);
    document.getElementById('awayWinComboTable').innerHTML += updateWinCombosExtra(matrixFH, matrixSH, false);

    // ADDED: Team Goals Combinations (T1/T2)
    function calculateTeamGoalCombos(matrixFH, matrixSH, isHome) {
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

    document.getElementById('homeGoalComboTable').innerHTML = calculateTeamGoalCombos(matrixFH, matrixSH, true);
    document.getElementById('awayGoalComboTable').innerHTML = calculateTeamGoalCombos(matrixFH, matrixSH, false);
}

// Run on Page Load
window.onload = runModel;
