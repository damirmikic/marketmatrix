// Basketball API Module
// Handles fetching basketball matches and odds from Kambi API

let basketballData = {
    tournaments: [],
    eventMap: {}
};

let runModelCallback = null;

// API endpoints - Using Kambi API pattern
const GROUP_URL = 'https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/listView/basketball/all/all/all/competitions.json?channel_id=7&client_id=200&lang=en_GB&market=GB&useCombined=true&useCombinedLive=true';
const EVENT_URL_BASE = 'https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/betoffer/event/';

export function setRunModelCallback(callback) {
    runModelCallback = callback;
}

// Build tournament hierarchy from events
function buildHierarchy(events) {
    const tournamentMap = new Map();

    events.forEach(event => {
        // Skip if no path or invalid event
        if (!event.path || event.path.length < 2) return;

        // Get tournament name (last item in path before the event)
        const tournamentPath = event.path[event.path.length - 1];
        const tournamentName = tournamentPath.name;
        const tournamentId = tournamentPath.id;

        if (!tournamentMap.has(tournamentId)) {
            tournamentMap.set(tournamentId, {
                name: tournamentName,
                id: tournamentId,
                events: []
            });
        }

        tournamentMap.get(tournamentId).events.push({
            id: event.id,
            name: event.name,
            homeName: event.homeName,
            awayName: event.awayName,
            start: event.start,
            path: event.path
        });

        // Store full event data
        basketballData.eventMap[event.id] = event;
    });

    // Convert map to array and sort
    basketballData.tournaments = Array.from(tournamentMap.values())
        .sort((a, b) => a.name.localeCompare(b.name));
}

// Fetch basketball matches from group endpoint
export async function initBasketballLoader() {
    try {
        const response = await fetch(GROUP_URL);
        const data = await response.json();

        if (data.events && data.events.length > 0) {
            buildHierarchy(data.events);
            populateTournamentSelector();
        }
    } catch (error) {
        console.error('Error loading basketball data:', error);
    }
}

// Populate tournament dropdown
function populateTournamentSelector() {
    const selector = document.getElementById('apiTournamentSelect');
    if (!selector) return;

    selector.innerHTML = '<option value="">Select Tournament...</option>';

    basketballData.tournaments.forEach(tournament => {
        const option = document.createElement('option');
        option.value = tournament.id;
        option.textContent = tournament.name;
        selector.appendChild(option);
    });
}

// Handle tournament selection
export function handleCountryChange() {
    const tournamentId = document.getElementById('apiTournamentSelect').value;
    const matchSelect = document.getElementById('apiMatchSelect');

    if (!tournamentId) {
        matchSelect.innerHTML = '<option value="">Select Match...</option>';
        return;
    }

    const tournament = basketballData.tournaments.find(t => t.id == tournamentId);
    if (!tournament) return;

    if (!tournament.events || tournament.events.length === 0) {
        matchSelect.innerHTML = '<option value="">No matches available</option>';
        matchSelect.disabled = true;
        return;
    }

    matchSelect.innerHTML = '<option value="">Select Match...</option>';

    tournament.events.forEach(event => {
        const option = document.createElement('option');
        option.value = event.id;
        option.textContent = `${event.homeName} vs ${event.awayName}`;
        matchSelect.appendChild(option);
    });

    matchSelect.disabled = false;
}

// Alias for compatibility
export function handleLeagueChange() {
    handleCountryChange();
}

// Fetch detailed odds for a specific event
async function fetchEventOdds(eventId) {
    try {
        const url = `${EVENT_URL_BASE}${eventId}.json?lang=en_US&market=US&client_id=200&channel_id=7&includeParticipants=true`;
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
        matchOdds: { home: null, away: null },
        spread: { home: null, away: null, line: null },
        total: { over: null, under: null, line: null }
    };

    betOffers.forEach(offer => {
        const criterionId = offer.criterion.id;

        // Match Odds (Moneyline)
        if (criterionId === 1001159551) {
            offer.outcomes.forEach(outcome => {
                if (outcome.type === 'OT_ONE') {
                    odds.matchOdds.home = outcome.odds / 1000;
                } else if (outcome.type === 'OT_TWO') {
                    odds.matchOdds.away = outcome.odds / 1000;
                }
            });
        }

        // Spread
        if (criterionId === 1001427539) {
            offer.outcomes.forEach(outcome => {
                if (outcome.type === 'OT_ONE') {
                    odds.spread.home = outcome.odds / 1000;
                    odds.spread.line = outcome.line / 1000;
                } else if (outcome.type === 'OT_TWO') {
                    odds.spread.away = outcome.odds / 1000;
                }
            });
        }

        // Total Points
        if (criterionId === 1001159891) {
            offer.outcomes.forEach(outcome => {
                if (outcome.type === 'OT_OVER') {
                    odds.total.over = outcome.odds / 1000;
                    odds.total.line = outcome.line / 1000;
                } else if (outcome.type === 'OT_UNDER') {
                    odds.total.under = outcome.odds / 1000;
                }
            });
        }
    });

    return odds;
}

// Handle match selection and populate odds
export async function handleMatchChange() {
    const eventId = document.getElementById('apiMatchSelect').value;

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
    // Clear inputs first
    clearInputs();

    // Match Odds
    if (odds.matchOdds.home) {
        document.getElementById('homeOdds').value = odds.matchOdds.home.toFixed(2);
    }
    if (odds.matchOdds.away) {
        document.getElementById('awayOdds').value = odds.matchOdds.away.toFixed(2);
    }

    // Spread
    if (odds.spread.line) {
        document.getElementById('spreadLine').value = odds.spread.line.toFixed(1);
    }
    if (odds.spread.home) {
        document.getElementById('spreadHomeOdds').value = odds.spread.home.toFixed(2);
    }
    if (odds.spread.away) {
        document.getElementById('spreadAwayOdds').value = odds.spread.away.toFixed(2);
    }

    // Total
    if (odds.total.line) {
        document.getElementById('totalLine').value = odds.total.line.toFixed(1);
    }
    if (odds.total.over) {
        document.getElementById('overOdds').value = odds.total.over.toFixed(2);
    }
    if (odds.total.under) {
        document.getElementById('underOdds').value = odds.total.under.toFixed(2);
    }
}

// Clear all input fields
function clearInputs() {
    const inputs = ['homeOdds', 'awayOdds', 'spreadLine', 'spreadHomeOdds', 'spreadAwayOdds', 'totalLine', 'overOdds', 'underOdds'];

    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = '';
    });
}