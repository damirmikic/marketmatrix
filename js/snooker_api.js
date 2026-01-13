// Snooker API Module
// Fetches matches from Kambi and organizes them by Country > Competition > Events

const SNOOKER_LIST_URL = "https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/listView/snooker/all/all/all/matches.json?lang=en_GB&market=GB&client_id=200&channel_id=7&ncid=1768261517594&lang=en_US&market=US&client_id=200&channel_id=7&ncid=1768261517594&competitionId=undefined&useCombined=true&useCombinedLive=true";

const SNOOKER_EVENT_URL_BASE = "https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/betoffer/event/";

let snookerData = {
    countries: [],    // { name, termKey, competitions: [...] }
    eventMap: {}      // eventId -> basic event data from list view
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

        // Path structure: [Sport, Country/Tournament, Competition]
        if (!path || path.length < 2) return;

        let countryName, countryTerm, compName, compTerm;

        if (path.length === 2) {
            // No country, just sport + competition (e.g., World Championship)
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
        snookerData.eventMap[e.id] = item;
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

    // Sort countries alphabetically, but put major tournaments first
    const priorityCountries = ['world_championship', 'uk_championship', 'masters', 'english_open', 'china'];
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

export async function initSnookerLoader() {
    const countrySelect = document.getElementById('apiCountrySelect');
    if (!countrySelect) return;

    try {
        countrySelect.innerHTML = '<option value="">Loading...</option>';

        const response = await fetch(SNOOKER_LIST_URL);
        const data = await response.json();

        if (!data.events || data.events.length === 0) {
            countrySelect.innerHTML = '<option value="">No matches available</option>';
            return;
        }

        // Build hierarchy from flat list
        snookerData.countries = buildHierarchy(data.events);

        // Populate country dropdown
        let html = '<option value="">Select Country/Region</option>';
        snookerData.countries.forEach((country, idx) => {
            html += `<option value="${idx}">${country.name}</option>`;
        });
        countrySelect.innerHTML = html;

        console.log(`Loaded ${data.events.length} snooker events into ${snookerData.countries.length} countries`);
    } catch (err) {
        countrySelect.innerHTML = '<option value="">Error loading</option>';
        console.error("Snooker API Init Error:", err);
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

    const country = snookerData.countries[countryIdx];
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

    const country = snookerData.countries[countryIdx];
    const competition = country.competitions[leagueIdx];

    if (competition && competition.events.length > 0) {
        let html = '<option value="">Select Match</option>';
        competition.events.forEach((item) => {
            const e = item.event;
            const startTime = new Date(e.start).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
    const originalHtml = matchSelect.innerHTML;
    matchSelect.disabled = true;

    try {
        // Fetch detailed event data from the event-specific endpoint
        const eventUrl = `${SNOOKER_EVENT_URL_BASE}${eventId}.json?lang=en_GB&market=GB&client_id=200&channel_id=7&ncid=1768261615236&includeParticipants=true`;

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
        console.error("Error loading snooker event details:", err);
        alert("Failed to load match details. Please try again.");
        matchSelect.innerHTML = originalHtml;
        matchSelect.disabled = false;
    }
}

function loadMatchData(data) {
    try {
        const offers = data.betOffers || [];
        const event = data.events ? data.events[0] : {};

        console.log("Loading Snooker Match:", event.englishName || event.name);

        // Find Match Odds (Match Winner)
        const moneylineOffer = offers.find(bo => {
            const crit = bo.criterion || {};
            const label = (crit.englishLabel || crit.label || "").toLowerCase();
            return (label.includes("match winner") ||
                    label.includes("match odds") ||
                    label.includes("1x2") ||
                    label.includes("moneyline") ||
                    label === "fulltime") &&
                    bo.outcomes &&
                    bo.outcomes.length === 2;
        });

        if (moneylineOffer) {
            console.log("Match Odds Market:", moneylineOffer.criterion.label);
            const home = moneylineOffer.outcomes.find(o => o.type === "OT_ONE");
            const away = moneylineOffer.outcomes.find(o => o.type === "OT_TWO");

            if (home) document.getElementById('homeOdds').value = (home.odds / 1000).toFixed(2);
            if (away) document.getElementById('awayOdds').value = (away.odds / 1000).toFixed(2);
        } else {
            console.warn("No Match Odds found for this match");
            console.log("Available markets:", offers.map(o => o.criterion?.label || 'Unknown'));
        }

        // Try to detect match format from available markets
        // Look for "To Win X Frames" or similar markets
        const frameHandicapOffers = offers.filter(bo => {
            const label = (bo.criterion?.label || "").toLowerCase();
            return label.includes("frame") && (label.includes("handicap") || label.includes("spread"));
        });

        if (frameHandicapOffers.length > 0) {
            console.log("Frame handicap markets found:", frameHandicapOffers.length);
        }

        // Run the model
        if (runModelCallback) runModelCallback();
        window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (e) {
        console.error("Error loading snooker match:", e);
        alert("Failed to load match data.");
    }
}
