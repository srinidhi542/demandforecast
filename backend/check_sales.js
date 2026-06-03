const mongoose = require('mongoose');
const dotenv = require('dotenv');
const SalesData = require('./models/SalesData');
const User = require('./models/User');

dotenv.config();

async function checkSales() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/demand-forecast');
        console.log('Connected to DB');

        const total = await SalesData.countDocuments();
        console.log('Total sales records:', total);

        const groupByUser = await SalesData.aggregate([
            { $group: { _id: "$userId", count: { $sum: 1 } } }
        ]);

        for (const group of groupByUser) {
            const user = group._id ? await User.findById(group._id) : null;
            console.log(`User: ${user ? user.username : 'Unknown'} (ID: ${group._id}), Records: ${group.count}`);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSales();
