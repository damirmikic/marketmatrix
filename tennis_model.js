// Tennis Model
// Calculates probabilities and generates betting markets for tennis matches

import * as TennisAPI from './js/tennis_api.js';
import { TennisEngine } from './tennis_engine.js';

// Initialize the Monte Carlo engine
const tennisEngine = new TennisEngine();

// Remove vigorish and get fair probabilities
function removeFair(odds1, odds2) {
    const imp1 = 1 / odds1;
    const imp2 = 1 / odds2;
    const total = imp1 + imp2;

    return {
        prob1: imp1 / total,
        prob2: imp2 / total,
        margin: ((total - 1) * 100).toFixed(2)
    };
}

// Calculate game probability within a set
function calcGameProb(p) {
    // Probability of winning a game given probability of winning a point
    // Simplified model - in reality this is more complex due to deuce
    // Using approximation: P(win game) ≈ p^4 * sum of geometric series

    let gameProb = 0;

    // Win 4-0, 4-1, 4-2
    gameProb += Math.pow(p, 4) * Math.pow(1-p, 0); // 4-0
    gameProb += 4 * Math.pow(p, 4) * Math.pow(1-p, 1); // 4-1
    gameProb += 10 * Math.pow(p, 4) * Math.pow(1-p, 2); // 4-2

    // Deuce situations (3-3) - simplified
    const pDeuce = 20 * Math.pow(p, 3) * Math.pow(1-p, 3);
    const pWinFromDeuce = Math.pow(p, 2) / (1 - 2*p*(1-p));
    gameProb += pDeuce * pWinFromDeuce;

    return gameProb;
}

// Calculate set probability (best of games)
function calcSetProb(pGame) {
    let setProb = 0;

    // Win 6-0, 6-1, 6-2, 6-3, 6-4
    for (let opponentGames = 0; opponentGames <= 4; opponentGames++) {
        const combinations = factorial(6 + opponentGames - 1) /
                           (factorial(opponentGames) * factorial(5));
        setProb += combinations * Math.pow(pGame, 6) *
                   Math.pow(1 - pGame, opponentGames);
    }

    // Win 7-5 (after 5-5)
    const p55 = factorial(10) / (factorial(5) * factorial(5)) *
                Math.pow(pGame, 5) * Math.pow(1 - pGame, 5);
    setProb += p55 * pGame * pGame;

    // Win 7-6 (tiebreak) - simplified
    const p66 = factorial(11) / (factorial(6) * factorial(5)) *
                Math.pow(pGame, 6) * Math.pow(1 - pGame, 5);
    const pTiebreak = 0.5 + (pGame - 0.5) * 0.3; // Simplified tiebreak advantage
    setProb += p66 * pTiebreak;

    return setProb;
}

// Helper: Factorial function
function factorial(n) {
    if (n <= 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) {
        result *= i;
    }
    return result;
}

// Calculate match probability (best of 3 sets)
function calcMatchProb(pSet) {
    // Win 2-0
    const p20 = pSet * pSet;

    // Win 2-1
    const p21 = 2 * pSet * (1 - pSet) * pSet;

    return p20 + p21;
}

// Calculate first set winner probability from match winner probability
// Using logistic regression: P(First Set) = 1 / (1 + e^(-(3.25 * P(Match) - 1.72)))
function calcFirstSetProb(pMatch) {
    const z = 3.25 * pMatch - 1.72;
    const pFirstSet = 1 / (1 + Math.exp(-z));
    return pFirstSet;
}

// Calculate exact score probabilities for sets
function calcExactScores(pSet) {
    const p20 = pSet * pSet;
    const p21 = pSet * pSet * (1 - pSet) + pSet * (1 - pSet) * pSet;
    const p12 = (1 - pSet) * (1 - pSet) * pSet + (1 - pSet) * pSet * (1 - pSet);
    const p02 = (1 - pSet) * (1 - pSet);

    return { p20, p21, p12, p02 };
}

