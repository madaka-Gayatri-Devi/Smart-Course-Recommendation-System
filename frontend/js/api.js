var API_URL = 'http://127.0.0.1:8080';
if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    const proto = window.location.protocol;
    const httpProto = (proto && (proto === 'http:' || proto === 'https:')) ? proto : 'http:';
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
        if (window.location.port !== '8080' && window.location.port !== '') {
            API_URL = `${httpProto}//127.0.0.1:8080`;
        } else {
            API_URL = window.location.origin;
        }
    } else if (host && host !== '') {
        // In cloud deployment (Render, etc.), API is served on standard ports (80/443) on same origin
        API_URL = window.location.origin;
    } else {
        API_URL = 'http://127.0.0.1:8080';
    }
    window.API_URL = API_URL;
}

/**
 * Wrapper around window.fetch providing resilient error handling and network connectivity detection.
 * @param {string} url - API destination endpoint URL.
 * @param {RequestInit} [options] - Standard Fetch API configuration options.
 * @returns {Promise<Response>} Fetch response object.
 * @throws {Error} Human-readable error if connection to backend fails.
 */
async function safeFetch(url, options) {
    try {
        const response = await fetch(url, options);
        return response;
    } catch (error) {
        if (error.name === 'TypeError' || (error.message && error.message.includes('Failed to fetch'))) {
            console.error('Backend connection failed on', url, error);
            throw new Error('Unable to connect to SmartLearn server. Please make sure the backend server is running and try again.');
        }
        throw error;
    }
}

/**
 * Parses JSON error details returned from FastAPI endpoints into clear user-facing messages.
 * Handles FastAPI string detail, pydantic validation arrays, generic messages, and HTTP status codes.
 * @param {Response} res - HTTP response object.
 * @param {string} fallbackMessage - Default fallback message if no specific detail is found.
 * @returns {Promise<string>} Human-friendly error message string.
 */
async function parseErrorResponse(res, fallbackMessage = 'Request failed') {
    try {
        const err = await res.json();
        if (typeof err.detail === 'string') {
            return err.detail;
        } else if (Array.isArray(err.detail) && err.detail.length > 0) {
            return err.detail.map(d => d.msg || JSON.stringify(d)).join(', ');
        } else if (err.message) {
            return err.message;
        }
    } catch (_) {}

    if (res.status === 401) return 'Your session has expired. Please log in again.';
    if (res.status === 403) return 'Access denied. You do not have permission to view or manage this resource.';
    if (res.status === 400) return 'Invalid request. Please check your inputs.';
    if (res.status === 404) return 'Resource not found.';
    if (res.status === 422) return 'Invalid filter parameters.';
    if (res.status >= 500) return 'Server error. Please try again.';
    return fallbackMessage;
}

