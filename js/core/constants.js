// Shared numeric constants — import from here rather than redefining per-file.

// Shin vig-removal solver
export const SHIN_ITERATIONS = 50;

// Tennis: surface serve-hold priors (probability server wins their service game)
export const SURFACE_SERVE_PRIORS = {
    Grass: 0.75,
    Hard: 0.68,
    Clay: 0.60,
    Indoor: 0.73,
};

// Tennis: base expected total games by surface (for synthetic total estimation)
export const SURFACE_BASE_TOTALS = {
    Grass: 23.5,
    Hard: 22.5,
    Clay: 21.5,
    Indoor: 23.5,
};

// Tennis: Elo blend weights when merging Elo priors with surface priors
export const ELO_WEIGHT = 0.70;
export const SURFACE_WEIGHT = 0.30;

// Tennis: fair total shift per unit of pOver deviation from 0.5
export const TOTAL_SLOPE_FACTOR = 12.0;

// Tennis: games spread implied by match-win probability
export const SPREAD_FACTOR = 14.0;

// Tennis: competitiveness adjustment for synthetic totals
export const COMPETITIVENESS_FACTOR = 12.0;
