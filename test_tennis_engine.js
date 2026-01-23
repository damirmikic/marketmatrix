/**
 * Test script for TennisEngine
 * Run with: node test_tennis_engine.js
 */

import { TennisEngine } from './tennis_engine.js';
import assert from 'assert';

const engine = new TennisEngine();

console.log('========================================');
console.log('Tennis Engine Test Suite');
console.log('========================================\n');

function runTest(testName, odds1, odds2, totalGames, surface = 'Hard') {
    console.log(`TEST: ${testName}`);
    console.log(`Scenario: Player 1 (${odds1}) vs Player 2 (${odds2})`);
    console.log(`Expected: Total ${totalGames} games on ${surface}`);
    console.log('----------------------------------------');

    try {
        // 1. De-vig
        const fairParams = engine.removeVigorish(odds1, odds2);
        assert(fairParams.p1 > 0 && fairParams.p2 > 0, "Fair probabilities should be positive");
        assert(Math.abs(fairParams.p1 + fairParams.p2 - 1.0) < 1e-6, "Fair probabilities should sum to 1");
        console.log(`  Fair Probs: P1=${fairParams.p1.toFixed(3)}, P2=${fairParams.p2.toFixed(3)}`);

        // 2. Solve
        const result = engine.solveParameters(fairParams.p1, totalGames, surface);
        assert(result.pa > 0 && result.pb > 0, "Hold probabilities should be positive");
        console.log(`  Solved Hold Probs: PA=${result.pa.toFixed(3)}, PB=${result.pb.toFixed(3)}`);
        console.log(`  Calibrated Win Prob: ${(result.calibration.pMatch * 100).toFixed(1)}%`);
        console.log(`  Calibrated Total: ${result.calibration.expTotal.toFixed(2)}`);

        // 3. Derivatives
        const derivatives = engine.generateDerivatives(result.pa, result.pb, result.calibration);
        assert(derivatives.setBetting, "Set betting market should be generated");
        assert(derivatives.gameHandicap, "Game handicap market should be generated");
        console.log('  Generated derivatives for set betting and game handicap.');

        console.log('  Test Passed!\n');
        return true;
    } catch (e) {
        console.error(`  Test Failed: ${e.message}`);
        console.error(e.stack);
        return false;
    }
}

let success = 0;
let failed = 0;

runTest('Balanced Match', 1.50, 2.50, 22.5, 'Hard') ? success++ : failed++;
runTest('Serve-Bot Match', 1.50, 2.50, 25.5, 'Grass') ? success++ : failed++;
runTest('One-Sided Match', 1.20, 4.50, 20.5, 'Clay') ? success++ : failed++;


console.log('========================================');
if (failed === 0) {
    console.log(`All ${success} tests completed successfully!`);
} else {
    console.log(`${success} tests passed, ${failed} tests failed.`);
}
console.log('========================================');

if (failed > 0) {
    process.exit(1); // Exit with error code if any test fails
}
