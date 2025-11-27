import { fetchSoccerLeagues, fetchOdds } from "./api.js";
import {
  refs,
  getSelectedValues,
  setStatus,
  setError,
  setUsage,
  toggleButtons,
  renderLeagueNav,
  renderEventList,
  renderSelectedEvent,
} from "./dom.js";

const REFRESH_MS = 3 * 60 * 1000;
const AUTO_REGIONS = ["eu", "us", "uk"];
const ALLOWED_BOOKMAKERS_BY_REGION = {
  eu: ["pinnacle"],
  us: ["betonlineag", "betmgm", "draftkings", "espnbet"],
  uk: ["paddypower", "skybet", "smarkets"],
};

let refreshTimer = null;
let isFetching = false;
const state = {
  leagues: [],
  eventsByLeague: new Map(),
  selectedLeague: null,
  focusedEventId: null,
};

init();

function init() {
  refs.btnFetchSoccer.addEventListener("click", () => runFullFetch(true));
  refs.btnFetchOdds.addEventListener("click", () => runFullFetch(false));
  refs.apiKeyInput.addEventListener("input", attemptBootstrap);
  refs.apiKeyInput.addEventListener("change", attemptBootstrap);
  refs.apiKeyInput.addEventListener("blur", attemptBootstrap);
  refs.marketsSelect.addEventListener("change", restartAutoRefresh);
  refs.oddsFormatSelect.addEventListener("change", restartAutoRefresh);

  refs.leagueNav.addEventListener("click", (event) => {
    const target = event.target.closest("[data-league]");
    if (!target) return;
    state.selectedLeague = target.dataset.league;
    renderNavigation();
    renderSelectedLeagueEvents();
  });

  refs.eventList.addEventListener("click", (event) => {
    const target = event.target.closest("[data-event]");
    if (!target) return;
    state.focusedEventId = target.dataset.event;
    renderSelectedLeagueEvents();
  });

  attemptBootstrap();
}

async function attemptBootstrap() {
  const apiKey = refs.apiKeyInput.value.trim();
  if (!apiKey) {
    stopAutoRefresh();
    setStatus("Enter your API key to start automatic fetching.");
    return;
  }
  await runFullFetch(true);
}

async function runFullFetch(refreshLeagues) {
  if (isFetching) return;
  isFetching = true;
  resetMessages();

  try {
    const apiKey = refs.apiKeyInput.value.trim();
    if (!apiKey) {
      setError("Enter your API key first.");
      return;
    }

    if (refreshLeagues) {
      await loadLeagues(apiKey);
    }

    const leagueKeys = state.leagues.map((league) => league.key);
    if (!leagueKeys.length) {
      setError("No soccer leagues available.");
      return;
    }

    await runOddsFetch(apiKey, leagueKeys);
    scheduleAutoRefresh();
  } catch (error) {
    console.error(error);
    setError(error.message);
  } finally {
    isFetching = false;
  }
}

async function loadLeagues(apiKey) {
  toggleButtons({ disableFetchLeagues: true, disableFetchOdds: true });
  setStatus("Fetching sports from /v4/sports ...");

  try {
    const leagues = await fetchSoccerLeagues(apiKey);
    state.leagues = leagues;
    renderNavigation();
    setStatus(
      leagues.length
        ? `Loaded ${leagues.length} soccer leagues. Fetching odds automatically...`
        : "No soccer sports found."
    );
  } finally {
    toggleButtons({ disableFetchLeagues: false, disableFetchOdds: false });
  }
}

async function runOddsFetch(apiKey, leagueKeys) {
  toggleButtons({ disableFetchLeagues: true, disableFetchOdds: true });

  const markets = getSelectedValues(refs.marketsSelect);
  const oddsFormat = refs.oddsFormatSelect.value;
  const marketsParam = markets.length ? markets.join(",") : "h2h";
  const regionsParam = AUTO_REGIONS.join(",");
  const allowedBookmakers = buildAllowedBookmakerKeys(AUTO_REGIONS);

  setStatus(`Fetching odds for ${leagueKeys.length} league(s)...`);
  let totalEvents = 0;
  let usageUsed = null;
  let usageRemaining = null;

  try {
    const eventsByLeague = new Map();

    for (const sportKey of leagueKeys) {
      setStatus(`Fetching odds for ${sportKey} ...`);

      const { events, usage } = await fetchOdds({
        apiKey,
        sportKey,
        regions: regionsParam,
        markets: marketsParam,
        oddsFormat,
      });

      const filteredEvents = applyBookmakerFilter(events, allowedBookmakers);
      eventsByLeague.set(sportKey, filteredEvents);

      if (usage.used !== null) usageUsed = usage.used;
      if (usage.remaining !== null) usageRemaining = usage.remaining;

      totalEvents += filteredEvents.length;
    }

    state.eventsByLeague = eventsByLeague;
    syncSelection();
    renderNavigation();
    renderSelectedLeagueEvents();

    setStatus(
      `Auto-refresh every 3 minutes. Loaded ${totalEvents} event(s) across ${leagueKeys.length} league(s).`
    );
    setUsage(usageUsed, usageRemaining);
  } finally {
    toggleButtons({ disableFetchLeagues: false, disableFetchOdds: false });
  }
}

function syncSelection() {
  const selectedLeagueStillExists = state.leagues.some(
    (league) => league.key === state.selectedLeague
  );

  if (!selectedLeagueStillExists) {
    state.selectedLeague = null;
  }

  if (!state.selectedLeague) {
    state.selectedLeague = findFirstLeagueWithEvents();
  }
}

function findFirstLeagueWithEvents() {
  for (const league of state.leagues) {
    const events = state.eventsByLeague.get(league.key) || [];
    if (events.length) {
      return league.key;
    }
  }
  return state.leagues[0]?.key || null;
}

function buildAllowedBookmakerKeys(regions) {
  const allowed = new Set();
  regions.forEach((region) => {
    const regionKeys = ALLOWED_BOOKMAKERS_BY_REGION[region];
    if (regionKeys) {
      regionKeys.forEach((key) => allowed.add(key));
    }
  });
  return allowed;
}

function applyBookmakerFilter(events, allowedBookmakers) {
  if (!allowedBookmakers.size) {
    return events;
  }

  return events.map((event) => ({
    ...event,
    bookmakers: (event.bookmakers || []).filter((book) =>
      allowedBookmakers.has(book.key)
    ),
  }));
}

function scheduleAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(() => {
    runFullFetch(false);
  }, REFRESH_MS);
}

function restartAutoRefresh() {
  stopAutoRefresh();
  runFullFetch(false);
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function renderNavigation() {
  renderLeagueNav(state.leagues, state.selectedLeague);
  const events = state.eventsByLeague.get(state.selectedLeague) || [];
  renderEventList(events, state.focusedEventId);
}

function renderSelectedLeagueEvents() {
  const events = state.eventsByLeague.get(state.selectedLeague) || [];
  const leagueTitle = state.leagues.find((l) => l.key === state.selectedLeague)?.title;
  renderSelectedEvent(events, leagueTitle, refs.oddsFormatSelect.value, state.focusedEventId);
  focusEventIfNeeded();
}

function resetMessages() {
  setStatus("");
  setError("");
  setUsage();
}

function focusEventIfNeeded() {
  if (!state.focusedEventId) return;
  const details = document.querySelector(
    `[data-event-detail="${state.focusedEventId}"]`
  );
  if (details) {
    details.open = true;
    details.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  state.focusedEventId = null;
}
