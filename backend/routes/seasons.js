const express = require('express');
const router = express.Router();
const Season = require('../models/Season');
const { authenticate } = require('../middleware/auth');

const DEFAULT_SEASONS = [
    { seasonName: 'Summer', multiplier: 1.1, activeMonths: [4, 5, 6] },
    { seasonName: 'Festival Season (Diwali)', multiplier: 1.3, activeMonths: [10, 11] },
    { seasonName: 'Christmas Season', multiplier: 1.2, activeMonths: [12] },
    { seasonName: 'Off Season (Monsoon/Low Demand)', multiplier: 0.8, activeMonths: [7, 8] },
    { seasonName: 'Normal Season', multiplier: 1.0, activeMonths: [1, 2, 3, 9] }
];

// Initialize default seasons for a user if they don't exist
async function initializeSeasons(userId) {
    const existing = await Season.countDocuments({ userId });
    if (existing === 0) {
        const defaultWithUser = DEFAULT_SEASONS.map(s => ({ ...s, userId }));
        await Season.insertMany(defaultWithUser);
    }
}

// @route   GET /api/seasons
// @desc    Get all seasonal settings for current user
// @access  Private
router.get('/', authenticate, async (req, res) => {
    try {
        await initializeSeasons(req.user._id);
        const seasons = await Season.find({ userId: req.user._id });
        res.json(seasons);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   PUT /api/seasons/:id
// @desc    Update a seasonal setting
// @access  Private
router.put('/:id', authenticate, async (req, res) => {
    try {
        const { seasonName, multiplier, activeMonths } = req.body;
        const season = await Season.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { seasonName, multiplier: parseFloat(multiplier), activeMonths },
            { new: true }
        );

        if (!season) {
            return res.status(404).json({ message: 'Season not found' });
        }

        res.json(season);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
