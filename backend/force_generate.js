require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');
const Alert = require('./models/Alert');
const SystemSettings = require('./models/SystemSettings');
const User = require('./models/User');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    // 1. Get the admin/main user
    const user = await User.findOne({ username: 'qwertyuiop' }); // Assuming this is the active user from earlier logs
    if (!user) {
        console.log('User qwertyuiop not found');
        process.exit(0);
    }

    // 2. Get settings
    const settings = await SystemSettings.findOne();
    const threshold = settings.offerThreshold;
    console.log('Using Threshold from DB:', threshold);

    // 3. Clear existing for this user
    await Alert.deleteMany({
        userId: user._id,
        isRead: false,
        alertType: 'offer_recommendation'
    });
    console.log('Cleared existing unread system alerts for user:', user.username);

    // 4. Generate fresh ones
    const products = await Product.find({ userId: user._id });
    const alertsToCreate = [];

    for (const p of products) {
        if (p.currentStock > threshold) {
            alertsToCreate.push({
                productId: p.productId,
                storeId: 'default',
                alertType: 'offer_recommendation',
                severity: 'medium',
                message: `📦 ${p.name} has ${p.currentStock} ${p.unit} in stock — this strictly exceeds your set threshold of ${threshold} units.`,
                recommendations: `🏷️ Consider running a promotional offer or discount campaign to move excess inventory and boost sales.`,
                currentStock: p.currentStock,
                userId: user._id
            });
            console.log(`Matching: ${p.name} (${p.currentStock} > ${threshold})`);
        }
    }

    if (alertsToCreate.length > 0) {
        await Alert.insertMany(alertsToCreate);
        console.log(`Created ${alertsToCreate.length} fresh alerts.`);
    } else {
        console.log('No products exceeded the threshold.');
    }

    mongoose.disconnect();
}).catch(e => { console.error(e); process.exit(1); });
