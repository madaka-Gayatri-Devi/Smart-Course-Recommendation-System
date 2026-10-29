/**
 * SmartLearn Centralized Authentication, Form Handlers & Strict Route Guard
 * =========================================================================
 * Provides comprehensive client-side authentication and session security:
 * 1. Synchronous Instant Route Guard: blocks unauthorized portal views before page render.
 * 2. Asynchronous Token Verification: re-validates JWT credentials against /users/me.
 * 3. Role-Based Access Control (RBAC): enforces distinct Student, Instructor, and Admin portals.
 * 4. Two-Factor Authentication (2FA/OTP): handles pre-auth tokens, 6-digit verification & resend timer.
 * 5. Google OAuth Integration: coordinates Firebase popup and backend token exchange.
 * 6. Password Management: toggle visibility and forgot-password reset requests.
 * 7. Registration & Account Creation: role validation, password policies, and instant session bootstrapping.
 * 8. Universal Logout: clears local/session storage and signs out of Firebase.
 */

// ==========================================
// SYNCHRONOUS ROUTE GUARDS & ACCESS CONTROL
// Blocks unauthorized portal viewing before DOM layout renders to prevent unauthorized data exposure.
// ==========================================

/**
 * Self-invoking synchronous route guard executed immediately during script parsing.
 *
 * Purpose:
 * Prevents unauthorized visual flash by checking localStorage credentials before rendering portal HTML.
 *
 * Processing:
 * 1. Inspects window.location.pathname for protected portal paths (/student/, /instructor/, /admin/).
 * 2. If unauthenticated (missing token or user object), redirects immediately to ../login.html.
 * 3. Validates user role against the active directory path.
 * 4. If role mismatch is detected, sets a friendly security notice in sessionStorage and
 *    redirects the user to their designated dashboard without terminating their login session.
 *
 * Error handling / Debugging:
 * JSON parse failures on stored user object trigger safe fallback to login.html.
 */
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

// Capture intended redirect destination immediately on script parse
(function captureAuthRedirectParams() {
    try {
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get('redirect');
        const courseId = params.get('course_id') || params.get('id');
        if (redirect) {
            sessionStorage.setItem('smartlearn_auth_redirect', redirect);
        }
        if (courseId) {
            sessionStorage.setItem('smartlearn_intended_course_id', courseId);
        }
    } catch (_) {}
})();

/**
 * Programmatic route guard callable inside JavaScript modules and feature controllers.
 *
 * @param {string} requiredRole - Expected role string ('STUDENT', 'INSTRUCTOR', or 'ADMIN').
 * @returns {Object|null} Validated user object {id, email, full_name, role} or null if redirected.
 *
 * Purpose:
 * Guards asynchronous module execution and ensures caller has the exact authorized privileges.
 *
 * Processing:
 * 1. Checks presence of 'smartlearn_token' and 'smartlearn_user' in localStorage.
 * 2. Compares active user role against requiredRole (case-insensitive).
 * 3. Redirects to unauthorized destination with friendly message if roles clash.
 *
 * Error handling / Debugging:
 * Check browser console warnings and URL query param '?access_denied=' if unexpected redirection occurs.
 */
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

// Handle Browser Back Button cache restore (BFCache protection)
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

/**
 * Asynchronously verifies the active session against the backend /users/me endpoint.
 *
 * @returns {Promise<void>}
 *
 * Purpose:
 * Confirms that the JWT token stored in localStorage has not expired, been revoked,
 * or altered on the backend database.
 *
 * Dependencies:
 * Endpoint: GET /users/me (via window.api.getMe()).
 *
 * Processing:
 * 1. Checks if current URL is a protected portal route; returns early if public page.
 * 2. Issues authenticated GET /users/me request with Bearer token.
 * 3. Refreshes 'smartlearn_user' cache with latest database profile.
 * 4. Confirms active database role matches portal path; safely redirects if privileges changed.
 *
 * Error handling / Debugging:
 * Only purges session and redirects to login if backend explicitly rejects credentials with 401.
 * Transient network failures do not log out the user.
 */
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
            const cur = window.api.getCurrentUser() || {};
            const merged = { ...cur, ...verifiedUser };
            if (!merged.profile_image && cur.profile_image) {
                merged.profile_image = cur.profile_image;
            }
            localStorage.setItem('smartlearn_user', JSON.stringify(merged));
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

