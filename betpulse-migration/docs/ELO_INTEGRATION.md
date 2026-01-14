# Tennis Elo Ratings Integration

## Overview

The BetPulse Tennis Model now integrates live Elo ratings by surface from Tennis Abstract, providing enhanced calculation accuracy and additional player insights.

## Features

### 1. **Surface-Specific Elo Ratings**
- **Hard Court Elo (hElo)**: Optimized for hard court surfaces
- **Clay Court Elo (cElo)**: Optimized for clay court surfaces
- **Grass Court Elo (gElo)**: Optimized for grass court surfaces
- **Overall Elo**: General rating across all surfaces

### 2. **Automatic Data Integration**
- Fetches current ATP Elo ratings on page load
- 24-hour cache to minimize API calls
- Graceful fallback if data is unavailable
- Automatic player name matching

### 3. **Enhanced Calculation Parameters**
- **Elo-Enhanced Priors**: Blends Elo-based probabilities (70%) with surface-specific priors (30%)
- **Improved Convergence**: Better initial estimates lead to faster, more accurate solver results
- **Win Probability Calculation**: Standard Elo formula converts ratings to match probabilities
- **Hold Probability Mapping**: Empirical relationship maps match odds to serve hold percentages

## Architecture

### Files Created/Modified

#### New Files:
1. **`js/tennis_elo_service.js`** (380 lines)
   - `TennisEloService` class for fetching and managing Elo data
   - Player name normalization for fuzzy matching
   - Win probability calculations
   - Hold probability conversion formulas

#### Modified Files:
1. **`tennis_engine.js`**
   - Updated `solveParameters()` to accept `eloHoldProbs` parameter
   - Blending logic for Elo and surface priors
   - Lines 126-162: Enhanced initialization section

2. **`tennis_model.js`**
   - Imports `tennisEloService`
   - Stores current player names and surface
   - Fetches Elo data before calculation
   - New `displayEloRatings()` function
   - `setCurrentPlayers()` function for API integration

3. **`js/tennis_api.js`**
   - Extracts player names from event data
   - Calls `setCurrentPlayers()` on match selection
   - Lines 231-267: Enhanced match selection handler

4. **`tennis.html`**
   - New "Elo Ratings" card section
   - Displays player Elo ratings, ATP ranks, and win probabilities

## Data Flow

```
User selects match
    ↓
handleMatchChange() extracts player names
    ↓
setCurrentPlayers(player1, player2, surface)
    ↓
runModel() called
    ↓
tennisEloService.getEloAdjustedHoldProbs()
    ↓
Elo-based hold probs (pa, pb) calculated
    ↓
solveParameters(..., eloHoldProbs)
    ↓
Blended initialization (70% Elo + 30% surface prior)
    ↓
Solver converges faster with better accuracy
    ↓
displayEloRatings() shows player data
```

## Technical Details

### Elo Win Probability Formula
```javascript
P(A beats B) = 1 / (1 + 10^((Elo_B - Elo_A) / 400))
```

### Hold Probability Conversion
Empirical mapping from match win probability to serve hold percentage:

```javascript
if (matchWinProb >= 0.5) {
    // Favorite: scale from surface base to 0.85
    holdProb = baseHold + (matchWinProb - 0.5) * 2 * (0.85 - baseHold)
} else {
    // Underdog: scale from 0.50 to surface base
    holdProb = 0.50 + matchWinProb * 2 * (baseHold - 0.50)
}
```

**Surface Base Hold Rates:**
- Grass: 0.75 (serve-dominant)
- Indoor: 0.73
- Hard: 0.68 (neutral)
- Clay: 0.60 (rally-dominant)

### Blending Strategy
```javascript
const ELO_WEIGHT = 0.70;  // Trust Elo ratings
const SURFACE_WEIGHT = 0.30;  // Maintain surface characteristics

pa = ELO_WEIGHT * eloHoldProbs.pa + SURFACE_WEIGHT * surfaceAdjustedPa
pb = ELO_WEIGHT * eloHoldProbs.pb + SURFACE_WEIGHT * surfaceAdjustedPb
```

## API Reference

### TennisEloService Methods

#### `fetchEloRatings()`
Fetches latest Elo ratings from Tennis Abstract. Returns cached data if less than 24 hours old.

