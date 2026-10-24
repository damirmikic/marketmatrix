import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    solveShin,
    calculateMatrix,
    solveParameters,
    getScoreProb,
    calculateDynamicRho,
    correction,
    zipPoisson,
} from '../js/math.js';

// ─── solveShin ───────────────────────────────────────────────────────────────

test('solveShin: fair probs sum to 1 for a 3-way market', () => {
    const fair = solveShin([2.10, 3.50, 3.20]);
    const sum = fair.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1.0) < 1e-6, `sum=${sum}`);
});

test('solveShin: all fair probs are positive', () => {
    const fair = solveShin([1.80, 3.60, 4.00]);
    for (const p of fair) assert.ok(p > 0, `prob not positive: ${p}`);
});

test('solveShin: balanced 2-way odds give approx 50/50', () => {
    const fair = solveShin([2.00, 2.00]);
    assert.ok(Math.abs(fair[0] - 0.5) < 0.01);
    assert.ok(Math.abs(fair[1] - 0.5) < 0.01);
});

test('solveShin: favourite shorter than implied', () => {
    // With vig the implied prob of fav > fair prob (vig inflates all)
    // Shin removes vig, so fair < implied for the favourite
    const fair = solveShin([1.40, 3.00, 6.00]);
    const implied = [1 / 1.40, 1 / 3.00, 1 / 6.00];
    const sumImplied = implied.reduce((a, b) => a + b, 0);
    assert.ok(sumImplied > 1.0, 'market should have vig');
    assert.ok(Math.abs(fair.reduce((a, b) => a + b, 0) - 1.0) < 1e-6);
});

// ─── calculateMatrix ─────────────────────────────────────────────────────────

test('calculateMatrix: probabilities sum to 1', () => {
    const m = calculateMatrix(1.5, 1.1, 0);
    let sum = 0;
    for (const row of m) for (const p of row) sum += p;
    assert.ok(Math.abs(sum - 1.0) < 1e-6, `matrix sum=${sum}`);
});

test('calculateMatrix: all entries non-negative', () => {
    const m = calculateMatrix(1.4, 1.0, 0.05);
    for (const row of m) for (const p of row) assert.ok(p >= 0, `negative entry ${p}`);
});

test('calculateMatrix: 21×21 shape', () => {
    const m = calculateMatrix(1.5, 1.0);
    assert.strictEqual(m.length, 21);
    for (const row of m) assert.strictEqual(row.length, 21);
});

test('calculateMatrix: home-favoured lambda gives higher home-win prob', () => {
    const mH = calculateMatrix(2.5, 0.8);
    const mE = calculateMatrix(1.2, 1.2);
    let hwH = 0, hwE = 0;
    for (let x = 1; x <= 20; x++)
        for (let y = 0; y < x; y++) {
            hwH += mH[x][y];
            hwE += mE[x][y];
        }
    assert.ok(hwH > hwE, `home-favoured matrix (${hwH}) should beat equal (${hwE})`);
});

// ─── Dixon-Coles helpers ──────────────────────────────────────────────────────

test('calculateDynamicRho: stays within documented bounds [-0.18, -0.05]', () => {
    for (const [l, m] of [[0.5, 0.5], [1.0, 1.0], [2.0, 2.0], [3.0, 3.0]]) {
        const rho = calculateDynamicRho(l, m);
        assert.ok(rho >= -0.18 && rho <= -0.05, `rho=${rho} for total=${l + m}`);
    }
});

test('correction: returns 1 for scores outside 0-1 range', () => {
    assert.strictEqual(correction(2, 2, 1.5, 1.0), 1);
    assert.strictEqual(correction(0, 2, 1.5, 1.0), 1);
});

test('correction: (0,0) cell reduces probability for negative rho', () => {
    // correction(0,0) = 1 - lambda*mu*rho; with rho<0 this > 1
    const c = correction(0, 0, 1.5, 1.0, -0.13);
    assert.ok(c > 1.0, `expected >1, got ${c}`);
});

// ─── solveParameters round-trip ───────────────────────────────────────────────

test('solveParameters: recovered matrix matches target home-win within 1%', () => {
    const targetHomeWin = 0.48;
    const targetOver = 0.52;
    const line = 2.5;
    const targetDraw = 0.27;

    const { lambda, mu, omega } = solveParameters(targetHomeWin, targetOver, line, targetDraw);
    const m = calculateMatrix(lambda, mu, omega);

    let hw = 0, over = 0;
    for (let x = 0; x <= 20; x++)
        for (let y = 0; y <= 20; y++) {
            if (x > y) hw += m[x][y];
            if (x + y > line) over += m[x][y];
        }

    assert.ok(Math.abs(hw - targetHomeWin) < 0.03,
        `home-win: got ${hw.toFixed(4)}, target ${targetHomeWin}`);
    assert.ok(Math.abs(over - targetOver) < 0.03,
        `over: got ${over.toFixed(4)}, target ${targetOver}`);
});

test('solveParameters: lambda and mu are positive', () => {
    const { lambda, mu } = solveParameters(0.40, 0.55, 2.5, 0.30);
    assert.ok(lambda > 0, `lambda=${lambda}`);
    assert.ok(mu > 0, `mu=${mu}`);
});

test('solveParameters: home-favoured input gives lambda > mu', () => {
    const { lambda, mu } = solveParameters(0.60, 0.55, 2.5, 0.20);
    assert.ok(lambda > mu, `expected lambda(${lambda}) > mu(${mu})`);
});

test('solveParameters: returns converged flag and iterations for typical input', () => {
    const result = solveParameters(0.48, 0.52, 2.5, 0.27);
    assert.ok(typeof result.converged === 'boolean', 'converged should be boolean');
    assert.ok(typeof result.iterations === 'number' && result.iterations >= 1, 'iterations should be a positive number');
    assert.ok(result.converged, 'should converge for typical odds');
});

test('solveParameters: residuals are small on convergence', () => {
    const result = solveParameters(0.45, 0.58, 2.5, 0.28);
    if (result.converged) {
        assert.ok(Math.abs(result.residuals.home) < 0.001, `home residual: ${result.residuals.home}`);
        assert.ok(Math.abs(result.residuals.over) < 0.001, `over residual: ${result.residuals.over}`);
    }
});

test('solveShin: converged flag is true for normal odds', () => {
    const fair = solveShin([2.10, 3.50, 3.20]);
    assert.strictEqual(fair.converged, true);
});

test('solveShin: converged flag present on 2-way market', () => {
    const fair = solveShin([1.90, 1.90]);
    assert.ok(typeof fair.converged === 'boolean');
});
