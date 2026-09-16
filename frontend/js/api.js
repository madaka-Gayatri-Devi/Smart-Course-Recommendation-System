let API_URL = 'http://127.0.0.1:8080';
if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    const proto = window.location.protocol;
    const httpProto = (proto && (proto === 'http:' || proto === 'https:')) ? proto : 'http:';
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
        API_URL = `${httpProto}//127.0.0.1:8080`;
    } else if (host && host !== '') {
        API_URL = `${httpProto}//${host}:8080`;
    } else {
        API_URL = 'http://127.0.0.1:8080';
    }
}

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

    getCurrentUser() {
        const userStr = localStorage.getItem('smartlearn_user');
        if (!userStr) return null;
        try {
            return JSON.parse(userStr);
        } catch (_) {
            return null;
        }
    },

    getToken() {
        return localStorage.getItem('smartlearn_token');
    },
    
    setToken(token) {
        localStorage.setItem('smartlearn_token', token);
    },
    
    clearToken() {
        localStorage.removeItem('smartlearn_token');
    },

    getImageUrl(path) {
        if (!path) return '';
        if (path.startsWith('http://') || path.startsWith('https://')) return path;
        return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
    },

    // --- AUTHENTICATION ---

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

    async saveProfile(profileData) {
        return this.updateProfile(profileData);
    },

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

    async uploadAvatar(file) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const formData = new FormData();
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
        return res.json();
    },

    // --- COURSES ---

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

    async getCourseReviews(courseId) {
        const res = await safeFetch(`${API_URL}/courses/${courseId}/reviews`);
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch course reviews');
            throw new Error(msg);
        }
        return res.json();
    },

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

    async getPreviewLesson(courseId, lessonId) {
        const res = await safeFetch(`${API_URL}/courses/${courseId}/preview/${lessonId}`);
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch preview lesson');
            throw new Error(msg);
        }
        return res.json();
    },

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

    async getAdminReports() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/admin/reports?token=${encodeURIComponent(token)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch reports');
            throw new Error(msg);
        }
        return res.json();
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

    // --- UNIVERSAL LOGOUT ---

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
    }
};

window.api = api;
