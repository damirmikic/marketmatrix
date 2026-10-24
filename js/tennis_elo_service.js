import { SURFACE_SERVE_PRIORS } from './core/constants.js';

// WTA surface hold rates differ from ATP (lower overall, different shape)
const WTA_SURFACE_BASES = { Grass: 0.72, Indoor: 0.70, Hard: 0.65, Clay: 0.57 };

function createEloService({ tour, endpoint, rankField, favoriteMax, underdogMin, surfaceBases }) {
    return new class {
        constructor() {
            this.eloCache = new Map();
            this.lastFetchTime = null;
            this.CACHE_DURATION = 24 * 60 * 60 * 1000;
        }

        async fetchEloRatings() {
            try {
                if (this.lastFetchTime && (Date.now() - this.lastFetchTime < this.CACHE_DURATION)) {
                    return this.eloCache;
                }

                const response = await fetch(endpoint);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const table = doc.querySelector('table.tablesorter');

                if (!table) throw new Error(`Could not find ${tour.toUpperCase()} Elo ratings table`);

                this.eloCache.clear();
                table.querySelectorAll('tbody tr').forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 11) return;

                    const playerLink = cells[1].querySelector('a');
                    if (!playerLink) return;

                    const playerName = playerLink.textContent.trim();
                    this.eloCache.set(this.normalizePlayerName(playerName), {
                        name: playerName,
                        rank: parseInt(cells[0].textContent.trim()),
                        age: parseFloat(cells[2].textContent.trim()),
                        elo: parseFloat(cells[3].textContent.trim()),
                        hEloRank: parseInt(cells[5].textContent.trim()) || null,
                        hElo: parseFloat(cells[6].textContent.trim()) || null,
                        cEloRank: parseInt(cells[7].textContent.trim()) || null,
                        cElo: parseFloat(cells[8].textContent.trim()) || null,
                        gEloRank: parseInt(cells[9].textContent.trim()) || null,
                        gElo: parseFloat(cells[10].textContent.trim()) || null,
                        peakElo: parseFloat(cells[12].textContent.trim()) || null,
                        [rankField]: parseInt(cells[15].textContent.trim()) || null,
                        lastUpdated: Date.now()
                    });
                });

                this.lastFetchTime = Date.now();
                return this.eloCache;
            } catch (error) {
                console.error(`Error fetching ${tour.toUpperCase()} Elo ratings:`, error);
                if (this.eloCache.size > 0) return this.eloCache;
                throw error;
            }
        }

        normalizePlayerName(name) {
            return name.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z\s]/g, '').trim();
        }

        getPlayerElo(playerName, surface = null) {
            const playerData = this.eloCache.get(this.normalizePlayerName(playerName));
            if (!playerData) {
                console.warn(`${tour.toUpperCase()} Elo rating not found for player: ${playerName}`);
                return null;
            }
            if (surface) {
                switch (surface.toLowerCase()) {
                    case 'hard': case 'indoor': return playerData.hElo || playerData.elo;
                    case 'clay': return playerData.cElo || playerData.elo;
                    case 'grass': return playerData.gElo || playerData.elo;
                    default: return playerData.elo;
                }
            }
            return playerData.elo;
        }

        getPlayerData(playerName) {
            return this.eloCache.get(this.normalizePlayerName(playerName)) || null;
        }

        calculateWinProbability(player1, player2, surface = null) {
            const elo1 = this.getPlayerElo(player1, surface);
            const elo2 = this.getPlayerElo(player2, surface);
            if (elo1 === null || elo2 === null) return null;
            return 1 / (1 + Math.pow(10, (elo2 - elo1) / 400));
        }

        matchProbToHoldProb(matchWinProb, surface = 'Hard') {
            const baseHold = surfaceBases[surface] ?? surfaceBases.Hard;
            if (matchWinProb >= 0.5) {
                return baseHold + (matchWinProb - 0.5) * 2 * (favoriteMax - baseHold);
            } else {
                return underdogMin + matchWinProb * 2 * (baseHold - underdogMin);
            }
        }

        getEloAdjustedHoldProbs(player1, player2, surface = 'Hard') {
            const winProb1 = this.calculateWinProbability(player1, player2, surface);
            if (winProb1 === null) return null;
            return {
                pa: this.matchProbToHoldProb(winProb1, surface),
                pb: this.matchProbToHoldProb(1 - winProb1, surface)
            };
        }

        isDataAvailable() {
            return this.eloCache.size > 0 &&
                this.lastFetchTime &&
                (Date.now() - this.lastFetchTime < this.CACHE_DURATION);
        }

        async refreshData() {
            this.lastFetchTime = null;
            return this.fetchEloRatings();
        }

        searchPlayers(searchTerm) {
            const normalized = this.normalizePlayerName(searchTerm);
            const results = [];
            this.eloCache.forEach((data, key) => {
                if (key.includes(normalized)) results.push(data);
            });
            return results.sort((a, b) => a.rank - b.rank);
        }
    }();
}

export const tennisEloService = createEloService({
    tour: 'atp',
    endpoint: '/.netlify/functions/fetch-elo?tour=atp',
    rankField: 'atpRank',
    favoriteMax: 0.85,
    underdogMin: 0.50,
    surfaceBases: SURFACE_SERVE_PRIORS
});

export const tennisWtaEloService = createEloService({
    tour: 'wta',
    endpoint: '/.netlify/functions/fetch-elo?tour=wta',
    rankField: 'wtaRank',
    favoriteMax: 0.82,
    underdogMin: 0.48,
    surfaceBases: WTA_SURFACE_BASES
});
