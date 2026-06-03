const mongoose = require('mongoose');
const dotenv = require('dotenv');
const SalesData = require('./models/SalesData');
const User = require('./models/User');

dotenv.config();

async function analyzeRecentSales() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/demand-forecast');

        console.log('--- Analyzing Top 500 Recent Sales ---');
        const sales = await SalesData.find()
            .sort({ date: -1 })
            .limit(500);

        const stats = {};
        for (const s of sales) {
            const uid = s.userId.toString();
            stats[uid] = (stats[uid] || 0) + 1;
        }

        for (const [uid, count] of Object.entries(stats)) {
            const user = await User.findById(uid);
            console.log(`User: ${user ? user.username : 'Unknown'} (${uid}): ${count} records`);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

analyzeRecentSales();
