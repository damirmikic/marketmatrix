import { createKambiLoader } from './core/kambi_api.js';

const LIST_VIEW_URL = 'https://eu1.offering-api.kambicdn.com/offering/v2018/kambi/listView/volleyball/all/all/all/matches.json?channel_id=7&client_id=200&lang=en_GB&market=GB&useCombined=true&useCombinedLive=true';

const INPUT_IDS = ['firstSetTeam1Odds', 'firstSetTeam2Odds'];

function injectOdds(betOffers) {
    INPUT_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    if (!betOffers) return;

    let team1 = null, team2 = null;

    betOffers.forEach(offer => {
        if (offer.criterion &&
            (offer.criterion.label === 'Set 1' || offer.criterion.englishLabel === 'Set 1') &&
            offer.betOfferType && offer.betOfferType.name === 'Match') {
            offer.outcomes.forEach(outcome => {
                if (outcome.type === 'OT_ONE') team1 = outcome.odds / 1000;
                else if (outcome.type === 'OT_TWO') team2 = outcome.odds / 1000;
            });
        }
    });

    if (team1) document.getElementById('firstSetTeam1Odds').value = team1.toFixed(2);
    if (team2) document.getElementById('firstSetTeam2Odds').value = team2.toFixed(2);
}

export const { initLoader, handleLeagueChange, handleMatchChange, setRunModelCallback } =
    createKambiLoader({ listViewUrl: LIST_VIEW_URL, sportName: 'volleyball', injectOdds });
