// Ice Hockey API Module
// Fetches matches from Kambi and organizes them by Country > Competition > Events

const ICE_HOCKEY_URL = "https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/listView/ice_hockey/all/all/all/matches.json?channel_id=7&client_id=200&lang=en_GB&market=GB&useCombined=true&useCombinedLive=true";

let iceHockeyData = {
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
        // Sometimes path[1] is the competition directly (for international)
        if (!path || path.length < 2) return;

        let countryName, countryTerm, compName, compTerm;

        if (path.length === 2) {
            // No country, just sport + competition (e.g., NHL, KHL)
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
        iceHockeyData.eventMap[e.id] = item;
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
    const priorityCountries = ['nhl', 'khl', 'sweden', 'finland', 'switzerland', 'czech-republic', 'usa', 'canada'];
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

export async function initIceHockeyLoader() {
    const countrySelect = document.getElementById('apiCountrySelect');
    if (!countrySelect) return;

    try {
        countrySelect.innerHTML = '<option value="">Loading...</option>';

        const response = await fetch(ICE_HOCKEY_URL);
        const data = await response.json();

        if (!data.events || data.events.length === 0) {
            countrySelect.innerHTML = '<option value="">No matches available</option>';
            return;
        }

        // Build hierarchy from flat list
        iceHockeyData.countries = buildHierarchy(data.events);

        // Populate country dropdown
        let html = '<option value="">Select Country/Region</option>';
        iceHockeyData.countries.forEach((country, idx) => {
            html += `<option value="${idx}">${country.name}</option>`;
        });
        countrySelect.innerHTML = html;

        console.log(`Loaded ${data.events.length} ice hockey events into ${iceHockeyData.countries.length} countries`);
    } catch (err) {
        countrySelect.innerHTML = '<option value="">Error loading</option>';
        console.error("Ice Hockey API Init Error:", err);
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

    const country = iceHockeyData.countries[countryIdx];
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

    const country = iceHockeyData.countries[countryIdx];
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

export function handleMatchChange() {
    const eventId = document.getElementById('apiMatchSelect').value;
    if (!eventId) return;

    const item = iceHockeyData.eventMap[eventId];
    if (!item) {
        console.error("Event not found:", eventId);
        return;
    }

    loadMatchData(item);
}

function loadMatchData(item) {
    try {
        const offers = item.betOffers || [];
        const event = item.event || {};

        console.log("Loading Ice Hockey Match:", event.englishName || event.name);

        // 1. Find Match Result (1X2 - Home/Draw/Away)
        const moneylineOffer = offers.find(bo => {
            const crit = bo.criterion || {};
            const label = (crit.englishLabel || crit.label || "").toLowerCase();
            return (label.includes("match odds") || label.includes("match result") || label.includes("1x2") || label.includes("three way"))
                   && bo.outcomes && bo.outcomes.length === 3;
        });

        if (moneylineOffer) {
            console.log("Match Result Market:", moneylineOffer.criterion.label);
            const home = moneylineOffer.outcomes.find(o => o.type === "OT_ONE");
            const draw = moneylineOffer.outcomes.find(o => o.type === "OT_CROSS");
            const away = moneylineOffer.outcomes.find(o => o.type === "OT_TWO");

            if (home) document.getElementById('homeOdds').value = (home.odds / 1000).toFixed(2);
            if (draw) document.getElementById('drawOdds').value = (draw.odds / 1000).toFixed(2);
            if (away) document.getElementById('awayOdds').value = (away.odds / 1000).toFixed(2);
        }

        // 2. Find Puck Line / Handicap (2-way)
        const puckLineOffer = offers.find(bo => {
            const crit = bo.criterion || {};
            const label = (crit.englishLabel || crit.label || "").toLowerCase();
            const isMain = bo.tags && bo.tags.includes("MAIN_LINE");
            return (label.includes("puck line") || label.includes("handicap"))
                   && isMain && bo.outcomes && bo.outcomes.length === 2;
        });

        if (puckLineOffer) {
            console.log("Puck Line Market:", puckLineOffer.criterion.label);
            const home = puckLineOffer.outcomes.find(o => o.type === "OT_ONE");
            const away = puckLineOffer.outcomes.find(o => o.type === "OT_TWO");

            if (home && home.line !== undefined) {
                document.getElementById('puckLine').value = (home.line / 1000).toFixed(1);
                document.getElementById('puckHomeOdds').value = (home.odds / 1000).toFixed(2);
            }
            if (away) {
                document.getElementById('puckAwayOdds').value = (away.odds / 1000).toFixed(2);
            }
        }

        // 3. Find Total Goals (Over/Under)
        const totalOffer = offers.find(bo => {
            const crit = bo.criterion || {};
            const label = (crit.englishLabel || crit.label || "").toLowerCase();
            const isMain = bo.tags && bo.tags.includes("MAIN_LINE");
            return (label.includes("total goals") || label.includes("over/under"))
                   && isMain && bo.outcomes && bo.outcomes.length === 2;
        });

        if (totalOffer) {
            console.log("Total Goals Market:", totalOffer.criterion.label);
            const over = totalOffer.outcomes.find(o => o.type === "OT_OVER");
            const under = totalOffer.outcomes.find(o => o.type === "OT_UNDER");

            if (over && over.line !== undefined) {
                document.getElementById('totalGoalsLine').value = (over.line / 1000).toFixed(1);
                document.getElementById('overOdds').value = (over.odds / 1000).toFixed(2);
            }
            if (under) {
                document.getElementById('underOdds').value = (under.odds / 1000).toFixed(2);
            }
        }

        // Run the model
        if (runModelCallback) runModelCallback();
        window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (e) {
        console.error("Error loading ice hockey match:", e);
        alert("Failed to load match data.");
    }
}
