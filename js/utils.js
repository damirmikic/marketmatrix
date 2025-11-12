export function clampProbability(prob) {
    if (!Number.isFinite(prob)) return 0;
    if (prob < 0) return 0;
    if (prob > 1) return 1;
    return prob;
}

export function formatResult(prob) {
    const safeProb = prob <= 1e-9 ? 1e-9 : prob;
    return {
        prob: safeProb,
        probPercent: (safeProb * 100).toFixed(2),
        odds: (1 / safeProb).toFixed(2),
    };
}

export function sumRange(arr, start, end) {
    const s = Math.max(0, start);
    const e = Math.min(arr.length - 1, end);
    if (s > e) return 0;
    let total = 0;
    for (let i = s; i <= e; i += 1) {
        total += arr[i];
    }
    return total;
}

export function createGroupRow(label, cols = 3) {
    return `<tr class="group-row"><td colspan="${cols}">${label}</td></tr>`;
}

export function createMarketRow(label, prob) {
    const result = formatResult(clampProbability(prob));
    return `<tr>
                <td class="market-name">${label}</td>
                <td class="market-prob">${result.probPercent}%</td>
                <td class="market-odds">${result.odds}</td>
            </tr>`;
}

export function createUnavailableRow(label) {
    return `<tr>
                <td class="market-name">${label}</td>
                <td class="market-prob">N/A</td>
                <td class="market-odds">N/A</td>
            </tr>`;
}

export function createPushRow(label) {
    return `<tr>
                <td class="market-name">${label}</td>
                <td class="market-prob">N/A</td>
                <td class="market-odds">Push</td>
            </tr>`;
}

export function getLoadingRow(cols) {
    return `<tr><td colspan="${cols}" class="text-center p-4">
                <div class="flex items-center justify-center">
                    <div class="loading-spinner loading-spinner-small mr-2"></div>
                    Calculating...
                </div>
            </td></tr>`;
}
