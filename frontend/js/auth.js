/**
 * SmartLearn Centralized Authentication, Form Handlers & Strict Route Guard
 */

// Immediate execution of guard if on a protected portal page
(function instantRouteGuard() {
    const currentPath = window.location.pathname.toLowerCase();
    const token = localStorage.getItem('smartlearn_token');
    const userStr = localStorage.getItem('smartlearn_user');

    const isStudentPage = currentPath.includes('/student/');
    const isInstructorPage = currentPath.includes('/instructor/');
    const isAdminPage = currentPath.includes('/admin/');

    if (isStudentPage || isInstructorPage || isAdminPage) {
        if (!token || !userStr) {
            window.location.replace('../login.html');
            return;
        }

        let user = null;
        try {
            user = JSON.parse(userStr);
        } catch (_) {}

        if (!user || !user.role) {
            window.location.replace('../login.html');
            return;
        }

        const role = user.role.toUpperCase();

        // Enforce strict destination:
        if (isStudentPage && role !== 'STUDENT') {
            console.warn(`Redirecting ${role} away from student dashboard.`);
            if (role === 'ADMIN') {
                window.location.replace('../admin/dashboard.html');
            } else if (role === 'INSTRUCTOR') {
                window.location.replace('../instructor/dashboard.html');
            }
            return;
        }

        if (isInstructorPage && role !== 'INSTRUCTOR' && role !== 'ADMIN') {
            console.warn(`Redirecting ${role} away from instructor portal.`);
            window.location.replace('../student/dashboard.html');
            return;
        }

        if (isAdminPage && role !== 'ADMIN') {
            console.warn(`Redirecting ${role} away from admin portal.`);
            if (role === 'INSTRUCTOR') {
                window.location.replace('../instructor/dashboard.html');
            } else {
                window.location.replace('../student/dashboard.html');
            }
            return;
        }
    }
})();

// Helper function to guard pages inside JS modules
window.guardPage = function(requiredRole) {
    const token = localStorage.getItem('smartlearn_token');
    const userStr = localStorage.getItem('smartlearn_user');
    
    if (!token || !userStr) {
        window.location.replace('../login.html');
        return null;
    }

    let user = null;
    try {
        user = JSON.parse(userStr);
    } catch (_) {
        window.location.replace('../login.html');
        return null;
    }

    if (!user || !user.role) {
        window.location.replace('../login.html');
        return null;
    }

    const currentRole = user.role.toUpperCase();
    const req = requiredRole.toUpperCase();

    if (req === 'ADMIN' && currentRole !== 'ADMIN') {
        if (currentRole === 'INSTRUCTOR') window.location.replace('../instructor/dashboard.html');
        else window.location.replace('../student/dashboard.html');
        return null;
    }

    if (req === 'INSTRUCTOR' && currentRole !== 'INSTRUCTOR' && currentRole !== 'ADMIN') {
        window.location.replace('../student/dashboard.html');
        return null;
    }

    if (req === 'STUDENT' && currentRole !== 'STUDENT') {
        if (currentRole === 'ADMIN') window.location.replace('../admin/dashboard.html');
        else if (currentRole === 'INSTRUCTOR') window.location.replace('../instructor/dashboard.html');
        return null;
    }

    return user;
};

