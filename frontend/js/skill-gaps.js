document.addEventListener('DOMContentLoaded', async () => {
    let currentUser = null;
    let profileData = null;
    try {
        currentUser = await window.api.getMe();
        profileData = await window.api.getProfile().catch(() => ({}));

        const fullName = currentUser.full_name || 'Student';
        document.getElementById('topName') && (document.getElementById('topName').textContent = fullName);
        document.getElementById('sidebarName') && (document.getElementById('sidebarName').textContent = fullName);

        const names = fullName.trim().split(' ');
        let initials = names[0].charAt(0);
        if (names.length > 1) initials += names[1].charAt(0);
        initials = initials.toUpperCase();

        if (profileData && profileData.profile_image) {
            const imgUrl = window.api.getImageUrl(profileData.profile_image);
            const imgTag = `<img src="${imgUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" alt="Profile">`;
            document.getElementById('topAvatar') && (document.getElementById('topAvatar').innerHTML = imgTag);
            document.getElementById('sidebarAvatar') && (document.getElementById('sidebarAvatar').innerHTML = imgTag);
        } else {
            document.getElementById('topAvatar') && (document.getElementById('topAvatar').textContent = initials);
            document.getElementById('sidebarAvatar') && (document.getElementById('sidebarAvatar').textContent = initials);
        }
    } catch (e) {
        window.location.href = '../login.html';
        return;
    }

    // Toggle & Logout
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('dashboardSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (menuToggle && sidebar && overlay) {
        menuToggle.addEventListener('click', () => { sidebar.classList.add('active'); overlay.classList.add('active'); });
        overlay.addEventListener('click', () => { sidebar.classList.remove('active'); overlay.classList.remove('active'); });
    }
    document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.api.clearToken();
        window.location.href = '../login.html';
    });

    // Fetch and render skill gaps
    try {
        const gapData = await window.api.getSkillGaps();
        document.getElementById('gapTargetRole').textContent = gapData.career_goal || 'Full Stack Web Developer';
        document.getElementById('gapReadinessPct').textContent = `${gapData.readiness_percentage || 0}%`;
        document.getElementById('gapReadinessFill').style.width = `${gapData.readiness_percentage || 0}%`;
        document.getElementById('gapMatchingCount').textContent = gapData.matching_count || 0;
        document.getElementById('gapMissingCount').textContent = gapData.missing_count || 0;

        const detailedList = document.getElementById('skillsDetailedList');
        if (detailedList) {
            const items = gapData.all_skills_analysis || [];
            detailedList.innerHTML = items.map(item => `
                <div style="background:#F8F7FF; border:1px solid #EDE9FE; border-radius:10px; padding:1rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                        <strong style="color:var(--dark-navy); font-size:14px;">${item.skill}</strong>
                        <span style="font-size:12px; font-weight:700; color:${item.is_missing ? 'var(--magenta-pink)' : '#10B981'};">
                            ${item.is_missing ? 'Missing (Gap)' : `Verified (${item.proficiency})`}
                        </span>
                    </div>
                    <div class="progress-bar-bg" style="height:6px;">
                        <div class="progress-bar-fill" style="width:${item.proficiency_percentage}%; background:${item.is_missing ? 'linear-gradient(90deg, #F43F5E, #E83FA5)' : '#10B981'}; height:100%;"></div>
                    </div>
                </div>
            `).join('');
        }

        const bridgeList = document.getElementById('bridgeCoursesList');
        if (bridgeList) {
            const bridge = gapData.recommended_bridge_courses || [];
            if (bridge.length === 0) {
                bridgeList.innerHTML = '<p style="color:var(--secondary-text);">Great job! You have acquired all core skills for your role.</p>';
            } else {
                bridgeList.innerHTML = bridge.map(b => `
                    <div style="background:#FFFFFF; border:1px solid #EDE9FE; border-radius:12px; padding:1.25rem; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <span class="badge-role student" style="font-size:10px; margin-bottom:0.25rem;">${b.category}</span>
                            <h4 style="font-size:15px; color:var(--dark-navy); margin:0.25rem 0;">${b.title}</h4>
                            <span style="font-size:12px; color:var(--magenta-pink); font-weight:600;">
                                Closes: ${(b.matched_missing_skills || []).join(', ')}
                            </span>
                        </div>
                        <a href="course-details.html?id=${b.course_id}" class="btn-primary-small" style="text-decoration:none; padding:0.4rem 0.8rem;">View →</a>
                    </div>
                `).join('');
            }
        }
    } catch (err) {
        console.error('Failed to load skill gaps:', err);
    }
});
