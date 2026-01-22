// Bandy API Module
// Handles fetching bandy matches and odds from Kambi API

let bandyData = {
    leagues: [],
    eventMap: {}
};

let runModelCallback = null;

// API endpoints
const LIST_VIEW_URL = 'https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/listView/bandy/all/all/all/matches.json?channel_id=7&channel_id=7&client_id=200&client_id=200&competitionId=undefined&lang=en_GB&lang=en_GB&market=GB&market=GB&useCombined=true&useCombinedLive=true';
const EVENT_URL_BASE = 'https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/betoffer/event/';

export function setRunModelCallback(callback) {
    runModelCallback = callback;
}

// Build league hierarchy from events
function buildHierarchy(events) {
    const leagueMap = new Map();

    events.forEach(event => {
        // Skip if no path or invalid event
        if (!event.event || !event.event.path || event.event.path.length < 2) return;

        // Skip outrights (only want matches)
        if (event.event.type === 'OT_UNTYPED') return;

        // Get league name (last item in path before the event)
        const leaguePath = event.event.path[event.event.path.length - 1];
        const leagueName = leaguePath.name;
        const leagueId = leaguePath.id;

        // Get country if available (second to last in path)
        let countryName = 'International';
        if (event.event.path.length >= 2) {
            countryName = event.event.path[event.event.path.length - 2].name;
        }

        const compositeKey = `${countryName} - ${leagueName}`;

        if (!leagueMap.has(compositeKey)) {
            leagueMap.set(compositeKey, {
                name: compositeKey,
                id: leagueId,
                country: countryName,
                league: leagueName,
                events: []
            });
        }

        leagueMap.get(compositeKey).events.push({
            id: event.event.id,
            name: event.event.name,
            homeName: event.event.homeName,
            awayName: event.event.awayName,
            start: event.event.start,
            path: event.event.path
        });

        // Store full event data
        bandyData.eventMap[event.event.id] = event;
    });

    // Convert map to array and sort
    bandyData.leagues = Array.from(leagueMap.values())
        .sort((a, b) => a.name.localeCompare(b.name));
}

// Fetch bandy matches from list view endpoint
export async function initLoader() {
    try {
        const response = await fetch(LIST_VIEW_URL);
        const data = await response.json();

        if (data.events && data.events.length > 0) {
            buildHierarchy(data.events);
            populateLeagueSelector();
        } else {
            console.warn('No bandy matches available');
        }
    } catch (error) {
        console.error('Error loading bandy data:', error);
    }
}

// Populate league dropdown
function populateLeagueSelector() {
    const selector = document.getElementById('leagueSelect');
    if (!selector) return;

    selector.innerHTML = '<option value="">Select League...</option>';

    bandyData.leagues.forEach(league => {
        const option = document.createElement('option');
        option.value = league.name;
        option.textContent = league.name;
        selector.appendChild(option);
    });
}

// Handle league selection
export function handleLeagueChange() {
    const leagueName = document.getElementById('leagueSelect').value;
    const matchSelect = document.getElementById('matchSelect');

    if (!leagueName) {
        matchSelect.innerHTML = '<option value="">Select Match...</option>';
        matchSelect.disabled = true;
        return;
    }

    const league = bandyData.leagues.find(l => l.name === leagueName);
    if (!league) return;

    if (!league.events || league.events.length === 0) {
        matchSelect.innerHTML = '<option value="">No matches available</option>';
        matchSelect.disabled = true;
        return;
    }

    matchSelect.innerHTML = '<option value="">Select Match...</option>';

    league.events.forEach(event => {
        const option = document.createElement('option');
        option.value = event.id;
        option.textContent = `${event.homeName} vs ${event.awayName}`;
        matchSelect.appendChild(option);
    });

    matchSelect.disabled = false;
}

// Fetch detailed odds for a specific event
async function fetchEventOdds(eventId) {
    try {
        const ncid = Date.now(); // Cache busting
        const url = `${EVENT_URL_BASE}${eventId}.json?lang=en_GB&market=GB&client_id=200&channel_id=7&ncid=${ncid}&includeParticipants=true`;
        const response = await fetch(url);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching event odds:', error);
        return null;
    }
}

// Parse odds from bet offers
function parseOdds(betOffers) {
    const odds = {
        matchWinner: { home: null, draw: null, away: null },
        totalGoals: { line: null, over: null, under: null }
    };

    betOffers.forEach(offer => {
        // Match Winner (1X2) - Full Time
        if (offer.criterion && offer.criterion.label === 'Full Time') {
            if (offer.betOfferType && offer.betOfferType.name === 'Match') {
                offer.outcomes.forEach(outcome => {
                    if (outcome.type === 'OT_ONE') {
                        odds.matchWinner.home = outcome.odds / 1000;
                    } else if (outcome.type === 'OT_CROSS') {
                        odds.matchWinner.draw = outcome.odds / 1000;
                    } else if (outcome.type === 'OT_TWO') {
                        odds.matchWinner.away = outcome.odds / 1000;
                    }
                });
            }
        }

        // Total Goals (Over/Under)
        if (offer.criterion &&
            (offer.criterion.label === 'Total Goals' || offer.criterion.englishLabel === 'Total Goals') &&
            offer.betOfferType && offer.betOfferType.name === 'Over/Under') {
            // Get the line from the first outcome
            if (offer.outcomes && offer.outcomes.length > 0) {
                const firstOutcome = offer.outcomes[0];
                if (firstOutcome.line) {
                    odds.totalGoals.line = firstOutcome.line / 1000;
                }
            }

            offer.outcomes.forEach(outcome => {
                if (outcome.type === 'OT_OVER') {
                    odds.totalGoals.over = outcome.odds / 1000;
                } else if (outcome.type === 'OT_UNDER') {
                    odds.totalGoals.under = outcome.odds / 1000;
                }
            });
        }
    });

    return odds;
}

// Handle match selection and populate odds
export async function handleMatchChange() {
    const eventId = document.getElementById('matchSelect').value;

    if (!eventId) {
        clearInputs();
        return;
    }

    const eventData = await fetchEventOdds(eventId);
    if (!eventData || !eventData.betOffers) {
        console.error('No odds data available');
        return;
    }

    const odds = parseOdds(eventData.betOffers);
    populateInputs(odds);

    // Trigger model calculation
    if (runModelCallback) {
        runModelCallback();
    }
}

// Populate input fields with parsed odds
function populateInputs(odds) {
    // Clear inputs first to ensure no stale data
    clearInputs();

    // Match Winner (1X2)
    if (odds.matchWinner.home) {
        document.getElementById('homeOdds').value = odds.matchWinner.home.toFixed(2);
    }
    if (odds.matchWinner.draw) {
        document.getElementById('drawOdds').value = odds.matchWinner.draw.toFixed(2);
    }
    if (odds.matchWinner.away) {
        document.getElementById('awayOdds').value = odds.matchWinner.away.toFixed(2);
    }

    // Total Goals
    if (odds.totalGoals.line) {
        document.getElementById('totalGoalsLine').value = odds.totalGoals.line.toFixed(1);
    }
    if (odds.totalGoals.over) {
        document.getElementById('overOdds').value = odds.totalGoals.over.toFixed(2);
    }
    if (odds.totalGoals.under) {
        document.getElementById('underOdds').value = odds.totalGoals.under.toFixed(2);
    }
}

// Clear all input fields
function clearInputs() {
    const inputs = [
        'homeOdds', 'drawOdds', 'awayOdds',
        'totalGoalsLine', 'overOdds', 'underOdds'
    ];

    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = '';
    });
}
