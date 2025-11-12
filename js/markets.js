import {
    FULL_TIME_TOTAL_LINES,
    TEAM_TOTAL_LINES,
    GOAL_SPREAD_LABELS,
    HALF_TOTAL_LINES,
    HALF_HANDICAP_LINES,
    ASIAN_HANDICAP_LINES,
    MAX_GOALS_DISPLAY,
} from './constants.js';
import {
    calculateMarket,
    calculateAsianHandicap,
    calculateHalfHandicap,
    computeGoalAggregates,
    computeHalfAggregates,
} from './model.js';
import {
    clampProbability,
    createGroupRow,
    createMarketRow,
    createPushRow,
    createUnavailableRow,
    formatResult,
    getLoadingRow,
    sumRange,
} from './utils.js';

export function showMarketLoading(marketTables) {
    const placeholderConfig = {
        '1x2': 3,
        dc: 3,
        dnb: 3,
        btts: 3,
        goals: 3,
        totals: 5,
        firstHalf: 3,
        secondHalf: 3,
        htft: 3,
        ah: 6,
    };

    Object.entries(placeholderConfig).forEach(([key, columns]) => {
        const table = marketTables[key];
        if (table) {
            table.innerHTML = getLoadingRow(columns);
        }
    });
}

export function renderAllMarkets(model, marketTables, onComplete) {
    const tasks = [
        () => renderMarket1x2(model, marketTables['1x2']),
        () => renderMarketDoubleChance(model, marketTables.dc),
        () => renderMarketDNB(model, marketTables.dnb),
        () => renderMarketBTTS(model, marketTables.btts),
        () => renderMarketGoals(model, marketTables.goals),
        () => renderMarketTotals(model, marketTables.totals),
        () => renderMarketHalf(model, marketTables.firstHalf, 'h1'),
        () => renderMarketHalf(model, marketTables.secondHalf, 'h2'),
        () => renderMarketHTFT(model, marketTables.htft),
        () => renderMarketAsianHandicap(model, marketTables.ah),
    ];

    let index = 0;
    const runNext = () => {
        if (index >= tasks.length) {
            if (typeof onComplete === 'function') {
                onComplete();
            }
            return;
        }

        setTimeout(() => {
            try {
                tasks[index++]();
            } catch (err) {
                console.error('Error rendering market table:', err);
            } finally {
                runNext();
            }
        }, 40);
    };

    runNext();
}

function renderMarket1x2(model, tableElement) {
    if (!tableElement) return;
    const probH = calculateMarket(model, { ft_result: '1' });
    const probX = calculateMarket(model, { ft_result: 'X' });
    const probA = calculateMarket(model, { ft_result: '2' });

    const rH = formatResult(probH);
    const rX = formatResult(probX);
    const rA = formatResult(probA);

    tableElement.innerHTML = `
        <tr>
            <td class="market-name">Home (1)</td>
            <td class="market-prob">${rH.probPercent}%</td>
            <td class="market-odds">${rH.odds}</td>
        </tr>
        <tr>
            <td class="market-name">Draw (X)</td>
            <td class="market-prob">${rX.probPercent}%</td>
            <td class="market-odds">${rX.odds}</td>
        </tr>
        <tr>
            <td class="market-name">Away (2)</td>
            <td class="market-prob">${rA.probPercent}%</td>
            <td class="market-odds">${rA.odds}</td>
        </tr>`;
}

function renderMarketDoubleChance(model, tableElement) {
    if (!tableElement) return;
    const prob1X = calculateMarket(model, { ft_result: '1X' });
    const prob12 = calculateMarket(model, { ft_result: '12' });
    const probX2 = calculateMarket(model, { ft_result: 'X2' });

    const r1X = formatResult(prob1X);
    const r12 = formatResult(prob12);
    const rX2 = formatResult(probX2);

    tableElement.innerHTML = `
        <tr>
            <td class="market-name">Home or Draw (1X)</td>
            <td class="market-prob">${r1X.probPercent}%</td>
            <td class="market-odds">${r1X.odds}</td>
        </tr>
        <tr>
            <td class="market-name">Home or Away (12)</td>
            <td class="market-prob">${r12.probPercent}%</td>
            <td class="market-odds">${r12.odds}</td>
        </tr>
        <tr>
            <td class="market-name">Draw or Away (X2)</td>
            <td class="market-prob">${rX2.probPercent}%</td>
            <td class="market-odds">${rX2.odds}</td>
        </tr>`;
}

