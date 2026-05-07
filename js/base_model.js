
import { toggleCard } from './ui_utils.js';

export class BaseModel {
    constructor(engine) {
        this.engine = engine;
        window.toggleCard = toggleCard;
        window.runModel = (...args) => this.runModel(...args);
    }

    showError(msg) {
        let el = document.getElementById('model-error');
        if (!el) {
            el = document.createElement('div');
            el.id = 'model-error';
            Object.assign(el.style, {
                position: 'fixed', top: '0', left: '0', right: '0',
                background: '#dc2626', color: '#fff', padding: '10px 16px',
                fontWeight: '600', zIndex: '9999', textAlign: 'center',
                fontSize: '14px'
            });
            document.body.appendChild(el);
        }
        el.textContent = `Error: ${msg}`;
        el.hidden = false;
    }

    clearError() {
        const el = document.getElementById('model-error');
        if (el) el.hidden = true;
    }

    displayTable(containerId, headers, data) {
        const container = document.getElementById(containerId);
        if (!container) return;

        let html = '<table><thead><tr>';
        headers.forEach(h => {
            html += `<th>${h}</th>`;
        });
        html += '</tr></thead><tbody>';

        data.forEach(row => {
            html += '<tr>';
            row.forEach(cell => {
                html += `<td>${cell}</td>`;
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
