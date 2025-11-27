import { fetchSoccerLeagues, fetchOdds } from "./api.js";
import {
  refs,
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
let lastApiKeyUsed = null;
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
  if (apiKey === lastApiKeyUsed && state.leagues.length) {
    setStatus("Leagues already loaded. Use refresh buttons to update.");
    return;
  }

  await runFullFetch(true);

  if (state.leagues.length) {
    lastApiKeyUsed = apiKey;
  }
}

async function runFullFetch(refreshLeagues = false) {
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
      if (state.leagues.length) {
        lastApiKeyUsed = apiKey;
      }
    }

    const leagueKeys = state.leagues.map((league) => league.key);
    if (!leagueKeys.length) {
      setError("No soccer leagues available.");
      return;
    }

    const { stoppedEarly } = await runOddsFetch(apiKey, leagueKeys);
    if (stoppedEarly) {
      stopAutoRefresh();
      setStatus(
        "Automatic refresh paused after a critical odds error. You can retry manually once the issue is resolved."
      );
    } else {
      scheduleAutoRefresh();
    }
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
    const filteredLeagues = leagues.filter((league) => !isOutrightSport(league.key));
    state.leagues = filteredLeagues;
    renderNavigation();
    setStatus(
      filteredLeagues.length
        ? `Loaded ${filteredLeagues.length} soccer leagues (outrights excluded). Fetching odds automatically...`
        : "No soccer sports found."
    );
  } finally {
    toggleButtons({ disableFetchLeagues: false, disableFetchOdds: false });
  }
}

async function runOddsFetch(apiKey, leagueKeys) {
  toggleButtons({ disableFetchLeagues: true, disableFetchOdds: true });

  const oddsFormat = refs.oddsFormatSelect.value;
  const regionsParam = AUTO_REGIONS.join(",");
  const allowedBookmakers = buildAllowedBookmakerKeys(AUTO_REGIONS);

  setStatus(`Fetching odds for ${leagueKeys.length} league(s)...`);
  let totalEvents = 0;
  let usageUsed = null;
  let usageRemaining = null;
  const errors = [];

  const eventsByLeague = new Map();

  let stoppedEarly = false;

  try {
    for (const sportKey of leagueKeys) {
      if (isOutrightSport(sportKey)) {
        eventsByLeague.set(sportKey, []);
        continue;
      }
      setStatus(`Fetching odds for ${sportKey} ...`);

      const marketsParam = buildMarketsParamForSport();

      try {
        const { events, usage } = await fetchOdds({
          apiKey,
          sportKey,
          regions: regionsParam,
          markets: marketsParam,
          oddsFormat,
        });

        const filteredEvents = applyBookmakerFilter(events, allowedBookmakers);
        const eventsWithOdds = filteredEvents.filter(eventHasOdds);
        eventsByLeague.set(sportKey, eventsWithOdds);

        if (usage.used !== null) usageUsed = usage.used;
        if (usage.remaining !== null) usageRemaining = usage.remaining;

        totalEvents += eventsWithOdds.length;
      } catch (error) {
        console.error(error);
        errors.push(error.message);
        eventsByLeague.set(sportKey, []);
        if (shouldStopOddsFetch(error)) {
          stoppedEarly = true;
          break;
        }
      }
    }

    state.eventsByLeague = eventsByLeague;
    syncSelection();
    renderNavigation();
    renderSelectedLeagueEvents();

    const processedLeagues = eventsByLeague.size;
    if (!stoppedEarly) {
      setStatus(
        `Auto-refresh every 3 minutes. Loaded ${totalEvents} event(s) across ${processedLeagues} league(s).`
      );
    } else {
      setStatus(
        `Stopped after ${processedLeagues} league(s) due to an authorization or quota error. Manual retry required.`
      );
    }
    setUsage(usageUsed, usageRemaining);
    if (refreshLeagues && state.leagues.length) {
      lastApiKeyUsed = apiKey;
    }
  } finally {
    toggleButtons({ disableFetchLeagues: false, disableFetchOdds: false });
  }

  if (errors.length) {
    setError(errors.join(" | "));
  }

  return { stoppedEarly };
}

function buildMarketsParamForSport() {
  return "h2h,totals";
}

function shouldStopOddsFetch(error) {
  const message = error?.message || "";
  return message.includes("OUT_OF_USAGE_CREDITS") || /HTTP 401/.test(message);
}

function shouldStopOddsFetch(error) {
  const message = error?.message || "";
  return message.includes("OUT_OF_USAGE_CREDITS") || /HTTP 401/.test(message);
}

function isOutrightSport(sportKey) {
  return /(_winner|_outright)/i.test(sportKey);
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
  return events.map((event) => ({
    ...event,
    bookmakers: sanitizeBookmakers(event.bookmakers || [], allowedBookmakers),
  }));
}

function sanitizeBookmakers(bookmakers, allowedBookmakers) {
  const onlyAllowed = allowedBookmakers.size
    ? bookmakers.filter((book) => allowedBookmakers.has(book.key))
    : bookmakers;

  return onlyAllowed
    .map((book) => ({
      ...book,
      markets: sanitizeMarkets(book.markets || []),
    }))
    .filter((book) => (book.markets || []).length);
}

function sanitizeMarkets(markets) {
  const allowedMarkets = new Set(["h2h", "totals"]);
  return markets
    .filter((market) => allowedMarkets.has(market.key))
    .map((market) => {
      const outcomes = filterOutcomesForMarket(market);
      return {
        ...market,
        outcomes,
      };
    })
    .filter((market) => (market.outcomes || []).length);
}

function filterOutcomesForMarket(market) {
  if (market.key !== "totals") {
    return market.outcomes || [];
  }

  return (market.outcomes || []).filter((outcome) => Number(outcome.point) === 2.5);
}

function eventHasOdds(event) {
  return (event.bookmakers || []).some((book) =>
    (book.markets || []).some((market) =>
      (market.outcomes || []).some((outcome) => {
        const price = Number(outcome.price);
        return Number.isFinite(price);
      })
    )
  );
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
