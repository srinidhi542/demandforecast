const express = require('express');
const router = express.Router();
const axios = require('axios');
const Forecast = require('../models/Forecast');
const SalesData = require('../models/SalesData');
const Season = require('../models/Season');
const { authenticate } = require('../middleware/auth');
const { detectAnomaliesForUser } = require('./anomalies');
const Anomaly = require('../models/Anomaly');
const Alert = require('../models/Alert');
const { calculateDynamicReorder } = require('../services/inventoryService');

// @route   POST /api/forecasts/generate
// @desc    Generate demand forecast
// @access  Private
router.post('/generate', authenticate, async (req, res) => {
    try {
        const { productId, storeId, forecastDays = 30, model = 'auto' } = req.body;

        if (!productId || !storeId) {
            return res.status(400).json({ message: 'productId and storeId are required' });
        }

        // Fetch historical sales data
        // Fetch historical sales data
        const salesData = await SalesData.find({
            productId: { $regex: new RegExp(`^${productId}$`, 'i') },
            storeId: { $regex: new RegExp(`^${storeId}$`, 'i') },
            userId: req.user._id
        }).sort({ date: 1 });

        if (salesData.length < 10) {
            return res.status(400).json({
                message: 'Insufficient data. At least 10 historical records required for forecasting'
            });
        }

        // Prepare data for ML service
        const historicalData = salesData.map(record => ({
            date: record.date.toISOString().split('T')[0],
            quantity: record.quantity
        }));

        // Call ML service
        const mlResponse = await axios.post(
            `${process.env.ML_SERVICE_URL}/api/ml/predict`,
            {
                historical_data: historicalData,
                forecast_days: forecastDays,
                model: model
            },
            { timeout: 60000 } // 60 second timeout
        );

        const { predictions, best_model, accuracy, seasonality, trend } = mlResponse.data;

        // Fetch user seasons or apply defaults
        let userSeasons = await Season.find({ userId: req.user._id });
        if (!userSeasons || userSeasons.length === 0) {
            const DEFAULT_SEASONS = [
                { seasonName: 'Summer', multiplier: 1.1, activeMonths: [4, 5, 6] },
                { seasonName: 'Festival Season (Diwali)', multiplier: 1.3, activeMonths: [10, 11] },
                { seasonName: 'Christmas Season', multiplier: 1.2, activeMonths: [12] },
                { seasonName: 'Off Season (Monsoon/Low Demand)', multiplier: 0.8, activeMonths: [7, 8] },
                { seasonName: 'Normal Season', multiplier: 1.0, activeMonths: [1, 2, 3, 9] }
            ];
            const defaultWithUser = DEFAULT_SEASONS.map(s => ({ ...s, userId: req.user._id }));
            userSeasons = await Season.insertMany(defaultWithUser);
        }

        // Apply seasonal multipliers
        predictions.forEach(pred => {
            const predDate = new Date(pred.date);
            // JS getMonth is 0-indexed, so +1
            const predMonth = predDate.getMonth() + 1;
            let matchingSeason = userSeasons.find(s => s.activeMonths && s.activeMonths.includes(predMonth));

            if (!matchingSeason) {
                matchingSeason = { seasonName: 'Normal Season', multiplier: 1.0 };
            }

            pred.seasonName = matchingSeason.seasonName;
            pred.seasonalMultiplier = matchingSeason.multiplier;
            pred.adjustedDemand = pred.predicted_demand * matchingSeason.multiplier;
        });

        // -------------------------------------------------------
        // Demand Explainability: call ML service's /explain endpoint
        // -------------------------------------------------------
        let explanation = '';
        let keyFactors = [];
        let explanationDirection = 'stable';

        try {
            // Check if there is an active anomaly for this product
            const latestAnomaly = await Anomaly.findOne({
                userId: req.user._id,
                productId,
                storeId,
                isResolved: false
            }).sort({ createdAt: -1 });

            const explainPayload = {
                historical_data: historicalData,
                seasonal_multiplier: predictions[0]?.seasonalMultiplier || 1.0,
                season_name: predictions[0]?.seasonName || 'Normal Season',
                has_anomaly: !!latestAnomaly,
                anomaly_type: latestAnomaly ? latestAnomaly.anomalyType : null,
                forecast_value: predictions[0]?.adjustedDemand || predictions[0]?.predicted_demand || 0
            };

            const explainResp = await axios.post(
                `${process.env.ML_SERVICE_URL}/api/ml/explain`,
                explainPayload,
                { timeout: 15000 }
            );

            explanation = explainResp.data.explanation || '';
            keyFactors = explainResp.data.key_factors || [];
            explanationDirection = explainResp.data.direction || 'stable';
        } catch (explainErr) {
            console.warn('Explanation generation skipped:', explainErr.message);
        }

        // Save forecast results
        const forecastRecords = predictions.map(pred => ({
            productId,
            storeId,
            forecastDate: new Date(pred.date),
            predictedDemand: pred.predicted_demand,
            seasonName: pred.seasonName,
            seasonalMultiplier: pred.seasonalMultiplier,
            adjustedDemand: pred.adjustedDemand,
            confidenceMin: pred.confidence_min,
            confidenceMax: pred.confidence_max,
            modelUsed: best_model,
            accuracy: accuracy,
            seasonalityDetected: seasonality.detected,
            trendDetected: trend.direction,
            explanation,
            keyFactors,
            explanationDirection,
            userId: req.user._id
        }));

        await Forecast.insertMany(forecastRecords);

        res.status(201).json({
            message: 'Forecast generated successfully',
            productId,
            storeId,
            model: best_model,
            accuracy,
            seasonality,
            trend,
            predictions,
            explanation,
            keyFactors,
            explanationDirection
        });

        // --- Auto Reorder Recalculation ---
        try {
            console.log(`Recalculating reorder for ${productId}...`);
            await calculateDynamicReorder(productId, req.user._id);
        } catch (err) {
            console.error('Auto reorder recalculation error:', err.message);
        }
        // --- End Auto Reorder Recalculation ---

        // Trigger anomaly detection after new forecast is generated (since it might involve new trends/data)
        // Note: anomaly detection is currently based on historical sales data, not forecasts themselves,
        // but the prompt says they want it triggered on forecast generation too as a refresh.
        try {
            const anomalies = await detectAnomaliesForUser(req.user._id);
            if (anomalies.length > 0) {
                await Anomaly.deleteMany({ userId: req.user._id, isResolved: false });
                await Alert.deleteMany({ userId: req.user._id, alertType: 'anomaly' });

                const anomalyDocs = anomalies.map(a => ({ ...a, userId: req.user._id }));
                await Anomaly.insertMany(anomalyDocs);

                const alertDocs = anomalies.map(a => ({
                    productId: a.productId,
                    storeId: a.storeId,
                    alertType: 'anomaly',
                    severity: a.severity,
                    message: a.message,
                    userId: req.user._id
                }));
                await Alert.insertMany(alertDocs);
            }
        } catch (e) {
            console.error('Auto anomaly detection on forecast skip error:', e.message);
        }
    } catch (error) {
        console.error('Forecast generation error:', error.message);
        res.status(500).json({
            message: 'Failed to generate forecast',
            error: error.response?.data?.error || error.message
        });
    }
});