// ==========================================
// ACCESS DENIED & NOTIFICATION BANNERS
// Friendly security warning rendering when unauthorized portal access is attempted.
// ==========================================

/**
 * Escapes unsafe HTML characters to prevent XSS vulnerability in security alerts.
 *
 * @param {string} text - Raw input message.
 * @returns {string} Sanitized string safe for DOM interpolation.
 */
function safeEscapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Detects access denied redirect messages and renders a dismissible alert banner.
 *
 * Purpose:
 * Informs the user why they were redirected (e.g. attempting to view an admin page from a student account)
 * without abrupt logout or broken navigation experience.
 *
 * Processing:
 * 1. Checks sessionStorage ('smartlearn_access_denied_msg') and URL query string ('access_denied').
 * 2. Strips 'access_denied' parameter from URL history to prevent persistent alert on refresh.
 * 3. Mounts a styled banner containing a security shield icon and dismiss button below the topbar.
 */
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

// ==========================================
// CENTRAL INITIALIZATION & EVENT DELEGATION
// Wires authentication handlers, form submissions, and global click handlers.
// ==========================================

/**
 * Initializes all auth-related forms, listeners, and session guards.
 */
function checkOAuthRedirectParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const oauthError = urlParams.get('oauth_error');

    if (oauthError) {
        showAuthAlert(`Google Authentication Notice: ${decodeURIComponent(oauthError)}`, 'error');
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        return;
    }

    if (token) {
        const role = urlParams.get('role') || 'Student';
        const email = urlParams.get('email') || '';
        const name = urlParams.get('name') || '';
        const id = urlParams.get('id') || '';

        const userObj = {
            id: id,
            email: email,
            full_name: name,
            name: name,
            role: role
        };

        localStorage.setItem('smartlearn_token', token);
        localStorage.setItem('smartlearn_user', JSON.stringify(userObj));
        localStorage.setItem('smartlearn_role', role);

        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);

        showAuthAlert("Authentication successful! Redirecting...", "success");
        redirectUserToDashboard(role);
    }
}

function initAuthHandlers() {
    checkOAuthRedirectParams();
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

// Global Delegated Event Listeners for Login & Google Auth
document.addEventListener('click', function(e) {
    const loginBtn = e.target.closest('#loginSubmitBtn');
    if (loginBtn) {
        e.preventDefault();
        e.stopPropagation();
        handleLoginSubmit(e);
        return;
    }

    const googleBtn = e.target.closest('#googleLoginBtn') || e.target.closest('.google-btn');
    if (googleBtn) {
        e.preventDefault();
        e.stopPropagation();
        handleGoogleLogin(e);
        return;
    }
}, true);

document.addEventListener('submit', function(e) {
    const form = e.target.closest('#loginForm');
    if (form) {
        e.preventDefault();
        e.stopPropagation();
        handleLoginSubmit(e);
    }
}, true);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthHandlers);
} else {
    initAuthHandlers();
}

// ==========================================
// DASHBOARD NAVIGATION & ROLE ROUTING
// Maps user roles to portal entrypoints (student, instructor, admin).
// ==========================================

/**
 * Navigates authenticated user to their role-specific dashboard.
 *
 * @param {string} role - User role identifier ('STUDENT', 'INSTRUCTOR', or 'ADMIN').
 *
 * Purpose:
 * Directs users to their correct portal (student/dashboard.html, instructor/dashboard.html, admin/dashboard.html).
 */
