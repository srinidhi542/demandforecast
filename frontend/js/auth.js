// Login function
async function login(email, password) {
    try {
        console.log('Attempting login...');
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        console.log('Login successful, saving token...');
        // Save token and user info
        if (!data.token) throw new Error('No token received from server');

        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify({
            id: data._id,
            username: data.username,
            email: data.email,
            role: data.role
        }));

        const alertMsg = 'Login successful! Redirecting... <a href="dashboard.html" style="color: blue; text-decoration: underline;">Click here if not redirected</a>';
        const container = document.getElementById('alert-container');
        if (container) {
            container.innerHTML = `<div class="alert alert-success fade-in">${alertMsg}</div>`;
        } else {
            alert('Login successful! Redirecting...');
        }

        console.log('Redirecting to dashboard...');

        // Immediate redirect with replace to prevent back button issues
        window.location.replace('dashboard.html');
    } catch (error) {
        console.error('Login error:', error);
        showAlert(error.message || 'Login failed', 'danger');
    }
}

// Signup function
async function signup(username, email, password, role) {
    try {
        console.log('Attempting signup...');
        const data = await apiRequest('/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ username, email, password, role })
        });

        console.log('Signup successful, saving token...');
        // Save token and user info
        if (!data.token) throw new Error('No token received from server');

        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify({
            id: data._id,
            username: data.username,
            email: data.email,
            role: data.role
        }));

        showAlert('Account created successfully! Redirecting...', 'success');
        console.log('Redirecting to dashboard...');

        // Immediate redirect
        window.location.href = 'dashboard.html';
    } catch (error) {
        console.error('Signup error:', error);
        showAlert(error.message || 'Signup failed', 'danger');
    }
}
