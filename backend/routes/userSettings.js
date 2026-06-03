const express = require('express');
const router = express.Router();
const UserSettings = require('../models/UserSettings');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

// @route   GET /api/user-settings
// @desc    Get current user settings
// @access  Private
router.get('/', authenticate, async (req, res) => {
    try {
        let settings = await UserSettings.findOne({ userId: req.user._id });

        // If no settings exist, create default ones
        if (!settings) {
            settings = await UserSettings.create({ userId: req.user._id });
        }

        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   PUT /api/user-settings
// @desc    Update user settings
// @access  Private
router.put('/', authenticate, async (req, res) => {
    try {
        const updateData = {};

        // Build the update object using dot notation for nested fields
        if (req.body.notifications) {
            for (let key in req.body.notifications) {
                updateData[`notifications.${key}`] = req.body.notifications[key];
            }
        }
        if (req.body.dashboard) {
            for (let key in req.body.dashboard) {
                if (key === 'widgets') {
                    for (let wKey in req.body.dashboard.widgets) {
                        updateData[`dashboard.widgets.${wKey}`] = req.body.dashboard.widgets[wKey];
                    }
                } else {
                    updateData[`dashboard.${key}`] = req.body.dashboard[key];
                }
            }
        }
        if (req.body.ui) {
            for (let key in req.body.ui) {
                updateData[`ui.${key}`] = req.body.ui[key];
            }
        }
        if (req.body.dataView) {
            for (let key in req.body.dataView) {
                updateData[`dataView.${key}`] = req.body.dataView[key];
            }
        }

        const settings = await UserSettings.findOneAndUpdate(
            { userId: req.user._id },
            { $set: updateData },
            { new: true, upsert: true, runValidators: true }
        );

        res.json(settings);
    } catch (error) {
        console.error('Settings Update Error:', error);
        res.status(500).json({ message: error.message });
    }
});

// @route   PUT /api/user-settings/profile
// @desc    Update user profile (name)
// @access  Private
router.put('/profile', authenticate, async (req, res) => {
    try {
        const { username } = req.body;
        if (!username || username.trim().length === 0) {
            return res.status(400).json({ message: 'Username is required' });
        }

        // Check if username is already taken by another user
        const existingUser = await User.findOne({
            username: username.trim(),
            _id: { $ne: req.user._id }
        });

        if (existingUser) {
            return res.status(400).json({ message: 'Username already taken' });
        }

        const user = await User.findById(req.user._id);
        user.username = username.trim();

        await user.save();
        res.json({
            _id: user._id,
            username: user.username,
            email: user.email,
            role: user.role
        });
    } catch (error) {
        console.error('Profile Update Error:', error);
        res.status(500).json({ message: error.message });
    }
});

// @route   PUT /api/user-settings/change-password
// @desc    Change user password
// @access  Private
router.put('/change-password', authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user._id);

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        user.password = newPassword;
        await user.save();

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
