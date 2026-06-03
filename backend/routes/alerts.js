const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');
const Product = require('../models/Product');
const Forecast = require('../models/Forecast');
const SystemSettings = require('../models/SystemSettings');
const { authenticate } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: Specific named routes MUST come before parameterised routes
// (/:id/read) so Express does not swallow them as :id values.
// ─────────────────────────────────────────────────────────────────────────────

// @route   GET /api/alerts/system-settings
// @desc    Get system settings (including offerThreshold)
// @access  Private
router.get('/system-settings', authenticate, async (req, res) => {
    try {
        let settings = await SystemSettings.findOne();
        if (!settings) {
            settings = await SystemSettings.create({});
        }
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   PUT /api/alerts/system-settings
// @desc    Update system settings (including offerThreshold)
// @access  Private
router.put('/system-settings', authenticate, async (req, res) => {
    try {
        const allowedFields = [
            'lowStockThreshold',
            'overstockThreshold',
            'reorderQuantityThreshold',
            'anomalyThreshold',
            'offerThreshold'
        ];
        const updateData = {};
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                updateData[field] = Number(req.body[field]);
            }
        });

        const settings = await SystemSettings.findOneAndUpdate(
            {},
            { $set: updateData },
            { new: true, upsert: true }
        );
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   POST /api/alerts/generate
// @desc    Generate inventory alerts based on stock levels and forecasts
// @access  Private
router.post('/generate', authenticate, async (req, res) => {
    try {
        // Load system settings (with safe defaults)
        let settings = await SystemSettings.findOne();
        if (!settings) {
            settings = {
                lowStockThreshold: 15,
                overstockThreshold: 150,
                reorderQuantityThreshold: 50,
                anomalyThreshold: 3,
                offerThreshold: 200
            };
        }

        const offerThreshold = (settings.offerThreshold != null) ? Number(settings.offerThreshold) : 200;
        console.log(`[Alerts] [VER_SYNC_V3] Regenerating alerts. Using offerThreshold = ${offerThreshold}`);

        // ─────────────────────────────────────────────────────────────────────────────
        // CLEANUP: Remove OLD unread system alerts so we always have the latest 
        // calculations and threshold values in the messages.
        // ─────────────────────────────────────────────────────────────────────────────
        await Alert.deleteMany({
            userId: req.user._id,
            isRead: false,
            alertType: { $in: ['low_stock', 'overstock', 'reorder', 'offer_recommendation'] }
        });

        const products = await Product.find({ userId: req.user._id });
        const alerts = [];

        for (const product of products) {
            const productId = product.productId;

            // ── 1. Low Stock ──────────────────────────────────────────────────
            if (product.currentStock <= product.reorderLevel) {
                const severity = product.currentStock === 0 ? 'high'
                    : product.currentStock < product.reorderLevel * (settings.lowStockThreshold / 100) ? 'medium' : 'low';

                alerts.push({
                    productId,
                    storeId: 'default',
                    alertType: 'low_stock',
                    severity,
                    message: `Low stock alert: ${product.name} has only ${product.currentStock} ${product.unit} remaining`,
                    recommendations: `Reorder ${product.reorderQuantity} ${product.unit} immediately`,
                    currentStock: product.currentStock,
                    suggestedReorderQty: product.reorderQuantity,
                    suggestedReorderDate: new Date(),
                    userId: req.user._id
                });
            }

            // ── 2. Overstock (forecast-based) ──────────────────────────────
            const recentForecasts = await Forecast.find({
                productId,
                userId: req.user._id,
                forecastDate: { $gte: new Date() }
            }).limit(30);

            if (recentForecasts.length > 0) {
                const avgDemand = recentForecasts.reduce((s, f) => s + (f.adjustedDemand || f.predictedDemand), 0) / recentForecasts.length;
                const daysOfStock = product.currentStock / (avgDemand || 1);

                if (daysOfStock > settings.overstockThreshold) {
                    alerts.push({
                        productId,
                        storeId: 'default',
                        alertType: 'overstock',
                        severity: 'medium',
                        message: `Overstock alert: ${product.name} has ${daysOfStock.toFixed(0)} days of stock`,
                        recommendations: `Consider reducing orders or running promotions`,
                        currentStock: product.currentStock,
                        userId: req.user._id
                    });
                }
            }

            // ── 3. Reorder threshold (quantity-based) ─────────────────────
            if (product.currentStock <= settings.reorderQuantityThreshold) {
                // Prevent duplicate if already added as low_stock in this run
                const alreadyLowStock = alerts.find(a => a.productId === productId && a.alertType === 'low_stock');

                if (!alreadyLowStock) {
                    alerts.push({
                        productId,
                        storeId: 'default',
                        alertType: 'reorder',
                        severity: 'low',
                        message: `Global Reorder Trigger: ${product.name} has reached ${product.currentStock} units (Threshold: ${settings.reorderQuantityThreshold})`,
                        recommendations: `Plan to reorder ${product.reorderQuantity} ${product.unit}`,
                        currentStock: product.currentStock,
                        suggestedReorderQty: product.reorderQuantity,
                        suggestedReorderDate: new Date(),
                        userId: req.user._id
                    });
                }
            }

            // ── 4. Offer Recommendation (direct stock > offerThreshold) ──
            if (product.currentStock > offerThreshold) {
                alerts.push({
                    productId,
                    storeId: 'default',
                    alertType: 'offer_recommendation',
                    severity: 'medium',
                    message: `📦 ${product.name} has ${product.currentStock} ${product.unit} in stock — this strictly exceeds your set threshold of ${offerThreshold} units.`,
                    recommendations: `🏷️ Consider running a promotional offer or discount campaign to move excess inventory and boost sales.`,
                    currentStock: product.currentStock,
                    userId: req.user._id
                });
                console.log(`[Alerts] ✅ Offer recommended for ${product.name} (${product.currentStock} > ${offerThreshold})`);
            }
        }

        // Insert all new alerts
        if (alerts.length > 0) {
            await Alert.insertMany(alerts);
        }

        console.log(`[Alerts] Generated ${alerts.length} new alerts`);
        res.status(201).json({
            message: `Generated ${alerts.length} alerts`,
            count: alerts.length
        });
    } catch (error) {
        console.error('[Alerts] Error generating alerts:', error);
        res.status(500).json({ message: error.message });
    }
});

// @route   GET /api/alerts
// @desc    Get alerts with filters
// @access  Private
router.get('/', authenticate, async (req, res) => {
    try {
        const { alertType, severity, isRead } = req.query;
        let query = { userId: req.user._id };

        if (alertType) query.alertType = alertType;
        if (severity) query.severity = severity;
        if (isRead !== undefined) query.isRead = isRead === 'true';

        const alerts = await Alert.find(query).sort({ createdAt: -1 });
        res.json(alerts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   PUT /api/alerts/:id/read
// @desc    Mark alert as read
// @access  Private
// NOTE: This MUST come after all named routes (e.g. /system-settings)
router.put('/:id/read', authenticate, async (req, res) => {
    try {
        const alert = await Alert.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { isRead: true },
            { new: true }
        );

        if (!alert) {
            return res.status(404).json({ message: 'Alert not found' });
        }

        res.json(alert);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
