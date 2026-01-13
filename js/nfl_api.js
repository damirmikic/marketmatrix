// NFL (American Football) API Module
// Fetches matches from Kambi and organizes them by Country > Competition > Events

// Using the user-provided endpoint for NFL matches
const NFL_LIST_URL = "https://eu1.offering-api.kambicdn.com/offering/v2018/pivusinrl-law/listView/american_football/nfl/all/all/matches.json?lang=en_US&market=US&client_id=200&channel_id=7&useCombined=true&useCombinedLive=true";

// Event detail endpoint template
const NFL_EVENT_URL_BASE = "https://eu1.offering-api.kambicdn.com/offering/v2018/pivusinrl-law/betoffer/event/";

let nflData = {
    countries: [],    // { name, termKey, competitions: [...] }
    eventMap: {}      // eventId -> full event data
};

let runModelCallback = null;

export function setRunModelCallback(cb) {
    runModelCallback = cb;
}

// Parse the flat event list into Country > Competition > Events hierarchy
function buildHierarchy(events) {
    const countryMap = new Map();

    events.forEach(item => {
        const e = item.event;
        const path = e.path;

        // Validate: must have home/away names (exclude outrights)
        if (!e.homeName || !e.awayName) return;

        // Filter out OT_UNTYPED (outrights)
        if (item.betOffers && item.betOffers.length > 0) {
            const firstOffer = item.betOffers[0];
            if (firstOffer.outcomes && firstOffer.outcomes.every(o => o.type === 'OT_UNTYPED')) {
                return;
            }
        }

        // Path structure: [Sport, Country, Competition]
        if (!path || path.length < 2) return;

        let countryName, countryTerm, compName, compTerm;

        if (path.length === 2) {
            // No country, just sport + competition (e.g., NFL, NCAA)
            countryName = path[1].englishName || path[1].name;
            countryTerm = path[1].termKey;
            compName = path[1].englishName || path[1].name;
            compTerm = path[1].termKey;
        } else {
            // path[1] = Country, path[2] = Competition
            countryName = path[1].englishName || path[1].name;
            countryTerm = path[1].termKey;
            compName = path[2].englishName || path[2].name;
            compTerm = path[2].termKey;
        }

        // Get or create country
        if (!countryMap.has(countryTerm)) {
            countryMap.set(countryTerm, {
                name: countryName,
                termKey: countryTerm,
                competitions: new Map()
            });
        }
        const country = countryMap.get(countryTerm);

        // Get or create competition
        if (!country.competitions.has(compTerm)) {
            country.competitions.set(compTerm, {
                name: compName,
                termKey: compTerm,
                id: e.groupId,
                events: []
            });
        }
        const comp = country.competitions.get(compTerm);

        // Add event
        comp.events.push(item);

        // Store in event map for quick lookup
        nflData.eventMap[e.id] = item;
    });

    // Convert Maps to arrays
    const countries = [];
    countryMap.forEach(country => {
        const comps = [];
        country.competitions.forEach(comp => {
            if (comp.events.length > 0) {
                comps.push({
                    name: comp.name,
                    termKey: comp.termKey,
                    id: comp.id,
                    events: comp.events
                });
            }
        });
        if (comps.length > 0) {
            countries.push({
                name: country.name,
                termKey: country.termKey,
                competitions: comps
            });
        }
    });

    // Sort countries alphabetically, but put major leagues first
    const priorityCountries = ['usa', 'nfl', 'ncaa', 'united_states'];
    countries.sort((a, b) => {
        const aIdx = priorityCountries.indexOf(a.termKey.toLowerCase());
        const bIdx = priorityCountries.indexOf(b.termKey.toLowerCase());
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        return a.name.localeCompare(b.name);
    });

    return countries;
}

export async function initNFLLoader() {
    const countrySelect = document.getElementById('apiCountrySelect');
    if (!countrySelect) return;

    try {
        countrySelect.innerHTML = '<option value="">Loading...</option>';

        const response = await fetch(NFL_LIST_URL);
        const data = await response.json();

        if (!data.events || data.events.length === 0) {
            countrySelect.innerHTML = '<option value="">No matches available</option>';
            return;
        }

        // Build hierarchy from flat list
        nflData.countries = buildHierarchy(data.events);

        // Populate country dropdown
        let html = '<option value="">Select Country/Region</option>';
        nflData.countries.forEach((country, idx) => {
            html += `<option value="${idx}">${country.name}</option>`;
        });
        countrySelect.innerHTML = html;

        console.log(`Loaded ${data.events.length} NFL events into ${nflData.countries.length} countries`);
    } catch (err) {
        countrySelect.innerHTML = '<option value="">Error loading</option>';
        console.error("NFL API Init Error:", err);
    }
}

