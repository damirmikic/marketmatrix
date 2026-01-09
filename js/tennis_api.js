// Tennis API Module
// Handles fetching tennis matches and odds from Kambi API

let tennisData = {
    tournaments: [],
    eventMap: {}
};

let runModelCallback = null;

// API endpoints
const GROUP_URL = 'https://eu-offering-api.kambicdn.com/offering/v2018/paf11lv/betoffer/group/1000093193.json?includeParticipants=true&onlyMain=false&type=2&market=LV&lang=en_GB&suppress_response_codes=true';
const EVENT_URL_BASE = 'https://eu1.offering-api.kambicdn.com/offering/v2018/paf11lv/betoffer/event/';

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
            path: event.path, // Store path for surface detection later if needed per event
            tour: detectTour(event.path) // Detect and store tour (ATP/WTA)
        });

        // Store full event data
        tennisData.eventMap[event.id] = event;
    });

    // Convert map to array and sort
    tennisData.tournaments = Array.from(tournamentMap.values())
        .sort((a, b) => a.name.localeCompare(b.name));
}

// Fetch tennis matches from group endpoint
export async function initLoader() {
    try {
        const response = await fetch(GROUP_URL);
        const data = await response.json();

        if (data.events && data.events.length > 0) {
            buildHierarchy(data.events);
            populateTournamentSelector();
        }
    } catch (error) {
        console.error('Error loading tennis data:', error);
    }
}

// Populate tournament dropdown
function populateTournamentSelector() {
    const selector = document.getElementById('tournamentSelect');
    if (!selector) return;

    selector.innerHTML = '<option value="">Select Tournament...</option>';

    tennisData.tournaments.forEach(tournament => {
        const option = document.createElement('option');
        option.value = tournament.id;
        option.textContent = tournament.name;
        selector.appendChild(option);
    });
}

// Detect surface from tournament name
function detectSurface(tournamentName) {
    const name = tournamentName.toLowerCase();
    if (name.includes('clay') || name.includes('garros') || name.includes('rome') || name.includes('madrid')) {
        return 'Clay';
    }
    if (name.includes('grass') || name.includes('wimbledon') || name.includes('queens') || name.includes('halle')) {
        return 'Grass';
    }
    // Default to Hard Court
    return 'Hard';
}

// Detect tour (ATP or WTA) from event path
function detectTour(path) {
    if (!path || path.length === 0) return 'ATP'; // Default to ATP

    // Look through path elements for tour indicators
    for (const pathElement of path) {
        const name = pathElement.name.toLowerCase();
        if (name.includes('wta') || name.includes('women')) {
            return 'WTA';
        }
        if (name.includes('atp') || name.includes('men')) {
            return 'ATP';
        }
    }

    // Default to ATP if no clear indicator
    return 'ATP';
}

// Handle tournament selection
export function handleTournamentChange() {
    const tournamentId = document.getElementById('tournamentSelect').value;
    const matchSelect = document.getElementById('matchSelect');

    if (!tournamentId) {
        matchSelect.innerHTML = '<option value="">Select Match...</option>';
        return;
    }

    const tournament = tennisData.tournaments.find(t => t.id == tournamentId);
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
        matchOdds: { player1: null, player2: null },
        gameHandicap: { player1: null, player2: null, line: null },
        totalGames: { over: null, under: null, line: null },
        setHandicap: { player1: null, player2: null, line: null },
        totalGamesSet1: { over: null, under: null, line: null }
    };

    betOffers.forEach(offer => {
        const criterionId = offer.criterion.id;

        // Match Odds (Moneyline)
        if (criterionId === 1001159551) {
            offer.outcomes.forEach(outcome => {
                if (outcome.type === 'OT_ONE') {
                    odds.matchOdds.player1 = outcome.odds / 1000;
                } else if (outcome.type === 'OT_TWO') {
                    odds.matchOdds.player2 = outcome.odds / 1000;
                }
            });
        }

        // Game Handicap (Game Spread)
        if (criterionId === 1001427539) {
            offer.outcomes.forEach(outcome => {
                if (outcome.type === 'OT_ONE') {
                    odds.gameHandicap.player1 = outcome.odds / 1000;
                    odds.gameHandicap.line = outcome.line / 1000; // Keep the sign!
                } else if (outcome.type === 'OT_TWO') {
                    odds.gameHandicap.player2 = outcome.odds / 1000;
                }
            });
        }

        // Total Games
        if (criterionId === 1001159891) {
            offer.outcomes.forEach(outcome => {
                if (outcome.type === 'OT_OVER') {
                    odds.totalGames.over = outcome.odds / 1000;
                    odds.totalGames.line = outcome.line / 1000;
                } else if (outcome.type === 'OT_UNDER') {
                    odds.totalGames.under = outcome.odds / 1000;
                }
            });
        }

        // Set Handicap (Set Spread)
        if (criterionId === 1001419385 && offer.tags && offer.tags.includes('MAIN_LINE')) {
            offer.outcomes.forEach(outcome => {
                if (outcome.type === 'OT_ONE') {
                    odds.setHandicap.player1 = outcome.odds / 1000;
                    odds.setHandicap.line = outcome.line / 1000; // Keep the sign!
                } else if (outcome.type === 'OT_TWO') {
                    odds.setHandicap.player2 = outcome.odds / 1000;
                }
            });
        }

        // Total Games - Set 1
        if (criterionId === 1001159979) {
            offer.outcomes.forEach(outcome => {
                if (outcome.type === 'OT_OVER') {
                    odds.totalGamesSet1.over = outcome.odds / 1000;
                    odds.totalGamesSet1.line = outcome.line / 1000;
                } else if (outcome.type === 'OT_UNDER') {
                    odds.totalGamesSet1.under = outcome.odds / 1000;
                }
            });
        }
    });

    return odds;
}

