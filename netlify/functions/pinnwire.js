/**
 * Netlify Serverless Function: PinnWire (Pinnacle odds) Proxy
 * Keeps the PinnWire API key server-side (PINNWIRE_API_KEY) and returns a
 * trimmed copy of /kit/v1/markets: full-match period (num_0) plus the first-half
 * moneyline and totals (num_1), without the alt ladders the model doesn't use.
 *
 * GET /.netlify/functions/pinnwire?sport_id=1&event_type=prematch
 */

const fetch = require('node-fetch');

const UPSTREAM = 'https://pinnwire.com/kit/v1/markets';
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map(); // "sport:type" -> { at, body }

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
};

function json(statusCode, payload, extra = {}) {
    return { statusCode, headers: { ...headers, ...extra }, body: JSON.stringify(payload) };
}

function trim(data) {
    return {
        sport_id: data.sport_id,
        last: data.last,
        generated_at: data.generated_at,
        events: (data.events || [])
            .filter(e => e.units === 'Regular' && e.periods && e.periods.num_0)
            .map(e => ({
                event_id: e.event_id,
                league_name: e.league_name,
                home: e.home,
                away: e.away,
                starts: e.starts,
                event_type: e.event_type,
                period: {
                    money_line: e.periods.num_0.money_line || null,
                    spreads: e.periods.num_0.spreads || null,
                    totals: e.periods.num_0.totals || null
                },
                period1: e.periods.num_1 ? {
                    money_line: e.periods.num_1.money_line || null,
                    totals: e.periods.num_1.totals || null
                } : null
            }))
    };
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

    const key = process.env.PINNWIRE_API_KEY;
    if (!key) return json(503, { error: 'not_configured', message: 'PINNWIRE_API_KEY is not set' });

    const params = event.queryStringParameters || {};
    const sportId = parseInt(params.sport_id, 10);
    const eventType = params.event_type === 'live' ? 'live' : 'prematch';
    if (!Number.isInteger(sportId) || sportId < 1 || sportId > 13) {
        return json(400, { error: 'bad_sport_id' });
    }

    const cacheKey = `${sportId}:${eventType}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
        return json(200, hit.body, { 'Cache-Control': 'public, max-age=30' });
    }

    try {
        const res = await fetch(`${UPSTREAM}?sport_id=${sportId}&event_type=${eventType}`, {
            headers: { 'x-api-key': key }
        });

        if (!res.ok) {
            const retryAfter = res.headers.get('retry-after');
            return json(res.status === 429 ? 429 : 502,
                { error: res.status === 429 ? 'rate_limited' : 'upstream_error', status: res.status },
                retryAfter ? { 'Retry-After': retryAfter } : {});
        }

        const body = trim(await res.json());
        cache.set(cacheKey, { at: Date.now(), body });
        return json(200, body, { 'Cache-Control': 'public, max-age=30' });
    } catch (error) {
        console.error('PinnWire proxy error:', error);
        return json(500, { error: 'proxy_failed', message: error.message });
    }
};