function redirectUserToDashboard(role) {
    const roleUpper = (role || 'STUDENT').toUpperCase();
    let targetPage = 'student/dashboard.html';
    if (roleUpper === 'ADMIN') {
        targetPage = 'admin/dashboard.html';
    } else if (roleUpper === 'INSTRUCTOR') {
        targetPage = 'instructor/dashboard.html';
    }

    // Check if there was an intended course or page destination
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('course_id') || urlParams.get('id') || sessionStorage.getItem('smartlearn_intended_course_id');
    const explicitRedirect = urlParams.get('redirect') || sessionStorage.getItem('smartlearn_auth_redirect');

    // Clear temporary redirection storage once read
    try {
        sessionStorage.removeItem('smartlearn_auth_redirect');
        sessionStorage.removeItem('smartlearn_intended_course_id');
    } catch (_) {}

    if (roleUpper === 'STUDENT') {
        if (courseId) {
            targetPage = `student/course-details.html?id=${encodeURIComponent(courseId)}`;
        } else if (explicitRedirect) {
            const cleanRedirect = explicitRedirect.replace(/^\/+/, '');
            // Prevent open external redirect attacks
            if (!cleanRedirect.startsWith('http://') && !cleanRedirect.startsWith('https://')) {
                targetPage = cleanRedirect;
            }
        }
    }

    const currentPath = window.location.pathname;
    let redirectUrl = targetPage;
    if (currentPath.includes('/frontend/')) {
        const basePath = currentPath.substring(0, currentPath.indexOf('/frontend/') + 10);
        redirectUrl = basePath + targetPage;
    } else {
        redirectUrl = '/' + targetPage.replace(/^\/+/, '');
    }

    setTimeout(() => {
        window.location.href = redirectUrl;
    }, 400);
}

// ==========================================
// GOOGLE OAUTH & THIRD-PARTY AUTHENTICATION
// Firebase OAuth popup handler and backend token exchange.
// ==========================================

/**
 * Handles Google OAuth Sign-In via Firebase popup and backend token verification.
 *
 * @param {Event} [e] - Click event object.
 *
 * Purpose:
 * Allows 1-click Google authentication, automatically creating or signing in accounts.
 *
 * Dependencies:
 * window.signInWithGooglePopup (from firebase-config.js)
 * Endpoint: POST /auth/google-login
 *
 * Error handling / Debugging:
 * Firebase network errors or missing popup permissions display user-friendly error banners.
 */