export function handleCountryChange() {
    const leagueSelect = document.getElementById('apiLeagueSelect');
    const matchSelect = document.getElementById('apiMatchSelect');
    const countryIdx = document.getElementById('apiCountrySelect').value;

    // Reset downstream
    matchSelect.innerHTML = '<option value="">Select competition</option>';
    matchSelect.disabled = true;

    if (countryIdx === "") {
        leagueSelect.innerHTML = '<option value="">Select country first</option>';
        leagueSelect.disabled = true;
        return;
    }

    const country = nflData.countries[countryIdx];
    if (country && country.competitions.length > 0) {
        let html = '<option value="">Select Competition</option>';
        country.competitions.forEach((comp, idx) => {
            html += `<option value="${idx}">${comp.name} (${comp.events.length})</option>`;
        });
        leagueSelect.innerHTML = html;
        leagueSelect.disabled = false;
    } else {
        leagueSelect.innerHTML = '<option value="">No competitions</option>';
        leagueSelect.disabled = true;
    }
}

export function handleLeagueChange() {
    const countryIdx = document.getElementById('apiCountrySelect').value;
    const leagueIdx = document.getElementById('apiLeagueSelect').value;
    const matchSelect = document.getElementById('apiMatchSelect');

    if (countryIdx === "" || leagueIdx === "") {
        matchSelect.innerHTML = '<option value="">Select competition first</option>';
        matchSelect.disabled = true;
        return;
    }

    const country = nflData.countries[countryIdx];
    const competition = country.competitions[leagueIdx];

    if (competition && competition.events.length > 0) {
        let html = '<option value="">Select Match</option>';
        competition.events.forEach((item) => {
            const e = item.event;
            const startTime = new Date(e.start).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            // NFL display: Home vs Away format (API sends as AWAY@HOME, we display HOME vs AWAY)
            const displayName = `${e.homeName} vs ${e.awayName}`;
            html += `<option value="${e.id}">${displayName} (${startTime})</option>`;
        });
        matchSelect.innerHTML = html;
        matchSelect.disabled = false;
    } else {
        matchSelect.innerHTML = '<option value="">No matches</option>';
        matchSelect.disabled = true;
    }
}

export async function handleMatchChange() {
    const eventId = document.getElementById('apiMatchSelect').value;
    if (!eventId) return;

    // Show loading state
    const matchSelect = document.getElementById('apiMatchSelect');
    matchSelect.disabled = true;

    try {
        // Fetch detailed event data from the event-specific endpoint
        const eventUrl = `${NFL_EVENT_URL_BASE}${eventId}.json?lang=en_US&market=US&client_id=200&channel_id=7&includeParticipants=true`;

        const response = await fetch(eventUrl);
        const data = await response.json();

        if (!data || !data.betOffers) {
            console.error("No bet offers found for event:", eventId);
            alert("No betting markets available for this match.");
            matchSelect.disabled = false;
            return;
        }

        loadMatchData(data);
        matchSelect.disabled = false;

    } catch (err) {
        console.error("Error loading NFL event details:", err);
        alert("Failed to load match details. Please try again.");
        matchSelect.disabled = false;
    }
}