// @route   GET /api/forecasts
// @desc    Get forecast results
// @access  Private
router.get('/', authenticate, async (req, res) => {
    try {
        const { productId, storeId, startDate, endDate } = req.query;
        let query = { userId: req.user._id };

        if (productId) query.productId = productId;
        if (storeId) query.storeId = storeId;

        if (startDate || endDate) {
            query.forecastDate = {};
            if (startDate) query.forecastDate.$gte = new Date(startDate);
            if (endDate) query.forecastDate.$lte = new Date(endDate);
        }

        const forecasts = await Forecast.find(query).sort({ forecastDate: 1 });
        res.json(forecasts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   GET /api/forecasts/comparison
// @desc    Get model comparison data
// @access  Private
router.get('/comparison', authenticate, async (req, res) => {
    try {
        const { productId, storeId } = req.query;

        if (!productId || !storeId) {
            return res.status(400).json({ message: 'productId and storeId are required' });
        }

        // Get latest forecasts for each model
        const forecasts = await Forecast.aggregate([
            {
                $match: {
                    productId,
                    storeId,
                    userId: req.user._id
                }
            },
            {
                $group: {
                    _id: '$modelUsed',
                    latestForecast: { $last: '$$ROOT' }
                }
            }
        ]);

        const comparison = forecasts.map(f => ({
            model: f._id,
            rmse: f.latestForecast.accuracy?.rmse,
            mae: f.latestForecast.accuracy?.mae,
            r2: f.latestForecast.accuracy?.r2,
            mape: f.latestForecast.accuracy?.mape
        }));

        res.json(comparison);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   GET /api/forecasts/insights
// @desc    Get latest demand insights (explainability) per product-store pair
//          Returns ALL pairs — those with explanations show full data, others show placeholders.
// @access  Private
router.get('/insights', authenticate, async (req, res) => {
    try {
        const insights = await Forecast.aggregate([
            { $match: { userId: req.user._id } },
            { $sort: { forecastDate: -1 } },
            {
                $group: {
                    _id: { productId: '$productId', storeId: '$storeId' },
                    productId: { $first: '$productId' },
                    storeId: { $first: '$storeId' },
                    adjustedDemand: { $first: '$adjustedDemand' },
                    predictedDemand: { $first: '$predictedDemand' },
                    seasonName: { $first: '$seasonName' },
                    seasonalMultiplier: { $first: '$seasonalMultiplier' },
                    trendDetected: { $first: '$trendDetected' },
                    explanation: { $first: '$explanation' },
                    keyFactors: { $first: '$keyFactors' },
                    explanationDirection: { $first: '$explanationDirection' },
                    forecastDate: { $first: '$forecastDate' }
                }
            },
            { $sort: { forecastDate: -1 } },
            { $limit: 100 }
        ]);

        res.json(insights);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   POST /api/forecasts/explain-all
// @desc    Bulk-generate explanations for every product-store pair that has forecasts
//          Uses the latest forecast record's seasonal info + current anomalies.
// @access  Private
router.post('/explain-all', authenticate, async (req, res) => {
    const userId = req.user._id;
    let processed = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];

    try {
        // Get all distinct product-store pairs that have forecasts for this user
        const pairs = await Forecast.aggregate([
            { $match: { userId } },
            {
                $group: {
                    _id: { productId: '$productId', storeId: '$storeId' },
                    productId: { $first: '$productId' },
                    storeId: { $first: '$storeId' },
                    adjustedDemand: { $first: '$adjustedDemand' },
                    predictedDemand: { $first: '$predictedDemand' },
                    seasonName: { $first: '$seasonName' },
                    seasonalMultiplier: { $first: '$seasonalMultiplier' },
                    forecastDate: { $first: '$forecastDate' }
                }
            },
            { $sort: { forecastDate: -1 } }
        ]);

        for (const pair of pairs) {
            const { productId, storeId } = pair;
            try {
                // Fetch historical sales data for this product-store
                const salesData = await SalesData.find({
                    userId,
                    productId: { $regex: new RegExp(`^${productId}$`, 'i') },
                    storeId: { $regex: new RegExp(`^${storeId}$`, 'i') }
                }).sort({ date: 1 }).lean();

                if (salesData.length < 5) {
                    skipped++;
                    continue;
                }

                const historicalData = salesData.map(r => ({
                    date: r.date.toISOString().split('T')[0],
                    quantity: r.quantity
                }));

                // Check for active anomaly
                const latestAnomaly = await Anomaly.findOne({
                    userId,
                    productId,
                    storeId,
                    isResolved: false
                }).sort({ createdAt: -1 }).lean();

                const explainPayload = {
                    historical_data: historicalData,
                    seasonal_multiplier: pair.seasonalMultiplier || 1.0,
                    season_name: pair.seasonName || 'Normal Season',
                    has_anomaly: !!latestAnomaly,
                    anomaly_type: latestAnomaly ? latestAnomaly.anomalyType : null,
                    forecast_value: pair.adjustedDemand || pair.predictedDemand || 0
                };

                const explainResp = await axios.post(
                    `${process.env.ML_SERVICE_URL}/api/ml/explain`,
                    explainPayload,
                    { timeout: 15000 }
                );

                const explanation = explainResp.data.explanation || '';
                const keyFactors = explainResp.data.key_factors || [];
                const explanationDirection = explainResp.data.direction || 'stable';

                // Update ALL forecasts for this product-store pair
                await Forecast.updateMany(
                    { userId, productId, storeId },
                    { $set: { explanation, keyFactors, explanationDirection } }
                );

                processed++;
            } catch (pairErr) {
                failed++;
                errors.push(`${productId}/${storeId}: ${pairErr.message}`);
            }
        }

        res.json({
            message: `Explanations generated for ${processed} products. Skipped: ${skipped}. Failed: ${failed}.`,
            processed,
            skipped,
            failed,
            errors: errors.slice(0, 10)
        });
    } catch (error) {
        console.error('Explain-all error:', error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
