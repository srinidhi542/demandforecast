const mongoose = require('mongoose');

const forecastSchema = new mongoose.Schema({
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
    forecastDate: {
        type: Date,
        required: true
    },
    predictedDemand: {
        type: Number,
        required: true,
        min: 0
    },
    seasonName: {
        type: String,
        default: 'Normal Season'
    },
    seasonalMultiplier: {
        type: Number,
        default: 1.0
    },
    adjustedDemand: {
        type: Number
    },
    confidenceMin: {
        type: Number,
        default: 0,
        min: 0
    },
    confidenceMax: {
        type: Number,
        default: 0,
        min: 0
    },
    modelUsed: {
        type: String,
        required: true,
        enum: ['linear_regression', 'random_forest', 'arima', 'auto']
    },
    accuracy: {
        rmse: { type: Number },
        mae: { type: Number },
        r2: { type: Number },
        mape: { type: Number }
    },
    seasonalityDetected: {
        type: Boolean,
        default: false
    },
    trendDetected: {
        type: String,
        enum: ['increasing', 'decreasing', 'stable', 'none'],
        default: 'none'
    },
    // Demand Explainability fields
    explanation: {
        type: String,
        default: ''
    },
    keyFactors: {
        type: [String],
        default: []
    },
    explanationDirection: {
        type: String,
        enum: ['increase', 'decrease', 'stable', ''],
        default: ''
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

// Indexes for querying forecasts
forecastSchema.index({ productId: 1, forecastDate: 1 });
forecastSchema.index({ storeId: 1, forecastDate: 1 });

module.exports = mongoose.model('Forecast', forecastSchema);