// Handle match selection and populate odds
export async function handleMatchChange() {
    const eventId = document.getElementById('matchSelect').value;
    const tournamentId = document.getElementById('tournamentSelect').value;

    if (!eventId) {
        clearInputs();
        return;
    }

    // Get player names and tour from selected event
    let player1 = null;
    let player2 = null;
    let tour = 'ATP'; // Default to ATP
    if (tournamentId) {
        const tournament = tennisData.tournaments.find(t => t.id == tournamentId);
        if (tournament) {
            const event = tournament.events.find(e => e.id == eventId);
            if (event) {
                player1 = event.homeName;
                player2 = event.awayName;
                tour = event.tour || 'ATP';
            }
        }
    }

    const eventData = await fetchEventOdds(eventId);
    if (!eventData || !eventData.betOffers) {
        console.error('No odds data available');
        return;
    }

    const odds = parseOdds(eventData.betOffers);
    populateInputs(odds);

    // Get surface info
    let surface = 'Hard';
    if (tournamentId) {
        const tournament = tennisData.tournaments.find(t => t.id == tournamentId);
        if (tournament) {
            surface = detectSurface(tournament.name);
            console.log(`Verified Tournament: ${tournament.name} -> Surface: ${surface}`);
        }
    }

    // Set current players for Elo lookup
    if (player1 && player2 && window.setCurrentPlayers) {
        window.setCurrentPlayers(player1, player2, surface, tour);
    }

    // Trigger model calculation with detected surface
    if (runModelCallback) {
        runModelCallback(surface);
    }
}

// Populate input fields with parsed odds
function populateInputs(odds) {
    // Clear inputs first to ensure no stale data
    clearInputs();

    // Match Odds
    if (odds.matchOdds.player1) {
        document.getElementById('player1Odds').value = odds.matchOdds.player1.toFixed(2);
    }
    if (odds.matchOdds.player2) {
        document.getElementById('player2Odds').value = odds.matchOdds.player2.toFixed(2);
    }

    // Total Games Line
    if (odds.totalGames.line) {
        document.getElementById('totalGamesLine').value = odds.totalGames.line.toFixed(1);
    }

    // PHASE 2: Populate Over/Under odds for Fair Total calculation
    if (odds.totalGames.over) {
        const oddsOverEl = document.getElementById('oddsOver');
        if (oddsOverEl) {
            oddsOverEl.value = odds.totalGames.over.toFixed(2);
        }
    }
    if (odds.totalGames.under) {
        const oddsUnderEl = document.getElementById('oddsUnder');
        if (oddsUnderEl) {
            oddsUnderEl.value = odds.totalGames.under.toFixed(2);
        }
    }
}

// Clear all input fields
function clearInputs() {
    const inputs = ['player1Odds', 'player2Odds', 'totalGamesLine', 'oddsOver', 'oddsUnder'];

    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = '';
    });

    // Reset total line styling
    const totalLineInput = document.getElementById('totalGamesLine');
    if (totalLineInput) {
        totalLineInput.style.borderColor = '';
        totalLineInput.style.borderWidth = '';
        totalLineInput.title = '';
    }

    // Clear total info label
    const totalInfoEl = document.getElementById('totalInfo');
    if (totalInfoEl) {
        totalInfoEl.textContent = '';
    }
}

