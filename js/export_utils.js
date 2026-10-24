
function extractTable(tableEl) {
    const headers = [];
    tableEl.querySelectorAll('thead th').forEach(th => {
        headers.push(th.textContent.trim());
    });

    const rows = [];
    tableEl.querySelectorAll('tbody tr').forEach(tr => {
        const cells = [];
        tr.querySelectorAll('td').forEach(td => cells.push(td.textContent.trim()));
        if (cells.some(c => c !== '')) rows.push(cells);
    });

    return { headers, rows };
}

function collectTabSections(container) {
    const sections = [];

    container.querySelectorAll('.tab-panel').forEach(tabPanel => {
        const tabBtn = container.querySelector(`.tab-btn[data-tab="${tabPanel.dataset.tab}"]`);
        const tabLabel = tabBtn ? tabBtn.textContent.trim() : tabPanel.dataset.tab;

        const subTabs = tabPanel.querySelectorAll('.sub-tab-content');

        if (subTabs.length > 0) {
            subTabs.forEach(subTab => {
                const subTabBtn = tabPanel.querySelector(`.sub-tab-btn[data-subtab="${subTab.dataset.subtab}"]`);
                const subTabLabel = subTabBtn ? subTabBtn.textContent.trim() : (subTab.dataset.subtab || '');
                const content = subTab.querySelector('.tab-content') || subTab;
                let currentTitle = subTabLabel || tabLabel;

                for (const child of content.children) {
                    if (child.tagName === 'H3') {
                        currentTitle = child.textContent.trim();
                    } else {
                        const tables = child.tagName === 'TABLE' ? [child] : [...child.querySelectorAll('table')];
                        for (const table of tables) {
                            const { headers, rows } = extractTable(table);
                            if (rows.length > 0) {
                                sections.push({ tab: tabLabel, subTab: subTabLabel, title: currentTitle, headers, rows });
                            }
                        }
                    }
                }
            });
        } else {
            const content = tabPanel.querySelector('.tab-content') || tabPanel;
            let currentTitle = tabLabel;

            for (const child of content.children) {
                if (child.tagName === 'H3') {
                    currentTitle = child.textContent.trim();
                } else {
                    const tables = child.tagName === 'TABLE' ? [child] : [...child.querySelectorAll('table')];
                    for (const table of tables) {
                        const { headers, rows } = extractTable(table);
                        if (rows.length > 0) {
                            sections.push({ tab: tabLabel, subTab: '', title: currentTitle, headers, rows });
                        }
                    }
                }
            }
        }
    });

    return sections;
}

function collectCardSections() {
    const sections = [];

    document.querySelectorAll('.card:not(.hidden)').forEach(card => {
        const cardTitle = card.querySelector('.card-header h2')?.textContent.trim() || '';
        const cardContent = card.querySelector('.card-content');
        if (!cardContent) return;

        let currentTitle = cardTitle;

        for (const child of cardContent.children) {
            if (child.tagName === 'H3') {
                currentTitle = child.textContent.trim();
            } else {
                const tables = child.tagName === 'TABLE' ? [child] : [...child.querySelectorAll('table')];
                for (const table of tables) {
                    const { headers, rows } = extractTable(table);
                    if (rows.length > 0) {
                        sections.push({ tab: cardTitle, subTab: '', title: currentTitle, headers, rows });
                    }
                }
            }
        }
    });

    return sections;
}

function collectSections() {
    const container = document.getElementById('marketsTabContainer');
    return container ? collectTabSections(container) : collectCardSections();
}

function escapeCsv(val) {
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function sectionsToCSV(sections) {
    const pageTitle = document.title.replace(' | MarketMatrix', '');
    const lines = [pageTitle, ''];

    for (const { tab, subTab, title, headers, rows } of sections) {
        const parts = [tab];
        if (subTab && subTab !== tab) parts.push(subTab);
        if (title && title !== subTab && title !== tab) parts.push(title);
        lines.push(parts.join(' > '));

        if (headers.length > 0) {
            lines.push(headers.map(escapeCsv).join(','));
        }
        for (const row of rows) {
            lines.push(row.map(escapeCsv).join(','));
        }
        lines.push('');
    }

    return lines.join('\n');
}

function showExportToast(msg, isError = false) {
    let toast = document.getElementById('export-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'export-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = 'export-toast' + (isError ? ' error' : '');
    toast.classList.add('visible');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove('visible'), 2500);
}

export function exportMarketsToCSV() {
    const sections = collectSections();
    if (sections.length === 0) {
        showExportToast('No market data — run the model first', true);
        return;
    }

    const csv = sectionsToCSV(sections);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const sport = document.title.replace(' | MarketMatrix', '').toLowerCase().replace(/\s+/g, '_');
    a.download = `${sport}_markets.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showExportToast('CSV downloaded');
}

export async function exportMarketsToClipboard() {
    const sections = collectSections();
    if (sections.length === 0) {
        showExportToast('No market data — run the model first', true);
        return;
    }

    const csv = sectionsToCSV(sections);

    try {
        await navigator.clipboard.writeText(csv);
        showExportToast('Copied to clipboard');
    } catch {
        const ta = document.createElement('textarea');
        ta.value = csv;
        ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showExportToast('Copied to clipboard');
    }
}
