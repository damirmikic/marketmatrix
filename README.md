# MarketMatrix

Advanced real-time pricing models and probability calculators for sports betting markets.

## Sports Covered

| Sport | Status | Model |
|---|---|---|
| Football | Live | ZIP-Poisson + Dixon-Coles |
| Tennis | Live | Markov chain (point-level) + Elo |
| Basketball | Live | Normal distribution |
| NFL | Live | Normal distribution |
| Ice Hockey | Live | Poisson |
| Handball | Live | Bivariate Normal (Gaussian) |
| Bandy | Live | Poisson |
| Table Tennis | Live | Markov / Set-level |
| Volleyball | Live | Set-level model |
| Snooker | Live | Frame-level model |
| Futsal | Live | ZIP-Poisson |
| Cricket | Soon | — |
| Baseball | Soon | — |
| Darts | Soon | — |
| Rugby | Soon | — |

## Getting Started

No build step required. The project is vanilla JavaScript with ES modules.

```bash
npm install        # installs node-fetch for Netlify functions
npm test           # runs Tennis Engine test suite
```

Open any `.html` file directly in a browser, or serve the directory:

```bash
npx serve .
```

> **Note:** Tennis Elo integration requires the Netlify function proxy (`/.netlify/functions/fetch-elo`). This only works when deployed to Netlify or running via `netlify dev`. All other features work with a plain static server.

## Deployment

Deployed on Netlify. The repository root is the publish directory. Two serverless functions handle CORS proxying for Tennis Abstract Elo data:

- `netlify/functions/fetch-elo.js` — ATP ratings
- `netlify/functions/fetch-wta-elo.js` — WTA ratings

## Architecture

Each sport follows a three-layer pattern:

- **`<sport>_engine.js`** — Pure math: statistical model, solver, market generation. No DOM access.
- **`<sport>_model.js`** — UI controller: reads inputs, calls engine, writes results to DOM.
- **`<sport>.html`** — Page markup with result card containers.

Shared utilities live in `js/`:

- `js/core/math_utils.js` — `factorial`, `solveShin` (vig removal), `probToOdds`
- `js/math.js` — Football score matrix (ZIP-Poisson, Dixon-Coles)
- `js/markets.js` — Football market calculations from score matrix
- `js/ui_utils.js` — Shared UI helpers (tab switching, card toggle)
- `js/api.js` — Football live data from Kambi API
- `js/<sport>_api.js` — Sport-specific Kambi API loaders
- `js/tennis_elo_service.js` / `js/tennis_wta_elo_service.js` — Elo rating services

Live odds are pulled from the Kambi sportsbook API. Users select a country → competition → match, and the model inputs are auto-populated from real market odds.

## Models

### Football
Inputs: 1X2 odds + Over/Under line and odds. Solves for home (λ) and away (μ) expected goals using ZIP-Poisson with dynamic Dixon-Coles low-score correction. Produces a 21×21 score matrix from which all markets are derived: 1X2, BTTS, exact scores, Asian handicaps, HT/FT, first goal scorer, Win combos, etc.

### Tennis
Inputs: Match odds + total games line (optional Over/Under odds). Uses a Markov chain at the point level to derive game, set, and match probabilities. Serve-hold probabilities are solved iteratively. When player names are available, ATP/WTA Elo ratings (fetched from Tennis Abstract) are blended in as priors (70% Elo / 30% surface prior).

### Handball
Inputs: Asian handicap line/odds + total goals line/odds. Uses bivariate Normal distribution based on empirical data from 13,899 matches (2014–2024). Historical σ values: home=5.10, away=4.85, total=7.18.

## Data Sources

- **Live odds:** Kambi sportsbook API (`offering-api.kambicdn.com`)
- **Tennis Elo ratings:** Tennis Abstract (`tennisabstract.com/reports/atp_elo_ratings.html`), updated daily, proxied via Netlify function to bypass CORS
