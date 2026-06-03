const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const Forecast = require('../models/Forecast');
const SalesData = require('../models/SalesData');
const Product = require('../models/Product');
const Alert = require('../models/Alert');
const { authenticate } = require('../middleware/auth');

// @route   GET /api/reports/forecast/csv
// @desc    Export forecast as CSV
// @access  Private
router.get('/forecast/csv', authenticate, async (req, res) => {
    try {
        const { productId, storeId, startDate, endDate } = req.query;
        let query = { userId: req.user._id };

        if (productId) query.productId = productId;
        if (storeId) query.storeId = storeId;
        if (startDate) query.forecastDate = { $gte: new Date(startDate) };
        if (endDate) query.forecastDate = { ...query.forecastDate, $lte: new Date(endDate) };

        const forecasts = await Forecast.find(query).sort({ forecastDate: 1 });

        // Generate CSV
        let csv = 'Product ID,Store ID,Date,Predicted Demand,Confidence Min,Confidence Max,Model,RMSE,MAE,R²\n';

        forecasts.forEach(f => {
            csv += `${f.productId},${f.storeId},${f.forecastDate.toISOString().split('T')[0]},${f.predictedDemand},${f.confidenceMin},${f.confidenceMax},${f.modelUsed},${f.accuracy?.rmse || ''},${f.accuracy?.mae || ''},${f.accuracy?.r2 || ''}\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=forecast-report.csv');
        res.send(csv);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   GET /api/reports/forecast/pdf
// @desc    Export forecast as PDF
// @access  Private
router.get('/forecast/pdf', authenticate, async (req, res) => {
    try {
        const { productId, storeId } = req.query;
        let query = { userId: req.user._id };

        if (productId) query.productId = productId;
        if (storeId) query.storeId = storeId;

        const forecasts = await Forecast.find(query).sort({ forecastDate: 1 }).limit(30);

        // Create PDF
        const doc = new PDFDocument();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=forecast-report.pdf');

        doc.pipe(res);

        // Title
        doc.fontSize(20).text('Demand Forecast Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
        doc.moveDown(2);

        // Summary
        if (forecasts.length > 0) {
            const latest = forecasts[forecasts.length - 1];
            doc.fontSize(14).text('Forecast Summary', { underline: true });
            doc.moveDown();
            doc.fontSize(10);
            doc.text(`Product ID: ${latest.productId}`);
            doc.text(`Store ID: ${latest.storeId}`);
            doc.text(`Model Used: ${latest.modelUsed}`);
            doc.text(`RMSE: ${latest.accuracy?.rmse?.toFixed(2) || 'N/A'}`);
            doc.text(`MAE: ${latest.accuracy?.mae?.toFixed(2) || 'N/A'}`);
            doc.text(`R²: ${latest.accuracy?.r2?.toFixed(4) || 'N/A'}`);
            doc.moveDown(2);

            // Forecast table
            doc.fontSize(14).text('Forecast Details', { underline: true });
            doc.moveDown();
            doc.fontSize(9);

            forecasts.slice(0, 20).forEach(f => {
                doc.text(`${f.forecastDate.toISOString().split('T')[0]} | Demand: ${f.predictedDemand.toFixed(0)} | Range: ${f.confidenceMin.toFixed(0)} - ${f.confidenceMax.toFixed(0)}`);
            });
        } else {
            doc.text('No forecast data available');
        }

        doc.end();
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   GET /api/reports/inventory/csv
// @desc    Export inventory report as CSV
// @access  Private
router.get('/inventory/csv', authenticate, async (req, res) => {
    try {
        const products = await Product.find({ userId: req.user._id });

        let csv = 'Product ID,Name,Category,Type,Current Stock,Reorder Level,Unit,Price,Vendor,Location,Status\n';

        products.forEach(p => {
            const status = p.currentStock <= p.reorderLevel ? 'Low Stock' :
                (p.currentStock > 100 ? 'Overstock' : 'In Stock');
            csv += `"${p.productId}","${p.name}","${p.category}","${p.type || 'Standard'}",${p.currentStock},${p.reorderLevel},"${p.unit}",${p.price || 0},"${p.vendor || ''}","${p.stockLocation || ''}","${status}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=inventory-report.csv');
        res.send(csv);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   GET /api/reports/summary
// @desc    Get summary statistics
// @access  Private
router.get('/summary', authenticate, async (req, res) => {
    try {
        let totalProducts = await Product.countDocuments({ userId: req.user._id });

        // Fallback: If no products in Product collection, count distinct from SalesData
        if (totalProducts === 0) {
            const distinctProducts = await SalesData.distinct('productId', { userId: req.user._id });
            totalProducts = distinctProducts.length;
        }

        // If still zero, everything should be zero
        if (totalProducts === 0) {
            return res.json({
                totalProducts: 0,
                totalSales: 0,
                predictedDemand: 0,
                forecastAccuracy: "0.0",
                unreadAlerts: 0
            });
        }
        const totalSales = await SalesData.aggregate([
            { $match: { userId: req.user._id } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
        ]);

        // Get recent forecasts (prefer future ones, but fall back to latest available)
        let recentForecasts = await Forecast.find({
            userId: req.user._id,
            forecastDate: { $gte: new Date() }
        }).sort({ forecastDate: 1 }).limit(30);

        if (recentForecasts.length === 0) {
            recentForecasts = await Forecast.find({
                userId: req.user._id
            }).sort({ forecastDate: -1 }).limit(30);
        }

        const predictedDemand = recentForecasts.reduce((sum, f) => sum + f.predictedDemand, 0);

        // Calculate a user-friendly accuracy percentage (100 - MAPE is best, else use R2)
        let accuracyPct = 0;
        if (recentForecasts.length > 0) {
            let totalAcc = 0;
            let validCount = 0;

            recentForecasts.forEach(f => {
                if (f.accuracy) {
                    if (f.accuracy.mape !== undefined) {
                        // MAPE is error percentage, so 100 - MAPE is accuracy
                        totalAcc += Math.max(0, 100 - f.accuracy.mape);
                        validCount++;
                    } else if (f.accuracy.r2 !== undefined) {
                        // R2 is 0..1, so * 100
                        totalAcc += Math.max(0, f.accuracy.r2 * 100);
                        validCount++;
                    }
                }
            });

            if (validCount > 0) {
                accuracyPct = totalAcc / validCount;
            }
        }

        const unreadAlerts = await Alert.countDocuments({
            userId: req.user._id,
            isRead: false
        });

        res.json({
            totalProducts,
            totalSales: totalSales[0]?.total || 0,
            predictedDemand: Math.round(predictedDemand),
            forecastAccuracy: accuracyPct.toFixed(1),
            unreadAlerts
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
