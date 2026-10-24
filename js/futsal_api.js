import { createKambiLoader } from './core/kambi_api.js';

const LIST_VIEW_URL = 'https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/listView/futsal/all/all/all/matches.json?channel_id=7&client_id=200&lang=en_GB&market=GB&useCombined=true&useCombinedLive=true';

const INPUT_IDS = ['homeOdds', 'drawOdds', 'awayOdds', 'totalGoalsLine', 'overOdds', 'underOdds'];

function injectOdds(betOffers) {
    INPUT_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    if (!betOffers) return;

    let home = null, draw = null, away = null;
    let totalLine = null, over = null, under = null;

    betOffers.forEach(offer => {
        if (offer.criterion && offer.criterion.label === 'Full Time' &&
            offer.betOfferType && offer.betOfferType.name === 'Match') {
            offer.outcomes.forEach(outcome => {
                if (outcome.type === 'OT_ONE') home = outcome.odds / 1000;
                else if (outcome.type === 'OT_CROSS') draw = outcome.odds / 1000;
                else if (outcome.type === 'OT_TWO') away = outcome.odds / 1000;
            });
        }

        if (offer.criterion &&
            (offer.criterion.label === 'Total Goals' || offer.criterion.englishLabel === 'Total Goals') &&
            offer.betOfferType && offer.betOfferType.name === 'Over/Under') {
            if (offer.outcomes && offer.outcomes.length > 0 && offer.outcomes[0].line) {
                totalLine = offer.outcomes[0].line / 1000;
            }
            offer.outcomes.forEach(outcome => {
                if (outcome.type === 'OT_OVER') over = outcome.odds / 1000;
                else if (outcome.type === 'OT_UNDER') under = outcome.odds / 1000;
            });
        }
    });

    if (home) document.getElementById('homeOdds').value = home.toFixed(2);
    if (draw) document.getElementById('drawOdds').value = draw.toFixed(2);
    if (away) document.getElementById('awayOdds').value = away.toFixed(2);
    if (totalLine) document.getElementById('totalGoalsLine').value = totalLine.toFixed(1);
    if (over) document.getElementById('overOdds').value = over.toFixed(2);
    if (under) document.getElementById('underOdds').value = under.toFixed(2);
}

export const { initLoader, handleLeagueChange, handleMatchChange, setRunModelCallback } =
    createKambiLoader({ listViewUrl: LIST_VIEW_URL, sportName: 'futsal', injectOdds });
