// -------------------------------------------------------
// Reorder Optimization Frontend Logic
// -------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    const user = checkAuth();
    if (!user) return;

    if (document.getElementById('username')) {
        document.getElementById('username').textContent = user.name;
    }

    // Initial load
    await loadOptimizationData();

    // Set up search event
    document.getElementById('productSearch')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        filterTable(query);
    });
});

let optimizationData = [];

// -------------------------------------------------------
// Load All Optimization Data
// -------------------------------------------------------
async function loadOptimizationData() {
    try {
        const recommendations = await apiRequest('/inventory/recommendations');
        optimizationData = recommendations || [];
        renderPage(optimizationData);
    } catch (err) {
        console.error('Failed to load optimization data:', err);
        const tbody = document.getElementById('reorderTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:3rem; color:var(--danger-color);">Error loading inventory analysis: ${err.message}</td></tr>`;
        }
    }
}

// -------------------------------------------------------
// Render Optimization Page
// -------------------------------------------------------
function renderPage(data) {
    const tbody = document.getElementById('reorderTableBody');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:3rem; color:var(--text-secondary);">No inventory analysis data available. Generate forecasts first.</td></tr>';
        updateKPIs(0, 0, 100);
        return;
    }

    // Update KPIs
    const critical = data.filter(r => r.riskLevel === 'High').length;
    const medium = data.filter(r => r.riskLevel === 'Medium').length;
    const healthyPerc = Math.round(((data.length - (critical + medium)) / data.length) * 100);
    updateKPIs(critical, medium, healthyPerc);

    // Render Table
    renderTable(data);
}

// -------------------------------------------------------
// Render Reorder Recommendation Table
// -------------------------------------------------------
function renderTable(data) {
    const tbody = document.getElementById('reorderTableBody');
    if (!tbody) return;

    tbody.innerHTML = data.map(rec => {
        const riskClass = rec.riskLevel === 'High' ? 'badge-danger' :
            (rec.riskLevel === 'Medium' ? 'badge-warning' : 'badge-success');

        const isCritical = rec.riskLevel === 'High';
        const actionBtn = isCritical ?
            `<button class="btn btn-primary" style="font-size:0.75rem; padding:4px 10px;" onclick="window.location.href='inventory.html'">Reorder Now</button>` :
            `<button class="btn btn-secondary" style="font-size:0.75rem; padding:4px 10px;" disabled>Healthy</button>`;

        const pid = typeof rec.productId === 'object' ? rec.productId.productId : rec.productId;
        const pName = typeof rec.productId === 'object' ? rec.productId.name : 'Unknown Product';

        return `
            <tr>
                <td>
                    <div style="font-weight:600; color:var(--text-primary);">${pName}</div>
                    <div style="font-size:0.75rem; color:var(--text-secondary);">${pid}</div>
                </td>
                <td style="${rec.currentStock < rec.safetyStock ? 'color:var(--danger-color); font-weight:700;' : ''}">${Math.round(rec.currentStock)} units</td>
                <td>${rec.averageDailyDemand.toFixed(2)} units / day</td>
                <td style="color:var(--primary-color); font-weight:600;">${Math.round(rec.reorderPoint)} units</td>
                <td style="font-weight:700;">${rec.recommendedReorderQuantity} units</td>
                <td style="${rec.daysUntilStockout <= rec.leadTime ? 'color:var(--danger-color); font-weight:800;' : ''}">${rec.daysUntilStockout === 999 ? '∞' : Math.round(rec.daysUntilStockout)} days</td>
                <td><span class="badge ${riskClass}">${rec.riskLevel}</span></td>
                <td>${actionBtn}</td>
            </tr>`;
    }).join('');
}

// -------------------------------------------------------
// Search Filter
// -------------------------------------------------------
function filterTable(query) {
    const filtered = optimizationData.filter(rec => {
        const pid = (typeof rec.productId === 'object' ? rec.productId.productId : rec.productId).toLowerCase();
        const pName = (typeof rec.productId === 'object' ? rec.productId.name : '').toLowerCase();
        return pid.includes(query) || pName.includes(query);
    });
    renderTable(filtered);
}

// -------------------------------------------------------
// Trigger Manual Recalculation
// -------------------------------------------------------
async function triggerRecalculation() {
    try {
        const btn = document.querySelector('.btn-primary');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Analyzing...';

        showAlert('Analyzing all product metrics and market forecasts...', 'info');

        await apiRequest('/inventory/recalculate', { method: 'POST' });
        await loadOptimizationData();

        showAlert('Dynamic reorder optimization complete!', 'success');
        btn.disabled = false;
        btn.textContent = originalText;
    } catch (err) {
        showAlert('Recalculation failed: ' + err.message, 'danger');
    }
}

// -------------------------------------------------------
// Helper to Update KPI Summary Cards
// -------------------------------------------------------
function updateKPIs(critical, medium, healthyPerc) {
    const cEl = document.getElementById('criticalCount');
    const mEl = document.getElementById('mediumCount');
    const hEl = document.getElementById('healthyPercentage');

    if (cEl) cEl.textContent = critical;
    if (mEl) mEl.textContent = medium;
    if (hEl) hEl.textContent = healthyPerc + '%';
}
