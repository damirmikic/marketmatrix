// --- CONSTANTS AND STATE ---
const MAX_GOALS_DISPLAY = 5; // Display 0-5 goals in tables
const MAX_GOALS_CALC = 12;   // Calculate 0-12 goals for accuracy
const MAX_GOALS_SOLVER = 18; // Use a deeper range when reconciling market inputs
const RATIO_1H = 0.45;
const RATIO_2H = 0.55;
const INPUT_MODES = {
    SUPREMACY: 'supremacy',
    MARKET: 'market'
};

// Global state for calculations
let lambdas = {};
let matrix1H = [];
let matrix2H = [];
let isModelReady = false;
let inputMode = INPUT_MODES.SUPREMACY;

// Pre-calculate factorials for performance
const FACTORIALS = (function(n) {
    let cache = [1];
    for (let i = 1; i <= n; i++) {
        cache[i] = cache[i - 1] * i;
    }
    return cache;
})(60); // Cache a generous range for Poisson calculations

// --- DOM ELEMENTS ---
const supremacyInput = document.getElementById('supremacy');
const expectancyInput = document.getElementById('expectancy');
const homeOddsInput = document.getElementById('odds-home');
const drawOddsInput = document.getElementById('odds-draw');
const awayOddsInput = document.getElementById('odds-away');
const totalLineInput = document.getElementById('total-line');
const overOddsInput = document.getElementById('odds-over');
const underOddsInput = document.getElementById('odds-under');
const calcButton = document.getElementById('calc-button');
const inputModeToggle = document.getElementById('input-mode-toggle');
const inputSupremacyContainer = document.getElementById('input-supremacy');
const inputMarketContainer = document.getElementById('input-market');
const inputInfoSup = document.getElementById('input-info-sup');
const inputInfoMarket = document.getElementById('input-info-market');
const errorMessage = document.getElementById('error-message');
const outputSection = document.getElementById('output-section');

// Chatbot
const chatWindow = document.getElementById('chat-window');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const loadingIndicator = document.getElementById('loading-indicator');

// Tabs
const tabBtnBot = document.getElementById('tab-btn-bot');
const tabBtnMarkets = document.getElementById('tab-btn-markets');
const tabContentBot = document.getElementById('tab-content-bot');
const tabContentMarkets = document.getElementById('tab-content-markets');

// Markets
const calcMarketsButton = document.getElementById('calc-markets-button');
const marketTables = {
    '1x2': document.getElementById('market-1x2'),
    'dc': document.getElementById('market-dc'),
    'dnb': document.getElementById('market-dnb'),
    'btts': document.getElementById('market-btts'),
    'totals': document.getElementById('market-totals'),
    'htft': document.getElementById('market-htft'),
    'ah': document.getElementById('market-ah'),
};

// --- HELPER FUNCTIONS ---

/**
 * Calculates the Poisson probability.
 * P(k) = (lambda^k * e^(-lambda)) / k!
 */
function poisson(lambda, k) {
    if (lambda < 0 || k < 0) return 0;
    if (k >= FACTORIALS.length) {
        // Handle large k by approximation or return 0
        return 0; 
    }
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / FACTORIALS[k];
}

/**
 * Generates a correct score probability matrix.
 */
function createCSMatrix(lambdaH, lambdaA, maxGoals) {
    let matrix = [];
    let poissonH = [];
    let poissonA = [];

    // Cache poisson probabilities for H and A
    for (let k = 0; k <= maxGoals; k++) {
        poissonH[k] = poisson(lambdaH, k);
        poissonA[k] = poisson(lambdaA, k);
    }

    for (let h = 0; h <= maxGoals; h++) {
        matrix[h] = [];
        for (let a = 0; a <= maxGoals; a++) {
            matrix[h][a] = poissonH[h] * poissonA[a];
        }
    }
    return matrix;
}

function estimateOutcomeProbabilities(lambdaH, lambdaA, limit = MAX_GOALS_SOLVER) {
    const total = lambdaH + lambdaA;
    const workingLimit = Math.max(limit, Math.ceil(total + 8));
    const matrix = createCSMatrix(lambdaH, lambdaA, workingLimit);
    let probHome = 0;
    let probDraw = 0;
    let probAway = 0;

    for (let h = 0; h <= workingLimit; h++) {
        for (let a = 0; a <= workingLimit; a++) {
            const prob = matrix[h][a];
            if (!prob) continue;
            if (h > a) {
                probHome += prob;
            } else if (h === a) {
                probDraw += prob;
            } else {
                probAway += prob;
            }
        }
    }

    const sum = probHome + probDraw + probAway;
    if (sum > 0) {
        probHome /= sum;
        probDraw /= sum;
        probAway /= sum;
    }

    return { probHome, probDraw, probAway };
}

