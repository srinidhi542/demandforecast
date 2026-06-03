const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
    productId: {
        type: String,
        required: true,
        ref: 'Product'
    },
    storeId: {
        type: String,
        required: true,
        ref: 'Store'
    },
    alertType: {
        type: String,
        required: true,
        enum: ['low_stock', 'overstock', 'anomaly', 'reorder', 'offer_recommendation']
    },
    severity: {
        type: String,
        required: true,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    message: {
        type: String,
        required: true
    },
    recommendations: {
        type: String
    },
    currentStock: {
        type: Number
    },
    suggestedReorderQty: {
        type: Number
    },
    suggestedReorderDate: {
        type: Date
    },
    isRead: {
        type: Boolean,
        default: false
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

// Index for filtering alerts
alertSchema.index({ userId: 1, isRead: 1, severity: 1 });

module.exports = mongoose.model('Alert', alertSchema);
