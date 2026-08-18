import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HandballEngine } from '../handball_engine.js';

const engine = new HandballEngine();

// ─── vig removal ─────────────────────────────────────────────────────────────

test('removeVig2Way: probs sum to 1', () => {
    const [p1, p2] = engine.removeVig2Way(1.85, 1.95);
    assert.ok(Math.abs(p1 + p2 - 1.0) < 1e-10);
});

test('removeVig3Way: probs sum to 1', () => {
    const probs = engine.removeVig3Way(2.10, 3.50, 3.20);
    const sum = probs.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1.0) < 1e-10);
});

// ─── matrix ──────────────────────────────────────────────────────────────────

test('generateMatrix: probabilities sum to 1', () => {
    const m = engine.generateMatrix(29, 27);
    let sum = 0;
    for (const row of m) for (const p of row) sum += p;
    assert.ok(Math.abs(sum - 1.0) < 1e-4, `sum=${sum}`);
});

test('generateMatrix: all entries non-negative', () => {
    const m = engine.generateMatrix(28, 28);
    for (const row of m) for (const p of row) assert.ok(p >= 0, `negative entry ${p}`);
});

// ─── calc1X2 ─────────────────────────────────────────────────────────────────

test('calc1X2FromMatrix: homeWin + draw + awayWin ≈ 1', () => {
    const m = engine.generateMatrix(29, 27);
    const { homeWin, draw, awayWin } = engine.calc1X2FromMatrix(m);
    const sum = homeWin + draw + awayWin;
    assert.ok(Math.abs(sum - 1.0) < 1e-3, `1X2 sum=${sum}`);
});

test('calc1X2FromMatrix: home-favoured means homeWin > awayWin', () => {
    const m = engine.generateMatrix(32, 24);
    const { homeWin, awayWin } = engine.calc1X2FromMatrix(m);
    assert.ok(homeWin > awayWin, `homeWin=${homeWin}, awayWin=${awayWin}`);
});

// ─── solveMeans round-trip ────────────────────────────────────────────────────

test('solveMeans round-trip: recovered totals match target over within 2%', () => {
    const handicapLine = -2.5;
    const targetHomeCovers = 0.70;
    const totalLine = 55.5;
    const targetOver = 0.52;

    const means = engine.solveMeans(handicapLine, targetHomeCovers, totalLine, targetOver);

    assert.ok(means.muHome > 0 && means.muAway > 0);

    const recovered = engine.calcTotalNormal(means.muHome, means.muAway, totalLine);
    assert.ok(
        Math.abs(recovered.over - targetOver) < 0.02,
        `total over: got ${recovered.over.toFixed(4)}, target ${targetOver}`
    );
});

test('solveMeans round-trip: recovered handicap matches target within 2%', () => {
    const handicapLine = -1.5;
    const targetHomeCovers = 0.60;
    const totalLine = 56.5;
    const targetOver = 0.50;

    const means = engine.solveMeans(handicapLine, targetHomeCovers, totalLine, targetOver);
    const recovered = engine.calcHandicapNormal(means.muHome, means.muAway, handicapLine);

    assert.ok(
        Math.abs(recovered.homeCovers - targetHomeCovers) < 0.02,
        `handicap: got ${recovered.homeCovers.toFixed(4)}, target ${targetHomeCovers}`
    );
});

// ─── generateAllMarkets smoke test ───────────────────────────────────────────

test('generateAllMarkets: returns expected structure', () => {
    const markets = engine.generateAllMarkets({
        handicapLine: -2.5,
        handicapHomeOdds: 1.90,
        handicapAwayOdds: 1.90,
        totalLine: 55.5,
        overOdds: 1.90,
        underOdds: 1.90,
    });

    assert.ok(markets.matchWinner, 'matchWinner missing');
    assert.ok(markets.handicaps?.length > 0, 'handicaps missing');
    assert.ok(markets.totals?.length > 0, 'totals missing');
    assert.ok(markets.htft?.length === 9, 'htft should have 9 outcomes');

    const { homeWin, draw, awayWin } = markets.matchWinner;
    assert.ok(Math.abs(homeWin + draw + awayWin - 1.0) < 1e-3,
        `matchWinner sum=${homeWin + draw + awayWin}`);
});

test('generateAllMarkets: comboBets partitions 1X2 × O/U correctly', () => {
    const markets = engine.generateAllMarkets({
        handicapLine: -2.5,
        handicapHomeOdds: 1.85,
        handicapAwayOdds: 1.95,
        totalLine: 55.5,
        overOdds: 1.90,
        underOdds: 1.90,
    });

    const comboSum = markets.comboBets.reduce((s, c) => s + c.probability, 0);
    assert.ok(Math.abs(comboSum - 1.0) < 1e-3, `comboBets sum=${comboSum}`);
});
