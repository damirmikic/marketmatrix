/**
 * Netlify Serverless Function: Tennis Elo Proxy
 * Proxies requests to Tennis Abstract to bypass CORS restrictions
 */

const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    // Enable CORS for the response
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'text/html; charset=utf-8'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        console.log('Fetching Tennis Abstract Elo ratings...');

        const response = await fetch('https://www.tennisabstract.com/reports/atp_elo_ratings.html', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; MarketMatrix/1.0)'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();

        console.log(`Successfully fetched Elo data (${html.length} bytes)`);

        return {
            statusCode: 200,
            headers,
            body: html
        };

    } catch (error) {
        console.error('Error fetching Elo ratings:', error);

        return {
            statusCode: 500,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: 'Failed to fetch Elo ratings',
                message: error.message
            })
        };
    }
};
