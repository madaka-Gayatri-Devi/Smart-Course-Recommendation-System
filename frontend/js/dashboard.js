document.addEventListener('DOMContentLoaded', async () => {
    // ----------------------------------------------------
    // AUTHENTICATION CHECK & BACKEND FETCH
    // ----------------------------------------------------
    let userData = null;
    let profileData = null;
    
    try {
        userData = await window.api.getMe();
        profileData = await window.api.getProfile();
    } catch (e) {
        console.error(e);
        window.location.href = '../login.html';
        return;
    }

    // ----------------------------------------------------
    // POPULATE DASHBOARD DATA
    // ----------------------------------------------------
    
    // Topbar Profile
    const topName = document.getElementById('topName');
    const topAvatar = document.getElementById('topAvatar');
    
    if (topName) topName.textContent = userData.full_name;
    if (topAvatar) {
        const names = userData.full_name.split(' ');
        let initials = names[0].charAt(0);
        if (names.length > 1) initials += names[1].charAt(0);
        topAvatar.textContent = initials.toUpperCase();
    }
    
    // Welcome Section
    const welcomeTitle = document.getElementById('welcomeTitle');
    if (welcomeTitle) {
        const firstName = userData.full_name.split(' ')[0];
        welcomeTitle.textContent = `Welcome back, ${firstName} 👋`;
    }

    // Career Goal
    const dashCareer = document.getElementById('dashCareer');
    if (dashCareer) {
        if (profileData && profileData.career_goal) {
            dashCareer.textContent = profileData.career_goal;
        } else {
            dashCareer.textContent = 'Not set';
        }
    }
    
    // Stats (Dynamic data)
    const statSkills = document.getElementById('statSkills');
    if (statSkills) {
        if (profileData && profileData.skills && profileData.skills.length > 0) {
            statSkills.textContent = profileData.skills.length;
        } else {
            statSkills.textContent = 0;
        }
    }

    // ----------------------------------------------------
    // UI INTERACTIONS
    // ----------------------------------------------------
    
    // Mobile Sidebar Toggle
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('dashboardSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (menuToggle && sidebar && overlay) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.add('active');
            overlay.classList.add('active');
        });
        
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
    }

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.api.clearToken();
            window.location.href = '../login.html';
        });
    }
});