// Football API Module
// Handles fetching football matches and odds from Kambi API

let footballData = {
    countries: [],
    leagues: [],
    events: [],
    eventMap: {}
};

let runModelCallback = null;

// API endpoints - Using Kambi API pattern
const GROUP_URL = 'https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/listView/football/all/all/all/competitions.json?channel_id=7&client_id=200&lang=en_GB&market=GB&useCombined=true&useCombinedLive=true';
const EVENT_URL_BASE = 'https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/betoffer/event/';

export function setRunModelCallback(callback) {
    runModelCallback = callback;
}

// Build country and league hierarchy from events
function buildHierarchy(events) {
    const countryMap = new Map();
    const leagueMap = new Map();

    events.forEach(event => {
        if (!event.path || event.path.length < 3) return;

        // Path structure: [Country, League, Tournament/Event]
        const countryPath = event.path[0];
        const leaguePath = event.path[1];

        const countryName = countryPath.name;
        const countryId = countryPath.id;
        const leagueName = leaguePath.name;
        const leagueId = leaguePath.id;

        // Add to country map
        if (!countryMap.has(countryId)) {
            countryMap.set(countryId, {
                name: countryName,
                id: countryId,
                leagues: []
            });
        }

        // Add to league map under country
        if (!leagueMap.has(leagueId)) {
            leagueMap.set(leagueId, {
                name: leagueName,
                id: leagueId,
                countryId: countryId,
                events: []
            });
        }

        leagueMap.get(leagueId).events.push({
            id: event.id,
            name: event.name,
            homeName: event.homeName,
            awayName: event.awayName,
            start: event.start,
            path: event.path
        });

        // Store full event data
        footballData.eventMap[event.id] = event;
    });

    // Build country-league relationships
    leagueMap.forEach(league => {
        const country = countryMap.get(league.countryId);
        if (country) {
            country.leagues.push(league);
        }
    });

    // Convert to arrays and sort
    footballData.countries = Array.from(countryMap.values())
        .sort((a, b) => a.name.localeCompare(b.name));

    footballData.leagues = Array.from(leagueMap.values())
        .sort((a, b) => a.name.localeCompare(b.name));
}

// Fetch football matches
export async function initApiLoader() {
    try {
        const response = await fetch(GROUP_URL);
        const data = await response.json();

        if (data.events && data.events.length > 0) {
            buildHierarchy(data.events);
            populateCountrySelector();
        }
    } catch (error) {
        console.error('Error loading football data:', error);
    }
}

// Populate country dropdown
function populateCountrySelector() {
    const selector = document.getElementById('apiCountrySelect');
    if (!selector) return;

    selector.innerHTML = '<option value="">Select Country...</option>';

    footballData.countries.forEach(country => {
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

    const country = footballData.countries.find(c => c.id == countryId);
    if (!country || !country.leagues || country.leagues.length === 0) {
        leagueSelect.innerHTML = '<option value="">No leagues available</option>';
        leagueSelect.disabled = true;
        return;
    }

    leagueSelect.innerHTML = '<option value="">Select Competition...</option>';

    country.leagues.forEach(league => {
        const option = document.createElement('option');
        option.value = league.id;
        option.textContent = league.name;
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

    const league = footballData.leagues.find(l => l.id == leagueId);
    if (!league || !league.events || league.events.length === 0) {
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

// Fetch event details and odds
export async function loadEventDetails(eventId) {
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

// Fetch detailed odds for a specific event
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

// Parse odds from bet offers
function parseOdds(betOffers) {
    const odds = {
        matchOdds: { home: null, draw: null, away: null },
        goalLine: { over: null, under: null, line: null }
    };

    betOffers.forEach(offer => {
        const criterionId = offer.criterion.id;

        // 1X2 Odds
        if (criterionId === 1001159551) {
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

        // Goal Line (Total Goals)
        if (criterionId === 1001159891) {
            offer.outcomes.forEach(outcome => {
                if (outcome.type === 'OT_OVER') {
                    odds.goalLine.over = outcome.odds / 1000;
                    odds.goalLine.line = outcome.line / 1000;
                } else if (outcome.type === 'OT_UNDER') {
                    odds.goalLine.under = outcome.odds / 1000;
                }
            });
        }
    });

    return odds;
}

// Populate input fields with parsed odds
function populateInputs(odds) {
    clearInputs();

    // 1X2 Odds
    if (odds.matchOdds.home) {
        document.getElementById('homeOdds').value = odds.matchOdds.home.toFixed(2);
    }
    if (odds.matchOdds.draw) {
        document.getElementById('drawOdds').value = odds.matchOdds.draw.toFixed(2);
    }
    if (odds.matchOdds.away) {
        document.getElementById('awayOdds').value = odds.matchOdds.away.toFixed(2);
    }

    // Goal Line
    if (odds.goalLine.line) {
        document.getElementById('goalLine').value = odds.goalLine.line.toFixed(1);
    }
    if (odds.goalLine.over) {
        document.getElementById('overOdds').value = odds.goalLine.over.toFixed(2);
    }
    if (odds.goalLine.under) {
        document.getElementById('underOdds').value = odds.goalLine.under.toFixed(2);
    }
}

// Clear all input fields
function clearInputs() {
    const inputs = ['homeOdds', 'drawOdds', 'awayOdds', 'goalLine', 'overOdds', 'underOdds'];

    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = '';
    });
}