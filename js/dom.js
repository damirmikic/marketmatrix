const refs = {
  apiKeyInput: document.getElementById("apiKey"),
  marketsSelect: document.getElementById("markets"),
  oddsFormatSelect: document.getElementById("oddsFormat"),
  btnFetchSoccer: document.getElementById("btnFetchSoccer"),
  btnFetchOdds: document.getElementById("btnFetchOdds"),
  statusDiv: document.getElementById("status"),
  errorDiv: document.getElementById("error"),
  usageDiv: document.getElementById("usage"),
  eventsDiv: document.getElementById("events"),
  leagueNav: document.getElementById("leagueNav"),
  eventList: document.getElementById("eventList"),
  selectedEventTitle: document.getElementById("selectedEventTitle"),
  selectedEventMeta: document.getElementById("selectedEventMeta"),
  leagueCount: document.getElementById("leagueCount"),
  eventCount: document.getElementById("eventCount"),
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

function renderLeagueNav(leagues, selectedKey) {
  refs.leagueNav.innerHTML = "";
  refs.leagueCount.textContent = leagues.length ? `${leagues.length} leagues` : "";

  if (!leagues.length) {
    refs.leagueNav.innerHTML = '<div class="empty-state">No leagues loaded yet.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  leagues.forEach((league) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `nav-item${league.key === selectedKey ? " active" : ""}`;
    button.dataset.league = league.key;
    button.innerHTML = `
      <div class="nav-title">${league.title || league.key}</div>
      <div class="nav-meta">${league.key}</div>
    `;
    fragment.appendChild(button);
  });

  refs.leagueNav.appendChild(fragment);
}

function renderEventList(events, selectedEventId) {
  refs.eventList.innerHTML = "";
  refs.eventCount.textContent = events.length ? `${events.length} events` : "";

  if (!events.length) {
    refs.eventList.innerHTML = '<div class="empty-state">No events available.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  events.forEach((event) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `nav-item${event.id === selectedEventId ? " active" : ""}`;
    button.dataset.event = event.id;
    button.innerHTML = `
      <div class="nav-title">${event.home_team} vs ${event.away_team}</div>
      <div class="nav-meta">Kickoff: ${formatKickoff(event.commence_time)}</div>
    `;
    fragment.appendChild(button);
  });

  refs.eventList.appendChild(fragment);
}

function renderSelectedEvent(event, oddsFormat) {
  refs.eventsDiv.innerHTML = "";

  if (!event) {
    refs.selectedEventTitle.textContent = "No event selected";
    refs.selectedEventMeta.textContent = "";
    refs.eventsDiv.innerHTML = '<div class="empty-state">Select a league and event to view odds.</div>';
    return;
  }

  refs.selectedEventTitle.textContent = `${event.home_team} vs ${event.away_team}`;
  refs.selectedEventMeta.textContent = `Kickoff: ${formatKickoff(event.commence_time)}`;

  const wrapper = document.createElement("div");
  wrapper.className = "events-container";

  const card = document.createElement("div");
  card.className = "event-card";

  const marketsContainer = document.createElement("div");
  marketsContainer.className = "markets-grid";

  const marketTables = buildMarketTables(event, oddsFormat);
  if (!marketTables.length) {
    marketsContainer.innerHTML = '<p class="empty-state">No bookmakers or markets available for this event.</p>';
  } else {
    marketTables.forEach((tableBlock) => marketsContainer.appendChild(tableBlock));
  }

  card.appendChild(marketsContainer);
  wrapper.appendChild(card);
  refs.eventsDiv.appendChild(wrapper);
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
          columns: [],
          rows: [],
        });
      }

      const marketEntry = marketMap.get(market.key);
      normalizedOutcomes.forEach((o) => {
        if (!marketEntry.columns.includes(o.name)) {
          marketEntry.columns.push(o.name);
        }
      });
      marketEntry.columns = orderOutcomeColumns(market.key, marketEntry.columns);

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

function orderOutcomeColumns(marketKey, columns) {
  if (marketKey !== "h2h") return columns;
  const priority = { home: 0, draw: 1, away: 2 };
  return [...columns].sort((a, b) => {
    const pa = priority[a?.toLowerCase()] ?? 99;
    const pb = priority[b?.toLowerCase()] ?? 99;
    return pa - pb || (a || "").localeCompare(b || "");
  });
}

function formatPoint(point) {
  if (point === undefined || point === null) return "";
  return `<div class="small muted">pt ${point}</div>`;
}

function formatKickoff(commence) {
  try {
    if (!commence) return "";
    const parsed = new Date(commence);
    return `${parsed.toLocaleString()} (${parsed
      .toISOString()
      .replace(".000Z", "Z")})`;
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
  renderLeagueNav,
  renderEventList,
  renderSelectedEvent,
};
