// Check authentication
if (!checkAuth()) {
    throw new Error('Not authenticated');
}

// Display username
const user = getUser();
if (user) {
    document.getElementById('username').textContent = user.username;
}

// File upload handling
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
let selectedFile = null;

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--primary-color)';
    dropZone.style.background = 'var(--bg-secondary)';
});

dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = 'var(--border-color)';
    dropZone.style.background = 'transparent';
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--border-color)';

    if (e.dataTransfer.files.length > 0) {
        selectedFile = e.dataTransfer.files[0];
        updateDropZone(selectedFile.name);
    }
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        selectedFile = fileInput.files[0];
        updateDropZone(selectedFile.name);
    }
});

function updateDropZone(filename) {
    dropZone.innerHTML = `
        <p style="font-size: 2rem; margin-bottom: 0.5rem;">📄</p>
        <p style="font-weight: 600; color: var(--primary-color);">${filename}</p>
        <p style="color: var(--text-secondary); font-size: 0.875rem;">Click to change file</p>
    `;
    dropZone.style.borderColor = 'var(--primary-color)';
    dropZone.style.background = 'var(--bg-secondary)';
    uploadBtn.disabled = false;
    uploadBtn.classList.remove('btn-secondary');
    uploadBtn.classList.add('btn-primary');
}

// Upload CSV
uploadBtn.addEventListener('click', async () => {
    if (!selectedFile) {
        showAlert('Please select a file first', 'warning');
        return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Uploading...';

        const token = getToken();
        const response = await fetch('http://localhost:5000/api/products/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Upload failed');
        }

        showAlert(data.message, 'success');
        loadProducts();

        // Reset upload zone
        selectedFile = null;
        dropZone.innerHTML = `
            <p style="font-size: 3rem; margin-bottom: 1rem;">📁</p>
            <p style="font-weight: 600; margin-bottom: 0.5rem;">Drag & Drop CSV file here</p>
            <p style="color: var(--text-secondary);">or click to browse</p>
        `;
        dropZone.style.borderColor = 'var(--border-color)';
        dropZone.style.background = 'transparent';
        uploadBtn.disabled = true;
        uploadBtn.classList.remove('btn-primary');
        uploadBtn.classList.add('btn-secondary');
        uploadBtn.textContent = '📤 Upload Products';
        fileInput.value = '';

    } catch (error) {
        showAlert(error.message, 'danger');
        uploadBtn.disabled = false;
        uploadBtn.textContent = '📤 Upload Products';
    }
});

// Manual Product Form
document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const productData = {
        productId: document.getElementById('productId').value,
        name: document.getElementById('name').value,
        category: document.getElementById('category').value,
        type: document.getElementById('type').value,
        description: document.getElementById('description').value,
        vendor: document.getElementById('vendor').value,
        stockLocation: document.getElementById('stockLocation').value,
        currentStock: parseInt(document.getElementById('currentStock').value),
        price: parseFloat(document.getElementById('price').value),
        unit: document.getElementById('unit').value,
        reorderLevel: parseInt(document.getElementById('reorderLevel').value),
        reorderQuantity: parseInt(document.getElementById('reorderQuantity').value)
    };

    try {
        const result = await apiRequest('/products', {
            method: 'POST',
            body: JSON.stringify(productData)
        });

        showAlert(`Product "${result.name}" added successfully!`, 'success');
        document.getElementById('productForm').reset();
        loadProducts();

    } catch (error) {
        showAlert(error.message, 'danger');
    }
});

// Load Products
async function loadProducts() {
    try {
        const search = document.getElementById('searchInput').value;
        const category = document.getElementById('categoryFilter').value;

        let url = '/products?';
        if (search) url += `search=${encodeURIComponent(search)}&`;
        if (category) url += `category=${encodeURIComponent(category)}`;

        const products = await apiRequest(url);
        renderProducts(products);

    } catch (error) {
        console.error('Load products error:', error);
        document.getElementById('productsTable').innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                    Failed to load products. ${error.message}
                </td>
            </tr>
        `;
    }
}

// Render Products Table
function renderProducts(products) {
    const tbody = document.getElementById('productsTable');

    if (products.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                    No products found. Add your first product above!
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = products.map(p => {
        const isLowStock = p.currentStock <= p.reorderLevel;
        const statusBadge = isLowStock
            ? '<span class="badge badge-danger">Low Stock</span>'
            : '<span class="badge badge-success">In Stock</span>';

        return `
            <tr>
                <td><strong>${p.productId}</strong></td>
                <td>${p.name}</td>
                <td><span class="badge badge-info">${p.category}</span></td>
                <td style="font-weight: 600; color: ${isLowStock ? 'var(--danger-color)' : 'var(--success-color)'};">
                    ${formatNumber(p.currentStock)} ${p.unit}
                </td>
                <td>$${p.price?.toFixed(2) || '0.00'}</td>
                <td>${p.vendor || '-'}</td>
                <td>${p.stockLocation || '-'}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" 
                            onclick="editProduct('${p._id}')">Edit</button>
                    <button class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" 
                            onclick="deleteProduct('${p._id}')">Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Edit Product (placeholder)
async function editProduct(id) {
    showAlert('Edit functionality coming soon!', 'info');
}

// Delete Product
async function deleteProduct(id) {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
        await apiRequest(`/products/${id}`, { method: 'DELETE' });
        showAlert('Product deleted successfully', 'success');
        loadProducts();
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

// Search and Filter
document.getElementById('searchInput').addEventListener('input', debounce(loadProducts, 300));
document.getElementById('categoryFilter').addEventListener('change', loadProducts);

// Debounce utility
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Initial load
loadProducts();