// Handle Back Button cache restore
window.addEventListener('pageshow', (event) => {
    const currentPath = window.location.pathname.toLowerCase();
    const isProtected = currentPath.includes('/student/') || currentPath.includes('/instructor/') || currentPath.includes('/admin/');
    if (isProtected) {
        const token = localStorage.getItem('smartlearn_token');
        if (!token) {
            window.location.replace('../login.html');
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    setupLoginForm();
    setupRegisterForm();
    setupGoogleLogin();
    setupPasswordToggles();
    setupForgotPassword();
    setupUniversalLogout();
    setupMobileSidebarToggle();
});

// --- GOOGLE LOGIN HANDLER ---
function setupGoogleLogin() {
    const googleBtns = document.querySelectorAll('.google-btn, #googleLoginBtn');
    googleBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Connecting to Google...</span>`;

            try {
                if (typeof window.signInWithGooglePopup !== 'function') {
                    throw new Error("Google authentication service is initializing. Please try again.");
                }

                const fbAuthResult = await window.signInWithGooglePopup();
                if (!fbAuthResult || !fbAuthResult.idToken) {
                    throw new Error("No authorization token received from Google.");
                }

                const roleSelect = document.getElementById('regRole');
                const selectedRole = roleSelect ? roleSelect.value.trim() : 'Student';

                if (!window.api || !window.api.googleLogin) {
                    throw new Error("API service is initializing. Please try again.");
                }

                const res = await window.api.googleLogin(fbAuthResult.idToken, selectedRole);

                if (!res || !res.access_token) {
                    throw new Error("Invalid backend authentication response.");
                }

                const userObj = {
                    id: res.id,
                    full_name: res.full_name || fbAuthResult.displayName || 'User',
                    name: res.full_name || fbAuthResult.displayName || 'User',
                    email: res.email || fbAuthResult.email,
                    role: res.role || 'Student'
                };

                localStorage.setItem('smartlearn_token', res.access_token);
                localStorage.setItem('smartlearn_user', JSON.stringify(userObj));
                localStorage.setItem('smartlearn_role', res.role || 'Student');

                showAuthAlert("Google authentication successful! Redirecting...", "success");

                const roleUpper = (res.role || 'STUDENT').toUpperCase();
                setTimeout(() => {
                    if (roleUpper === 'ADMIN') {
                        window.location.replace('admin/dashboard.html');
                    } else if (roleUpper === 'INSTRUCTOR') {
                        window.location.replace('instructor/dashboard.html');
                    } else {
                        window.location.replace('student/dashboard.html');
                    }
                }, 800);
            } catch (err) {
                console.error("Google authentication error:", err);
                showAuthAlert(err.message || "Google Login failed. Please try again.", "error");
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
    });
}

// --- PASSWORD VISIBILITY TOGGLE ---
function setupPasswordToggles() {
    document.querySelectorAll('.toggle-password').forEach(icon => {
        icon.addEventListener('click', () => {
            const input = icon.previousElementSibling;
            if (input && input.tagName === 'INPUT') {
                if (input.type === 'password') {
                    input.type = 'text';
                    icon.classList.remove('fa-eye');
                    icon.classList.add('fa-eye-slash');
                } else {
                    input.type = 'password';
                    icon.classList.remove('fa-eye-slash');
                    icon.classList.add('fa-eye');
                }
            }
        });
    });
}

// --- FORGOT PASSWORD HANDLER ---
function setupForgotPassword() {
    const forgotLinks = document.querySelectorAll('.forgot-link, #forgotPasswordLink');
    forgotLinks.forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('loginEmail');
            const defaultEmail = emailInput ? emailInput.value.trim() : '';
            const email = prompt("Enter your registered email address:", defaultEmail);
            if (!email || !email.trim()) return;
            const newPassword = prompt("Enter your new password (minimum 8 characters):");
            if (!newPassword || !newPassword.trim()) return;
            if (newPassword.trim().length < 8) {
                alert("Password must be at least 8 characters long.");
                return;
            }
            try {
                if (!window.api || !window.api.resetPassword) {
                    throw new Error("Authentication service is initializing. Please try again.");
                }
                const res = await window.api.resetPassword({ email: email.trim(), new_password: newPassword.trim() });
                showAuthAlert(res.message || "Password updated successfully. You can now log in.", "success");
            } catch (err) {
                showAuthAlert(err.message || "Failed to reset password.", "error");
            }
        });
    });
}

// --- LOGIN FORM HANDLER ---
function setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        clearAuthErrors();
        const emailInput = document.getElementById('loginEmail');
        const passwordInput = document.getElementById('loginPassword');
        const submitBtn = document.getElementById('loginSubmitBtn');

        const email = (emailInput ? emailInput.value : '').trim();
        const password = passwordInput ? passwordInput.value : '';

        let isValid = true;
        if (!email) {
            showError('loginEmailError', 'Email address is required.');
            isValid = false;
        } else if (!/\S+@\S+\.\S+/.test(email)) {
            showError('loginEmailError', 'Please enter a valid email address.');
            isValid = false;
        }

        if (!password) {
            showError('loginPasswordError', 'Password is required.');
            isValid = false;
        }

        if (!isValid) return;

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Logging in...';
        }

        try {
            if (!window.api || !window.api.login) {
                throw new Error("Authentication service is initializing. Please try again.");
            }

            const res = await window.api.login({ email, password });
            if (!res || !res.access_token) {
                throw new Error("Invalid response from server. Missing access token.");
            }

            const userObj = {
                id: res.id,
                full_name: res.full_name || res.name || 'User',
                name: res.full_name || res.name || 'User',
                email: res.email || email,
                role: res.role || 'Student'
            };

            localStorage.setItem('smartlearn_token', res.access_token);
            localStorage.setItem('smartlearn_user', JSON.stringify(userObj));
            localStorage.setItem('smartlearn_role', res.role || 'Student');

            const roleUpper = (res.role || 'STUDENT').toUpperCase();
            if (roleUpper === 'ADMIN') {
                window.location.replace('admin/dashboard.html');
            } else if (roleUpper === 'INSTRUCTOR') {
                window.location.replace('instructor/dashboard.html');
            } else {
                window.location.replace('student/dashboard.html');
            }
        } catch (err) {
            console.error("Login failed:", err);
            showAuthAlert(err.message || "Invalid email or password. Please try again.", "error");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Log In';
            }
        }
    });
}

// --- REGISTER FORM HANDLER ---
function setupRegisterForm() {
    const registerForm = document.getElementById('registerForm');
    if (!registerForm) return;

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        clearAuthErrors();
        const nameInput = document.getElementById('regName');
        const emailInput = document.getElementById('regEmail');
        const passwordInput = document.getElementById('regPassword');
        const confirmInput = document.getElementById('regConfirmPassword');
        const roleInput = document.getElementById('regRole');
        const termsInput = document.getElementById('regTerms');
        const submitBtn = document.getElementById('regSubmitBtn');

        const full_name = (nameInput ? nameInput.value : '').trim();
        const email = (emailInput ? emailInput.value : '').trim();
        const password = passwordInput ? passwordInput.value : '';
        const confirmPassword = confirmInput ? confirmInput.value : '';
        const role = (roleInput ? roleInput.value : 'Student').trim();
        const termsAgreed = termsInput ? termsInput.checked : false;

        let isValid = true;

        if (!full_name) {
            showError('regNameError', 'Full name is required.');
            isValid = false;
        }

        if (!email) {
            showError('regEmailError', 'Email address is required.');
            isValid = false;
        } else if (!/\S+@\S+\.\S+/.test(email)) {
            showError('regEmailError', 'Please enter a valid email address.');
            isValid = false;
        }

        if (!password) {
            showError('regPasswordError', 'Password is required.');
            isValid = false;
        } else if (password.length < 8) {
            showError('regPasswordError', 'Password must be at least 8 characters long.');
            isValid = false;
        }

        if (password !== confirmPassword) {
            showError('regConfirmError', 'Passwords do not match.');
            isValid = false;
        }

        if (role.toUpperCase() === 'ADMIN') {
            showError('regRoleError', 'Admin accounts cannot be registered publicly.');
            isValid = false;
        }

        if (!termsAgreed) {
            showError('regTermsError', 'You must agree to the Terms of Service and Privacy Policy.');
            isValid = false;
        }

        if (!isValid) return;

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating account...';
        }

        try {
            if (!window.api || !window.api.register) {
                throw new Error("Registration service is initializing. Please try again.");
            }

            const res = await window.api.register({
                full_name,
                email,
                password,
                role
            });

            if (res && res.access_token) {
                const userObj = {
                    id: res.id,
                    full_name: res.full_name || full_name,
                    email: res.email || email,
                    role: res.role || role
                };
                localStorage.setItem('smartlearn_token', res.access_token);
                localStorage.setItem('smartlearn_user', JSON.stringify(userObj));
                localStorage.setItem('smartlearn_role', res.role || role);

                const roleUpper = (res.role || role).toUpperCase();
                if (roleUpper === 'INSTRUCTOR') {
                    window.location.replace('instructor/dashboard.html');
                } else {
                    window.location.replace('student/dashboard.html');
                }
            } else {
                showAuthAlert("Account created successfully! Please log in.", "success");
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1500);
            }
        } catch (err) {
            console.error("Registration failed:", err);
            showAuthAlert(err.message || "Registration failed. Please try again.", "error");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Create Account';
            }
        }
    });
}

function clearAuthErrors() {
    document.querySelectorAll('.error-text').forEach(el => el.textContent = '');
    const alertBox = document.getElementById('authAlert');
    if (alertBox) {
        alertBox.style.display = 'none';
        alertBox.textContent = '';
        alertBox.className = 'auth-alert';
    }
}

function showError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.style.display = 'block';
    }
}

function showAuthAlert(message, type = 'error') {
    const alertBox = document.getElementById('authAlertBanner') || document.getElementById('authAlert');
    if (alertBox) {
        alertBox.textContent = message;
        alertBox.className = `auth-alert ${type}`;
        alertBox.style.display = 'block';
        alertBox.style.backgroundColor = type === 'error' ? '#fee2e2' : '#dcfce7';
        alertBox.style.color = type === 'error' ? '#991b1b' : '#166534';
        alertBox.style.border = type === 'error' ? '1px solid #fca5a5' : '1px solid #86efac';
    } else {
        alert(message);
    }
}

function setupUniversalLogout() {
    document.querySelectorAll('.logout-btn, #logoutBtn, [data-action="logout"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof firebase !== 'undefined' && firebase.auth) {
                try {
                    firebase.auth().signOut();
                } catch (_) {}
            }
            if (window.api && window.api.logout) {
                window.api.logout();
            } else {
                localStorage.clear();
                sessionStorage.clear();
                window.location.replace('../login.html');
            }
        });
    });
}

function setupMobileSidebarToggle() {
    const toggleBtn = document.querySelector('.mobile-toggle, #menuToggle, #sidebarToggle');
    const sidebar = document.querySelector('.dashboard-sidebar, .app-sidebar');
    const overlay = document.querySelector('.sidebar-overlay');

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            if (overlay) overlay.classList.toggle('active');
        });
    }

    if (overlay && sidebar) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
    }
}