// Calculate set handicap probabilities
// Line represents Player 1's handicap (e.g., -1.5 means Player 1 gives 1.5 sets)
function calcSetHandicap(pSet, line) {
    const scores = calcExactScores(pSet);

    if (line === -2.5) {
        // Player 1 -2.5: impossible to cover in best of 3
        return { player1: 0, player2: 1 };
    } else if (line === -1.5) {
        // Player 1 -1.5: needs to win 2-0
        return {
            player1: scores.p20,
            player2: 1 - scores.p20
        };
    } else if (line === 1.5) {
        // Player 1 +1.5: covers unless loses 0-2
        return {
            player1: 1 - scores.p02,
            player2: scores.p02
        };
    } else if (line === 2.5) {
        // Player 1 +2.5: always covers
        return { player1: 1, player2: 0 };
    }

    return { player1: 0.5, player2: 0.5 };
}

// Calculate total games probabilities
function calcTotalGames(pGame1, pGame2, line) {
    // Simplified: estimate distribution of total games
    // Average games in a 2-set match: ~16-20 games
    // Average games in a 3-set match: ~26-30 games

    const pSet1 = calcSetProb(pGame1);
    const pMatch3Sets = 2 * pSet1 * (1 - pSet1) + 2 * (1 - pSet1) * pSet1;

    // Estimate mean total games
    const mean2Sets = 13;
    const mean3Sets = 27;
    const meanGames = (1 - pMatch3Sets) * mean2Sets + pMatch3Sets * mean3Sets;

    // Use normal approximation with estimated std dev
    const stdDev = 4;
    const z = (line - meanGames) / stdDev;
    const pOver = 1 - normalCDF(z);

    return {
        over: pOver,
        under: 1 - pOver
    };
}

// Normal CDF approximation
function normalCDF(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
}

// Calculate game handicap probabilities
function calcGameHandicap(pGame1, pGame2, line) {
    const meanGames1 = 14 * pGame1; // Approximate games won by player 1
    const meanGames2 = 14 * pGame2; // Approximate games won by player 2
    const diff = meanGames1 - meanGames2;

    // Use normal approximation
    const stdDev = 3;
    const z = (line - diff) / stdDev;
    const pPlayer1 = normalCDF(-z);

    return {
        player1: pPlayer1,
        player2: 1 - pPlayer1
    };
}

// Main model runner
window.runModel = function() {
    try {
        // Get input values
        const player1Odds = parseFloat(document.getElementById('player1Odds').value);
        const player2Odds = parseFloat(document.getElementById('player2Odds').value);
        const totalGamesLine = parseFloat(document.getElementById('totalGamesLine').value);

        if (!player1Odds || !player2Odds) {
            return;
        }

        // Calculate fair probabilities for match winner
        const matchFair = removeFair(player1Odds, player2Odds);

        // Choose model based on available data
        // If we have total games line, use Monte Carlo simulation (more accurate)
        // Otherwise, fall back to analytical model
        const useSimulation = totalGamesLine && totalGamesLine > 0;

        if (useSimulation) {
            console.log('=== Using Monte Carlo Simulation Engine ===');
            runSimulationModel(player1Odds, player2Odds, totalGamesLine, matchFair);
        } else {
            console.log('=== Using Analytical Model (Total Games line not provided) ===');
            runAnalyticalModel(player1Odds, player2Odds, matchFair);
        }

    } catch (error) {
        console.error('Error running model:', error);
    }
};

// Run the simulation-based model
function runSimulationModel(player1Odds, player2Odds, totalGamesLine, matchFair) {
    // Generate prices using Monte Carlo engine
    const results = tennisEngine.generatePrices(player1Odds, player2Odds, totalGamesLine);

    console.log('Calibration:', results.calibration);

    // Display match odds
    displayMatchOdds(matchFair, null, null);

    // Display first set winner from simulation
    const setBetting = results.markets.setBetting;
    const pFirstSet1 = calcFirstSetProb(matchFair.prob1);
    const pFirstSet2 = 1 - pFirstSet1;
    displayFirstSetWinner(pFirstSet1, pFirstSet2);

    // Display correct scores from simulation
    displaySimulationCorrectScores(setBetting);

    // Display set handicaps from simulation
    displaySimulationSetHandicaps(results.markets.setHandicaps);

    // Display game handicaps from simulation
    displaySimulationGameHandicaps(results.markets.gameHandicaps);

    // Display total games from simulation
    displaySimulationTotalGames(results.markets.totalGames);

    // Set 1 total - use analytical model for now
    const set1TotalLine = parseFloat(document.getElementById('set1TotalLine').value);
    if (set1TotalLine) {
        const set1TotalOver = parseFloat(document.getElementById('set1TotalOver').value);
        const set1TotalUnder = parseFloat(document.getElementById('set1TotalUnder').value);
        // Use simple estimation for set 1
        const pPoint1 = 0.5 + (matchFair.prob1 - 0.5) * 0.4;
        const pGame1 = calcGameProb(pPoint1);
        const pGame2 = calcGameProb(1 - pPoint1);
        displaySet1Total(set1TotalLine, set1TotalOver, set1TotalUnder, pGame1, pGame2);
    }
}

