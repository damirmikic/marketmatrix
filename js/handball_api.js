import { createKambiLoader } from './core/kambi_api.js';

const LIST_VIEW_URL = 'https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/listView/handball/all/all/all/matches.json?channel_id=7&channel_id=7&client_id=200&client_id=200&competitionId=undefined&lang=en_GB&lang=en_GB&market=GB&market=GB&useCombined=true&useCombinedLive=true';

const INPUT_IDS = ['handicapLine', 'handicapHomeOdds', 'handicapAwayOdds', 'totalGoalsLine', 'overOdds', 'underOdds'];

function injectOdds(betOffers) {
    INPUT_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    if (!betOffers) return;

    let handicap = { line: null, home: null, away: null, _balance: Infinity };
    let totalGoals = { line: null, over: null, under: null, _balance: Infinity };

    betOffers.forEach(offer => {
        if (!offer.outcomes || offer.outcomes.length === 0) return;

        if (offer.betOfferType && offer.betOfferType.name === 'Handicap') {
            const homeOutcome = offer.outcomes.find(o => o.type === 'OT_ONE');
            const awayOutcome = offer.outcomes.find(o => o.type === 'OT_TWO');
            if (homeOutcome && awayOutcome && homeOutcome.line != null) {
                const homeOdds = homeOutcome.odds / 1000;
                const awayOdds = awayOutcome.odds / 1000;
                const balance = Math.abs(homeOdds - 2.0) + Math.abs(awayOdds - 2.0);
                if (balance < handicap._balance) {
                    handicap = { line: homeOutcome.line / 1000, home: homeOdds, away: awayOdds, _balance: balance };
                }
            }
        }

        if (offer.betOfferType && offer.betOfferType.name === 'Over/Under') {
            const isTotal = offer.criterion &&
                (offer.criterion.label === 'Total Goals' || offer.criterion.englishLabel === 'Total Goals' ||
                 offer.criterion.label === 'Total' || offer.criterion.englishLabel === 'Total');
            if (isTotal) {
                const overOutcome = offer.outcomes.find(o => o.type === 'OT_OVER');
                const underOutcome = offer.outcomes.find(o => o.type === 'OT_UNDER');
                if (overOutcome && underOutcome) {
                    const overOdds = overOutcome.odds / 1000;
                    const underOdds = underOutcome.odds / 1000;
                    const balance = Math.abs(overOdds - 2.0) + Math.abs(underOdds - 2.0);
                    if (balance < totalGoals._balance) {
                        totalGoals = {
                            line: (overOutcome.line || underOutcome.line) / 1000,
                            over: overOdds,
                            under: underOdds,
                            _balance: balance
                        };
                    }
                }
            }
        }
    });

    if (handicap.line != null) document.getElementById('handicapLine').value = handicap.line.toFixed(1);
    if (handicap.home) document.getElementById('handicapHomeOdds').value = handicap.home.toFixed(2);
    if (handicap.away) document.getElementById('handicapAwayOdds').value = handicap.away.toFixed(2);
    if (totalGoals.line) document.getElementById('totalGoalsLine').value = totalGoals.line.toFixed(1);
    if (totalGoals.over) document.getElementById('overOdds').value = totalGoals.over.toFixed(2);
    if (totalGoals.under) document.getElementById('underOdds').value = totalGoals.under.toFixed(2);
}

export const { initLoader, handleLeagueChange, handleMatchChange, setRunModelCallback } =
    createKambiLoader({ listViewUrl: LIST_VIEW_URL, sportName: 'handball', injectOdds });
