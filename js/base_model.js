
import { toggleCard } from './ui_utils.js';

export class BaseModel {
    constructor(engine) {
        this.engine = engine;
        window.toggleCard = toggleCard;
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