```javascript
await tennisEloService.fetchEloRatings();
```

#### `getPlayerElo(playerName, surface)`
Returns Elo rating for specific player and surface.

```javascript
const elo = tennisEloService.getPlayerElo('Jannik Sinner', 'Hard');
// Returns: 2245.2
```

#### `calculateWinProbability(player1, player2, surface)`
Calculates match win probability based on Elo ratings.

```javascript
const winProb = tennisEloService.calculateWinProbability(
    'Carlos Alcaraz',
    'Novak Djokovic',
    'Clay'
);
// Returns: 0.547 (54.7% chance for Alcaraz)
```

#### `getEloAdjustedHoldProbs(player1, player2, surface)`
Returns adjusted hold probabilities for both players.

```javascript
const holdProbs = tennisEloService.getEloAdjustedHoldProbs(
    'Jannik Sinner',
    'Alexander Zverev',
    'Hard'
);
// Returns: { pa: 0.72, pb: 0.64 }
```

## UI Components

### Elo Ratings Card
Displays when a match is selected:

- **Player Names**: Full names from API
- **Surface-Specific Elo**: Relevant rating for current surface
- **ATP Rank**: Official ATP ranking
- **Elo Win Probability**: Calculated match odds
- **Enhanced Status**: "✓ Elo-Enhanced" badge when used in calculations

## Performance Considerations

1. **Caching**: 24-hour cache reduces API calls and improves load times
2. **Graceful Degradation**: System works without Elo data (falls back to surface priors)
3. **Lazy Loading**: Elo data fetched on page load, doesn't block initial render
4. **Fuzzy Matching**: Name normalization handles variations in player names

## CORS Handling

Tennis Abstract blocks direct browser requests due to CORS policies. **This has been solved using a Netlify serverless function proxy.**

### ✅ Implemented Solution: Netlify Serverless Function

The application uses a Netlify serverless function (`netlify/functions/fetch-elo.js`) to proxy requests to Tennis Abstract, bypassing CORS restrictions.

**How it works:**
1. Browser requests Elo data from `/.netlify/functions/fetch-elo`
2. Netlify function fetches data from Tennis Abstract server-side
3. Function returns data with CORS headers enabled
4. Browser receives data without CORS errors

**Files:**
- `netlify/functions/fetch-elo.js` - Proxy function
- `netlify.toml` - Netlify configuration
- `package.json` - Dependencies (node-fetch)
- `js/tennis_elo_service.js` - Updated to use proxy endpoint

**Endpoint:**
```javascript
this.ELO_API_URL = '/.netlify/functions/fetch-elo';
```

### Alternative Solutions (Not Used)

#### Option 1: Browser Extension (Development Only)
Use a CORS proxy extension for local testing:
- [CORS Unblock](https://chrome.google.com/webstore/detail/cors-unblock) (Chrome)
- [CORS Everywhere](https://addons.mozilla.org/en-US/firefox/addon/cors-everywhere/) (Firefox)

#### Option 2: Manual JSON Data
Pre-download Elo data and serve as static JSON:
```javascript
// Fetch from local file instead
const response = await fetch('/data/elo-ratings.json');
```

## Future Enhancements

1. **Historical Elo Tracking**: Store past ratings for trend analysis
2. **Head-to-Head Elo**: Calculate H2H-adjusted ratings
3. **Form Weighting**: Recent match results adjust current Elo
4. **Custom Blending**: User-configurable Elo vs surface prior weighting
5. **Live Updates**: Refresh Elo ratings after each match completion

## Data Source

**Tennis Abstract Elo Ratings**
- URL: https://www.tennisabstract.com/reports/atp_elo_ratings.html
- Updated: Daily
- Coverage: Top 500 ATP players
- Methodology: Based on Jeff Sackmann's Elo algorithm
- Source Code: https://github.com/JeffSackmann/tennis_atp

## Credits

- **Elo System**: Created by Jeff Sackmann (Tennis Abstract)
- **Integration**: BetPulse Development Team
- **Surface Adjustments**: Based on empirical ATP match data (2015-2025)

## License

Elo data courtesy of Tennis Abstract. See their website for usage terms and attribution requirements.
