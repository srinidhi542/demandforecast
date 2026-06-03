if (!checkAuth()) throw new Error('Not authenticated');

const user = getUser();
if (user) document.getElementById('username').textContent = user.username;

let forecastChart;

// Generate forecast
document.getElementById('forecastForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const productId = document.getElementById('productId').value;
    const storeId = document.getElementById('storeId').value;
    const forecastDays = parseInt(document.getElementById('forecastDays').value);
    const model = document.getElementById('model').value;

    try {
        showAlert('Generating forecast... This may take a moment.', 'info');

        const result = await apiRequest('/forecasts/generate', {
            method: 'POST',
            body: JSON.stringify({ productId, storeId, forecastDays, model })
        });

        showAlert(`Forecast generated successfully using ${result.model}`, 'success');

        // Display model metrics
        displayModelMetrics(result);

        // Display Demand Explainability panel
        displayExplainability(result);

        // Display forecast chart
        displayForecastChart(result.predictions, productId, storeId);

        // Display forecast table
        displayForecastTable(result.predictions, result.model, result.explanation);

    } catch (error) {
        showAlert(error.message, 'danger');
    }
});

// Display model metrics
function displayModelMetrics(result) {
    const metricsDiv = document.getElementById('modelMetrics');
    const comparison = document.getElementById('modelComparison');

    comparison.style.display = 'block';

    metricsDiv.innerHTML = `
        <div class="kpi-card">
            <div class="kpi-label">RMSE</div>
            <div class="kpi-value" style="font-size: 1.5rem;">${result.accuracy.rmse.toFixed(2)}</div>
        </div>
        <div class="kpi-card secondary">
            <div class="kpi-label">MAE</div>
            <div class="kpi-value" style="font-size: 1.5rem;">${result.accuracy.mae.toFixed(2)}</div>
        </div>
        <div class="kpi-card accent">
            <div class="kpi-label">R² Score</div>
            <div class="kpi-value" style="font-size: 1.5rem;">${result.accuracy.r2.toFixed(4)}</div>
        </div>
        <div class="kpi-card warning">
            <div class="kpi-label">Model Used</div>
            <div class="kpi-value" style="font-size: 1rem;">${result.model.replace('_', ' ').toUpperCase()}</div>
        </div>
    `;
}