function renderMarketDNB(model, tableElement) {
    if (!tableElement) return;
    const probH = calculateMarket(model, { ft_result: '1' });
    const probA = calculateMarket(model, { ft_result: '2' });
    const probX = clampProbability(1 - probH - probA);

    let html = '';
    if (probX > 0.99999) {
        html = `
            <tr>
                <td class="market-name">Home (1)</td>
                <td class="market-prob">N/A</td>
                <td class="market-odds">Push</td>
            </tr>
            <tr>
                <td class="market-name">Away (2)</td>
                <td class="market-prob">N/A</td>
                <td class="market-odds">Push</td>
            </tr>`;
    } else {
        const denom = 1 - probX;
        const rH = formatResult(probH / denom);
        const rA = formatResult(probA / denom);
        html = `
            <tr>
                <td class="market-name">Home (1)</td>
                <td class="market-prob">${rH.probPercent}%</td>
                <td class="market-odds">${rH.odds}</td>
            </tr>
            <tr>
                <td class="market-name">Away (2)</td>
                <td class="market-prob">${rA.probPercent}%</td>
                <td class="market-odds">${rA.odds}</td>
            </tr>`;
    }

    tableElement.innerHTML = html;
}

function renderMarketBTTS(model, tableElement) {
    if (!tableElement) return;
    const probYes = calculateMarket(model, { ft_btts: true });
    const probNo = calculateMarket(model, { ft_btts: false });

    const rYes = formatResult(probYes);
    const rNo = formatResult(probNo);

    tableElement.innerHTML = `
        <tr>
            <td class="market-name">Yes</td>
            <td class="market-prob">${rYes.probPercent}%</td>
            <td class="market-odds">${rYes.odds}</td>
        </tr>
        <tr>
            <td class="market-name">No</td>
            <td class="market-prob">${rNo.probPercent}%</td>
            <td class="market-odds">${rNo.odds}</td>
        </tr>`;
}

function renderMarketTotals(model, tableElement) {
    if (!tableElement) return;
    let html = '';
    for (const line of FULL_TIME_TOTAL_LINES) {
        const probOver = calculateMarket(model, { ft_total: { type: 'o', value: line } });
        const probUnder = calculateMarket(model, { ft_total: { type: 'u', value: line } });
        const rOver = formatResult(probOver);
        const rUnder = formatResult(probUnder);

        html += `
            <tr>
                <td class="market-name">${line}</td>
                <td class="market-prob">${rOver.probPercent}%</td>
                <td class="market-odds">${rOver.odds}</td>
                <td class="market-prob">${rUnder.probPercent}%</td>
                <td class="market-odds">${rUnder.odds}</td>
            </tr>`;
    }

    tableElement.innerHTML = html;
}

