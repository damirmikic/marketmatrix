# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run tests (Tennis Engine only)
npm test
# or directly:
node test_tennis_engine.js

# Install dependencies (for Netlify functions)
npm install

# Local development - serve with any static file server, e.g.:
npx serve .
# or open HTML files directly in browser (most features work without a server,
# except Elo fetching which requires /.netlify/functions/fetch-elo)
```

There is no build step — the project is vanilla JS with ES modules served as static files.

## Architecture

**MarketMatrix** is a browser-based sports betting odds calculator. Each sport has its own HTML page that loads a sport-specific model module. All pages are deployed as static files on Netlify, with one serverless function for CORS proxying.

### Per-Sport Module Pattern

Each sport follows the same three-layer structure:

1. **`<sport>_engine.js`** (root) — Pure math engine. No DOM interaction. Contains the statistical model (Poisson, Gaussian, Markov, etc.), a solver that back-solves input parameters from market odds, and a `generateAllMarkets()` (or equivalent) method that returns structured probability data.

2. **`<sport>_model.js`** (root) — UI controller. Imports the engine. Reads DOM inputs, calls the engine, then writes results back to the DOM. Extends `BaseModel` or directly exposes `window.runModel`. Also imports a sport-specific API module for live data fetching.

3. **`<sport>.html`** (root) — Page markup. Loads the model via `<script type="module">`. Contains all the result card containers that the model writes into.

### Shared JS (`js/`)

| File | Purpose |
|---|---|
| `js/core/math_utils.js` | `factorial`, `solveShin` (Shin's vig removal), `probToOdds` — imported everywhere |
| `js/math.js` | Football-specific: ZIP-Poisson, Dixon-Coles correction, score matrix, `solveParameters` |
| `js/markets.js` | Football-specific market calculations (1X2, BTTS, HT/FT combos, Win combos, FTS, DC) that operate on a score probability matrix |
| `js/base_model.js` | `BaseModel` class — provides `displayTable()` and enforces `runModel()` interface |
| `js/ui_utils.js` | Shared UI helpers: `toggleCard`, `switchTab`, `switchSubTab`, `syncRatio`, `toggleAllCards` |
| `js/api.js` | Football live data: fetches matches from Kambi API (country → league → match → odds injection) |
| `js/<sport>_api.js` | Sport-specific live data loader using Kambi API, follows same pattern as `api.js` |
| `js/tennis_elo_service.js` | ATP Elo service: fetches, caches (24h), and queries player ratings by surface |
| `js/tennis_wta_elo_service.js` | WTA equivalent of the above |
| `js/tennis_markov_engine.js` | Markov chain for tennis point-level simulation |
| `js/bet_builder.js` | Football bet builder combining two independent half matrices |

### Football Model (most complex, reference implementation)

`model.js` / `football.html` is the most fully-featured sport. The data flow:

1. User enters 1X2 odds + O/U line + O/U odds (manually or via Kambi API auto-fill)
2. `solveShin` removes vig from all three markets simultaneously
3. `solveParameters` iteratively finds `λ` (home) and `μ` (away) expected goals, plus `ω` (ZIP zero-inflation)
4. `calculateMatrix` produces a 21×21 score probability matrix using ZIP-Poisson with dynamic Dixon-Coles correlation
5. All derived markets (`js/markets.js`) are computed from this matrix
6. First-half matrix is generated using configurable ratios; second-half is derived from full-time and first-half

### Tennis Model

Uses a Markov chain (point → game → set → match) rather than a score matrix. The engine (`tennis_engine.js` + `js/tennis_markov_engine.js`) solves for serve-hold probabilities `pa` and `pb` from match odds and total games line. Elo ratings from Tennis Abstract are fetched server-side via Netlify function and blended (70% Elo / 30% surface prior) into the solver initialization.

### Sports Using Gaussian Models

**Handball** (`handball_engine.js`) uses a bivariate Normal distribution (CLT applies due to high scoring ~56 goals/match). Historical σ values are hardcoded from 13,899 matches. Other high-scoring sports (Volleyball, Basketball, NFL) follow similar engine patterns adapted to their scoring structure.

### Live Data (Kambi API)

All sport API modules hit `offering-api.kambicdn.com`. The flow: group → country → league → match events → bet offers. `loadEventDetails()` parses bet offers and populates form inputs, then triggers `runModel()`. The Kambi event ID encodes the full match; odds are in milliunits (divide by 1000).

### Deployment

`netlify.toml` sets publish dir to `.` (repo root) with a catch-all redirect to `index.html`. The only server-side code is `netlify/functions/fetch-elo.js` (ATP) and `netlify/functions/fetch-wta-elo.js` (WTA) — these proxy Tennis Abstract HTML to avoid CORS, using `node-fetch`.

### Adding a New Sport

1. Create `<sport>_engine.js` with a class exposing `generateAllMarkets({...inputs})` → returns `{ markets: {...} }`
2. Create `<sport>_model.js` that reads DOM inputs, calls engine, writes results; expose `window.runModel`
3. Create `<sport>.html` mirroring the structure of an existing page (same nav, same card pattern)
4. Create `js/<sport>_api.js` following the Kambi API pattern in `js/handball_api.js`
5. Add the sport card to `index.html`
