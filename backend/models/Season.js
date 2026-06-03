const mongoose = require('mongoose');

const seasonSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    seasonName: {
        type: String,
        required: true
    },
    multiplier: {
        type: Number,
        required: true,
        default: 1.0
    },
    activeMonths: [{
        type: Number // 1-12
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Season', seasonSchema);
