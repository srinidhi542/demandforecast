const Product = require('../models/Product');
const SalesData = require('../models/SalesData');
const Forecast = require('../models/Forecast');
const InventoryAnalysis = require('../models/InventoryAnalysis');
const Alert = require('../models/Alert');

/**
 * Calculates dynamic reorder parameters for a product.
 * @param {string} productId 
 * @param {string} userId 
 */
const calculateDynamicReorder = async (productId, userId) => {
    try {
        const product = await Product.findOne({ productId, userId });
        if (!product) return null;

        // 1. Fetch Forecast Demand (next 30 days) - This is the primary driver
        const latestForecasts = await Forecast.find({
            productId,
            userId,
            forecastDate: { $gte: new Date() }
        }).sort({ forecastDate: 1 }).limit(30);

        const forecastTotal = latestForecasts.reduce((sum, f) => sum + (f.adjustedDemand || f.predictedDemand), 0);
        const forecastDailyAvg = forecastTotal / Math.max(1, latestForecasts.length);

        // 2. Calculate Historical Daily Demand (last 30 days of sales)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const sales = await SalesData.find({
            productId,
            userId,
            date: { $gte: thirtyDaysAgo }
        });

        const totalHistoricalSales = sales.reduce((sum, item) => sum + item.quantity, 0);
        const historicalDailyAvg = totalHistoricalSales / 30;

        // 3. USE THE HIGHER OF BOTH: This protects against stockouts during peaks
        // If history is old/zero, use forecast. If forecast is zero, use history.
        let avgDailyDemand = Math.max(historicalDailyAvg, forecastDailyAvg);

        // If still zero, try any historical average just to get a baseline
        if (avgDailyDemand === 0) {
            const allSales = await SalesData.find({ productId, userId });
            if (allSales.length > 0) {
                const total = allSales.reduce((sum, s) => sum + s.quantity, 0);
                avgDailyDemand = total / Math.max(1, allSales.length);
            }
        }

        // Current parameters
        const currentStock = product.currentStock;
        const leadTime = product.leadTime || 5;
        const safetyStock = product.safetyStock || 20;

        // 4. Formula: Reorder Point = (Average Daily Demand * Lead Time) + Safety Stock
        const reorderPoint = (avgDailyDemand * leadTime) + safetyStock;

        // 5. Formula: Recommended Reorder Quantity = Target Stock - Current Stock
        // Target Stock = (Avg Daily Demand * 30 days) + Safety Stock
        // This ensures we order enough to last a month plus buffer
        const targetStock = (avgDailyDemand * 30) + safetyStock;
        let recommendedQuantity = targetStock - currentStock;
        recommendedQuantity = Math.max(0, Math.ceil(recommendedQuantity));

        // 6. Formula: Days Until Stockout = Current Stock / Average Daily Demand
        const daysUntilStockout = avgDailyDemand > 0 ? (currentStock / avgDailyDemand) : (currentStock > 0 ? 999 : 0);

        // 7. Risk Level Calculation
        let riskLevel = 'Low';
        if (daysUntilStockout <= leadTime) {
            riskLevel = 'High';
        } else if (daysUntilStockout <= (leadTime * 1.5)) {
            riskLevel = 'Medium';
        }

        // Recommendation text
        let recommendation = 'Stock levels are healthy.';
        if (currentStock <= reorderPoint) {
            recommendation = 'Reorder inventory now to avoid stockout.';
        } else if (riskLevel === 'Medium') {
            recommendation = 'Consider preparing a reorder soon.';
        }

        // Save detailed analysis
        const analysis = await InventoryAnalysis.findOneAndUpdate(
            { productId, userId },
            {
                productId,
                currentStock,
                averageDailyDemand: avgDailyDemand,
                forecastDemand: forecastTotal,
                leadTime,
                safetyStock,
                reorderPoint,
                recommendedReorderQuantity: recommendedQuantity,
                daysUntilStockout,
                riskLevel,
                recommendation,
                userId
            },
            { upsert: true, new: true }
        );

        // 8. Trigger Alert if stock is critical
        if (currentStock <= reorderPoint && riskLevel === 'High') {
            await Alert.findOneAndUpdate(
                { userId, productId, alertType: 'reorder_recommendation', isRead: false },
                {
                    userId,
                    productId,
                    alertType: 'reorder_recommendation',
                    severity: 'high',
                    message: `CRITICAL REORDER: ${product.name} needs ${recommendedQuantity} units. Stockout expected in ${Math.round(daysUntilStockout)} days.`,
                    isRead: false
                },
                { upsert: true }
            );
        }

        return analysis;
    } catch (error) {
        console.error(`Error calculating reorder for ${productId}:`, error.message);
        return null;
    }
};

/**
 * Recalculates reorder parameters for ALL products for a user.
 */
const recalculateAllForUser = async (userId) => {
    const products = await Product.find({ userId });
    const promises = products.map(p => calculateDynamicReorder(p.productId, userId));
    return Promise.all(promises);
};

module.exports = {
    calculateDynamicReorder,
    recalculateAllForUser
};
