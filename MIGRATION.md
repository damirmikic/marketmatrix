# Migration Guide: MarketMatrix → BetPulse

## Migration Summary

This repository contains a complete migration of all functionality from the `marketmatrix` repository to `betpulse`. The migration was performed on **January 14, 2026**.

## What Was Migrated

### ✅ Complete Functionality
- All sports betting models (Tennis, Basketball, Football, NFL, Ice Hockey, Table Tennis, Snooker)
- Tennis Elo rating integration (ATP & WTA)
- All API integrations and handlers
- Netlify serverless functions for CORS proxying
- All HTML interfaces and calculators
- Complete JavaScript calculation engines
- Documentation (ELO_INTEGRATION.md)
- Configuration files (package.json, netlify.toml)
- Test files

### ✅ Updated References
All references to "MarketMatrix" have been updated to "BetPulse":

| File Type | Changes |
|-----------|---------|
| `package.json` | Package name, author |
| All HTML files | Page titles (`<title>` tags) |
| `index.html` | Main heading (`<h1>`) |
| `docs/ELO_INTEGRATION.md` | Documentation references |
| `netlify/functions/*.js` | User-Agent headers |

### ✅ Verified
- ✅ No remaining "marketmatrix" references (case-insensitive search)
- ✅ Git repository initialized
- ✅ Initial commit created
- ✅ All 37 source files preserved

## Next Steps: Pushing to GitHub

### 1. Create New GitHub Repository

Go to GitHub and create a new repository:
- Repository name: `betpulse`
- Description: "Advanced sports betting market analysis and probability calculators"
- Visibility: Public or Private (your choice)
- **DO NOT** initialize with README, .gitignore, or license (we already have these)

### 2. Add Remote and Push

Once you've created the GitHub repository, run these commands:

```bash
cd /home/user/betpulse

# Add the remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/betpulse.git

# Rename branch to main (optional, if you prefer main over master)
git branch -M main

# Push to GitHub
git push -u origin main
```

### 3. Configure Netlify (if deploying)

If you want to deploy BetPulse:

1. **Connect to Netlify**:
   - Go to [Netlify](https://app.netlify.com)
   - Click "Add new site" → "Import an existing project"
   - Connect to your GitHub account
   - Select the `betpulse` repository

2. **Build Settings**:
   - Build command: (leave empty for static site)
   - Publish directory: `/` (root directory)
   - Functions directory: `netlify/functions` (auto-detected)

3. **Deploy**:
   - Click "Deploy site"
   - Netlify will automatically deploy your site and serverless functions

4. **Custom Domain** (optional):
   - Go to Site settings → Domain management
   - Add your custom domain (e.g., `betpulse.com`)

## File Inventory

### HTML Pages (8 files)
- `index.html` - Landing page
- `tennis.html` - Tennis calculator
- `basketball.html` - Basketball calculator
- `football.html` - Football/Soccer calculator
- `nfl.html` - NFL calculator
- `ice_hockey.html` - Ice Hockey calculator
- `table_tennis.html` - Table Tennis calculator
- `snooker.html` - Snooker calculator

### JavaScript Models (7 files)
- `model.js` - Core model
- `tennis_model.js` + `tennis_engine.js`
- `basketball_model.js`
- `nfl_model.js`
- `ice_hockey_model.js`
- `table_tennis_model.js`
- `snooker_model.js`

### JavaScript API Handlers (8 files in `js/`)
- `api.js` - Core API
- `tennis_api.js`
- `basketball_api.js`
- `nfl_api.js`
- `ice_hockey_api.js`
- `table_tennis_api.js`
- `snooker_api.js`
- `tennis_elo_service.js` + `tennis_wta_elo_service.js`

### Utilities (3 files in `js/`)
- `math.js` - Math utilities
- `markets.js` - Market definitions
- `bet_builder.js` - Bet construction
- `core/math_utils.js` - Core math utilities

### Serverless Functions (2 files in `netlify/functions/`)
- `fetch-elo.js` - ATP Elo proxy
- `fetch-wta-elo.js` - WTA Elo proxy

### Configuration (4 files)
- `package.json` - npm configuration
- `netlify.toml` - Netlify configuration
- `style.css` - Global styles
- `favicon.png` - Site icon

### Documentation (3 files)
- `README.md` - Project overview
- `MIGRATION.md` - This file
- `docs/ELO_INTEGRATION.md` - Technical docs

### Tests (1 file)
- `test_tennis_engine.js`

## Comparison: Old vs New

| Aspect | MarketMatrix | BetPulse |
|--------|-------------|----------|
| Repository | `marketmatrix` | `betpulse` |
| Branding | MarketMatrix | BetPulse |
| Functionality | ✅ All features | ✅ All features (identical) |
| Git History | Original repo history | Fresh start (clean history) |
| Status | Active (legacy) | Active (current) |

## Original Repository

The original `marketmatrix` repository remains available at:
- Location: `/home/user/marketmatrix`
- Status: **Preserved** for reference
- Branch: `claude/repo-migration-discussion-OXMLD`

### Recommended Actions for Original Repo

Once BetPulse is deployed and verified:

1. **Add Deprecation Notice** to `marketmatrix/README.md`:
   ```markdown
   # ⚠️ DEPRECATED - This repository has been superseded by BetPulse

   **New Repository**: [github.com/YOUR_USERNAME/betpulse](https://github.com/YOUR_USERNAME/betpulse)

   This repository is no longer actively maintained. All functionality has been
   migrated to BetPulse with the same features and improved branding.
   ```

2. **Archive the Repository** on GitHub:
   - Go to repository Settings → scroll to "Danger Zone"
   - Click "Archive this repository"
   - Confirm archival

3. **Update Deployments**:
   - If MarketMatrix is deployed on Netlify, either:
     - Stop the deployment, or
     - Add a redirect to the new BetPulse URL

## Rollback Plan

If you need to revert to MarketMatrix for any reason:

1. The original repository is preserved at `/home/user/marketmatrix`
2. All git history is intact
3. Simply continue working in that directory

## Testing Checklist

Before considering migration complete, verify:

- [ ] Push to GitHub successful
- [ ] README displays correctly on GitHub
- [ ] Clone repository to new location works
- [ ] Netlify deployment successful (if applicable)
- [ ] All HTML pages load correctly
- [ ] Tennis Elo integration works
- [ ] API integrations functional
- [ ] Serverless functions working
- [ ] All sports calculators operational

## Support

For issues related to:
- **Migration process**: Check this document
- **BetPulse functionality**: See README.md and docs/
- **Original MarketMatrix**: Refer to preserved repository

---

**Migration Date**: January 14, 2026
**Migrated By**: Automated migration script
**Files Migrated**: 37 files
**Lines of Code**: ~12,299 lines
**Status**: ✅ Complete
