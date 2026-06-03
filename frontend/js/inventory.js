if (!checkAuth()) throw new Error('Not authenticated');

const user = getUser();
if (user) document.getElementById('username').textContent = user.username;

// Generate alerts
async function generateAlerts() {
    try {
        showAlert('Generating inventory alerts...', 'info');

        const result = await apiRequest('/alerts/generate', {
            method: 'POST'
        });

        showAlert(result.message, 'success');
        loadAlerts();
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

// Load alerts
async function loadAlerts() {
    try {
        const alertType = document.getElementById('alertType').value;
        const severity = document.getElementById('severity').value;
        const isRead = document.getElementById('isRead').value;

        let query = '';
        if (alertType) query += `&alertType=${alertType}`;
        if (severity) query += `&severity=${severity}`;
        if (isRead) query += `&isRead=${isRead}`;

        const alerts = await apiRequest(`/alerts?${query}`);

        const alertsList = document.getElementById('alertsList');

        if (alerts.length === 0) {
            alertsList.innerHTML = '<div class="card"><p style="color: var(--text-secondary); text-align: center;">No alerts found</p></div>';
            return;
        }

        alertsList.innerHTML = alerts.map(alert => renderAlertCard(alert)).join('');
    } catch (error) {
        console.error('Load alerts error:', error);
        showAlert('Failed to load alerts', 'danger');
    }
}

function renderAlertCard(alert) {
    // Special card for offer recommendations
    if (alert.alertType === 'offer_recommendation') {
        return `
            <div class="card" style="
                margin-bottom: 1rem;
                border: 2px solid #f59e0b;
                background: linear-gradient(135deg, rgba(245,158,11,0.08), rgba(234,88,12,0.08));
                ${alert.isRead ? 'opacity: 0.7;' : ''}
            ">
                <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:1rem; flex-wrap:wrap; gap:0.5rem;">
                    <div>
                        <div style="display:flex; gap:0.5rem; align-items:center; margin-bottom:0.5rem; flex-wrap:wrap;">
                            <span style="background:#f59e0b; color:#fff; padding:0.2rem 0.75rem; border-radius:999px; font-size:0.75rem; font-weight:700;">
                                🏷️ OFFER RECOMMENDATION
                            </span>
                            <span class="badge badge-warning">${alert.severity.toUpperCase()}</span>
                        </div>
                        <h3 style="font-size:1rem; margin-bottom:0.25rem;">Product: ${alert.productId} | Stock: ${formatNumber(alert.currentStock)} units</h3>
                    </div>
                    ${!alert.isRead ? `<button class="btn" style="padding:0.25rem 0.75rem; font-size:0.75rem; background:#f59e0b; color:#fff; border:none; border-radius:8px;" onclick="markAsRead('${alert._id}')">Mark as Read</button>` : ''}
                </div>

                <p style="margin-bottom:0.75rem; font-weight:500;">${alert.message}</p>

                <div style="background: linear-gradient(135deg, #f59e0b, #ef4444); border-radius: 12px; padding: 1rem; color: #fff; margin-top: 0.75rem;">
                    <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
                        <span style="font-size:1.25rem;">🎯</span>
                        <strong>Promotion Recommended</strong>
                    </div>
                    <p style="margin:0; font-size:0.9rem; opacity:0.95;">${alert.recommendations}</p>
                    <div style="margin-top:0.75rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
                        <span style="background:rgba(255,255,255,0.2); padding:0.2rem 0.75rem; border-radius:999px; font-size:0.8rem;">💸 Flash Sale</span>
                        <span style="background:rgba(255,255,255,0.2); padding:0.2rem 0.75rem; border-radius:999px; font-size:0.8rem;">📦 Bundle Deal</span>
                        <span style="background:rgba(255,255,255,0.2); padding:0.2rem 0.75rem; border-radius:999px; font-size:0.8rem;">🎁 BOGO Offer</span>
                    </div>
                </div>

                <small style="color:var(--text-secondary); display:block; margin-top:1rem;">
                    Created: ${formatDate(alert.createdAt)}
                </small>
            </div>
        `;
    }

    // Standard alert card
    return `
        <div class="card" style="margin-bottom: 1rem; ${alert.isRead ? 'opacity: 0.7;' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                <div>
                    <div style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem;">
                        <span class="badge badge-${alert.severity === 'high' ? 'danger' : alert.severity === 'medium' ? 'warning' : 'info'}">
                            ${alert.severity.toUpperCase()}
                        </span>
                        <span class="badge badge-info">${alert.alertType.replace('_', ' ').toUpperCase()}</span>
                    </div>
                    <h3 style="font-size: 1rem; margin-bottom: 0.5rem;">Product: ${alert.productId} | Store: ${alert.storeId}</h3>
                </div>
                ${!alert.isRead ? `<button class="btn btn-secondary" style="padding: 0.25rem 0.75rem; font-size: 0.75rem;" onclick="markAsRead('${alert._id}')">Mark as Read</button>` : ''}
            </div>
            
            <p style="margin-bottom: 0.5rem;">${alert.message}</p>
            
            ${alert.recommendations ? `
                <div class="alert alert-info" style="margin-top: 1rem;">
                    <strong>💡 Recommendation:</strong> ${alert.recommendations}
                </div>
            ` : ''}
            
            ${alert.suggestedReorderQty ? `
                <div style="margin-top: 1rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                    <div>
                        <small style="color: var(--text-secondary);">Current Stock</small>
                        <p style="font-weight: 600;">${formatNumber(alert.currentStock)}</p>
                    </div>
                    <div>
                        <small style="color: var(--text-secondary);">Suggested Reorder Qty</small>
                        <p style="font-weight: 600;">${formatNumber(alert.suggestedReorderQty)}</p>
                    </div>
                    ${alert.suggestedReorderDate ? `
                        <div>
                            <small style="color: var(--text-secondary);">Suggested Reorder Date</small>
                            <p style="font-weight: 600;">${formatDate(alert.suggestedReorderDate)}</p>
                        </div>
                    ` : ''}
                </div>
            ` : ''}
            
            <small style="color: var(--text-secondary); display: block; margin-top: 1rem;">
                Created: ${formatDate(alert.createdAt)}
            </small>
        </div>
    `;
}

// Mark alert as read
async function markAsRead(id) {
    try {
        await apiRequest(`/alerts/${id}/read`, {
            method: 'PUT'
        });

        loadAlerts();
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

loadAlerts();
