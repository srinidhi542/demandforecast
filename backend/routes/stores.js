const express = require('express');
const router = express.Router();
const Store = require('../models/Store');
const { authenticate, authorize } = require('../middleware/auth');

// @route   GET /api/stores
// @desc    Get all stores
// @access  Private
router.get('/', authenticate, async (req, res) => {
    try {
        const { region } = req.query;
        let query = { userId: req.user._id };

        if (region) {
            query.region = region;
        }

        const stores = await Store.find(query).sort({ createdAt: -1 });
        res.json(stores);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   POST /api/stores
// @desc    Create new store
// @access  Private
router.post('/', authenticate, async (req, res) => {
    try {
        const store = await Store.create({
            ...req.body,
            userId: req.user._id
        });

        res.status(201).json(store);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   PUT /api/stores/:id
// @desc    Update store
// @access  Private
router.put('/:id', authenticate, async (req, res) => {
    try {
        const store = await Store.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!store) {
            return res.status(404).json({ message: 'Store not found' });
        }

        Object.assign(store, req.body);
        await store.save();

        res.json(store);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   DELETE /api/stores/:id
// @desc    Delete store
// @access  Private (Admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const store = await Store.findOneAndDelete({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!store) {
            return res.status(404).json({ message: 'Store not found' });
        }

        res.json({ message: 'Store deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
