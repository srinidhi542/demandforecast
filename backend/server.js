require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const storeRoutes = require('./routes/stores');
const salesRoutes = require('./routes/sales');
const forecastRoutes = require('./routes/forecasts');
const alertRoutes = require('./routes/alerts');
const reportRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admin');
const userSettingsRoutes = require('./routes/userSettings');
const seasonRoutes = require('./routes/seasons');
const anomalyRoutes = require('./routes/anomalies');
const inventoryRoutes = require('./routes/inventory');

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({
    origin: '*', // Allow all origins for development
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/forecasts', forecastRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user-settings', userSettingsRoutes);
app.use('/api/seasons', seasonRoutes);
app.use('/api/anomalies', anomalyRoutes);
app.use('/api/inventory', inventoryRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Demand Forecast API is running' });
});

// Error handler (must be last)
app.use(errorHandler);

const PORT = process.env.BACKEND_PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Backend server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV}`);
});