// -------------------------------------------------------
// Display Demand Explainability Panel
// -------------------------------------------------------
function displayExplainability(result) {
    const panel = document.getElementById('explainabilityPanel');
    const textEl = document.getElementById('explainText');
    const factorsEl = document.getElementById('explainFactors');
    const directionBadge = document.getElementById('explainDirectionBadge');

    if (!result.explanation) {
        if (panel) panel.style.display = 'none';
        return;
    }

    // Direction badge
    const dir = result.explanationDirection || 'stable';
    const dirConfig = {
        increase: { label: '▲ Demand Increasing', cls: 'badge-success', color: '#065f46', bg: '#d1fae5' },
        decrease: { label: '▼ Demand Decreasing', cls: 'badge-danger', color: '#991b1b', bg: '#fee2e2' },
        stable: { label: '● Demand Stable', cls: 'badge-info', color: '#1e40af', bg: '#dbeafe' }
    };
    const cfg = dirConfig[dir] || dirConfig.stable;

    if (directionBadge) {
        directionBadge.textContent = cfg.label;
        directionBadge.style.background = cfg.bg;
        directionBadge.style.color = cfg.color;
        directionBadge.style.padding = '0.35rem 0.9rem';
        directionBadge.style.borderRadius = '9999px';
        directionBadge.style.fontWeight = '600';
        directionBadge.style.fontSize = '0.8rem';
    }

    // Explanation text
    if (textEl) {
        textEl.innerHTML = `
            <div class="explain-box ${dir}">
                <span class="explain-icon">${dir === 'increase' ? '📈' : dir === 'decrease' ? '📉' : '📊'}</span>
                <span>${result.explanation}</span>
            </div>`;
    }

    // Key factors chips
    const factors = result.keyFactors || [];
    if (factorsEl && factors.length > 0) {
        factorsEl.innerHTML = `
            <div style="margin-top:1rem;">
                <span style="font-size:0.8rem;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Key Factors</span>
                <div class="factor-chips" style="margin-top:0.5rem;display:flex;flex-wrap:wrap;gap:0.5rem;">
                    ${factors.map(f => `<span class="factor-chip" style="display:inline-flex;align-items:center;background:linear-gradient(135deg,rgba(37,99,235,0.1),rgba(139,92,246,0.1));color:var(--primary-color);border:1px solid rgba(37,99,235,0.22);border-radius:9999px;padding:0.22rem 0.8rem;font-size:0.75rem;font-weight:600;">${f}</span>`).join('')}
                </div>
            </div>`;
    } else if (factorsEl) {
        factorsEl.innerHTML = '';
    }

    if (panel) panel.style.display = 'block';
}
async function displayForecastChart(predictions, productId, storeId) {
    const ctx = document.getElementById('forecastChart').getContext('2d');

    if (forecastChart) {
        forecastChart.destroy();
    }

    let actualSales = [];
    try {
        actualSales = await apiRequest(`/sales?productId=${productId}&storeId=${storeId}&limit=60`);
        actualSales.sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch (e) {
        console.warn('Could not load actual sales for chart', e);
    }

    // Use a unified dates array for X-axis
    let rawDates = [...actualSales.map(s => formatDate(s.date)), ...predictions.map(p => p.date)];
    const dates = [...new Set(rawDates)].sort((a, b) => new Date(a) - new Date(b));

    // Map data to corresponding dates
    const makeDataset = (dataMap) => dates.map(d => dataMap[d] !== undefined ? dataMap[d] : null);

    const actualMap = {};
    actualSales.forEach(s => actualMap[formatDate(s.date)] = s.quantity);

    const predictedMap = {};
    const adjustedMap = {};
    const confMinMap = {};
    const confMaxMap = {};

    predictions.forEach(p => {
        predictedMap[p.date] = p.predicted_demand;
        adjustedMap[p.date] = p.adjustedDemand || p.predicted_demand;
        confMinMap[p.date] = p.confidence_min;
        confMaxMap[p.date] = p.confidence_max;
    });

    forecastChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: 'Actual Sales',
                    data: makeDataset(actualMap),
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    tension: 0.4,
                    fill: false,
                    borderWidth: 2
                },
                {
                    label: 'Base Forecast',
                    data: makeDataset(predictedMap),
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Seasonally Adjusted',
                    data: makeDataset(adjustedMap),
                    borderColor: '#8b5cf6',
                    backgroundColor: 'transparent',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: false
                },
                {
                    label: 'Confidence Min',
                    data: makeDataset(confMinMap),
                    borderColor: '#6b7280',
                    borderDash: [5, 5],
                    tension: 0.4,
                    fill: false
                },
                {
                    label: 'Confidence Max',
                    data: makeDataset(confMaxMap),
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
            spanGaps: true,
            plugins: {
                legend: {
                    display: true
                },
                zoom: {
                    zoom: {
                        wheel: {
                            enabled: true
                        },
                        pinch: {
                            enabled: true
                        },
                        mode: 'xy'
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Display forecast table
function displayForecastTable(predictions, model, explanation) {
    const tbody = document.getElementById('forecastTable');

    tbody.innerHTML = predictions.map((p, i) => `
        <tr>
            <td>${p.date}</td>
            <td>${formatNumber(p.predicted_demand)}</td>
            <td>${p.seasonName || 'Normal Season'}</td>
            <td>${(p.seasonalMultiplier || 1.0) + 'x'}</td>
            <td style="font-weight: bold; color: var(--primary-color);">${formatNumber(p.adjustedDemand || p.predicted_demand)}</td>
            <td>${formatNumber(p.confidence_min)}</td>
            <td>${formatNumber(p.confidence_max)}</td>
            <td><span class="badge badge-info">${model.replace('_', ' ').toUpperCase()}</span></td>
            <td style="max-width:220px;font-size:0.8rem;color:var(--text-secondary);">${i === 0 && explanation ? explanation : (i === 0 ? '-' : '')}</td>
        </tr>
    `).join('');
}
