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
        const goal = pathData.career_goal || 'Full Stack Web Developer';
        const secGoal = pathData.secondary_career_goal;
        const totalSteps = pathData.total_steps || 4;
        const completedSteps = pathData.completed_steps || 0;
        const progressPct = pathData.overall_progress_percentage || 0;
        const readinessPct = pathData.readiness_percentage || 0;

        document.getElementById('pathCareerGoal') && (document.getElementById('pathCareerGoal').textContent = secGoal ? `${goal} (${secGoal})` : goal);
        document.getElementById('pathCompletedSteps') && (document.getElementById('pathCompletedSteps').textContent = `${completedSteps} / ${totalSteps}`);
        document.getElementById('pathOverallProgress') && (document.getElementById('pathOverallProgress').textContent = `${progressPct}%`);
        document.getElementById('pathReadiness') && (document.getElementById('pathReadiness').textContent = `${readinessPct}%`);
        document.getElementById('pathProgressBarFill') && (document.getElementById('pathProgressBarFill').style.width = `${progressPct}%`);

        const badgeEl = document.getElementById('pathProgressBadge');
        if (badgeEl) {
            if (completedSteps === totalSteps && totalSteps > 0) {
                badgeEl.className = 'badge-status published';
                badgeEl.textContent = 'Path Completed 🎉';
            } else if (progressPct > 0) {
                badgeEl.className = 'badge-status in-progress';
                badgeEl.textContent = 'In Progress';
            } else {
                badgeEl.className = 'badge-status active';
                badgeEl.textContent = 'Ready to Start';
            }
        }

        const container = document.getElementById('learningPathMilestones');
        if (container) {
            const milestones = pathData.milestones || [];
            if (milestones.length === 0) {
                container.innerHTML = `
                    <div style="text-align:center; padding:3rem; color:var(--secondary-text);">
                        <p>No learning path milestones generated yet. Complete your profile goals to get a tailored roadmap.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = milestones.map(m => {
                const isCompleted = m.is_completed || m.status === 'COMPLETED';
                const isInProgress = m.is_in_progress || m.status === 'IN PROGRESS';
                const isLocked = m.is_locked || m.status === 'LOCKED';
                const isAvailable = !isLocked && !isCompleted && !isInProgress;

                let borderLeftColor = '#CBD5E1';
                let statusBadgeClass = 'archived';
                let statusBadgeText = m.status || 'AVAILABLE';

                if (isCompleted) {
                    borderLeftColor = '#10B981';
                    statusBadgeClass = 'published';
                    statusBadgeText = 'COMPLETED ✓';
                } else if (isInProgress) {
                    borderLeftColor = '#7C3AED';
                    statusBadgeClass = 'in-progress';
                    statusBadgeText = 'IN PROGRESS';
                } else if (isAvailable) {
                    borderLeftColor = '#3B82F6';
                    statusBadgeClass = 'active';
                    statusBadgeText = 'AVAILABLE';
                } else if (isLocked) {
                    borderLeftColor = '#94A3B8';
                    statusBadgeClass = 'archived';
                    statusBadgeText = 'LOCKED 🔒';
                }

                // Action button
                let actionBtnHtml = '';
                if (isCompleted) {
                    actionBtnHtml = `
                        <a href="course-player.html?id=${m.course_id}" class="btn-primary-small" style="background:#ECFDF5; color:#059669; border:1px solid #A7F3D0; text-decoration:none; padding:0.45rem 1.1rem; border-radius:6px; font-weight:700; font-size:12.5px; display:inline-flex; align-items:center; gap:0.4rem;">
                            <i class="fa-solid fa-circle-check"></i> Review Course ✓
                        </a>
                    `;
                } else if (isInProgress) {
                    actionBtnHtml = `
                        <a href="course-player.html?id=${m.course_id}" class="btn-primary-small" style="background:var(--primary-purple); color:#FFFFFF; text-decoration:none; padding:0.45rem 1.1rem; border-radius:6px; font-weight:700; font-size:12.5px; display:inline-flex; align-items:center; gap:0.4rem;">
                            <i class="fa-solid fa-play"></i> Continue Learning →
                        </a>
                    `;
                } else if (isAvailable) {
                    actionBtnHtml = `
                        <a href="course-details.html?id=${m.course_id}" class="btn-primary-small" style="background:linear-gradient(135deg, #7C3AED, #A855F7); color:#FFFFFF; text-decoration:none; padding:0.45rem 1.1rem; border-radius:6px; font-weight:700; font-size:12.5px; display:inline-flex; align-items:center; gap:0.4rem;">
                            <i class="fa-solid fa-arrow-right"></i> Start Step →
                        </a>
                    `;
                } else {
                    actionBtnHtml = `
                        <button class="btn-secondary-small" disabled style="opacity:0.65; cursor:not-allowed; background:#F1F5F9; color:#64748B; border:1px solid #CBD5E1; padding:0.45rem 1.1rem; border-radius:6px; font-weight:600; font-size:12.5px; display:inline-flex; align-items:center; gap:0.4rem;">
                            <i class="fa-solid fa-lock"></i> Locked 🔒
                        </button>
                    `;
                }

                return `
                    <div class="dashboard-card" style="padding:1.75rem 2rem; border-left: 6px solid ${borderLeftColor}; position:relative; ${isLocked ? 'opacity:0.85; background:#FAFAFC;' : ''}">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.75rem;">
                            <div style="display:flex; align-items:center; gap:0.6rem;">
                                <span style="background:${isCompleted ? '#D1FAE5' : (isInProgress ? '#EDE9FE' : (isAvailable ? '#DBEAFE' : '#F1F5F9'))}; color:${isCompleted ? '#065F46' : (isInProgress ? '#5B21B6' : (isAvailable ? '#1E40AF' : '#475569'))}; font-size:12px; font-weight:800; padding:3px 10px; border-radius:20px; text-transform:uppercase; letter-spacing:0.5px;">
                                    Step ${m.step_number} • ${m.stage}
                                </span>
                            </div>
                            <span class="badge-status ${statusBadgeClass}" style="font-size:12px; font-weight:700;">
                                ${statusBadgeText}
                            </span>
                        </div>

                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap;">
                            <div style="flex:1; min-width:280px;">
                                <h3 style="font-size:18px; color:var(--dark-navy); margin-bottom:0.4rem; font-weight:700;">${m.title}</h3>
                                <p style="color:var(--secondary-text); font-size:13.5px; line-height:1.6; margin-bottom:0.85rem;">${m.description}</p>
                            </div>
                        </div>

                        ${m.why_recommended ? `
                            <div style="background:#FAF5FF; border:1px solid #EDE9FE; border-radius:8px; padding:0.5rem 0.85rem; margin-bottom:0.85rem; display:inline-flex; align-items:center; gap:0.5rem; font-size:12.5px; color:#6B21A8; font-weight:600;">
                                <i class="fa-solid fa-lightbulb" style="color:#A855F7;"></i>
                                <span>${m.why_recommended}</span>
                            </div>
                        ` : ''}

                        ${isLocked && m.prerequisite_note ? `
                            <div style="background:#FEF2F2; border:1px solid #FEE2E2; border-radius:8px; padding:0.5rem 0.85rem; margin-bottom:0.85rem; display:flex; align-items:center; gap:0.5rem; font-size:12.5px; color:#B91C1C; font-weight:600;">
                                <i class="fa-solid fa-lock"></i>
                                <span>Prerequisite: ${m.prerequisite_note}</span>
                            </div>
                        ` : ''}

                        ${(isInProgress || isCompleted) ? `
                            <div style="margin-bottom:1rem;">
                                <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:600; color:var(--secondary-text); margin-bottom:4px;">
                                    <span>Milestone Progress</span>
                                    <span>${m.progress_percentage || 0}%</span>
                                </div>
                                <div style="height:6px; background:#E2E8F0; border-radius:9999px; overflow:hidden;">
                                    <div style="height:100%; width:${m.progress_percentage || 0}%; background:${isCompleted ? '#10B981' : 'linear-gradient(90deg, #7C3AED, #A855F7)'}; border-radius:9999px;"></div>
                                </div>
                            </div>
                        ` : ''}

                        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:1.15rem;">
                            ${(m.skills || []).map(s => `<span class="rec-skill-tag" style="font-size:11.5px; padding:3px 9px;">${s}</span>`).join('')}
                        </div>

                        <div style="display:flex; justify-content:space-between; align-items:center; padding-top:0.85rem; border-top:1px solid #EDE9FE; flex-wrap:wrap; gap:0.75rem;">
                            <span style="font-size:13px; color:var(--secondary-text);">
                                <i class="fa-solid fa-clock mr-1" style="color:var(--primary-purple);"></i> ${m.duration} • 
                                <i class="fa-solid fa-signal mr-1 ml-2" style="color:var(--primary-purple);"></i> ${m.level} • 
                                <i class="fa-solid fa-chalkboard-user mr-1 ml-2" style="color:var(--primary-purple);"></i> ${m.instructor}
                            </span>
                            <div>
                                ${actionBtnHtml}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (err) {
        console.error('Failed to load learning path:', err);
    }
});