function renderMarketGoals(model, tableElement) {
    if (!tableElement) return;
    const stats = computeGoalAggregates(model);
    const maxHomeIndex = stats.homeGoals.length - 1;
    const maxAwayIndex = stats.awayGoals.length - 1;

    let html = '';
    html += createGroupRow('Home Team Total Goals');
    for (const line of TEAM_TOTAL_LINES) {
        const overStart = Math.floor(line) + 1;
        const underEnd = overStart - 1;
        const probOver = sumRange(stats.homeGoals, overStart, maxHomeIndex);
        const probUnder = sumRange(stats.homeGoals, 0, underEnd);
        html += createMarketRow(`Over ${line}`, probOver);
        html += createMarketRow(`Under ${line}`, probUnder);
    }

    html += createGroupRow('Away Team Total Goals');
    for (const line of TEAM_TOTAL_LINES) {
        const overStart = Math.floor(line) + 1;
        const underEnd = overStart - 1;
        const probOver = sumRange(stats.awayGoals, overStart, maxAwayIndex);
        const probUnder = sumRange(stats.awayGoals, 0, underEnd);
        html += createMarketRow(`Over ${line}`, probOver);
        html += createMarketRow(`Under ${line}`, probUnder);
    }

    html += createGroupRow('Home Exact Goals');
    for (let goals = 0; goals <= MAX_GOALS_DISPLAY; goals += 1) {
        html += createMarketRow(`${goals}`, stats.homeGoals[goals] || 0);
    }

    html += createGroupRow('Away Exact Goals');
    for (let goals = 0; goals <= MAX_GOALS_DISPLAY; goals += 1) {
        html += createMarketRow(`${goals}`, stats.awayGoals[goals] || 0);
    }

    html += createGroupRow('Goals Spread');
    for (const label of GOAL_SPREAD_LABELS) {
        const [min, max] = label.split('-').map(Number);
        const prob = sumRange(stats.totalGoals, min, max);
        html += createMarketRow(label, prob);
    }

    html += createGroupRow('Highest Scoring Half');
    html += createMarketRow('1st Half', stats.half1Higher);
    html += createMarketRow('2nd Half', stats.half2Higher);
    html += createMarketRow('Tie', stats.halvesEqual);

    html += createGroupRow('Home To Score In Both Halves');
    html += createMarketRow('Yes', stats.homeBothHalves);
    html += createMarketRow('No', clampProbability(1 - stats.homeBothHalves));

    html += createGroupRow('Away To Score In Both Halves');
    html += createMarketRow('Yes', stats.awayBothHalves);
    html += createMarketRow('No', clampProbability(1 - stats.awayBothHalves));

    const bothHalvesOver = stats.bothHalvesOver15;
    const bothHalvesUnder = stats.bothHalvesUnder15;
    html += createGroupRow('Both Halves Over 1.5');
    html += createMarketRow('Yes', bothHalvesOver);
    html += createMarketRow('No', clampProbability(1 - bothHalvesOver));

    html += createGroupRow('Both Halves Under 1.5');
    html += createMarketRow('Yes', bothHalvesUnder);
    html += createMarketRow('No', clampProbability(1 - bothHalvesUnder));

    tableElement.innerHTML = html;
}