// Run the analytical model (fallback)
function runAnalyticalModel(player1Odds, player2Odds, matchFair) {
    // Estimate point probability from match probability
    const pPoint1 = 0.5 + (matchFair.prob1 - 0.5) * 0.4;
    const pPoint2 = 1 - pPoint1;

    // Calculate game probabilities
    const pGame1 = calcGameProb(pPoint1);
    const pGame2 = calcGameProb(pPoint2);

    // Calculate set probabilities
    const pSet1 = calcSetProb(pGame1);
    const pSet2 = 1 - pSet1;

    // Calculate match probabilities
    const pMatch1 = calcMatchProb(pSet1);
    const pMatch2 = 1 - pMatch1;

    // Display match odds
    displayMatchOdds(matchFair, pMatch1, pMatch2);

    // Calculate first set winner probabilities
    const pFirstSet1 = calcFirstSetProb(matchFair.prob1);
    const pFirstSet2 = 1 - pFirstSet1;

    // Display first set winner
    displayFirstSetWinner(pFirstSet1, pFirstSet2);

    // Display correct scores
    displayCorrectScores(pFirstSet1);

    // Calculate and display set handicap
    const setHandicapLine = parseFloat(document.getElementById('setHandicapLine').value);
    if (setHandicapLine) {
        const setHandicapPlayer1Odds = parseFloat(document.getElementById('setHandicapPlayer1').value);
        const setHandicapPlayer2Odds = parseFloat(document.getElementById('setHandicapPlayer2').value);
        displaySetHandicap(setHandicapLine, setHandicapPlayer1Odds, setHandicapPlayer2Odds, pSet1);
    }

    // Calculate and display game handicap
    const gameHandicapLine = parseFloat(document.getElementById('gameHandicapLine').value);
    if (gameHandicapLine) {
        const gameHandicapPlayer1Odds = parseFloat(document.getElementById('gameHandicapPlayer1').value);
        const gameHandicapPlayer2Odds = parseFloat(document.getElementById('gameHandicapPlayer2').value);
        displayGameHandicap(gameHandicapLine, gameHandicapPlayer1Odds, gameHandicapPlayer2Odds, pGame1, pGame2);
    }

    // Calculate and display total games
    const totalGamesLine = parseFloat(document.getElementById('totalGamesLine').value);
    if (totalGamesLine) {
        const totalGamesOver = parseFloat(document.getElementById('totalGamesOver').value);
        const totalGamesUnder = parseFloat(document.getElementById('totalGamesUnder').value);
        displayTotalGames(totalGamesLine, totalGamesOver, totalGamesUnder, pGame1, pGame2);
    }

    // Calculate and display Set 1 total games
    const set1TotalLine = parseFloat(document.getElementById('set1TotalLine').value);
    if (set1TotalLine) {
        const set1TotalOver = parseFloat(document.getElementById('set1TotalOver').value);
        const set1TotalUnder = parseFloat(document.getElementById('set1TotalUnder').value);
        displaySet1Total(set1TotalLine, set1TotalOver, set1TotalUnder, pGame1, pGame2);
    }
}

// Display functions
function displayMatchOdds(fair, pMatch1, pMatch2) {
    // Update fair odds in stat boxes
    document.getElementById('fairPlayer1').textContent = (1 / fair.prob1).toFixed(2);
    document.getElementById('fairPlayer2').textContent = (1 / fair.prob2).toFixed(2);

    // Update margin
    document.getElementById('moneylineMargin').textContent = `Margin: ${fair.margin}%`;

    // Show markets area
    document.getElementById('marketsArea')?.classList.remove('hidden');
    document.getElementById('firstSetArea')?.classList.remove('hidden');
    document.getElementById('exactScoreArea')?.classList.remove('hidden');
}

