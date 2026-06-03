const mongoose = require('mongoose');
const Forecast = require('./models/Forecast');
const SalesData = require('./models/SalesData');
require('dotenv').config();

const check = async () => {
    try {
        await mongoose.connect('mongodb://localhost:27017/demand-forecast-db');
        console.log('Connected to MongoDB');

        const totalForecasts = await Forecast.countDocuments();
        console.log(`Total Forecasts in DB: ${totalForecasts}`);

        if (totalForecasts > 0) {
            const latest = await Forecast.findOne().sort({ createdAt: -1 });
            console.log('Latest Forecast Entry:', JSON.stringify(latest, null, 2));

            const futureForecasts = await Forecast.countDocuments({
                forecastDate: { $gte: new Date() }
            });
            console.log(`Forecasts with date >= now: ${futureForecasts}`);

            const firstFuture = await Forecast.findOne({ forecastDate: { $gte: new Date() } });
            if (firstFuture) {
                console.log('First Future Forecast:', JSON.stringify(firstFuture, null, 2));
            }
        }

        const stats = await SalesData.aggregate([
            { $group: { _id: "$productId", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);
        console.log('Top Products by Sales History Count:', stats);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

check();
