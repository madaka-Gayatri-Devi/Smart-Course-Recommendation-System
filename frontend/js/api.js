const API_URL = 'http://127.0.0.1:8080';

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

    if (res.status === 401) return 'Invalid email or password.';
    if (res.status === 400) return 'Invalid request. Please check your data.';
    if (res.status === 404) return 'Resource not found.';
    if (res.status === 422) return 'Validation error. Please check your inputs.';
    if (res.status >= 500) return 'Something went wrong on the server. Please try again.';
    return fallbackMessage;
}

const api = {
    API_URL,

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
        
        const res = await safeFetch(`${API_URL}/users/me?token=${token}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch user');
            throw new Error(msg);
        }
        return res.json();
    },

    async getProfile() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        
        const res = await safeFetch(`${API_URL}/profile?token=${token}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch profile');
            throw new Error(msg);
        }
        return res.json();
    },

    async saveProfile(profileData) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        
        const res = await safeFetch(`${API_URL}/profile?token=${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profileData)
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to save profile');
            throw new Error(msg);
        }
        return res.json();
    },

    async uploadAvatar(file) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const formData = new FormData();
        formData.append('file', file);

        const res = await safeFetch(`${API_URL}/profile/avatar?token=${token}`, {
            method: 'POST',
            body: formData
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to upload photo');
            throw new Error(msg);
        }
        return res.json();
    },

    // --- ASSESSMENT API ---

    async getAssessments() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/assessments?token=${token}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch assessments');
            throw new Error(msg);
        }
        return res.json();
    },

    async getAssessment(id) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/assessments/${id}?token=${token}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch assessment');
            throw new Error(msg);
        }
        return res.json();
    },

    async submitAssessment(id, answers) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/assessments/${id}/submit?token=${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

        const res = await safeFetch(`${API_URL}/assessments/my-results?token=${token}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch assessment results');
            throw new Error(msg);
        }
        return res.json();
    },

    async getLatestAssessmentResult(id) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await safeFetch(`${API_URL}/assessments/${id}/result?token=${token}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch result');
            throw new Error(msg);
        }
        return res.json();
    },

    // --- RECOMMENDATIONS API ---

    async getRecommendations(params = {}) {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');

        let query = `token=${encodeURIComponent(token)}`;
        if (params.limit) query += `&limit=${encodeURIComponent(params.limit)}`;
        if (params.category) query += `&category=${encodeURIComponent(params.category)}`;

        const res = await safeFetch(`${API_URL}/recommendations?${query}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) {
            const msg = await parseErrorResponse(res, 'Failed to fetch recommendations');
            throw new Error(msg);
        }
        return res.json();
    },

    async checkHealth() {
        try {
            const res = await fetch(`${API_URL}/health`);
            if (res.ok) {
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }
};

window.api = api;