const api = {
    API_URL,

    /**
     * Retrieves the currently authenticated user's cached identity from localStorage.
     *
     * @returns {Object|null} Deserialized user object {id, email, full_name, role, ...} or null if unauthenticated.
     *
     * Purpose:
     * Provides instantaneous synchronous access to active user identity across all UI views and guards.
     *
     * Input:
     * Reads 'smartlearn_user' string from localStorage.
     *
     * Processing:
     * 1. Reads string from localStorage.
     * 2. Safely executes JSON.parse.
     * 3. Returns parsed object or null if absent or malformed.
     *
     * Dependencies:
     * Browser localStorage ('smartlearn_user').
     *
     * Error handling:
     * Corrupted JSON values in storage fail gracefully to null.
     */
    getCurrentUser() {
        const userStr = localStorage.getItem('smartlearn_user');
        if (!userStr) return null;
        try {
            return JSON.parse(userStr);
        } catch (_) {
            return null;
        }
    },

    /**
     * Retrieves the stored JWT authentication token from localStorage.
     *
     * @returns {string|null} JWT bearer token string or null if unauthenticated.
     *
     * Purpose:
     * Used by API calls and WebSocket connections to authenticate requests.
     */
    getToken() {
        return localStorage.getItem('smartlearn_token');
    },
    
    /**
     * Stores the JWT authentication token in localStorage.
     *
     * @param {string} token - JWT bearer token string from backend authentication.
     *
     * Purpose:
     * Persists authentication credentials across browser reloads.
     */
    setToken(token) {
        localStorage.setItem('smartlearn_token', token);
    },
    
    /**
     * Removes the JWT authentication token from localStorage.
     *
     * Purpose:
     * Clears credentials during logout or session expiration.
     */
    clearToken() {
        localStorage.removeItem('smartlearn_token');
        localStorage.removeItem('smartlearn_user');
        try {
            sessionStorage.removeItem('smartlearn_chatbot_active_conv');
        } catch (_) {}
    },

    /**
     * Resolves a media file path into a fully qualified URL.
     *
     * @param {string} path - Relative file path or absolute URL.
     * @returns {string} Fully qualified media URL pointing to the backend media server.
     *
     * Purpose:
     * Ensures avatar images, course thumbnails, and chat attachments render correctly in <img> elements.
     */
    getImageUrl(path) {
        if (!path) return '';
        if (path.startsWith('http://') || path.startsWith('https://')) return path;
        return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
    },

    // --- AUTHENTICATION ---

    /**
     * Registers a new student or instructor user account with the SmartLearn platform.
     *
     * @param {Object} userData - Account payload { full_name, email, password, role }.
     * @returns {Promise<Object>} Backend response containing access token, user profile, and session details.
     *
     * Purpose:
     * Creates new user accounts and boots initial sessions.
     *
     * Endpoint:
     * POST /auth/register
     *
     * Dependencies:
     * safeFetch, parseErrorResponse
     *
     * Error handling / Debugging:
     * Throws an Error with backend validation detail (e.g. duplicate email, invalid password requirements).
     */
    async register(userData) {
        const res = await safeFetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Registration failed');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Authenticates an existing user using email credentials.
     *
     * @param {Object} credentials - Payload containing { email, password }.
     * @returns {Promise<Object>} Either { access_token, user, ... } or { two_factor_required: true, pre_auth_token: ... }.
     *
     * Purpose:
     * Primary entrypoint for platform authentication. Handles both standard and 2FA authentication challenges.
     *
     * Endpoint:
     * POST /auth/login
     *
     * Dependencies:
     * safeFetch, parseErrorResponse
     *
     * Error handling / Debugging:
     * Throws an Error if credentials are invalid or account is suspended. Check backend terminal for auth logs.
     */
    async login(credentials) {
        const res = await safeFetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Login failed');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Verifies a 6-digit one-time password (OTP) during two-factor authentication.
     *
     * @param {string} preAuthToken - Temporary pre-authentication token issued during login step 1.
     * @param {string} otpCode - 6-digit numeric verification code entered by the user.
     * @returns {Promise<Object>} Full authenticated session response { access_token, token_type, user }.
     *
     * Purpose:
     * Completes multi-factor authentication handshake.
     *
     * Endpoint:
     * POST /auth/verify-2fa
     *
     * Dependencies:
     * safeFetch, parseErrorResponse
     *
     * Error handling / Debugging:
     * Throws an Error if OTP has expired (5-minute TTL) or does not match server cache.
     */
    async verify2FA(preAuthToken, otpCode) {
        const res = await safeFetch(`${API_URL}/auth/verify-2fa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pre_auth_token: preAuthToken, otp_code: otpCode })
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, '2FA Verification failed');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Requests a fresh 6-digit OTP email during an active 2FA verification session.
     *
     * @param {string} preAuthToken - Active pre-auth token.
     * @returns {Promise<Object>} Confirmation response { message: string }.
     *
     * Purpose:
     * Allows users to request a new code if email was delayed or expired.
     *
     * Endpoint:
     * POST /auth/resend-2fa
     */
    async resend2FA(preAuthToken) {
        const res = await safeFetch(`${API_URL}/auth/resend-2fa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pre_auth_token: preAuthToken })
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to resend 2FA code');
            throw new Error(msg);
        }
        return res.json();
    },

    async toggle2FA(enabled) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/auth/2fa/toggle?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ enabled: !!enabled })
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to toggle 2FA');
            throw new Error(msg);
        }
        return res.json();
    },


    /**
     * Exchanges a Firebase Google OAuth id_token for a SmartLearn platform JWT access token.
     *
     * @param {string} idToken - Google OAuth ID token issued by Firebase SDK.
     * @param {string} [role='Student'] - Desired account role ('Student' or 'Instructor').
     * @returns {Promise<Object>} Backend authentication response { access_token, user, role }.
     *
     * Purpose:
     * Enables passwordless social authentication.
     *
     * Endpoint:
     * POST /auth/google-login
     *
     * Dependencies:
     * Firebase Auth SDK, safeFetch, parseErrorResponse
     */
    async googleLogin(idToken, role = 'Student') {
        const res = await safeFetch(`${API_URL}/auth/google-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_token: idToken, role: role })
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Google authentication failed');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Resets a forgotten password using a secure reset token received via email.
     *
     * @param {Object} data - Payload containing { token, new_password }.
     * @returns {Promise<Object>} Confirmation message.
     *
     * Endpoint:
     * POST /auth/reset-password
     */
    async resetPassword(data) {
        const res = await safeFetch(`${API_URL}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Password reset failed');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Fetches the current authenticated user's profile and active role from the database.
     *
     * @returns {Promise<Object>} Fresh user record { id, email, full_name, role, is_active, ... }.
     *
     * Purpose:
     * Validates stored JWT against the backend and updates client state.
     *
     * Endpoint:
     * GET /users/me
     *
     * Error handling / Debugging:
     * Throws 401 if JWT has expired or been revoked.
     */
    async getMe() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        
        const res = await safeFetch(`${API_URL}/users/me?token=${encodeURIComponent(token)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch user');
            throw new Error(msg);
        }
        return res.json();
    },

    // --- PROFILE ---

    /**
     * Retrieves the detailed student or instructor profile, including bio, skills, and interests.
     *
     * @returns {Promise<Object>} User profile object.
     *
     * Endpoint:
     * GET /profile
     */
    async getProfile() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/profile?token=${encodeURIComponent(token)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch profile');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Alias for updateProfile to save user profile changes.
     *
     * @param {Object} profileData - Updated profile attributes.
     * @returns {Promise<Object>} Saved profile response.
     */
    async saveProfile(profileData) {
        return this.updateProfile(profileData);
    },

    /**
     * Updates profile fields (full name, bio, phone, social links, headline).
     *
     * @param {Object} profileData - Profile updates.
     * @returns {Promise<Object>} Updated profile data.
     *
     * Purpose:
     * Syncs profile modifications to backend and updates localStorage cached name.
     *
     * Endpoint:
     * POST /profile
     */
    async updateProfile(profileData) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/profile?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(profileData)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to update profile');
            throw new Error(msg);
        }
        const data = await res.json();
        
        // If full_name was updated, update cached user object in localStorage
        if (profileData && profileData.full_name) {
            const currentUser = this.getCurrentUser();
            if (currentUser) {
                currentUser.full_name = profileData.full_name;
                localStorage.setItem('smartlearn_user', JSON.stringify(currentUser));
            }
        }
        return data;
    },

    /**
     * Uploads a new profile avatar image file (JPG, PNG, WEBP).
     *
     * @param {File} file - Browser File object selected from file input.
     * @returns {Promise<Object>} Upload response { message, avatar_url }.
     *
     * Endpoint:
     * POST /profile/avatar
     *
     * Dependencies:
     * FormData, safeFetch
     */
    async uploadAvatar(file) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        if (!file) throw new Error('No image file selected.');
        if (file.size > 5 * 1024 * 1024) throw new Error('Image size exceeds 5MB limit. Please choose a smaller image.');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('avatar', file);

        const res = await safeFetch(`${API_URL}/profile/avatar?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Avatar upload failed');
            throw new Error(msg);
        }
        const data = await res.json();
        const avatarPath = data.relative_url || data.image_url || data.profile_image;
        if (avatarPath) {
            const currentUser = this.getCurrentUser();
            if (currentUser) {
                currentUser.profile_image = avatarPath;
                localStorage.setItem('smartlearn_user', JSON.stringify(currentUser));
            }
        }
        return data;
    },

    // --- COURSES ---

    /**
     * Queries the public course catalog with optional search, category, and level filters.
     *
     * @param {Object} [params={}] - Query parameters { search, category, level, sort, page, limit }.
     * @returns {Promise<Array<Object>|Object>} List of courses matching the query.
     *
     * Endpoint:
     * GET /courses
     */
    async getCourses(params = {}) {
        const url = new URL(`${API_URL}/courses`);
        Object.keys(params).forEach(key => {
            const val = params[key];
            if (val !== undefined && val !== null && val !== '' && val !== 'all' && val !== 'any') {
                url.searchParams.append(key, val);
            }
        });
        
        const token = this.getToken();
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
            url.searchParams.append('token', token);
        }

        const res = await safeFetch(url.toString(), { headers });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch courses');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves detailed metadata, syllabus, and instructor details for a specific course.
     *
     * @param {number|string} courseId - Course primary key.
     * @returns {Promise<Object>} Course details object including modules, reviews, and enrollment state.
     *
     * Endpoint:
     * GET /courses/{course_id}
     */
    async getCourseDetails(courseId) {
        const token = this.getToken();
        const url = new URL(`${API_URL}/courses/${courseId}`);
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
            url.searchParams.append('token', token);
        }

        const res = await safeFetch(url.toString(), { headers });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch course details');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Creates a new draft course in the instructor portal.
     *
     * @param {Object} courseData - Course creation payload { title, description, category_id, level, price, ... }.
     * @returns {Promise<Object>} Created course record.
     *
     * Endpoint:
     * POST /courses
     *
     * Authorization:
     * Requires Instructor or Admin role.
     */
    async createCourse(courseData) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/courses?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(courseData)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to create course');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Updates an existing course's metadata, pricing, or description.
     *
     * @param {number|string} courseId - Course primary key.
     * @param {Object} courseData - Modified course fields.
     * @returns {Promise<Object>} Updated course object.
     *
     * Endpoint:
     * PUT /courses/{course_id}
     */
    async updateCourse(courseId, courseData) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/courses/${courseId}?token=${encodeURIComponent(token)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(courseData)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to update course');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Changes the publication status of a course (e.g. 'draft', 'published', 'archived').
     *
     * @param {number|string} courseId - Target course ID.
     * @param {string} status - New status string.
     * @returns {Promise<Object>} Updated status confirmation.
     *
     * Endpoint:
     * PATCH /courses/{course_id}/status
     */
    async updateCourseStatus(courseId, status) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/courses/${courseId}/status?token=${encodeURIComponent(token)}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status })
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to update course status');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Deletes or unpublishes a course from the platform catalog.
     *
     * @param {number|string} courseId - Target course ID.
     * @returns {Promise<Object>} Deletion result confirmation.
     *
     * Endpoint:
     * DELETE /courses/{course_id}
     */
    async deleteCourse(courseId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/courses/${courseId}?token=${encodeURIComponent(token)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to delete course');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves all courses authored by the currently logged-in instructor.
     *
     * @param {Object} [params={}] - Optional filters.
     * @returns {Promise<Array<Object>>} Instructor's authored courses list.
     *
     * Endpoint:
     * GET /instructor/courses
     */
    async getInstructorCourses(params = {}) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const url = new URL(`${API_URL}/instructor/courses`);
        url.searchParams.append('token', token);
        Object.keys(params).forEach(k => {
            if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
                url.searchParams.append(k, params[k]);
            }
        });

        let res = await safeFetch(url.toString(), {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            const altUrl = new URL(`${API_URL}/api/instructor/courses`);
            altUrl.searchParams.append('token', token);
            Object.keys(params).forEach(k => {
                if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
                    altUrl.searchParams.append(k, params[k]);
                }
            });
            res = await safeFetch(altUrl.toString(), {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        }
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch instructor courses');
            throw new Error(msg);
        }
        return res.json();
    },

    // --- REFERENCE DATA ---

    /**
     * Retrieves all available academic categories and subject domains.
     *
     * @returns {Promise<Array<Object>>} List of categories { id, name, description, icon }.
     *
     * Endpoint:
     * GET /categories
     */
    async getCategories() {
        const res = await safeFetch(`${API_URL}/categories`);
        if (!res.ok) {
            const alt = await safeFetch(`${API_URL}/admin/categories`);
            if (alt.ok) return alt.json();
            const msg = await parseErrorResponse(res, 'Failed to fetch categories');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves standardized skills, optionally filtered by category.
     *
     * @param {string|null} [category=null] - Category name filter.
     * @returns {Promise<Array<Object>>} List of skill records.
     *
     * Endpoint:
     * GET /skills
     */
    async getSkills(category = null) {
        const url = new URL(`${API_URL}/skills`);
        if (category && category !== 'all') {
            url.searchParams.append('category', category);
        }
        const res = await safeFetch(url.toString());
        if (!res.ok) {
            const alt = await safeFetch(`${API_URL}/admin/skills`);
            if (alt.ok) return alt.json();
            const msg = await parseErrorResponse(res, 'Failed to fetch skills');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves standard career goal definitions available for students.
     *
     * @returns {Promise<Array<Object>>} List of career goals { id, title, description, skills }.
     *
     * Endpoint:
     * GET /career-goals
     */
    async getCareerGoals() {
        const res = await safeFetch(`${API_URL}/career-goals`);
        if (!res.ok) {
            const alt = await safeFetch(`${API_URL}/admin/career-goals`);
            if (alt.ok) return alt.json();
            const msg = await parseErrorResponse(res, 'Failed to fetch career goals');
            throw new Error(msg);
        }
        return res.json();
    },

    // --- LMS COURSE CONTENT, UPLOADS & CURRICULUM ---

    /**
     * Uploads a video lecture file (MP4, WEBM) for course curriculum lessons.
     *
     * @param {File} file - Video file from browser input.
     * @param {number|string|null} [courseId=null] - Associated course ID.
     * @returns {Promise<Object>} Upload response { video_url, duration, filename }.
     *
     * Endpoint:
     * POST /courses/upload-video
     */
    async uploadCourseVideo(file, courseId = null) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('video', file);

        const endpoint = courseId 
            ? `${API_URL}/courses/${courseId}/upload-video?token=${encodeURIComponent(token)}`
            : `${API_URL}/courses/upload-video?token=${encodeURIComponent(token)}`;

        const res = await safeFetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Video upload failed');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Uploads downloadable study materials (PDF, slides, source files) for a lesson.
     *
     * @param {File} file - Material document file.
     * @param {number|string|null} [courseId=null] - Course ID.
     * @returns {Promise<Object>} Upload response { material_url, filename, size }.
     *
     * Endpoint:
     * POST /courses/upload-material
     */
    async uploadCourseMaterial(file, courseId = null) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const formData = new FormData();
        formData.append('file', file);

        const endpoint = courseId 
            ? `${API_URL}/courses/${courseId}/upload-material?token=${encodeURIComponent(token)}`
            : `${API_URL}/courses/upload-material?token=${encodeURIComponent(token)}`;

        const res = await safeFetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Material upload failed');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Uploads a promotional thumbnail banner image for a course card.
     *
     * @param {File} file - Image file (JPG, PNG, WEBP).
     * @param {number|string|null} [courseId=null] - Course ID.
     * @returns {Promise<Object>} Upload response { thumbnail_url }.
     *
     * Endpoint:
     * POST /courses/upload-thumbnail
     */
    async uploadCourseThumbnail(file, courseId = null) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const formData = new FormData();
        formData.append('file', file);

        const endpoint = courseId 
            ? `${API_URL}/courses/${courseId}/upload-thumbnail?token=${encodeURIComponent(token)}`
            : `${API_URL}/courses/upload-thumbnail?token=${encodeURIComponent(token)}`;

        const res = await safeFetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Thumbnail upload failed');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves complete curriculum tree (modules, lessons, quizzes, resources) for a course.
     *
     * @param {number|string} courseId - Course ID.
     * @returns {Promise<Object>} Curriculum hierarchy.
     *
     * Endpoint:
     * GET /courses/{course_id}/content
     */
    async getCourseContent(courseId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/courses/${courseId}/content?token=${encodeURIComponent(token)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch course content');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Saves or replaces the complete curriculum structure for a course.
     *
     * @param {number|string} courseId - Course ID.
     * @param {Object} contentPayload - Modules and lessons payload.
     * @returns {Promise<Object>} Update confirmation.
     *
     * Endpoint:
     * POST /courses/{course_id}/content
     */
    async updateCourseContent(courseId, contentPayload) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/courses/${courseId}/content?token=${encodeURIComponent(token)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(contentPayload)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to update course content');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves full curriculum playback data for an enrolled student in the course player.
     *
     * @param {number|string} courseId - Course ID.
     * @returns {Promise<Object>} Playback payload including video URLs and progress marks.
     *
     * Endpoint:
     * GET /courses/{course_id}/player
     */
    async getCoursePlayer(courseId) {
        const token = this.getToken();
        const url = new URL(`${API_URL}/courses/${courseId}/player`);
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
            url.searchParams.append('token', token);
        }

        const res = await safeFetch(url.toString(), { headers });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to load course player');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Marks a specific lesson as completed for the current enrolled student.
     *
     * @param {number|string} courseId - Course ID.
     * @param {number|string} lessonId - Lesson ID.
     * @returns {Promise<Object>} Updated progress statistics { progress_percentage, is_completed }.
     *
     * Endpoint:
     * POST /courses/{course_id}/lessons/{lesson_id}/complete
     */
    async completeCourseLesson(courseId, lessonId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/courses/${courseId}/lessons/${lessonId}/complete?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ lesson_id: lessonId })
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to mark lesson complete');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Submits student answers for an end-of-lesson quiz assessment.
     *
     * @param {number|string} courseId - Course ID.
     * @param {number|string} lessonId - Lesson ID.
     * @param {Object} answers - Student answer key { questionId: selectedOption }.
     * @returns {Promise<Object>} Quiz grading results { score, passed, feedback }.
     *
     * Endpoint:
     * POST /courses/{course_id}/lessons/{lesson_id}/quiz
     */
    async submitCourseLessonQuiz(courseId, lessonId, answers) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/courses/${courseId}/lessons/${lessonId}/quiz-submit?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ answers })
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to submit quiz');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves student ratings and reviews for a specific course.
     *
     * @param {number|string} courseId - Course ID.
     * @returns {Promise<Array<Object>>} List of reviews with ratings, text, and student names.
     *
     * Endpoint:
     * GET /courses/{course_id}/reviews
     */
    async getCourseReviews(courseId) {
        const res = await safeFetch(`${API_URL}/courses/${courseId}/reviews`);
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch course reviews');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Submits a student star rating and written review for a course.
     *
     * @param {number|string} courseId - Course ID.
     * @param {number} rating - Star rating (1 to 5).
     * @param {string} comment - Student review commentary.
     * @returns {Promise<Object>} Submitted review record.
     *
     * Endpoint:
     * POST /courses/{course_id}/reviews
     */
    async submitCourseReview(courseId, rating, comment) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/courses/${courseId}/reviews?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ rating: Number(rating), comment: comment || '' })
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to submit review');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves a publicly previewable sample lesson before enrollment.
     *
     * @param {number|string} courseId - Course ID.
     * @param {number|string} lessonId - Lesson ID.
     * @returns {Promise<Object>} Free preview lesson data and video stream.
     *
     * Endpoint:
     * GET /courses/{course_id}/lessons/{lesson_id}/preview
     */
    async getPreviewLesson(courseId, lessonId) {
        const res = await safeFetch(`${API_URL}/courses/${courseId}/preview/${lessonId}`);
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch preview lesson');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves courses for administrative moderation and review.
     *
     * @param {Object} [params={}] - Filter parameters.
     * @returns {Promise<Array<Object>>} Courses list.
     *
     * Endpoint:
     * GET /admin/courses
     */
    async getAdminCourses(params = {}) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const url = new URL(`${API_URL}/admin/courses`);
        url.searchParams.append('token', token);
        Object.keys(params).forEach(k => {
            if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
                url.searchParams.append(k, params[k]);
            }
        });

        const res = await safeFetch(url.toString(), {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch admin courses catalog');
            throw new Error(msg);
        }
        return res.json();
    },

    // --- ENROLLMENT & PROGRESS ---

    /**
     * Enrolls the current student into a free or purchased course.
     *
     * @param {number|string} courseId - Target course ID.
     * @returns {Promise<Object>} Enrollment confirmation { enrollment_id, status }.
     *
     * Endpoint:
     * POST /enrollments/{course_id}
     */
    async enrollCourse(courseId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/courses/${courseId}/enroll?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Enrollment failed');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves all courses currently enrolled by the logged-in student.
     *
     * @returns {Promise<Array<Object>>} List of enrolled courses with progress percentages.
     *
     * Endpoint:
     * GET /my-courses
     */
    async getMyCourses() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/my-courses?token=${encodeURIComponent(token)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch enrolled courses');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Updates student progress timestamps and percentages for a course.
     *
     * @param {number|string} courseId - Course ID.
     * @param {Object} progressData - Progress data { last_lesson_id, current_time }.
     * @returns {Promise<Object>} Updated progress record.
     *
     * Endpoint:
     * POST /progress/{course_id}
     */
    async updateCourseProgress(courseId, progressData) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/courses/${courseId}/progress?token=${encodeURIComponent(token)}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(progressData)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to update progress');
            throw new Error(msg);
        }
        return res.json();
    },

    // --- WISHLIST ---

    /**
     * Toggles a course in or out of the student's wishlist.
     *
     * @param {number|string} courseId - Course ID to add or remove.
     * @returns {Promise<Object>} Updated wishlist state { in_wishlist: boolean }.
     *
     * Endpoint:
     * POST /wishlist/{course_id}/toggle
     */
    async toggleWishlist(courseId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/courses/${courseId}/wishlist?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to update wishlist');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves all courses saved in the student's wishlist.
     *
     * @returns {Promise<Array<Object>>} List of bookmarked courses.
     *
     * Endpoint:
     * GET /wishlist
     */
    async getWishlist() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/wishlist?token=${encodeURIComponent(token)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch wishlist');
            throw new Error(msg);
        }
        return res.json();
    },

    // --- RECOMMENDATIONS & LEARNING PATH ---

    /**
     * Generates personalized AI course recommendations tailored to user skills, career goals, and gaps.
     *
     * @param {Object|string|null} [categoryOrParams=null] - Optional category filter or query parameters.
     * @returns {Promise<Array<Object>>} Ranked course recommendations with match scores and rationales.
     *
     * Endpoint:
     * GET /recommendations
     */
    async getRecommendations(categoryOrParams = null) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const url = new URL(`${API_URL}/recommendations`);
        url.searchParams.append('token', token);

        if (typeof categoryOrParams === 'string' && categoryOrParams !== 'all') {
            url.searchParams.append('category', categoryOrParams);
        } else if (typeof categoryOrParams === 'object' && categoryOrParams !== null) {
            if (categoryOrParams.category && categoryOrParams.category !== 'all') {
                url.searchParams.append('category', categoryOrParams.category);
            }
            if (categoryOrParams.limit) {
                url.searchParams.append('limit', categoryOrParams.limit);
            }
        }

        const res = await safeFetch(url.toString(), {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch recommendations');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Performs skill-gap analysis comparing current student skills against target career goals.
     *
     * @returns {Promise<Object>} Analysis results { target_role, acquired_skills, missing_skills, recommended_actions }.
     *
     * Endpoint:
     * GET /skill-gaps
     */
    async getSkillGaps() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/skill-gaps?token=${encodeURIComponent(token)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch skill gaps');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Generates a step-by-step sequential learning path of courses to bridge identified skill gaps.
     *
     * @returns {Promise<Object>} Learning roadmap with sequential course milestones.
     *
     * Endpoint:
     * GET /learning-path
     */
    async getLearningPath() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/learning-path?token=${encodeURIComponent(token)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch learning path');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves available skill diagnostic assessments and diagnostic quizzes.
     *
     * @returns {Promise<Array<Object>>} Assessment catalog with question counts and durations.
     *
     * Endpoint:
     * GET /assessments
     */
    async getAssessments() {
        const token = this.getToken();
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const url = token ? `${API_URL}/assessments?token=${encodeURIComponent(token)}` : `${API_URL}/assessments`;
        const res = await safeFetch(url, { headers });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch assessments');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves metadata for a specific skill assessment.
     *
     * @param {number|string} assessmentId - Assessment ID.
     * @returns {Promise<Object>} Assessment metadata and instructions.
     *
     * Endpoint:
     * GET /assessments/{assessment_id}
     */
    async getAssessmentDetails(assessmentId) {
        const token = this.getToken();
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const url = token ? `${API_URL}/assessments/${assessmentId}?token=${encodeURIComponent(token)}` : `${API_URL}/assessments/${assessmentId}`;
        const res = await safeFetch(url, { headers });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch assessment questions');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves full assessment questions and choices for an active test session.
     *
     * @param {number|string} assessmentId - Assessment ID.
     * @returns {Promise<Object>} Test paper with questions and multiple-choice options.
     *
     * Endpoint:
     * GET /assessments/{assessment_id}
     */
    async getAssessment(assessmentId) {
        return this.getAssessmentDetails(assessmentId);
    },

    /**
     * Submits student answers for a skill assessment and computes diagnostic score.
     *
     * @param {number|string} assessmentId - Assessment ID.
     * @param {Object} answers - User answers payload.
     * @returns {Promise<Object>} Score, proficiency level (Beginner/Intermediate/Advanced), and recommendations.
     *
     * Endpoint:
     * POST /assessments/{assessment_id}/submit
     */
    async submitAssessment(assessmentId, answers) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/assessments/${assessmentId}/submit?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ answers })
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to submit assessment');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves the student's historical assessment scores and skill badges.
     *
     * @returns {Promise<Array<Object>>} Assessment results history.
     *
     * Endpoint:
     * GET /assessments/my-results
     */
    async getMyAssessmentResults() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/assessments/my-results?token=${encodeURIComponent(token)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch assessment results');
            throw new Error(msg);
        }
        return res.json();
    },

    // --- DASHBOARD SUMMARIES ---

    /**
     * Aggregates student dashboard summary stats: enrolled courses, hours learned, completed certificates, recommendations.
     *
     * @returns {Promise<Object>} Summary statistics object.
     *
     * Endpoint:
     * GET /student/dashboard-summary
     */
    async getStudentDashboardSummary() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/student/dashboard-summary?token=${encodeURIComponent(token)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch student dashboard summary');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Aggregates instructor dashboard metrics: total students, active courses, total revenue, rating average.
     *
     * @returns {Promise<Object>} Instructor summary metrics.
     *
     * Endpoint:
     * GET /instructor/dashboard-summary
     */
    async getInstructorDashboardSummary() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        let res = await safeFetch(`${API_URL}/api/instructor/dashboard-summary?token=${encodeURIComponent(token)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            res = await safeFetch(`${API_URL}/instructor/dashboard-summary?token=${encodeURIComponent(token)}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        }
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch instructor dashboard summary');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves list of students enrolled in the instructor's courses.
     *
     * @param {number|string|null} [courseId=null] - Optional course ID filter.
     * @returns {Promise<Array<Object>>} Enrolled student roster with progress info.
     *
     * Endpoint:
     * GET /instructor/students
     */
    async getInstructorStudents(courseId = null) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        let queryParams = `token=${encodeURIComponent(token)}`;
        if (courseId && courseId !== 'all') {
            queryParams += `&course_id=${encodeURIComponent(courseId)}`;
        }

        let res = await safeFetch(`${API_URL}/api/instructor/students?${queryParams}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            res = await safeFetch(`${API_URL}/instructor/students?${queryParams}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        }
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch instructor students');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves all student feedback and ratings across the instructor's courses.
     *
     * @returns {Promise<Array<Object>>} Reviews list.
     *
     * Endpoint:
     * GET /instructor/reviews
     */
    async getInstructorReviews() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        let res = await safeFetch(`${API_URL}/api/instructor/reviews?token=${encodeURIComponent(token)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            res = await safeFetch(`${API_URL}/instructor/reviews?token=${encodeURIComponent(token)}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        }
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch instructor reviews');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves enrollment trends, revenue analytics, and performance charts for the instructor.
     *
     * @returns {Promise<Object>} Analytics charts data.
     *
     * Endpoint:
     * GET /instructor/analytics
     */
    async getInstructorAnalytics() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        let res = await safeFetch(`${API_URL}/api/instructor/analytics?token=${encodeURIComponent(token)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            res = await safeFetch(`${API_URL}/instructor/analytics?token=${encodeURIComponent(token)}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        }
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch instructor course analytics');
            throw new Error(msg);
        }
        return res.json();
    },



    /**
     * Aggregates platform-wide administrator KPIs: total users, active courses, system enrollments, gross volume.
     *
     * @returns {Promise<Object>} System overview metrics.
     *
     * Endpoint:
     * GET /admin/dashboard-summary
     */
    async getAdminDashboardSummary() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/admin/dashboard-summary?token=${encodeURIComponent(token)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch admin dashboard summary');
            throw new Error(msg);
        }
        return res.json();
    },

    // --- ADMIN SPECIFIC APIS ---

    /**
     * Retrieves courses for administrative moderation and review.
     *
     * @param {Object} [params={}] - Filter parameters.
     * @returns {Promise<Array<Object>>} Courses list.
     *
     * Endpoint:
     * GET /admin/courses
     */
    async getAdminCourses(params = {}) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const url = new URL(`${API_URL}/admin/courses`);
        url.searchParams.append('token', token);
        Object.keys(params).forEach(k => {
            if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
                url.searchParams.append(k, params[k]);
            }
        });

        const res = await safeFetch(url.toString(), {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch admin courses');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Queries all system user accounts across all roles (Student, Instructor, Admin).
     *
     * @param {Object} [params={}] - Filter query parameters { search, role, status, page }.
     * @returns {Promise<Object>} Paginated users list.
     *
     * Endpoint:
     * GET /admin/users
     */
    async getAdminUsers(params = {}) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const queryParams = new URLSearchParams();
        queryParams.append('token', token);
        Object.keys(params).forEach(k => {
            const v = params[k];
            if (v !== undefined && v !== null && v !== '' && v !== 'all') {
                queryParams.append(k, v);
            }
        });

        let res = await safeFetch(`${API_URL}/admin/users?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            res = await safeFetch(`${API_URL}/api/admin/users?${queryParams.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch users');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Activates or suspends a platform user account.
     *
     * @param {number|string} userId - Target user ID.
     * @param {boolean} isActive - New active status.
     * @returns {Promise<Object>} Status update response.
     *
     * Endpoint:
     * PATCH /admin/users/{user_id}/status
     */
    async updateAdminUserStatus(userId, isActive) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        let res = await safeFetch(`${API_URL}/admin/users/${userId}/status?token=${encodeURIComponent(token)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ is_active: isActive ? 1 : 0 })
        });
        if (!res.ok) {
            res = await safeFetch(`${API_URL}/api/admin/users/${userId}/status?token=${encodeURIComponent(token)}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ is_active: isActive ? 1 : 0 })
            });
        }
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to update user status');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminStudents(params = {}) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const queryParams = new URLSearchParams();
        queryParams.append('token', token);
        Object.keys(params).forEach(k => {
            const v = params[k];
            if (v !== undefined && v !== null && v !== '' && v !== 'all') {
                if (k === 'course_id') {
                    if (!isNaN(parseInt(v, 10)) && parseInt(v, 10) > 0) {
                        queryParams.append(k, parseInt(v, 10));
                    }
                } else {
                    queryParams.append(k, v);
                }
            }
        });

        let res = await safeFetch(`${API_URL}/admin/students?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            res = await safeFetch(`${API_URL}/api/admin/students?${queryParams.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch student roster');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminStudentDetail(studentId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        let res = await safeFetch(`${API_URL}/admin/students/${studentId}?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            res = await safeFetch(`${API_URL}/api/admin/students/${studentId}?token=${encodeURIComponent(token)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch student details');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminInstructors(params = {}) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const queryParams = new URLSearchParams();
        queryParams.append('token', token);
        Object.keys(params).forEach(k => {
            const v = params[k];
            if (v !== undefined && v !== null && v !== '' && v !== 'all') {
                queryParams.append(k, v);
            }
        });

        let res = await safeFetch(`${API_URL}/admin/instructors?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            res = await safeFetch(`${API_URL}/api/admin/instructors?${queryParams.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch instructors directory');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminInstructorDetail(instructorId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/admin/instructors/${instructorId}?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch instructor details');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminCategories() {
        const res = await safeFetch(`${API_URL}/admin/categories`);
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch categories');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminSkills() {
        const res = await safeFetch(`${API_URL}/admin/skills`);
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch skills');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminCareerGoals() {
        const res = await safeFetch(`${API_URL}/admin/career-goals`);
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch career goals');
            throw new Error(msg);
        }
        return res.json();
    },

    async createAdminCategory(payload) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/admin/categories`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to create category');
            throw new Error(msg);
        }
        return res.json();
    },

    async updateAdminCategory(categoryId, payload) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/admin/categories/${categoryId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to update category');
            throw new Error(msg);
        }
        return res.json();
    },

    async deleteAdminCategory(categoryId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/admin/categories/${categoryId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to delete category');
            throw new Error(msg);
        }
        return res.json();
    },

    async createAdminSkill(payload) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/admin/skills`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to create skill');
            throw new Error(msg);
        }
        return res.json();
    },

    async updateAdminSkill(skillId, payload) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/admin/skills/${skillId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to update skill');
            throw new Error(msg);
        }
        return res.json();
    },

    async deleteAdminSkill(skillId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/admin/skills/${skillId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to delete skill');
            throw new Error(msg);
        }
        return res.json();
    },

    async createAdminCareerGoal(payload) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/admin/career-goals`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to create career goal');
            throw new Error(msg);
        }
        return res.json();
    },

    async updateAdminCareerGoal(goalId, payload) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/admin/career-goals/${goalId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to update career goal');
            throw new Error(msg);
        }
        return res.json();
    },

    async deleteAdminCareerGoal(goalId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/admin/career-goals/${goalId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to delete career goal');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminAssessments() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/admin/assessments`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch assessments');
            throw new Error(msg);
        }
        return res.json();
    },

    async createAdminAssessment(payload) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/admin/assessments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to create assessment');
            throw new Error(msg);
        }
        return res.json();
    },

    async updateAdminAssessment(assessmentId, payload) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/admin/assessments/${assessmentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to update assessment');
            throw new Error(msg);
        }
        return res.json();
    },

    async deleteAdminAssessment(assessmentId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/admin/assessments/${assessmentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to delete assessment');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminAssessmentQuestions(assessmentId = null) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        let url = `${API_URL}/admin/assessment-questions`;
        if (assessmentId) {
            url += `?assessment_id=${encodeURIComponent(assessmentId)}`;
        }
        const res = await safeFetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch assessment questions');
            throw new Error(msg);
        }
        return res.json();
    },

    async createAdminAssessmentQuestion(payload) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/admin/assessment-questions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to create assessment question');
            throw new Error(msg);
        }
        return res.json();
    },

    async updateAdminAssessmentQuestion(questionId, payload) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/admin/assessment-questions/${questionId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to update assessment question');
            throw new Error(msg);
        }
        return res.json();
    },

    async deleteAdminAssessmentQuestion(questionId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/admin/assessment-questions/${questionId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to delete assessment question');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminEnrollments(params = {}) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const url = new URL(`${API_URL}/admin/enrollments`);
        url.searchParams.append('token', token);
        Object.keys(params).forEach(k => {
            if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
                url.searchParams.append(k, params[k]);
            }
        });
        const res = await safeFetch(url.toString(), {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch enrollments');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminReports() {
        return this.getAdminReportsOverview();
    },

    async getAdminReportsOverview() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/admin/reports/overview?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch reports summary');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminPopularCourses() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/admin/reports/popular-courses?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch popular courses');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminEnrollmentsReport(params = {}) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const queryParams = new URLSearchParams();
        queryParams.append('token', token);
        Object.keys(params).forEach(k => {
            const v = params[k];
            if (v !== undefined && v !== null && v !== '' && v !== 'all') {
                queryParams.append(k, v);
            }
        });

        const res = await safeFetch(`${API_URL}/admin/reports/enrollments?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch enrollments report');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminCoursePerformanceReport() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/admin/reports/course-performance?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch course performance report');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminStudentProgressReport() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/admin/reports/student-progress?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch student progress report');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminInstructorsReport() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/admin/reports/instructors?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch instructors report');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminPaymentsReport() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/admin/reports/payments?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch payments report');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminRecommendationsReport() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/admin/reports/recommendations?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch recommendations report');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminAnalyticsOverview() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/admin/analytics/overview?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch analytics overview');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminAnalyticsCharts() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/admin/analytics/charts?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch analytics charts data');
            throw new Error(msg);
        }
        return res.json();
    },

    getAdminReportExportUrl(reportType) {
        const token = this.getToken();
        const queryParams = new URLSearchParams();
        if (token) queryParams.append('token', token);
        queryParams.append('type', reportType);
        return `${API_URL}/admin/reports/export?${queryParams.toString()}`;
    },

    // --- PAYMENT & RAZORPAY API ---

    async getPaymentConfig() {
        const res = await safeFetch(`${API_URL}/payments/config`);
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch payment configuration');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Initiates a payment transaction order (Razorpay / Stripe) for course enrollment.
     *
     * @param {number|string} courseId - Course ID to purchase.
     * @param {string} [paymentMethod='Card'] - Selected payment method.
     * @returns {Promise<Object>} Order payload { order_id, amount, currency, key_id }.
     *
     * Endpoint:
     * POST /payments/order
     */
    async createPaymentOrder(courseId, paymentMethod = 'Card') {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/payments/create-order?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                course_id: Number(courseId),
                payment_method: paymentMethod
            })
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to create payment order');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Verifies payment gateway signature and unlocks course access.
     *
     * @param {Object} payload - Gateway verification payload { razorpay_order_id, razorpay_payment_id, razorpay_signature, course_id }.
     * @returns {Promise<Object>} Payment confirmation and enrollment activation.
     *
     * Endpoint:
     * POST /payments/verify
     */
    async verifyPayment(payload) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/payments/verify?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Payment verification failed');
            throw new Error(msg);
        }
        return res.json();
    },

    async recordPaymentFailed(payload) {
        const token = this.getToken();
        if (!token) return;

        try {
            await safeFetch(`${API_URL}/payments/failed?token=${encodeURIComponent(token)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
        } catch (_) {}
    },

    async recordPaymentCancel(payload) {
        const token = this.getToken();
        if (!token) return;

        try {
            await safeFetch(`${API_URL}/payments/cancel?token=${encodeURIComponent(token)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
        } catch (_) {}
    },

    /**
     * Retrieves the current student's payment receipts and transaction history.
     *
     * @returns {Promise<Array<Object>>} Transaction receipts history.
     *
     * Endpoint:
     * GET /payments/history
     */
    async getMyPaymentHistory() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/payments/my-history?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch payment history');
            throw new Error(msg);
        }
        return res.json();
    },

    async getPaymentDetails(paymentId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/payments/${paymentId}/details?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch payment details');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminPayments() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/admin/payments?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch platform payments');
            throw new Error(msg);
        }
        return res.json();
    },

    async getInstructorPayments() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/instructor/payments?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch course payments');
            throw new Error(msg);
        }
        return res.json();
    },

    // --- NOTIFICATIONS API ---

    /**
     * Retrieves recent user notifications with pagination support.
     *
     * @param {number} [limit=20] - Maximum number of notifications to return.
     * @returns {Promise<Array<Object>>} List of notifications.
     *
     * Endpoint:
     * GET /notifications
     */
    async getNotifications(limit = 20) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/notifications?limit=${limit}&token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch notifications');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves the count of unread notifications for badge rendering.
     *
     * @returns {Promise<Object>} Object { unread_count: number }.
     *
     * Endpoint:
     * GET /notifications/unread-count
     */
    async getUnreadNotificationCount() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/notifications/unread-count?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch unread notification count');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Marks a specific notification as read.
     *
     * @param {number|string} notificationId - Notification ID.
     * @returns {Promise<Object>} Update confirmation.
     *
     * Endpoint:
     * PATCH /notifications/{notification_id}/read
     */
    async markNotificationAsRead(notificationId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/notifications/${notificationId}/read?token=${encodeURIComponent(token)}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to mark notification as read');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Marks all active notifications as read for the current user.
     *
     * @returns {Promise<Object>} Confirmation.
     *
     * Endpoint:
     * POST /notifications/mark-all-read
     */
    async markAllNotificationsAsRead() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/notifications/read-all?token=${encodeURIComponent(token)}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to mark all notifications as read');
            throw new Error(msg);
        }
        return res.json();
    },

    async deleteNotification(notificationId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/notifications/${notificationId}?token=${encodeURIComponent(token)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to delete notification');
            throw new Error(msg);
        }
        return res.json();
    },

    // --- ADMIN RECOMMENDATION MANAGEMENT ---

    async getAdminRecommendations(params = {}) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const queryParams = new URLSearchParams();
        queryParams.append('token', token);
        if (params.search) queryParams.append('search', params.search);
        if (params.student_id) queryParams.append('student_id', params.student_id);
        if (params.course_id) queryParams.append('course_id', params.course_id);
        if (params.category) queryParams.append('category', params.category);
        if (params.career_goal) queryParams.append('career_goal', params.career_goal);
        if (params.status) queryParams.append('status', params.status);
        if (params.min_score !== undefined && params.min_score !== null && params.min_score !== '') queryParams.append('min_score', params.min_score);
        if (params.date) queryParams.append('date', params.date);
        if (params.page) queryParams.append('page', params.page);
        if (params.limit) queryParams.append('limit', params.limit);

        const res = await safeFetch(`${API_URL}/admin/recommendations?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch recommendation records');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminRecommendationStats() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/admin/recommendations/stats?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch recommendation statistics');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminRecommendationDetails(recommendationId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/admin/recommendations/${recommendationId}?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch recommendation details');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminStudentRecommendations(studentId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/admin/recommendations/student/${studentId}?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch student recommendations');
            throw new Error(msg);
        }
        return res.json();
    },

    async regenerateAdminRecommendationsForStudent(studentId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/admin/recommendations/regenerate/${studentId}?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to regenerate recommendations for student');
            throw new Error(msg);
        }
        return res.json();
    },

    async regenerateAdminRecommendationsAll(studentIds = null) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        };
        if (studentIds && Array.isArray(studentIds) && studentIds.length > 0) {
            options.body = JSON.stringify({ student_ids: studentIds });
        }

        const res = await safeFetch(`${API_URL}/admin/recommendations/regenerate-all?token=${encodeURIComponent(token)}`, options);
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to regenerate recommendations');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAdminRecommendationAnalytics() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/admin/recommendations/analytics?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch recommendation analytics');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves all available academic categories and subject domains.
     *
     * @returns {Promise<Array<Object>>} List of categories { id, name, description, icon }.
     *
     * Endpoint:
     * GET /categories
     */
    async getCategories() {
        const res = await safeFetch(`${API_URL}/categories`);
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch categories');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves standard career goal definitions available for students.
     *
     * @returns {Promise<Array<Object>>} List of career goals { id, title, description, skills }.
     *
     * Endpoint:
     * GET /career-goals
     */
    async getCareerGoals() {
        const res = await safeFetch(`${API_URL}/career-goals`);
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch career goals');
            throw new Error(msg);
        }
        return res.json();
    },

    getAdminRecommendationsExportUrl(params = {}) {
        const token = this.getToken();
        const queryParams = new URLSearchParams();
        if (token) queryParams.append('token', token);
        if (params.search) queryParams.append('search', params.search);
        if (params.category) queryParams.append('category', params.category);
        if (params.career_goal) queryParams.append('career_goal', params.career_goal);
        if (params.status) queryParams.append('status', params.status);
        if (params.min_score !== undefined && params.min_score !== null && params.min_score !== '') queryParams.append('min_score', params.min_score);
        return `${API_URL}/admin/recommendations/export?${queryParams.toString()}`;
    },

    // --- REAL-TIME CHAT & COMMUNICATION ---

    /**
     * Retrieves active direct and group chat conversations for the current user.
     *
     * @returns {Promise<Array<Object>>} Conversations list with last message and unread counters.
     *
     * Endpoint:
     * GET /chat/conversations
     */
    async getConversations() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/chat/conversations?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch conversations');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Creates a new direct or group chat conversation.
     *
     * @param {Object} payload - Conversation parameters { type, title, participant_ids }.
     * @returns {Promise<Object>} Created conversation record.
     *
     * Endpoint:
     * POST /chat/conversations
     */
    async createConversation(payload) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/chat/conversations?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to create conversation');
            throw new Error(msg);
        }
        return res.json();
    },

    async getConversationDetails(convId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/chat/conversations/${convId}?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch conversation details');
            throw new Error(msg);
        }
        return res.json();
    },

    async leaveConversation(convId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/chat/conversations/${convId}?token=${encodeURIComponent(token)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to leave conversation');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves paginated messages for a conversation.
     *
     * @param {number|string} convId - Conversation ID.
     * @param {number} [limit=50] - Message batch limit.
     * @param {number|string|null} [beforeId=null] - Cursor for earlier message history.
     * @returns {Promise<Array<Object>>} List of message records.
     *
     * Endpoint:
     * GET /chat/conversations/{conv_id}/messages
     */
    async getMessages(convId, limit = 50, beforeId = null) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        let url = `${API_URL}/chat/conversations/${convId}/messages?token=${encodeURIComponent(token)}&limit=${limit}`;
        if (beforeId) url += `&before_id=${beforeId}`;

        const res = await safeFetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch messages');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Dispatches a text or attachment message to an active conversation.
     *
     * @param {Object} payload - Message data { conversation_id, content, reply_to_id, attachment_id }.
     * @returns {Promise<Object>} Created message object.
     *
     * Endpoint:
     * POST /chat/messages
     */
    async sendMessage(payload) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/chat/messages?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to send message');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Edits the text content of a previously sent message.
     *
     * @param {number|string} messageId - Message ID.
     * @param {string} content - New message text.
     * @returns {Promise<Object>} Updated message record.
     *
     * Endpoint:
     * PUT /chat/messages/{message_id}
     */
    async editMessage(messageId, content) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/chat/messages/${messageId}?token=${encodeURIComponent(token)}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ content })
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to edit message');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Deletes a chat message for the user or everyone.
     *
     * @param {number|string} messageId - Message ID.
     * @param {boolean} [forEveryone=true] - Whether to delete for all participants.
     * @returns {Promise<Object>} Deletion result.
     *
     * Endpoint:
     * DELETE /chat/messages/{message_id}
     */
    async deleteMessage(messageId, forEveryone = true) {
        if (forEveryone) {
            return this.deleteMessageForEveryone(messageId);
        } else {
            return this.deleteMessageForMe(messageId);
        }
    },

    async deleteMessageForMe(messageId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/chat/messages/${messageId}/me?token=${encodeURIComponent(token)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to delete message for me');
            throw new Error(msg);
        }
        return res.json();
    },

    async deleteMessageForEveryone(messageId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/chat/messages/${messageId}/everyone?token=${encodeURIComponent(token)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to delete message for everyone');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Adds or removes an emoji reaction on a chat message.
     *
     * @param {number|string} messageId - Target message ID.
     * @param {string} emoji - Unicode emoji symbol.
     * @returns {Promise<Object>} Updated reactions list.
     *
     * Endpoint:
     * POST /chat/messages/{message_id}/reactions
     */
    async toggleReaction(messageId, emoji) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/chat/messages/${messageId}/reactions?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ emoji })
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to update reaction');
            throw new Error(msg);
        }
        return res.json();
    },

    async getForwardTargets() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/chat/forward-targets?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch forward targets');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Forwards one or more messages to other conversations or direct contacts.
     *
     * @param {number|string|Array} messageIdOrIds - Target message ID(s).
     * @param {Array<string|number>} [targetConversationIds=[]] - Target conversations.
     * @param {Array<string|number>} [targetUserIds=[]] - Target user IDs.
     * @returns {Promise<Object>} Forwarding result.
     *
     * Endpoint:
     * POST /chat/messages/forward
     */
    async forwardMessage(messageIdOrIds, targetConversationIds = [], targetUserIds = []) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const messageIds = Array.isArray(messageIdOrIds) ? messageIdOrIds : [messageIdOrIds];
        const singleMsgId = Array.isArray(messageIdOrIds) ? messageIdOrIds[0] : messageIdOrIds;

        const payload = {
            target_conversation_ids: targetConversationIds || [],
            target_user_ids: targetUserIds || [],
            message_ids: messageIds
        };

        const endpoint = messageIds.length > 1
            ? `${API_URL}/chat/messages/forward?token=${encodeURIComponent(token)}`
            : `${API_URL}/chat/messages/${singleMsgId}/forward?token=${encodeURIComponent(token)}`;

        const res = await safeFetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to forward message');
            throw new Error(msg);
        }
        return res.json();
    },

    async markConversationRead(convId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/chat/conversations/${convId}/read?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to mark read');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Uploads an attachment file (image, PDF, archive, document) to the chat server.
     *
     * @param {File} file - File selected by user.
     * @returns {Promise<Object>} File metadata { file_id, file_name, file_url, file_size }.
     *
     * Endpoint:
     * POST /chat/upload
     */
    async uploadChatFile(file) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const formData = new FormData();
        formData.append('file', file);

        const res = await safeFetch(`${API_URL}/chat/upload?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to upload attachment');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAllowedContacts() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/chat/allowed-contacts?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch allowed contacts');
            throw new Error(msg);
        }
        return res.json();
    },

    async togglePinConversation(convId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/chat/conversations/${convId}/pin?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to pin conversation');
            throw new Error(msg);
        }
        return res.json();
    },

    async toggleMuteConversation(convId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/chat/conversations/${convId}/mute?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to mute conversation');
            throw new Error(msg);
        }
        return res.json();
    },

    async searchChat(query) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/chat/search?token=${encodeURIComponent(token)}&q=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to search chat');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves member roster for a specific chat group.
     *
     * @param {number|string} groupId - Group conversation ID.
     * @returns {Promise<Object>} Group members list with roles and online statuses.
     *
     * Endpoint:
     * GET /chat/groups/{group_id}/members
     */
    async getGroupMembers(groupId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        let res = await safeFetch(`${API_URL}/groups/${groupId}/members?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            res = await safeFetch(`${API_URL}/chat/conversations/${groupId}/members?token=${encodeURIComponent(token)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch group members');
            throw new Error(msg);
        }
        return res.json();
    },


    async getSharedContent(convId, q = null) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        let url = `${API_URL}/chat/conversations/${convId}/shared-content?token=${encodeURIComponent(token)}`;
        if (q) url += `&q=${encodeURIComponent(q)}`;

        const res = await safeFetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Unable to load shared files. Please try again.');
            throw new Error(msg);
        }
        return res.json();
    },

    async getContactInfo(convId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/chat/conversations/${convId}/contact-info?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Unable to load contact info. Please try again.');
            throw new Error(msg);
        }
        return res.json();
    },

    async clearConversation(convId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/chat/conversations/${convId}/clear?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to clear chat history');
            throw new Error(msg);
        }
        return res.json();
    },

    // --- SECURITY & ACCOUNT SETTINGS ---

    async getSecuritySettings() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/auth/security-settings?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch security settings');
            throw new Error(msg);
        }
        return res.json();
    },

    async getSecuritySettings() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/auth/security-settings?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch security settings');
            throw new Error(msg);
        }
        return res.json();
    },

    async toggle2FA(enabled, currentPassword = '') {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/auth/2fa/toggle?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ enabled: !!enabled, current_password: currentPassword })
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to toggle 2FA');
            throw new Error(msg);
        }
        return res.json();
    },

    async changePassword(currentPassword, newPassword) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await safeFetch(`${API_URL}/auth/change-password?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to change password');
            throw new Error(msg);
        }
        return res.json();
    },

    async forgotPassword(email) {
        const res = await safeFetch(`${API_URL}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to request password reset');
            throw new Error(msg);
        }
        return res.json();
    },

    async resetPasswordWithToken(token, newPassword) {
        const res = await safeFetch(`${API_URL}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token, new_password: newPassword })
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to reset password');
            throw new Error(msg);
        }
        return res.json();
    },

    // --- UNIVERSAL LOGOUT ---

    /**
     * Terminates the active user session, clears stored credentials, and redirects to login gateway.
     *
     * Endpoint:
     * POST /auth/logout
     */
    async logout() {
        const token = this.getToken();
        if (token) {
            try {
                await safeFetch(`${API_URL}/auth/logout?token=${encodeURIComponent(token)}`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } catch (_) {}
        }

        this.clearToken();
        localStorage.removeItem('smartlearn_user');
        localStorage.removeItem('smartlearn_role');
        sessionStorage.clear();

        const currentPath = window.location.pathname.toLowerCase();
        if (currentPath.includes('/student/') || currentPath.includes('/instructor/') || currentPath.includes('/admin/')) {
            window.location.replace('../login.html');
        } else {
            window.location.replace('login.html');
        }
    },

    // --- AI CHATBOT ASSISTANT ---

    /**
     * Submits a user message (typed text or speech-to-text recognized prompt)
     * to the authenticated backend AI chatbot endpoint.
     * @param {string} message - User query or instructional prompt.
     * @param {number|null} [conversationId=null] - Optional conversation session ID to continue.
     * @returns {Promise<Object>} Object containing conversation_id, title, user_message, ai_response, created_at.
     * @throws {Error} If user is unauthenticated or if the backend/AI provider fails.
     */
    async sendChatbotMessage(message, conversationId = null) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const payload = { message: message };
        if (conversationId) payload.conversation_id = Number(conversationId);

        const res = await safeFetch(`${API_URL}/chatbot/message?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to send message to AI Assistant');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Retrieves all saved conversation history sessions belonging to the authenticated user.
     * @returns {Promise<Array<Object>>} List of conversation session summaries.
     * @throws {Error} If user is unauthenticated or request fails.
     */
    async getChatbotConversations() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/chatbot/conversations?token=${encodeURIComponent(token)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch chatbot conversations');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Explicitly initializes a new conversation session for the current authenticated user.
     * @returns {Promise<Object>} Newly created conversation metadata.
     * @throws {Error} If request fails.
     */
    async createChatbotConversation() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/chatbot/conversations?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to create new chatbot conversation');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Fetches the detailed transcript including all messages for a specific conversation session.
     * @param {number|string} conversationId - The ID of the conversation session.
     * @returns {Promise<Object>} Conversation details with array of chronological messages.
     * @throws {Error} If session does not exist or user is unauthorized (403).
     */
    async getChatbotConversation(conversationId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/chatbot/conversations/${conversationId}?token=${encodeURIComponent(token)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch conversation details');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Deletes a conversation session and its associated messages.
     * @param {number|string} conversationId - The ID of the conversation to delete.
     * @returns {Promise<Object>} Confirmation message object.
     * @throws {Error} If user is unauthorized or deletion fails.
     */
    async deleteChatbotConversation(conversationId) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/chatbot/conversations/${conversationId}?token=${encodeURIComponent(token)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to delete chatbot conversation');
            throw new Error(msg);
        }
        return res.json();
    },

    /**
     * Transcribes speech audio recording using server-side AI Whisper model.
     * @param {Blob} audioBlob - Audio binary data recorded from the user's microphone.
     * @param {string} [filename='recording.webm'] - Filename for uploaded audio.
     * @returns {Promise<Object>} { success: true, transcript: string, provider: string }
     */
    async transcribeChatbotVoice(audioBlob, filename = 'recording.webm') {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const formData = new FormData();
        formData.append('file', audioBlob, filename);

        const res = await safeFetch(`${API_URL}/chatbot/transcribe?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Voice transcription failed');
            throw new Error(msg);
        }
        return res.json();
    }
};

if (typeof window !== 'undefined') {
    window.api = api;
}
