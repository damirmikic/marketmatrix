
import { toggleCard, showError, clearError } from './ui_utils.js';
import { escapeHtml } from './core/math_utils.js';

export class BaseModel {
    constructor(engine) {
        this.engine = engine;
        window.toggleCard = toggleCard;
        window.runModel = (...args) => this.runModel(...args);
    }

    showError(msg) { showError(msg); }

    clearError() { clearError(); }

    displayTable(containerId, headers, data) {
        const container = document.getElementById(containerId);
        if (!container) return;

        let html = '<table><thead><tr>';
        headers.forEach(h => {
            html += `<th>${escapeHtml(h)}</th>`;
        });
        html += '</tr></thead><tbody>';

        data.forEach(row => {
            html += '<tr>';
            row.forEach(cell => {
                html += `<td>${escapeHtml(cell)}</td>`;
            });
            html += '</tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    }

    runModel() {
        throw new Error("runModel() must be implemented by the subclass");
    }
}
