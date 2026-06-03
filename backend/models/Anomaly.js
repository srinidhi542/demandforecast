const mongoose = require('mongoose');

const anomalySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    productId: {
        type: String,
        required: true
    },
    storeId: {
        type: String,
        required: true
    },
    detectedAt: {
        type: Date,
        default: Date.now
    },
    currentSales: {
        type: Number,
        required: true
    },
    mean: {
        type: Number,
        required: true
    },
    stdDev: {
        type: Number,
        required: true
    },
    anomalyType: {
        type: String,
        enum: ['demand_spike', 'demand_drop'],
        required: true
    },
    severity: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    message: {
        type: String,
        required: true
    },
    isResolved: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

anomalySchema.index({ userId: 1, productId: 1, createdAt: -1 });

module.exports = mongoose.model('Anomaly', anomalySchema);
