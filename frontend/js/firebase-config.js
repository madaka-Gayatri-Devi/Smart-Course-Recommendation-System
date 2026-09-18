/**
 * SmartLearn Firebase Web Configuration & Google Authentication Handler
 */

let activeFirebaseConfig = {
    apiKey: window.FIREBASE_API_KEY || "",
    authDomain: window.FIREBASE_AUTH_DOMAIN || "smartlearn-auth.firebaseapp.com",
    projectId: window.FIREBASE_PROJECT_ID || "smartlearn-auth",
    storageBucket: "smartlearn-auth.appspot.com",
    messagingSenderId: "102938475610",
    appId: "1:102938475610:web:abc123def456789"
};

async function loadFirebaseConfigFromBackend() {
    try {
        const apiUrl = (window.api && window.api.API_URL) ? window.api.API_URL : "http://127.0.0.1:8080";
        const res = await fetch(`${apiUrl}/auth/firebase-config`);
        if (res.ok) {
            const data = await res.json();
            if (data && data.apiKey) {
                activeFirebaseConfig = { ...activeFirebaseConfig, ...data };
            }
        }
    } catch (_) {}
}

async function initFirebase() {
    if (typeof firebase !== 'undefined' && firebase.apps && !firebase.apps.length) {
        await loadFirebaseConfigFromBackend();
        
        if (!activeFirebaseConfig.apiKey || activeFirebaseConfig.apiKey.includes("DummyKey")) {
            throw new Error("Firebase API Key is missing or invalid. Please populate 'FIREBASE_API_KEY' in backend/.env to enable Google Authentication.");
        }

        try {
            firebase.initializeApp(activeFirebaseConfig);
            console.log("[SmartLearn] Firebase SDK initialized successfully.");
        } catch (err) {
            console.warn("[SmartLearn] Firebase init error:", err);
            throw err;
        }
    }
}

async function signInWithGooglePopup() {
    if (typeof firebase === 'undefined' || !firebase.auth) {
        throw new Error("Firebase Auth SDK is loading. Please check your internet connection.");
    }

    await initFirebase();
    
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');

    try {
        const result = await firebase.auth().signInWithPopup(provider);
        const user = result.user;
        if (!user) {
            throw new Error("Google authentication cancelled or failed.");
        }
        const idToken = await user.getIdToken(true);
        return {
            idToken: idToken,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            uid: user.uid
        };
    } catch (error) {
        console.error("Firebase Google Auth Exception:", error);
        if (error.code === 'auth/api-key-not-valid' || error.message.includes('api-key-not-valid')) {
            throw new Error("Firebase API Key is invalid. Please set your real Firebase API Key in backend/.env under FIREBASE_API_KEY.");
        }
        if (error.code === 'auth/popup-closed-by-user') {
            throw new Error("Google authentication window was closed before signing in.");
        }
        throw new Error(error.message || "Google authentication failed.");
    }
}

window.signInWithGooglePopup = signInWithGooglePopup;
window.initFirebase = initFirebase;
