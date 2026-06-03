const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const User = require('../models/User');
const Product = require('../models/Product');
const SalesData = require('../models/SalesData');
const Forecast = require('../models/Forecast');
const Alert = require('../models/Alert');
const SystemSettings = require('../models/SystemSettings');

// @route   GET /api/admin/summary
// @desc    Get system-wide summary statistics
// @access  Private/Admin
router.get('/summary', authenticate, authorize('admin'), async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const onlineUsers = await User.countDocuments({ isOnline: true });
        const totalProducts = await Product.countDocuments();
        const totalSalesRecords = await SalesData.countDocuments();
        const totalForecasts = await Forecast.countDocuments();
        const activeAlerts = await Alert.countDocuments({ isRead: false });

        // Calculate total sales quantity across all users
        const salesStats = await SalesData.aggregate([
            { $group: { _id: null, totalQty: { $sum: "$quantity" } } }
        ]);

        // Calculate total inventory count
        const inventoryStats = await Product.aggregate([
            { $group: { _id: null, totalStock: { $sum: "$currentStock" } } }
        ]);

        // Calculate total predicted demand across all future forecasts
        const forecastQtyStats = await Forecast.aggregate([
            { $match: { forecastDate: { $gte: new Date() } } },
            { $group: { _id: null, totalPredicted: { $sum: "$predictedDemand" } } }
        ]);

        // Get average forecast accuracy
        const forecastStats = await Forecast.aggregate([
            { $match: { "accuracy.mape": { $exists: true } } },
            { $group: { _id: null, avgMape: { $avg: "$accuracy.mape" } } }
        ]);

        res.json({
            totalUsers,
            onlineUsers,
            totalProducts,
            totalInventory: inventoryStats[0]?.totalStock || 0,
            totalSalesRecords,
            totalSalesQuantity: salesStats[0]?.totalQty || 0,
            totalForecasts,
            totalPredictedDemand: Math.round(forecastQtyStats[0]?.totalPredicted || 0),
            activeAlerts,
            avgAccuracy: forecastStats[0] ? (100 - forecastStats[0].avgMape).toFixed(1) : "0.0"
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   GET /api/admin/users
// @desc    Get all users
// @access  Private/Admin
router.get('/users', authenticate, authorize('admin'), async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   PUT /api/admin/users/:id
// @desc    Update user details (Admin)
// @access  Private/Admin
router.put('/users/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { username, email, role, active } = req.body;
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (username) user.username = username;
        if (email) user.email = email;
        if (role) user.role = role;
        if (active !== undefined) user.active = active;

        await user.save();
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   DELETE /api/admin/users/:id
// @desc    Delete a user
// @access  Private/Admin
router.delete('/users/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Prevent admin from deleting themselves
        if (user._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ message: 'Cannot delete your own admin account' });
        }

        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'User removed successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   GET /api/admin/products
// @desc    Get all products in the system
// @access  Private/Admin
router.get('/products', authenticate, authorize('admin'), async (req, res) => {
    try {
        const products = await Product.find().populate('userId', 'username email').sort({ createdAt: -1 });
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   GET /api/admin/sales
// @desc    Get system-wide sales records
// @access  Private/Admin
router.get('/sales', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { startDate, endDate, userId, limit } = req.query;
        let query = {};

        if (userId && userId !== 'all') {
            query.userId = userId;
        }

        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }

        const sales = await SalesData.find(query)
            .populate('userId', 'username email')
            .sort({ date: -1 })
            .limit(parseInt(limit) || 2000);

        res.json(sales);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   GET /api/admin/alerts
// @desc    Get system-wide alerts
// @access  Private/Admin
router.get('/alerts', authenticate, authorize('admin'), async (req, res) => {
    try {
        const alerts = await Alert.find()
            .populate('userId', 'username')
            .sort({ createdAt: -1 })
            .limit(10);
        res.json(alerts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   GET /api/admin/settings
// @desc    Get system settings
// @access  Private/Admin
router.get('/settings', authenticate, authorize('admin'), async (req, res) => {
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

// @route   PUT /api/admin/settings
// @desc    Update system settings
// @access  Private/Admin
router.put('/settings', authenticate, authorize('admin'), async (req, res) => {
    try {
        let settings = await SystemSettings.findOne();
        if (!settings) {
            settings = await SystemSettings.create(req.body);
        } else {
            Object.assign(settings, req.body);
            await settings.save();
        }
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   PUT /api/admin/alerts/:id/resolve
// @desc    Mark any alert as read (Admin)
// @access  Private/Admin
router.put('/alerts/:id/resolve', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { isRead } = req.body;
        const alert = await Alert.findByIdAndUpdate(
            req.params.id,
            { isRead: isRead !== undefined ? isRead : true },
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

// @route   PUT /api/admin/alerts/resolve-all
// @desc    Mark all system-wide alerts as read
// @access  Private/Admin
router.put('/alerts/resolve-all', authenticate, authorize('admin'), async (req, res) => {
    try {
        await Alert.updateMany({ isRead: false }, { isRead: true });
        res.json({ message: 'All system alerts resolved' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
