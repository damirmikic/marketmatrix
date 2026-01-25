
// UI Helper - Toggle card collapse/expand
export function toggleCard(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('collapsed');
}

// Tab Navigation - Switch primary tabs
export function switchTab(tabContainerId, tabName) {
    const container = document.getElementById(tabContainerId);
    if (!container) return;

    // Update tab buttons
    const tabBtns = container.querySelectorAll(':scope > .tab-nav > .tab-btn');
    tabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab panels
    const tabPanels = container.querySelectorAll(':scope > .tab-panel');
    tabPanels.forEach(panel => {
        panel.classList.toggle('active', panel.dataset.tab === tabName);
    });

    // Activate first sub-tab if exists
    const activePanel = container.querySelector(`:scope > .tab-panel[data-tab="${tabName}"]`);
    if (activePanel) {
        const firstSubTab = activePanel.querySelector('.sub-tab-nav .sub-tab-btn');
        if (firstSubTab && !activePanel.querySelector('.sub-tab-btn.active')) {
            switchSubTab(activePanel.id, firstSubTab.dataset.subtab);
        }
    }
}

// Tab Navigation - Switch sub-tabs
export function switchSubTab(panelId, subTabName) {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    // Update sub-tab buttons
    const subTabBtns = panel.querySelectorAll('.sub-tab-nav .sub-tab-btn');
    subTabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.subtab === subTabName);
    });

    // Update sub-tab content
    const subTabContents = panel.querySelectorAll('.sub-tab-content');
    subTabContents.forEach(content => {
        content.classList.toggle('active', content.dataset.subtab === subTabName);
    });
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
