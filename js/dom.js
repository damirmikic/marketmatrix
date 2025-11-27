const refs = {
  apiKeyInput: document.getElementById("apiKey"),
  regionsSelect: document.getElementById("regions"),
  marketsSelect: document.getElementById("markets"),
  oddsFormatSelect: document.getElementById("oddsFormat"),
  leagueSelect: document.getElementById("leagueSelect"),
  btnFetchSoccer: document.getElementById("btnFetchSoccer"),
  btnFetchOdds: document.getElementById("btnFetchOdds"),
  statusDiv: document.getElementById("status"),
  errorDiv: document.getElementById("error"),
  usageDiv: document.getElementById("usage"),
  eventsDiv: document.getElementById("events"),
};

function getSelectedValues(selectEl) {
  return Array.from(selectEl.selectedOptions).map((option) => option.value);
}

function setStatus(message = "") {
  refs.statusDiv.textContent = message;
}

function setError(message = "") {
  refs.errorDiv.textContent = message;
}

function setUsage(used, remaining) {
  if (used != null && remaining != null) {
    refs.usageDiv.textContent = `API usage: used ${used} | remaining ${remaining}`;
    return;
  }
  refs.usageDiv.textContent = "";
}

function toggleButtons({ disableFetchLeagues, disableFetchOdds }) {
  if (disableFetchLeagues !== undefined) {
    refs.btnFetchSoccer.disabled = disableFetchLeagues;
  }
  if (disableFetchOdds !== undefined) {
    refs.btnFetchOdds.disabled = disableFetchOdds;
  }
}

function clearLeagues() {
  refs.leagueSelect.innerHTML = "";
}

function populateLeagueOptions(leagues) {
  clearLeagues();
  const fragment = document.createDocumentFragment();

  leagues.forEach((league) => {
    const option = document.createElement("option");
    option.value = league.key;
    option.textContent = `${league.title} (${league.key})`;
    fragment.appendChild(option);
  });

  refs.leagueSelect.appendChild(fragment);
}

function selectAllLeagues() {
  Array.from(refs.leagueSelect.options).forEach((option) => {
    option.selected = true;
  });
}

function clearEvents() {
  refs.eventsDiv.innerHTML = "";
}

function renderEventsForLeague(sportKey, events, oddsFormat) {
  const leagueHeader = document.createElement("h3");
  leagueHeader.textContent = sportKey;
  leagueHeader.className = "small league-heading";
  refs.eventsDiv.appendChild(leagueHeader);

  if (!events.length) {
    const noEvents = document.createElement("p");
    noEvents.className = "small";
    noEvents.textContent = "No events returned for this league.";
    refs.eventsDiv.appendChild(noEvents);
    return;
  }

  events.forEach((event) => {
    const wrapper = document.createElement("div");
    wrapper.className = "event-card";

    const header = document.createElement("div");
    header.className = "event-header";
    header.innerHTML = `<div class="event-title">${event.home_team} vs ${event.away_team}</div>`;

    const meta = document.createElement("div");
    meta.className = "event-meta";
    meta.textContent = `ID: ${event.id} | Kickoff: ${formatKickoff(event.commence_time)}`;
    header.appendChild(meta);
    wrapper.appendChild(header);

    const marketsContainer = document.createElement("div");
    marketsContainer.className = "markets-grid";

    const marketTables = buildMarketTables(event, oddsFormat);
    if (!marketTables.length) {
      const noMarkets = document.createElement("p");
      noMarkets.className = "small";
      noMarkets.textContent = "No bookmakers or markets available.";
      marketsContainer.appendChild(noMarkets);
    } else {
      marketTables.forEach((tableBlock) => marketsContainer.appendChild(tableBlock));
    }

    wrapper.appendChild(marketsContainer);
    refs.eventsDiv.appendChild(wrapper);
  });
}

function buildMarketTables(event, oddsFormat) {
  const marketMap = new Map();

  (event.bookmakers || []).forEach((book) => {
    (book.markets || []).forEach((market) => {
      const normalizedOutcomes = (market.outcomes || []).map((outcome) => ({
        name: outcome.name,
        price: outcome.price,
        point: outcome.point,
      }));

      if (!marketMap.has(market.key)) {
        marketMap.set(market.key, {
          columns: normalizedOutcomes.map((o) => o.name),
          rows: [],
        });
      }

      const marketEntry = marketMap.get(market.key);
      normalizedOutcomes.forEach((o) => {
        if (!marketEntry.columns.includes(o.name)) {
          marketEntry.columns.push(o.name);
        }
      });

      marketEntry.rows.push({
        bookmaker: book.title || book.key,
        bookmakerKey: book.key,
        lastUpdate: book.last_update,
        outcomes: normalizedOutcomes,
      });
    });
  });

  const blocks = [];
  marketMap.forEach((marketEntry, marketKey) => {
    const block = document.createElement("div");
    block.className = "market-block";

    const heading = document.createElement("div");
    heading.className = "market-title";
    heading.textContent = `Market: ${marketKey}`;
    block.appendChild(heading);

    const table = document.createElement("table");
    table.className = "market-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["Bookmaker", ...marketEntry.columns].forEach((headingText) => {
      const th = document.createElement("th");
      th.textContent = headingText;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    marketEntry.rows.forEach((row) => {
      const tr = document.createElement("tr");
      const bookmakerCell = document.createElement("td");
      bookmakerCell.innerHTML = `<strong>${row.bookmaker}</strong><div class="small muted">${row.bookmakerKey}</div><div class="small muted">${row.lastUpdate || ""}</div>`;
      tr.appendChild(bookmakerCell);

      marketEntry.columns.forEach((colName) => {
        const td = document.createElement("td");
        const outcome = row.outcomes.find((o) => o.name === colName);
        if (outcome) {
          td.innerHTML = `<div class="price">${outcome.price}</div>${formatPoint(outcome.point)}`;
        } else {
          td.textContent = "-";
        }
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    block.appendChild(table);
    blocks.push(block);
  });

  return blocks;
}

function formatPoint(point) {
  if (point === undefined || point === null) return "";
  return `<div class="small muted">pt ${point}</div>`;
}

function formatKickoff(commence) {
  try {
    if (!commence) return "";
    const parsed = new Date(commence);
    return `${parsed.toLocaleString()} (${parsed.toISOString().replace(".000Z", "Z")})`;
  } catch (error) {
    return commence || "";
  }
}

export {
  refs,
  getSelectedValues,
  setStatus,
  setError,
  setUsage,
  toggleButtons,
  populateLeagueOptions,
  selectAllLeagues,
  clearEvents,
  renderEventsForLeague,
};
