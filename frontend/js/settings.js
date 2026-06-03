/**
 * User Settings Module Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
    // Check auth
    const user = getUser();
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    // Display basic info
    updateBasicInfo(user);

    // Tab switching logic
    const navItems = document.querySelectorAll('.settings-nav-item');
    const sections = document.querySelectorAll('.settings-section');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetSection = item.getAttribute('data-section');

            // Update nav active state
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Update section visibility
            sections.forEach(s => s.classList.remove('active'));
            const targetEl = document.getElementById(targetSection);
            if (targetEl) targetEl.classList.add('active');
        });
    });

    // Load persisted settings from backend
    await loadSettings();

    // Setup form submit handlers
    setupFormHandlers();

    // Setup photo change handler
    setupPhotoHandler();

    // Load all system-wide alert thresholds
    loadSystemSettings();

    // Load seasonal settings
    loadSeasonalSettings();
});

let currentSettings = null;

function updateBasicInfo(user) {
    const nameEls = document.querySelectorAll('#username, #prof-username');
    nameEls.forEach(el => {
        if (el.tagName === 'INPUT') el.value = user.username;
        else el.textContent = user.username;
    });

    const emailEl = document.getElementById('prof-email');
    if (emailEl) emailEl.value = user.email;

    const roleEl = document.getElementById('prof-role-badge');
    if (roleEl) roleEl.textContent = user.role.toUpperCase();

    const avatar = document.getElementById('avatarCircle');
    if (avatar && user.username) {
        // user.id is the key stored by auth.js (not _id)
        const userId = user.id || user._id;
        const savedPhoto = userId ? localStorage.getItem(`userPhoto_${userId}`) : null;
        if (savedPhoto) {
            avatar.style.backgroundImage = `url('${savedPhoto}')`;
            avatar.style.backgroundSize = 'cover';
            avatar.style.backgroundPosition = 'center';
            avatar.textContent = '';
            const removeBtn = document.getElementById('removePhotoBtn');
            if (removeBtn) removeBtn.style.display = 'inline-block';
        } else {
            avatar.style.backgroundImage = '';
            avatar.textContent = user.username[0].toUpperCase();
        }
    }

    const loginEl = document.getElementById('lastLoginDisplay');
    if (loginEl) {
        loginEl.textContent = user.lastLogin ? new Date(user.lastLogin).toLocaleString() : "Unknown";
    }
}

/**
 * Fetch and populate user settings
 */
async function loadSettings() {
    try {
        currentSettings = await apiRequest('/user-settings');
        if (!currentSettings) return;

        // Populate Dashboard Form
        if (currentSettings.dashboard) {
            if (document.getElementById('dash-dateRange'))
                document.getElementById('dash-dateRange').value = currentSettings.dashboard.dateRange || '30';

            if (currentSettings.dashboard.widgets) {
                const w = currentSettings.dashboard.widgets;
                if (document.getElementById('dash-salesTrend')) document.getElementById('dash-salesTrend').checked = !!w.salesTrend;
                if (document.getElementById('dash-inventoryStatus')) document.getElementById('dash-inventoryStatus').checked = !!w.inventoryStatus;
                if (document.getElementById('dash-alertsSummary')) document.getElementById('dash-alertsSummary').checked = !!w.alertsSummary;
                if (document.getElementById('dash-forecastComparison')) document.getElementById('dash-forecastComparison').checked = !!w.forecastComparison;
            }
        }

        // Populate Notifications Form
        if (currentSettings.notifications) {
            if (document.getElementById('notify-inApp')) document.getElementById('notify-inApp').checked = !!currentSettings.notifications.inApp;
            if (document.getElementById('notify-email')) document.getElementById('notify-email').checked = !!currentSettings.notifications.email;

            const severityRadio = document.querySelector(`input[name="severity"][value="${currentSettings.notifications.severity}"]`);
            if (severityRadio) severityRadio.checked = true;
        }

        // Populate UI Form
        if (currentSettings.ui) {
            const themeRadio = document.querySelector(`input[name="theme"][value="${currentSettings.ui.theme}"]`);
            if (themeRadio) themeRadio.checked = true;

            const layoutRadio = document.querySelector(`input[name="layout"][value="${currentSettings.ui.layout}"]`);
            if (layoutRadio) layoutRadio.checked = true;
        }

    } catch (err) {
        console.error('Failed to load settings:', err);
    }
}

/**
 * Handle save operations for different forms
 */
