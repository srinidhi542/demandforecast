const mongoose = require('mongoose');

const salesDataSchema = new mongoose.Schema({
    productId: {
        type: String,
        required: true,
        ref: 'Product'
    },
    storeId: {
        type: String,
        required: true,
        ref: 'Store'
    },
    date: {
        type: Date,
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 0
    },
    revenue: {
        type: Number,
        default: 0,
        min: 0
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

// Indexes for better query performance
salesDataSchema.index({ productId: 1, date: 1 });
salesDataSchema.index({ storeId: 1, date: 1 });
salesDataSchema.index({ date: 1 });

module.exports = mongoose.model('SalesData', salesDataSchema);
