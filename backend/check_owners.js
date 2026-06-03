require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');
const User = require('./models/User');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const products = await Product.find({}, 'name productId currentStock userId');
    const users = await User.find({}, 'username _id');
    const userMap = {};
    users.forEach(u => userMap[u._id.toString()] = u.username);

    console.log('Product Ownership Check:');
    products.forEach(p => {
        const userIdStr = p.userId ? p.userId.toString() : 'NONE';
        const owner = userMap[userIdStr] || 'NOT_IN_USER_COLLECTION';
        console.log(` - ${p.name} (${p.productId}): stock=${p.currentStock}, owner=${owner} (${userIdStr})`);
    });

    mongoose.disconnect();
}).catch(e => { console.error(e); process.exit(1); });