async function handleGoogleLogin(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    const googleBtn = document.getElementById('googleLoginBtn') || document.querySelector('.google-btn');
    const originalText = googleBtn ? googleBtn.innerHTML : 'Continue with Google';
    
    if (googleBtn) {
        googleBtn.disabled = true;
        googleBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Connecting to Google...</span>`;
    }

    try {
        if (typeof window.signInWithGooglePopup !== 'function') {
            throw new Error("Google authentication service is initializing. Please check your network and refresh.");
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

        const profileImg = res.profile_image || (res.user && res.user.profile_image) || fbAuthResult.photoURL || '';
        const userObj = {
            id: res.id,
            full_name: res.full_name || fbAuthResult.displayName || 'User',
            name: res.full_name || fbAuthResult.displayName || 'User',
            email: res.email || fbAuthResult.email,
            role: res.role || 'Student',
            profile_image: profileImg
        };

        localStorage.setItem('smartlearn_token', res.access_token);
        localStorage.setItem('smartlearn_user', JSON.stringify(userObj));
        localStorage.setItem('smartlearn_role', res.role || 'Student');

        showAuthAlert("Google authentication successful! Redirecting...", "success");
        redirectUserToDashboard(res.role || 'Student');
    } catch (err) {
        console.error("Google authentication error:", err);
        showAuthAlert(err.message || "Google Login failed. Please try again.", "error");
        if (googleBtn) {
            googleBtn.disabled = false;
            googleBtn.innerHTML = originalText;
        }
    }
}

/**
 * Attaches click event listeners to Google Login buttons.
 */
function setupGoogleLogin() {
    const googleBtns = document.querySelectorAll('.google-btn, #googleLoginBtn');
    googleBtns.forEach(btn => {
        btn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            handleGoogleLogin(e);
            return false;
        };
        btn.addEventListener('click', (e) => handleGoogleLogin(e));
    });
}

// ==========================================
// PASSWORD MANAGEMENT & VISIBILITY TOGGLES
// Password show/hide toggle and forgot-password reset flow.
// ==========================================

/**
 * Wires eye-icon toggles to switch password input field types between 'password' and 'text'.
 */
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

/**
 * Sets up Forgot Password modal triggers, form validation, and email dispatch.
 *
 * Dependencies:
 * Endpoint: POST /auth/forgot-password (via window.api.forgotPassword(email)).
 */
function setupForgotPassword() {
    const forgotLinks = document.querySelectorAll('.forgot-link, #forgotPasswordLink');
    const modal = document.getElementById('forgotPasswordModal');
    const closeBtn = document.getElementById('closeForgotModalBtn');
    const form = document.getElementById('forgotPasswordModalForm');
    const emailInput = document.getElementById('forgotModalEmail');
    const alertBox = document.getElementById('forgotModalAlert');
    const submitBtn = document.getElementById('sendForgotLinkBtn');

    if (!modal) return;

    function openModal() {
        modal.classList.add('active');
        modal.style.display = 'flex';
        if (emailInput) {
            const loginEmail = document.getElementById('loginEmail');
            if (loginEmail && loginEmail.value) {
                emailInput.value = loginEmail.value.trim();
            }
            setTimeout(() => emailInput.focus(), 60);
        }
        if (alertBox) alertBox.style.display = 'none';
    }

    function closeModal() {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }

    forgotLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            openModal();
        });
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && (modal.classList.contains('active') || modal.style.display === 'flex')) {
            closeModal();
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

// Active Pre-Authentication token for Two-Factor Verification
var activePreAuthToken = null;

// ==========================================
// LOGIN & TWO-FACTOR AUTHENTICATION (2FA)
// Credentials validation, 2FA OTP verification, resend timers, and session establishment.
// ==========================================

/**
 * Handles standard login form submission, managing 2FA challenges and standard JWT authentication.
 *
 * @param {Event} [e] - Form submission event.
 * @returns {Promise<boolean>} False to prevent browser form navigation.
 *
 * Processing:
 * 1. Validates presence and email regex format for email and password.
 * 2. Calls window.api.login({ email, password }).
 * 3. If response indicates two_factor_required:
 *    - Stores pre_auth_token.
 *    - Switches UI from Step 1 (credentials) to Step 2 (6-digit OTP).
 * 4. If standard login succeeds:
 *    - Calls completeLoginSession(res, email) and routes to dashboard.
 *
 * Dependencies:
 * Endpoint: POST /auth/login
 *
 * Error handling / Debugging:
 * Backend 400/401 messages are displayed via showAuthAlert.
 */
async function handleLoginSubmit(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

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

    if (!isValid) return false;

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Logging in...</span>`;
    }

    try {
        if (!window.api || typeof window.api.login !== 'function') {
            throw new Error("Authentication service is initializing. Please try again.");
        }

        const res = await window.api.login({ email, password });

        if (res && res.two_factor_required) {
            activePreAuthToken = res.pre_auth_token;
            
            const loginStep1 = document.getElementById('loginStep1');
            const loginStep2 = document.getElementById('loginStep2');
            const twoFactorForm = document.getElementById('twoFactorForm');

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
            return false;
        }

        if (!res || !res.access_token) {
            throw new Error("Invalid response from server. Missing access token.");
        }

        showAuthAlert("Login successful! Redirecting to portal...", "success");
        completeLoginSession(res, email);
    } catch (err) {
        console.error("Login failed:", err);
        showAuthAlert(err.message || "Invalid email or password. Please try again.", "error");
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Log In';
        }
    }
    return false;
}

/**
 * Binds submit and click events to login form, OTP verification, and resend buttons.
 */
function setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    const submitBtn = document.getElementById('loginSubmitBtn');
    const twoFactorForm = document.getElementById('twoFactorForm');

    if (loginForm) {
        loginForm.onsubmit = function(e) {
            e.preventDefault();
            e.stopPropagation();
            handleLoginSubmit(e);
            return false;
        };
        loginForm.addEventListener('submit', (e) => handleLoginSubmit(e));
    }

    if (submitBtn) {
        submitBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            handleLoginSubmit(e);
            return false;
        };
        submitBtn.addEventListener('click', (e) => handleLoginSubmit(e));
    }

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

/**
 * Finalizes successful login or 2FA verification by saving tokens and routing to portal.
 *
 * @param {Object} res - Response from /auth/login or /auth/verify-2fa.
 * @param {string} email - Fallback email address string.
 */
function completeLoginSession(res, email) {
    const profileImg = res.profile_image || (res.user && res.user.profile_image) || '';
    const userObj = {
        id: res.id,
        full_name: res.full_name || res.name || 'User',
        name: res.full_name || res.name || 'User',
        email: res.email || email,
        role: res.role || 'Student',
        profile_image: profileImg
    };

    localStorage.setItem('smartlearn_token', res.access_token);
    localStorage.setItem('smartlearn_user', JSON.stringify(userObj));
    localStorage.setItem('smartlearn_role', res.role || 'Student');

    redirectUserToDashboard(res.role || 'Student');
}

window.SmartLearnAuth = {
    handleLoginSubmit,
    handleGoogleLogin,
    redirectUserToDashboard,
    clearAuthErrors,
    showAuthAlert
};

// ==========================================
// REGISTRATION & ACCOUNT ONBOARDING
// New user registration, role selection, input validation, and auto-login.
// ==========================================

/**
 * Configures the registration form submission and validation handlers on register.html.
 *
 * Purpose:
 * Enforces strong password rules (>=8 characters), checks password match, blocks
 * direct public admin registrations, and automatically logs in new users upon account creation.
 *
 * Dependencies:
 * Endpoint: POST /auth/register (via window.api.register(userData)).
 */
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
                    name: res.full_name || full_name,
                    email: res.email || email,
                    role: res.role || role,
                    profile_image: res.profile_image || (res.user && res.user.profile_image) || ''
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

// ==========================================
// UI FEEDBACK & ERROR HANDLING UTILITIES
// Inline error banners, input validation feedback, and alerts.
// ==========================================

/**
 * Resets all visible error text fields and hides top-level alert banners.
 */
function clearAuthErrors() {
    document.querySelectorAll('.error-text').forEach(el => el.textContent = '');
    const alertBox = document.getElementById('authAlert');
    if (alertBox) {
        alertBox.style.display = 'none';
        alertBox.textContent = '';
        alertBox.className = 'auth-alert';
    }
}

/**
 * Sets validation error message text on a designated form field error span.
 *
 * @param {string} elementId - DOM ID of target error element.
 * @param {string} message - Validation message to display.
 */
function showError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.style.display = 'block';
    }
}

/**
 * Displays a styled alert message banner at the top of authentication forms.
 *
 * @param {string} message - Alert text.
 * @param {'error'|'success'} [type='error'] - Type of alert styling.
 */
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

// ==========================================
// SESSION TERMINATION & NAVIGATION CONTROLS
// Universal logout handler and responsive sidebar toggle for mobile layouts.
// ==========================================

/**
 * Binds universal logout listeners to all logout buttons and links across the application.
 *
 * Processing:
 * 1. Signs out of Firebase if initialized.
 * 2. Invokes window.api.logout() to clear localStorage and redirect to login.html.
 */
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

/**
 * Manages responsive sidebar toggle for tablet and mobile viewport layouts.
 *
 * Processing:
 * 1. Attaches click handlers to hamburger toggle buttons (.mobile-toggle, #menuToggle).
 * 2. Toggles 'active' class on sidebar and dark backdrop overlay.
 * 3. Automatically closes sidebar when any navigation link is clicked on mobile (<= 1024px).
 */
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
