import { MAX_GOALS_DISPLAY } from './constants.js';

export function renderCorrectScoreMatrix(tableElement, matrix, maxGoals = MAX_GOALS_DISPLAY) {
    if (!tableElement) return;
    const headers = [''].concat(Array.from({ length: maxGoals + 1 }, (_, i) => i));
    let html = '<thead><tr>';
    headers.forEach((header, index) => {
        if (index === 0) {
            html += '<th class="corner"></th>';
        } else {
            html += `<th class="header-col">${header}</th>`;
        }
    });
    html += '</tr></thead>';

    html += '<tbody>';
    for (let h = 0; h <= maxGoals; h += 1) {
        html += '<tr>';
        html += `<th class="header-col">${h}</th>`;
        for (let a = 0; a <= maxGoals; a += 1) {
            const prob = (matrix[h] && matrix[h][a]) ? matrix[h][a] * 100 : 0;
            html += `<td>${prob.toFixed(2)}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody>';

    tableElement.innerHTML = html;
}