function deriveLambdasFrom1X2(totalGoals, targetProbs) {
    const tolerance = 0.0015;

    if (totalGoals <= 0) {
        return null;
    }

    if (totalGoals <= 2e-6) {
        const lambda = Math.max(totalGoals / 2, 1e-9);
        return { lambdaH: lambda, lambdaA: lambda, error: 0 };
    }

    const evaluate = (lambdaH) => {
        const lambdaA = Math.max(1e-9, totalGoals - lambdaH);
        const { probHome, probDraw, probAway } = estimateOutcomeProbabilities(lambdaH, lambdaA);
        const error =
            Math.pow(probHome - targetProbs.home, 2) +
            Math.pow(probDraw - targetProbs.draw, 2) +
            Math.pow(probAway - targetProbs.away, 2);
        return { lambdaH, lambdaA, error };
    };

    let low = 1e-9;
    let high = Math.max(totalGoals - 1e-9, 1e-9);
    if (high <= low) {
        high = Math.max(totalGoals, 1e-6);
        low = Math.min(low, high * 0.001);
    }
    const goldenRatio = (Math.sqrt(5) - 1) / 2;

    let x1 = high - goldenRatio * (high - low);
    let x2 = low + goldenRatio * (high - low);
    let f1 = evaluate(x1);
    let f2 = evaluate(x2);
    let best = f1.error < f2.error ? f1 : f2;

    for (let i = 0; i < 80; i++) {
        if (f1.error > f2.error) {
            low = x1;
            x1 = x2;
            f1 = f2;
            x2 = low + goldenRatio * (high - low);
            f2 = evaluate(x2);
        } else {
            high = x2;
            x2 = x1;
            f2 = f1;
            x1 = high - goldenRatio * (high - low);
            f1 = evaluate(x1);
        }

        if (f1.error < best.error) best = f1;
        if (f2.error < best.error) best = f2;
    }

    const lowEval = evaluate(low);
    if (lowEval.error < best.error) best = lowEval;
    const highEval = evaluate(high);
    if (highEval.error < best.error) best = highEval;

    if (!best || best.error > tolerance) {
        return null;
    }

    return best;
}

function poissonCDF(lambda, k) {
    if (k < 0) return 0;
    let sum = 0;
    for (let i = 0; i <= k; i++) {
        sum += poisson(lambda, i);
    }
    return sum;
}

function computeWinLossPush(lambdaTotal, line) {
    const floorValue = Math.floor(line + 1e-9);
    const diffToHalf = Math.abs(line - (floorValue + 0.5));
    const diffToWhole = Math.abs(line - floorValue);

    let win;
    let push;

    if (diffToHalf < 1e-6) {
        // Half goal line: no push possibility
        win = 1 - poissonCDF(lambdaTotal, floorValue);
        push = 0;
    } else if (diffToWhole < 1e-6) {
        // Whole number line: push when total equals the line
        win = 1 - poissonCDF(lambdaTotal, floorValue);
        push = poisson(lambdaTotal, floorValue);
    } else {
        // Fallback for unusual values
        const threshold = Math.floor(line + 1e-9);
        win = 1 - poissonCDF(lambdaTotal, threshold);
        push = 0;
    }

    const loss = Math.max(0, 1 - win - push);
    return { win, loss, push };
}

function probabilityTotalOver(lambdaTotal, line) {
    if (line < 0) {
        return 1; // Anything above a negative line is always over
    }

    const normalizedLine = Math.round(line * 4) / 4;
    const diff = Math.abs(normalizedLine - line);
    const remainder = ((Math.round(normalizedLine * 4) % 4) + 4) % 4;

    if (diff > 1e-6) {
        const stats = computeWinLossPush(lambdaTotal, line);
        const total = stats.win + stats.loss;
        return total <= 0 ? 0 : stats.win / total;
    }

    if (remainder === 1 || remainder === 3) {
        // Quarter lines: treat as split stakes on adjacent lines
        const lower = normalizedLine - 0.25;
        const upper = normalizedLine + 0.25;
        const lowStats = computeWinLossPush(lambdaTotal, lower);
        const highStats = computeWinLossPush(lambdaTotal, upper);

        const win = lowStats.win + highStats.win;
        const loss = lowStats.loss + highStats.loss;
        const total = win + loss;
        return total <= 0 ? 0 : win / total;
    }

    const stats = computeWinLossPush(lambdaTotal, normalizedLine);
    const total = stats.win + stats.loss;
    return total <= 0 ? 0 : stats.win / total;
}

function solveTotalGoalsFromOdds(line, targetOver) {
    const tolerance = 0.0005;
    if (targetOver <= 0 || targetOver >= 1) {
        return null;
    }

    let low = 0.01;
    let high = 10;
    let lowProb = probabilityTotalOver(low, line);
    let highProb = probabilityTotalOver(high, line);

    // Expand the search range if needed to bracket the solution
    let guard = 0;
    while (highProb < targetOver - tolerance && high < 25 && guard < 20) {
        high *= 1.5;
        highProb = probabilityTotalOver(high, line);
        guard++;
    }

    guard = 0;
    while (lowProb > targetOver + tolerance && low > 1e-6 && guard < 20) {
        low *= 0.5;
        lowProb = probabilityTotalOver(low, line);
        guard++;
    }

    if (lowProb > targetOver || highProb < targetOver) {
        return null;
    }

    for (let i = 0; i < 60; i++) {
        const mid = (low + high) / 2;
        const midProb = probabilityTotalOver(mid, line);

        if (Math.abs(midProb - targetOver) < tolerance) {
            return mid;
        }

        if (midProb < targetOver) {
            low = mid;
        } else {
            high = mid;
        }
    }

    return (low + high) / 2;
}

/**
 * Renders a CS matrix into a <table> element.
 */
