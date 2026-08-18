import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TennisEngine } from '../tennis_engine.js';

const engine = new TennisEngine();

test('removeVigorish: fair probabilities sum to 1', () => {
    const r = engine.removeVigorish(1.5, 2.5);
    assert.ok(r.p1 > 0 && r.p2 > 0);
    assert.ok(Math.abs(r.p1 + r.p2 - 1.0) < 1e-6);
});

test('removeVigorish: balanced odds give ~50/50', () => {
    const r = engine.removeVigorish(1.909, 1.909);
    assert.ok(Math.abs(r.p1 - 0.5) < 0.01);
    assert.ok(Math.abs(r.p2 - 0.5) < 0.01);
});

test('solveParameters: hold probs are valid', () => {
    const fair = engine.removeVigorish(1.5, 2.5);
    const result = engine.solveParameters(fair.p1, 22.5, 'Hard');
    assert.ok(result.pa > 0 && result.pa < 1, `pa=${result.pa} out of range`);
    assert.ok(result.pb > 0 && result.pb < 1, `pb=${result.pb} out of range`);
});

test('solveParameters: calibrated match prob is close to input', () => {
    const fairP1 = 0.65;
    const result = engine.solveParameters(fairP1, 22.5, 'Hard');
    assert.ok(
        Math.abs(result.calibration.pMatch - fairP1) < 0.05,
        `calibration drift too large: got ${result.calibration.pMatch}, expected ~${fairP1}`
    );
});

test('generateDerivatives: required markets are present', () => {
    const fair = engine.removeVigorish(1.5, 2.5);
    const result = engine.solveParameters(fair.p1, 22.5, 'Hard');
    const d = engine.generateDerivatives(result.pa, result.pb, result.calibration);
    assert.ok(d.setBetting, 'setBetting market missing');
    assert.ok(d.gameHandicap, 'gameHandicap market missing');
});

// Surface round-trips
for (const [label, o1, o2, line, surface] of [
    ['hard balanced', 1.50, 2.50, 22.5, 'Hard'],
    ['grass serve-bots', 1.50, 2.50, 25.5, 'Grass'],
    ['clay one-sided', 1.20, 4.50, 20.5, 'Clay'],
]) {
    test(`round-trip: ${label}`, () => {
        const fair = engine.removeVigorish(o1, o2);
        const result = engine.solveParameters(fair.p1, line, surface);
        assert.ok(result.pa > 0 && result.pb > 0);
        const d = engine.generateDerivatives(result.pa, result.pb, result.calibration);
        assert.ok(d.setBetting && d.gameHandicap);
    });
}
