if (!checkAuth()) throw new Error('Not authenticated');

const user = getUser();
if (user) document.getElementById('username').textContent = user.username;

// File upload handling
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');

    if (e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        updateDropZoneText(fileInput.files[0].name);
    }
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        updateDropZoneText(fileInput.files[0].name);
    }
});

function updateDropZoneText(filename) {
    dropZone.innerHTML = `
        <p style="font-weight: 600; color: var(--primary-color);">📄 ${filename}</p>
        <p style="font-size: 0.875rem; color: var(--text-secondary);">Click to change file</p>
    `;
    dropZone.style.borderColor = 'var(--primary-color)';
    dropZone.style.background = 'var(--bg-secondary)';
}

// Upload form
document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const file = fileInput.files[0];
    if (!file) {
        showAlert('Please select a file', 'warning');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading...';

    try {
        console.log('Starting upload...');
        const response = await fetch(`${API_URL}/sales/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            },
            body: formData
        });

        console.log('Upload status:', response.status);
        const contentType = response.headers.get('content-type');
        let data;

        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            console.error('Non-JSON response:', text);
            throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
        }

        if (!response.ok) throw new Error(data.message);

        showAlert(data.message, 'success');
        fileInput.value = '';
        loadSalesData();
    } catch (error) {
        console.error('Upload Error:', error);
        showAlert(error.message, 'danger');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload';
    }
});

// Manual entry form
document.getElementById('manualForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const salesData = {
        productId: document.getElementById('productId').value,
        storeId: document.getElementById('storeId').value,
        date: document.getElementById('date').value,
        quantity: parseFloat(document.getElementById('quantity').value),
        revenue: parseFloat(document.getElementById('revenue').value) || 0
    };

    try {
        await apiRequest('/sales/manual', {
            method: 'POST',
            body: JSON.stringify(salesData)
        });

        showAlert('Sales record added successfully', 'success');
        e.target.reset();
        loadSalesData();
    } catch (error) {
        showAlert(error.message, 'danger');
    }
});

// Load sales data
async function loadSalesData() {
    try {
        const sales = await apiRequest('/sales?limit=50');

        const tbody = document.getElementById('salesTable');

        if (sales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">No data</td></tr>';
            return;
        }

        tbody.innerHTML = sales.map(s => `
            <tr>
                <td>${s.productId}</td>
                <td>${s.storeId}</td>
                <td>${formatDate(s.date)}</td>
                <td>${formatNumber(s.quantity)}</td>
                <td>$${formatNumber(s.revenue)}</td>
                <td>
                    <button class="btn btn-danger" style="padding: 0.25rem 0.75rem; font-size: 0.75rem;" onclick="deleteSales('${s._id}')">Delete</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Load sales error:', error);
    }
}

// Delete sales record
async function deleteSales(id) {
    if (!confirm('Are you sure you want to delete this record?')) return;

    try {
        await apiRequest(`/sales/${id}`, { method: 'DELETE' });
        showAlert('Record deleted successfully', 'success');
        loadSalesData();
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

// Delete all sales records
async function deleteAllSalesData() {
    if (!confirm('Are you sure you want to delete ALL sales records? This action cannot be undone.')) return;

    try {
        await apiRequest('/sales/all', { method: 'DELETE' });
        showAlert('All records deleted successfully', 'success');
        loadSalesData();
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

loadSalesData();
