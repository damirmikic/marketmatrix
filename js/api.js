const BASE_URL = "https://api.the-odds-api.com/v4";

async function fetchSoccerLeagues(apiKey) {
  const url = `${BASE_URL}/sports?apiKey=${encodeURIComponent(apiKey)}&all=true`;
  const resp = await fetch(url);

  if (!resp.ok) {
    const message = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${message}`);
  }

  const data = await resp.json();
  const soccerSports = data
    .filter((sport) => sport.key && sport.key.startsWith("soccer_"))
    .sort((a, b) => (a.title || "").localeCompare(b.title || ""));

  return soccerSports;
}

async function fetchOdds({ apiKey, sportKey, regions, markets, oddsFormat }) {
  const url = new URL(`${BASE_URL}/sports/${sportKey}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", regions);
  url.searchParams.set("markets", markets);
  url.searchParams.set("oddsFormat", oddsFormat);

  const resp = await fetch(url);
  const usage = {
    used: resp.headers.get("x-requests-used"),
    remaining: resp.headers.get("x-requests-remaining"),
  };

  if (!resp.ok) {
    const message = await resp.text();
    throw new Error(`Sport ${sportKey} – HTTP ${resp.status}: ${message}`);
  }

  const events = await resp.json();
  return { events, usage };
}

export { fetchSoccerLeagues, fetchOdds };