function loadMatchData(data) {
    try {
        const offers = data.betOffers || [];
        const event = data.events ? data.events[0] : {};

        console.log("Loading NFL Match:", event.englishName || event.name);

        // 1. Find Moneyline (Match Winner) - 2-way market
        const moneylineOffer = offers.find(bo => {
            const crit = bo.criterion || {};
            const label = (crit.englishLabel || crit.label || "").toLowerCase();
            return (label.includes("moneyline") ||
                    label.includes("match winner") ||
                    label.includes("1x2")) &&
                   bo.outcomes &&
                   bo.outcomes.length === 2;
        });

        if (moneylineOffer) {
            console.log("Moneyline Market:", moneylineOffer.criterion.label);
            const home = moneylineOffer.outcomes.find(o => o.type === "OT_ONE");
            const away = moneylineOffer.outcomes.find(o => o.type === "OT_TWO");

            if (home) document.getElementById('homeOdds').value = (home.odds / 1000).toFixed(2);
            if (away) document.getElementById('awayOdds').value = (away.odds / 1000).toFixed(2);
        }

        // 2. Find Point Spread (Handicap) - Try MAIN_LINE first, then fallback to any spread market
        let spreadOffer = offers.find(bo => {
            const crit = bo.criterion || {};
            const label = (crit.englishLabel || crit.label || "").toLowerCase();
            const isMain = bo.tags && bo.tags.includes("MAIN_LINE");
            return (label.includes("point spread") ||
                    label.includes("spread") ||
                    label.includes("handicap")) &&
                   isMain &&
                   bo.outcomes &&
                   bo.outcomes.length === 2;
        });

        // Fallback: If no MAIN_LINE spread found, get any spread/handicap market
        if (!spreadOffer) {
            spreadOffer = offers.find(bo => {
                const crit = bo.criterion || {};
                const label = (crit.englishLabel || crit.label || "").toLowerCase();
                return (label.includes("point spread") ||
                        label.includes("spread") ||
                        (label.includes("handicap") && label.includes("including overtime"))) &&
                       bo.outcomes &&
                       bo.outcomes.length === 2 &&
                       bo.outcomes.some(o => o.line !== undefined);
            });
        }

        if (spreadOffer) {
            console.log("Spread Market:", spreadOffer.criterion.label);
            const home = spreadOffer.outcomes.find(o => o.type === "OT_ONE");
            const away = spreadOffer.outcomes.find(o => o.type === "OT_TWO");

            if (home && home.line !== undefined) {
                document.getElementById('spreadLine').value = (home.line / 1000).toFixed(1);
                document.getElementById('spreadHomeOdds').value = (home.odds / 1000).toFixed(2);
            }
            if (away && away.odds !== undefined) {
                document.getElementById('spreadAwayOdds').value = (away.odds / 1000).toFixed(2);
            }
        }

        // 3. Find Total Points (Over/Under) - Try MAIN_LINE first, then fallback to any total market
        let totalOffer = offers.find(bo => {
            const crit = bo.criterion || {};
            const label = (crit.englishLabel || crit.label || "").toLowerCase();
            const isMain = bo.tags && bo.tags.includes("MAIN_LINE");
            return (label.includes("total points") ||
                    label.includes("total") ||
                    label.includes("over/under")) &&
                   isMain &&
                   bo.outcomes &&
                   bo.outcomes.length === 2;
        });

        // Fallback: If no MAIN_LINE total found, get any total points market
        if (!totalOffer) {
            totalOffer = offers.find(bo => {
                const crit = bo.criterion || {};
                const label = (crit.englishLabel || crit.label || "").toLowerCase();
                return (label.includes("total points") ||
                        (label.includes("total") && label.includes("including overtime"))) &&
                       bo.outcomes &&
                       bo.outcomes.length === 2 &&
                       bo.outcomes.some(o => o.type === "OT_OVER" || o.type === "OT_UNDER");
            });
        }

        if (totalOffer) {
            console.log("Total Points Market:", totalOffer.criterion.label);
            const over = totalOffer.outcomes.find(o => o.type === "OT_OVER");
            const under = totalOffer.outcomes.find(o => o.type === "OT_UNDER");

            if (over && over.line !== undefined) {
                document.getElementById('totalLine').value = (over.line / 1000).toFixed(1);
                document.getElementById('overOdds').value = (over.odds / 1000).toFixed(2);
            }
            if (under && under.odds !== undefined) {
                document.getElementById('underOdds').value = (under.odds / 1000).toFixed(2);
            }
        }

        // Log all available markets for debugging
        console.log("Available markets:", offers.map(o => ({
            label: o.criterion?.label || 'Unknown',
            tags: o.tags || [],
            outcomes: o.outcomes?.length || 0
        })));

        // Run the model
        if (runModelCallback) runModelCallback();
        window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (e) {
        console.error("Error loading NFL match:", e);
        alert("Failed to load match data.");
    }
}
