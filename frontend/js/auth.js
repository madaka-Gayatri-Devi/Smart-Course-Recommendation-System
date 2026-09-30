/**
 * SmartLearn Centralized Authentication, Form Handlers & Strict Route Guard
 */

// Immediate execution of guard if on a protected portal page
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

        // Enforce strict role-based destination (do not log out):
        if (isStudentPage && role !== 'STUDENT') {
            console.warn(`Redirecting ${role} away from student dashboard.`);
            const msg = `Friendly Security Alert: Access Denied! A ${user.role || role} account cannot view Student portal pages.`;
            sessionStorage.setItem('smartlearn_access_denied_msg', msg);
            const redirectUrl = role === 'ADMIN' ? '../admin/dashboard.html' : '../instructor/dashboard.html';
            window.location.replace(`${redirectUrl}?access_denied=${encodeURIComponent(msg)}`);
            return;
        }

        if (isInstructorPage && role !== 'INSTRUCTOR') {
            console.warn(`Redirecting ${role} away from instructor portal.`);
            const msg = `Friendly Security Alert: Access Denied! An ${user.role || role} account cannot view Instructor portal pages.`;
            sessionStorage.setItem('smartlearn_access_denied_msg', msg);
            const redirectUrl = role === 'ADMIN' ? '../admin/dashboard.html' : '../student/dashboard.html';
            window.location.replace(`${redirectUrl}?access_denied=${encodeURIComponent(msg)}`);
            return;
        }

        if (isAdminPage && role !== 'ADMIN') {
            console.warn(`Redirecting ${role} away from admin portal.`);
            const msg = `Friendly Security Alert: Access Denied! A ${user.role || role} account cannot view Admin portal pages.`;
            sessionStorage.setItem('smartlearn_access_denied_msg', msg);
            const redirectUrl = role === 'INSTRUCTOR' ? '../instructor/dashboard.html' : '../student/dashboard.html';
            window.location.replace(`${redirectUrl}?access_denied=${encodeURIComponent(msg)}`);
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
        const msg = `Friendly Security Alert: Access Denied! A ${user.role || currentRole} account cannot view Admin portal pages.`;
        sessionStorage.setItem('smartlearn_access_denied_msg', msg);
        const target = currentRole === 'INSTRUCTOR' ? '../instructor/dashboard.html' : '../student/dashboard.html';
        window.location.replace(`${target}?access_denied=${encodeURIComponent(msg)}`);
        return null;
    }

    if (req === 'INSTRUCTOR' && currentRole !== 'INSTRUCTOR') {
        const msg = `Friendly Security Alert: Access Denied! An ${user.role || currentRole} account cannot view Instructor portal pages.`;
        sessionStorage.setItem('smartlearn_access_denied_msg', msg);
        const target = currentRole === 'ADMIN' ? '../admin/dashboard.html' : '../student/dashboard.html';
        window.location.replace(`${target}?access_denied=${encodeURIComponent(msg)}`);
        return null;
    }

    if (req === 'STUDENT' && currentRole !== 'STUDENT') {
        const msg = `Friendly Security Alert: Access Denied! A ${user.role || currentRole} account cannot view Student portal pages.`;
        sessionStorage.setItem('smartlearn_access_denied_msg', msg);
        const target = currentRole === 'ADMIN' ? '../admin/dashboard.html' : '../instructor/dashboard.html';
        window.location.replace(`${target}?access_denied=${encodeURIComponent(msg)}`);
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

// Asynchronous Backend Token & Role Verification
async function verifyBackendSession() {
    const currentPath = window.location.pathname.toLowerCase();
    const isProtected = currentPath.includes('/student/') || currentPath.includes('/instructor/') || currentPath.includes('/admin/');
    if (!isProtected) return;

    const token = localStorage.getItem('smartlearn_token');
    if (!token) {
        window.location.replace('../login.html');
        return;
    }

    try {
        if (!window.api || typeof window.api.getMe !== 'function') return;
        const verifiedUser = await window.api.getMe();
        if (verifiedUser && verifiedUser.role) {
            localStorage.setItem('smartlearn_user', JSON.stringify(verifiedUser));
            localStorage.setItem('smartlearn_role', verifiedUser.role);

            const role = (verifiedUser.role || '').toUpperCase();
            const isStudentPage = currentPath.includes('/student/');
            const isInstructorPage = currentPath.includes('/instructor/');
            const isAdminPage = currentPath.includes('/admin/');

            if (isStudentPage && role !== 'STUDENT') {
                console.warn(`Backend verified role [${role}] is unauthorized for student portal. Safely redirecting without logout...`);
                const msg = `Friendly Security Alert: Access Denied! A ${verifiedUser.role || role} account cannot view Student portal pages.`;
                sessionStorage.setItem('smartlearn_access_denied_msg', msg);
                const target = role === 'ADMIN' ? '../admin/dashboard.html' : '../instructor/dashboard.html';
                window.location.replace(`${target}?access_denied=${encodeURIComponent(msg)}`);
            } else if (isInstructorPage && role !== 'INSTRUCTOR') {
                console.warn(`Backend verified role [${role}] is unauthorized for instructor portal. Safely redirecting without logout...`);
                const msg = `Friendly Security Alert: Access Denied! An ${verifiedUser.role || role} account cannot view Instructor portal pages.`;
                sessionStorage.setItem('smartlearn_access_denied_msg', msg);
                const target = role === 'ADMIN' ? '../admin/dashboard.html' : '../student/dashboard.html';
                window.location.replace(`${target}?access_denied=${encodeURIComponent(msg)}`);
            } else if (isAdminPage && role !== 'ADMIN') {
                console.warn(`Backend verified role [${role}] is unauthorized for admin portal. Safely redirecting without logout...`);
                const msg = `Friendly Security Alert: Access Denied! A ${verifiedUser.role || role} account cannot view Admin portal pages.`;
                sessionStorage.setItem('smartlearn_access_denied_msg', msg);
                const target = role === 'INSTRUCTOR' ? '../instructor/dashboard.html' : '../student/dashboard.html';
                window.location.replace(`${target}?access_denied=${encodeURIComponent(msg)}`);
            }
        }
    } catch (err) {
        console.error("Backend session verification error notice:", err);
        // ONLY clear session & redirect to login if token is genuinely invalid/expired (401)
        if (err.message && (err.message.includes('401') || err.message.includes('expired') || err.message.includes('Not authenticated') || err.message.includes('Missing authentication token') || err.message.includes('Could not validate credentials'))) {
            localStorage.removeItem('smartlearn_token');
            localStorage.removeItem('smartlearn_user');
            localStorage.removeItem('smartlearn_role');
            window.location.replace('../login.html');
        }
    }
}

function safeEscapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function checkAccessDeniedNotice() {
    let deniedMsg = sessionStorage.getItem('smartlearn_access_denied_msg');
    
    // Fallback: check URL parameters if sessionStorage is unavailable or cleared
    const urlParams = new URLSearchParams(window.location.search);
    if (!deniedMsg && urlParams.get('access_denied')) {
        deniedMsg = urlParams.get('access_denied');
    }

    if (urlParams.get('access_denied')) {
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
    }

    if (!deniedMsg) return;
    
    sessionStorage.removeItem('smartlearn_access_denied_msg');

    const renderNotice = () => {
        if (document.getElementById('accessDeniedAlertBanner')) return;

        const noticeDiv = document.createElement('div');
        noticeDiv.id = 'accessDeniedAlertBanner';
        noticeDiv.className = 'access-denied-banner';
        noticeDiv.style.cssText = `
            background: #FEF2F2 !important;
            border: 1px solid #FCA5A5 !important;
            color: #991B1B !important;
            padding: 1rem 1.25rem !important;
            border-radius: 12px !important;
            margin: 1.25rem 2rem 0.5rem 2rem !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            box-shadow: 0 4px 14px rgba(239, 68, 68, 0.15) !important;
            font-weight: 600 !important;
            font-size: 0.95rem !important;
            animation: fadeIn 0.3s ease !important;
            z-index: 99999 !important;
            position: relative !important;
        `;
        noticeDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="background: #EF4444; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <i class="fa-solid fa-shield-halved" style="font-size: 1rem;"></i>
                </div>
                <div>
                    <strong style="color: #7F1D1D; display: block; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Friendly Security Alert</strong>
                    <span style="color: #991B1B;">${safeEscapeHtml(deniedMsg)}</span>
                </div>
            </div>
            <button type="button" onclick="this.parentElement.remove()" style="background: none; border: none; font-size: 1.25rem; color: #991B1B; cursor: pointer; padding: 4px 8px; line-height: 1; border-radius: 4px;" title="Dismiss">&times;</button>
        `;

        const mainEl = document.querySelector('.dashboard-main') || document.querySelector('.app-main') || document.querySelector('.main-content') || document.body;
        const topbar = document.querySelector('.dashboard-topbar') || document.querySelector('.app-header');
        if (mainEl && topbar && topbar.parentNode === mainEl) {
            if (topbar.nextSibling) {
                mainEl.insertBefore(noticeDiv, topbar.nextSibling);
            } else {
                mainEl.appendChild(noticeDiv);
            }
        } else if (mainEl) {
            mainEl.insertBefore(noticeDiv, mainEl.firstChild);
        } else {
            document.body.insertBefore(noticeDiv, document.body.firstChild);
        }
    };

    renderNotice();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderNotice);
    }
    setTimeout(renderNotice, 100);
    setTimeout(renderNotice, 300);
    setTimeout(renderNotice, 600);
}

// Immediate execution check
checkAccessDeniedNotice();

function initAuthHandlers() {
    verifyBackendSession();
    checkAccessDeniedNotice();
    setupLoginForm();
    setupRegisterForm();
    setupGoogleLogin();
    setupPasswordToggles();
    setupForgotPassword();
    setupUniversalLogout();
    setupMobileSidebarToggle();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthHandlers);
} else {
    initAuthHandlers();
}

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
    const modal = document.getElementById('forgotPasswordModal');
    const closeBtn = document.getElementById('closeForgotModalBtn');
    const form = document.getElementById('forgotPasswordModalForm');
    const emailInput = document.getElementById('forgotModalEmail');
    const alertBox = document.getElementById('forgotModalAlert');
    const submitBtn = document.getElementById('sendForgotLinkBtn');

    if (!modal) return;

    forgotLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const loginEmailInput = document.getElementById('loginEmail');
            if (emailInput && loginEmailInput && loginEmailInput.value) {
                emailInput.value = loginEmailInput.value.trim();
            }
            if (alertBox) alertBox.style.display = 'none';
            modal.style.display = 'flex';
        });
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = emailInput ? emailInput.value.trim() : '';

            const errSpan = document.getElementById('forgotModalEmailError');
            if (errSpan) errSpan.textContent = '';
            if (alertBox) alertBox.style.display = 'none';

            if (!email || !/\S+@\S+\.\S+/.test(email)) {
                if (errSpan) errSpan.textContent = 'Please enter a valid email address.';
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Dispatching Link...';
            }

            try {
                if (!window.api || typeof window.api.forgotPassword !== 'function') {
                    throw new Error("Authentication service is initializing. Please try again.");
                }

                const res = await window.api.forgotPassword(email);
                
                if (alertBox) {
                    alertBox.style.display = 'block';
                    alertBox.style.background = '#ECFDF5';
                    alertBox.style.color = '#065F46';
                    alertBox.style.border = '1px solid #A7F3D0';
                    
                    let htmlContent = `<div style="font-weight: 600; margin-bottom: 4px;"><i class="fa-solid fa-circle-check"></i> Password Reset Link Sent!</div>`;
                    htmlContent += `<div>${res.message || 'If an account exists with this email, a reset link has been created.'}</div>`;

                    if (res.reset_link || res.token) {
                        const resetUrl = res.reset_link || `reset-password.html?token=${res.token}`;
                        htmlContent += `
                            <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed #A7F3D0; font-size: 0.8rem;">
                                <strong>Generated Link:</strong><br>
                                <a href="${resetUrl}" target="_blank" style="color: #4F46E5; text-decoration: underline; font-weight: 700; word-break: break-all;">
                                    Click here to open Reset Password page
                                </a>
                            </div>
                        `;
                    }
                    alertBox.innerHTML = htmlContent;
                }
            } catch (err) {
                console.error("Forgot password error:", err);
                if (alertBox) {
                    alertBox.style.display = 'block';
                    alertBox.style.background = '#FEF2F2';
                    alertBox.style.color = '#991B1B';
                    alertBox.style.border = '1px solid #FCA5A5';
                    alertBox.textContent = err.message || "Failed to process request. Please try again.";
                }
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Send Reset Link';
                }
            }
        });
    }
}


let activePreAuthToken = null;

// --- LOGIN FORM HANDLER ---
function setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    const twoFactorForm = document.getElementById('twoFactorForm');
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

            if (res && res.two_factor_required) {
                activePreAuthToken = res.pre_auth_token;
                
                const loginStep1 = document.getElementById('loginStep1');
                const loginStep2 = document.getElementById('loginStep2');

                if (loginStep1) loginStep1.style.display = 'none';
                if (loginStep2) loginStep2.style.display = 'block';
                if (twoFactorForm) twoFactorForm.style.display = 'block';

                const maskedDisplay = document.getElementById('maskedEmailDisplay');
                if (maskedDisplay) {
                    maskedDisplay.textContent = maskEmail(res.email || email);
                }

                showAuthAlert(`Verification code sent to ${maskEmail(res.email || email)}.`, "success");
                
                startResendTimer(30);

                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Log In';
                }
                return;
            }

            if (!res || !res.access_token) {
                throw new Error("Invalid response from server. Missing access token.");
            }

            completeLoginSession(res, email);
        } catch (err) {
            console.error("Login failed:", err);
            showAuthAlert(err.message || "Invalid email or password. Please try again.", "error");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Log In';
            }
        }
    });

    if (twoFactorForm) {
        twoFactorForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            clearAuthErrors();
            const otpInput = document.getElementById('otpCodeInput');
            const verifyBtn = document.getElementById('verifyOtpBtn');
            const otpCode = otpInput ? otpInput.value.trim() : '';

            if (!otpCode || otpCode.length !== 6) {
                showError('otpCodeError', 'Please enter the complete 6-digit verification code.');
                return;
            }

            const loginStep1 = document.getElementById('loginStep1');
            const loginStep2 = document.getElementById('loginStep2');

            if (!activePreAuthToken) {
                showAuthAlert("Verification session expired. Please log in again.", "error");
                if (loginStep2) loginStep2.style.display = 'none';
                if (loginStep1) loginStep1.style.display = 'block';
                return;
            }

            if (verifyBtn) {
                verifyBtn.disabled = true;
                verifyBtn.textContent = 'Verifying OTP...';
            }

            try {
                const res = await window.api.verify2FA(activePreAuthToken, otpCode);
                if (!res || !res.access_token) {
                    throw new Error("Verification failed. Missing access token.");
                }
                showAuthAlert("OTP verified successfully! Redirecting to dashboard...", "success");
                completeLoginSession(res, res.email);
            } catch (err) {
                console.error("2FA Verification failed:", err);
                showAuthAlert(err.message || "Invalid verification code. Please try again.", "error");
                showError('otpCodeError', err.message);
                if (verifyBtn) {
                    verifyBtn.disabled = false;
                    verifyBtn.textContent = 'Verify OTP';
                }
            }
        });

        const resendBtn = document.getElementById('resendOtpBtn');
        if (resendBtn) {
            resendBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                if (resendBtn.disabled) return;

                const loginStep1 = document.getElementById('loginStep1');
                const loginStep2 = document.getElementById('loginStep2');

                if (!activePreAuthToken) {
                    showAuthAlert("Verification session expired. Please log in again.", "error");
                    if (loginStep2) loginStep2.style.display = 'none';
                    if (loginStep1) loginStep1.style.display = 'block';
                    return;
                }

                resendBtn.disabled = true;
                resendBtn.textContent = 'Sending...';

                try {
                    const res = await window.api.resend2FA(activePreAuthToken);
                    showAuthAlert(res.message || "A new 6-digit verification code has been sent to your email.", "success");
                    startResendTimer(30);
                } catch (err) {
                    showAuthAlert(err.message || "Failed to resend verification code.", "error");
                    resendBtn.disabled = false;
                    resendBtn.textContent = 'Resend OTP';
                }
            });
        }

        const backLink = document.getElementById('backToLoginLink');
        if (backLink) {
            backLink.addEventListener('click', (e) => {
                e.preventDefault();
                activePreAuthToken = null;
                if (resendTimerInterval) clearInterval(resendTimerInterval);
                const loginStep1 = document.getElementById('loginStep1');
                const loginStep2 = document.getElementById('loginStep2');
                if (loginStep2) loginStep2.style.display = 'none';
                if (loginStep1) loginStep1.style.display = 'block';
                clearAuthErrors();
            });
        }
    }
}

function completeLoginSession(res, email) {
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
    setTimeout(() => {
        if (roleUpper === 'ADMIN') {
            window.location.replace('admin/dashboard.html');
        } else if (roleUpper === 'INSTRUCTOR') {
            window.location.replace('instructor/dashboard.html');
        } else {
            window.location.replace('student/dashboard.html');
        }
    }, 400);
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
    const toggleBtns = document.querySelectorAll('.mobile-toggle, #menuToggle, #sidebarToggle');
    const sidebar = document.querySelector('.dashboard-sidebar, .app-sidebar');
    const overlay = document.querySelector('.sidebar-overlay') || document.getElementById('sidebarOverlay');

    if (toggleBtns.length > 0 && sidebar) {
        toggleBtns.forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                const isOpen = sidebar.classList.contains('active');
                if (isOpen) {
                    sidebar.classList.remove('active');
                    if (overlay) overlay.classList.remove('active');
                } else {
                    sidebar.classList.add('active');
                    if (overlay) overlay.classList.add('active');
                }
            };
        });
    }

    if (overlay && sidebar) {
        overlay.onclick = (e) => {
            e.stopPropagation();
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        };
    }

    if (sidebar) {
        sidebar.querySelectorAll('.sidebar-nav a, .nav-item').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 1024) {
                    sidebar.classList.remove('active');
                    if (overlay) overlay.classList.remove('active');
                }
            });
        });
    }
}
