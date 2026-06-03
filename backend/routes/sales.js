const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const fs = require('fs');
const SalesData = require('../models/SalesData');
const { authenticate } = require('../middleware/auth');
const axios = require('axios'); // For calling ML service
const Forecast = require('../models/Forecast'); // For saving predictions
const Season = require('../models/Season'); // For seasonal adjustments
const { detectAnomaliesForUser } = require('./anomalies'); // Anomaly detection
const Anomaly = require('../models/Anomaly');
const Alert = require('../models/Alert');
const { recalculateAllForUser } = require('../services/inventoryService');

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// @route   POST /api/sales/upload
// @desc    Upload sales data from CSV/Excel
// @access  Private
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
    try {
        console.log('Upload request received');
        console.log('File:', req.file);
        console.log('Body:', req.body);

        if (!req.file) {
            console.error('No file in request');
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const filePath = req.file.path;
        const fileExtension = req.file.originalname.split('.').pop().toLowerCase();
        console.log(`Processing ${fileExtension} file: ${filePath}`);

        const salesRecords = [];

        if (fileExtension === 'csv') {
            // Parse CSV
            await new Promise((resolve, reject) => {
                const results = [];
                fs.createReadStream(filePath)
                    .pipe(csv())
                    .on('data', (row) => results.push(row))
                    .on('end', () => {
                        console.log(`CSV parsed. ${results.length} rows found.`);
                        try {
                            const parsedRecords = [];

                            results.forEach((row, index) => {
                                // Robust key normalization
                                const rowMap = new Map();
                                const rawRow = {}; // For debugging

                                Object.keys(row).forEach(key => {
                                    const value = row[key]?.toString().trim() || '';
                                    const cleanKey = key.replace(/^\uFEFF/, '').trim();

                                    // Normalized search key: lowercase, alphanumeric only
                                    const searchKey = cleanKey.toLowerCase().replace(/[^a-z0-9]/g, '');

                                    if (searchKey) {
                                        rowMap.set(searchKey, value);
                                    }
                                    rawRow[cleanKey] = value;
                                });

                                // Log first row for debugging
                                if (index === 0) {
                                    console.log('First row keys:', Object.keys(rawRow));
                                    console.log('Normalized keys available:', Array.from(rowMap.keys()));
                                }

                                const getValue = (possibleKeys) => {
                                    for (const key of possibleKeys) {
                                        const searchKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
                                        if (rowMap.has(searchKey)) return rowMap.get(searchKey);
                                    }
                                    return null;
                                };

                                // extraction
                                let productId = getValue(['productId', 'product_id', 'product id', 'id', 'sku', 'product_code', 'code']);
                                let storeId = getValue(['storeId', 'store_id', 'store id', 'store', 'store_name', 'location']);
                                let dateVal = getValue(['date', 'date_time', 'time', 'day', 'timestamp']);
                                let qtyVal = getValue(['quantity', 'qty', 'units_sold', 'units', 'sales_qty', 'count', 'sold']);
                                let revVal = getValue(['revenue', 'price', 'unit_price', 'amount', 'total_price', 'sales_amount', 'total']); // price might be unit price

                                // If units_sold and unit_price exist, calculate revenue
                                if (!revVal) {
                                    const units = parseFloat(qtyVal);
                                    const price = parseFloat(getValue(['unit_price', 'price', 'cost', 'rate']));
                                    if (!isNaN(units) && !isNaN(price)) {
                                        revVal = units * price;
                                    }
                                }

                                // If this is a product list (has SKU but no date), generate synthetic history
                                if (productId && !dateVal) {
                                    console.log(`Generating synthetic history for verified product: ${productId}`);
                                    const today = new Date();
                                    // Generate 30 days of history
                                    for (let i = 0; i < 30; i++) {
                                        const d = new Date(today);
                                        d.setDate(d.getDate() - i);

                                        // Random quantity between 10 and 50
                                        const qty = Math.floor(Math.random() * 40) + 10;
                                        // Random revenue or based on price
                                        const basePrice = parseFloat(revVal) || 100;

                                        parsedRecords.push({
                                            productId: String(productId),
                                            storeId: String(storeId || 'STORE001'),
                                            date: d,
                                            quantity: qty,
                                            revenue: basePrice * qty, // Approximation
                                            userId: req.user._id
                                        });
                                    }
                                }
                                // Normal sales record
                                else if (productId && dateVal) {
                                    // Default storeId if missing
                                    if (!storeId) storeId = 'STORE001';

                                    parsedRecords.push({
                                        productId: String(productId),
                                        storeId: String(storeId),
                                        date: new Date(dateVal),
                                        quantity: parseFloat(qtyVal) || 0,
                                        revenue: parseFloat(revVal) || 0,
                                        userId: req.user._id
                                    });
                                } else {
                                    if (index < 5) console.warn('Skipping invalid row (missing ID or Date):', JSON.stringify(rawRow));
                                }
                            });

                            // Add all parsed records to main salesRecords array
                            salesRecords.push(...parsedRecords);
                            resolve();
                        } catch (err) {
                            reject(err);
                        }
                    })
                    .on('error', (err) => {
                        console.error('CSV Stream Error:', err);
                        reject(err);
                    });
            });
        } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
            // Parse Excel
            console.log('Reading Excel file...');
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(worksheet);
            console.log(`Excel parsed. ${data.length} rows found.`);

            data.forEach(row => {
                salesRecords.push({
                    productId: row.productId || row.product_id || row['Product ID'],
                    storeId: row.storeId || row.store_id || row['Store ID'],
                    date: new Date(row.date || row.Date),
                    quantity: parseFloat(row.quantity || row.Quantity),
                    revenue: parseFloat(row.revenue || row.Revenue || 0),
                    userId: req.user._id
                });
            });
        } else {
            console.error('Invalid file extension:', fileExtension);
            fs.unlinkSync(filePath);
            return res.status(400).json({ message: 'Invalid file format. Use CSV or Excel' });
        }

        console.log(`Inserting ${salesRecords.length} records...`);
        // Insert sales data
        const inserted = await SalesData.insertMany(salesRecords);
        console.log('Insertion successful');

        // --- Auto-Forecast Trigger ---
        try {
            const uniqueProducts = [...new Set(salesRecords.map(s => s.productId))].slice(0, 5);
            console.log(`Attempting auto-forecast for products: ${uniqueProducts.join(', ')}`);

            let forecastGenerated = false;

            for (const pid of uniqueProducts) {
                if (!pid) continue;

                // Find store for this product
                const record = salesRecords.find(s => s.productId === pid);
                const storeId = record ? record.storeId : 'STORE001';

                const history = await SalesData.find({ productId: pid, storeId, userId: req.user._id }).sort({ date: 1 });

                // Need at least 10 points
                if (history.length >= 10) {
                    const historicalData = history.map(h => ({ date: h.date.toISOString().split('T')[0], quantity: h.quantity }));

                    console.log(`Calling ML Service for ${pid} (History: ${history.length} records)...`);
                    const mlUrl = process.env.ML_SERVICE_URL || 'http://localhost:5001';
                    const mlRes = await axios.post(`${mlUrl}/api/ml/predict`, {
                        historical_data: historicalData,
                        forecast_days: 30,
                        model: 'auto'
                    });

                    const { predictions, best_model, accuracy, seasonality, trend } = mlRes.data;

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

                    const forecasts = predictions.map(p => {
                        const predDate = new Date(p.date);
                        const predMonth = predDate.getMonth() + 1;
                        let matchingSeason = userSeasons.find(s => s.activeMonths && s.activeMonths.includes(predMonth));
                        if (!matchingSeason) matchingSeason = { seasonName: 'Normal Season', multiplier: 1.0 };

                        return {
                            productId: pid,
                            storeId,
                            forecastDate: predDate,
                            predictedDemand: p.predicted_demand,
                            seasonName: matchingSeason.seasonName,
                            seasonalMultiplier: matchingSeason.multiplier,
                            adjustedDemand: p.predicted_demand * matchingSeason.multiplier,
                            confidenceMin: p.confidence_min,
                            confidenceMax: p.confidence_max,
                            modelUsed: best_model,
                            accuracy,
                            seasonalityDetected: seasonality.detected,
                            trendDetected: trend.direction,
                            userId: req.user._id
                        };
                    });

                    // Clear old forecasts for this product to avoid duplicates
                    await Forecast.deleteMany({ productId: pid, storeId, userId: req.user._id });
                    await Forecast.insertMany(forecasts);
                    console.log(`Forecast generated for ${pid}: Predicted ${Math.round(predictions[0].predicted_demand)}`);
                    forecastGenerated = true;
                    break; // Stop after one successful forecast to keep response fast
                } else {
                    console.warn(`Insufficient history for ${pid} (${history.length} records). Skipping.`);
                }
            }

            if (!forecastGenerated) {
                console.warn('Auto-forecast skipped: No uploaded products had sufficient history (10+ records).');
            }

        } catch (err) {
            console.error('Auto-forecast error:', err.message);
            // Non-critical failure, continue to return success for upload
        }
        // --- End Auto-Forecast ---

        // --- Auto Anomaly Detection ---
        try {
            console.log('Running anomaly detection after upload...');
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
                console.log(`Anomaly detection: ${anomalies.length} anomalies found and saved.`);
            } else {
                console.log('Anomaly detection: No anomalies detected.');
            }
        } catch (err) {
            console.error('Auto anomaly detection error:', err.message);
        }
        // --- End Auto Anomaly Detection ---

        // --- Auto Reorder Recalculation ---
        try {
            console.log('Recalculating inventory reorder recommendations...');
            await recalculateAllForUser(req.user._id);
        } catch (err) {
            console.error('Auto reorder recalculation error:', err.message);
        }
        // --- End Auto Reorder Recalculation ---

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        res.status(201).json({
            message: `Successfully uploaded ${inserted.length} sales records`,
            count: inserted.length
        });
    } catch (error) {
        console.error('Upload Process Error:', error);
        // Clean up file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ message: error.message });
    }
});

