// Ice Hockey API Module
// Handles fetching ice hockey matches and odds from Kambi API

let iceHockeyData = {
    countries: [],
    eventMap: {}
};

let runModelCallback = null;

// API endpoints - Using Kambi API pattern for ice hockey
const GROUP_URL = 'https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/listView/ice_hockey/all/all/all/matches.json?channel_id=7&client_id=200&lang=en_GB&market=GB&useCombined=true&useCombinedLive=true';
const EVENT_URL_BASE = 'https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/betoffer/event/';

export function setRunModelCallback(callback) {
    runModelCallback = callback;
}

// Build tournament hierarchy from events
function buildHierarchy(events) {
    const countryMap = new Map();

    events.forEach(item => {
        const event = item.event || item;
        // Skip if no path or invalid event
        if (!event.path || event.path.length < 3) return;

        // Path structure: [Sport, Country, Tournament]
        const countryPath = event.path[1];
        const tournamentPath = event.path[2];
        const countryName = countryPath.name;
        const countryId = countryPath.id;
        const tournamentName = tournamentPath.name;
        const tournamentId = tournamentPath.id;

        if (!countryMap.has(countryId)) {
            countryMap.set(countryId, {
                name: countryName,
                id: countryId,
                tournaments: []
            });
        }

        let country = countryMap.get(countryId);
        if (!country.tournaments.find(t => t.id === tournamentId)) {
            country.tournaments.push({
                name: tournamentName,
                id: tournamentId,
                events: []
            });
        }

        let tournament = country.tournaments.find(t => t.id === tournamentId);
        tournament.events.push({
            id: event.id,
            name: event.name,
            homeName: event.homeName,
            awayName: event.awayName,
            start: event.start,
            path: event.path
        });

        // Store full event data
        iceHockeyData.eventMap[event.id] = event;
    });

    // Convert map to array and sort
    iceHockeyData.countries = Array.from(countryMap.values())
        .sort((a, b) => a.name.localeCompare(b.name));
}

// Fetch ice hockey matches from group endpoint
export async function initIceHockeyLoader() {
    try {
        const response = await fetch(GROUP_URL);
        const data = await response.json();

        if (data.events && data.events.length > 0) {
            buildHierarchy(data.events);
            populateCountrySelector();
        }
    } catch (error) {
        console.error('Error loading ice hockey data:', error);
    }
}

// Populate country dropdown
function populateCountrySelector() {
    const selector = document.getElementById('apiCountrySelect');
    if (!selector) return;

    selector.innerHTML = '<option value="">Select Country...</option>';

    iceHockeyData.countries.forEach(country => {
        const option = document.createElement('option');
        option.value = country.id;
        option.textContent = country.name;
        selector.appendChild(option);
    });
}

// Handle country selection
export function handleCountryChange() {
    const countryId = document.getElementById('apiCountrySelect').value;
    const leagueSelect = document.getElementById('apiLeagueSelect');

    if (!countryId) {
        leagueSelect.innerHTML = '<option value="">Select country</option>';
        leagueSelect.disabled = true;
        return;
    }

    const country = iceHockeyData.countries.find(c => c.id == countryId);
    if (!country || !country.tournaments || country.tournaments.length === 0) {
        leagueSelect.innerHTML = '<option value="">No leagues available</option>';
        leagueSelect.disabled = true;
        return;
    }

    leagueSelect.innerHTML = '<option value="">Select Competition...</option>';

    country.tournaments.forEach(tournament => {
        const option = document.createElement('option');
        option.value = tournament.id;
        option.textContent = tournament.name;
        leagueSelect.appendChild(option);
    });

    leagueSelect.disabled = false;
}

