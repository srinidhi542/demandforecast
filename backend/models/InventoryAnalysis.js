const mongoose = require('mongoose');

const inventoryAnalysisSchema = new mongoose.Schema({
    productId: {
        type: String,
        required: true,
        ref: 'Product'
    },
    storeId: {
        type: String,
        required: true,
        default: 'Warehouse'
    },
    currentStock: {
        type: Number,
        required: true
    },
    averageDailyDemand: {
        type: Number,
        required: true
    },
    forecastDemand: {
        type: Number,
        required: true
    },
    leadTime: {
        type: Number,
        required: true
    },
    safetyStock: {
        type: Number,
        required: true
    },
    reorderPoint: {
        type: Number,
        required: true
    },
    recommendedReorderQuantity: {
        type: Number,
        required: true
    },
    daysUntilStockout: {
        type: Number,
        required: true
    },
    riskLevel: {
        type: String,
        enum: ['Low', 'Medium', 'High'],
        required: true
    },
    recommendation: {
        type: String,
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

// Index for fast lookup of latest analysis per product
inventoryAnalysisSchema.index({ productId: 1, userId: 1, createdAt: -1 });

module.exports = mongoose.model('InventoryAnalysis', inventoryAnalysisSchema);