function renderMarketHalf(model, tableElement, halfKey) {
    if (!tableElement) return;
    const isFirstHalf = halfKey === 'h1';
    const matrix = isFirstHalf ? model.matrix1H : model.matrix2H;
    const stats = computeHalfAggregates(matrix);
    const maxHomeIndex = stats.homeGoals.length - 1;
    const maxAwayIndex = stats.awayGoals.length - 1;
    const maxTotalIndex = stats.totalGoals.length - 1;

    const resultKey = isFirstHalf ? 'h1_result' : 'h2_result';
    const totalKey = isFirstHalf ? 'h1_total' : 'h2_total';
    const bttsKey = isFirstHalf ? 'h1_btts' : 'h2_btts';

    const probHome = calculateMarket(model, { [resultKey]: '1' });
    const probDraw = calculateMarket(model, { [resultKey]: 'X' });
    const probAway = calculateMarket(model, { [resultKey]: '2' });

    let html = '';
    html += createGroupRow(`${isFirstHalf ? '1st' : '2nd'} Half 1X2`);
    html += createMarketRow('Home (1)', probHome);
    html += createMarketRow('Draw (X)', probDraw);
    html += createMarketRow('Away (2)', probAway);

    html += createGroupRow(`${isFirstHalf ? '1st' : '2nd'} Half Double Chance`);
    html += createMarketRow('1X', calculateMarket(model, { [resultKey]: '1X' }));
    html += createMarketRow('12', calculateMarket(model, { [resultKey]: '12' }));
    html += createMarketRow('X2', calculateMarket(model, { [resultKey]: 'X2' }));

    html += createGroupRow(`${isFirstHalf ? '1st' : '2nd'} Half Draw No Bet`);
    const dnbDenom = probHome + probAway;
    if (dnbDenom <= 1e-9) {
        html += createUnavailableRow('Home (1)');
        html += createUnavailableRow('Away (2)');
    } else {
        html += createMarketRow('Home (1)', probHome / dnbDenom);
        html += createMarketRow('Away (2)', probAway / dnbDenom);
    }

    html += createGroupRow(`${isFirstHalf ? '1st' : '2nd'} Half Both Teams To Score`);
    html += createMarketRow('Yes', stats.btts);
    html += createMarketRow('No', clampProbability(1 - stats.btts));

    html += createGroupRow(`${isFirstHalf ? '1st' : '2nd'} Half Total Goals`);
    for (const line of HALF_TOTAL_LINES) {
        const overStart = Math.floor(line) + 1;
        const underEnd = overStart - 1;
        const probOver = sumRange(stats.totalGoals, overStart, maxTotalIndex);
        const probUnder = sumRange(stats.totalGoals, 0, underEnd);
        html += createMarketRow(`Over ${line}`, probOver);
        html += createMarketRow(`Under ${line}`, probUnder);
    }

    html += createGroupRow(`${isFirstHalf ? '1st' : '2nd'} Half Handicap`);
    for (const line of HALF_HANDICAP_LINES) {
        const res = calculateHalfHandicap(line, matrix);
        const lineTextH = line <= 0 ? `${line}` : `+${line}`;
        const lineTextA = line <= 0 ? `+${-line}` : `${-line}`;

        if (res.push > 0.99999) {
            html += createPushRow(`Home ${lineTextH}`);
            html += createPushRow(`Away ${lineTextA}`);
            continue;
        }

        const denom = 1 - res.push;
        if (denom <= 1e-9) {
            html += createUnavailableRow(`Home ${lineTextH}`);
            html += createUnavailableRow(`Away ${lineTextA}`);
            continue;
        }

        const probH = clampProbability(res.homeWin / denom);
        const probA = clampProbability(res.awayWin / denom);
        html += createMarketRow(`Home ${lineTextH}`, probH);
        html += createMarketRow(`Away ${lineTextA}`, probA);
    }

    html += createGroupRow(`${isFirstHalf ? '1st' : '2nd'} Half Exact Goals`);
    for (let goals = 0; goals <= MAX_GOALS_DISPLAY; goals += 1) {
        html += createMarketRow(`${goals}`, stats.totalGoals[goals] || 0);
    }

    html += createGroupRow(`${isFirstHalf ? '1st' : '2nd'} Half Home Team Total Goals`);
    for (const line of HALF_TOTAL_LINES) {
        const overStart = Math.floor(line) + 1;
        const underEnd = overStart - 1;
        const probOver = sumRange(stats.homeGoals, overStart, maxHomeIndex);
        const probUnder = sumRange(stats.homeGoals, 0, underEnd);
        html += createMarketRow(`Over ${line}`, probOver);
        html += createMarketRow(`Under ${line}`, probUnder);
    }

    html += createGroupRow(`${isFirstHalf ? '1st' : '2nd'} Half Away Team Total Goals`);
    for (const line of HALF_TOTAL_LINES) {
        const overStart = Math.floor(line) + 1;
        const underEnd = overStart - 1;
        const probOver = sumRange(stats.awayGoals, overStart, maxAwayIndex);
        const probUnder = sumRange(stats.awayGoals, 0, underEnd);
        html += createMarketRow(`Over ${line}`, probOver);
        html += createMarketRow(`Under ${line}`, probUnder);
    }

    tableElement.innerHTML = html;
}

