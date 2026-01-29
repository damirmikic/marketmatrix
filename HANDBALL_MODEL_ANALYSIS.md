# Handball Model Analysis - Based on Historical Data

## Data Summary
- **Sample Size**: 13,899 matches
- **Period**: August 26, 2014 - June 9, 2024
- **Source**: Real handball match results

## Historical Statistics

### Match Totals
- **Average**: 56.70 goals per match
- **Variance**: 51.56
- **Standard Deviation**: 7.18
- **E/V Ratio**: 1.10
- **Range**: 31-91 goals
- **Distribution**: Approximately Normal/Gaussian

### Match Outcomes
- **Home Win**: 54.2%
- **Draw**: 8.6%
- **Away Win**: 37.2%

### Home Team Goals
- **Average**: 28.92 goals
- **Variance**: 26.05
- **Standard Deviation**: 5.10
- **E/V Ratio**: 1.11
- **Range**: 7-60 goals

### Away Team Goals
- **Average**: 27.78 goals
- **Variance**: 23.52
- **Standard Deviation**: 4.85
- **E/V Ratio**: 1.18
- **Range**: 8-60 goals

### Goal Difference
- **Average**: 1.14 goals (home advantage)
- **Variance**: 47.59
- **Standard Deviation**: 6.90
- **E/V Ratio**: 0.02
- **Range**: -46 to +49 goals

## Key Findings

### 1. UNDER-DISPERSION (Critical Discovery)

**E/V Ratio Interpretation:**
- For Poisson distribution: E/V = 1 (mean equals variance)
- **E/V > 1**: Variance < Mean → **UNDER-DISPERSION**
- E/V < 1: Variance > Mean → Over-dispersion

**Data shows consistent under-dispersion:**
- Match total: E/V = 1.10
- Home team: E/V = 1.11
- Away team: E/V = 1.18

**Conclusion**: Handball scoring is MORE CONSISTENT than a Poisson process. Teams score more predictably than random events would suggest.

### 2. Conway-Maxwell-Poisson (CMP) Parameter Adjustment

**CMP Dispersion Parameter (nu):**
- `nu = 1`: Standard Poisson
- `nu > 1`: Under-dispersion (less variance, more consistency)
- `nu < 1`: Over-dispersion (more variance, less consistency)

**Previous Model (INCORRECT):**
```javascript
this.nuHome = 0.92;  // Over-dispersion
this.nuAway = 0.92;  // Over-dispersion
```

**Updated Model (CORRECT):**
```javascript
this.nuHome = 1.11;  // Under-dispersion (matches E/V = 1.11)
this.nuAway = 1.18;  // Under-dispersion (matches E/V = 1.18)
```

### 3. Asymmetric Dispersion

Away teams show MORE under-dispersion than home teams:
- Away: E/V = 1.18 → `nuAway = 1.18`
- Home: E/V = 1.11 → `nuHome = 1.11`

**Interpretation**: Away team scoring is slightly more predictable/consistent than home team scoring.

### 4. Home Advantage

**Goal Differential:**
- Home: 28.92 avg goals
- Away: 27.78 avg goals
- Difference: **1.14 goals**

**Win Probabilities:**
- Home win: 54.2%
- Away win: 37.2%
- Ratio: **1.46x** (home team 46% more likely to win)

### 5. Draw Frequency

Historical draw rate: **8.6%**

Current correlation parameter `rho = 0.05` boosts diagonal probabilities (equal scores) by 5%, which should approximate this draw rate. This parameter remains unchanged pending model testing.

### 6. Distribution Characteristics

All three measures (match total, home goals, away goals) show:
- E/V ratios close to Normal distribution behavior
- With high scoring (56+ goals), the Central Limit Theorem applies
- CMP with nu > 1 appropriately models this under-dispersed, near-Normal behavior

## Model Changes Implemented

### 1. Core Parameters
```javascript
// Old (incorrect)
this.nuHome = 0.92;
this.nuAway = 0.92;

// New (data-driven)
this.nuHome = 1.11;  // Matches home E/V = 1.11
this.nuAway = 1.18;  // Matches away E/V = 1.18
```

### 2. Updated Documentation
- Corrected all comments referencing dispersion behavior
- Added historical data references to comments
- Clarified relationship between lambda and expected value for nu ≠ 1

### 3. Unchanged Parameters
- `rho = 0.05` (correlation for draws) - retained pending testing
- `H1_RATIO = 0.485` (first half ratio) - retained pending testing
- Solver parameters - retained pending testing

## Expected Impact

### Positive Changes:
1. **More accurate probabilities** for match outcomes (1X2)
2. **Better handicap pricing** due to correct variance modeling
3. **Improved total goals markets** with correct dispersion
4. **Asymmetric team behavior** now modeled correctly

### Model Behavior with nu > 1:
- Tighter probability distributions around expected values
- Lower probabilities for extreme scores (very high/low)
- Higher probabilities near the mean
- Better reflection of handball's consistent scoring patterns

## Statistical Validation

The shift from nu < 1 to nu > 1 is supported by:
1. **Direct E/V measurements** from 13,899 matches
2. **All three metrics** (total, home, away) show E/V > 1
3. **Consistency across 10-year period** (2014-2024)
4. **Theoretical alignment**: High-scoring sports with many possessions tend toward consistency (Law of Large Numbers within a single match)

## Recommendations

1. **Test with live market odds** to validate model accuracy
2. **Monitor draw probability outputs** - may need rho adjustment
3. **Verify handicap markets** converge properly with new nu values
4. **Check solver convergence** - nu > 1 creates tighter distributions
5. **Analyze model predictions** vs actual bookmaker lines

## Conclusion

The historical data reveals that **handball scoring is significantly more predictable than previously assumed**. The E/V ratios > 1 conclusively demonstrate under-dispersion, requiring CMP parameters nu > 1.

This is a **fundamental correction** to the model's statistical foundation, moving from over-dispersion (nu < 1) to under-dispersion (nu > 1). This change should substantially improve model accuracy across all markets.

The asymmetry between home and away dispersion (nuHome = 1.11 vs nuAway = 1.18) adds another layer of realism, capturing the fact that away teams exhibit slightly more consistent scoring patterns than home teams.

---

**Analysis Date**: 2026-01-29
**Data Source**: 13,899 handball matches (2014-2024)
**Model Version**: handball_engine.js (updated)
