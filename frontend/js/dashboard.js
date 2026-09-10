/**
 * Student Dashboard JavaScript
 * 100% Dynamic data flow connected to live backend APIs.
 * Renders EXACTLY and ONLY the 9 Student Dashboard sections.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const user = window.guardPage('STUDENT');
    if (!user) return;

    setupStudentHeader(user);
    await loadStudentDashboardData();
});

function setupStudentHeader(user) {
    const name = user.full_name || user.name || 'Student';
    const initial = name.charAt(0).toUpperCase();

    document.getElementById('topName') && (document.getElementById('topName').textContent = name);
    document.getElementById('sidebarName') && (document.getElementById('sidebarName').textContent = name);
    document.getElementById('sidebarRole') && (document.getElementById('sidebarRole').textContent = 'Student');
    document.getElementById('topAvatar') && (document.getElementById('topAvatar').textContent = initial);
    document.getElementById('sidebarAvatar') && (document.getElementById('sidebarAvatar').textContent = initial);
}

async function loadStudentDashboardData() {
    try {
        const data = await window.api.getStudentDashboardSummary();
        if (!data) throw new Error("Could not load student dashboard summary");

        renderWelcomeHero(data);
        renderLearningSummary(data.stats || {});
        renderContinueLearning(data.in_progress_courses || []);
        renderRecommendations(data.recommendations || []);
        renderCareerGoal(data.career_goal_info || {});
        renderSkillGaps(data.skill_gaps || {});
        renderLearningPath(data.learning_path || {});
        renderAssessmentResult(data.stats || {}, data.recent_activity || []);
        renderNotifications(data.recent_activity || []);

    } catch (err) {
        console.error("Student dashboard load error:", err);
    }
}

// 1. Student Welcome Hero
function renderWelcomeHero(data) {
    const user = data.user || {};
    const goal = data.career_goal_info ? data.career_goal_info.primary_goal : null;
    const nameEl = document.getElementById('studentWelcomeName');
    const subEl = document.getElementById('studentTargetGoalSubtitle');

    if (nameEl) nameEl.textContent = `Welcome back, ${user.full_name || 'Student'}! 👋`;
    if (subEl) {
        if (goal) {
            subEl.textContent = `Target Career: ${goal} • ${data.career_goal_info.readiness_percentage || 0}% Career Readiness score.`;
        } else {
            subEl.innerHTML = `Set your career goal in your profile to receive tailored AI recommendations. <a href="profile.html" style="color:var(--primary-purple); font-weight:600;">Set Goal →</a>`;
        }
    }
}

// 2. Learning Summary
function renderLearningSummary(stats) {
    const enrolledEl = document.getElementById('statEnrolledCount');
    const completedEl = document.getElementById('statCompletedCount');
    const progressEl = document.getElementById('statAvgProgress');

    const enrolled = stats.enrolled_count || 0;
    const completed = stats.completed_count || 0;
    const avgProg = enrolled > 0 ? Math.round((completed / enrolled) * 100) : 0;

    if (enrolledEl) enrolledEl.textContent = enrolled;
    if (completedEl) completedEl.textContent = completed;
    if (progressEl) progressEl.textContent = `${avgProg}%`;
}

// 3. Continue Learning
function renderContinueLearning(courses) {
    const container = document.getElementById('continueLearningList');
    if (!container) return;

    if (!courses || courses.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:2rem; color:var(--secondary-text);">
                <p>No courses currently in progress.</p>
                <a href="courses.html" class="btn-primary-small" style="display:inline-block; margin-top:0.75rem; text-decoration:none;">Explore Course Catalog →</a>
            </div>
        `;
        return;
    }

    container.innerHTML = courses.slice(0, 3).map(c => `
        <div style="background:#F8F7FF; border:1px solid #EDE9FE; border-radius:12px; padding:1.25rem; margin-bottom:1rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
            <div style="flex:1; min-width:240px;">
                <span style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--primary-purple); background:#EDE9FE; padding:2px 8px; border-radius:4px;">${escapeHtml(c.category || 'Course')}</span>
                <h4 style="font-size:15px; font-weight:700; color:var(--dark-navy); margin:5px 0 3px;">${escapeHtml(c.title)}</h4>
                <div style="font-size:12px; color:var(--secondary-text);">Instructor: ${escapeHtml(c.instructor || 'Faculty')} • ${c.duration || '30h'}</div>
                <div style="margin-top:0.5rem; max-width:320px;">
                    <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:600; color:var(--secondary-text); margin-bottom:3px;">
                        <span>Progress</span>
                        <span>${c.progress_percentage || 0}%</span>
                    </div>
                    <div style="height:6px; background:#E2E8F0; border-radius:9999px; overflow:hidden;">
                        <div style="height:100%; width:${c.progress_percentage || 0}%; background:linear-gradient(90deg, #7C3AED, #A855F7); border-radius:9999px;"></div>
                    </div>
                </div>
            </div>
            <div>
                <a href="course-player.html?id=${c.course_id || c.id}&lesson=${c.last_lesson_id || ''}" class="btn-primary-small" style="text-decoration:none; padding:0.45rem 1rem; font-weight:600;"><i class="fa-solid fa-play mr-1"></i> Continue Learning →</a>
            </div>
        </div>
    `).join('');
}

// 4. Personalized Recommendations
function renderRecommendations(recommendations) {
    const grid = document.getElementById('studentRecommendationsGrid');
    if (!grid) return;

    if (!recommendations || recommendations.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1 / -1; text-align:center; padding:2.5rem; color:var(--secondary-text);">
                <p>No recommendations available yet. Complete your profile skills or take an assessment to get personalized courses.</p>
                <a href="assessment.html" class="btn-primary-small" style="display:inline-block; margin-top:0.75rem; text-decoration:none;">Take Skill Assessment →</a>
            </div>
        `;
        return;
    }

    grid.innerHTML = recommendations.slice(0, 3).map(r => {
        const skillsTags = (r.skills || []).slice(0, 3).map(s => `<span class="rec-skill-tag">${escapeHtml(s)}</span>`).join('');
        return `
            <div class="rec-card">
                <div>
                    <div class="rec-header">
                        <span class="rec-category-badge">${escapeHtml(r.category || 'General')}</span>
                        <span class="rec-match-pill"><i class="fa-solid fa-star" style="color:#F59E0B;"></i> ${r.rating || 4.8}</span>
                    </div>
                    <h4 class="rec-title">${escapeHtml(r.title)}</h4>
                    <p class="rec-desc">${escapeHtml(r.short_description || r.description || '')}</p>
                    <div class="rec-skills">${skillsTags}</div>
                </div>
                <div class="rec-footer" style="display:flex; justify-content:space-between; align-items:center; margin-top:1rem; padding-top:0.75rem; border-top:1px solid #EDE9FE;">
                    <span style="font-size:12px; color:var(--secondary-text);"><i class="fa-solid fa-clock"></i> ${r.duration || 'Self-paced'}</span>
                    <a href="course-details.html?id=${r.course_id || r.id}" class="btn-primary-small" style="text-decoration:none; padding:0.35rem 0.8rem; font-size:12px;">View Course →</a>
                </div>
            </div>
        `;
    }).join('');
}

// 5. Career Goal
function renderCareerGoal(goalInfo) {
    const container = document.getElementById('careerGoalContainer');
    if (!container) return;

    if (!goalInfo || !goalInfo.primary_goal) {
        container.innerHTML = `
            <div style="text-align:center; padding:1.5rem; color:var(--secondary-text);">
                <p>No primary career goal selected.</p>
                <a href="profile.html" class="btn-primary-small" style="display:inline-block; margin-top:0.5rem; text-decoration:none;">Select Career Goal →</a>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div style="background:#FAF5FF; border:1px solid #E9D5FF; border-radius:10px; padding:1.25rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                <strong style="color:var(--dark-navy); font-size:16px;">${escapeHtml(goalInfo.primary_goal)}</strong>
                <span class="badge-role student" style="font-size:12px; background:#8B5CF6; color:#fff;">${goalInfo.readiness_percentage || 0}% Ready</span>
            </div>
            <p style="font-size:12.5px; color:var(--secondary-text); margin-bottom:0.75rem;">
                ${goalInfo.secondary_goal ? `Secondary Track: ${escapeHtml(goalInfo.secondary_goal)}` : 'Mapped directly to curriculum requirements.'}
            </p>
            <div style="display:flex; gap:0.5rem; font-size:12px; font-weight:600;">
                <span style="color:#059669;"><i class="fa-solid fa-check mr-1"></i> ${goalInfo.matching_skills_count || 0} Skills Mastered</span>
                <span style="color:#DC2626;"><i class="fa-solid fa-triangle-exclamation mr-1"></i> ${goalInfo.missing_skills_count || 0} Skills Missing</span>
            </div>
        </div>
    `;
}

// 6. Skill Gap Analysis
function renderSkillGaps(skillGaps) {
    const container = document.getElementById('skillGapsContainer');
    if (!container) return;

    const missing = skillGaps.missing_skills || [];
    const matching = skillGaps.matching_skills || [];

    if (missing.length === 0 && matching.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:1.5rem; color:var(--secondary-text);">Set career goal in profile to calculate skill gaps.</div>`;
        return;
    }

    container.innerHTML = `
        <div>
            <div style="margin-bottom:0.75rem;">
                <span style="font-size:12px; font-weight:700; color:#DC2626; text-transform:uppercase;">Priority Missing Skills:</span>
                <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
                    ${missing.slice(0, 4).map(s => `<span class="badge-role student" style="background:#FEE2E2; color:#991B1B; font-size:11px; border:1px solid #FECACA;">${escapeHtml(s)}</span>`).join('') || '<span style="font-size:12px; color:var(--secondary-text);">None! You have all required skills.</span>'}
                </div>
            </div>
            <div>
                <span style="font-size:12px; font-weight:700; color:#059669; text-transform:uppercase;">Mastered Skills:</span>
                <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
                    ${matching.slice(0, 4).map(s => `<span class="badge-role student" style="background:#D1FAE5; color:#065F46; font-size:11px; border:1px solid #A7F3D0;">${escapeHtml(s)}</span>`).join('') || '<span style="font-size:12px; color:var(--secondary-text);">No matching skills yet.</span>'}
                </div>
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
                <p>No learning path milestones generated yet. Select a career goal to generate your roadmap.</p>
                <a href="profile.html" class="btn-primary-small" style="display:inline-block; margin-top:0.5rem; text-decoration:none;">Set Goal in Profile →</a>
            </div>
        `;
        return;
    }

    container.innerHTML = milestones.slice(0, 3).map((m, idx) => `
        <div style="display:flex; align-items:flex-start; gap:1rem; margin-bottom:1rem; padding-bottom:1rem; border-bottom:1px solid #EDE9FE;">
            <div style="width:32px; height:32px; border-radius:50%; background:linear-gradient(135deg, #7C3AED, #A855F7); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; flex-shrink:0;">
                ${idx + 1}
            </div>
            <div style="flex:1;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong style="color:var(--dark-navy); font-size:14.5px;">${escapeHtml(m.title || m.name || `Phase ${idx+1}`)}</strong>
                    <span style="font-size:11px; font-weight:700; color:var(--primary-purple); background:#EDE9FE; padding:2px 8px; border-radius:4px;">${escapeHtml(m.level || 'Recommended')}</span>
                </div>
                <p style="font-size:12.5px; color:var(--secondary-text); margin:3px 0 0;">${escapeHtml(m.description || m.focus || 'Focus on foundational topics.')}</p>
            </div>
        </div>
    `).join('');
}

// 8. Assessment Result
function renderAssessmentResult(stats, recentActivity) {
    const container = document.getElementById('latestAssessmentContainer');
    if (!container) return;

    const score = stats.latest_assessment_score;

    if (score === null || score === undefined) {
        container.innerHTML = `
            <div style="text-align:center; padding:1.5rem; color:var(--secondary-text);">
                <p>No assessments completed yet.</p>
                <a href="assessment.html" class="btn-primary-small" style="display:inline-block; margin-top:0.5rem; text-decoration:none;">Take 15-min Skill Assessment →</a>
            </div>
        `;
        return;
    }

    const isPassed = score >= 60;
    container.innerHTML = `
        <div style="background:#F8F7FF; border:1px solid #EDE9FE; border-radius:10px; padding:1.25rem; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <strong style="color:var(--dark-navy); font-size:15px;">Technical Diagnostic Test</strong>
                <p style="font-size:12px; color:var(--secondary-text); margin:2px 0 0;">Evaluated recently on platform benchmark.</p>
            </div>
            <div style="text-align:right;">
                <span class="rec-match-pill" style="background:${isPassed ? '#10B981' : '#EF4444'}; color:#fff; font-size:13px; font-weight:700; padding:4px 10px; border-radius:9999px;">
                    ${score}% ${isPassed ? '• Proficient' : '• Needs Practice'}
                </span>
            </div>
        </div>
    `;
}

// 9. Notifications
function renderNotifications(recentActivity) {
    const container = document.getElementById('studentNotificationsList');
    if (!container) return;

    if (!recentActivity || recentActivity.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:1.5rem; color:var(--secondary-text);">
                <p>All caught up! No unread notifications.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = recentActivity.slice(0, 3).map(act => `
        <div style="display:flex; align-items:center; gap:0.75rem; padding:0.6rem 0; border-bottom:1px solid #EDE9FE; font-size:12.5px;">
            <i class="fa-solid fa-circle-check" style="color:var(--primary-purple);"></i>
            <span style="color:var(--dark-navy);">${escapeHtml(act.activity_type || 'Activity')}: ${escapeHtml(act.title || '')}</span>
        </div>
    `).join('');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
