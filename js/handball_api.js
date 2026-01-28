// Handball API Module
// Handles fetching handball matches and odds from Kambi API
// Inputs: Handicap + Total Goals (not 1X2)

let handballData = {
    leagues: [],
    eventMap: {}
};

let runModelCallback = null;

// API endpoints
const LIST_VIEW_URL = 'https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/listView/handball/all/all/all/matches.json?channel_id=7&channel_id=7&client_id=200&client_id=200&competitionId=undefined&lang=en_GB&lang=en_GB&market=GB&market=GB&useCombined=true&useCombinedLive=true';
const EVENT_URL_BASE = 'https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/betoffer/event/';

export function setRunModelCallback(callback) {
    runModelCallback = callback;
}

// Build league hierarchy from events
function buildHierarchy(events) {
    const leagueMap = new Map();

    events.forEach(event => {
        if (!event.event || !event.event.path || event.event.path.length < 2) return;
        if (event.event.type === 'OT_UNTYPED') return;

        const leaguePath = event.event.path[event.event.path.length - 1];
        const leagueName = leaguePath.name;
        const leagueId = leaguePath.id;

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

        handballData.eventMap[event.event.id] = event;
    });

    handballData.leagues = Array.from(leagueMap.values())
        .sort((a, b) => a.name.localeCompare(b.name));
}

// Fetch handball matches
export async function initLoader() {
    try {
        const response = await fetch(LIST_VIEW_URL);
        const data = await response.json();

        if (data.events && data.events.length > 0) {
            buildHierarchy(data.events);
            populateLeagueSelector();
        } else {
            console.warn('No handball matches available');
        }
    } catch (error) {
        console.error('Error loading handball data:', error);
    }
}

// Populate league dropdown
function populateLeagueSelector() {
    const selector = document.getElementById('leagueSelect');
    if (!selector) return;

    selector.innerHTML = '<option value="">Select League...</option>';

    handballData.leagues.forEach(league => {
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

    const league = handballData.leagues.find(l => l.name === leagueName);
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
        const ncid = Date.now();
        const url = `${EVENT_URL_BASE}${eventId}.json?lang=en_GB&market=GB&client_id=200&channel_id=7&ncid=${ncid}&includeParticipants=true`;
        const response = await fetch(url);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching event odds:', error);
        return null;
    }
}

// Parse odds from bet offers - specifically handicap and total goals
function parseOdds(betOffers) {
    const odds = {
        handicap: { line: null, home: null, away: null, _balance: Infinity },
        totalGoals: { line: null, over: null, under: null, _balance: Infinity }
    };

    betOffers.forEach(offer => {
        if (!offer.outcomes || offer.outcomes.length === 0) return;

        // Handicap (Asian Handicap / Spread)
        if (offer.betOfferType && offer.betOfferType.name === 'Handicap') {
            const homeOutcome = offer.outcomes.find(o => o.type === 'OT_ONE');
            const awayOutcome = offer.outcomes.find(o => o.type === 'OT_TWO');

            if (homeOutcome && awayOutcome && homeOutcome.line != null) {
                const homeOdds = homeOutcome.odds / 1000;
                const awayOdds = awayOutcome.odds / 1000;
                const line = homeOutcome.line / 1000;

                // Pick most balanced line (closest to even odds)
                const balance = Math.abs(homeOdds - 2.0) + Math.abs(awayOdds - 2.0);
                if (balance < odds.handicap._balance) {
                    odds.handicap.line = line;
                    odds.handicap.home = homeOdds;
                    odds.handicap.away = awayOdds;
                    odds.handicap._balance = balance;
                }
            }
        }

        // Total Goals (Over/Under)
        if (offer.betOfferType && offer.betOfferType.name === 'Over/Under') {
            const isTotal = offer.criterion &&
                (offer.criterion.label === 'Total Goals' ||
                 offer.criterion.englishLabel === 'Total Goals' ||
                 offer.criterion.label === 'Total' ||
                 offer.criterion.englishLabel === 'Total');

            if (isTotal) {
                const overOutcome = offer.outcomes.find(o => o.type === 'OT_OVER');
                const underOutcome = offer.outcomes.find(o => o.type === 'OT_UNDER');

                if (overOutcome && underOutcome) {
                    const overOdds = overOutcome.odds / 1000;
                    const underOdds = underOutcome.odds / 1000;
                    const line = (overOutcome.line || underOutcome.line) / 1000;

                    // Pick most balanced line
                    const balance = Math.abs(overOdds - 2.0) + Math.abs(underOdds - 2.0);
                    if (balance < odds.totalGoals._balance) {
                        odds.totalGoals.line = line;
                        odds.totalGoals.over = overOdds;
                        odds.totalGoals.under = underOdds;
                        odds.totalGoals._balance = balance;
                    }
                }
            }
        }
    });

    return odds;
}

// Handle match selection
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

    if (runModelCallback) {
        runModelCallback();
    }
}

// Populate input fields
function populateInputs(odds) {
    clearInputs();

    // Handicap
    if (odds.handicap.line != null) {
        document.getElementById('handicapLine').value = odds.handicap.line.toFixed(1);
    }
    if (odds.handicap.home) {
        document.getElementById('handicapHomeOdds').value = odds.handicap.home.toFixed(2);
    }
    if (odds.handicap.away) {
        document.getElementById('handicapAwayOdds').value = odds.handicap.away.toFixed(2);
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
        'handicapLine', 'handicapHomeOdds', 'handicapAwayOdds',
        'totalGoalsLine', 'overOdds', 'underOdds'
    ];

    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = '';
    });
}
