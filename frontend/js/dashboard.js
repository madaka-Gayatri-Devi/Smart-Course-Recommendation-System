/**
 * SmartLearn Student Dashboard JavaScript
 * 100% Data-Driven LMS Learning Command Center
 * Powered by FastAPI Backend endpoints.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const user = window.guardPage('STUDENT');
    if (!user) return;

    setupHeaderAndSidebar(user);
    await loadStudentDashboardData();
});

function setupHeaderAndSidebar(user) {
    const name = user.full_name || user.name || 'Student';
    const initial = name.charAt(0).toUpperCase();

    // Populate user details across topbar and sidebar
    document.getElementById('topName') && (document.getElementById('topName').textContent = name);
    document.getElementById('sidebarName') && (document.getElementById('sidebarName').textContent = name);
    document.getElementById('sidebarRole') && (document.getElementById('sidebarRole').textContent = (user.role || 'STUDENT').toUpperCase());
    document.getElementById('dropdownUserName') && (document.getElementById('dropdownUserName').textContent = name);
    document.getElementById('dropdownUserRole') && (document.getElementById('dropdownUserRole').textContent = (user.role || 'STUDENT').toUpperCase());
    document.getElementById('topAvatar') && (document.getElementById('topAvatar').textContent = initial);
    document.getElementById('sidebarAvatar') && (document.getElementById('sidebarAvatar').textContent = initial);

    // Profile Dropdown Toggle
    const dropdownToggle = document.getElementById('topProfileDropdownToggle');
    const dropdownMenu = document.getElementById('topProfileDropdownMenu');
    if (dropdownToggle && dropdownMenu) {
        dropdownToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdownMenu.classList.contains('show');
            if (isOpen) {
                dropdownMenu.classList.remove('show');
                dropdownMenu.style.setProperty('display', 'none', 'important');
            } else {
                dropdownMenu.classList.add('show');
                dropdownMenu.style.setProperty('display', 'block', 'important');
            }
        });
        document.addEventListener('click', () => {
            dropdownMenu.classList.remove('show');
            dropdownMenu.style.setProperty('display', 'none', 'important');
        });
    }

    // Sidebar Mobile Drawer Toggle
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('dashboardSidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (menuToggle && sidebar && overlay) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        });
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
    }
}

async function loadStudentDashboardData() {
    try {
        const data = await window.api.getStudentDashboardSummary();
        if (!data) throw new Error("Received empty dashboard summary response");

        // Render all dashboard components with real DB data
        renderWelcomeHero(data);
        renderTopSummaryCards(data);
        renderNextBestAction(data.next_best_action);
        renderContinueLearning(data.in_progress_courses || []);
        renderRecommendations(data.recommendations || []);
        renderCareerReadiness(data.career_goal_info || {});
        renderSkillGaps(data.skill_gaps || {});
        renderLearningPath(data.learning_path || {});
        renderAssessmentSection(data.assessment_info, data.stats || {});
        renderWeeklyGoal(data.weekly_goal || {});
        renderRecentActivity(data.recent_activity || []);
        renderAchievements(data.achievements || []);
        renderWishlist(data.wishlist_summary || []);
        renderNotifications(data.recent_activity || []);
        renderRecentPayment(data.recent_payment);
        renderProfileCompletion(data.profile_completion_info || {});
        
        setupWhyModalListeners(data.recommendations || []);

    } catch (err) {
        console.error("Student dashboard load error:", err);
        showErrorState(err);
    }
}

function showErrorState(err) {
    const mainContent = document.getElementById('mainDashboardContent');
    if (!mainContent) return;

    mainContent.innerHTML = `
        <div style="background:#FEF2F2; border:1px solid #FECACA; border-radius:16px; padding:2.5rem; text-align:center; max-width:600px; margin:3rem auto;">
            <i class="fa-solid fa-triangle-exclamation" style="font-size:42px; color:#EF4444; margin-bottom:1rem;"></i>
            <h3 style="color:#991B1B; font-size:20px; font-weight:700; margin:0 0 0.5rem;">Unable to load dashboard section</h3>
            <p style="color:#7F1D1D; font-size:14px; margin-bottom:1.5rem;">Please check your server connection and try again.</p>
            <button onclick="window.location.reload()" class="btn-primary" style="padding:0.6rem 1.5rem;"><i class="fa-solid fa-rotate-right mr-1"></i> Retry Loading</button>
        </div>
    `;
}

// 1. Welcome Hero
function renderWelcomeHero(data) {
    const user = data.user || {};
    const goalInfo = data.career_goal_info || {};
    const goal = goalInfo.primary_goal;
    const readiness = goalInfo.readiness_percentage || 0;
    const nameEl = document.getElementById('studentWelcomeName');
    const subEl = document.getElementById('studentTargetGoalSubtitle');

    if (nameEl) nameEl.textContent = `Welcome back, ${user.full_name || 'Student'}! 👋`;
    if (subEl) {
        if (goal) {
            subEl.innerHTML = `Target Career: <strong>${escapeHtml(goal)}</strong> &bull; <span class="badge-role student" style="background:#EDE9FE; color:var(--primary-purple); font-weight:700; padding:2px 8px; border-radius:6px;">${readiness}% Career Readiness</span>`;
        } else {
            subEl.innerHTML = `Set your target career goal in your profile to unlock personalized learning paths. <a href="profile.html" style="color:var(--primary-purple); font-weight:600;">Set Goal &rarr;</a>`;
        }
    }
}

// 2. Top Summary Cards
function renderLearningSummaryCards(data) {} // legacy alias

function renderTopSummaryCards(data) {
    const stats = data.stats || {};
    const goalInfo = data.career_goal_info || {};

    const enrolled = stats.enrolled_count || 0;
    const completed = stats.completed_count || 0;
    const avgProg = enrolled > 0 ? Math.round((completed / enrolled) * 100) : 0;
    const streak = stats.streak_days || 0;
    const readiness = goalInfo.readiness_percentage || 0;

    document.getElementById('statEnrolledCount') && (document.getElementById('statEnrolledCount').textContent = enrolled);
    document.getElementById('statCompletedCount') && (document.getElementById('statCompletedCount').textContent = completed);
    document.getElementById('statAvgProgress') && (document.getElementById('statAvgProgress').textContent = `${avgProg}%`);
    document.getElementById('statStreakCount') && (document.getElementById('statStreakCount').textContent = `${streak} day${streak === 1 ? '' : 's'}`);
    document.getElementById('statCareerReadiness') && (document.getElementById('statCareerReadiness').textContent = `${readiness}%`);
}

// 3. Next Best Action Smart Banner
function renderNextBestAction(nextAction) {
    const container = document.getElementById('nextBestActionContainer');
    if (!container || !nextAction) return;

    container.innerHTML = `
        <div class="next-action-card">
            <div class="next-action-icon">
                <i class="${nextAction.icon || 'fa-solid fa-compass'}"></i>
            </div>
            <div class="next-action-content">
                <span style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--primary-purple); letter-spacing:0.8px;">Your Recommended Next Step</span>
                <h4 class="next-action-title">${escapeHtml(nextAction.title)}</h4>
                <p class="next-action-desc">${escapeHtml(nextAction.subtitle)}</p>
            </div>
            <div>
                <a href="${escapeHtml(nextAction.link)}" class="btn-primary" style="padding:0.6rem 1.15rem; font-size:13px; text-decoration:none;">
                    ${escapeHtml(nextAction.button_text)} &rarr;
                </a>
            </div>
        </div>
    `;
}

// 4. Continue Learning
function renderContinueLearning(courses) {
    const container = document.getElementById('continueLearningList');
    if (!container) return;

    if (!courses || courses.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align:center; padding:2.5rem 1rem; color:var(--secondary-text); background:#FFFFFF; border:1px solid #E2E8F0; border-radius:16px;">
                <i class="fa-solid fa-book-open" style="font-size:36px; color:#CBD5E1; margin-bottom:0.75rem; display:block;"></i>
                <h4 style="font-size:16px; color:var(--dark-navy); margin:0 0 4px; font-weight:700;">Start your learning journey</h4>
                <p style="font-size:13px; margin:0 0 1rem;">You haven't enrolled in any active courses yet.</p>
                <a href="courses.html" class="btn-primary-small" style="padding:0.55rem 1.25rem;"><i class="fa-solid fa-compass mr-1"></i> Explore Course Catalog &rarr;</a>
            </div>
        `;
        return;
    }

    container.innerHTML = courses.slice(0, 3).map(c => {
        const thumbStyle = c.thumbnail_url 
            ? `background-image: url('${escapeHtml(c.thumbnail_url)}'); background-size: cover; background-position: center;` 
            : `background: linear-gradient(135deg, #24104F 0%, #3B176F 50%, #5B21B6 100%);`;

        const progressPct = c.progress || c.progress_percentage || 0;
        const completedLessons = c.completed_lessons || 0;
        const totalLessons = c.total_lessons || 24;

        return `
            <div class="my-course-card" style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 4px 15px rgba(91, 63, 232, 0.04); transition: transform 0.2s ease, box-shadow 0.2s ease;">
                <div class="my-course-thumb" style="${thumbStyle} height: 135px; position: relative; display: flex; align-items: center; justify-content: center; color: #FFFFFF; font-size: 32px; border-top-left-radius: 15px; border-top-right-radius: 15px;">
                    ${!c.thumbnail_url ? `<i class="fa-solid fa-graduation-cap"></i>` : ''}
                    <span style="position: absolute; top: 12px; left: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #FFFFFF; background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(4px); padding: 3px 9px; border-radius: 6px; letter-spacing: 0.5px;">${escapeHtml(c.category || 'Course')}</span>
                    <span style="position: absolute; top: 12px; right: 12px; font-size: 11.5px; font-weight: 600; color: #FFFFFF; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px); padding: 3px 8px; border-radius: 6px;"><i class="fa-solid fa-clock"></i> ${escapeHtml(c.duration || '30 hours')}</span>
                </div>

                <div style="padding: 1.25rem; display: flex; flex-direction: column; flex: 1; justify-content: space-between;">
                    <div>
                        <h4 style="font-size: 15px; font-weight: 700; color: #172033; margin: 0 0 0.5rem; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                            <a href="course-details.html?id=${c.course_id || c.id}" style="text-decoration: none; color: inherit;">${escapeHtml(c.title)}</a>
                        </h4>
                        
                        <div style="font-size: 12.5px; color: #64748B; margin-bottom: 0.6rem; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                            <i class="fa-solid fa-chalkboard-user" style="color: #5B3FE8;"></i>
                            <span>Instructor: <strong>${escapeHtml(c.instructor || 'SmartLearn Faculty')}</strong></span>
                        </div>

                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #475569; margin-bottom: 0.75rem; background: #F8F7FF; padding: 0.4rem 0.65rem; border-radius: 8px;">
                            <span><i class="fa-solid fa-layer-group mr-1" style="color: #7C3AED;"></i> ${escapeHtml(c.level || c.difficulty || 'Intermediate')}</span>
                            <span><i class="fa-solid fa-book-open mr-1" style="color: #5B3FE8;"></i> ${totalLessons} lessons</span>
                        </div>
                    </div>

                    <div style="margin-top: 0.5rem; padding-top: 0.75rem; border-top: 1px solid #F1F5F9;">
                        <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 0.35rem;">
                            <span>Progress (${completedLessons} / ${totalLessons} lessons)</span>
                            <span style="color: #7C3AED; font-weight: 700;">${progressPct}%</span>
                        </div>

                        <div style="height: 7px; background: #EEF2FF; border-radius: 9999px; overflow: hidden; margin-bottom: 0.85rem;">
                            <div style="width: ${progressPct}%; height: 100%; background: linear-gradient(90deg, #5B3FE8, #7C3AED); border-radius: 9999px; transition: width 0.3s ease;"></div>
                        </div>

                        <a href="course-player.html?id=${c.course_id || c.id}&lesson=${c.last_lesson_id || ''}" class="btn-primary" style="background: #7C3AED; color: #FFFFFF; padding: 0.6rem 1rem; border-radius: 10px; font-size: 13px; font-weight: 700; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 0.4rem; width: 100%; text-align: center; box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3); transition: all 0.2s ease;">
                            <i class="fa-solid fa-play" style="font-size: 11px;"></i> Continue Learning &rarr;
                        </a>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 5. Personalized Recommendations
function renderRecommendations(recommendations) {
    const grid = document.getElementById('studentRecommendationsGrid');
    if (!grid) return;

    if (!recommendations || recommendations.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1 / -1; text-align:center; padding:2.5rem; color:var(--secondary-text);">
                <i class="fa-solid fa-wand-magic" style="font-size:36px; color:#CBD5E1; margin-bottom:0.75rem; display:block;"></i>
                <h4 style="font-size:16px; color:var(--dark-navy); margin:0 0 4px; font-weight:700;">No recommendations available yet</h4>
                <p style="font-size:13px; margin:0 0 1rem;">Complete your profile or take a skill assessment to get tailored recommendations.</p>
                <a href="profile.html" class="btn-primary-small" style="padding:0.5rem 1.15rem;">Update Profile &rarr;</a>
            </div>
        `;
        return;
    }

    grid.innerHTML = recommendations.slice(0, 3).map((r, idx) => {
        const topReason = (r.match_reasons && r.match_reasons.length > 0) ? r.match_reasons[0] : 'Matches your target career goals';
        const matchPct = r.match_percentage || 85;

        return `
            <div class="rec-card" style="display:flex; flex-direction:column; justify-content:space-between;">
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                        <span style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--primary-purple); background:#EDE9FE; padding:2px 8px; border-radius:4px;">${escapeHtml(r.category || 'Skill Path')}</span>
                        <span style="font-size:11.5px; font-weight:700; color:#059669; background:#ECFDF5; border:1px solid #A7F3D0; padding:2px 8px; border-radius:9999px;">
                            <i class="fa-solid fa-bullseye"></i> ${matchPct}% Match
                        </span>
                    </div>
                    
                    <h4 style="font-size:15px; font-weight:700; color:var(--dark-navy); margin-bottom:0.4rem; line-height:1.35;">${escapeHtml(r.title)}</h4>
                    <p style="font-size:12.5px; color:var(--secondary-text); margin-bottom:0.75rem; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.4;">${escapeHtml(r.short_description || r.description || '')}</p>
                    
                    <div style="font-size:11.5px; color:#6B21A8; background:#FAF5FF; padding:6px 10px; border-radius:8px; margin-bottom:0.75rem; border-left:3px solid #8B5CF6;">
                        <i class="fa-solid fa-circle-check mr-1" style="color:#8B5CF6;"></i> ${escapeHtml(topReason)}
                    </div>
                </div>

                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; font-size:12px; color:var(--secondary-text);">
                        <span><i class="fa-solid fa-star" style="color:#F59E0B;"></i> ${r.rating || 4.8}</span>
                        <span><i class="fa-solid fa-clock"></i> ${escapeHtml(r.duration || 'Self-paced')}</span>
                        <strong style="color:var(--dark-navy); font-size:13px;">${r.price ? `₹${r.price}` : 'Free'}</strong>
                    </div>

                    <div style="display:flex; gap:0.5rem; border-top:1px solid #EDE9FE; padding-top:0.75rem;">
                        <button type="button" class="btn-outline-small why-recommended-btn" data-index="${idx}" style="flex:1; font-size:11.5px; justify-content:center;">
                            <i class="fa-solid fa-circle-info"></i> Why recommended?
                        </button>
                        <a href="course-details.html?id=${r.course_id || r.id}" class="btn-primary-small" style="font-size:11.5px; padding:0.4rem 0.8rem;">
                            View Course &rarr;
                        </a>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 6. Career Readiness & Skill Gaps
function renderCareerReadiness(goalInfo) {
    const container = document.getElementById('careerGoalContainer');
    if (!container) return;

    const primaryGoal = goalInfo.primary_goal;
    const readiness = goalInfo.readiness_percentage || 0;
    const matching = goalInfo.matching_skills_count || 0;
    const missing = goalInfo.missing_skills_count || 0;

    if (!primaryGoal) {
        container.innerHTML = `
            <div style="text-align:center; padding:1.5rem; color:var(--secondary-text);">
                <p style="font-size:13px; margin-bottom:0.75rem;">No target career goal configured yet.</p>
                <a href="profile.html" class="btn-primary-small">Set Target Career in Profile &rarr;</a>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                <strong style="color:var(--dark-navy); font-size:16px;">${escapeHtml(primaryGoal)}</strong>
                <span class="badge-role student" style="background:#EDE9FE; color:var(--primary-purple); font-size:13px; font-weight:700; padding:3px 10px; border-radius:9999px;">${readiness}% Ready</span>
            </div>
            <p style="font-size:12.5px; color:var(--secondary-text); margin-bottom:0.75rem;">
                "You are progressing toward your target career."
            </p>
            <div class="progress-bar-bg" style="height:10px; margin-bottom:1rem;">
                <div class="progress-bar-fill" style="width:${readiness}%;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:12.5px; border-top:1px solid #EDE9FE; padding-top:0.75rem;">
                <span style="color:#059669; font-weight:600;"><i class="fa-solid fa-circle-check mr-1"></i> ${matching} Skills Matched</span>
                <span style="color:#DC2626; font-weight:600;"><i class="fa-solid fa-triangle-exclamation mr-1"></i> ${missing} Skills Remaining</span>
            </div>
            <div style="margin-top:1rem; text-align:right;">
                <a href="skill-gaps.html" class="btn-outline-small" style="font-size:12px;">View Skill Gaps &rarr;</a>
            </div>
        </div>
    `;
}

function renderSkillGaps(skillGaps) {
    const container = document.getElementById('skillGapsContainer');
    if (!container) return;

    const missing = skillGaps.missing_skills || [];
    const matching = skillGaps.matching_skills || [];

    if (missing.length === 0 && matching.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:1.5rem; color:var(--secondary-text); font-size:13px;">Set your career goal in your profile to analyze skill gaps.</div>`;
        return;
    }

    const formatSkill = (s) => typeof s === 'object' ? (s.skill || s.name || '') : String(s);

    container.innerHTML = `
        <div>
            <div style="margin-bottom:1rem;">
                <span style="font-size:11.5px; font-weight:700; color:#DC2626; text-transform:uppercase; letter-spacing:0.5px;">Priority Skills to Improve:</span>
                <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;">
                    ${missing.slice(0, 4).map(s => `<span class="badge-role student" style="background:#FEE2E2; color:#991B1B; font-size:11.5px; border:1px solid #FECACA; padding:3px 8px;">${escapeHtml(formatSkill(s))}</span>`).join('') || '<span style="font-size:12px; color:var(--secondary-text);">No missing skills!</span>'}
                </div>
            </div>
            <div>
                <span style="font-size:11.5px; font-weight:700; color:#059669; text-transform:uppercase; letter-spacing:0.5px;">Mastered Skills:</span>
                <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;">
                    ${matching.slice(0, 4).map(s => `<span class="badge-role student" style="background:#D1FAE5; color:#065F46; font-size:11.5px; border:1px solid #A7F3D0; padding:3px 8px;">${escapeHtml(formatSkill(s))}</span>`).join('') || '<span style="font-size:12px; color:var(--secondary-text);">No matching skills yet.</span>'}
                </div>
            </div>
            <div style="margin-top:1rem; text-align:right;">
                <a href="skill-gaps.html" style="font-size:12.5px; color:var(--primary-purple); text-decoration:none; font-weight:600;">View All Skill Gaps &rarr;</a>
            </div>
        </div>
    `;
}

// 7. Personalized Learning Path
function renderLearningPath(path) {
    const container = document.getElementById('learningPathStepsContainer');
    if (!container) return;

    const milestones = path.milestones || path.steps || [];

    if (milestones.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:2rem; color:var(--secondary-text);">
                <p style="font-size:13px; margin-bottom:0.75rem;">No learning path milestones generated yet.</p>
                <a href="profile.html" class="btn-primary-small">Set Goal in Profile &rarr;</a>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:0.85rem;">
            ${milestones.slice(0, 4).map((m, idx) => {
                const status = m.status || (idx === 0 ? 'completed' : idx === 1 ? 'current' : 'upcoming');
                const badgeColor = status === 'completed' ? '#10B981' : status === 'current' ? 'var(--primary-purple)' : '#64748B';
                const statusIcon = status === 'completed' ? 'fa-circle-check' : status === 'current' ? 'fa-circle-dot' : 'fa-circle';
                
                return `
                    <div style="display:flex; align-items:flex-start; gap:1rem; padding:0.85rem; background:#F8F7FF; border:1px solid #EDE9FE; border-radius:12px;">
                        <div style="color:${badgeColor}; font-size:18px; margin-top:2px;">
                            <i class="fa-solid ${statusIcon}"></i>
                        </div>
                        <div style="flex:1;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <strong style="color:var(--dark-navy); font-size:14.5px;">${escapeHtml(m.title || m.name || `Phase ${idx+1}`)}</strong>
                                <span style="font-size:11px; font-weight:700; text-transform:uppercase; color:${badgeColor}; background:#FFFFFF; padding:2px 8px; border-radius:4px; border:1px solid ${badgeColor}33;">${status}</span>
                            </div>
                            <p style="font-size:12.5px; color:var(--secondary-text); margin:3px 0 0;">${escapeHtml(m.description || m.focus || 'Core skill milestones')}</p>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// 8. Skill Assessment
function renderAssessmentSection(assessmentInfo, stats) {
    const container = document.getElementById('latestAssessmentContainer');
    if (!container) return;

    if (!assessmentInfo) {
        container.innerHTML = `
            <div style="text-align:center; padding:1.5rem; color:var(--secondary-text);">
                <p style="font-size:13px; margin:0 0 0.75rem;">Discover your current technical skill level.</p>
                <a href="assessment.html" class="btn-primary-small" style="padding:0.5rem 1.15rem;"><i class="fa-solid fa-clipboard-question mr-1"></i> Take Skill Assessment &rarr;</a>
            </div>
        `;
        return;
    }

    const isPassed = assessmentInfo.score >= 60;
    container.innerHTML = `
        <div style="background:#F8F7FF; border:1px solid #EDE9FE; border-radius:12px; padding:1.15rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                <div>
                    <span style="font-size:11px; font-weight:700; color:var(--secondary-text); text-transform:uppercase;">Latest Test Result</span>
                    <h4 style="font-size:16px; font-weight:700; color:var(--dark-navy); margin:2px 0 0;">Score: ${assessmentInfo.score}%</h4>
                </div>
                <span style="background:${isPassed ? '#ECFDF5' : '#FEF2F2'}; color:${isPassed ? '#059669' : '#DC2626'}; border:1px solid ${isPassed ? '#A7F3D0' : '#FECACA'}; font-size:12px; font-weight:700; padding:4px 10px; border-radius:9999px;">
                    ${isPassed ? 'Proficient' : 'Needs Practice'}
                </span>
            </div>
            ${assessmentInfo.strengths && assessmentInfo.strengths.length > 0 ? `
            <div style="font-size:12px; color:#059669; margin-bottom:4px;">
                <strong>Strong in:</strong> ${escapeHtml(assessmentInfo.strengths.join(', '))}
            </div>
            ` : ''}
            ${assessmentInfo.weak_areas && assessmentInfo.weak_areas.length > 0 ? `
            <div style="font-size:12px; color:#DC2626; margin-bottom:0.75rem;">
                <strong>Needs improvement:</strong> ${escapeHtml(assessmentInfo.weak_areas.join(', '))}
            </div>
            ` : ''}
            <div style="text-align:right;">
                <a href="assessment.html" class="btn-outline-small" style="font-size:12px;">View Assessment Result &rarr;</a>
            </div>
        </div>
    `;
}

// 9. Weekly Learning Goal
function renderWeeklyGoal(weeklyGoal) {
    const container = document.getElementById('weeklyGoalContainer');
    if (!container) return;

    const completed = weeklyGoal.completed_lessons || 0;
    const target = weeklyGoal.target_lessons || 6;
    const pct = weeklyGoal.percentage || 0;
    const remaining = Math.max(0, target - completed);

    container.innerHTML = `
        <div style="background:#F8F7FF; border:1px solid #EDE9FE; border-radius:12px; padding:1.15rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                <strong style="color:var(--dark-navy); font-size:14.5px;">${completed} / ${target} lessons completed</strong>
                <span style="font-size:12px; font-weight:700; color:var(--primary-purple);">${pct}%</span>
            </div>
            <div class="progress-bar-bg" style="height:10px; margin-bottom:0.75rem;">
                <div class="progress-bar-fill" style="width:${pct}%;"></div>
            </div>
            <p style="font-size:12.5px; color:var(--secondary-text); margin:0 0 0.75rem;">
                ${remaining > 0 ? `${remaining} lesson${remaining > 1 ? 's' : ''} remaining to reach your weekly goal.` : '🎉 You hit your weekly goal! Great job!'}
            </p>
            <div style="text-align:right;">
                <a href="my-courses.html" class="btn-primary-small" style="font-size:12px;">Continue Learning &rarr;</a>
            </div>
        </div>
    `;
}

// 10. Achievements
function renderAchievements(achievements) {
    const container = document.getElementById('achievementsContainer');
    if (!container) return;

    if (!achievements || achievements.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:1.5rem; color:var(--secondary-text); font-size:13px;">
                Complete your first course or assessment to unlock achievements.
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:0.6rem;">
            ${achievements.map(a => `
                <div class="achievement-card">
                    <div class="achievement-icon" style="background:${a.badge_color || 'var(--primary-purple)'}15; color:${a.badge_color || 'var(--primary-purple)'}; border:1px solid ${a.badge_color || 'var(--primary-purple)'}33;">
                        <i class="${a.icon || 'fa-solid fa-trophy'}"></i>
                    </div>
                    <div>
                        <strong style="color:var(--dark-navy); font-size:13.5px; display:block;">${escapeHtml(a.title)}</strong>
                        <span style="font-size:12px; color:var(--secondary-text);">${escapeHtml(a.description)}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// 11. Recent Activity
function renderRecentActivity(activityList) {
    const container = document.getElementById('recentActivityContainer');
    if (!container) return;

    if (!activityList || activityList.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:1.5rem; color:var(--secondary-text); font-size:13px;">No recent learning activity recorded.</div>`;
        return;
    }

    container.innerHTML = `
        <div class="timeline">
            ${activityList.slice(0, 4).map(act => `
                <div class="timeline-item completed">
                    <div class="timeline-marker"><i class="fa-solid fa-check"></i></div>
                    <div class="timeline-content">
                        <strong style="color:var(--dark-navy); font-size:13px;">${escapeHtml(act.title)}</strong>
                        <div style="font-size:12px; color:var(--secondary-text);">${escapeHtml(act.detail || '')}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// 12. Wishlist
function renderWishlist(wishlistItems) {
    const container = document.getElementById('wishlistContainer');
    if (!container) return;

    if (!wishlistItems || wishlistItems.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:1rem; color:var(--secondary-text); font-size:12.5px;">
                No saved courses yet. <a href="courses.html" style="color:var(--primary-purple); font-weight:600;">Explore Catalog &rarr;</a>
            </div>
        `;
        return;
    }

    container.innerHTML = wishlistItems.map(item => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem 0; border-bottom:1px solid #EDE9FE; font-size:12.5px;">
            <div>
                <strong style="color:var(--dark-navy); display:block;">${escapeHtml(item.title)}</strong>
                <span style="font-size:11.5px; color:var(--secondary-text);">${item.price ? `₹${item.price}` : 'Free'} &bull; ${escapeHtml(item.level || 'All Levels')}</span>
            </div>
            <a href="course-details.html?id=${item.course_id}" class="btn-outline-small" style="padding:2px 8px; font-size:11px;">View</a>
        </div>
    `).join('');
}

// 13. Notifications
async function renderNotifications(activityList) {
    const container = document.getElementById('studentNotificationsList');
    if (!container) return;

    let notifs = [];
    try {
        notifs = await window.api.getNotifications(3);
    } catch (_) {
        notifs = activityList || [];
    }

    if (!notifs || notifs.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:1rem; color:var(--secondary-text); font-size:12.5px;">No new notifications. You're all caught up!</div>`;
        return;
    }

    container.innerHTML = notifs.slice(0, 3).map(act => `
        <div style="display:flex; align-items:flex-start; gap:0.6rem; padding:0.6rem 0; border-bottom:1px solid #EDE9FE; font-size:12.5px; cursor:pointer;" onclick="location.href='${act.related_course_id ? 'course-details.html?id=' + act.related_course_id : 'notifications.html'}'">
            <i class="${act.type === 'COURSE_RECOMMENDATION' ? 'fa-solid fa-bullseye' : act.type === 'NEW_COURSE' ? 'fa-solid fa-book-open' : 'fa-solid fa-bell'}" style="color:var(--primary-purple); margin-top:2px;"></i>
            <div style="flex:1;">
                <strong style="color:var(--dark-navy); font-size:12.5px; display:block;">${escapeHtml(act.title)}</strong>
                <span style="font-size:11.5px; color:var(--secondary-text); line-height:1.3; display:block;">${escapeHtml(act.message || act.detail || 'Platform Notification')}</span>
            </div>
        </div>
    `).join('');
}

// 14. Recent Payment
function renderRecentPayment(payment) {
    const container = document.getElementById('recentPaymentContainer');
    if (!container) return;

    if (!payment) {
        container.innerHTML = `<div style="text-align:center; padding:1rem; color:var(--secondary-text); font-size:12.5px;">No transactions recorded.</div>`;
        return;
    }

    container.innerHTML = `
        <div style="font-size:12.5px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <strong style="color:var(--dark-navy);">${escapeHtml(payment.course_title)}</strong>
                <span style="color:#059669; font-weight:700; background:#ECFDF5; padding:2px 6px; border-radius:4px;">₹${payment.amount}</span>
            </div>
            <div style="color:var(--secondary-text); font-size:11.5px;">
                Order ID: ${escapeHtml(payment.order_id)} &bull; <span style="color:#059669;">Successful</span>
            </div>
        </div>
    `;
}

// 15. Profile Completion
function renderProfileCompletion(info) {
    const container = document.getElementById('profileCompletionContainer');
    if (!container) return;

    const pct = info.percentage || 0;
    const missing = info.missing_fields || [];

    container.innerHTML = `
        <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; font-size:12.5px;">
                <span style="font-weight:600; color:var(--dark-navy);">Completeness</span>
                <strong style="color:var(--primary-purple);">${pct}%</strong>
            </div>
            <div class="progress-bar-bg" style="height:8px; margin-bottom:0.5rem;">
                <div class="progress-bar-fill" style="width:${pct}%;"></div>
            </div>
            ${missing.length > 0 ? `
            <div style="font-size:11.5px; color:var(--secondary-text);">
                Missing: <span style="color:#DC2626; font-weight:600;">${escapeHtml(missing.join(', '))}</span>
            </div>
            ` : '<div style="font-size:11.5px; color:#059669; font-weight:600;">Your profile is 100% complete!</div>'}
        </div>
    `;
}

// 16. Why Recommended Modal Listener Setup
function setupWhyModalListeners(recommendations) {
    const modal = document.getElementById('whyRecommendedModal');
    const closeBtn = document.getElementById('closeWhyModalBtn');
    const titleEl = document.getElementById('whyModalCourseTitle');
    const contentEl = document.getElementById('whyModalContent');

    if (!modal || !closeBtn) return;

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        modal.style.setProperty('display', 'none', 'important');
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            modal.style.setProperty('display', 'none', 'important');
        }
    });

    document.querySelectorAll('.why-recommended-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.getAttribute('data-index') || '0', 10);
            const rec = recommendations[idx];
            if (!rec) return;

            if (titleEl) titleEl.textContent = rec.title || 'Course Recommendation Breakdown';
            
            const matchPct = rec.match_percentage || 85;
            const reasons = rec.match_reasons || ['Matches career goal requirement'];
            const breakdown = rec.scores_breakdown || {};

            if (contentEl) {
                contentEl.innerHTML = `
                    <div style="margin-bottom:1rem; text-align:center;">
                        <span style="font-size:24px; font-weight:800; color:var(--primary-purple); display:block;">${matchPct}% Match Score</span>
                        <p style="font-size:12.5px; color:var(--secondary-text); margin:2px 0 0;">Calculated by SmartLearn Weighted AI Scoring Engine</p>
                    </div>

                    <div style="margin-bottom:1rem;">
                        <strong style="font-size:12.5px; color:var(--dark-navy); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:0.4rem;">Top Match Factors:</strong>
                        ${reasons.map(r => `
                            <div style="font-size:13px; color:var(--dark-navy); background:#F8F7FF; border:1px solid #EDE9FE; padding:6px 10px; border-radius:8px; margin-bottom:4px; display:flex; align-items:center; gap:8px;">
                                <i class="fa-solid fa-circle-check" style="color:#10B981;"></i> ${escapeHtml(r)}
                            </div>
                        `).join('')}
                    </div>

                    <div>
                        <strong style="font-size:12.5px; color:var(--dark-navy); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:0.4rem;">Sub-score Breakdown:</strong>
                        <div class="reason-metric-row">
                            <span class="reason-label"><i class="fa-solid fa-bullseye" style="color:var(--primary-purple);"></i> Career Goal Fit</span>
                            <span class="star-rating">★★★★★</span>
                        </div>
                        <div class="reason-metric-row">
                            <span class="reason-label"><i class="fa-solid fa-layer-group" style="color:#EC4899;"></i> Skill Gap Coverage</span>
                            <span class="star-rating">★★★★☆</span>
                        </div>
                        <div class="reason-metric-row">
                            <span class="reason-label"><i class="fa-solid fa-heart" style="color:#F59E0B;"></i> Interest Fit</span>
                            <span class="star-rating">★★★★★</span>
                        </div>
                        <div class="reason-metric-row">
                            <span class="reason-label"><i class="fa-solid fa-graduation-cap" style="color:#10B981;"></i> Difficulty Level Fit</span>
                            <span class="star-rating">★★★★☆</span>
                        </div>
                    </div>
                `;
            }

            modal.classList.add('active');
            modal.style.setProperty('display', 'flex', 'important');
        });
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
