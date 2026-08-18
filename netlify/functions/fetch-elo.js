/**
 * Netlify Serverless Function: Tennis Elo Proxy
 * Proxies requests to Tennis Abstract to bypass CORS restrictions.
 * Accepts ?tour=atp (default) or ?tour=wta.
 */

const fetch = require('node-fetch');

const TOUR_URLS = {
    atp: 'https://www.tennisabstract.com/reports/atp_elo_ratings.html',
    wta: 'https://www.tennisabstract.com/reports/wta_elo_ratings.html'
};

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'text/html; charset=utf-8'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const tour = (event.queryStringParameters && event.queryStringParameters.tour) || 'atp';
    const targetUrl = TOUR_URLS[tour] || TOUR_URLS.atp;

    try {
        console.log(`Fetching Tennis Abstract Elo ratings (${tour.toUpperCase()})...`);

        const response = await fetch(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MarketMatrix/1.0)' }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();
        console.log(`Successfully fetched ${tour.toUpperCase()} Elo data (${html.length} bytes)`);

        return { statusCode: 200, headers, body: html };
    } catch (error) {
        console.error(`Error fetching ${tour.toUpperCase()} Elo ratings:`, error);

        return {
            statusCode: 500,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Failed to fetch Elo ratings', message: error.message })
        };
    }
};
