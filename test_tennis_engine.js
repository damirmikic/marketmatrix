/**
 * Test script for TennisEngine
 * Run with: node test_tennis_engine.js
 */

import { TennisEngine } from './tennis_engine.js';

const engine = new TennisEngine();

console.log('========================================');
console.log('Tennis Engine Test Suite');
console.log('========================================\n');

// Test Case 1: Balanced match (Alcaraz vs Sinner)
console.log('TEST 1: Balanced Match');
console.log('Scenario: Alcaraz (1.50) vs Sinner (2.50)');
console.log('Expected: Tight match, Total 22.5 games');
console.log('----------------------------------------');

const test1 = engine.generatePrices(1.50, 2.50, 22.5);

console.log('\nCalibration Results:');
console.log('  P1 Hold Rate:', test1.calibration.p1HoldRate);
console.log('  P2 Hold Rate:', test1.calibration.p2HoldRate);
console.log('  Simulated Win Prob:', test1.calibration.simulatedWinProb);
console.log('  Simulated Total Games:', test1.calibration.simulatedTotalGames);

console.log('\nSet Betting:');
console.log('  2-0:', test1.markets.setBetting['2-0'].odds, '(' + test1.markets.setBetting['2-0'].prob + ')');
console.log('  2-1:', test1.markets.setBetting['2-1'].odds, '(' + test1.markets.setBetting['2-1'].prob + ')');
console.log('  0-2:', test1.markets.setBetting['0-2'].odds, '(' + test1.markets.setBetting['0-2'].prob + ')');
console.log('  1-2:', test1.markets.setBetting['1-2'].odds, '(' + test1.markets.setBetting['1-2'].prob + ')');

console.log('\nTotal Games (22.5):');
const total22_5 = test1.markets.totalGames[22.5];
if (total22_5) {
    console.log('  Over:', total22_5.over.odds, '(' + total22_5.over.prob + ')');
    console.log('  Under:', total22_5.under.odds, '(' + total22_5.under.prob + ')');
}

console.log('\n========================================\n');

// Test Case 2: Serve-bot match (Isner vs Opelka)
console.log('TEST 2: Serve-Bot Match');
console.log('Scenario: Isner (1.50) vs Opelka (2.50)');
console.log('Expected: High service holds, Total 25.5 games');
console.log('----------------------------------------');

const test2 = engine.generatePrices(1.50, 2.50, 25.5);

console.log('\nCalibration Results:');
console.log('  P1 Hold Rate:', test2.calibration.p1HoldRate);
console.log('  P2 Hold Rate:', test2.calibration.p2HoldRate);
console.log('  Simulated Win Prob:', test2.calibration.simulatedWinProb);
console.log('  Simulated Total Games:', test2.calibration.simulatedTotalGames);

console.log('\nSet Betting:');
console.log('  2-0:', test2.markets.setBetting['2-0'].odds, '(' + test2.markets.setBetting['2-0'].prob + ')');
console.log('  2-1:', test2.markets.setBetting['2-1'].odds, '(' + test2.markets.setBetting['2-1'].prob + ')');

console.log('\nTotal Games (25.5):');
const total25_5 = test2.markets.totalGames[25.5];
if (total25_5) {
    console.log('  Over:', total25_5.over.odds, '(' + total25_5.over.prob + ')');
    console.log('  Under:', total25_5.under.odds, '(' + total25_5.under.prob + ')');
}

console.log('\n========================================\n');

// Test Case 3: One-sided match
console.log('TEST 3: One-Sided Match');
console.log('Scenario: Djokovic (1.20) vs Qualifier (4.50)');
console.log('Expected: Dominant player, Total 20.5 games');
console.log('----------------------------------------');

const test3 = engine.generatePrices(1.20, 4.50, 20.5);

console.log('\nCalibration Results:');
console.log('  P1 Hold Rate:', test3.calibration.p1HoldRate);
console.log('  P2 Hold Rate:', test3.calibration.p2HoldRate);
console.log('  Simulated Win Prob:', test3.calibration.simulatedWinProb);
console.log('  Simulated Total Games:', test3.calibration.simulatedTotalGames);

console.log('\nSet Betting:');
console.log('  2-0:', test3.markets.setBetting['2-0'].odds, '(' + test3.markets.setBetting['2-0'].prob + ')');
console.log('  2-1:', test3.markets.setBetting['2-1'].odds, '(' + test3.markets.setBetting['2-1'].prob + ')');

console.log('\nSet Handicap (-1.5):');
const setHcp = test3.markets.setHandicaps[-1.5];
if (setHcp) {
    console.log('  Player 1:', setHcp.player1.odds, '(' + setHcp.player1.prob + ')');
    console.log('  Player 2:', setHcp.player2.odds, '(' + setHcp.player2.prob + ')');
}

console.log('\n========================================');
console.log('All tests completed successfully!');
console.log('========================================');
