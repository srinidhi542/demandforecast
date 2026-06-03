// Check authentication
if (!checkAuth()) {
    throw new Error('Not authenticated');
}

// Display username
const user = getUser();
if (user) {
    document.getElementById('username').textContent = user.username;
}

let salesChart, forecastChart;
let userSettings = null;

// Load dashboard data
async function loadDashboard() {
    try {
        // Load user settings
        try {
            userSettings = await apiRequest('/user-settings');
            applyDashboardSettings(userSettings);
        } catch (e) {
            console.warn('Could not load user settings, using defaults');
        }

        // Load summary statistics
        const summary = await apiRequest('/reports/summary');

        if (document.getElementById('totalProducts')) document.getElementById('totalProducts').textContent = formatNumber(summary.totalProducts || 0);
        if (document.getElementById('totalSales')) document.getElementById('totalSales').textContent = formatNumber(summary.totalSales || 0);
        if (document.getElementById('predictedDemand')) document.getElementById('predictedDemand').textContent = formatNumber(summary.predictedDemand || 0);
        if (document.getElementById('forecastAccuracy')) document.getElementById('forecastAccuracy').textContent = (summary.forecastAccuracy || 0) + '%';

        // Load sales data and anomalies (highlights in chart)
        await loadAnomalies();

        // Load Demand Insights (Explainability)
        await loadDemandInsights();

        // Load Demand Insights (Explainability)
        await loadDemandInsights();

        // Load forecast data
        await loadForecastChart();

        // Load recent alerts
        await loadRecentAlerts();
    } catch (error) {
        console.error('Dashboard load error:', error);
        showAlert('Failed to load dashboard data', 'danger');
    }
}

// Load sales chart — highlights anomalous data points with red/blue markers
async function loadSalesChart(anomalyMap) {
    try {
        const endDate = new Date();
        const startDate = new Date();
        const days = userSettings ? parseInt(userSettings.dashboard.dateRange) : 30;
        startDate.setDate(startDate.getDate() - days);

        let sales = await apiRequest(`/sales?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&limit=100`);
        if (sales.length === 0) {
            sales = await apiRequest(`/sales?limit=30`);
        }

        sales.sort((a, b) => new Date(a.date) - new Date(b.date));

        const dates = sales.map(s => formatDate(s.date));
        const quantities = sales.map(s => s.quantity);

        // Build point color array — red for spike, blue for drop, default otherwise
        const pointColors = quantities.map((q, i) => {
            if (!anomalyMap) return '#2563eb';
            // Compare against anomalies (we mark the last record for matching productIds)
            return '#2563eb'; // default
        });

        // Anomaly overlay dataset — only show anomaly points
        const spikeData = quantities.map((q, i) => {
            if (!anomalyMap) return null;
            const key = sales[i].productId;
            const a = anomalyMap[key];
            return (a && a.anomalyType === 'demand_spike' && Math.abs(q - a.currentSales) < 1) ? q : null;
        });
        const dropData = quantities.map((q, i) => {
            if (!anomalyMap) return null;
            const key = sales[i].productId;
            const a = anomalyMap[key];
            return (a && a.anomalyType === 'demand_drop' && Math.abs(q - a.currentSales) < 1) ? q : null;
        });

        const ctx = document.getElementById('salesChart').getContext('2d');
        if (salesChart) salesChart.destroy();

        const datasets = [{
            label: 'Sales Quantity',
            data: quantities,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            tension: 0.4,
            fill: true,
            pointRadius: 3
        }];

        if (anomalyMap) {
            datasets.push({
                label: '🔴 Demand Spike',
                data: spikeData,
                borderColor: 'transparent',
                backgroundColor: '#ef4444',
                pointRadius: 8,
                pointStyle: 'triangle',
                showLine: false
            });
            datasets.push({
                label: '🔵 Demand Drop',
                data: dropData,
                borderColor: 'transparent',
                backgroundColor: '#3b82f6',
                pointRadius: 8,
                pointStyle: 'rectRot',
                showLine: false
            });
        }

        salesChart = new Chart(ctx, {
            type: 'line',
            data: { labels: dates, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true } },
                scales: { y: { beginAtZero: true } }
            }
        });
    } catch (error) {
        console.error('Sales chart error:', error);
    }
}

