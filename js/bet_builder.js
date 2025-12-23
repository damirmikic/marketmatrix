
// State to hold active legs
let activeLegs = [];
let currentMatrix = [];

// Helper to convert probability to odds
function probToOdds(p) {
    if (p <= 0) return "---";
    return (1 / p).toFixed(2);
}

// 1. Core Logic: Check if a score (h, a) satisfies a specific condition
function checkLeg(h, a, leg) {
    switch (leg.type) {
        case '1x2':
            if (leg.value === '1') return h > a;
            if (leg.value === 'X') return h === a;
            if (leg.value === '2') return a > h;
            break;
        case 'dc':
            if (leg.value === '1X') return h >= a;
            if (leg.value === '12') return h !== a;
            if (leg.value === 'X2') return a >= h;
            break;
        case 'ou':
            const total = h + a;
            if (leg.side === 'over') return total > parseFloat(leg.line); // Strict (> 2.5)
            if (leg.side === 'under') return total < parseFloat(leg.line);
            break;
        case 'btts':
            const bothScore = (h > 0 && a > 0);
            return leg.value === 'yes' ? bothScore : !bothScore;
            break;
        case 'team_ou':
            const score = leg.team === 'home' ? h : a;
            if (leg.side === 'over') return score > parseFloat(leg.line);
            if (leg.side === 'under') return score < parseFloat(leg.line);
            break;
        case 'exact_score':
            return h === parseInt(leg.hScore) && a === parseInt(leg.aScore);
            break;
    }
    return false;
}

// 2. Calculate Combined Probability
function recalculateBuilder() {
    if (!currentMatrix || currentMatrix.length === 0) return;
    if (activeLegs.length === 0) {
        document.getElementById('bbOdds').textContent = "-";
        document.getElementById('bbProb').textContent = "-";
        return;
    }

    let combinedProb = 0;
    // Iterate over the matrix
    for (let h = 0; h < currentMatrix.length; h++) {
        if (!currentMatrix[h]) continue;
        for (let a = 0; a < currentMatrix[h].length; a++) {
            let valid = true;
            for (const leg of activeLegs) {
                if (!checkLeg(h, a, leg)) {
                    valid = false;
                    break;
                }
            }
            if (valid) {
                combinedProb += currentMatrix[h][a];
            }
        }
    }

    // Update UI
    document.getElementById('bbProb').textContent = (combinedProb * 100).toFixed(2) + "%";
    document.getElementById('bbOdds').textContent = probToOdds(combinedProb);
}

// 3. UI Helper: Render the list of legs
function renderLegs() {
    const listEl = document.getElementById('bbLegsList');
    listEl.innerHTML = '';

    activeLegs.forEach((leg, idx) => {
        const div = document.createElement('div');
        div.className = 'bb-leg-item';
        div.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: #334155; padding: 8px; border-radius: 6px; margin-bottom: 6px; font-size: 0.9rem;";

        let text = formatLegText(leg);

        div.innerHTML = `
            <span>${text}</span>
            <button onclick="removeLeg(${idx})" style="background: transparent; border: none; color: #f87171; cursor: pointer; font-weight: bold;">✕</button>
        `;
        listEl.appendChild(div);
    });

    recalculateBuilder();
}

function formatLegText(leg) {
    if (leg.type === '1x2') return `Match Result: ${leg.name}`;
    if (leg.type === 'dc') return `Double Chance: ${leg.name}`;
    if (leg.type === 'ou') return `Total Goals: ${leg.side.charAt(0).toUpperCase() + leg.side.slice(1)} ${leg.line}`;
    if (leg.type === 'btts') return `BTTS: ${leg.value === 'yes' ? 'Yes' : 'No'}`;
    if (leg.type === 'team_ou') return `${leg.team === 'home' ? 'Home' : 'Away'} Goals: ${leg.side === 'over' ? 'Over' : 'Under'} ${leg.line}`;
    return 'Unknown Leg';
}

// 4. Exposed Functions

// Create a Convolved FT Matrix from FH and SH to match the "Win Combinations" logic
export function updateBuilderMatrices(matrixFH, matrixSH) {
    // Initialize 20x20 matrix (0-19 goals) - safe upper bound
    // markets.js uses loops up to 7, so total 14. 20 is safe.
    let ftMatrix = Array(20).fill(null).map(() => Array(20).fill(0));

    // Limit convolution to reasonable bounds to match markets.js (7 per half)
    // markets.js iterates h1<=7, a1<=7, h2<=7, a2<=7
    // This allows max 14 goals.
    const MAX_HALF_GOALS = 7;

    for (let h1 = 0; h1 <= MAX_HALF_GOALS; h1++) {
        for (let a1 = 0; a1 <= MAX_HALF_GOALS; a1++) {
            let p1 = matrixFH[h1][a1];
            if (p1 === 0) continue;

            for (let h2 = 0; h2 <= MAX_HALF_GOALS; h2++) {
                for (let a2 = 0; a2 <= MAX_HALF_GOALS; a2++) {
                    let p2 = matrixSH[h2][a2];
                    if (p2 === 0) continue;

                    let hFT = h1 + h2;
                    let aFT = a1 + a2;

                    if (hFT < 20 && aFT < 20) {
                        ftMatrix[hFT][aFT] += (p1 * p2);
                    }
                }
            }
        }
    }

    currentMatrix = ftMatrix;
    recalculateBuilder();
}

// Add a leg from the UI
export function addLeg() {
    const type = document.getElementById('bbMarketSelect').value;
    const lineVal = document.getElementById('goalLine').value; // Use the main input line for ease, or add specific inputs

    let newLeg = null;

    if (type === '1') newLeg = { type: '1x2', value: '1', name: 'Home' };
    else if (type === 'X') newLeg = { type: '1x2', value: 'X', name: 'Draw' };
    else if (type === '2') newLeg = { type: '1x2', value: '2', name: 'Away' };
    else if (type === '1X') newLeg = { type: 'dc', value: '1X', name: '1X' };
    else if (type === '12') newLeg = { type: 'dc', value: '12', name: '12' };
    else if (type === 'X2') newLeg = { type: 'dc', value: 'X2', name: 'X2' };
    else if (type === 'O25') {
        const line = prompt("Enter Goal Line (e.g. 2.5):", "2.5");
        if (line) newLeg = { type: 'ou', side: 'over', line: parseFloat(line) };
    }
    else if (type === 'U25') {
        const line = prompt("Enter Goal Line (e.g. 2.5):", "2.5");
        if (line) newLeg = { type: 'ou', side: 'under', line: parseFloat(line) };
    }
    else if (type === 'BTTS_Y') newLeg = { type: 'btts', value: 'yes' };
    else if (type === 'BTTS_N') newLeg = { type: 'btts', value: 'no' };

    if (newLeg) {
        activeLegs.push(newLeg);
        renderLegs();
    }
}

// Make removeLeg global so HTML onclick can find it
window.removeLeg = function (idx) {
    activeLegs.splice(idx, 1);
    renderLegs();
};

window.addBbLeg = addLeg;
