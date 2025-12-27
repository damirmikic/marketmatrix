// Tennis Model
// Calculates probabilities and generates betting markets for tennis matches

import * as TennisAPI from './js/tennis_api.js';

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

// Calculate exact score probabilities for sets
function calcExactScores(pSet) {
    const p20 = pSet * pSet;
    const p21 = pSet * pSet * (1 - pSet) + pSet * (1 - pSet) * pSet;
    const p12 = (1 - pSet) * (1 - pSet) * pSet + (1 - pSet) * pSet * (1 - pSet);
    const p02 = (1 - pSet) * (1 - pSet);

    return { p20, p21, p12, p02 };
}

// Calculate set handicap probabilities
function calcSetHandicap(pSet, line) {
    const scores = calcExactScores(pSet);

    if (line === 1.5) {
        // Player 1 -1.5: needs to win 2-0
        return {
            player1: scores.p20,
            player2: 1 - scores.p20
        };
    } else if (line === -1.5) {
        // Player 2 -1.5: needs to win 2-0
        return {
            player1: 1 - scores.p02,
            player2: scores.p02
        };
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

        if (!player1Odds || !player2Odds) {
            return;
        }

        // Calculate fair probabilities for match winner
        const matchFair = removeFair(player1Odds, player2Odds);

        // Estimate point probability from match probability
        // Using inverse calculation: if P(match) = p, estimate P(point)
        // This is a simplification
        const pPoint1 = 0.5 + (matchFair.prob1 - 0.5) * 0.4;
        const pPoint2 = 1 - pPoint1;

        // Calculate game probabilities
        const pGame1 = calcGameProb(pPoint1);
        const pGame2 = calcGameProb(pPoint2);

        // Calculate set probabilities
        const pSet1 = calcSetProb(pGame1);
        const pSet2 = 1 - pSet1;

        // Calculate match probabilities (should match fair probs)
        const pMatch1 = calcMatchProb(pSet1);
        const pMatch2 = 1 - pMatch1;

        // Display match odds
        displayMatchOdds(matchFair, pMatch1, pMatch2);

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

        // Calculate and display exact scores
        displayExactScores(pSet1);

    } catch (error) {
        console.error('Error running model:', error);
    }
};

