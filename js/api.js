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
const GROUP_URL = 'https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/group.json?channel_id=7&client_id=200&lang=en_GB&market=GB';
const EVENT_URL_BASE = 'https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/betoffer/event/';
const EVENTS_BY_GROUP_URL = 'https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/listView/football';

export function setRunModelCallback(callback) {
    runModelCallback = callback;
}

// Build country and league hierarchy from group.json response
function buildHierarchyFromGroups(groupData) {
    const countryMap = new Map();
    const leagueMap = new Map();

    // Find Football group in the response
    const footballGroup = groupData.group?.groups?.find(g => 
        g.englishName === 'Football' || g.name === 'Football' || g.sport === 'FOOTBALL'
    );

    if (!footballGroup || !footballGroup.groups) {
        console.error('Football group not found in API response');
        return;
    }

    // Iterate through countries (first level under Football)
    footballGroup.groups.forEach(countryGroup => {
        const countryId = countryGroup.id;
        const countryName = countryGroup.englishName || countryGroup.name;

        // Skip if no leagues under this country
        if (!countryGroup.groups || countryGroup.groups.length === 0) return;

        // Add country to map
        if (!countryMap.has(countryId)) {
            countryMap.set(countryId, {
                name: countryName,
                id: countryId,
                boCount: countryGroup.boCount || 0,
                leagues: []
            });
        }

        // Iterate through leagues (second level under country)
        countryGroup.groups.forEach(leagueGroup => {
            // Only include groups that have sport: FOOTBALL (actual leagues)
            if (leagueGroup.sport !== 'FOOTBALL') return;

            const leagueId = leagueGroup.id;
            const leagueName = leagueGroup.englishName || leagueGroup.name;

            if (!leagueMap.has(leagueId)) {
                leagueMap.set(leagueId, {
                    name: leagueName,
                    id: leagueId,
                    countryId: countryId,
                    countryName: countryName,
                    termKey: leagueGroup.termKey || '',
                    eventCount: leagueGroup.eventCount || 0,
                    boCount: leagueGroup.boCount || 0,
                    sortOrder: leagueGroup.sortOrder || '999',
                    events: []
                });
            }
        });
    });

    // Build country-league relationships
    leagueMap.forEach(league => {
        const country = countryMap.get(league.countryId);
        if (country) {
            country.leagues.push(league);
        }
    });

    // Sort leagues within each country by sortOrder, then by name
    countryMap.forEach(country => {
        country.leagues.sort((a, b) => {
            const orderA = parseInt(a.sortOrder) || 999;
            const orderB = parseInt(b.sortOrder) || 999;
            if (orderA !== orderB) return orderA - orderB;
            return a.name.localeCompare(b.name);
        });
    });

    // Convert to arrays and sort countries by boCount (most popular first), then by name
    footballData.countries = Array.from(countryMap.values())
        .filter(c => c.leagues.length > 0) // Only include countries with leagues
        .sort((a, b) => {
            // Sort by boCount descending (most popular first)
            if (b.boCount !== a.boCount) return b.boCount - a.boCount;
            return a.name.localeCompare(b.name);
        });

    footballData.leagues = Array.from(leagueMap.values())
        .sort((a, b) => a.name.localeCompare(b.name));

    console.log(`Loaded ${footballData.countries.length} countries with ${footballData.leagues.length} leagues`);
}

// Fetch football tournaments/leagues structure
export async function initApiLoader() {
    try {
        const response = await fetch(GROUP_URL);
        const data = await response.json();

        if (data.group) {
            buildHierarchyFromGroups(data);
            populateCountrySelector();
        } else {
            console.error('Invalid API response structure');
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
        option.textContent = `${country.name} (${country.leagues.length})`;
        selector.appendChild(option);
    });
}

// Handle country selection
export function handleCountryChange() {
    const countryId = document.getElementById('apiCountrySelect').value;
    const leagueSelect = document.getElementById('apiLeagueSelect');
    const matchSelect = document.getElementById('apiMatchSelect');

    // Reset match selector
    matchSelect.innerHTML = '<option value="">Select competition</option>';
    matchSelect.disabled = true;

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
        option.textContent = `${league.name} (${league.eventCount} events)`;
        option.dataset.termKey = league.termKey;
        option.dataset.countryName = country.name;
        leagueSelect.appendChild(option);
    });

    leagueSelect.disabled = false;
}

// Fetch events for a specific league
async function fetchLeagueEvents(leagueId, termKey, countryName) {
    try {
        // Build the URL path for the league events
        // Format: /listView/football/{country}/{league}/all/matches.json
        const countrySlug = countryName.toLowerCase().replace(/\s+/g, '_');
        const leagueSlug = termKey || 'all';
        
        const url = `${EVENTS_BY_GROUP_URL}/${countrySlug}/${leagueSlug}/all/matches.json?channel_id=7&client_id=200&lang=en_GB&market=GB&useCombined=true&useCombinedLive=true`;
        
        console.log('Fetching matches from:', url);
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.events && data.events.length > 0) {
            // Parse the nested event structure - events contain {event, betOffers}
            return parseMatchesFromResponse(data.events);
        }
        
        // Fallback: try using group ID directly
        const fallbackUrl = `https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/listView/group/${leagueId}.json?channel_id=7&client_id=200&lang=en_GB&market=GB&useCombined=true&useCombinedLive=true`;
        console.log('Trying fallback URL:', fallbackUrl);
        const fallbackResponse = await fetch(fallbackUrl);
        const fallbackData = await fallbackResponse.json();
        
        if (fallbackData.events && fallbackData.events.length > 0) {
            return parseMatchesFromResponse(fallbackData.events);
        }
        
        return [];
    } catch (error) {
        console.error('Error fetching league events:', error);
        return [];
    }
}

