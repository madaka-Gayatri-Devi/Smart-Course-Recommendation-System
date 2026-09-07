document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // PASSWORD VISIBILITY TOGGLE
    // ----------------------------------------------------
    document.querySelectorAll('.toggle-password').forEach(icon => {
        icon.addEventListener('click', function() {
            const input = this.previousElementSibling;
            if (input.getAttribute('type') === 'password') {
                input.setAttribute('type', 'text');
                this.classList.remove('fa-eye');
                this.classList.add('fa-eye-slash');
            } else {
                input.setAttribute('type', 'password');
                this.classList.remove('fa-eye-slash');
                this.classList.add('fa-eye');
            }
        });
    });

    // Helper to show/hide inline errors
    function showError(elementId, message) {
        const errorEl = document.getElementById(elementId);
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }
    }

    function hideError(elementId) {
        const errorEl = document.getElementById(elementId);
        if (errorEl) {
            errorEl.style.display = 'none';
        }
    }

    // ----------------------------------------------------
    // INITIAL HEALTH CHECK
    // ----------------------------------------------------
    if (window.api && typeof window.api.checkHealth === 'function') {
        window.api.checkHealth().then(isHealthy => {
            if (!isHealthy) {
                if (document.getElementById('loginForm')) {
                    showError('loginEmailError', 'Backend unavailable. Please make sure the SmartLearn server is running.');
                }
                if (document.getElementById('registerForm')) {
                    showError('regEmailError', 'Backend unavailable. Please make sure the SmartLearn server is running.');
                }
            }
        });
    }

    // ----------------------------------------------------
    // LOGIN FORM VALIDATION & FLOW
    // ----------------------------------------------------
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            let isValid = true;
            
            const emailInput = document.getElementById('loginEmail');
            const passwordInput = document.getElementById('loginPassword');
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            
            // Email Validation
            if (!emailInput.value.trim()) {
                showError('loginEmailError', 'Please enter your email address.');
                isValid = false;
            } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value)) {
                showError('loginEmailError', 'Please enter a valid email address.');
                isValid = false;
            } else {
                hideError('loginEmailError');
            }
            
            // Password Validation
            if (!passwordInput.value) {
                showError('loginPasswordError', 'Please enter your password.');
                isValid = false;
            } else {
                hideError('loginPasswordError');
            }
            
            if (isValid) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Logging in...';
                try {
                    const data = await window.api.login({
                        email: emailInput.value,
                        password: passwordInput.value
                    });
                    window.api.setToken(data.access_token);
                    window.location.href = 'student/dashboard.html';
                } catch (error) {
                    showError('loginEmailError', error.message);
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Login';
                }
            }
        });
    }

    // ----------------------------------------------------
    // REGISTER FORM VALIDATION & FLOW
    // ----------------------------------------------------
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            let isValid = true;
            
            const nameInput = document.getElementById('regName');
            const emailInput = document.getElementById('regEmail');
            const passwordInput = document.getElementById('regPassword');
            const confirmInput = document.getElementById('regConfirmPassword');
            const termsInput = document.getElementById('regTerms');
            const submitBtn = registerForm.querySelector('button[type="submit"]');
            
            // Name Validation
            if (!nameInput.value.trim()) {
                showError('regNameError', 'Please enter your full name.');
                isValid = false;
            } else {
                hideError('regNameError');
            }
            
            // Email Validation
            if (!emailInput.value.trim()) {
                showError('regEmailError', 'Please enter your email address.');
                isValid = false;
            } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value)) {
                showError('regEmailError', 'Please enter a valid email address.');
                isValid = false;
            } else {
                hideError('regEmailError');
            }
            
            // Password Validation
            if (!passwordInput.value) {
                showError('regPasswordError', 'Please enter a password.');
                isValid = false;
            } else if (passwordInput.value.length < 8) {
                showError('regPasswordError', 'Password must be at least 8 characters.');
                isValid = false;
            } else {
                hideError('regPasswordError');
            }
            
            // Confirm Password
            if (passwordInput.value !== confirmInput.value) {
                showError('regConfirmError', 'Passwords do not match.');
                isValid = false;
            } else {
                hideError('regConfirmError');
            }
            
            // Terms Validation
            if (!termsInput.checked) {
                showError('regTermsError', 'Please accept the Terms and Privacy Policy.');
                isValid = false;
            } else {
                hideError('regTermsError');
            }
            
            if (isValid) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Creating Account...';
                try {
                    const data = await window.api.register({
                        full_name: nameInput.value,
                        email: emailInput.value,
                        password: passwordInput.value,
                        role: 'Student'
                    });
                    window.api.setToken(data.access_token);
                    window.location.href = 'profile-setup.html';
                } catch (error) {
                    showError('regEmailError', error.message);
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Create Account';
                }
            }
        });
    }
});