// Display functions
function displayMatchOdds(fair, pMatch1, pMatch2) {
    const tbody = document.getElementById('matchOddsBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td>Player 1</td>
            <td>${(fair.prob1 * 100).toFixed(2)}%</td>
            <td>${(1 / fair.prob1).toFixed(2)}</td>
            <td>${(pMatch1 * 100).toFixed(2)}%</td>
            <td>${(1 / pMatch1).toFixed(2)}</td>
        </tr>
        <tr>
            <td>Player 2</td>
            <td>${(fair.prob2 * 100).toFixed(2)}%</td>
            <td>${(1 / fair.prob2).toFixed(2)}</td>
            <td>${(pMatch2 * 100).toFixed(2)}%</td>
            <td>${(1 / pMatch2).toFixed(2)}</td>
        </tr>
        <tr>
            <td colspan="2"><strong>Margin</strong></td>
            <td colspan="3">${fair.margin}%</td>
        </tr>
    `;
}

function displaySetHandicap(line, odds1, odds2, pSet1) {
    const tbody = document.getElementById('setHandicapBody');
    if (!tbody) return;

    const fair = removeFair(odds1, odds2);
    const calc = calcSetHandicap(pSet1, line);

    tbody.innerHTML = `
        <tr>
            <td>Player 1 (${line > 0 ? '+' : ''}${-line})</td>
            <td>${(fair.prob1 * 100).toFixed(2)}%</td>
            <td>${(1 / fair.prob1).toFixed(2)}</td>
            <td>${(calc.player1 * 100).toFixed(2)}%</td>
            <td>${(1 / calc.player1).toFixed(2)}</td>
        </tr>
        <tr>
            <td>Player 2 (${line > 0 ? '-' : '+'}${line})</td>
            <td>${(fair.prob2 * 100).toFixed(2)}%</td>
            <td>${(1 / fair.prob2).toFixed(2)}</td>
            <td>${(calc.player2 * 100).toFixed(2)}%</td>
            <td>${(1 / calc.player2).toFixed(2)}</td>
        </tr>
        <tr>
            <td colspan="2"><strong>Margin</strong></td>
            <td colspan="3">${fair.margin}%</td>
        </tr>
    `;
}

function displayGameHandicap(line, odds1, odds2, pGame1, pGame2) {
    const tbody = document.getElementById('gameHandicapBody');
    if (!tbody) return;

    const fair = removeFair(odds1, odds2);
    const calc = calcGameHandicap(pGame1, pGame2, line);

    tbody.innerHTML = `
        <tr>
            <td>Player 1 (${line > 0 ? '+' : ''}${-line})</td>
            <td>${(fair.prob1 * 100).toFixed(2)}%</td>
            <td>${(1 / fair.prob1).toFixed(2)}</td>
            <td>${(calc.player1 * 100).toFixed(2)}%</td>
            <td>${(1 / calc.player1).toFixed(2)}</td>
        </tr>
        <tr>
            <td>Player 2 (${line > 0 ? '-' : '+'}${line})</td>
            <td>${(fair.prob2 * 100).toFixed(2)}%</td>
            <td>${(1 / fair.prob2).toFixed(2)}</td>
            <td>${(calc.player2 * 100).toFixed(2)}%</td>
            <td>${(1 / calc.player2).toFixed(2)}</td>
        </tr>
        <tr>
            <td colspan="2"><strong>Margin</strong></td>
            <td colspan="3">${fair.margin}%</td>
        </tr>
    `;
}

function displayTotalGames(line, overOdds, underOdds, pGame1, pGame2) {
    const tbody = document.getElementById('totalGamesBody');
    if (!tbody) return;

    const fair = removeFair(overOdds, underOdds);
    const calc = calcTotalGames(pGame1, pGame2, line);

    tbody.innerHTML = `
        <tr>
            <td>Over ${line}</td>
            <td>${(fair.prob1 * 100).toFixed(2)}%</td>
            <td>${(1 / fair.prob1).toFixed(2)}</td>
            <td>${(calc.over * 100).toFixed(2)}%</td>
            <td>${(1 / calc.over).toFixed(2)}</td>
        </tr>
        <tr>
            <td>Under ${line}</td>
            <td>${(fair.prob2 * 100).toFixed(2)}%</td>
            <td>${(1 / fair.prob2).toFixed(2)}</td>
            <td>${(calc.under * 100).toFixed(2)}%</td>
            <td>${(1 / calc.under).toFixed(2)}</td>
        </tr>
        <tr>
            <td colspan="2"><strong>Margin</strong></td>
            <td colspan="3">${fair.margin}%</td>
        </tr>
    `;
}

function displaySet1Total(line, overOdds, underOdds, pGame1, pGame2) {
    const tbody = document.getElementById('set1TotalBody');
    if (!tbody) return;

    const fair = removeFair(overOdds, underOdds);

    // Simplified calculation for set 1 total games
    const meanGames = 9.5; // Average games in a set
    const stdDev = 2;
    const z = (line - meanGames) / stdDev;
    const pOver = 1 - normalCDF(z);

    tbody.innerHTML = `
        <tr>
            <td>Over ${line}</td>
            <td>${(fair.prob1 * 100).toFixed(2)}%</td>
            <td>${(1 / fair.prob1).toFixed(2)}</td>
            <td>${(pOver * 100).toFixed(2)}%</td>
            <td>${(1 / pOver).toFixed(2)}</td>
        </tr>
        <tr>
            <td>Under ${line}</td>
            <td>${(fair.prob2 * 100).toFixed(2)}%</td>
            <td>${(1 / fair.prob2).toFixed(2)}</td>
            <td>${((1 - pOver) * 100).toFixed(2)}%</td>
            <td>${(1 / (1 - pOver)).toFixed(2)}</td>
        </tr>
        <tr>
            <td colspan="2"><strong>Margin</strong></td>
            <td colspan="3">${fair.margin}%</td>
        </tr>
    `;
}

function displayExactScores(pSet1) {
    const tbody = document.getElementById('exactScoresBody');
    if (!tbody) return;

    const scores = calcExactScores(pSet1);

    tbody.innerHTML = `
        <tr>
            <td>2-0</td>
            <td>${(scores.p20 * 100).toFixed(2)}%</td>
            <td>${(1 / scores.p20).toFixed(2)}</td>
        </tr>
        <tr>
            <td>2-1</td>
            <td>${(scores.p21 * 100).toFixed(2)}%</td>
            <td>${(1 / scores.p21).toFixed(2)}</td>
        </tr>
        <tr>
            <td>1-2</td>
            <td>${(scores.p12 * 100).toFixed(2)}%</td>
            <td>${(1 / scores.p12).toFixed(2)}</td>
        </tr>
        <tr>
            <td>0-2</td>
            <td>${(scores.p02 * 100).toFixed(2)}%</td>
            <td>${(1 / scores.p02).toFixed(2)}</td>
        </tr>
    `;
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
