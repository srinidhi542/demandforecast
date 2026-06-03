const mongoose = require('mongoose');

const userSettingsSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    notifications: {
        inApp: { type: Boolean, default: true },
        email: { type: Boolean, default: false },
        severity: { type: String, enum: ['all', 'high_medium', 'high_only'], default: 'all' },
        categories: {
            lowStock: { type: Boolean, default: true },
            overstock: { type: Boolean, default: true },
            anomalies: { type: Boolean, default: true }
        }
    },
    dashboard: {
        defaultView: { type: String, default: 'overview' },
        widgets: {
            salesTrend: { type: Boolean, default: true },
            inventoryStatus: { type: Boolean, default: true },
            alertsSummary: { type: Boolean, default: true },
            forecastComparison: { type: Boolean, default: true }
        },
        dateRange: { type: String, default: '30' } // 7, 14, 30, 90
    },
    ui: {
        theme: { type: String, enum: ['light', 'dark', 'system'], default: 'light' },
        layout: { type: String, enum: ['comfortable', 'compact'], default: 'comfortable' },
        language: { type: String, default: 'en' }
    },
    dataView: {
        rowsPerPage: { type: Number, default: 10 },
        columnVisibility: { type: Map, of: Boolean, default: {} }
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('UserSettings', userSettingsSchema);
