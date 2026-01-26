// Table Tennis API Module
// Handles fetching table tennis matches and odds

let tableTennisData = {
    tournaments: [],
    eventMap: {}
};

let runModelCallback = null;

// API endpoints - Using Kambi API pattern
const GROUP_URL = 'https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/listView/table_tennis/all/all/all/matches.json?channel_id=7&client_id=200&lang=en_GB&market=GB&useCombined=true&useCombinedLive=true';
const EVENT_URL_BASE = 'https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/betoffer/event/';

export function setRunModelCallback(callback) {
    runModelCallback = callback;
}

// Build tournament hierarchy from events
function buildHierarchy(events) {
    const tournamentMap = new Map();

    events.forEach(event => {
        if (!event.path || event.path.length < 2) return;

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

        tableTennisData.eventMap[event.id] = event;
    });

    tableTennisData.tournaments = Array.from(tournamentMap.values())
        .sort((a, b) => a.name.localeCompare(b.name));
}

// Fetch table tennis matches
export async function initTableTennisLoader() {
    try {
        const response = await fetch(GROUP_URL);
        const data = await response.json();

        if (data.events && data.events.length > 0) {
            const events = data.events.map(item => item.event || item);
            buildHierarchy(events);
            populateTournamentSelector();
        }
    } catch (error) {
        console.error('Error loading table tennis data:', error);
    }
}

// Populate tournament dropdown
function populateTournamentSelector() {
    const selector = document.getElementById('apiCountrySelect');
    if (!selector) return;

    selector.innerHTML = '<option value="">Select Tournament...</option>';

    tableTennisData.tournaments.forEach(tournament => {
        const option = document.createElement('option');
        option.value = tournament.id;
        option.textContent = tournament.name;
        selector.appendChild(option);
    });
}

// Handle tournament selection
export function handleCountryChange() {
    const tournamentId = document.getElementById('apiCountrySelect').value;
    const matchSelect = document.getElementById('apiMatchSelect');

    if (!tournamentId) {
        matchSelect.innerHTML = '<option value="">Select Match...</option>';
        return;
    }

    const tournament = tableTennisData.tournaments.find(t => t.id == tournamentId);
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

// Alias
export function handleLeagueChange() {
    handleCountryChange();
}

// Fetch event odds
async function fetchEventOdds(eventId) {
    try {
        const url = `${EVENT_URL_BASE}${eventId}.json?lang=en_GB&market=GB&client_id=200&channel_id=7&includeParticipants=true`;
        const response = await fetch(url);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching event odds:', error);
        return null;
    }
}

// Parse odds
function parseOdds(betOffers) {
    const odds = {
        matchOdds: { player1: null, player2: null },
        handicap: { player1: null, player2: null, line: null },
        total: { over: null, under: null, line: null }
    };

    betOffers.forEach(offer => {
        const criterionId = offer.criterion.id;

        // Match Odds
        if (criterionId === 1001159551) {
            offer.outcomes.forEach(outcome => {
                if (outcome.type === 'OT_ONE') {
                    odds.matchOdds.player1 = outcome.odds / 1000;
                } else if (outcome.type === 'OT_TWO') {
                    odds.matchOdds.player2 = outcome.odds / 1000;
                }
            });
        }

        // Handicap
        if (criterionId === 1001427539) {
            offer.outcomes.forEach(outcome => {
                if (outcome.type === 'OT_ONE') {
                    odds.handicap.player1 = outcome.odds / 1000;
                    odds.handicap.line = outcome.line / 1000;
                } else if (outcome.type === 'OT_TWO') {
                    odds.handicap.player2 = outcome.odds / 1000;
                }
            });
        }

        // Total
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

// Handle match selection
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

    if (runModelCallback) {
        runModelCallback();
    }
}

// Populate inputs
function populateInputs(odds) {
    clearInputs();

    if (odds.matchOdds.player1) {
        document.getElementById('homeOdds').value = odds.matchOdds.player1.toFixed(2);
    }
    if (odds.matchOdds.player2) {
        document.getElementById('awayOdds').value = odds.matchOdds.player2.toFixed(2);
    }

    if (odds.handicap.line) {
        document.getElementById('totalGamesLine').value = odds.handicap.line.toFixed(1);
    }

    if (odds.total.over) {
        document.getElementById('oddsOver').value = odds.total.over.toFixed(2);
    }
    if (odds.total.under) {
        document.getElementById('oddsUnder').value = odds.total.under.toFixed(2);
    }
}

// Clear inputs
function clearInputs() {
    const inputs = ['homeOdds', 'awayOdds', 'totalGamesLine', 'oddsOver', 'oddsUnder'];

    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = '';
    });
}