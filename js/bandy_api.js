// Bandy API Module
// Handles fetching bandy matches and odds from Kambi API

let bandyData = {
    countries: [],
    eventMap: {}
};

let runModelCallback = null;

// API endpoints - Using Kambi API pattern for bandy
const GROUP_URL = 'https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/listView/bandy/all/all/all/matches.json?channel_id=7&client_id=200&lang=en_GB&market=GB&useCombined=true&useCombinedLive=true';
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
        bandyData.eventMap[event.id] = event;
    });

    // Convert map to array and sort
    bandyData.countries = Array.from(countryMap.values())
        .sort((a, b) => a.name.localeCompare(b.name));
}

// Fetch bandy matches from group endpoint
export async function initBandyLoader() {
    try {
        const response = await fetch(GROUP_URL);
        const data = await response.json();

        if (data.events && data.events.length > 0) {
            buildHierarchy(data.events);
            populateCountrySelector();
        } else {
            // No events available
            const selector = document.getElementById('apiCountrySelect');
            if (selector) {
                selector.innerHTML = '<option value="">No matches available</option>';
            }
        }
    } catch (error) {
        console.error('Error loading bandy data:', error);
        const selector = document.getElementById('apiCountrySelect');
        if (selector) {
            selector.innerHTML = '<option value="">Error loading data</option>';
        }
    }
}

// Populate country dropdown
function populateCountrySelector() {
    const selector = document.getElementById('apiCountrySelect');
    if (!selector) return;

    selector.innerHTML = '<option value="">Select Country...</option>';

    bandyData.countries.forEach(country => {
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
    const matchSelect = document.getElementById('apiMatchSelect');

    // Reset match selector
    if (matchSelect) {
        matchSelect.innerHTML = '<option value="">Select competition</option>';
        matchSelect.disabled = true;
    }

    if (!countryId) {
        leagueSelect.innerHTML = '<option value="">Select country</option>';
        leagueSelect.disabled = true;
        return;
    }

    const country = bandyData.countries.find(c => c.id == countryId);
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
    for (const country of bandyData.countries) {
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
        total: { over: null, under: null, line: null }
    };

    let bestTotalScore = null;
    let bestTotalPriority = 999;

    betOffers.forEach(offer => {
        const criterionId = offer.criterion?.id;
        const betOfferType = offer.betOfferType?.name;
        const label = (offer.criterion?.label || "").toLowerCase();

        // Match Odds (1X2 Regulation) - check for 3-way outcome with draw
        // Bandy labels: "regulation time", "regular time", "three way", "1x2", "match", "full time"
        const is1X2Market = betOfferType === 'Match' &&
            offer.outcomes &&
            offer.outcomes.some(o => o.type === 'OT_CROSS');

        // Also accept explicit regulation time labels
        const hasRegulationLabel = label.includes('regulation') ||
            label.includes('regular time') ||
            label.includes('three way') ||
            label.includes('1x2') ||
            label === 'full time' ||
            label === 'match';

        if (is1X2Market || (betOfferType === 'Match' && hasRegulationLabel)) {
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

        // Total Goals - prioritize full match totals, avoid period/half totals
        const isPeriodTotal = label.includes('period') || label.includes('1st') ||
            label.includes('2nd') || label.includes('half');

        if ((betOfferType === 'Over/Under' || label.includes('total')) && !isPeriodTotal) {
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

            if (over && under && line) {
                // Priority: prefer lines around 7.0-9.0 for bandy (typical main total - higher scoring than ice hockey)
                // Also prioritize offers with "total goals" or "match total" in label
                let priority = 2; // default
                if (label.includes('total goals') || label.includes('match total')) {
                    priority = 0; // highest priority for explicit total goals
                } else if (line >= 6.5 && line <= 10.5) {
                    priority = 1; // likely main total line for bandy
                }

                // If same priority, prefer odds closer to even
                const score = Math.abs(over - 2) + Math.abs(under - 2);

                if (priority < bestTotalPriority ||
                    (priority === bestTotalPriority && (bestTotalScore === null || score < bestTotalScore))) {
                    bestTotalPriority = priority;
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

    // Total Goals
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
    const inputs = ['homeOdds', 'drawOdds', 'awayOdds', 'totalGoalsLine', 'overOdds', 'underOdds'];

    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = '';
    });
}

// Legacy exports for backward compatibility with existing HTML
export function initLoader() {
    initBandyLoader();
}
