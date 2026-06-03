const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Alert = require('../models/Alert');
const Forecast = require('../models/Forecast');
const SalesData = require('../models/SalesData');
const { authenticate, authorize } = require('../middleware/auth');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');

const upload = multer({ dest: 'uploads/' });

// @route   GET /api/products
// @desc    Get all products
// @access  Private
router.get('/', authenticate, async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = { userId: req.user._id };

        if (category) {
            query.category = category;
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { productId: { $regex: search, $options: 'i' } }
            ];
        }

        const products = await Product.find(query).sort({ createdAt: -1 });
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   POST /api/products/upload
// @desc    Upload products from CSV
// @access  Private
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        console.log('=== CSV UPLOAD STARTED ===');
        console.log('File received:', req.file.originalname);

        const results = [];
        fs.createReadStream(req.file.path)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', async () => {
                console.log(`Parsed ${results.length} rows from CSV`);

                // Log the column names from first row
                if (results.length > 0) {
                    console.log('CSV Columns found:', Object.keys(results[0]));
                    console.log('First row data:', JSON.stringify(results[0]));
                }

                let count = 0;
                let alerts = 0;
                let skipped = 0;

                for (const row of results) {
                    try {
                        const rowMap = new Map();
                        const normalizedRow = {}; // keep for logging

                        // Build a lookup map: lowercase alphanumeric key -> value
                        for (const key of Object.keys(row)) {
                            const value = row[key]?.toString().trim() || '';
                            const cleanKey = key.replace(/^\uFEFF/, '').trim();
                            normalizedRow[cleanKey] = value;

                            // Create normalized key: lowercase, remove non-alphanumeric
                            const searchKey = cleanKey.toLowerCase().replace(/[^a-z0-9]/g, '');
                            if (searchKey) {
                                rowMap.set(searchKey, value);
                            }
                        }

                        // Debug logging for the first row only
                        if (count === 0 && skipped === 0) {
                            console.log('Processing first row. Search keys available:', Array.from(rowMap.keys()));
                        }

                        // Helper to find value using flexible keys
                        const getValue = (possibleKeys) => {
                            for (const key of possibleKeys) {
                                // Normalize the search key too
                                const searchKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
                                if (rowMap.has(searchKey)) {
                                    return rowMap.get(searchKey);
                                }
                            }
                            return null;
                        };

                        const productIdValue = getValue(['productId', 'productid', 'Product ID', 'ProductID', 'product_id', 'id', 'ID', 'sku', 'SKU', 'code']);
                        const nameValue = getValue(['name', 'productName', 'Product Name', 'productname', 'title', 'Title', 'description', 'Description']);
                        const categoryValue = getValue(['category', 'productCategory', 'Product Category', 'type', 'Type', 'grp', 'Group']);
                        const stockValue = getValue(['stock', 'currentStock', 'quant', 'quantity', 'Quantity', 'qty', 'units', 'inventory', 'count', 'currentstock']);
                        const priceValue = getValue(['price', 'unitPrice', 'cost', 'Cost', 'rate', 'Rate', 'mrp', 'MRP']);
                        const vendorValue = getValue(['vendor', 'supplier', 'Supplier', 'brand', 'Brand', 'manuf', 'manufacturer']);
                        const locationValue = getValue(['location', 'Location', 'warehouse', 'store', 'shelf', 'bin', 'stockLocation', 'stocklocation']);

                        // Skip if no product ID found
                        if (!productIdValue) {
                            skipped++;
                            continue;
                        }

                        const productData = {
                            productId: productIdValue,
                            name: nameValue || 'Unknown Product',
                            category: categoryValue || 'General',
                            type: getValue(['Type', 'type', 'product_type']) || 'Standard',
                            description: getValue(['Description', 'description', 'desc', 'details']),
                            vendor: vendorValue,
                            stockLocation: locationValue,
                            unit: getValue(['Unit', 'unit', 'uom']) || 'units',
                            currentStock: parseInt(stockValue) || 0,
                            price: parseFloat(priceValue) || 0,
                            cost: parseFloat(getValue(['Cost', 'cost', 'Total Cost'])) || 0,
                            userId: req.user._id
                        };

                        const product = await Product.findOneAndUpdate(
                            { productId: productData.productId, userId: req.user._id },
                            productData,
                            { upsert: true, new: true, setDefaultsOnInsert: true }
                        );

                        // Check for low stock alert
                        if (product.currentStock <= product.reorderLevel) {
                            await Alert.create({
                                userId: req.user._id,
                                productId: product.productId,
                                storeId: 'Warehouse',
                                alertType: 'low_stock',
                                severity: 'high',
                                message: `Low stock alert: ${product.name} (${product.currentStock} remaining)`,
                                isRead: false
                            });
                            alerts++;
                        }

                        // Check for overstock alert (> 100 units)
                        if (product.currentStock > 100) {
                            await Alert.create({
                                userId: req.user._id,
                                productId: product.productId,
                                storeId: 'Warehouse',
                                alertType: 'overstock',
                                severity: 'medium',
                                message: `Overstock alert: ${product.name} has ${product.currentStock} units (exceeds 100)`,
                                isRead: false
                            });
                            alerts++;
                        }

                        count++;
                    } catch (err) {
                        console.error('Product processing error:', err.message);
                        console.error('Full error:', err);
                        skipped++;
                    }
                }

                console.log(`=== CSV UPLOAD COMPLETE: ${count} processed, ${skipped} skipped, ${alerts} alerts ===`);

                fs.unlinkSync(req.file.path);

                if (count === 0 && results.length > 0) {
                    // Products were found but none processed - likely column mapping issue
                    const columns = Object.keys(results[0] || {});
                    res.json({
                        message: `No products processed. Found ${results.length} rows but couldn't map columns. Your CSV columns: ${columns.join(', ')}. Expected: productId (or id/sku), name, category, stock, price, vendor, location`,
                        count: 0,
                        alerts: 0,
                        columnsFound: columns
                    });
                } else {
                    res.json({
                        message: `Processed ${count} products successfully. Generated ${alerts} alerts.`,
                        count,
                        alerts
                    });
                }
            });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   POST /api/products
