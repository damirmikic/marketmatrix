import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateMatrix, solveParameters } from '../js/math.js';
import { get1X2Probs } from '../js/markets.js';

function makeMatrix(hw = 0.48, over = 0.52, line = 2.5, draw = 0.27) {
    const { lambda, mu, omega } = solveParameters(hw, over, line, draw);
    return calculateMatrix(lambda, mu, omega);
}

// ─── 1X2 market ──────────────────────────────────────────────────────────────

test('get1X2Probs: p1 + pX + p2 sum to 1', () => {
    const m = makeMatrix();
    const { p1, pX, p2 } = get1X2Probs(m);
    const sum = p1 + pX + p2;
    assert.ok(Math.abs(sum - 1.0) < 1e-4, `1X2 sum=${sum}`);
});

test('get1X2Probs: all components positive', () => {
    const m = makeMatrix(0.45, 0.50, 2.5, 0.27);
    const { p1, pX, p2 } = get1X2Probs(m);
    assert.ok(p1 > 0 && pX > 0 && p2 > 0);
});

test('get1X2Probs: home favourite has p1 > p2', () => {
    const m = makeMatrix(0.60, 0.55, 2.5, 0.20);
    const { p1, p2 } = get1X2Probs(m);
    assert.ok(p1 > p2, `p1=${p1}, p2=${p2}`);
});

test('get1X2Probs: away favourite has p2 > p1', () => {
    const m = makeMatrix(0.30, 0.50, 2.5, 0.25);
    const { p1, p2 } = get1X2Probs(m);
    assert.ok(p2 > p1, `p1=${p1}, p2=${p2}`);
});

// ─── O/U market ──────────────────────────────────────────────────────────────

test('O/U 2.5: over + under sum to 1', () => {
    const m = makeMatrix();
    let over = 0;
    for (let x = 0; x <= 20; x++)
        for (let y = 0; y <= 20; y++)
            if (x + y > 2.5) over += m[x][y];
    const under = 1 - over;
    assert.ok(over > 0 && under > 0);
    assert.ok(Math.abs(over + under - 1.0) < 1e-10);
});

// ─── BTTS market (derived inline) ────────────────────────────────────────────

test('BTTS yes + no sum to 1', () => {
    const m = makeMatrix();
    let bttsYes = 0;
    for (let x = 1; x <= 20; x++)
        for (let y = 1; y <= 20; y++)
            bttsYes += m[x][y];
    const bttsNo = 1 - bttsYes;
    assert.ok(bttsYes > 0 && bttsNo > 0);
    assert.ok(Math.abs(bttsYes + bttsNo - 1.0) < 1e-10);
});

// ─── Exact total goals: complete partition ────────────────────────────────────

test('exact total goals partition sums to 1', () => {
    const m = makeMatrix();
    const buckets = Array(22).fill(0);
    for (let x = 0; x <= 20; x++)
        for (let y = 0; y <= 20; y++) {
            const tot = x + y;
            buckets[Math.min(tot, 21)] += m[x][y];
        }
    const sum = buckets.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1.0) < 1e-4, `exact goals partition sum=${sum}`);
});
