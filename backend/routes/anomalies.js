const express = require('express');
const router = express.Router();
const Anomaly = require('../models/Anomaly');
const Alert = require('../models/Alert');
const SalesData = require('../models/SalesData');
const { authenticate } = require('../middleware/auth');

/**
 * Core anomaly detection logic.
 * Compares the latest sales quantity for each product against
 * historical mean ± 2×stdDev.
 * Returns array of detected anomaly objects (not yet saved).
 */
async function detectAnomaliesForUser(userId) {
    // Get all distinct product-store pairs for this user
    const pairs = await SalesData.aggregate([
        { $match: { userId: new (require('mongoose').Types.ObjectId)(userId) } },
        { $group: { _id: { productId: '$productId', storeId: '$storeId' } } }
    ]);

    const detected = [];

    for (const pair of pairs) {
        const { productId, storeId } = pair._id;

        // Fetch all historical records sorted by date
        const records = await SalesData.find({ userId, productId, storeId })
            .sort({ date: 1 })
            .lean();

        if (records.length < 5) continue; // Need minimum data

        const quantities = records.map(r => r.quantity);

        // Calculate mean
        const mean = quantities.reduce((a, b) => a + b, 0) / quantities.length;

        // Calculate standard deviation
        const variance = quantities.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / quantities.length;
        const stdDev = Math.sqrt(variance);

        // Latest record is the "current" data point
        const latest = records[records.length - 1];
        const current = latest.quantity;

        const upperBound = mean + 2 * stdDev;
        const lowerBound = mean - 2 * stdDev;

        let anomalyType = null;
        let severity = 'medium';

        if (current > upperBound) {
            anomalyType = 'demand_spike';
            // Extra-severe if > 3 stddev
            const sigmas = stdDev > 0 ? (current - mean) / stdDev : 0;
            severity = sigmas > 3 ? 'high' : 'medium';
        } else if (current < lowerBound) {
            anomalyType = 'demand_drop';
            const sigmas = stdDev > 0 ? (mean - current) / stdDev : 0;
            severity = sigmas > 3 ? 'high' : 'medium';
        }

        if (anomalyType) {
            detected.push({
                productId,
                storeId,
                currentSales: current,
                mean: parseFloat(mean.toFixed(2)),
                stdDev: parseFloat(stdDev.toFixed(2)),
                anomalyType,
                severity,
                message: anomalyType === 'demand_spike'
                    ? `⚠ Demand spike detected for ${productId} — current sales (${current}) significantly above average (${mean.toFixed(0)})`
                    : `⚠ Demand drop detected for ${productId} — current sales (${current}) significantly below average (${mean.toFixed(0)})`
            });
        }
    }

    return detected;
}

module.exports.detectAnomaliesForUser = detectAnomaliesForUser;

// @route   POST /api/anomalies/detect
// @desc    Run anomaly detection across all products and persist results
// @access  Private
router.post('/detect', authenticate, async (req, res) => {
    try {
        const userId = req.user._id;
        const detected = await detectAnomaliesForUser(userId);

        // Remove previous unresolved anomalies then insert fresh ones
        await Anomaly.deleteMany({ userId, isResolved: false });

        const newAnomalies = [];
        const newAlerts = [];

        for (const anomaly of detected) {
            const doc = await Anomaly.create({ ...anomaly, userId });
            newAnomalies.push(doc);

            // Also create an Alert entry so it shows in the alerts panel
            newAlerts.push({
                productId: anomaly.productId,
                storeId: anomaly.storeId,
                alertType: 'anomaly',
                severity: anomaly.severity,
                message: anomaly.message,
                userId
            });
        }

        if (newAlerts.length > 0) {
            // Remove stale anomaly alerts first
            await Alert.deleteMany({ userId, alertType: 'anomaly' });
            await Alert.insertMany(newAlerts);
        }

        res.json({
            detected: newAnomalies.length,
            anomalies: newAnomalies
        });
    } catch (error) {
        console.error('Anomaly detection error:', error);
        res.status(500).json({ message: error.message });
    }
});

// @route   GET /api/anomalies
// @desc    Get all current anomalies for user
// @access  Private
router.get('/', authenticate, async (req, res) => {
    try {
        const anomalies = await Anomaly.find({ userId: req.user._id, isResolved: false })
            .sort({ createdAt: -1 })
            .limit(50);
        res.json(anomalies);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   PUT /api/anomalies/:id/resolve
// @desc    Mark an anomaly as resolved
// @access  Private
router.put('/:id/resolve', authenticate, async (req, res) => {
    try {
        const anomaly = await Anomaly.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { isResolved: true },
            { new: true }
        );
        if (!anomaly) return res.status(404).json({ message: 'Anomaly not found' });
        res.json(anomaly);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
module.exports.detectAnomaliesForUser = detectAnomaliesForUser;
