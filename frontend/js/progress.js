/**
 * Student Progress & Mastery Telemetry
 * Real database data flow from /users/me, /profile, /my-courses, /assessments/my-results
 */

document.addEventListener('DOMContentLoaded', async () => {
    let currentUser = null;
    let profileData = null;
    let myCourses = [];
    let assessmentAttempts = [];

    try {
        const token = window.api.getToken();
        if (!token) {
            window.location.replace('../login.html');
            return;
        }

        currentUser = await window.api.getMe();
        if (!currentUser) {
            window.location.replace('../login.html');
            return;
        }

        const role = (currentUser.role || 'STUDENT').toUpperCase();
        if (role !== 'STUDENT') {
            if (role === 'ADMIN') window.location.replace('../admin/dashboard.html');
            else if (role === 'INSTRUCTOR') window.location.replace('../instructor/dashboard.html');
            return;
        }

        // Fetch user profile and progress data gracefully
        try { profileData = await window.api.getProfile(); } catch (_) { profileData = {}; }
        try { myCourses = await window.api.getMyCourses(); } catch (_) { myCourses = []; }
        try { assessmentAttempts = await window.api.getMyAssessmentResults(); } catch (_) { assessmentAttempts = []; }

        renderStudentHeader(currentUser, profileData);
        renderProgressSummary(profileData, myCourses, assessmentAttempts);
        renderActiveCourseProgress(myCourses);
        renderAssessmentHistory(assessmentAttempts);

    } catch (err) {
        console.error("Progress page error:", err);
        // Only redirect if genuinely 401 unauthenticated
        if (err.message && (err.message.includes('401') || err.message.includes('Not authenticated'))) {
            window.location.replace('../login.html');
        }
    }

    // Setup sidebar toggle and universal logout
    setupSidebarAndLogout();
});

function renderStudentHeader(user, profile) {
    const fullName = user.full_name || user.name || 'Student';
    const roleName = 'Student';

    document.getElementById('topName') && (document.getElementById('topName').textContent = fullName);
    document.getElementById('sidebarName') && (document.getElementById('sidebarName').textContent = fullName);
    document.getElementById('sidebarRole') && (document.getElementById('sidebarRole').textContent = roleName);

    const names = fullName.trim().split(' ');
    let initials = names[0].charAt(0);
    if (names.length > 1) initials += names[1].charAt(0);
    initials = initials.toUpperCase();

    if (profile && profile.profile_image) {
        const imgUrl = window.api.getImageUrl(profile.profile_image);
        const imgTag = `<img src="${imgUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" alt="Profile">`;
        document.getElementById('topAvatar') && (document.getElementById('topAvatar').innerHTML = imgTag);
        document.getElementById('sidebarAvatar') && (document.getElementById('sidebarAvatar').innerHTML = imgTag);
    } else {
        document.getElementById('topAvatar') && (document.getElementById('topAvatar').textContent = initials);
        document.getElementById('sidebarAvatar') && (document.getElementById('sidebarAvatar').textContent = initials);
    }
}

function renderProgressSummary(profile, courses, attempts) {
    const enrolledCount = (courses && courses.length) || (profile.courses && profile.courses.length) || 0;
    const completedCourses = courses ? courses.filter(c => c.progress_percentage === 100 || c.status === 'completed').length : 0;
    const assessmentsCount = attempts ? attempts.length : 0;
    const masteryPct = profile.completion_percentage || (enrolledCount > 0 ? Math.round(courses.reduce((acc, c) => acc + (c.progress_percentage || 0), 0) / enrolledCount) : 0);
    const studyHours = Math.max(1, assessmentsCount * 1 + enrolledCount * 4 + completedCourses * 6);

    document.getElementById('progEnrolled') && (document.getElementById('progEnrolled').textContent = enrolledCount);
    document.getElementById('progAssessments') && (document.getElementById('progAssessments').textContent = assessmentsCount);
    document.getElementById('progCompletion') && (document.getElementById('progCompletion').textContent = `${masteryPct}%`);
    document.getElementById('progHours') && (document.getElementById('progHours').textContent = `${studyHours}h`);
}