function setupFormHandlers() {
    // 1. Profile Form
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.onsubmit = async (e) => {
            e.preventDefault();
            const username = document.getElementById('prof-username').value.trim();

            if (!username) return showAlert('Username cannot be empty', 'error');

            try {
                const updatedUser = await apiRequest('/user-settings/profile', {
                    method: 'PUT',
                    body: JSON.stringify({ username })
                });

                // Sync local user data
                const currentUser = getUser();
                const newUser = { ...currentUser, username: updatedUser.username };
                localStorage.setItem('user', JSON.stringify(newUser));

                // Update UI immediately
                updateBasicInfo(newUser);
                showAlert('Profile updated successfully', 'success');
            } catch (err) {
                showAlert(err.message || 'Failed to update profile', 'error');
            }
        };
    }

    // 2. Dashboard Form
    const dashboardForm = document.getElementById('dashboardForm');
    if (dashboardForm) {
        dashboardForm.onsubmit = async (e) => {
            e.preventDefault();
            const body = {
                dashboard: {
                    dateRange: document.getElementById('dash-dateRange').value,
                    widgets: {
                        salesTrend: document.getElementById('dash-salesTrend').checked,
                        inventoryStatus: document.getElementById('dash-inventoryStatus').checked,
                        alertsSummary: document.getElementById('dash-alertsSummary').checked,
                        forecastComparison: document.getElementById('dash-forecastComparison').checked
                    }
                }
            };
            await savePreferences(body, 'Dashboard preferences saved');
        };
    }

    // 3. Notifications Form
    const notificationForm = document.getElementById('notificationForm');
    if (notificationForm) {
        notificationForm.onsubmit = async (e) => {
            e.preventDefault();
            const severityEl = document.querySelector('input[name="severity"]:checked');
            const body = {
                notifications: {
                    inApp: document.getElementById('notify-inApp').checked,
                    email: document.getElementById('notify-email').checked,
                    severity: severityEl ? severityEl.value : 'all'
                }
            };
            await savePreferences(body, 'Notification preferences saved');
        };
    }

    // 4. UI Form
    const uiForm = document.getElementById('uiForm');
    if (uiForm) {
        uiForm.onsubmit = async (e) => {
            e.preventDefault();
            const themeEl = document.querySelector('input[name="theme"]:checked');
            const layoutEl = document.querySelector('input[name="layout"]:checked');

            const theme = themeEl ? themeEl.value : 'light';
            const layout = layoutEl ? layoutEl.value : 'comfortable';

            const body = { ui: { theme, layout } };

            // Immediate preview persistence
            if (theme !== 'system') {
                document.documentElement.setAttribute('data-theme', theme);
                localStorage.setItem('theme', theme);
            }

            await savePreferences(body, 'UI preferences applied');
        };
    }

    // 5. Password Form
    const passwordForm = document.getElementById('passwordForm');
    if (passwordForm) {
        passwordForm.onsubmit = async (e) => {
            e.preventDefault();
            const currentPassword = document.getElementById('curr-pass').value;
            const newPassword = document.getElementById('new-pass').value;
            const confPassword = document.getElementById('conf-pass').value;

            if (newPassword !== confPassword) {
                return showAlert('Passwords do not match', 'error');
            }

            try {
                await apiRequest('/user-settings/change-password', {
                    method: 'PUT',
                    body: JSON.stringify({ currentPassword, newPassword })
                });
                showAlert('Password updated successfully', 'success');
                passwordForm.reset();
            } catch (err) {
                showAlert(err.message, 'error');
            }
        };
    }
}

/**
 * Generic helper for preference saving
 */
async function savePreferences(body, successMsg) {
    try {
        await apiRequest('/user-settings', {
            method: 'PUT',
            body: JSON.stringify(body)
        });
        await loadSettings(); // Re-sync with server
        showAlert(successMsg, 'success');
    } catch (err) {
        showAlert(err.message || 'Error saving preferences', 'error');
    }
}

/**
 * Load the current system-wide thresholds (Low Stock, Overstock, Offer, etc.)
 */
async function loadSystemSettings() {
    try {
        const settings = await apiRequest('/alerts/system-settings');

        // Match keys to element IDs (lowStockThreshold, overstockThreshold, etc.)
        const fields = ['lowStockThreshold', 'overstockThreshold', 'reorderQuantityThreshold', 'offerThreshold'];
        fields.forEach(field => {
            const el = document.getElementById(field);
            if (el && settings[field] != null) {
                el.value = settings[field];
            }
        });
    } catch (err) {
        console.warn('Could not load system thresholds:', err.message);
    }
}

/**
 * Save all global system thresholds to the database
 */
