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
    let currentTrack = 'all';
    let rawApiResponse = null;
    let activeRecommendations = [];
    const gridEl = document.getElementById('recommendationsListGrid');
    const bannerEl = document.getElementById('profileSummaryBanner');
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
                <p style="margin-top: 1rem; color: var(--secondary-text);">Calculating personalized course matches...</p>
            </div>
        `;

        try {
            const params = { limit: 12 };
            if (currentCategory && currentCategory !== 'all') {
                params.category = currentCategory;
            }

            rawApiResponse = await window.api.getRecommendations(params);
            
            // Render Profile Summary Banner
            renderProfileBanner(rawApiResponse);

            // Filter by active track
            updateActiveTrackList();

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

    function renderProfileBanner(data) {
        if (!bannerEl) return;
        const summary = data?.student_profile_summary || {};
        const hasData = Boolean(summary.has_profile_data);
        const goal = summary.career_goal && summary.career_goal !== 'Not specified' ? summary.career_goal : null;
        const skillsCount = summary.skills_count || 0;
        const interestsCount = summary.interests_count || 0;

        if (hasData && (goal || skillsCount > 0)) {
            bannerEl.innerHTML = `
                <div style="background: linear-gradient(135deg, #FAF5FF, #F3E8FF); border: 1px solid #E9D5FF; border-radius: 12px; padding: 1rem 1.25rem; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.85rem;">
                        <div style="width: 40px; height: 40px; border-radius: 10px; background: #8B5CF6; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0;">
                            <i class="fa-solid fa-wand-magic-sparkles"></i>
                        </div>
                        <div>
                            <div style="font-size: 13.5px; font-weight: 700; color: #4C1D95;">
                                Personalized for ${goal ? `<span style="color: #7C3AED; font-weight: 800;">${goal}</span>` : 'Your Learning Profile'}
                            </div>
                            <div style="font-size: 12px; color: #6B21A8; margin-top: 2px;">
                                ${skillsCount} skills analyzed • ${interestsCount} interest areas • Matched against live course catalog
                            </div>
                        </div>
                    </div>
                    <a href="profile.html" class="btn-primary-small" style="text-decoration: none; padding: 0.4rem 0.9rem; font-size: 12px; background: #7C3AED; color: #fff; border-radius: 6px; font-weight: 600; display: inline-flex; align-items: center; gap: 0.35rem;">
                        <i class="fa-solid fa-sliders"></i> Refine Profile
                    </a>
                </div>
            `;
        } else {
            bannerEl.innerHTML = `
                <div style="background: linear-gradient(135deg, #EFF6FF, #DBEAFE); border: 1px solid #BFDBFE; border-radius: 12px; padding: 1rem 1.25rem; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.85rem;">
                        <div style="width: 40px; height: 40px; border-radius: 10px; background: #3B82F6; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0;">
                            <i class="fa-solid fa-lightbulb"></i>
                        </div>
                        <div>
                            <div style="font-size: 13.5px; font-weight: 700; color: #1E3A8A;">
                                Boost Your Recommendation Accuracy!
                            </div>
                            <div style="font-size: 12px; color: #1E40AF; margin-top: 2px;">
                                Add your Career Goal and Technical Skills to receive highly targeted course recommendations.
                            </div>
                        </div>
                    </div>
                    <a href="profile.html" class="btn-primary-small" style="text-decoration: none; padding: 0.45rem 1rem; font-size: 12.5px; background: #2563EB; color: #fff; border-radius: 6px; font-weight: 600; display: inline-flex; align-items: center; gap: 0.35rem;">
                        <i class="fa-solid fa-user-pen"></i> Complete Profile →
                    </a>
                </div>
            `;
        }
    }

    function updateActiveTrackList() {
        if (!rawApiResponse) return;
        if (currentTrack === 'career') {
            activeRecommendations = rawApiResponse.career_goal_recommendations || [];
        } else if (currentTrack === 'gap') {
            activeRecommendations = rawApiResponse.skill_gap_recommendations || [];
        } else if (currentTrack === 'interests') {
            activeRecommendations = rawApiResponse.interest_recommendations || [];
        } else if (currentTrack === 'next_level') {
            activeRecommendations = rawApiResponse.next_level_recommendations || [];
        } else {
            activeRecommendations = rawApiResponse.recommendations || [];
        }
    }

    function renderFilteredList() {
        if (!gridEl) return;

        const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
        let list = activeRecommendations;

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
                    <p>No recommended courses matched your current filter criteria or track selection.</p>
                </div>
            `;
            return;
        }

        gridEl.innerHTML = list.map(course => {
            const matchPct = course.match_percentage || 75;
            let pillBg = '#ECFDF5';
            let pillColor = '#059669';
            let pillBorder = '#A7F3D0';
            let pillLabel = `${matchPct}% Match`;

            if (matchPct >= 88) {
                pillBg = 'linear-gradient(135deg, #10B981, #059669)';
                pillColor = '#FFFFFF';
                pillBorder = 'transparent';
                pillLabel = `${matchPct}% Strong Match 🎯`;
            } else if (matchPct >= 75) {
                pillBg = '#FAF5FF';
                pillColor = '#7C3AED';
                pillBorder = '#DDD6FE';
                pillLabel = `${matchPct}% Match`;
            }

            const matchingSkills = course.skills_matching || [];
            const gapSkills = course.skills_gaps_addressed || [];

            const skillsTags = (course.skills || []).slice(0, 5).map(s => {
                const isMatching = matchingSkills.some(ms => ms.toLowerCase() === s.toLowerCase());
                const isGap = gapSkills.some(gs => gs.toLowerCase() === s.toLowerCase());

                if (isMatching) {
                    return `<span class="rec-skill-tag" style="background:#D1FAE5; color:#065F46; border-color:#A7F3D0;" title="Matching skill in your profile"><i class="fa-solid fa-check mr-1"></i>${s}</span>`;
                } else if (isGap) {
                    return `<span class="rec-skill-tag" style="background:#FEE2E2; color:#991B1B; border-color:#FECACA;" title="Fills a career goal skill gap"><i class="fa-solid fa-sparkles mr-1"></i>${s}</span>`;
                }
                return `<span class="rec-skill-tag">${s}</span>`;
            }).join('');

            const reasonsList = (course.match_reasons || []).map(r => `<li><i class="fa-solid fa-circle-check" style="color: #8B5CF6; font-size: 10px; margin-right: 4px;"></i> ${r}</li>`).join('');

            const enrolledBadge = course.is_enrolled ? `<span style="font-size: 11px; font-weight: 700; background: #DBEAFE; color: #1D4ED8; padding: 2px 8px; border-radius: 9999px; margin-left: 6px;"><i class="fa-solid fa-book-bookmark mr-1"></i>Enrolled</span>` : '';

            return `
                <div class="rec-card">
                    <div>
                        <div class="rec-header">
                            <div>
                                <span class="rec-category-badge">${course.category}</span>
                                ${enrolledBadge}
                            </div>
                            <span class="rec-match-pill" style="background: ${pillBg}; color: ${pillColor}; border: 1px solid ${pillBorder};">
                                ${pillLabel}
                            </span>
                        </div>
                        <h3 class="rec-title" style="font-size: 16px;">${course.title}</h3>
                        <p class="rec-desc" style="-webkit-line-clamp: 3;">${course.description}</p>
                        
                        <div class="rec-meta">
                            <span class="rating"><i class="fa-solid fa-star"></i> ${course.rating || 4.8}</span>
                            <span><i class="fa-solid fa-clock"></i> ${course.duration || 'Self-paced'}</span>
                            <span><i class="fa-solid fa-layer-group"></i> ${course.level || 'All Levels'}</span>
                        </div>

                        <div class="rec-reasons">
                            <div class="rec-reasons-title"><i class="fa-solid fa-wand-magic-sparkles"></i> Personalized Match Factors</div>
                            <ul class="rec-reasons-list" style="list-style: none; padding-left: 0;">
                                ${reasonsList}
                            </ul>
                        </div>

                        <div class="rec-skills">
                            ${skillsTags}
                        </div>
                    </div>

                    <div class="rec-footer">
                        <span class="rec-instructor"><i class="fa-solid fa-chalkboard-user mr-1"></i> ${course.instructor || 'SmartLearn Faculty'}</span>
                        <a href="course-details.html?id=${course.id}" class="btn-enroll-card">View Course Details →</a>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ----------------------------------------------------
    // TRACK CONTROLS
    // ----------------------------------------------------
    const trackButtons = document.querySelectorAll('#trackContainer .filter-btn');
    trackButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            trackButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentTrack = this.getAttribute('data-track') || 'all';
            updateActiveTrackList();
            renderFilteredList();
        });
    });

    // ----------------------------------------------------
    // CATEGORY FILTER CONTROLS
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
