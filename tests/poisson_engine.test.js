/**
 * Tests for PoissonEngine via FutsalEngine and BandyEngine.
 * Both extend PoissonEngine with different sport constants,
 * so running tests through each subclass validates both configs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FutsalEngine } from '../futsal_engine.js';
import { BandyEngine } from '../bandy_engine.js';

function suiteFor(name, Engine) {
    const engine = new Engine();

    // ── vig removal ────────────────────────────────────────────────────────

    test(`${name}: removeVig2Way sums to 1`, () => {
        const [p1, p2] = engine.removeVig2Way(1.90, 1.90);
        assert.ok(Math.abs(p1 + p2 - 1.0) < 1e-10);
        assert.strictEqual(p1, 0.5);
    });

    test(`${name}: removeVig3Way sums to 1`, () => {
        const probs = engine.removeVig3Way(2.20, 3.50, 3.20);
        const sum = probs.reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(sum - 1.0) < 1e-10);
    });

    // ── generateMatrix ─────────────────────────────────────────────────────

    test(`${name}: generateMatrix probabilities sum to 1`, () => {
        const m = engine.generateMatrix(2.5, 2.0);
        let sum = 0;
        for (const row of m) for (const p of row) sum += p;
        assert.ok(Math.abs(sum - 1.0) < 1e-4, `sum=${sum}`);
    });

    test(`${name}: generateMatrix all entries non-negative`, () => {
        const m = engine.generateMatrix(3.0, 2.5);
        for (const row of m) for (const p of row)
            assert.ok(p >= 0, `negative entry ${p}`);
    });

    // ── calc1X2 ────────────────────────────────────────────────────────────

    test(`${name}: 1X2 probs sum to ~1`, () => {
        const m = engine.generateMatrix(2.5, 2.0);
        const { homeWin, draw, awayWin } = engine.calc1X2FromMatrix(m);
        const sum = homeWin + draw + awayWin;
        assert.ok(Math.abs(sum - 1.0) < 1e-3, `1X2 sum=${sum}`);
    });

    test(`${name}: home-favoured lambda gives homeWin > awayWin`, () => {
        const m = engine.generateMatrix(3.5, 1.5);
        const { homeWin, awayWin } = engine.calc1X2FromMatrix(m);
        assert.ok(homeWin > awayWin, `homeWin=${homeWin}, awayWin=${awayWin}`);
    });

    // ── calcTotalFromMatrix ────────────────────────────────────────────────

    test(`${name}: over + under = 1`, () => {
        const m = engine.generateMatrix(2.5, 2.0);
        const { over, under } = engine.calcTotalFromMatrix(m, 4.5);
        assert.ok(Math.abs(over + under - 1.0) < 1e-10);
    });

    test(`${name}: over(low line) > over(high line)`, () => {
        const m = engine.generateMatrix(2.5, 2.0);
        const low = engine.calcTotalFromMatrix(m, 2.5).over;
        const high = engine.calcTotalFromMatrix(m, 6.5).over;
        assert.ok(low > high, `over(2.5)=${low} should exceed over(6.5)=${high}`);
    });

    // ── calcBTTS ───────────────────────────────────────────────────────────

    test(`${name}: BTTS yes + no = 1`, () => {
        const m = engine.generateMatrix(2.5, 2.0);
        const { yes, no } = engine.calcBTTS(m);
        assert.ok(Math.abs(yes + no - 1.0) < 1e-10);
    });

    // ── calcHandicap ───────────────────────────────────────────────────────

    test(`${name}: handicap homeCovers + awayCovers = 1`, () => {
        const m = engine.generateMatrix(2.5, 2.0);
        const { homeCovers, awayCovers } = engine.calcHandicap(m, -0.5);
        assert.ok(Math.abs(homeCovers + awayCovers - 1.0) < 1e-10);
    });

    // ── generateAllMarkets round-trip ──────────────────────────────────────

    // PoissonEngine.generateAllMarkets takes 1X2 odds + O/U, not handicap odds.
    const allMarketsInputs = {
        homeOdds: 1.85,
        drawOdds: 3.50,
        awayOdds: 4.50,
        overOdds: 1.90,
        underOdds: 1.90,
        totalLine: engine.DEFAULT_TOTAL_LINE,
    };

    test(`${name}: generateAllMarkets returns plausible structure`, () => {
        const markets = engine.generateAllMarkets(allMarketsInputs);

        assert.ok(markets.matchWinner, 'matchWinner missing');
        const { homeWin, draw, awayWin } = markets.matchWinner;
        assert.ok(Math.abs(homeWin + draw + awayWin - 1.0) < 1e-3,
            `matchWinner sum=${homeWin + draw + awayWin}`);

        assert.ok(Array.isArray(markets.handicaps) && markets.handicaps.length > 0,
            'handicaps missing or empty');
        assert.ok(Array.isArray(markets.totals) && markets.totals.length > 0,
            'totals missing or empty');
    });

    test(`${name}: generateAllMarkets total O/U each sum to 1`, () => {
        const markets = engine.generateAllMarkets(allMarketsInputs);
        for (const t of markets.totals) {
            assert.ok(Math.abs(t.over + t.under - 1.0) < 1e-6,
                `O/U line ${t.line}: over+under=${t.over + t.under}`);
        }
    });

    test(`${name}: generateAllMarkets handicap covers each sum to 1`, () => {
        const markets = engine.generateAllMarkets(allMarketsInputs);
        for (const h of markets.handicaps) {
            assert.ok(Math.abs(h.homeCovers + h.awayCovers - 1.0) < 1e-6,
                `Handicap ${h.line}: sum=${h.homeCovers + h.awayCovers}`);
        }
    });
}

suiteFor('FutsalEngine', FutsalEngine);
suiteFor('BandyEngine', BandyEngine);