function displayMatrix(tableElement, matrix, maxGoals) {
    let html = '<thead><tr><th class="corner">H\\A</th>';
    for (let a = 0; a <= maxGoals; a++) {
        html += `<th>${a}</th>`;
    }
    html += '</tr></thead><tbody>';

    for (let h = 0; h <= maxGoals; h++) {
        html += `<tr><th class="header-col">${h}</th>`;
        for (let a = 0; a <= maxGoals; a++) {
            const prob = (matrix[h] && matrix[h][a]) ? matrix[h][a] * 100 : 0;
            html += `<td title="Score ${h}-${a}: ${prob.toFixed(4)}%">${prob.toFixed(2)}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody>';
    tableElement.innerHTML = html;
}

/**
 * Adds a message to the chat window and scrolls down.
 */
function addChatMessage(message, type) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${type === 'user' ? 'chat-user' : 'chat-bot'}`;
    // Sanitize message text
    bubble.textContent = message; 
    chatWindow.appendChild(bubble);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

/**
 * Formats probability and odds for tables.
 */
function formatResult(prob) {
    if (prob <= 1e-9) prob = 1e-9;
    const probPercent = (prob * 100).toFixed(2);
    const odds = (1 / prob).toFixed(2);
    return { prob, probPercent, odds };
}

/**
 * Creates a loading row for a table.
 */
function getLoadingRow(cols) {
    return `<tr><td colspan="${cols}" class="text-center p-4">
                <div class="flex items-center justify-center">
                    <div class="loading-spinner loading-spinner-small mr-2"></div>
                    Calculating...
                </div>
            </td></tr>`;
}

// --- CORE LOGIC ---

/**
 * Main function to calculate all values from inputs.
 */
function handleCalculate() {
    hideError();

    let HxG_FT;
    let AxG_FT;

    if (inputMode === INPUT_MODES.SUPREMACY) {
        const S = parseFloat(supremacyInput.value);
        const E = parseFloat(expectancyInput.value);

        if (isNaN(S) || isNaN(E)) {
            showError("Please enter valid numbers for Supremacy and Expectancy.");
            return;
        }
        if (E <= 0) {
            showError("Expectancy (E) must be a positive number.");
            return;
        }
        if (Math.abs(S) > E) {
            showError("Absolute value of Supremacy (|S|) cannot be greater than Expectancy (E).");
            return;
        }

        HxG_FT = (E - S) / 2; // User requested: Negative S = Home favorite
        AxG_FT = (E + S) / 2; // User requested: Negative S = Home favorite
    } else {
        const oddsHome = parseFloat(homeOddsInput.value);
        const oddsDraw = parseFloat(drawOddsInput.value);
        const oddsAway = parseFloat(awayOddsInput.value);
        const totalLine = parseFloat(totalLineInput.value);
        const oddsOver = parseFloat(overOddsInput.value);
        const oddsUnder = parseFloat(underOddsInput.value);

        if ([oddsHome, oddsDraw, oddsAway, totalLine, oddsOver, oddsUnder].some(v => isNaN(v))) {
            showError("Please enter valid 1X2 odds, a total goals line, and over/under odds.");
            return;
        }
        if ([oddsHome, oddsDraw, oddsAway, oddsOver, oddsUnder].some(v => v <= 1)) {
            showError("All odds must be greater than 1.00.");
            return;
        }

        const impliedHome = 1 / oddsHome;
        const impliedDraw = 1 / oddsDraw;
        const impliedAway = 1 / oddsAway;
        const impliedSum = impliedHome + impliedDraw + impliedAway;

        if (impliedSum <= 0) {
            showError("Unable to derive probabilities from the provided 1X2 odds.");
            return;
        }

        const normalized1x2 = {
            home: impliedHome / impliedSum,
            draw: impliedDraw / impliedSum,
            away: impliedAway / impliedSum
        };

        if (totalLine < 0) {
            showError("Total goals line must be zero or higher.");
            return;
        }

        const impliedOver = 1 / oddsOver;
        const impliedUnder = 1 / oddsUnder;
        const impliedTotalsSum = impliedOver + impliedUnder;

        if (impliedTotalsSum <= 0) {
            showError("Unable to derive probabilities from the provided total goals odds.");
            return;
        }

        const normalizedOver = impliedOver / impliedTotalsSum;
        const totalGoals = solveTotalGoalsFromOdds(totalLine, normalizedOver);

        if (!totalGoals || totalGoals <= 0) {
            showError("Unable to reconcile the total goals odds with the selected line.");
            return;
        }

        const solved = deriveLambdasFrom1X2(totalGoals, normalized1x2);
        if (!solved) {
            showError("Unable to reconcile the 1X2 odds with the total goals market.");
            return;
        }

        HxG_FT = solved.lambdaH;
        AxG_FT = solved.lambdaA;

        supremacyInput.value = (AxG_FT - HxG_FT).toFixed(2);
        expectancyInput.value = (HxG_FT + AxG_FT).toFixed(2);
    }

    // Step 2: Calculate Half-Time Lambdas
    const HxG_1H = HxG_FT * RATIO_1H;
    const AxG_1H = AxG_FT * RATIO_1H;
    const HxG_2H = HxG_FT * RATIO_2H;
    const AxG_2H = AxG_FT * RATIO_2H;

    lambdas = { HxG_FT, AxG_FT, HxG_1H, AxG_1H, HxG_2H, AxG_2H };

    // Step 3: Create Probability Matrices
    matrix1H = createCSMatrix(HxG_1H, AxG_1H, MAX_GOALS_CALC);
    matrix2H = createCSMatrix(HxG_2H, AxG_2H, MAX_GOALS_CALC);

    // Step 4: Display Results
    document.getElementById('ft-hxg').textContent = HxG_FT.toFixed(3);
    document.getElementById('ft-axg').textContent = AxG_FT.toFixed(3);
    document.getElementById('h1-hxg').textContent = HxG_1H.toFixed(3);
    document.getElementById('h1-axg').textContent = AxG_1H.toFixed(3);
    document.getElementById('h2-hxg').textContent = HxG_2H.toFixed(3);
    document.getElementById('h2-axg').textContent = AxG_2H.toFixed(3);

    displayMatrix(document.getElementById('matrix-1h'), matrix1H, MAX_GOALS_DISPLAY);
    displayMatrix(document.getElementById('matrix-2h'), matrix2H, MAX_GOALS_DISPLAY);

    outputSection.classList.remove('hidden');
    isModelReady = true;
    addChatMessage("Model calculated. Ready for queries. Try '1X', 'o2.5', or check the 'All Markets' tab.", 'bot');

    // Clear previous market results
    for (const key in marketTables) {
        marketTables[key].innerHTML = '';
    }
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
}

function hideError() {
    errorMessage.classList.add('hidden');
}

function setInputMode(mode) {
    inputMode = mode;
    if (mode === INPUT_MODES.SUPREMACY) {
        inputSupremacyContainer.classList.remove('hidden');
        inputMarketContainer.classList.add('hidden');
        inputInfoSup.classList.remove('hidden');
        inputInfoMarket.classList.add('hidden');
        inputModeToggle.textContent = 'Use 1X2 Inputs';
    } else {
        inputSupremacyContainer.classList.add('hidden');
        inputMarketContainer.classList.remove('hidden');
        inputInfoSup.classList.add('hidden');
        inputInfoMarket.classList.remove('hidden');
        inputModeToggle.textContent = 'Use Supremacy Inputs';
    }
    hideError();
}

// --- TABBING LOGIC ---
function switchTab(activeBtn, activeContent) {
    [tabBtnBot, tabBtnMarkets].forEach(btn => btn.classList.remove('active'));
    [tabContentBot, tabContentMarkets].forEach(content => content.classList.remove('active'));
    activeBtn.classList.add('active');
    activeContent.classList.add('active');
}

// --- CENTRAL CALCULATION ENGINE ---

/**
 * NEW: Central calculation engine.
 * Iterates over all score combinations and returns the probability
 * for a given set of conditions.
 * @param {object} conditions - The market conditions to check.
 * @returns {number} The calculated probability (0.0 to 1.0).
 */
function calculateMarket(conditions) {
    const normalizedConditions = {
        ft_result: null,    ft_total: null,     ft_btts: null,      ft_cs: null,
        h1_result: null,    h1_total: null,     h1_btts: null,      h1_cs: null,
        h2_result: null,    h2_total: null,     h2_btts: null,      h2_cs: null,
        ...conditions
    };

    let totalProbability = 0;
    const limit = MAX_GOALS_CALC;

    for (let h1 = 0; h1 <= limit; h1++) {
        for (let a1 = 0; a1 <= limit; a1++) {
            const prob1H = matrix1H[h1][a1];
            if (prob1H === 0) continue; 

            for (let h2 = 0; h2 <= limit; h2++) {
                for (let a2 = 0; a2 <= limit; a2++) {
                    const prob2H = matrix2H[h2][a2];
                    if (prob2H === 0) continue; 

                    const eventProbability = prob1H * prob2H;
                    if (eventProbability === 0) continue;

                    if (checkConditions(h1, a1, h2, a2, normalizedConditions)) {
                        totalProbability += eventProbability;
                    }
                }
            }
        }
    }
    return totalProbability;
}

/**
 * Calculates AH markets, which can result in a "push" (stake refund).
 * @returns {object} { homeWin, push, awayWin }
 */
function calculateAsianHandicap(homeHandicap) {
    let homeWin = 0;
    let push = 0;
    let awayWin = 0;
    const limit = MAX_GOALS_CALC;

    for (let h1 = 0; h1 <= limit; h1++) {
        for (let a1 = 0; a1 <= limit; a1++) {
            const prob1H = matrix1H[h1][a1];
            if (prob1H === 0) continue;

            for (let h2 = 0; h2 <= limit; h2++) {
                for (let a2 = 0; a2 <= limit; a2++) {
                    const prob2H = matrix2H[h2][a2];
                    if (prob2H === 0) continue;

                    const ft_h = h1 + h2;
                    const ft_a = a1 + a2;
                    const eventProbability = prob1H * prob2H;

                    const margin = ft_h + homeHandicap - ft_a;

                    if (margin > 0.01) { // Home win
                        homeWin += eventProbability;
                    } else if (margin < -0.01) { // Away win
                        awayWin += eventProbability;
                    } else { // Push
                        push += eventProbability;
                    }
                }
            }
        }
    }
    return { homeWin, push, awayWin };
}


/**
 * Checks if a specific scoreline combination matches the parsed query.
 * @returns {boolean} True if all conditions are met.
 */
function checkConditions(h1, a1, h2, a2, conditions) {
    // --- 1H Checks ---
    if (conditions.h1_result) {
        if (conditions.h1_result === '1' && !(h1 > a1)) return false;
        if (conditions.h1_result === 'X' && !(h1 === a1)) return false;
        if (conditions.h1_result === '2' && !(h1 < a1)) return false;
        if (conditions.h1_result === '1X' && !(h1 >= a1)) return false;
        if (conditions.h1_result === '12' && !(h1 !== a1)) return false;
        if (conditions.h1_result === 'X2' && !(h1 <= a1)) return false;
    }
    if (conditions.h1_total) {
        const total = h1 + a1;
        const { type, value } = conditions.h1_total;
        if (type === 'o' && !(total > value)) return false;
        if (type === 'u' && !(total < value)) return false;
        if (type === '=' && !(total === value)) return false;
    }
    if (conditions.h1_btts !== null) {
        const btts = (h1 > 0 && a1 > 0);
        if (conditions.h1_btts !== btts) return false;
    }
    if (conditions.h1_cs) {
        if (conditions.h1_cs.h !== h1 || conditions.h1_cs.a !== a1) return false;
    }

    // --- 2H Checks ---
    if (conditions.h2_result) {
        if (conditions.h2_result === '1' && !(h2 > a2)) return false;
        if (conditions.h2_result === 'X' && !(h2 === a2)) return false;
        if (conditions.h2_result === '2' && !(h2 < a2)) return false;
        if (conditions.h2_result === '1X' && !(h2 >= a2)) return false;
        if (conditions.h2_result === '12' && !(h2 !== a2)) return false;
        if (conditions.h2_result === 'X2' && !(h2 <= a2)) return false;
    }
    if (conditions.h2_total) {
        const total = h2 + a2;
        const { type, value } = conditions.h2_total;
        if (type === 'o' && !(total > value)) return false;
        if (type === 'u' && !(total < value)) return false;
        if (type === '=' && !(total === value)) return false;
    }

    // --- FT Checks ---
    const ft_h = h1 + h2;
    const ft_a = a1 + a2;

    if (conditions.ft_result) {
        if (conditions.ft_result === '1' && !(ft_h > ft_a)) return false;
        if (conditions.ft_result === 'X' && !(ft_h === ft_a)) return false;
        if (conditions.ft_result === '2' && !(ft_h < ft_a)) return false;
        if (conditions.ft_result === '1X' && !(ft_h >= ft_a)) return false;
        if (conditions.ft_result === '12' && !(ft_h !== ft_a)) return false;
        if (conditions.ft_result === 'X2' && !(ft_h <= ft_a)) return false;
    }
    if (conditions.ft_total) {
        const total = ft_h + ft_a;
        const { type, value } = conditions.ft_total;
        if (type === 'o' && !(total > value)) return false;
        if (type === 'u' && !(total < value)) return false;
        if (type === '=' && !(total === value)) return false;
    }
    if (conditions.ft_btts !== null) {
        const btts = (ft_h > 0 && ft_a > 0);
        if (conditions.ft_btts !== btts) return false;
    }
    if (conditions.ft_cs) {
        if (conditions.ft_cs.h !== ft_h || conditions.ft_cs.a !== ft_a) return false;
    }

    // If we got here, all conditions passed
    return true;
}

// --- CHATBOT LOGIC (NOW REFACTORED) ---

function handleChatSubmit() {
    const query = chatInput.value.trim();
    if (!query) return;

    if (!isModelReady) {
        addChatMessage("Please calculate the model first before asking questions.", 'bot');
        return;
    }

    addChatMessage(query, 'user');
    chatInput.value = '';
    loadingIndicator.classList.remove('hidden');
    loadingIndicator.classList.add('flex');

    // Use setTimeout to allow UI to update
    setTimeout(() => {
        try {
            const { conditions, marketName, warnings } = parseChatQuery(query);
            const probability = calculateMarket(conditions);
            const { probPercent, odds } = formatResult(probability);

            let response = `Market: ${marketName}\nProbability: ${probPercent}%\nFair Odds: ${odds}`;
            if (warnings.length > 0) {
                response += `\n\nNote: ${warnings.join(', ')}`;
            }
            addChatMessage(response, 'bot');
        } catch (e) {
            addChatMessage(`Sorry, I couldn't understand that query. Error: ${e.message}`, 'bot');
            console.error(e);
        }
        loadingIndicator.classList.add('hidden');
        loadingIndicator.classList.remove('flex');
    }, 50); // Short delay
}

/**
 * REFACTORED: This function *only* parses text into a conditions object.
 * @param {string} text - The user's query.
 * @returns {object} { conditions, marketName, warnings }
 */
function parseChatQuery(text) {
    let query = text.toLowerCase().replace(/\s+/g, ' ');

    if (query.includes('margin')) {
         throw new Error(`I only calculate fair odds (100% payout). I cannot apply margins.`);
    }

     // --- Pre-format common spaceless inputs ---
    query = query.replace(/^(o|u|over|under)(\d+(\.\d+)?)/, '$1 $2');
    query = query.replace(/^(cs)(\d+-\d+)$/, '$1 $2');
    query = query.replace(/^(1h|1 half|i half) (o|u|over|under)(\d+(\.\d+)?)$/, '$1 $2 $3');
    query = query.replace(/^(1h|1 half|i half) (cs)(\d+-\d+)$/, '$1 $2 $3');

    const parts = query.split(/ and | & /);
    let marketName = [];
    let warnings = [];

    // Parsed conditions
    let conditions = {
        ft_result: null,    ft_total: null,     ft_btts: null,      ft_cs: null,
        h1_result: null,    h1_total: null,     h1_btts: null,      h1_cs: null,
        h2_result: null,    h2_total: null,     h2_btts: null,      h2_cs: null,
    };

    // --- Parser ---
    for (const part of parts) {
        let partText = part.trim();
        let matched = false;

        // --- Full Time (FT) Parsers ---
        if (!matched && /^(ft )?(1x|x2|12|1|x|2)$/.test(partText)) {
            let result = partText.replace('ft ', '');
            conditions.ft_result = result.toUpperCase();
            marketName.push(`FT ${conditions.ft_result}`);
            matched = true;
        }
        if (!matched && /^(ft )?(o|u|over|under) \d+(\.\d+)?$/.test(partText)) {
            const match = partText.match(/(\d+(\.\d+)?)/);
            const type = partText.includes('u') ? 'u' : 'o';
            const value = parseFloat(match[0]);
            conditions.ft_total = { type, value };
            marketName.push(`FT ${type.toUpperCase()}${value}`);
            matched = true;
        }
        if (!matched && /^(ft )?btts (yes|no)$/.test(partText)) {
            conditions.ft_btts = partText.endsWith('yes');
            marketName.push(`FT BTTS ${conditions.ft_btts ? 'Yes' : 'No'}`);
            matched = true;
        }
        if (!matched && /^(ft )?cs \d+-\d+$/.test(partText)) {
            const match = partText.match(/(\d+)-(\d+)/);
            conditions.ft_cs = { h: parseInt(match[1]), a: parseInt(match[2]) };
            marketName.push(`FT CS ${match[1]}-${match[2]}`);
            matched = true;
        }

        // --- 1st Half (1H) Parsers ---
        if (!matched && /^(1h|1 half|i half) (1x|x2|12|1|x|2)$/.test(partText)) {
            conditions.h1_result = partText.replace(/^(1h|1 half|i half) /, '').toUpperCase();
            marketName.push(`1H ${conditions.h1_result}`);
            matched = true;
        }
        if (!matched && /^(1h|1 half|i half) (o|u|over|under) \d+(\.\d+)?$/.test(partText)) {
            const match = partText.match(/(\d+(\.\d+)?)/);
            const type = partText.includes('u') ? 'u' : 'o';
            const value = parseFloat(match[0]);
            conditions.h1_total = { type, value };
            marketName.push(`1H ${type.toUpperCase()}${value}`);
            matched = true;
        }
        if (!matched && /^(1h|1 half|i half) btts (yes|no)$/.test(partText)) {
            conditions.h1_btts = partText.endsWith('yes');
            marketName.push(`1H BTTS ${conditions.h1_btts ? 'Yes' : 'No'}`);
            matched = true;
        }
        if (!matched && /^(1h|1 half|i half) cs \d+-\d+$/.test(partText)) {
            const match = partText.match(/(\d+)-(\d+)/);
            conditions.h1_cs = { h: parseInt(match[1]), a: parseInt(match[2]) };
            marketName.push(`1H CS ${match[1]}-${match[2]}`);
            matched = true;
        }

        // --- 2nd Half (2H) Parsers (similar to 1H) ---
        if (!matched && /^(2h|2 half|ii half) (1x|x2|12|1|x|2)$/.test(partText)) {
            conditions.h2_result = partText.replace(/^(2h|2 half|ii half) /, '').toUpperCase();
            marketName.push(`2H ${conditions.h2_result}`);
            matched = true;
        }
        if (!matched && /^(2h|2 half|ii half) (o|u|over|under) \d+(\.\d+)?$/.test(partText)) {
            const match = partText.match(/(\d+(\.\d+)?)/);
            const type = partText.includes('u') ? 'u' : 'o';
            const value = parseFloat(match[0]);
            conditions.h2_total = { type, value };
            marketName.push(`2H ${type.toUpperCase()}${value}`);
            matched = true;
        }

        if (!matched) {
            throw new Error(`Could not parse: "${part}"`);
        }
    }

    return {
        conditions,
        marketName: marketName.join(' & '),
        warnings: warnings
    };
}

// --- "ALL MARKETS" TAB LOGIC ---

function handleCalculateAllMarkets() {
    if (!isModelReady) {
        showError("Please calculate the model first.");
        return;
    }

    // Disable button to prevent spam
    calcMarketsButton.disabled = true;
    calcMarketsButton.textContent = "Calculating...";

    // Show loading spinners in all tables
    marketTables['1x2'].innerHTML = getLoadingRow(3);
    marketTables['dc'].innerHTML = getLoadingRow(3);
    marketTables['dnb'].innerHTML = getLoadingRow(3);
    marketTables['btts'].innerHTML = getLoadingRow(3);
    marketTables['totals'].innerHTML = getLoadingRow(5);
    marketTables['htft'].innerHTML = getLoadingRow(3);
    marketTables['ah'].innerHTML = getLoadingRow(6);


    // Run calculations sequentially with setTimeout to prevent UI freezing
    setTimeout(() => {
        displayMarket_1x2();
        setTimeout(() => {
            displayMarket_DC();
            setTimeout(() => {
                displayMarket_DNB();
                setTimeout(() => {
                    displayMarket_BTTS();
                    setTimeout(() => {
                        displayMarket_Totals();
                        setTimeout(() => {
                            displayMarket_HTFT();
                            setTimeout(() => {
                                displayMarket_AH();
                                calcMarketsButton.disabled = false;
                                calcMarketsButton.textContent = "Calculate All Markets";
                            }, 50);
                        }, 50);
                    }, 50);
                }, 50);
            }, 50);
        }, 50);
    }, 50);
}

function displayMarket_1x2() {
    const probH = calculateMarket({ ft_result: '1' });
    const probX = calculateMarket({ ft_result: 'X' });
    const probA = calculateMarket({ ft_result: '2' });

    const rH = formatResult(probH);
    const rX = formatResult(probX);
    const rA = formatResult(probA);

    marketTables['1x2'].innerHTML = `
        <tr>
            <td class="market-name">Home (1)</td>
            <td class="market-prob">${rH.probPercent}%</td>
            <td class="market-odds">${rH.odds}</td>
        </tr>
        <tr>
            <td class="market-name">Draw (X)</td>
            <td class="market-prob">${rX.probPercent}%</td>
            <td class="market-odds">${rX.odds}</td>
        </tr>
        <tr>
            <td class="market-name">Away (2)</td>
            <td class="market-prob">${rA.probPercent}%</td>
            <td class="market-odds">${rA.odds}</td>
        </tr>`;
}

function displayMarket_DC() {
    const prob1X = calculateMarket({ ft_result: '1X' });
    const prob12 = calculateMarket({ ft_result: '12' });
    const probX2 = calculateMarket({ ft_result: 'X2' });

    const r1X = formatResult(prob1X);
    const r12 = formatResult(prob12);
    const rX2 = formatResult(probX2);

    marketTables['dc'].innerHTML = `
        <tr>
            <td class="market-name">Home or Draw (1X)</td>
            <td class="market-prob">${r1X.probPercent}%</td>
            <td class="market-odds">${r1X.odds}</td>
        </tr>
        <tr>
            <td class="market-name">Home or Away (12)</td>
            <td class="market-prob">${r12.probPercent}%</td>
            <td class="market-odds">${r12.odds}</td>
        </tr>
        <tr>
            <td class="market-name">Draw or Away (X2)</td>
            <td class="market-prob">${rX2.probPercent}%</td>
            <td class="market-odds">${rX2.odds}</td>
        </tr>`;
}

function displayMarket_DNB() {
    const probH = calculateMarket({ ft_result: '1' });
    const probA = calculateMarket({ ft_result: '2' });
    // More stable way to calculate draw prob
    const probX = 1.0 - probH - probA; 

    let rH, rA;

    if (probX > 0.99999) {
        // Handle 100% Draw scenario
        rH = { probPercent: 'N/A', odds: 'Push' };
        rA = { probPercent: 'N/A', odds: 'Push' };
    } else {
        // Normalize DNB probs (remove draw prob)
        const probH_DNB = probH / (1 - probX);
        const probA_DNB = probA / (1 - probX);

        rH = formatResult(probH_DNB);
        rA = formatResult(probA_DNB);
    }

    marketTables['dnb'].innerHTML = `
        <tr>
            <td class="market-name">Home (1)</td>
            <td class="market-prob">${rH.probPercent}%</td>
            <td class="market-odds">${rH.odds}</td>
        </tr>
        <tr>
            <td class="market-name">Away (2)</td>
            <td class="market-prob">${rA.probPercent}%</td>
            <td class="market-odds">${rA.odds}</td>
        </tr>`;
}

function displayMarket_BTTS() {
    const probYes = calculateMarket({ ft_btts: true });
    const probNo = calculateMarket({ ft_btts: false });

    const rYes = formatResult(probYes);
    const rNo = formatResult(probNo);

    marketTables['btts'].innerHTML = `
        <tr>
            <td class="market-name">Yes</td>
            <td class="market-prob">${rYes.probPercent}%</td>
            <td class="market-odds">${rYes.odds}</td>
        </tr>
        <tr>
            <td class="market-name">No</td>
            <td class="market-prob">${rNo.probPercent}%</td>
            <td class="market-odds">${rNo.odds}</td>
        </tr>`;
}

function displayMarket_Totals() {
    let html = '';
    const lines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5];
    for (const line of lines) {
        const probOver = calculateMarket({ ft_total: { type: 'o', value: line } });
        const probUnder = calculateMarket({ ft_total: { type: 'u', value: line } });

        const rOver = formatResult(probOver);
        const rUnder = formatResult(probUnder);

        html += `
            <tr>
                <td class="market-name">${line}</td>
                <td class="market-prob">${rOver.probPercent}%</td>
                <td class="market-odds">${rOver.odds}</td>
                <td class="market-prob">${rUnder.probPercent}%</td>
                <td class="market-odds">${rUnder.odds}</td>
            </tr>`;
    }
    marketTables['totals'].innerHTML = html;
}

function displayMarket_HTFT() {
     const markets = [
        { name: '1 / 1', cond: { h1_result: '1', ft_result: '1' } },
        { name: '1 / X', cond: { h1_result: '1', ft_result: 'X' } },
        { name: '1 / 2', cond: { h1_result: '1', ft_result: '2' } },
        { name: 'X / 1', cond: { h1_result: 'X', ft_result: '1' } },
        { name: 'X / X', cond: { h1_result: 'X', ft_result: 'X' } },
        { name: 'X / 2', cond: { h1_result: 'X', ft_result: '2' } },
        { name: '2 / 1', cond: { h1_result: '2', ft_result: '1' } },
        { name: '2 / X', cond: { h1_result: '2', ft_result: 'X' } },
        { name: '2 / 2', cond: { h1_result: '2', ft_result: '2' } },
    ];

    let html = '';
    for (const market of markets) {
        const prob = calculateMarket(market.cond);
        const r = formatResult(prob);
        html += `
            <tr>
                <td class="market-name">${market.name}</td>
                <td class="market-prob">${r.probPercent}%</td>
                <td class="market-odds">${r.odds}</td>
            </tr>`;
    }
    marketTables['htft'].innerHTML = html;
}

function displayMarket_AH() {
    const lines = [-2.0, -1.75, -1.5, -1.25, -1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
    let html = '';

    for (const line of lines) {
        let rH, rA;
        const lineTextH = line <= 0 ? `${line}` : `+${line}`;
        const lineTextA = line <= 0 ? `+${-line}` : `${-line}`;

        if (line % 0.5 === 0) {
            // Full or half line
            const { homeWin, push, awayWin } = calculateAsianHandicap(line);

            if (push > 0.99999) {
                rH = { probPercent: 'N/A', odds: 'Push' };
                rA = { probPercent: 'N/A', odds: 'Push' };
            } else {
                const probH = homeWin / (1 - push);
                const probA = awayWin / (1 - push);
                rH = formatResult(probH);
                rA = formatResult(probA);
            }
        } else {
            // Quarter line
            const lineLow = line - 0.25;
            const lineHigh = line + 0.25;

            const resLow = calculateAsianHandicap(lineLow);
            const resHigh = calculateAsianHandicap(lineHigh);

            // Check for push on low line
            let probHLow, probALow;
            if (resLow.push > 0.99999) {
                probHLow = 0; 
                probALow = 0; 
            } else {
                probHLow = resLow.homeWin / (1 - resLow.push);
                probALow = resLow.awayWin / (1 - resLow.push);
            }

            // Check for push on high line
            let probHHigh, probAHigh;
            if (resHigh.push > 0.99999) {
                probHHigh = 0;
                probAHigh = 0;
            } else {
                probHHigh = resHigh.homeWin / (1 - resHigh.push);
                probAHigh = resHigh.awayWin / (1 - resHigh.push);
            }

            // Check for 0 probs to prevent 1/0 -> Infinity
            const oddsHLow = (probHLow <= 1e-9) ? 1e9 : (1 / probHLow);
            const oddsALow = (probALow <= 1e-9) ? 1e9 : (1 / probALow);
            const oddsHHigh = (probHHigh <= 1e-9) ? 1e9 : (1 / probHHigh);
            const oddsAHigh = (probAHigh <= 1e-9) ? 1e9 : (1 / probAHigh);

            // Odds are combined
            const oddsH = (oddsHLow + oddsHHigh) / 2;
            const oddsA = (oddsALow + oddsAHigh) / 2;

            // Probs are derived from combined odds
            const probH = (oddsH >= 1e9) ? 0 : (1 / oddsH);
            const probA = (oddsA >= 1e9) ? 0 : (1 / oddsA);

            rH = formatResult(probH);
            rA = formatResult(probA);
        }

        html += `
            <tr>
                <td class="market-name">${lineTextH}</td>
                <td class="market-prob">${rH.probPercent}%</td>
                <td class="market-odds">${rH.odds}</td>
                <td class="market-name">${lineTextA}</td>
                <td class="market-prob">${rA.probPercent}%</td>
                <td class="market-odds">${rA.odds}</td>
            </tr>`;
    }
    marketTables['ah'].innerHTML = html;
}


// --- EVENT LISTENERS ---
inputModeToggle.addEventListener('click', () => {
    const nextMode = inputMode === INPUT_MODES.SUPREMACY ? INPUT_MODES.MARKET : INPUT_MODES.SUPREMACY;
    setInputMode(nextMode);
});

calcButton.addEventListener('click', handleCalculate);
chatSend.addEventListener('click', handleChatSubmit);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleChatSubmit();
    }
});

// Tab Listeners
tabBtnBot.addEventListener('click', () => switchTab(tabBtnBot, tabContentBot));
tabBtnMarkets.addEventListener('click', () => switchTab(tabBtnMarkets, tabContentMarkets));

// All Markets Listener
calcMarketsButton.addEventListener('click', handleCalculateAllMarkets);

// --- INITIAL WELCOME ---
setInputMode(INPUT_MODES.SUPREMACY);
addChatMessage("Welcome! Please enter your model inputs and click 'Calculate Model'.", 'bot');
addChatMessage("Once calculated, you can ask for market odds here, or check the 'All Markets' tab for a full list.", 'bot');


