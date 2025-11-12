import { INPUT_MODES } from './constants.js';
import { buildModelFromSupremacy, buildModelFromOdds } from './model.js';
import { renderCorrectScoreMatrix } from './render.js';
import { renderAllMarkets, showMarketLoading } from './markets.js';

let currentModel = null;
let inputMode = INPUT_MODES.SUPREMACY;

const supremacyInput = document.getElementById('supremacy');
const expectancyInput = document.getElementById('expectancy');
const homeOddsInput = document.getElementById('odds-home');
const drawOddsInput = document.getElementById('odds-draw');
const awayOddsInput = document.getElementById('odds-away');
const totalLineInput = document.getElementById('total-line');
const overOddsInput = document.getElementById('odds-over');
const underOddsInput = document.getElementById('odds-under');
const calcButton = document.getElementById('calc-button');
const calcMarketsButton = document.getElementById('calc-markets-button');
const inputModeToggle = document.getElementById('input-mode-toggle');
const inputSupremacyContainer = document.getElementById('input-supremacy');
const inputMarketContainer = document.getElementById('input-market');
const inputInfoSup = document.getElementById('input-info-sup');
const inputInfoMarket = document.getElementById('input-info-market');
const errorMessage = document.getElementById('error-message');
const outputSection = document.getElementById('output-section');
const matrix1HElement = document.getElementById('matrix-1h');
const matrix2HElement = document.getElementById('matrix-2h');

const marketTables = {
    '1x2': document.getElementById('market-1x2'),
    dc: document.getElementById('market-dc'),
    dnb: document.getElementById('market-dnb'),
    btts: document.getElementById('market-btts'),
    goals: document.getElementById('market-goals'),
    totals: document.getElementById('market-totals'),
    firstHalf: document.getElementById('market-first-half'),
    secondHalf: document.getElementById('market-second-half'),
    htft: document.getElementById('market-htft'),
    ah: document.getElementById('market-ah'),
};

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

function updateLambdaOutputs(model) {
    const { lambdas } = model;
    document.getElementById('ft-hxg').textContent = lambdas.HxG_FT.toFixed(3);
    document.getElementById('ft-axg').textContent = lambdas.AxG_FT.toFixed(3);
    document.getElementById('h1-hxg').textContent = lambdas.HxG_1H.toFixed(3);
    document.getElementById('h1-axg').textContent = lambdas.AxG_1H.toFixed(3);
    document.getElementById('h2-hxg').textContent = lambdas.HxG_2H.toFixed(3);
    document.getElementById('h2-axg').textContent = lambdas.AxG_2H.toFixed(3);
}

function clearMarketTables() {
    Object.values(marketTables).forEach((table) => {
        if (table) {
            table.innerHTML = '';
        }
    });
}

function handleCalculate() {
    hideError();

    let model = null;

    if (inputMode === INPUT_MODES.SUPREMACY) {
        const supremacy = parseFloat(supremacyInput.value);
        const expectancy = parseFloat(expectancyInput.value);

        if (!Number.isFinite(supremacy) || !Number.isFinite(expectancy)) {
            showError('Please enter valid numbers for Supremacy and Expectancy.');
            return;
        }
        if (expectancy <= 0) {
            showError('Expectancy (E) must be a positive number.');
            return;
        }
        if (Math.abs(supremacy) > expectancy) {
            showError('Absolute value of Supremacy (|S|) cannot be greater than Expectancy (E).');
            return;
        }

        model = buildModelFromSupremacy(supremacy, expectancy);
    } else {
        const oddsHome = parseFloat(homeOddsInput.value);
        const oddsDraw = parseFloat(drawOddsInput.value);
        const oddsAway = parseFloat(awayOddsInput.value);
        const totalLine = parseFloat(totalLineInput.value);
        const oddsOver = parseFloat(overOddsInput.value);
        const oddsUnder = parseFloat(underOddsInput.value);

        if ([oddsHome, oddsDraw, oddsAway, totalLine, oddsOver, oddsUnder].some((v) => Number.isNaN(v))) {
            showError('Please enter valid 1X2 odds, a total goals line, and over/under odds.');
            return;
        }
        if ([oddsHome, oddsDraw, oddsAway, oddsOver, oddsUnder].some((v) => v <= 1)) {
            showError('All odds must be greater than 1.00.');
            return;
        }
        if (totalLine < 0) {
            showError('Total goals line must be zero or higher.');
            return;
        }

        model = buildModelFromOdds(oddsOver, oddsUnder, oddsHome, oddsAway, totalLine);
        if (!model) {
            showError('Unable to reconcile the 1X2 and totals odds into a consistent goal model.');
            return;
        }

        supremacyInput.value = (model.lambdas.AxG_FT - model.lambdas.HxG_FT).toFixed(2);
        expectancyInput.value = (model.lambdas.HxG_FT + model.lambdas.AxG_FT).toFixed(2);
    }

    currentModel = model;

    updateLambdaOutputs(model);
    renderCorrectScoreMatrix(matrix1HElement, model.matrix1H);
    renderCorrectScoreMatrix(matrix2HElement, model.matrix2H);

    outputSection.classList.remove('hidden');
    clearMarketTables();
}

function handleCalculateAllMarkets() {
    if (!currentModel) {
        showError('Please calculate the model first.');
        return;
    }

    hideError();
    calcMarketsButton.disabled = true;
    calcMarketsButton.textContent = 'Calculating...';
    showMarketLoading(marketTables);

    renderAllMarkets(currentModel, marketTables, () => {
        calcMarketsButton.disabled = false;
        calcMarketsButton.textContent = 'Calculate All Markets';
    });
}

if (!calcButton) {
    throw new Error('Calculate Model button is missing from the page.');
}
if (!calcMarketsButton) {
    throw new Error('Calculate All Markets button is missing from the page.');
}

calcButton.addEventListener('click', handleCalculate);
calcMarketsButton.addEventListener('click', handleCalculateAllMarkets);
inputModeToggle.addEventListener('click', () => {
    const nextMode = inputMode === INPUT_MODES.SUPREMACY ? INPUT_MODES.MARKET : INPUT_MODES.SUPREMACY;
    setInputMode(nextMode);
});

document.querySelectorAll('.market-group-toggle').forEach((button) => {
    const targetId = button.getAttribute('data-target');
    if (!targetId) return;
    const panel = document.getElementById(targetId);
    if (!panel) return;

    button.addEventListener('click', () => {
        const isExpanded = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', String(!isExpanded));
        panel.classList.toggle('hidden', isExpanded);
        const icon = button.querySelector('.toggle-icon');
        if (icon) {
            icon.textContent = isExpanded ? '+' : '−';
        }
    });
});

setInputMode(INPUT_MODES.SUPREMACY);