function renderActiveCourseProgress(courses) {
    const container = document.getElementById('activeCoursesProgressList');
    if (!container) return;

    if (!courses || courses.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding: 2rem; color: var(--secondary-text);">
                <p>You have not enrolled in any courses yet.</p>
                <a href="courses.html" class="btn-primary-small" style="display:inline-block; margin-top:0.75rem; text-decoration:none;">Browse Course Catalog →</a>
            </div>
        `;
        return;
    }

    container.innerHTML = courses.map(c => {
        const pct = c.progress_percentage || 0;
        const isCompleted = pct === 100 || c.status === 'completed';
        return `
            <div style="background:#F8F7FF; border:1px solid #EDE9FE; border-radius:12px; padding:1.25rem; margin-bottom:1rem;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
                    <div>
                        <span style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--primary-purple); background:#EDE9FE; padding:2px 8px; border-radius:4px;">${c.category || 'General'}</span>
                        <h4 style="font-size:15px; font-weight:700; color:var(--dark-navy); margin:6px 0 2px;">${c.title}</h4>
                        <span style="font-size:12px; color:var(--secondary-text);">Instructor: ${c.instructor_name || c.instructor || 'Faculty'}</span>
                    </div>
                    <span class="badge-role ${isCompleted ? 'green' : 'student'}" style="font-size:12px;">
                        ${isCompleted ? '✅ Completed' : `${pct}% In Progress`}
                    </span>
                </div>
                <div style="margin-top:0.75rem;">
                    <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:600; color:var(--secondary-text); margin-bottom:4px;">
                        <span>Syllabus Completion</span>
                        <span>${pct}%</span>
                    </div>
                    <div style="height:6px; background:#E2E8F0; border-radius:9999px; overflow:hidden;">
                        <div style="height:100%; width:${pct}%; background:${isCompleted ? '#10B981' : 'linear-gradient(90deg, #7C3AED, #A855F7)'}; border-radius:9999px;"></div>
                    </div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.75rem;">
                    <span style="font-size:12px; color:var(--secondary-text);"><i class="fa-solid fa-clock"></i> ${c.duration || 'Self-paced'}</span>
                    <a href="course-player.html?id=${c.course_id || c.id}&lesson=${c.last_lesson_id || 1}" class="btn-primary-small" style="text-decoration:none; padding:0.35rem 0.8rem; font-size:12px;">${isCompleted ? 'Review Course ✓' : 'Continue Learning →'}</a>
                </div>
            </div>
        `;
    }).join('');
}

function renderAssessmentHistory(attempts) {
    const listEl = document.getElementById('progressAssessmentsList');
    if (!listEl) return;

    if (!attempts || attempts.length === 0) {
        listEl.innerHTML = `
            <div style="text-align:center; padding: 2rem; color: var(--secondary-text);">
                <p>No assessment attempts recorded yet. Benchmark your skill proficiency now!</p>
                <a href="assessment.html" class="btn-primary-small" style="display:inline-block; margin-top:0.75rem; text-decoration:none;">Take Skill Assessment →</a>
            </div>
        `;
        return;
    }

    listEl.innerHTML = attempts.map(a => {
        const isPassed = a.percentage >= 60;
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:1rem; border-bottom:1px solid #EDE9FE;">
                <div>
                    <strong style="color:var(--dark-navy); font-size:14.5px;">${a.assessment_title || 'Skill Assessment'}</strong>
                    <p style="color:var(--secondary-text); font-size:12px; margin:2px 0 0;">${a.category || 'General'} • Date: ${a.submitted_at || 'Recently'}</p>
                </div>
                <div style="text-align:right;">
                    <span class="rec-match-pill" style="background:${isPassed ? '#10B981' : '#EF4444'}; color:#fff; font-size:12px; padding:4px 10px; border-radius:9999px;">
                        ${a.score}/${a.max_score} (${a.percentage}%) • ${a.performance_level || (isPassed ? 'Proficient' : 'Needs Practice')}
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

function setupSidebarAndLogout() {
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('dashboardSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (menuToggle && sidebar && overlay) {
        menuToggle.addEventListener('click', () => { sidebar.classList.add('active'); overlay.classList.add('active'); });
        overlay.addEventListener('click', () => { sidebar.classList.remove('active'); overlay.classList.remove('active'); });
    }

    document.querySelectorAll('#logoutBtn, .logout-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.api && window.api.logout) {
                window.api.logout();
            } else {
                localStorage.clear();
                sessionStorage.clear();
                window.location.replace('../login.html');
            }
        });
    });
}
