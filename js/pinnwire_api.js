// PinnWire (Pinnacle) odds module
// Pinnacle is the primary price source; Kambi values are kept as the fallback.
// Requests go through the Netlify proxy so the API key never reaches the browser.

const PROXY_URL = '/.netlify/functions/pinnwire';
const CACHE_TTL_MS = 60 * 1000;
const MAX_START_DIFF_MS = 12 * 60 * 60 * 1000;
const MIN_NAME_SCORE = 0.5;

export const SPORT_IDS = { soccer: 1, tennis: 2, basketball: 3, hockey: 4, football: 5 };

const eventCache = new Map(); // sportId -> { at, events }

export async function getPinnacleEvents(sportId) {
    const hit = eventCache.get(sportId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.events;

    const response = await fetch(`${PROXY_URL}?sport_id=${sportId}&event_type=prematch`);
    if (!response.ok) throw new Error(`PinnWire proxy HTTP ${response.status}`);
    const data = await response.json();

    const events = data.events || [];
    eventCache.set(sportId, { at: Date.now(), events });
    return events;
}

// --- Event matching (Kambi event -> Pinnacle event) ---

const STOP_WORDS = new Set(['fc', 'cf', 'sc', 'ac', 'afc', 'fk', 'sk', 'bk', 'if', 'ik', 'cd', 'ud', 'sd', 'the', 'de', 'club', 'u21', 'u23']);

function nameTokens(name) {
    return String(name || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, ' ')
        .split(/\s+/)
        .filter(t => t && !STOP_WORDS.has(t));
}

// Dice-style overlap on tokens, with prefix matches counted ("utd" ~ "united" is not
// handled, but "man"/"manchester" style prefixes are).
function nameScore(a, b) {
    const ta = nameTokens(a);
    const tb = nameTokens(b);
    if (!ta.length || !tb.length) return 0;
    const used = new Set();
    let hits = 0;
    ta.forEach(x => {
        const idx = tb.findIndex((y, i) => !used.has(i) && (x === y || (x.length >= 3 && y.startsWith(x)) || (y.length >= 3 && x.startsWith(y))));
        if (idx !== -1) { used.add(idx); hits++; }
    });
    return (2 * hits) / (ta.length + tb.length);
}

export function findPinnacleEvent(events, homeName, awayName, startMs) {
    let best = null;
    let bestScore = 0;

    events.forEach(e => {
        const diff = Math.abs(new Date(e.starts).getTime() - startMs);
        if (!(diff <= MAX_START_DIFF_MS)) return;

        const home = nameScore(homeName, e.home);
        const away = nameScore(awayName, e.away);
        if (home < MIN_NAME_SCORE || away < MIN_NAME_SCORE) return;

        const score = home + away;
        if (score > bestScore) { best = e; bestScore = score; }
    });

    return best;
}

// --- Market helpers ---

// Main line = the ladder rung whose two prices are closest together.
// halfLinesOnly skips quarter/whole lines (the soccer calculator takes x.5 lines).
export function mainTotal(totals, { halfLinesOnly = false } = {}) {
    let best = null;
    Object.values(totals || {}).forEach(t => {
        if (!t || !(t.over > 1) || !(t.under > 1)) return;
        if (halfLinesOnly && Math.abs(t.points % 1) !== 0.5) return;
        const gap = Math.abs(t.over - t.under);
        if (!best || gap < best.gap) best = { gap, ...t };
    });
    return best;
}

// First-half prices from a matched Pinnacle event: 1X2 + the most balanced half-goal total.
// Returns null when the half lines are missing (some events only carry full-time prices).
export function firstHalfPrices(event) {
    const p1 = event && event.period1;
    const ml = p1 && p1.money_line;
    if (!ml || !(ml.home > 1) || !(ml.draw > 1) || !(ml.away > 1)) return null;
    const total = mainTotal(p1.totals, { halfLinesOnly: true });
    if (!total) return null;
    return { home: ml.home, draw: ml.draw, away: ml.away, line: total.points, over: total.over, under: total.under };
}

export function mainSpread(spreads) {
    let best = null;
    Object.values(spreads || {}).forEach(s => {
        if (!s || !(s.home > 1) || !(s.away > 1)) return;
        const gap = Math.abs(s.home - s.away);
        if (!best || gap < best.gap) best = { gap, ...s };
    });
    return best;
}

// Small badge under the match selector showing where the prices came from.
export function showSourceBadge(text, ok) {
    const select = document.getElementById('apiMatchSelect');
    if (!select) return;
    let el = document.getElementById('oddsSourceBadge');
    if (!el) {
        el = document.createElement('div');
        el.id = 'oddsSourceBadge';
        el.style.cssText = 'font-size:12px;margin-top:6px;';
        select.insertAdjacentElement('afterend', el);
    }
    el.textContent = text;
    el.style.color = ok ? '#22c55e' : '#f59e0b';
}
