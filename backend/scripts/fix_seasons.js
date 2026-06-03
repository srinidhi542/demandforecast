const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/demand-forecast-db');
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const col = db.collection('seasons');

    // Fix Summer - should only be months 4, 5, 6
    const r1 = await col.updateOne(
        { userId: new mongoose.Types.ObjectId('69aa9341c18a1e791c81cbde'), seasonName: 'Summer' },
        { $set: { activeMonths: [4, 5, 6] } }
    );
    console.log('Summer fix:', r1.modifiedCount, 'docs modified');

    // Fix Normal Season - should only be months 1, 2, 3, 9
    const r2 = await col.updateOne(
        { userId: new mongoose.Types.ObjectId('69aa9341c18a1e791c81cbde'), seasonName: 'Normal Season' },
        { $set: { activeMonths: [1, 2, 3, 9] } }
    );
    console.log('Normal Season fix:', r2.modifiedCount, 'docs modified');

    // Print all seasons
    const all = await col.find({ userId: new mongoose.Types.ObjectId('69aa9341c18a1e791c81cbde') }).toArray();
    all.forEach(s => {
        console.log(`  ${s.seasonName} | x${s.multiplier} | [${(s.activeMonths || []).join(', ')}]`);
    });

    await mongoose.disconnect();
    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
