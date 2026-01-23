
// UI Helper - Toggle card collapse/expand
export function toggleCard(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('collapsed');
}

export function syncRatio(changed) {
    const r1H = document.getElementById('ratio1H');
    const r2H = document.getElementById('ratio2H');
    if (changed === '1H') {
        let val = Math.max(30, Math.min(70, parseInt(r1H.value) || 45));
        r1H.value = val;
        r2H.value = 100 - val;
    } else {
        let val = Math.max(30, Math.min(70, parseInt(r2H.value) || 55));
        r2H.value = val;
        r1H.value = 100 - val;
    }
}

export function toggleAllCards() {
    const btn = document.getElementById('toggleAllBtn');
    const cards = document.querySelectorAll('.card:not(.hidden)');
    const isCollapsing = btn.textContent.includes('Collapse');

    cards.forEach(card => {
        if (isCollapsing) {
            card.classList.add('collapsed');
        } else {
            card.classList.remove('collapsed');
        }
    });

    btn.textContent = isCollapsing ? "Expand All" : "Collapse All";
}
