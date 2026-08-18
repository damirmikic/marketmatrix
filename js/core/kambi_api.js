// Shared Kambi API loader factory
// Owns buildHierarchy, dropdown wiring, and fetching.
// Each sport supplies listViewUrl and an injectOdds(betOffers) function
// that parses the response and populates DOM inputs.

const EVENT_URL_BASE = 'https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/betoffer/event/';

export function createKambiLoader({ listViewUrl, sportName, injectOdds }) {
    const state = {
        leagues: [],
        eventMap: {}
    };

    let runModelCallback = null;

    function setRunModelCallback(callback) {
        runModelCallback = callback;
    }

    function buildHierarchy(events) {
        const leagueMap = new Map();

        events.forEach(event => {
            if (!event.event || !event.event.path || event.event.path.length < 2) return;
            if (event.event.type === 'OT_UNTYPED') return;

            const leaguePath = event.event.path[event.event.path.length - 1];
            const leagueName = leaguePath.name;
            const leagueId = leaguePath.id;

            const countryName = event.event.path.length >= 2
                ? event.event.path[event.event.path.length - 2].name
                : 'International';

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

            state.eventMap[event.event.id] = event;
        });

        state.leagues = Array.from(leagueMap.values())
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    function populateLeagueSelector() {
        const selector = document.getElementById('leagueSelect');
        if (!selector) return;

        selector.innerHTML = '<option value="">Select League...</option>';
        state.leagues.forEach(league => {
            const option = document.createElement('option');
            option.value = league.name;
            option.textContent = league.name;
            selector.appendChild(option);
        });
    }

    async function initLoader() {
        try {
            const response = await fetch(listViewUrl);
            const data = await response.json();

            if (data.events && data.events.length > 0) {
                buildHierarchy(data.events);
                populateLeagueSelector();
            } else {
                console.warn(`No ${sportName} matches available`);
            }
        } catch (error) {
            console.error(`Error loading ${sportName} data:`, error);
        }
    }

    function handleLeagueChange() {
        const leagueName = document.getElementById('leagueSelect').value;
        const matchSelect = document.getElementById('matchSelect');

        if (!leagueName) {
            matchSelect.innerHTML = '<option value="">Select Match...</option>';
            matchSelect.disabled = true;
            return;
        }

        const league = state.leagues.find(l => l.name === leagueName);
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

    async function fetchEventOdds(eventId) {
        try {
            const ncid = Date.now();
            const url = `${EVENT_URL_BASE}${eventId}.json?lang=en_GB&market=GB&client_id=200&channel_id=7&ncid=${ncid}&includeParticipants=true`;
            const response = await fetch(url);
            return await response.json();
        } catch (error) {
            console.error('Error fetching event odds:', error);
            return null;
        }
    }

    async function handleMatchChange() {
        const eventId = document.getElementById('matchSelect').value;

        if (!eventId) {
            injectOdds(null);
            return;
        }

        const eventData = await fetchEventOdds(eventId);
        if (!eventData || !eventData.betOffers) {
            console.error('No odds data available');
            return;
        }

        injectOdds(eventData.betOffers);

        if (runModelCallback) {
            runModelCallback();
        }
    }

    return { initLoader, handleLeagueChange, handleMatchChange, setRunModelCallback };
}
