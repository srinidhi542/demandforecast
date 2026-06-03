const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

// Generate JWT token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d'
    });
};

// @route   POST /api/auth/signup
// @desc    Register new user
// @access  Public
router.post('/signup', async (req, res) => {
    try {
        let { username, email, password, role } = req.body;

        // Normalize input
        if (email) email = email.trim().toLowerCase();
        if (username) username = username.trim();

        // Check if user exists
        const userExists = await User.findOne({ $or: [{ email }, { username }] });

        if (userExists) {
            return res.status(400).json({
                message: 'User already exists with this email or username'
            });
        }

        // Create user
        const user = await User.create({
            username,
            email,
            password,
            role: role || 'user'
        });

        if (user) {
            res.status(201).json({
                _id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                token: generateToken(user._id)
            });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
    try {
        let { email, password } = req.body;

        // Normalize input
        if (email) email = email.trim().toLowerCase();

        console.log(`Login attempt for: ${email}`);

        // Find user
        const user = await User.findOne({ email });

        if (!user) {
            console.warn(`Login failed: User not found for ${email}`);
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Check if account is active
        if (user.active === false) {
            console.warn(`Login failed: Account revoked for ${email}`);
            return res.status(403).json({ message: 'Your account has been revoked. Please contact an administrator.' });
        }

        console.log(`User found: ${user.username}. Checking password...`);

        // Check password
        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            console.warn(`Login failed: Invalid password for ${email}`);
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        console.log(`Login successful for: ${email}`);

        // Update login status
        user.lastLogin = new Date();
        user.isOnline = true;
        await user.save();

        res.json({
            _id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            token: generateToken(user._id)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (user) {
            user.isOnline = false;
            await user.save();
        }
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', authenticate, async (req, res) => {
    try {
        res.json({
            _id: req.user._id,
            username: req.user.username,
            email: req.user.email,
            role: req.user.role
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
