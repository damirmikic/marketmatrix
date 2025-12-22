
const GROUP_URL = "https://eu.offering-api.kambicdn.com/offering/v2018/kambi/group/1000093190.json";

let countriesData = [];
let runModelCallback = null;

export function setRunModelCallback(cb) {
    runModelCallback = cb;
}

export async function initApiLoader() {
    const countrySelect = document.getElementById('apiCountrySelect');
    if (!countrySelect) return;

    try {
        const response = await fetch(GROUP_URL);
        const data = await response.json();

        if (data.group && data.group.groups) {
            countriesData = data.group.groups;
            let html = '<option value="">Select Country/Region</option>';
            countriesData.forEach((country, idx) => {
                html += `<option value="${idx}">${country.name} (${country.eventCount || 0})</option>`;
            });
            countrySelect.innerHTML = html;
        }
    } catch (err) {
        countrySelect.innerHTML = '<option value="">Error loading</option>';
        console.error("API Init Error:", err);
    }
}

export function handleCountryChange() {
    const leagueSelect = document.getElementById('apiLeagueSelect');
    const countryIdx = document.getElementById('apiCountrySelect').value;

    if (countryIdx === "") {
        leagueSelect.innerHTML = '<option value="">Select country first</option>';
        leagueSelect.disabled = true;
        return;
    }

    const country = countriesData[countryIdx];
    if (country && country.groups && country.groups.length > 0) {
        let html = '<option value="">Select Competition</option>';
        country.groups.forEach((league) => {
            html += `<option value="${league.id}" data-term="${league.termKey || 'all'}">${league.name} (${league.eventCount || 0})</option>`;
        });
        leagueSelect.innerHTML = html;
        leagueSelect.disabled = false;
    } else {
        // Handle cases where the country is actually a single league (e.g. Champions League)
        leagueSelect.innerHTML = `<option value="${country.id}" data-term="all">Main Events (${country.eventCount || 0})</option>`;
        leagueSelect.disabled = false;
        handleLeagueChange(); // Jump straight to fetching
    }
}

export async function handleLeagueChange() {
    const leagueEl = document.getElementById('apiLeagueSelect');
    const matchSelect = document.getElementById('apiMatchSelect');
    const groupId = leagueEl.value;

    if (!groupId) return;

    matchSelect.innerHTML = '<option value="">Fetching matches...</option>';
    matchSelect.disabled = true;

    try {
        const countryIdx = document.getElementById('apiCountrySelect').value;
        const country = countriesData[countryIdx];
        const selectedOption = leagueEl.options[leagueEl.selectedIndex];
        const leagueTerm = selectedOption.getAttribute('data-term') || 'all';
        const countryTerm = country.termKey || 'all';

        const url = `https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/listView/football/${countryTerm}/${leagueTerm}/all/matches.json?channel_id=7&client_id=200&competitionId=undefined&lang=en_GB&market=GB&useCombined=true&useCombinedLive=true`;

        const response = await fetch(url);
        const data = await response.json();

        if (!data.events || data.events.length === 0) {
            matchSelect.innerHTML = '<option value="">No matches found</option>';
            return;
        }

        let html = '<option value="">Select Match</option>';
        data.events.forEach((item) => {
            const e = item.event;
            const startTime = new Date(e.start).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            html += `<option value="${e.id}">${e.name} (${startTime})</option>`;
        });
        matchSelect.innerHTML = html;
        matchSelect.disabled = false;
    } catch (err) {
        matchSelect.innerHTML = `<option value="">Error loading</option>`;
        console.error(err);
    }
}

export async function loadEventDetails(eventId) {
    try {
        console.log(`Fetching full match-specific details for event ${eventId}...`);
        const ncid = Date.now();
        const url = `https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/betoffer/event/${eventId}.json?lang=en_GB&market=GB&client_id=200&channel_id=7&ncid=${ncid}&includeParticipants=true`;

        const response = await fetch(url);
        const fullData = await response.json();

        if (fullData && fullData.betOffers) {
            loadMatchData(fullData);
        } else {
            alert("No detail odds available for this match.");
        }
    } catch (e) {
        console.error("Failed to load event details:", e);
        alert("Error fetching full match details.");
    }
}

