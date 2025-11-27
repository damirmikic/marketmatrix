import { fetchSoccerLeagues, fetchOdds } from "./api.js";
import {
  refs,
  getSelectedValues,
  setStatus,
  setError,
  setUsage,
  toggleButtons,
  populateLeagueOptions,
  clearEvents,
  renderEventsForLeague,
  selectAllLeagues,
} from "./dom.js";

const REFRESH_MS = 3 * 60 * 1000;
let refreshTimer = null;
let isFetching = false;

const ALLOWED_BOOKMAKERS_BY_REGION = {
  eu: ["pinnacle"],
  us: ["betonlineag", "betmgm", "draftkings", "espnbet"],
  uk: ["paddypower", "skybet", "smarkets"],
  au: ["bet365_au"]
};

init();

function init() {
  refs.btnFetchSoccer.addEventListener("click", () => runFullFetch(true));
  refs.btnFetchOdds.addEventListener("click", () => runOddsOnly());
  refs.apiKeyInput.addEventListener("input", attemptBootstrap);
  refs.apiKeyInput.addEventListener("change", attemptBootstrap);
  refs.apiKeyInput.addEventListener("blur", attemptBootstrap);
  refs.leagueSelect.addEventListener("change", restartAutoRefresh);
  refs.regionsSelect.addEventListener("change", restartAutoRefresh);
  refs.marketsSelect.addEventListener("change", restartAutoRefresh);
  refs.oddsFormatSelect.addEventListener("change", restartAutoRefresh);

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
  clearEvents();

  try {
    const apiKey = refs.apiKeyInput.value.trim();
    if (!apiKey) {
      setError("Enter your API key first.");
      return;
    }

    if (refreshLeagues) {
      await loadLeagues(apiKey);
    }

    const leagues = ensureLeaguesSelected();
    if (!leagues.length) {
      setError("Select at least one soccer league.");
      return;
    }

    await runOddsFetch(apiKey, leagues);
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
  populateLeagueOptions([]);

  try {
    const leagues = await fetchSoccerLeagues(apiKey);
    if (!leagues.length) {
      setStatus("No soccer sports found.");
      return;
    }

    populateLeagueOptions(leagues);
    selectAllLeagues();
    setStatus(`Loaded ${leagues.length} soccer leagues. Fetching odds automatically...`);
  } finally {
    toggleButtons({ disableFetchLeagues: false, disableFetchOdds: false });
  }
}

async function runOddsOnly() {
  await runFullFetch(false);
}

async function runOddsFetch(apiKey, leagueKeys) {
  toggleButtons({ disableFetchLeagues: true, disableFetchOdds: true });
  const regions = getSelectedValues(refs.regionsSelect);
  const selectedRegions = regions.length ? regions : ["eu"];
  const markets = getSelectedValues(refs.marketsSelect);
  const oddsFormat = refs.oddsFormatSelect.value;

  const regionsParam = selectedRegions.join(",");
  const marketsParam = markets.length ? markets.join(",") : "h2h";
  const allowedBookmakers = buildAllowedBookmakerKeys(selectedRegions);

  setStatus(`Fetching odds for ${leagueKeys.length} league(s)...`);
  let totalEvents = 0;
  let usageUsed = null;
  let usageRemaining = null;

  try {
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

      if (usage.used !== null) usageUsed = usage.used;
      if (usage.remaining !== null) usageRemaining = usage.remaining;

      totalEvents += filteredEvents.length;
      renderEventsForLeague(sportKey, filteredEvents, oddsFormat);
    }

    setStatus(`Auto-refresh every 3 minutes. Loaded ${totalEvents} event(s) across ${leagueKeys.length} league(s).`);
    setUsage(usageUsed, usageRemaining);
  } finally {
    toggleButtons({ disableFetchLeagues: false, disableFetchOdds: false });
  }
}

function ensureLeaguesSelected() {
  const leagues = getSelectedValues(refs.leagueSelect);
  if (leagues.length) return leagues;

  selectAllLeagues();
  return getSelectedValues(refs.leagueSelect);
}

function buildAllowedBookmakerKeys(selectedRegions) {
  const allowed = new Set();
  selectedRegions.forEach((region) => {
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

function resetMessages() {
  setStatus("");
  setError("");
  setUsage();
}