// @desc    Create new product
// @access  Private
router.post('/', authenticate, async (req, res) => {
    try {
        const product = await Product.create({
            ...req.body,
            userId: req.user._id
        });

        // Check for low stock alert
        if (product.currentStock <= product.reorderLevel) {
            await Alert.create({
                userId: req.user._id,
                productId: product.productId,
                storeId: 'Warehouse',
                alertType: 'low_stock',
                severity: 'high',
                message: `Low stock alert: ${product.name} (${product.currentStock} remaining)`,
                isRead: false
            });
        }

        // Check for overstock alert (> 100 units)
        if (product.currentStock > 100) {
            await Alert.create({
                userId: req.user._id,
                productId: product.productId,
                storeId: 'Warehouse',
                alertType: 'overstock',
                severity: 'medium',
                message: `Overstock alert: ${product.name} has ${product.currentStock} units (exceeds 100)`,
                isRead: false
            });
        }

        res.status(201).json(product);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   PUT /api/products/:id
// @desc    Update product
// @access  Private
router.put('/:id', authenticate, async (req, res) => {
    try {
        const product = await Product.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        Object.assign(product, req.body);
        await product.save();

        res.json(product);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   DELETE /api/products/:id
// @desc    Delete product
// @access  Private (Admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const product = await Product.findOneAndDelete({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Cascading deletion of associated data
        await Forecast.deleteMany({ productId: product.productId, userId: req.user._id });
        await Alert.deleteMany({ productId: product.productId, userId: req.user._id });
        await SalesData.deleteMany({ productId: product.productId, userId: req.user._id });

        res.json({ message: 'Product deleted successfully and associated data cleared' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
