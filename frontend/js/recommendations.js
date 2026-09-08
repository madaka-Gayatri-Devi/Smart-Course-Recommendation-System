document.addEventListener('DOMContentLoaded', async () => {

    // ----------------------------------------------------
    // AUTHENTICATION & USER INITIALIZATION
    // ----------------------------------------------------
    let currentUser = null;
    let profileData = null;
    const topName = document.getElementById('topName');
    const topAvatar = document.getElementById('topAvatar');
    const sidebarName = document.getElementById('sidebarName');
    const sidebarRole = document.getElementById('sidebarRole');
    const sidebarAvatar = document.getElementById('sidebarAvatar');

    try {
        currentUser = await window.api.getMe();
        profileData = await window.api.getProfile().catch(() => ({}));

        const fullName = currentUser.full_name || 'Student';
        const roleName = currentUser.role ? (currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)) : 'Student';

        if (topName) topName.textContent = fullName;
        if (sidebarName) sidebarName.textContent = fullName;
        if (sidebarRole) sidebarRole.textContent = roleName;

        const names = fullName.trim().split(' ');
        let initials = names[0].charAt(0);
        if (names.length > 1) initials += names[1].charAt(0);
        initials = initials.toUpperCase();

        if (profileData && profileData.profile_image) {
            const imgUrl = window.api.getImageUrl(profileData.profile_image);
            if (topAvatar) topAvatar.innerHTML = `<img src="${imgUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" alt="Profile">`;
            if (sidebarAvatar) sidebarAvatar.innerHTML = `<img src="${imgUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" alt="Profile">`;
        } else {
            if (topAvatar) topAvatar.textContent = initials;
            if (sidebarAvatar) sidebarAvatar.textContent = initials;
        }
    } catch (err) {
        console.error('Not authenticated:', err);
        window.location.href = '../login.html';
        return;
    }

    // ----------------------------------------------------
    // STATE & DOM
    // ----------------------------------------------------
    let currentCategory = 'all';
    let allRecommendations = [];
    const gridEl = document.getElementById('recommendationsListGrid');
    const searchInput = document.getElementById('recSearchInput');

    // Parse URL params (e.g. ?search=python)
    const urlParams = new URLSearchParams(window.location.search);
    const initialSearch = urlParams.get('search');
    if (initialSearch && searchInput) {
        searchInput.value = initialSearch;
    }

    // ----------------------------------------------------
    // LOAD RECOMMENDATIONS
    // ----------------------------------------------------
    async function fetchAndRenderRecommendations() {
        if (!gridEl) return;
        
        gridEl.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                <i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary-purple);"></i>
                <p style="margin-top: 1rem; color: var(--secondary-text);">Loading personalized recommendations...</p>
            </div>
        `;

        try {
            const params = { limit: 10 };
            if (currentCategory && currentCategory !== 'all') {
                params.category = currentCategory;
            }

            const data = await window.api.getRecommendations(params);
            allRecommendations = (data && data.recommendations) ? data.recommendations : [];

            renderFilteredList();
        } catch (err) {
            console.error('Failed to load recommendations:', err);
            gridEl.innerHTML = `
                <div class="empty-state-card" style="grid-column: 1 / -1;">
                    <div class="empty-icon"><i class="fa-solid fa-triangle-exclamation" style="color: #EF4444;"></i></div>
                    <h4>Could not load recommendations</h4>
                    <p>${err.message || 'Please check your connection and try again.'}</p>
                </div>
            `;
        }
    }

    function renderFilteredList() {
        if (!gridEl) return;

        const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
        let list = allRecommendations;

        if (query) {
            list = list.filter(c => 
                (c.title || '').toLowerCase().includes(query) ||
                (c.description || '').toLowerCase().includes(query) ||
                (c.category || '').toLowerCase().includes(query) ||
                (c.skills || []).some(s => s.toLowerCase().includes(query))
            );
        }

        if (list.length === 0) {
            gridEl.innerHTML = `
                <div class="empty-state-card" style="grid-column: 1 / -1;">
                    <div class="empty-icon"><i class="fa-solid fa-compass"></i></div>
                    <h4>No courses found</h4>
                    <p>No recommended courses matched your current filter criteria.</p>
                </div>
            `;
            return;
        }

        gridEl.innerHTML = list.map(course => {
            const skillsTags = (course.skills || []).slice(0, 4).map(s => `<span class="rec-skill-tag">${s}</span>`).join('');
            const reasonsList = (course.match_reasons || []).map(r => `<li>${r}</li>`).join('');

            return `
                <div class="rec-card">
                    <div>
                        <div class="rec-header">
                            <span class="rec-category-badge">${course.category}</span>
                            <span class="rec-match-pill"><i class="fa-solid fa-bullseye"></i> ${course.match_percentage}% Match</span>
                        </div>
                        <h3 class="rec-title" style="font-size: 16px;">${course.title}</h3>
                        <p class="rec-desc" style="-webkit-line-clamp: 3;">${course.description}</p>
                        
                        <div class="rec-meta">
                            <span class="rating"><i class="fa-solid fa-star"></i> ${course.rating}</span>
                            <span><i class="fa-solid fa-clock"></i> ${course.duration}</span>
                            <span><i class="fa-solid fa-layer-group"></i> ${course.level}</span>
                        </div>

                        <div class="rec-reasons">
                            <div class="rec-reasons-title"><i class="fa-solid fa-sparkles"></i> Personalized Match Factors</div>
                            <ul class="rec-reasons-list">
                                ${reasonsList}
                            </ul>
                        </div>

                        <div class="rec-skills">
                            ${skillsTags}
                        </div>
                    </div>

                    <div class="rec-footer">
                        <span class="rec-instructor"><i class="fa-solid fa-chalkboard-user mr-1"></i> ${course.instructor}</span>
                        <a href="courses.html?course=${course.id}" class="btn-enroll-card">View Course Details →</a>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ----------------------------------------------------
    // FILTER BUTTONS
    // ----------------------------------------------------
    const filterButtons = document.querySelectorAll('#filterContainer .filter-btn');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            filterButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentCategory = this.getAttribute('data-category') || 'all';
            fetchAndRenderRecommendations();
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderFilteredList();
        });
    }

    // ----------------------------------------------------
    // MOBILE SIDEBAR & LOGOUT
    // ----------------------------------------------------
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

    document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.api.clearToken();
        window.location.href = '../login.html';
    });

    // Initial fetch
    fetchAndRenderRecommendations();
});