// Load forecast chart
async function loadForecastChart() {
    try {
        const forecasts = await apiRequest('/forecasts?limit=30');

        if (forecasts.length === 0) {
            return;
        }

        const dates = forecasts.map(f => formatDate(f.forecastDate));
        const predicted = forecasts.map(f => f.predictedDemand);
        const confMin = forecasts.map(f => f.confidenceMin);
        const confMax = forecasts.map(f => f.confidenceMax);
        const adjusted = forecasts.map(f => f.adjustedDemand || f.predictedDemand);

        // Populate Seasonal Demand Card
        let baseTotal = 0;
        let adjTotal = 0;
        let currentSeason = '-';
        let currentMultiplier = '-';

        if (forecasts.length > 0) {
            forecasts.forEach(f => {
                baseTotal += f.predictedDemand || 0;
                adjTotal += f.adjustedDemand || f.predictedDemand || 0;
            });
            currentSeason = forecasts[0].seasonName || 'Normal Season';
            currentMultiplier = (forecasts[0].seasonalMultiplier || 1.0) + 'x';
        }

        const e1 = document.getElementById('valCurrentSeason'); if (e1) e1.textContent = currentSeason;
        const e2 = document.getElementById('valSeasonMultiplier'); if (e2) e2.textContent = currentMultiplier;
        const e3 = document.getElementById('valBaseForecast'); if (e3) e3.textContent = formatNumber(baseTotal);
        const e4 = document.getElementById('valAdjustedForecast'); if (e4) e4.textContent = formatNumber(adjTotal);

        const ctx = document.getElementById('forecastChart').getContext('2d');

        if (forecastChart) {
            forecastChart.destroy();
        }

        forecastChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [
                    {
                        label: 'Base Forecast',
                        data: predicted,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Seasonally Adjusted',
                        data: adjusted,
                        borderColor: '#8b5cf6',
                        backgroundColor: 'transparent',
                        borderWidth: 3,
                        tension: 0.4
                    },
                    {
                        label: 'Confidence Min',
                        data: confMin,
                        borderColor: '#f59e0b',
                        borderDash: [5, 5],
                        tension: 0.4,
                        fill: false
                    },
                    {
                        label: 'Confidence Max',
                        data: confMax,
                        borderColor: '#ef4444',
                        borderDash: [5, 5],
                        tension: 0.4,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    } catch (error) {
        console.error('Forecast chart error:', error);
    }
}

// Load recent alerts
async function loadRecentAlerts() {
    try {
        const alerts = await apiRequest('/alerts?limit=5');

        const alertsList = document.getElementById('alertsList');

        if (alerts.length === 0) {
            alertsList.innerHTML = '<p style="color: var(--text-secondary); padding: 1rem;">No alerts</p>';
            return;
        }

        alertsList.innerHTML = alerts.map(alert => `
            <div class="alert alert-${alert.severity === 'high' ? 'danger' : alert.severity === 'medium' ? 'warning' : 'info'}" style="margin-bottom: 0.5rem;">
                <div>
                    <strong>${alert.alertType.replace('_', ' ').toUpperCase()}</strong>
                    <p style="margin: 0.25rem 0 0 0;">${alert.message}</p>
                </div>
                <span class="badge badge-${alert.severity === 'high' ? 'danger' : alert.severity === 'medium' ? 'warning' : 'info'}">${alert.severity}</span>
            </div>
        `).join('');
    } catch (error) {
        console.error('Alerts load error:', error);
    }
}

/**
 * Apply user dashboard preferences (widgets visibility)
 */
function applyDashboardSettings(settings) {
    if (!settings || !settings.dashboard) return;

    const widgets = settings.dashboard.widgets;

    const setVisibility = (id, visible) => {
        const el = document.getElementById(id);
        if (el) el.style.display = visible ? '' : 'none';
    };

    if (widgets) {
        setVisibility('salesTrend', widgets.salesTrend !== false);
        setVisibility('forecastComparison', widgets.forecastComparison !== false);
        setVisibility('alertsSummary', widgets.alertsSummary !== false);
        setVisibility('inventoryStatus', widgets.inventoryStatus !== false);
    }
}

// Load anomalies and populate the anomaly section
async function loadAnomalies() {
    try {
        const anomalies = await apiRequest('/anomalies');
        const wrapper = document.getElementById('anomalySectionWrapper');
        const tbody = document.getElementById('anomalyTableBody');
        const countBadge = document.getElementById('anomalyCount');

        if (!anomalies || anomalies.length === 0) {
            if (wrapper) wrapper.style.display = 'none';
            return;
        }

        if (wrapper) wrapper.style.display = 'block';
        if (countBadge) countBadge.textContent = anomalies.length;

        // Build a map for chart highlighting: productId -> anomaly
        const anomalyMap = {};
        anomalies.forEach(a => { anomalyMap[a.productId] = a; });

        // Re-render sales chart with anomaly markers
        await loadSalesChart(anomalyMap);

        // Render table rows
        tbody.innerHTML = anomalies.map(a => `
            <tr class="${a.anomalyType === 'demand_spike' ? 'anomaly-spike' : 'anomaly-drop'}">
                <td style="font-weight:600">${a.productId}</td>
                <td>${a.storeId}</td>
                <td style="font-weight:600;color:${a.anomalyType === 'demand_spike' ? '#ef4444' : '#3b82f6'}">${formatNumber(a.currentSales)}</td>
                <td>${formatNumber(a.mean)}</td>
                <td>${formatNumber(a.stdDev)}</td>
                <td>
                    <span class="badge badge-${a.anomalyType === 'demand_spike' ? 'danger' : 'info'}">
                        ${a.anomalyType === 'demand_spike' ? '🔺 Demand Spike' : '🔻 Demand Drop'}
                    </span>
                </td>
                <td>
                    <span class="badge badge-${a.severity === 'high' ? 'danger' : 'warning'}">${a.severity}</span>
                </td>
                <td>
                    <button class="btn btn-secondary" style="font-size:0.7rem;padding:3px 10px;" onclick="resolveAnomaly('${a._id}', this)">Resolve</button>
                </td>
            </tr>
        `).join('');

    } catch (err) {
        console.error('Failed to load anomalies:', err);
    }
}

// Manually trigger anomaly re-detection
window.runAnomalyDetection = async function () {
    try {
        showAlert('Running anomaly detection...', 'info');
        await apiRequest('/anomalies/detect', { method: 'POST' });
        await loadAnomalies();
        showAlert('Anomaly detection complete!', 'success');
    } catch (err) {
        showAlert('Anomaly detection failed: ' + err.message, 'danger');
    }
};

// Resolve an anomaly
window.resolveAnomaly = async function (id, btn) {
    try {
        btn.disabled = true;
        btn.textContent = '...';
        await apiRequest(`/anomalies/${id}/resolve`, { method: 'PUT' });
        await loadAnomalies();
    } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Resolve';
        showAlert('Failed to resolve: ' + err.message, 'danger');
    }
};

// -------------------------------------------------------
// Load Demand Insights (Explainability)
// -------------------------------------------------------
// Load Demand Insights (Explainability)
// -------------------------------------------------------
async function loadDemandInsights() {
    try {
        const insights = await apiRequest('/forecasts/insights');
        const wrapper = document.getElementById('demandInsightsWrapper');
        const tbody = document.getElementById('demandInsightsBody');

        if (!insights || insights.length === 0) {
            if (wrapper) wrapper.style.display = 'none';
            return;
        }

        if (wrapper) wrapper.style.display = 'block';

        const dirIcons = {
            increase: { icon: '⬆️', label: '▲ Increasing', cls: 'increase' },
            decrease: { icon: '⬇️', label: '▼ Decreasing', cls: 'decrease' },
            stable: { icon: '➡️', label: '● Stable', cls: 'stable' }
        };

        // Derive direction from trendDetected when explanationDirection is missing
        const trendToDir = { increasing: 'increase', decreasing: 'decrease', stable: 'stable', none: 'stable' };

        tbody.innerHTML = insights.map(ins => {
            const hasExplanation = ins.explanation && ins.explanation.trim() !== '';
            const dir = ins.explanationDirection || trendToDir[ins.trendDetected] || 'stable';
            const dc = dirIcons[dir] || dirIcons.stable;
            const forecast = ins.adjustedDemand || ins.predictedDemand || 0;

            const factorsHtml = hasExplanation && (ins.keyFactors || []).length > 0
                ? `<div style="display:flex;flex-wrap:wrap;gap:0.4rem;">
                    ${(ins.keyFactors).map(f =>
                    `<span style="display:inline-flex;align-items:center;background:linear-gradient(135deg,rgba(37,99,235,0.1),rgba(139,92,246,0.1));color:var(--primary-color);border:1px solid rgba(37,99,235,0.22);border-radius:9999px;padding:0.2rem 0.75rem;font-size:0.73rem;font-weight:600;">${f}</span>`
                ).join('')}
                  </div>`
                : `<span style="color:var(--text-secondary);font-size:0.8rem;font-style:italic;">Pending — click ⚡ Generate All</span>`;

            const explanationHtml = hasExplanation
                ? `<span style="font-size:0.83rem;line-height:1.5;">${ins.explanation}</span>`
                : `<span style="color:var(--text-secondary);font-size:0.8rem;font-style:italic;">—</span>`;

            return `
                <tr>
                    <td style="font-weight:600;">${ins.productId}</td>
                    <td>${ins.storeId}</td>
                    <td style="font-weight:700;color:var(--primary-color);">${formatNumber(forecast)} units</td>
                    <td><span class="insight-direction ${dc.cls}" style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.25rem 0.7rem;border-radius:9999px;font-size:0.75rem;font-weight:700;">${dc.icon} ${dc.label}</span></td>
                    <td style="min-width:160px;">${factorsHtml}</td>
                    <td style="max-width:300px;">${explanationHtml}</td>
                </tr>`;
        }).join('');

    } catch (err) {
        console.error('Failed to load demand insights:', err);
    }
}

// -------------------------------------------------------
// Generate explanations for ALL products in bulk
// -------------------------------------------------------
window.generateAllInsights = async function () {
    const btn = document.getElementById('explainAllBtn');
    if (!btn) return;

    // Show loading state
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Generating…';
    btn.style.opacity = '0.7';

    try {
        showAlert('Generating demand explanations for all products… This may take a moment.', 'info');

        const result = await apiRequest('/forecasts/explain-all', { method: 'POST' });

        showAlert(result.message || `Explanations generated for ${result.processed} products.`, 'success');

        // Reload the insights table
        await loadDemandInsights();
    } catch (err) {
        showAlert('Failed to generate explanations: ' + err.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
        btn.style.opacity = '1';
    }
};


// Auto-refresh every 30 seconds
setInterval(loadDashboard, 30000);

// Initial load
loadDashboard().catch(console.error);
