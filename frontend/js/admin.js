/**
 * Admin Panel Core Logic
 */

// Check if user is admin before anything else
document.addEventListener('DOMContentLoaded', () => {
    const user = getUser();
    if (!user || user.role !== 'admin') {
        window.location.href = '/index.html';
        return;
    }

    // Set active link in sidebar
    const currentPath = window.location.pathname;
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        if (currentPath.includes(item.getAttribute('href'))) {
            item.classList.add('active');
        } else if (currentPath.endsWith('/admin/') && item.getAttribute('href').includes('dashboard.html')) {
            item.classList.add('active');
        }
    });

    // Display admin username
    const usernameDisplay = document.getElementById('admin-name');
    if (usernameDisplay) {
        usernameDisplay.textContent = user.username;
    }

    // Load common admin data if on dashboard
    if (window.location.pathname.includes('dashboard.html')) {
        loadAdminSummary();
    }

    // Load admin settings if on settings page
    if (window.location.pathname.includes('settings.html')) {
        loadSystemSettings();
        setupSettingsHandlers();
    }
});

/**
 * Settings Page Logic
 */
async function loadSystemSettings() {
    try {
        const settings = await apiRequest('/admin/settings');
        Object.keys(settings).forEach(key => {
            const el = document.getElementById(key);
            if (el) el.value = settings[key];
        });
    } catch (err) {
        console.error('Failed to load system settings:', err);
    }
}

function setupSettingsHandlers() {
    const saveBtn = document.getElementById('saveThresholds');
    if (saveBtn) {
        saveBtn.onclick = async () => {
            const body = {
                lowStockThreshold: document.getElementById('lowStockThreshold').value,
                overstockThreshold: document.getElementById('overstockThreshold').value,
                reorderQuantityThreshold: document.getElementById('reorderQuantityThreshold').value,
                anomalyThreshold: document.getElementById('anomalyThreshold').value,
                offerThreshold: document.getElementById('offerThreshold') ? document.getElementById('offerThreshold').value : undefined
            };

            try {
                await apiRequest('/admin/settings', {
                    method: 'PUT',
                    body: JSON.stringify(body)
                });
                showAlert('Thresholds saved successfully', 'success');
            } catch (err) {
                showAlert(err.message || 'Error saving settings', 'error');
            }
        };
    }
}

/**
 * Load Global Admin Statistics
 */
async function loadAdminSummary() {
    try {
        const stats = await apiRequest('/admin/summary');

        updateEl('totalUsers', stats.totalUsers);
        updateEl('onlineUsers', stats.onlineUsers);
        updateEl('totalProducts', stats.totalProducts);
        updateEl('totalSales', formatNumber(stats.totalSalesQuantity));
        updateEl('activeAlerts', stats.activeAlerts);
        updateEl('avgAccuracy', stats.avgAccuracy + '%');
        updateEl('totalInventory', formatNumber(stats.totalInventory));
        updateEl('totalPredictedDemand', formatNumber(stats.totalPredictedDemand));

        // Also load recent system alerts
        loadRecentSystemAlerts();
    } catch (err) {
        console.error('Failed to load admin summary:', err);
    }
}

/**
 * Helper to update DOM element text
 */
function updateEl(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

/**
 * Load Recent system-wide alerts
 */
async function loadRecentSystemAlerts() {
    try {
        const alerts = await apiRequest('/admin/alerts'); // Fetch system-wide alerts for admin dashboard
        const container = document.getElementById('recentAlerts');
        if (!container) return;

        if (alerts.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 1rem;">No active alerts</p>';
            return;
        }

        container.innerHTML = alerts.map(alert => {
            try {
                return `
                    <div class="alert alert-${getSeverityClass(alert.severity)}" style="margin-bottom: 0.5rem;">
                        <div style="flex: 1">
                            <div style="display: flex; justify-content: space-between">
                                <strong>${(alert.alertType || 'unknown').toUpperCase()}</strong>
                                <span style="font-size: 0.75rem">${formatDate(alert.createdAt || alert.updatedAt)}</span>
                            </div>
                            <p style="font-size: 0.875rem">${alert.message || 'No message'}</p>
                        </div>
                    </div>
                `;
            } catch (e) {
                console.warn('Error rendering alert:', alert, e);
                return '';
            }
        }).join('');
    } catch (err) {
        console.error('Failed to load system alerts:', err);
        const container = document.getElementById('recentAlerts');
        if (container) {
            container.innerHTML = `<div style="padding: 1rem; color: var(--warning-color);">Failed to load alerts: ${err.message}</div>`;
        }
    }
}

function getSeverityClass(severity) {
    switch (severity) {
        case 'high': return 'danger';
        case 'medium': return 'warning';
        case 'low': return 'info';
        default: return 'info';
    }
}
