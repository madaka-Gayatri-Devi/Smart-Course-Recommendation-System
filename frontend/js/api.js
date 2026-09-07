const API_URL = 'http://localhost:8080';

async function safeFetch(url, options) {
    try {
        const response = await fetch(url, options);
        return response;
    } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            console.error('Backend connection failed. Is the server running on', API_URL, '?', error);
            throw new Error('Unable to connect to SmartLearn server. Please make sure the backend server is running and try again.');
        }
        throw error;
    }
}

const api = {
    getToken() {
        return localStorage.getItem('smartlearn_token');
    },
    
    setToken(token) {
        localStorage.setItem('smartlearn_token', token);
    },
    
    clearToken() {
        localStorage.removeItem('smartlearn_token');
    },

    async register(userData) {
        const res = await safeFetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Registration failed');
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
            const err = await res.json();
            throw new Error(err.detail || 'Login failed');
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
        if (!res.ok) throw new Error('Failed to fetch user');
        return res.json();
    },

    async getProfile() {
        const token = this.getToken();
        if (!token) throw new Error('Not authenticated');
        
        const res = await safeFetch(`${API_URL}/profile?token=${token}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Failed to fetch profile');
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
        if (!res.ok) throw new Error('Failed to save profile');
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

