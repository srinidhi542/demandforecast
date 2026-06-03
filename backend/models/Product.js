const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    productId: {
        type: String,
        required: true,
        trim: true
    },
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true
    },
    category: {
        type: String,
        required: true,
        trim: true
    },
    type: {
        type: String,
        default: 'Standard',
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    vendor: {
        type: String,
        trim: true
    },
    stockLocation: {
        type: String,
        trim: true
    },
    price: {
        type: Number,
        default: 0,
        min: 0
    },
    cost: {
        type: Number,
        default: 0,
        min: 0
    },
    unit: {
        type: String,
        default: 'units',
        trim: true
    },
    currentStock: {
        type: Number,
        default: 0,
        min: 0
    },
    reorderLevel: {
        type: Number,
        default: 10,
        min: 0
    },
    reorderQuantity: {
        type: Number,
        default: 50,
        min: 0
    },
    leadTime: {
        type: Number,
        default: 5,
        min: 1
    },
    safetyStock: {
        type: Number,
        default: 20,
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

// Compound index to ensure productId is unique per user
productSchema.index({ productId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Product', productSchema);
