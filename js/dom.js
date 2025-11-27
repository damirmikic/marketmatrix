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
    button.innerHTML = `<div class="nav-title">${league.title || league.key}</div>`;
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

function renderSelectedEvent(events, leagueTitle, oddsFormat, openEventId) {
  refs.eventsDiv.innerHTML = "";

  refs.selectedEventTitle.textContent = leagueTitle || "Select a league";
  refs.selectedEventMeta.textContent = events.length
    ? `${events.length} event${events.length === 1 ? "" : "s"}`
    : "No events available";

  if (!events.length) {
    refs.eventsDiv.innerHTML = '<div class="empty-state">No events to show for this league.</div>';
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "events-container";

  events.forEach((event) => {
    const details = document.createElement("details");
    details.className = "event-card";
    details.dataset.eventDetail = event.id;
    if (event.id === openEventId) {
      details.open = true;
    }

    const summary = document.createElement("summary");
    summary.className = "event-summary";

    const title = document.createElement("div");
    title.className = "event-title";
    title.textContent = `${event.home_team} vs ${event.away_team}`;

    const meta = document.createElement("div");
    meta.className = "small muted";
    meta.textContent = `Kickoff: ${formatKickoff(event.commence_time)}`;

    const average = buildAverageOddsTable(event);
    const totalsPreview = buildTotalsPreview(event);

    summary.appendChild(title);
    summary.appendChild(meta);
    if (average) {
      summary.appendChild(average);
    }
    if (totalsPreview) {
      summary.appendChild(totalsPreview);
    }
    details.appendChild(summary);

    const marketsContainer = document.createElement("div");
    marketsContainer.className = "markets-grid";
    const marketTables = buildMarketTables(event, oddsFormat);
    if (!marketTables.length) {
      marketsContainer.innerHTML = '<p class="empty-state">No bookmakers or markets available for this event.</p>';
    } else {
      marketTables.forEach((tableBlock) => marketsContainer.appendChild(tableBlock));
    }

    details.appendChild(marketsContainer);
    wrapper.appendChild(details);
  });

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
      marketEntry.columns = orderOutcomeColumns(
        market.key,
        marketEntry.columns,
        event.home_team,
        event.away_team
      );

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
      bookmakerCell.innerHTML = `<strong>${row.bookmaker}</strong><div class="small muted">${row.lastUpdate || ""}</div>`;
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

function orderOutcomeColumns(marketKey, columns, homeName, awayName) {
  if (marketKey !== "h2h") return columns;
  const priority = { home: 0, draw: 1, away: 2 };
  return [...columns].sort((a, b) => {
    const normalizedA = normalizeOutcomeName(a, homeName, awayName);
    const normalizedB = normalizeOutcomeName(b, homeName, awayName);
    const pa = priority[normalizedA] ?? 99;
    const pb = priority[normalizedB] ?? 99;
    return pa - pb || (a || "").localeCompare(b || "");
  });
}

function buildAverageOddsTable(event) {
  const averages = computeAverageOdds(
    event.bookmakers || [],
    event.home_team,
    event.away_team
  );
  if (!averages) return null;

  const table = document.createElement("table");
  table.className = "average-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["Home", "Draw", "Away"].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const row = document.createElement("tr");
  [averages.home, averages.draw, averages.away].forEach((val) => {
    const td = document.createElement("td");
    td.textContent = val ?? "-";
    row.appendChild(td);
  });
  tbody.appendChild(row);
  table.appendChild(tbody);

  return table;
}

function buildTotalsPreview(event) {
  const totals = computeAverageTotals(event.bookmakers || []);
  if (!totals) return null;

  const table = document.createElement("table");
  table.className = "average-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["Over", "Under"].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const row = document.createElement("tr");
  [totals.over, totals.under].forEach((entry) => {
    const td = document.createElement("td");
    td.innerHTML = formatTotalsCell(entry);
    row.appendChild(td);
  });
  tbody.appendChild(row);
  table.appendChild(tbody);

  return table;
}

function computeAverageOdds(bookmakers, homeName, awayName) {
  const h2hPrices = { home: [], draw: [], away: [] };

  bookmakers.forEach((book) => {
    (book.markets || []).forEach((market) => {
      if (market.key !== "h2h") return;
      (market.outcomes || []).forEach((outcome) => {
        const normalized = normalizeOutcomeName(outcome.name, homeName, awayName);
        const priceNumber = Number(outcome.price);
        if (normalized && h2hPrices[normalized] && Number.isFinite(priceNumber)) {
          h2hPrices[normalized].push(priceNumber);
        }
      });
    });
  });

  const averages = {};
  let hasValue = false;
  ["home", "draw", "away"].forEach((key) => {
    const values = h2hPrices[key];
    if (values.length) {
      const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
      averages[key] = avg.toFixed(2);
      hasValue = true;
    } else {
      averages[key] = null;
    }
  });

  return hasValue ? averages : null;
}

function normalizeOutcomeName(name, homeName, awayName) {
  const lower = (name || "").toLowerCase();
  if (lower === "home" || lower === homeName?.toLowerCase()) return "home";
  if (lower === "away" || lower === awayName?.toLowerCase()) return "away";
  if (lower === "draw" || lower === "tie") return "draw";
  return null;
}

function computeAverageTotals(bookmakers) {
  const totals = {
    over: { prices: [], points: [] },
    under: { prices: [], points: [] },
  };

  bookmakers.forEach((book) => {
    (book.markets || []).forEach((market) => {
      if (market.key !== "totals") return;
      (market.outcomes || []).forEach((outcome) => {
        if (Number(outcome.point) !== 2.5) return;
        const lower = (outcome.name || "").toLowerCase();
        const bucket = lower === "over" ? totals.over : lower === "under" ? totals.under : null;
        if (!bucket) return;

        const price = Number(outcome.price);
        const point = Number(outcome.point);
        if (Number.isFinite(price)) bucket.prices.push(price);
        if (Number.isFinite(point)) bucket.points.push(point);
      });
    });
  });

  const result = {};
  let hasTotals = false;
  ["over", "under"].forEach((key) => {
    const entry = totals[key];
    const priceAvg = average(entry.prices);
    const pointAvg = average(entry.points);
    result[key] = {
      price: priceAvg !== null ? priceAvg.toFixed(2) : null,
      point: pointAvg !== null ? pointAvg.toFixed(2) : null,
    };
    if (priceAvg !== null || pointAvg !== null) {
      hasTotals = true;
    }
  });

  return hasTotals ? result : null;
}

function average(values) {
  if (!values.length) return null;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

function formatTotalsCell(entry) {
  if (!entry || (entry.price === null && entry.point === null)) {
    return "-";
  }

  const parts = [];
  if (entry.point !== null) parts.push(`<div class="small muted">pt ${entry.point}</div>`);
  if (entry.price !== null) parts.push(`<div class="price">${entry.price}</div>`);
  return parts.join(" ");
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
