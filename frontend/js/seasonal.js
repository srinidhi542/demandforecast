if (!checkAuth()) throw new Error('Not authenticated');

const user = getUser();
if (user) document.getElementById('username').textContent = user.username;

let multiplierChart, averageSalesChart;
let detectedAnalysis = null;

// Initialize Analysis Page
async function initSeasonalAnalysis() {
    try {
        showAlert('Analyzing historical sales data...', 'info');

        const analysis = await apiRequest('/sales/seasonal-analysis');
        if (!analysis || !analysis.detectedSeasons) {
            document.getElementById('seasonalityTable').innerHTML = '<tr><td colspan="5" class="text-center">No sales data available for seasonality tracking. Please upload data.</td></tr>';
            return;
        }

        detectedAnalysis = analysis;

        // Render KPIs
        document.getElementById('valOverallAverage').textContent = formatNumber(analysis.overallAverage);

        let sorted = [...analysis.detectedSeasons].sort((a, b) => b.multiplier - a.multiplier);
        document.getElementById('valPeakMonth').textContent = sorted[0] ? `${sorted[0].monthName} (${sorted[0].multiplier}x)` : '-';
        document.getElementById('valLowestMonth').textContent = sorted[sorted.length - 1] ? `${sorted[sorted.length - 1].monthName} (${sorted[sorted.length - 1].multiplier}x)` : '-';

        // Show Sync button
        document.getElementById('btnSyncSeasons').style.display = 'block';

        // Render Charts and Table
        renderCharts(analysis.detectedSeasons);
        renderTable(analysis.detectedSeasons);

        showAlert('Seasonal analysis generated successfully!', 'success');
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

// Render Charts
function renderCharts(seasons) {
    const labels = seasons.map(s => s.monthName);
    const multipliers = seasons.map(s => s.multiplier);
    const averages = seasons.map(s => s.averageSales);

    const multCtx = document.getElementById('multiplierChart').getContext('2d');
    const avgCtx = document.getElementById('averageSalesChart').getContext('2d');

    if (multiplierChart) multiplierChart.destroy();
    if (averageSalesChart) averageSalesChart.destroy();

    // Multipliers Chart
    multiplierChart = new Chart(multCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Detected Multiplier',
                data: multipliers,
                backgroundColor: multipliers.map(m => m > 1.1 ? 'rgba(239, 68, 68, 0.7)' : (m < 0.9 ? 'rgba(59, 130, 246, 0.7)' : 'rgba(16, 185, 129, 0.7)')),
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });

    // Averaged Sales Chart
    averageSalesChart = new Chart(avgCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Average Historical Sales',
                data: averages,
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// Render Table
function renderTable(seasons) {
    const tbody = document.getElementById('seasonalityTable');
    tbody.innerHTML = seasons.map(s => `
        <tr>
            <td style="font-weight:600">${s.monthName}</td>
            <td>${formatNumber(s.averageSales)}</td>
            <td style="font-weight:600; color:var(--primary-color)">${s.multiplier}x</td>
            <td>
                <span class="badge badge-${s.status === 'High Demand' ? 'danger' : (s.status === 'Normal' ? 'success' : 'info')}">
                    ${s.status}
                </span>
            </td>
            <td style="color:var(--text-secondary); font-size:0.875rem;">
                ${s.status === 'High Demand' ? 'Increase inventory thresholds' : (s.status === 'Normal' ? 'Maintain standard thresholds' : 'Aggressively clear stock / Run Offers')}
            </td>
        </tr>
    `).join('');
}


// Sync Detected logic 
window.syncSeasonsWithDetected = async function () {
    if (!detectedAnalysis) return;

    try {
        const btn = document.getElementById('btnSyncSeasons');
        btn.textContent = 'Syncing...';
        btn.disabled = true;

        // Fetch user's current configured seasons
        const currentSeasons = await apiRequest('/seasons');

        // Update each season's multiplier based on the average detected multiplier for its active months
        let updatePromises = currentSeasons.map(async season => {
            if (!season.activeMonths || season.activeMonths.length === 0) return;

            // Calculate the average of detected multipliers for the months mapped to this season
            let totalMultiplier = 0;
            let count = 0;

            season.activeMonths.forEach(m => {
                const detected = detectedAnalysis.detectedSeasons.find(ds => ds.monthNumber === m);
                if (detected) {
                    totalMultiplier += detected.multiplier;
                    count++;
                }
            });

            if (count > 0) {
                const newMultiplier = parseFloat((totalMultiplier / count).toFixed(2));

                // Only PUT if it has mathematically shifted
                if (newMultiplier !== season.multiplier) {
                    return apiRequest(`/seasons/${season._id}`, {
                        method: 'PUT',
                        body: JSON.stringify({
                            seasonName: season.seasonName,
                            multiplier: newMultiplier,
                            activeMonths: season.activeMonths
                        })
                    });
                }
            }
        });

        await Promise.all(updatePromises);
        showAlert('Successfully synchronized Settings with historical data.', 'success');

        btn.textContent = 'Settings Updated!';
        setTimeout(() => {
            btn.textContent = 'Apply Detected Multipliers to Settings';
            btn.disabled = false;
        }, 3000);

    } catch (e) {
        showAlert('Failed to sync settings: ' + e.message, 'danger');
        document.getElementById('btnSyncSeasons').disabled = false;
    }
}

// Initial load
initSeasonalAnalysis();