function loadMatchData(item) {
    try {
        const offers = item.betOffers || [];
        const event = item.event || {};

        console.log("Processing Detail Data for:", event.name);

        // 1. Find 1X2 Market
        const matchOffer = offers.find(bo => {
            const isMain = bo.tags && bo.tags.includes("MAIN");
            const isMatch = (bo.betOfferType && (bo.betOfferType.id === 2 || bo.betOfferType === 2));
            const isFullTime = bo.criterion && (bo.criterion.englishLabel === "Full Time" || bo.criterion.label === "Full Time");
            const has3Outcomes = bo.outcomes && bo.outcomes.length === 3;
            const notHalf = bo.criterion && !bo.criterion.label.includes("Half") && !bo.criterion.label.includes("Period");

            return (isMain || (isMatch && isFullTime)) && has3Outcomes && notHalf;
        }) || offers.find(bo => bo.outcomes && bo.outcomes.length === 3 && bo.betOfferType && bo.betOfferType.id === 2);

        if (matchOffer) {
            console.log("Selected 1X2 Market:", matchOffer.criterion.label, matchOffer.id);
            const h = matchOffer.outcomes.find(o => o.type === "OT_ONE" || o.label === "1" || (event.homeName && o.label === event.homeName));
            const d = matchOffer.outcomes.find(o => o.type === "OT_CROSS" || o.label === "X" || o.label === "Draw");
            const a = matchOffer.outcomes.find(o => o.type === "OT_TWO" || o.label === "2" || (event.awayName && o.label === event.awayName));

            if (h) document.getElementById('homeOdds').value = (h.odds / 1000).toFixed(2);
            if (d) document.getElementById('drawOdds').value = (d.odds / 1000).toFixed(2);
            if (a) document.getElementById('awayOdds').value = (a.odds / 1000).toFixed(2);
        }

        // 2. Find Total Goals Markets
        const goalOffers = offers.filter(bo => {
            const crit = bo.criterion || {};
            const typeId = bo.betOfferType ? (bo.betOfferType.id || bo.betOfferType) : null;
            const label = (crit.englishLabel || crit.label || "").toLowerCase();
            const isGoals = crit.occurrenceType === "GOALS";
            const isOU = typeId === 6;
            const hasGoalsLabel = label.includes("total goals");
            const notSubmarket = !label.includes("half") && !label.includes("team") && !label.includes("asian") && !label.includes("cards") && !label.includes("corners") && !label.includes("yellow");

            return isGoals && isOU && hasGoalsLabel && notSubmarket && bo.outcomes && bo.outcomes.length === 2;
        });

        if (goalOffers.length > 0) {
            const preferredLines = [2500, 1500, 3500];
            let selectedOffer = null;

            for (let lineVal of preferredLines) {
                selectedOffer = goalOffers.find(go => go.outcomes && go.outcomes.some(o => o.line === lineVal));
                if (selectedOffer) break;
            }
            if (!selectedOffer) selectedOffer = goalOffers[0];

            if (selectedOffer) {
                console.log("Selected Goals Market:", selectedOffer.criterion.label, "Line:", selectedOffer.outcomes[0].line);
                const over = selectedOffer.outcomes.find(o => (o.type && o.type.includes("OVER")) || (o.label && o.label.toLowerCase().includes("over")));
                const under = selectedOffer.outcomes.find(o => (o.type && o.type.includes("UNDER")) || (o.label && o.label.toLowerCase().includes("under")));

                if (over && under) {
                    const finalLine = over.line ? (over.line / 1000).toFixed(1) : "2.5";
                    document.getElementById('goalLine').value = finalLine;
                    document.getElementById('overOdds').value = (over.odds / 1000).toFixed(2);
                    document.getElementById('underOdds').value = (under.odds / 1000).toFixed(2);
                }
            }
        }

        if (runModelCallback) runModelCallback();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
        console.error("Critical Processing Error:", e);
        alert("Failed to inject match data into calculator.");
    }
}