// Handle league selection
export function handleLeagueChange() {
    const leagueId = document.getElementById('apiLeagueSelect').value;
    const matchSelect = document.getElementById('apiMatchSelect');

    if (!leagueId) {
        matchSelect.innerHTML = '<option value="">Select competition</option>';
        matchSelect.disabled = true;
        return;
    }

    // Find the tournament across all countries
    let tournament = null;
    for (const country of iceHockeyData.countries) {
        tournament = country.tournaments.find(t => t.id == leagueId);
        if (tournament) break;
    }

    if (!tournament || !tournament.events || tournament.events.length === 0) {
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
        matchOdds: { home: null, draw: null, away: null },
        puckLine: { home: null, away: null, line: null },
        total: { over: null, under: null, line: null }
    };

    let bestPuckLineScore = null;
    let bestTotalScore = null;

    betOffers.forEach(offer => {
        const criterionId = offer.criterion?.id;
        const betOfferType = offer.betOfferType?.name;
        const label = (offer.criterion?.label || "").toLowerCase();

        // Match Odds (1X2 Regulation)
        if (betOfferType === 'Match' && (label === 'full time' || label === 'match' || label.includes('1x2'))) {
            offer.outcomes.forEach(outcome => {
                if (outcome.type === 'OT_ONE') {
                    odds.matchOdds.home = outcome.odds / 1000;
                } else if (outcome.type === 'OT_CROSS') {
                    odds.matchOdds.draw = outcome.odds / 1000;
                } else if (outcome.type === 'OT_TWO') {
                    odds.matchOdds.away = outcome.odds / 1000;
                }
            });
        }

        // Puck Line / Handicap
        if (betOfferType === 'Handicap' || label.includes('handicap') || label.includes('puck line')) {
            let home = null;
            let away = null;
            let line = null;

            offer.outcomes.forEach(outcome => {
                if (outcome.type === 'OT_ONE') {
                    home = outcome.odds / 1000;
                    line = outcome.line / 1000;
                } else if (outcome.type === 'OT_TWO') {
                    away = outcome.odds / 1000;
                }
            });

            if (home && away) {
                const score = Math.abs(home - 2) + Math.abs(away - 2);
                if (bestPuckLineScore === null || score < bestPuckLineScore) {
                    bestPuckLineScore = score;
                    odds.puckLine.home = home;
                    odds.puckLine.away = away;
                    odds.puckLine.line = line;
                }
            }
        }

        // Total Goals
        if (betOfferType === 'Over/Under' || label.includes('total goals')) {
            let over = null;
            let under = null;
            let line = null;

            offer.outcomes.forEach(outcome => {
                if (outcome.type === 'OT_OVER') {
                    over = outcome.odds / 1000;
                    line = outcome.line / 1000;
                } else if (outcome.type === 'OT_UNDER') {
                    under = outcome.odds / 1000;
                }
            });

            if (over && under) {
                const score = Math.abs(over - 2) + Math.abs(under - 2);
                if (bestTotalScore === null || score < bestTotalScore) {
                    bestTotalScore = score;
                    odds.total.over = over;
                    odds.total.under = under;
                    odds.total.line = line;
                }
            }
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
    if (odds.matchOdds.draw) {
        document.getElementById('drawOdds').value = odds.matchOdds.draw.toFixed(2);
    }
    if (odds.matchOdds.away) {
        document.getElementById('awayOdds').value = odds.matchOdds.away.toFixed(2);
    }

    // Puck Line
    if (odds.puckLine.line !== null) {
        document.getElementById('puckLine').value = odds.puckLine.line.toFixed(1);
    }
    if (odds.puckLine.home) {
        document.getElementById('puckHomeOdds').value = odds.puckLine.home.toFixed(2);
    }
    if (odds.puckLine.away) {
        document.getElementById('puckAwayOdds').value = odds.puckLine.away.toFixed(2);
    }

    // Total
    if (odds.total.line !== null) {
        document.getElementById('totalGoalsLine').value = odds.total.line.toFixed(1);
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
    const inputs = ['homeOdds', 'drawOdds', 'awayOdds', 'puckLine', 'puckHomeOdds', 'puckAwayOdds', 'totalGoalsLine', 'overOdds', 'underOdds'];

    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = '';
    });
}
