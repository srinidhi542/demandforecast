const express = require('express');
const router = express.Router();
const InventoryAnalysis = require('../models/InventoryAnalysis');
const { calculateDynamicReorder, recalculateAllForUser } = require('../services/inventoryService');
const { authenticate } = require('../middleware/auth');

// @route   GET /api/inventory/recommendations
// @desc    Get all smart reorder recommendations
// @access  Private
router.get('/recommendations', authenticate, async (req, res) => {
    try {
        // First, ensure we have recent analyses
        await recalculateAllForUser(req.user._id);

        const recommendations = await InventoryAnalysis.find({ userId: req.user._id })
            .select('-__v')
            .populate({
                path: 'productId',
                model: 'Product',
                localField: 'productId',
                foreignField: 'productId'
            });

        res.json(recommendations);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   POST /api/inventory/recalculate
// @desc    Manually trigger recalculation
// @access  Private
router.post('/recalculate', authenticate, async (req, res) => {
    try {
        await recalculateAllForUser(req.user._id);
        res.json({ message: 'Recalculation complete' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