// Parse matches from API response - handles nested {event, betOffers} structure
function parseMatchesFromResponse(eventsArray) {
    return eventsArray.map(item => {
        const event = item.event;
        const betOffers = item.betOffers || [];
        
        // Extract 1X2 odds from betOffers (Full Time criterion)
        let matchOdds = { home: null, draw: null, away: null };
        let goalLine = { over: null, under: null, line: null };
        
        betOffers.forEach(offer => {
            // Match (1X2) odds - criterion label "Full Time" or betOfferType name "Match"
            if (offer.betOfferType && offer.betOfferType.name === 'Match') {
                offer.outcomes.forEach(outcome => {
                    if (outcome.type === 'OT_ONE') {
                        matchOdds.home = outcome.odds / 1000;
                    } else if (outcome.type === 'OT_CROSS') {
                        matchOdds.draw = outcome.odds / 1000;
                    } else if (outcome.type === 'OT_TWO') {
                        matchOdds.away = outcome.odds / 1000;
                    }
                });
            }
            
            // Over/Under odds - betOfferType name "Over/Under"
            if (offer.betOfferType && offer.betOfferType.name === 'Over/Under') {
                offer.outcomes.forEach(outcome => {
                    if (outcome.type === 'OT_OVER') {
                        goalLine.over = outcome.odds / 1000;
                        goalLine.line = outcome.line / 1000;
                    } else if (outcome.type === 'OT_UNDER') {
                        goalLine.under = outcome.odds / 1000;
                    }
                });
            }
        });
        
        return {
            id: event.id,
            name: event.name,
            englishName: event.englishName,
            homeName: event.homeName,
            awayName: event.awayName,
            start: event.start,
            state: event.state,
            group: event.group,
            path: event.path,
            sport: event.sport,
            tags: event.tags,
            matchOdds: matchOdds,
            goalLine: goalLine,
            betOffers: betOffers
        };
    });
}

// Handle league selection
export async function handleLeagueChange() {
    const leagueSelect = document.getElementById('apiLeagueSelect');
    const leagueId = leagueSelect.value;
    const matchSelect = document.getElementById('apiMatchSelect');

    if (!leagueId) {
        matchSelect.innerHTML = '<option value="">Select competition</option>';
        matchSelect.disabled = true;
        return;
    }

    // Get termKey and countryName from selected option
    const selectedOption = leagueSelect.options[leagueSelect.selectedIndex];
    const termKey = selectedOption.dataset.termKey;
    const countryName = selectedOption.dataset.countryName;

    // Show loading state
    matchSelect.innerHTML = '<option value="">Loading matches...</option>';
    matchSelect.disabled = true;

    // Fetch events for this league
    const events = await fetchLeagueEvents(leagueId, termKey, countryName);
    
    console.log(`Fetched ${events.length} matches for ${countryName} - ${termKey}`);
    
    // Update league data with events
    const league = footballData.leagues.find(l => l.id == leagueId);
    if (league) {
        league.events = events;
    }
    
    // Store full event data in eventMap (includes pre-parsed odds)
    events.forEach(event => {
        footballData.eventMap[event.id] = event;
    });

    if (!events || events.length === 0) {
        matchSelect.innerHTML = '<option value="">No matches available</option>';
        matchSelect.disabled = true;
        return;
    }

    matchSelect.innerHTML = '<option value="">Select Match...</option>';

    // Sort events by start time
    events.sort((a, b) => new Date(a.start) - new Date(b.start));

    events.forEach(event => {
        const option = document.createElement('option');
        option.value = event.id;
        
        // Format start time
        const startDate = new Date(event.start);
        const timeStr = startDate.toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Show odds preview if available
        let oddsPreview = '';
        if (event.matchOdds && event.matchOdds.home) {
            oddsPreview = ` [${event.matchOdds.home.toFixed(2)} - ${event.matchOdds.draw?.toFixed(2) || '-'} - ${event.matchOdds.away?.toFixed(2) || '-'}]`;
        }
        
        option.textContent = `${event.homeName} vs ${event.awayName} (${timeStr})${oddsPreview}`;
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

    // First try to use pre-fetched odds from eventMap
    const cachedEvent = footballData.eventMap[eventId];
    if (cachedEvent && cachedEvent.matchOdds) {
        console.log('Using cached odds for event:', eventId);
        populateInputsFromEvent(cachedEvent);
        
        // Trigger model calculation
        if (runModelCallback) {
            runModelCallback();
        }
        return;
    }

    // Fallback: fetch from API if not in cache
    console.log('Fetching odds from API for event:', eventId);
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

// Populate inputs from cached event data
function populateInputsFromEvent(event) {
    clearInputs();
    
    // 1X2 Odds
    if (event.matchOdds) {
        if (event.matchOdds.home) {
            document.getElementById('homeOdds').value = event.matchOdds.home.toFixed(2);
        }
        if (event.matchOdds.draw) {
            document.getElementById('drawOdds').value = event.matchOdds.draw.toFixed(2);
        }
        if (event.matchOdds.away) {
            document.getElementById('awayOdds').value = event.matchOdds.away.toFixed(2);
        }
    }
    
    // Goal Line
    if (event.goalLine) {
        if (event.goalLine.line) {
            document.getElementById('goalLine').value = event.goalLine.line.toFixed(1);
        }
        if (event.goalLine.over) {
            document.getElementById('overOdds').value = event.goalLine.over.toFixed(2);
        }
        if (event.goalLine.under) {
            document.getElementById('underOdds').value = event.goalLine.under.toFixed(2);
        }
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
