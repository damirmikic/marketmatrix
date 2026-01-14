# BetPulse

Advanced real-time sports betting market analysis and probability calculators.

## Overview

BetPulse provides sophisticated pricing models and probability calculators for multiple sports, helping analyze betting markets with professional-grade analytics.

## Supported Sports

- **Tennis** - Advanced model with Elo integration, surface-specific calculations
- **Basketball** - NBA and international basketball markets
- **Football (Soccer)** - Match odds and goal markets
- **NFL** - American football point spreads and totals
- **Ice Hockey** - NHL and international hockey
- **Table Tennis** - Professional table tennis markets
- **Snooker** - Professional snooker tournaments

## Features

### Tennis Model
- **Elo Rating Integration** - Live ATP/WTA Elo ratings by surface
- **Surface-Specific Analysis** - Optimized for Hard, Clay, Grass, Indoor
- **Advanced Probability Calculations** - Point-by-point simulation
- **Real-time Market Analysis** - Live odds comparison

### General Features
- **Multiple Market Types** - Match Winner, Spreads, Totals, Handicaps
- **Live Probability Updates** - Real-time calculations
- **Historical Analysis** - Track performance over time
- **API Integration** - Odds API support for live data

## Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Netlify Serverless Functions
- **Data Sources**:
  - Odds API for live betting data
  - Tennis Abstract for Elo ratings
- **Deployment**: Netlify

## Project Structure

```
betpulse/
├── index.html              # Main landing page
├── tennis.html            # Tennis calculator
├── basketball.html        # Basketball calculator
├── football.html          # Football calculator
├── nfl.html              # NFL calculator
├── ice_hockey.html       # Ice Hockey calculator
├── table_tennis.html     # Table Tennis calculator
├── snooker.html          # Snooker calculator
├── js/                   # JavaScript modules
│   ├── core/            # Core utilities
│   ├── *_api.js        # Sport-specific API handlers
│   ├── *_model.js      # Calculation models (linked from HTML files)
│   └── tennis_elo_service.js  # Elo integration
├── netlify/
│   └── functions/       # Serverless functions for CORS proxying
├── docs/                # Documentation
└── style.css           # Global styles
```

## Getting Started

### Local Development

1. Clone the repository
```bash
git clone <your-betpulse-repo-url>
cd betpulse
```

2. Install dependencies
```bash
npm install
```

3. Run tests
```bash
npm test
```

4. Serve locally using any static server, e.g.:
```bash
python -m http.server 8000
# or
npx serve
```

### Deployment

The application is configured for Netlify deployment:

1. Connect your repository to Netlify
2. Set build settings:
   - **Build command**: (none required for static site)
   - **Publish directory**: `/` (root)
3. Deploy!

The Netlify functions will automatically be deployed from the `netlify/functions/` directory.

## Environment Variables

No environment variables required for basic functionality. The application uses public APIs and client-side calculations.

## Migration from MarketMatrix

This repository is the successor to the MarketMatrix project. All functionality has been preserved and migrated:

✅ All sports models and calculators
✅ Elo rating integration
✅ API integrations
✅ Netlify serverless functions
✅ Documentation

### What Changed
- Repository name: `marketmatrix` → `betpulse`
- Branding: MarketMatrix → BetPulse
- All references updated throughout codebase

### What Stayed the Same
- Complete calculation logic
- All sports models
- API endpoints and integrations
- File structure and architecture

## Documentation

- [Tennis Elo Integration](docs/ELO_INTEGRATION.md) - Detailed guide on Elo rating integration

## Contributing

This is a personal project, but suggestions and bug reports are welcome via issues.

## License

MIT License - See package.json for details

## Credits

- **Elo Ratings**: Tennis Abstract (Jeff Sackmann)
- **Development**: BetPulse Team

---

**Note**: This application is for educational and analytical purposes only. Always gamble responsibly.