function displayFirstSetWinner(pFirstSet1, pFirstSet2) {
    const tbody = document.getElementById('firstSetWinnerTable');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td>Player 1</td>
            <td class="num-col">${(pFirstSet1 * 100).toFixed(2)}%</td>
            <td class="num-col">${(1 / pFirstSet1).toFixed(2)}</td>
        </tr>
        <tr>
            <td>Player 2</td>
            <td class="num-col">${(pFirstSet2 * 100).toFixed(2)}%</td>
            <td class="num-col">${(1 / pFirstSet2).toFixed(2)}</td>
        </tr>
    `;
}

function displayCorrectScores(pFirstSet1) {
    const tbody = document.getElementById('correctScoreTable');
    if (!tbody) return;

    // Using first set probability, calculate all possible match outcomes
    // Assuming same probability for each set
    const p = pFirstSet1;

    // Calculate all possible correct scores
    const scores = {
        '2-0': p * p,
        '2-1': 2 * p * p * (1 - p), // Player 1 wins 2 sets, loses 1 (binomial coefficient: 2 ways)
        '1-2': 2 * (1 - p) * (1 - p) * p, // Player 2 wins 2 sets, Player 1 wins 1
        '0-2': (1 - p) * (1 - p)
    };

    let html = '';
    for (const [score, prob] of Object.entries(scores)) {
        const odds = 1 / prob;
        html += `
            <tr>
                <td>${score}</td>
                <td class="num-col">${(prob * 100).toFixed(2)}%</td>
                <td class="num-col">${odds.toFixed(2)}</td>
            </tr>
        `;
    }

    tbody.innerHTML = html;
}

function displaySetHandicap(line, odds1, odds2, pSet1) {
    const tbody = document.getElementById('setHandicapTable');
    if (!tbody) return;

    const fair = removeFair(odds1, odds2);

    // Update margin in header
    document.getElementById('setHandicapMargin').textContent = `Margin: ${fair.margin}%`;

    // Generate multiple handicap lines
    const lines = [-2.5, -1.5, 1.5, 2.5];
    let html = '';

    lines.forEach(l => {
        const calc = calcSetHandicap(pSet1, l);
        const odds1Fair = 1 / calc.player1;
        const odds2Fair = 1 / calc.player2;

        html += `
            <tr>
                <td>${l > 0 ? '+' : ''}${l.toFixed(1)}</td>
                <td class="num-col">${odds1Fair.toFixed(2)}</td>
                <td class="num-col">${odds2Fair.toFixed(2)}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function displayGameHandicap(line, odds1, odds2, pGame1, pGame2) {
    const tbody = document.getElementById('gameHandicapTable');
    if (!tbody) return;

    const fair = removeFair(odds1, odds2);

    // Update margin in header
    document.getElementById('gameHandicapMargin').textContent = `Margin: ${fair.margin}%`;

    // Generate multiple handicap lines
    const lines = [-5.5, -3.5, -1.5, 1.5, 3.5, 5.5];
    let html = '';

    lines.forEach(l => {
        const calc = calcGameHandicap(pGame1, pGame2, l);
        const odds1Fair = 1 / calc.player1;
        const odds2Fair = 1 / calc.player2;

        html += `
            <tr>
                <td>${l > 0 ? '+' : ''}${l.toFixed(1)}</td>
                <td class="num-col">${odds1Fair.toFixed(2)}</td>
                <td class="num-col">${odds2Fair.toFixed(2)}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function displayTotalGames(line, overOdds, underOdds, pGame1, pGame2) {
    const tbody = document.getElementById('totalGamesTable');
    if (!tbody) return;

    const fair = removeFair(overOdds, underOdds);

    // Update margin in header
    document.getElementById('totalGamesMargin').textContent = `Margin: ${fair.margin}%`;

    // Generate multiple total lines
    const lines = [19.5, 20.5, 21.5, 22.5, 23.5, 24.5];
    let html = '';

    lines.forEach(l => {
        const calc = calcTotalGames(pGame1, pGame2, l);
        const overOdds = 1 / calc.over;
        const underOdds = 1 / calc.under;

        html += `
            <tr>
                <td>${l.toFixed(1)}</td>
                <td class="num-col">${overOdds.toFixed(2)}</td>
                <td class="num-col">${underOdds.toFixed(2)}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function displaySet1Total(line, overOdds, underOdds, pGame1, pGame2) {
    const tbody = document.getElementById('set1TotalTable');
    if (!tbody) return;

    const fair = removeFair(overOdds, underOdds);

    // Update margin in header
    document.getElementById('set1TotalMargin').textContent = `Margin: ${fair.margin}%`;

    // Generate multiple total lines for Set 1
    const lines = [8.5, 9.5, 10.5, 11.5, 12.5];
    let html = '';

    lines.forEach(l => {
        // Simplified calculation for set 1 total games
        const meanGames = 9.5; // Average games in a set
        const stdDev = 2;
        const z = (l - meanGames) / stdDev;
        const pOver = 1 - normalCDF(z);
        const pUnder = 1 - pOver;

        const overOdds = 1 / pOver;
        const underOdds = 1 / pUnder;

        html += `
            <tr>
                <td>${l.toFixed(1)}</td>
                <td class="num-col">${overOdds.toFixed(2)}</td>
                <td class="num-col">${underOdds.toFixed(2)}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// Display functions for simulation-based results
function displaySimulationCorrectScores(setBetting) {
    const tbody = document.getElementById('correctScoreTable');
    if (!tbody) return;

    const scores = [
        { score: '2-0', data: setBetting['2-0'] },
        { score: '2-1', data: setBetting['2-1'] },
        { score: '1-2', data: setBetting['1-2'] },
        { score: '0-2', data: setBetting['0-2'] }
    ];

    let html = '';
    scores.forEach(({ score, data }) => {
        if (data && data.odds) {
            html += `
                <tr>
                    <td>${score}</td>
                    <td class="num-col">${data.prob}</td>
                    <td class="num-col">${data.odds}</td>
                </tr>
            `;
        }
    });

    tbody.innerHTML = html;
}

function displaySimulationSetHandicaps(setHandicaps) {
    const tbody = document.getElementById('setHandicapTable');
    if (!tbody) return;

    let html = '';
    for (const [line, handicap] of Object.entries(setHandicaps)) {
        const lineNum = parseFloat(line);
        if (handicap.player1 && handicap.player1.odds) {
            html += `
                <tr>
                    <td>${lineNum > 0 ? '+' : ''}${lineNum.toFixed(1)}</td>
                    <td class="num-col">${handicap.player1.odds}</td>
                    <td class="num-col">${handicap.player2.odds}</td>
                </tr>
            `;
        }
    }

    tbody.innerHTML = html;
}

function displaySimulationGameHandicaps(gameHandicaps) {
    const tbody = document.getElementById('gameHandicapTable');
    if (!tbody) return;

    let html = '';
    for (const [line, handicap] of Object.entries(gameHandicaps)) {
        const lineNum = parseFloat(line);
        if (handicap.player1 && handicap.player1.odds) {
            html += `
                <tr>
                    <td>${lineNum > 0 ? '+' : ''}${lineNum.toFixed(1)}</td>
                    <td class="num-col">${handicap.player1.odds}</td>
                    <td class="num-col">${handicap.player2.odds}</td>
                </tr>
            `;
        }
    }

    tbody.innerHTML = html;
}

function displaySimulationTotalGames(totalGamesMarkets) {
    const tbody = document.getElementById('totalGamesTable');
    if (!tbody) return;

    let html = '';
    for (const [line, totals] of Object.entries(totalGamesMarkets)) {
        const lineNum = parseFloat(line);
        if (totals.over && totals.over.odds) {
            html += `
                <tr>
                    <td>${lineNum.toFixed(1)}</td>
                    <td class="num-col">${totals.over.odds}</td>
                    <td class="num-col">${totals.under.odds}</td>
                </tr>
            `;
        }
    }

    tbody.innerHTML = html;
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    // Set up API callback
    TennisAPI.setRunModelCallback(window.runModel);

    // Initialize match loader
    await TennisAPI.initLoader();

    // Set up event listeners
    document.getElementById('tournamentSelect')?.addEventListener('change', TennisAPI.handleTournamentChange);
    document.getElementById('matchSelect')?.addEventListener('change', TennisAPI.handleMatchChange);

    // Add input listeners for manual changes
    const inputs = document.querySelectorAll('input[type="number"]');
    inputs.forEach(input => {
        input.addEventListener('input', window.runModel);
    });
});