// @route   GET /api/sales/seasonal-analysis
// @desc    Detect seasonal demand multipliers based on historical sales data
// @access  Private
router.get('/seasonal-analysis', authenticate, async (req, res) => {
    try {
        const { productId, storeId } = req.query;
        let query = { userId: req.user._id };
        if (productId) query.productId = productId;
        if (storeId) query.storeId = storeId;

        const sales = await SalesData.find(query).sort({ date: 1 });
        if (sales.length === 0) {
            return res.json({ message: 'No data available to detect seasonality', multipliers: {} });
        }

        // Aggregate by month (1-12)
        const monthlyTotals = {};
        const monthlyCounts = {};
        let totalSales = 0;
        let totalMonthsCount = 0;

        sales.forEach(s => {
            const date = new Date(s.date);
            const month = date.getMonth() + 1;
            const yearMonth = `${date.getFullYear()}-${month}`;

            if (!monthlyTotals[month]) {
                monthlyTotals[month] = 0;
            }
            monthlyTotals[month] += s.quantity;

            if (!monthlyCounts[yearMonth]) {
                monthlyCounts[yearMonth] = 0;
            }
            monthlyCounts[yearMonth] += 1; // Just track unique months if needed
            totalSales += s.quantity;
        });

        // Get unique year-months to find true averages per month across multiple years
        const monthYearCounts = {};
        Object.keys(monthlyCounts).forEach(ym => {
            const [_, m] = ym.split('-');
            if (!monthYearCounts[m]) monthYearCounts[m] = 0;
            monthYearCounts[m]++;
        });

        // Calculate average demand per month
        const monthlyAverages = {};
        let sumAverages = 0;
        let nonZeroMonths = 0;

        for (let i = 1; i <= 12; i++) {
            if (monthlyTotals[i]) {
                const avg = monthlyTotals[i] / monthYearCounts[i];
                monthlyAverages[i] = avg;
                sumAverages += avg;
                nonZeroMonths++;
            } else {
                monthlyAverages[i] = 0;
            }
        }

        const overallAverage = sumAverages / nonZeroMonths;
        const multipliers = {};

        // Calculate Multiplier (Seasonality Index = Monthly Avg / Overall Avg)
        for (let i = 1; i <= 12; i++) {
            if (monthlyAverages[i] > 0 && overallAverage > 0) {
                multipliers[i] = parseFloat((monthlyAverages[i] / overallAverage).toFixed(2));
            } else {
                multipliers[i] = 1.0; // Default if no data
            }
        }

        // Determine detected seasons based on multipliers
        const detectedSeasons = [];
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

        for (let i = 1; i <= 12; i++) {
            detectedSeasons.push({
                monthNumber: i,
                monthName: monthNames[i - 1],
                multiplier: multipliers[i],
                averageSales: parseFloat((monthlyAverages[i] || 0).toFixed(2)),
                status: multipliers[i] > 1.1 ? 'High Demand' : (multipliers[i] < 0.9 ? 'Low Demand' : 'Normal')
            });
        }

        res.json({
            overallAverage: parseFloat(overallAverage.toFixed(2)),
            detectedSeasons
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   POST /api/sales/manual
// @desc    Add sales data manually
// @access  Private
router.post('/manual', authenticate, async (req, res) => {
    try {
        const salesData = await SalesData.create({
            ...req.body,
            userId: req.user._id
        });

        // Trigger reorder recalculation
        await recalculateAllForUser(req.user._id);

        res.status(201).json(salesData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   GET /api/sales
// @desc    Get sales data with filters
// @access  Private
router.get('/', authenticate, async (req, res) => {
    try {
        const { productId, storeId, startDate, endDate, limit = 100 } = req.query;
        let query = { userId: req.user._id };

        if (productId) query.productId = productId;
        if (storeId) query.storeId = storeId;

        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }

        const sales = await SalesData.find(query)
            .sort({ date: -1 })
            .limit(parseInt(limit));

        res.json(sales);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   DELETE /api/sales/all
// @desc    Delete all sales records for current user
// @access  Private
router.delete('/all', authenticate, async (req, res) => {
    try {
        await SalesData.deleteMany({ userId: req.user._id });
        // Optional: Also clear all forecasts since data is gone
        await Forecast.deleteMany({ userId: req.user._id });

        res.json({ message: 'All sales records and forecasts deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   DELETE /api/sales/:id
// @desc    Delete sales record
// @access  Private
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const salesData = await SalesData.findOneAndDelete({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!salesData) {
            return res.status(404).json({ message: 'Sales record not found' });
        }

        // Optional: If no more sales data exists for this product, clear its forecasts
        const remaining = await SalesData.countDocuments({
            productId: salesData.productId,
            userId: req.user._id
        });

        if (remaining === 0) {
            await Forecast.deleteMany({
                productId: salesData.productId,
                userId: req.user._id
            });
        }

        res.json({ message: 'Sales record deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
