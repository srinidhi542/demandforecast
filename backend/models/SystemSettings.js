const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
    lowStockThreshold: {
        type: Number,
        default: 15
    },
    overstockThreshold: {
        type: Number,
        default: 150
    },
    reorderQuantityThreshold: {
        type: Number,
        default: 50
    },
    anomalyThreshold: {
        type: Number,
        default: 3
    },
    offerThreshold: {
        type: Number,
        default: 200
    },
    mlServiceEndpoint: {
        type: String,
        default: 'http://localhost:5001'
    },
    defaultModel: {
        type: String,
        default: 'Random Forest Ensemble'
    },
    autoTriggerFrequency: {
        type: String,
        default: 'Every 24 Hours'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
