// API Configuration
const API_URL = 'http://localhost:5000/api';

// Get auth token
function getToken() {
    return localStorage.getItem('token');
}

// Get user info
function getUser() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
}

// API request wrapper
async function apiRequest(endpoint, options = {}) {
    const token = getToken();

    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        },
        ...options
    };

    try {
        console.log(`API Request: ${API_URL}${endpoint}`);
        const response = await fetch(`${API_URL}${endpoint}`, config);

        const contentType = response.headers.get('content-type');
        let data;

        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            console.error('Non-JSON response:', text);
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        if (!response.ok) {
            throw new Error(data.message || 'Request failed');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Show alert message
function showAlert(message, type = 'info') {
    const container = document.getElementById('alert-container');
    if (!container) return;

    const alert = document.createElement('div');
    alert.className = `alert alert-${type} fade-in`;
    alert.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()" style="margin-left: auto; background: none; border: none; cursor: pointer; font-size: 1.25rem;">&times;</button>
    `;

    container.innerHTML = '';
    container.appendChild(alert);

    setTimeout(() => alert.remove(), 5000);
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Format number
function formatNumber(num) {
    return new Intl.NumberFormat('en-US').format(num);
}

// Check authentication
function checkAuth() {
    const token = getToken();
    if (!token) {
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

// Logout
async function logout() {
    try {
        await apiRequest('/auth/logout', { method: 'POST' });
    } catch (err) {
        console.warn('Logout notification to server failed', err);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    // Redirect to login (handle subfolders)
    const isInSubfolder = window.location.pathname.includes('/admin/');
    window.location.href = isInSubfolder ? '../index.html' : 'index.html';
}

// Initialize dark mode
async function initDarkMode() {
    // 1. Check local storage first for instant application
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // 2. Try to sync with backend settings if logged in
    const user = getUser();
    if (user) {
        try {
            const settings = await apiRequest('/user-settings');
            if (settings && settings.ui && settings.ui.theme !== 'system') {
                const backendTheme = settings.ui.theme;
                if (backendTheme !== savedTheme) {
                    document.documentElement.setAttribute('data-theme', backendTheme);
                    localStorage.setItem('theme', backendTheme);
                }
            }
        } catch (e) {
            // Silence error, stick with local preference
        }
    }
}

// Toggle dark mode
function toggleDarkMode() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initDarkMode();
    setupAdminLink();
    setupSettingsLink();
    setupUserDisplay();
});

// Display username in navbar
function setupUserDisplay() {
    const user = getUser();
    const usernameEl = document.getElementById('username');
    if (user && usernameEl) {
        usernameEl.textContent = user.username;
    }
}

// Setup Settings Link
function setupSettingsLink() {
    const navLinks = document.querySelector('.nav-links');
    if (navLinks) {
        // Check if it already exists
        if (!navLinks.querySelector('a[href*="settings.html"]')) {
            const settingsLi = document.createElement('li');
            const isInAdmin = window.location.pathname.includes('/admin/');
            const path = isInAdmin ? '../settings.html' : 'settings.html';
            settingsLi.innerHTML = `<a href="${path}">Settings</a>`;
            navLinks.appendChild(settingsLi);
        }
    }
}

// Setup Admin Link if applicable
function setupAdminLink() {
    const user = getUser();
    if (user && user.role === 'admin') {
        const navLinks = document.querySelector('.nav-links');
        if (navLinks) {
            // Check if it already exists to avoid duplicates
            if (!navLinks.querySelector('a[href*="admin/dashboard.html"]')) {
                const adminLi = document.createElement('li');
                // Adjust path based on whether we are in a subfolder
                const isSubfolder = window.location.pathname.includes('/admin/');
                const path = isSubfolder ? 'dashboard.html' : 'admin/dashboard.html';
                adminLi.innerHTML = `<a href="${path}" style="color: var(--accent-color); font-weight: 700;">Admin Panel</a>`;
                navLinks.appendChild(adminLi);
            }
        }
    }
}
