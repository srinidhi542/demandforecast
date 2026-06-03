const mongoose = require('mongoose');
require('dotenv').config();

const SeasonSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    seasonName: String,
    multiplier: Number,
    activeMonths: [Number]
}, { strict: false });

const ForecastSchema = new mongoose.Schema({
    seasonName: String,
    seasonalMultiplier: Number,
    adjustedDemand: Number,
    predictedDemand: Number,
    forecastDate: Date
}, { strict: false });

const Season = mongoose.model('Season', SeasonSchema);
const Forecast = mongoose.model('Forecast', ForecastSchema);

async function run() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/demand-forecast-db');
    console.log('Connected to MongoDB');

    // Get all unique userIds in the seasons collection
    const allSeasons = await Season.find({});
    const userIds = [...new Set(allSeasons.map(s => s.userId.toString()))];

    console.log(`Found ${userIds.length} user(s)`);

    for (const userId of userIds) {
        const userObjId = new mongoose.Types.ObjectId(userId);

        // Check if Off Season already exists
        const existingOff = allSeasons.find(s =>
            s.userId.toString() === userId &&
            s.seasonName && s.seasonName.toLowerCase().includes('off season')
        );

        if (!existingOff) {
            // Create Off Season
            await Season.create({
                userId: userObjId,
                seasonName: 'Off Season (Monsoon/Low Demand)',
                multiplier: 0.8,
                activeMonths: [7, 8]
            });
            console.log(`✅ Added Off Season for user ${userId}`);

            // Remove months 7 & 8 from Normal Season
            const normalSeason = allSeasons.find(s =>
                s.userId.toString() === userId &&
                s.seasonName === 'Normal Season'
            );
            if (normalSeason) {
                await Season.updateOne(
                    { _id: normalSeason._id },
                    { $set: { activeMonths: (normalSeason.activeMonths || []).filter(m => m !== 7 && m !== 8) } }
                );
                console.log(`✅ Removed months 7 & 8 from Normal Season for user ${userId}`);
            }
        } else {
            console.log(`ℹ️ Off Season already exists for user ${userId}`);
        }
    }

    // Fix any past forecasts whose month is July or August but labelled as Normal Season
    const forecasts = await Forecast.find({ seasonName: 'Normal Season' });
    let updateCount = 0;
    for (const f of forecasts) {
        if (f.forecastDate) {
            const month = new Date(f.forecastDate).getMonth() + 1;
            if (month === 7 || month === 8) {
                await Forecast.updateOne(
                    { _id: f._id },
                    {
                        $set: {
                            seasonName: 'Off Season (Monsoon/Low Demand)',
                            seasonalMultiplier: 0.8,
                            adjustedDemand: (f.predictedDemand || 0) * 0.8
                        }
                    }
                );
                updateCount++;
            }
        }
    }
    console.log(`✅ Fixed ${updateCount} forecast record(s) to Off Season`);

    await mongoose.disconnect();
    console.log('Done!');
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