async function saveSystemThresholds() {
    const statusEl = document.getElementById('systemThresholdStatus');
    const btn = document.getElementById('saveSystemThresholdsBtn');

    // Collect values from IDs
    const fields = ['lowStockThreshold', 'overstockThreshold', 'reorderQuantityThreshold', 'offerThreshold'];
    const body = {};

    for (const field of fields) {
        const el = document.getElementById(field);
        if (el) {
            const val = parseInt(el.value, 10);
            if (isNaN(val) || val < 1) {
                if (statusEl) {
                    statusEl.textContent = `⚠️ Invalid value for ${field}. Must be > 0.`;
                    statusEl.style.color = '#e74c3c';
                    statusEl.style.display = 'block';
                }
                return;
            }
            body[field] = val;
        }
    }

    if (btn) btn.disabled = true;
    try {
        await apiRequest('/alerts/system-settings', {
            method: 'PUT',
            body: JSON.stringify(body)
        });

        if (statusEl) {
            statusEl.textContent = `✅ Global thresholds synchronized successfully!`;
            statusEl.style.color = 'var(--success-color, #22c55e)';
            statusEl.style.display = 'block';
        }
        showAlert(`Global thresholds updated`, 'success');

        // Small delay then hide status
        setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 3000);
    } catch (err) {
        if (statusEl) {
            statusEl.textContent = `❌ Sync Failed: ${err.message}`;
            statusEl.style.color = '#e74c3c';
            statusEl.style.display = 'block';
        }
        showAlert(err.message || 'Failed to sync thresholds', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

/**
 * Handle profile photo change and removal
 */
function setupPhotoHandler() {
    const changePhotoBtn = document.getElementById('changePhotoBtn');
    const removePhotoBtn = document.getElementById('removePhotoBtn');
    const fileInput = document.getElementById('photoFileInput');
    const avatar = document.getElementById('avatarCircle');
    const photoError = document.getElementById('photoError');

    if (!changePhotoBtn || !fileInput || !avatar) return;

    // Clicking the button triggers the hidden file input
    changePhotoBtn.addEventListener('click', () => {
        fileInput.value = ''; // Reset so same file can be re-selected
        fileInput.click();
    });

    // When a file is selected
    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;

        // Validate type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
        if (!allowedTypes.includes(file.type)) {
            showPhotoError('Only JPG, PNG, or GIF files are allowed.');
            return;
        }

        // Validate size (max 2MB)
        const maxSize = 2 * 1024 * 1024; // 2MB in bytes
        if (file.size > maxSize) {
            showPhotoError('File is too large. Maximum size is 2MB.');
            return;
        }

        hidePhotoError();

        // Read and display the image
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;

            // Apply to avatar
            avatar.style.backgroundImage = `url('${dataUrl}')`;
            avatar.style.backgroundSize = 'cover';
            avatar.style.backgroundPosition = 'center';
            avatar.textContent = '';

            // Persist in localStorage keyed by user ID
            const user = getUser();
            const userId = user && (user.id || user._id);
            if (userId) {
                localStorage.setItem(`userPhoto_${userId}`, dataUrl);
            }

            // Show the remove button
            if (removePhotoBtn) removePhotoBtn.style.display = 'inline-block';

            showAlert('Profile photo updated!', 'success');
        };
        reader.onerror = () => {
            showPhotoError('Failed to read the file. Please try again.');
        };
        reader.readAsDataURL(file);
    });

    // Remove photo button
    if (removePhotoBtn) {
        removePhotoBtn.addEventListener('click', () => {
            const user = getUser();
            const userId = user && (user.id || user._id);
            if (userId) {
                localStorage.removeItem(`userPhoto_${userId}`);
            }

            // Reset avatar to initial letter
            avatar.style.backgroundImage = '';
            avatar.textContent = user ? user.username[0].toUpperCase() : 'U';
            removePhotoBtn.style.display = 'none';
            hidePhotoError();

            showAlert('Profile photo removed.', 'success');
        });
    }

    function showPhotoError(msg) {
        if (photoError) {
            photoError.textContent = msg;
            photoError.style.display = 'block';
        }
    }

    function hidePhotoError() {
        if (photoError) {
            photoError.textContent = '';
            photoError.style.display = 'none';
        }
    }
}

// Load seasonal settings
async function loadSeasonalSettings() {
    try {
        const seasons = await apiRequest('/seasons');
        const listEl = document.getElementById('seasonsList');
        if (!listEl) return;

        listEl.innerHTML = seasons.map(s => `
            <div class="card p-4" style="border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 1rem;">
                <h4>${s.seasonName}</h4>
                <div class="form-group mt-2 mb-2">
                    <label class="form-label" style="display:block; margin-bottom:4px;">Multiplier (e.g., 1.1)</label>
                    <input type="number" step="0.1" class="form-input" id="season-mult-${s._id}" value="${s.multiplier}">
                </div>
                <div class="form-group mb-2">
                    <label class="form-label" style="display:block; margin-bottom:4px;">Active Months (comma-separated 1-12)</label>
                    <input type="text" class="form-input" id="season-months-${s._id}" value="${(s.activeMonths || []).join(', ')}">
                </div>
                <button class="btn btn-primary mt-2" onclick="saveSeason('${s._id}', '${s.seasonName}')">Save</button>
            </div>
        `).join('');
    } catch (err) {
        console.error('Failed to load seasons', err);
    }
}

// Save seasonal settings
window.saveSeason = async function (id, name) {
    try {
        const multEl = document.getElementById(`season-mult-${id}`);
        const monthsEl = document.getElementById(`season-months-${id}`);

        const multiplier = parseFloat(multEl.value);
        const activeMonths = monthsEl.value.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v) && v >= 1 && v <= 12);

        await apiRequest(`/seasons/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ seasonName: name, multiplier, activeMonths })
        });
        showAlert('Season setup updated successfully', 'success');
    } catch (err) {
        showAlert(err.message, 'error');
    }
}