function renderMarketHTFT(model, tableElement) {
    if (!tableElement) return;
    const markets = [
        { name: '1 / 1', cond: { h1_result: '1', ft_result: '1' } },
        { name: '1 / X', cond: { h1_result: '1', ft_result: 'X' } },
        { name: '1 / 2', cond: { h1_result: '1', ft_result: '2' } },
        { name: 'X / 1', cond: { h1_result: 'X', ft_result: '1' } },
        { name: 'X / X', cond: { h1_result: 'X', ft_result: 'X' } },
        { name: 'X / 2', cond: { h1_result: 'X', ft_result: '2' } },
        { name: '2 / 1', cond: { h1_result: '2', ft_result: '1' } },
        { name: '2 / X', cond: { h1_result: '2', ft_result: 'X' } },
        { name: '2 / 2', cond: { h1_result: '2', ft_result: '2' } },
    ];

    let html = '';
    for (const market of markets) {
        const prob = calculateMarket(model, market.cond);
        const r = formatResult(prob);
        html += `
            <tr>
                <td class="market-name">${market.name}</td>
                <td class="market-prob">${r.probPercent}%</td>
                <td class="market-odds">${r.odds}</td>
            </tr>`;
    }

    tableElement.innerHTML = html;
}

function renderMarketAsianHandicap(model, tableElement) {
    if (!tableElement) return;
    let html = '';

    for (const line of ASIAN_HANDICAP_LINES) {
        let rH;
        let rA;
        const lineTextH = line <= 0 ? `${line}` : `+${line}`;
        const lineTextA = line <= 0 ? `+${-line}` : `${-line}`;

        if (line % 0.5 === 0) {
            const { homeWin, push, awayWin } = calculateAsianHandicap(model, line);

            if (push > 0.99999) {
                rH = { probPercent: 'N/A', odds: 'Push' };
                rA = { probPercent: 'N/A', odds: 'Push' };
            } else {
                const probH = homeWin / (1 - push);
                const probA = awayWin / (1 - push);
                rH = formatResult(probH);
                rA = formatResult(probA);
            }
        } else {
            const resLow = calculateAsianHandicap(model, line - 0.25);
            const resHigh = calculateAsianHandicap(model, line + 0.25);

            let probHLow = 0;
            let probALow = 0;
            if (resLow.push <= 0.99999) {
                probHLow = resLow.homeWin / (1 - resLow.push);
                probALow = resLow.awayWin / (1 - resLow.push);
            }

            let probHHigh = 0;
            let probAHigh = 0;
            if (resHigh.push <= 0.99999) {
                probHHigh = resHigh.homeWin / (1 - resHigh.push);
                probAHigh = resHigh.awayWin / (1 - resHigh.push);
            }

            const oddsHLow = probHLow <= 1e-9 ? 1e9 : 1 / probHLow;
            const oddsALow = probALow <= 1e-9 ? 1e9 : 1 / probALow;
            const oddsHHigh = probHHigh <= 1e-9 ? 1e9 : 1 / probHHigh;
            const oddsAHigh = probAHigh <= 1e-9 ? 1e9 : 1 / probAHigh;

            const oddsH = (oddsHLow + oddsHHigh) / 2;
            const oddsA = (oddsALow + oddsAHigh) / 2;

            const probH = oddsH >= 1e9 ? 0 : 1 / oddsH;
            const probA = oddsA >= 1e9 ? 0 : 1 / oddsA;

            rH = formatResult(probH);
            rA = formatResult(probA);
        }

        html += `
            <tr>
                <td class="market-name">${lineTextH}</td>
                <td class="market-prob">${rH.probPercent}%</td>
                <td class="market-odds">${rH.odds}</td>
                <td class="market-name">${lineTextA}</td>
                <td class="market-prob">${rA.probPercent}%</td>
                <td class="market-odds">${rA.odds}</td>
            </tr>`;
    }

    tableElement.innerHTML = html;
}
