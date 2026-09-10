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

    try {
        const pathData = await window.api.getLearningPath();
        document.getElementById('pathCareerGoal').textContent = pathData.career_goal || 'Full Stack Web Developer';
        document.getElementById('pathOverallProgress').textContent = `${pathData.overall_progress_percentage || 0}%`;
        document.getElementById('pathProgressBarFill').style.width = `${pathData.overall_progress_percentage || 0}%`;

        const container = document.getElementById('learningPathMilestones');
        if (container) {
            const milestones = pathData.milestones || [];
            container.innerHTML = milestones.map(m => `
                <div class="dashboard-card" style="padding:1.75rem; border-left: 6px solid ${m.is_completed ? '#10B981' : (m.is_in_progress ? 'var(--primary-purple)' : '#CBD5E1')};">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.75rem;">
                        <span style="font-size:12px; font-weight:800; text-transform:uppercase; color:var(--primary-purple); letter-spacing:0.5px;">
                            Step ${m.step_number}: ${m.stage}
                        </span>
                        <span class="badge-status ${m.is_completed ? 'published' : (m.is_in_progress ? 'active' : 'archived')}">
                            ${m.status.toUpperCase()}
                        </span>
                    </div>

                    <h3 style="font-size:18px; color:var(--dark-navy); margin-bottom:0.5rem;">${m.title}</h3>
                    <p style="color:var(--secondary-text); font-size:13px; line-height:1.6; margin-bottom:1rem;">${m.description}</p>

                    <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:1.25rem;">
                        ${(m.skills || []).map(s => `<span class="rec-skill-tag">${s}</span>`).join('')}
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; padding-top:1rem; border-top:1px solid #EDE9FE;">
                        <span style="font-size:13px; color:var(--secondary-text);"><i class="fa-solid fa-clock mr-1"></i> ${m.duration} • ${m.level}</span>
                        <a href="course-details.html?id=${m.course_id}" class="btn-primary-small" style="text-decoration:none; padding:0.4rem 1rem;">
                            ${m.is_in_progress ? 'Continue →' : (m.is_completed ? 'Review ↺' : 'Start Step →')}
                        </a>
                    </div>
                </div>
            `).join('');
        }
    } catch (err) {
        console.error('Failed to load learning path:', err);
    }
});
