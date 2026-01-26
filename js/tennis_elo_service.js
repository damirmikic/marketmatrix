/**
 * Tennis Elo Rating Service
 * Fetches and manages player Elo ratings by surface from Tennis Abstract
 */

class TennisEloService {
    constructor() {
        this.eloCache = new Map(); // Cache player Elo data
        this.lastFetchTime = null;
        this.CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
        // Use direct Tennis Abstract URL (requires CORS allowance)
        this.ELO_API_URL = 'https://www.tennisabstract.com/reports/atp_elo_ratings.html';
    }

    /**
     * Fetch current ATP Elo ratings from Tennis Abstract
     * @returns {Promise<Map>} Map of player names to their Elo ratings
     */
    async fetchEloRatings() {
        try {
            // Check cache validity
            if (this.lastFetchTime && (Date.now() - this.lastFetchTime < this.CACHE_DURATION)) {
                console.log('Using cached Elo ratings');
                return this.eloCache;
            }

            console.log('Fetching fresh Elo ratings from Tennis Abstract...');

            // Fetch the HTML page
            const response = await fetch(this.ELO_API_URL);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const html = await response.text();

            // Parse the HTML and extract Elo ratings
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const table = doc.querySelector('table.tablesorter');

            if (!table) {
                throw new Error('Could not find Elo ratings table');
            }

            // Clear old cache
            this.eloCache.clear();

            // Parse table rows
            const rows = table.querySelectorAll('tbody tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 11) return; // Skip invalid rows

                const rank = parseInt(cells[0].textContent.trim());
                const playerLink = cells[1].querySelector('a');
                if (!playerLink) return;

                const playerName = playerLink.textContent.trim();
                const age = parseFloat(cells[2].textContent.trim());
                const elo = parseFloat(cells[3].textContent.trim());
                const hEloRank = parseInt(cells[5].textContent.trim()) || null;
                const hElo = parseFloat(cells[6].textContent.trim()) || null;
                const cEloRank = parseInt(cells[7].textContent.trim()) || null;
                const cElo = parseFloat(cells[8].textContent.trim()) || null;
                const gEloRank = parseInt(cells[9].textContent.trim()) || null;
                const gElo = parseFloat(cells[10].textContent.trim()) || null;
                const peakElo = parseFloat(cells[12].textContent.trim()) || null;
                const atpRank = parseInt(cells[15].textContent.trim()) || null;

                // Store in cache
                this.eloCache.set(this.normalizePlayerName(playerName), {
                    name: playerName,
                    rank,
                    age,
                    elo,
                    hElo,
                    hEloRank,
                    cElo,
                    cEloRank,
                    gElo,
                    gEloRank,
                    peakElo,
                    atpRank,
                    lastUpdated: Date.now()
                });
            });

            this.lastFetchTime = Date.now();
            console.log(`Loaded ${this.eloCache.size} player Elo ratings`);

            return this.eloCache;
        } catch (error) {
            console.error('Error fetching Elo ratings:', error);
            // Return cached data if available
            if (this.eloCache.size > 0) {
                console.log('Returning cached Elo data due to fetch error');
                return this.eloCache;
            }
            throw error;
        }
    }

    /**
     * Normalize player name for matching
     * @param {string} name - Player name from API
     * @returns {string} Normalized name
     */
    normalizePlayerName(name) {
        return name
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/[^a-z\s]/g, '')
            .trim();
    }

    /**
     * Get Elo rating for a specific player and surface
     * @param {string} playerName - Player name
     * @param {string} surface - Surface type ('Hard', 'Clay', 'Grass', 'Indoor')
     * @returns {number|null} Elo rating or null if not found
     */
    getPlayerElo(playerName, surface = null) {
        const normalizedName = this.normalizePlayerName(playerName);
        const playerData = this.eloCache.get(normalizedName);

        if (!playerData) {
            console.warn(`Elo rating not found for player: ${playerName}`);
            return null;
        }

        // Return surface-specific Elo if requested
        if (surface) {
            switch (surface.toLowerCase()) {
                case 'hard':
                case 'indoor':
                    return playerData.hElo || playerData.elo;
                case 'clay':
                    return playerData.cElo || playerData.elo;
                case 'grass':
                    return playerData.gElo || playerData.elo;
                default:
                    return playerData.elo;
            }
        }

        return playerData.elo;
    }

    /**
     * Get full Elo data for a player
     * @param {string} playerName - Player name
     * @returns {Object|null} Complete Elo data or null
     */
    getPlayerData(playerName) {
        const normalizedName = this.normalizePlayerName(playerName);
        return this.eloCache.get(normalizedName) || null;
    }

    /**
     * Calculate win probability based on Elo ratings
     * Uses standard Elo formula: P(A beats B) = 1 / (1 + 10^((Elo_B - Elo_A)/400))
     * @param {string} player1 - First player name
     * @param {string} player2 - Second player name
     * @param {string} surface - Surface type
     * @returns {number|null} Win probability for player1 (0-1) or null if data missing
     */
    calculateWinProbability(player1, player2, surface = null) {
        const elo1 = this.getPlayerElo(player1, surface);
        const elo2 = this.getPlayerElo(player2, surface);

        if (elo1 === null || elo2 === null) {
            return null;
        }

        // Standard Elo win probability formula
        const eloDiff = elo2 - elo1;
        const winProbability = 1 / (1 + Math.pow(10, eloDiff / 400));

        return winProbability;
    }

    /**
     * Convert Elo-based match probability to service hold probability
     * Uses empirical relationship between match win prob and serve hold %
     * @param {number} matchWinProb - Probability of winning match (0-1)
     * @param {string} surface - Surface type
     * @returns {number} Estimated serve hold probability
     */
    matchProbToHoldProb(matchWinProb, surface = 'Hard') {
        // Surface-specific base hold rates
        const surfaceBases = {
            'Grass': 0.75,
            'Indoor': 0.73,
            'Hard': 0.68,
            'Clay': 0.60
        };

        const baseHold = surfaceBases[surface] || 0.68;

        // Convert match probability to hold percentage
        // Formula based on empirical tennis data:
        // Strong favorite (0.8 match prob) ≈ 0.75 hold
        // Even match (0.5 match prob) ≈ surface base
        // Underdog (0.2 match prob) ≈ 0.55 hold

        if (matchWinProb >= 0.5) {
            // Favorite: scale from base to 0.85
            const range = 0.85 - baseHold;
            return baseHold + (matchWinProb - 0.5) * 2 * range;
        } else {
            // Underdog: scale from 0.50 to base
            const range = baseHold - 0.50;
            return 0.50 + matchWinProb * 2 * range;
        }
    }

    /**
     * Get adjusted hold probabilities for both players based on Elo
     * @param {string} player1 - First player name
     * @param {string} player2 - Second player name
     * @param {string} surface - Surface type
     * @returns {Object|null} {pa: number, pb: number} or null if data unavailable
     */
    getEloAdjustedHoldProbs(player1, player2, surface = 'Hard') {
        const winProb1 = this.calculateWinProbability(player1, player2, surface);

        if (winProb1 === null) {
            return null;
        }

        const pa = this.matchProbToHoldProb(winProb1, surface);
        const pb = this.matchProbToHoldProb(1 - winProb1, surface);

        return { pa, pb };
    }

    /**
     * Check if Elo data is available and fresh
     * @returns {boolean}
     */
    isDataAvailable() {
        return this.eloCache.size > 0 &&
               this.lastFetchTime &&
               (Date.now() - this.lastFetchTime < this.CACHE_DURATION);
    }

    /**
     * Force refresh of Elo data
     * @returns {Promise<Map>}
     */
    async refreshData() {
        this.lastFetchTime = null;
        return await this.fetchEloRatings();
    }

    /**
     * Search for players by partial name match
     * @param {string} searchTerm - Search term
     * @returns {Array} Array of matching player data
     */
    searchPlayers(searchTerm) {
        const normalized = this.normalizePlayerName(searchTerm);
        const results = [];

        this.eloCache.forEach((data, key) => {
            if (key.includes(normalized)) {
                results.push(data);
            }
        });

        return results.sort((a, b) => a.rank - b.rank);
    }
}

// Export singleton instance
export const tennisEloService = new TennisEloService();
