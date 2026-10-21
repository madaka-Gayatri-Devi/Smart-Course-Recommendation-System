/**
 * Admin Dashboard & LMS Governance JavaScript
 * 100% Dynamic data flow connected to live backend APIs.
 * Comprehensive Platform Administration: Users, Students, Instructors, Course Catalog,
 * Categories, Skills, Career Goals, Assessments, Enrollments, Reports, & Analytics.
 */

/**
 * Sanitizes unsafe HTML string characters to prevent XSS injection.
 * @param {string} str - Raw input string.
 * @returns {string} Sanitized string safe for DOM interpolation.
 * Purpose: Ensures untrusted user data is safely escaped in admin tables.
 */
// ==========================================
// UTILITY & AUTHENTICATION INITIALIZATION
// ==========================================
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getAdminUser() {
    if (typeof window.guardPage === 'function') {
        return window.guardPage('ADMIN');
    }
    const token = localStorage.getItem('smartlearn_token');
    const userStr = localStorage.getItem('smartlearn_user');
    if (!token || !userStr) {
        if (typeof window !== 'undefined' && window.location && window.location.pathname.toLowerCase().includes('/admin/')) {
            window.location.replace('../login.html');
        }
        return null;
    }
    try {
        const u = JSON.parse(userStr);
        if (u && (u.role || '').toUpperCase() === 'ADMIN') return u;
    } catch (_) {}
    return null;
}

/**
 * Master initialization router for all administrator portal subpages.
 * Purpose: Detects active page via window.ADMIN_PAGE or DOM selectors and invokes page controllers.
 * Dependencies: window.ADMIN_PAGE, setupAdminHeader, loadAdminDashboardData, setupAdminUsersPage, etc.
 */
async function initAdminApp() {
    if (window.__adminInitDone) return;
    window.__adminInitDone = true;

    const user = getAdminUser();
    if (!user) return;

    setupAdminHeader(user);

    const tasks = [];

    // 1. Admin Dashboard View (dashboard.html)
    if (document.getElementById('kpiTotalUsers') || document.getElementById('adminRecentUsersBody')) {
        tasks.push(loadAdminDashboardData().catch(e => console.error("Error in loadAdminDashboardData:", e)));
    }

    // 2. Full User Management Directory (users.html)
    if (document.getElementById('adminUsersTableBody')) {
        tasks.push(setupAdminUsersPage().catch(e => console.error("Error in setupAdminUsersPage:", e)));
    }

    // 3. Dedicated Student Management (students.html)
    if (document.getElementById('adminStudentsTableBody')) {
        tasks.push(setupAdminStudentsPage().catch(e => console.error("Error in setupAdminStudentsPage:", e)));
    }

    // 4. Dedicated Instructor Management (instructors.html)
    if (document.getElementById('adminInstructorsTableBody')) {
        tasks.push(setupAdminInstructorsPage().catch(e => console.error("Error in setupAdminInstructorsPage:", e)));
    }

    // 5. Course Catalog Management (courses.html)
    if (document.getElementById('adminCoursesTableBody')) {
        tasks.push(setupAdminCoursesPage().catch(e => console.error("Error in setupAdminCoursesPage:", e)));
    }

    // 6. Course Studio / Editor View (course-editor.html)
    if (document.getElementById('adminCourseForm')) {
        tasks.push(setupAdminCourseEditor(user).catch(e => console.error("Error in setupAdminCourseEditor:", e)));
    }

    // 7. Dedicated Recommendations Management (recommendations.html)
    if (document.getElementById('recTableBody') || document.getElementById('kpiTotalRecRecords')) {
        tasks.push(setupAdminRecommendationsPage().catch(e => console.error("Error in setupAdminRecommendationsPage:", e)));
    }

    // 8. Dedicated Reports View (reports.html)
    if (document.getElementById('popularCoursesTableBody') || document.getElementById('repTotalUsers')) {
        tasks.push(setupAdminReportsPage().catch(e => console.error("Error in setupAdminReportsPage:", e)));
    }

    // 9. Dedicated Analytics View (analytics.html)
    if (document.getElementById('anActiveStudents') || document.getElementById('chartEnrollmentGrowth')) {
        tasks.push(setupAdminAnalyticsPage().catch(e => console.error("Error in setupAdminAnalyticsPage:", e)));
    }

    // 10. Categories Management (categories.html)
    if (document.getElementById('adminCategoriesTableBody')) {
        tasks.push(setupAdminCategoriesPage().catch(e => console.error("Error in setupAdminCategoriesPage:", e)));
    }

    // 11. Skills Management (skills.html)
    if (document.getElementById('adminSkillsTableBody')) {
        tasks.push(setupAdminSkillsPage().catch(e => console.error("Error in setupAdminSkillsPage:", e)));
    }

    // 12. Career Goals Management (career-goals.html)
    if (document.getElementById('adminGoalsTableBody')) {
        tasks.push(setupAdminCareerGoalsPage().catch(e => console.error("Error in setupAdminCareerGoalsPage:", e)));
    }

    // 13. Assessment Questions (assessment-questions.html)
    if (document.getElementById('adminQuestionsTableBody')) {
        tasks.push(setupAdminAssessmentQuestionsPage().catch(e => console.error("Error in setupAdminAssessmentQuestionsPage:", e)));
    }

    // 14. Platform Enrollments (enrollments.html)
    if (document.getElementById('adminEnrollmentsTableBody')) {
        tasks.push(setupAdminEnrollmentsPage().catch(e => console.error("Error in setupAdminEnrollmentsPage:", e)));
    }

    await Promise.allSettled(tasks);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminApp);
} else {
    initAdminApp();
}

/**
 * Renders administrator avatar, display name, and binds logout handler in the top navbar.
 * @param {Object} adminUser - Authenticated admin profile object.
 * Purpose: Synchronizes navigation bar state across all admin views.
 */
function setupAdminHeader(user) {
    const name = user.full_name || user.name || 'Administrator';
    const initial = name.charAt(0).toUpperCase();

    document.getElementById('topName') && (document.getElementById('topName').textContent = name);
    document.getElementById('sidebarName') && (document.getElementById('sidebarName').textContent = name);
    document.getElementById('sidebarRole') && (document.getElementById('sidebarRole').textContent = 'ADMIN');
    document.getElementById('topAvatar') && (document.getElementById('topAvatar').textContent = initial);
    document.getElementById('sidebarAvatar') && (document.getElementById('sidebarAvatar').textContent = initial);
}

// =========================================================================
// 1. DASHBOARD OVERVIEW & PLATFORM HEALTH
// =========================================================================

/**
 * Loads aggregated system analytics, active user counts, and moderation queues for the main dashboard.
 * Purpose: Fetches platform metrics from /admin/analytics and populates KPI widgets and overview tables.
 * Dependencies: window.api.getAdminAnalytics, renderSystemOverviewKPIs, renderUserManagementTable.
 * Debugging: Inspect network payload for /admin/analytics if KPI counters display 0.
 */
// ==========================================
// DASHBOARD OVERVIEW & SYSTEM KPIS
// ==========================================
async function loadAdminDashboardData() {
    try {
        const summary = await window.api.getAdminDashboardSummary();
        if (!summary) throw new Error("Could not load admin dashboard summary");

        const stats = summary.stats || {};

        // 1. System Overview (KPIs)
        renderSystemOverviewKPIs(stats);

        // 2. User Management
        renderUserManagementTable(summary.recent_users || []);

        // 3. Course Catalog Management
        renderCatalogModerationTable(summary.recent_courses || [], stats);

        // 4. Course Categories
        renderCategoryDistribution(summary.category_distribution || []);

        // 5 & 6. Skills & Career Goals
        renderSkillsAndCareers(stats);

        // 7 & 8. Assessments & System-wide Enrollments
        renderAssessmentsAndEnrollments(stats);

        // 9. Platform Statistics
        renderPlatformStatistics(stats);

        // 11. System Analytics (Popular Courses)
        renderPopularCourses(summary.popular_courses || []);

    } catch (err) {
        console.error("Admin dashboard error:", err);
    }
}

/**
 * Populates dashboard summary metric cards with animated numbers.
 * @param {Object} data - Aggregated analytics payload.
 * Purpose: Displays Total Users, Active Courses, Total Enrollments, and Platform Revenue.
 */
function renderSystemOverviewKPIs(stats) {
    const totalStudents = stats.total_students || 0;
    const totalInstructors = stats.total_instructors || 0;
    const totalUsers = (stats.total_users !== undefined) ? stats.total_users : (totalStudents + totalInstructors + 1);

    document.getElementById('kpiTotalUsers') && (document.getElementById('kpiTotalUsers').textContent = totalUsers);
    document.getElementById('kpiTotalStudents') && (document.getElementById('kpiTotalStudents').textContent = totalStudents);
    document.getElementById('kpiTotalInstructors') && (document.getElementById('kpiTotalInstructors').textContent = totalInstructors);
    document.getElementById('kpiTotalCourses') && (document.getElementById('kpiTotalCourses').textContent = stats.total_courses || 0);
    document.getElementById('kpiTotalEnrollments') && (document.getElementById('kpiTotalEnrollments').textContent = stats.total_enrollments || 0);
}

/**
 * Renders recent user registrations and quick action toggles in the dashboard overview.
 * @param {Array<Object>} users - List of recently registered user objects.
 * Purpose: Provides instant access to activate, suspend, or inspect user accounts.
 */
function renderUserManagementTable(users) {
    const tbody = document.getElementById('adminRecentUsersBody');
    if (!tbody) return;

    if (!users || users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--secondary-text);">No users found in database.</td></tr>`;
        return;
    }

    tbody.innerHTML = users.map(u => {
        const roleUpper = (u.role || 'STUDENT').toUpperCase();
        const roleBadgeClass = roleUpper === 'ADMIN' ? 'badge-admin' : (roleUpper === 'INSTRUCTOR' ? 'badge-instructor' : 'badge-student');
        const isActive = u.is_active !== 0;

        return `
            <tr>
                <td>
                    <strong>${escapeHtml(u.full_name || u.name)}</strong>
                    <div style="font-size:11px; color:#64748b;">ID: #${u.id}</div>
                </td>
                <td><span style="font-size:12.5px; color:#475569;">${escapeHtml(u.email)}</span></td>
                <td><span class="badge-role ${roleBadgeClass}">${escapeHtml(u.role)}</span></td>
                <td>
                    <span class="status-indicator ${isActive ? 'status-active' : 'status-inactive'}">
                        ${isActive ? 'Active' : 'Disabled'}
                    </span>
                </td>
                <td style="text-align:right;">
                    ${u.is_primary_admin ? 
                        `<span style="font-size:11px; color:#64748b;">Primary Admin</span>` : 
                        `<button class="btn btn-xs ${isActive ? 'btn-outline-danger' : 'btn-outline-success'}" 
                                 onclick="handleToggleUserStatus(${u.id}, ${isActive})">
                            ${isActive ? 'Deactivate' : 'Activate'}
                         </button>`
                    }
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Renders pending course reviews and moderation queue in the dashboard.
 * @param {Array<Object>} courses - List of courses submitted by instructors.
 * Purpose: Allows administrators to review, approve, publish, or reject course submissions.
 */
function renderCatalogModerationTable(courses, stats) {
    const tbody = document.getElementById('adminCoursesBody');
    const breakdown = document.getElementById('kpiCourseBreakdown');

    if (breakdown) {
        breakdown.textContent = `${stats.published_courses || 0} Published • ${stats.draft_courses || 0} Draft`;
    }

    if (!tbody) return;

    if (!courses || courses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--secondary-text);">No courses in platform catalog.</td></tr>`;
        return;
    }

    tbody.innerHTML = courses.map(c => {
        const isPublished = (c.status || '').toLowerCase() === 'published';
        return `
            <tr>
                <td>
                    <strong>${escapeHtml(c.title)}</strong>
                    <div style="font-size:11px; color:#64748b;">${c.duration || '30h'} • ${c.level || 'Intermediate'}</div>
                </td>
                <td><span class="badge-category">${escapeHtml(c.category || 'General')}</span></td>
                <td><span class="instructor-name">${escapeHtml(c.instructor || c.instructor_name || 'Faculty')}</span></td>
                <td><strong>${c.enrollment_count || 0}</strong></td>
                <td>
                    <span class="status-pill ${isPublished ? 'badge-status-published' : 'badge-status-draft'}">
                        ${isPublished ? 'Published' : 'Draft'}
                    </span>
                </td>
                <td style="text-align:right;">
                    <button class="btn btn-xs ${isPublished ? 'btn-outline-warning' : 'btn-outline-primary'}" 
                            onclick="handleToggleCoursePublish(${c.id}, ${isPublished})">
                        ${isPublished ? 'Unpublish' : 'Publish'}
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Renders category breakdown chart or badges on the dashboard.
 * @param {Object} categories - Distribution map of course counts per category.
 */
function renderCategoryDistribution(categories) {
    const container = document.getElementById('adminCategoryDistribution');
    if (!container) return;

    if (!categories || categories.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:1.5rem; color:var(--secondary-text);">No category records found.</div>`;
        return;
    }

    const maxCount = Math.max(...categories.map(c => c.course_count || 0), 1);

    container.innerHTML = categories.slice(0, 4).map(cat => {
        const count = cat.course_count || 0;
        const pct = Math.round((count / maxCount) * 100);
        return `
            <div style="margin-bottom:0.75rem;">
                <div style="display:flex; justify-content:space-between; font-size:12.5px; font-weight:600; margin-bottom:3px;">
                    <span>${escapeHtml(cat.category || cat.name || 'General')}</span>
                    <span style="color:var(--secondary-text);">${count} courses</span>
                </div>
                <div style="height:5px; background:#E2E8F0; border-radius:9999px; overflow:hidden;">
                    <div style="height:100%; width:${pct}%; background:var(--primary-purple); border-radius:9999px;"></div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Renders skill distribution and career goal alignment statistics.
 * @param {Object} skills - Map of skills tracked across enrolled students.
 */
function renderSkillsAndCareers(stats) {
    document.getElementById('kpiTotalSkills') && (document.getElementById('kpiTotalSkills').textContent = stats.total_skills || 0);
    document.getElementById('kpiTotalCareers') && (document.getElementById('kpiTotalCareers').textContent = stats.total_career_goals || 0);
}

/**
 * Renders diagnostic assessment metrics and enrollment conversion ratios.
 * @param {Object} data - Diagnostic assessment attempt summaries.
 */
function renderAssessmentsAndEnrollments(stats) {
    document.getElementById('kpiTotalAssessments') && (document.getElementById('kpiTotalAssessments').textContent = stats.total_assessments || 0);

    const enrollmentBox = document.getElementById('kpiEnrollmentBreakdown');
    if (enrollmentBox) {
        const completed = stats.completed_enrollments || 0;
        const active = Math.max(0, (stats.total_enrollments || 0) - completed);
        enrollmentBox.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="color:#3730A3; font-weight:600; font-size:13px;">Active Learning In-Progress</span>
                <strong style="color:#3730A3; font-size:16px;">${active}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
                <span style="color:#059669; font-weight:600; font-size:13px;">Completed Curriculums</span>
                <strong style="color:#059669; font-size:16px;">${completed}</strong>
            </div>
        `;
    }
}

/**
 * Populates secondary statistics cards including completion rates and average ratings.
 * @param {Object} stats - Platform operational metrics object.
 */
function renderPlatformStatistics(stats) {
    document.getElementById('kpiCompletionRate') && (document.getElementById('kpiCompletionRate').textContent = `${stats.completion_rate || 0}%`);
}

/**
 * Renders the top-performing courses ranked by enrollment numbers and ratings.
 * @param {Array<Object>} courses - List of top course records.
 */
function renderPopularCourses(popular) {
    const container = document.getElementById('adminPopularCourses');
    if (!container) return;

    if (!popular || popular.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:1.5rem; color:var(--secondary-text);">No enrollment data yet.</div>`;
        return;
    }

    container.innerHTML = popular.slice(0, 3).map((c, idx) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem 0; border-bottom:1px solid #EDE9FE; font-size:13px;">
            <div>
                <strong style="color:var(--dark-navy);">#${idx + 1} ${escapeHtml(c.title)}</strong>
                <div style="font-size:11.5px; color:var(--secondary-text);">${escapeHtml(c.category || 'General')}</div>
            </div>
            <span style="font-size:12px; font-weight:700; color:var(--primary-purple); background:#EDE9FE; padding:2px 8px; border-radius:4px;">${c.enrollment_count || 0} enrolled</span>
        </div>
    `).join('');
}

// =========================================================================
// 2. USER MANAGEMENT DIRECTORY (users.html)
// =========================================================================

let allAdminUsersList = [];

/**
 * Initializes the full user directory management page (/admin/users.html).
 * Purpose: Binds search filters, role dropdowns, status toggles, and paginated user lists.
 * Dependencies: window.api.getAdminUsers, renderUsersDirectoryTable.
 */
// ==========================================
// USER DIRECTORY & STATUS MANAGEMENT
// ==========================================
async function setupAdminUsersPage() {
    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;

    const searchInput = document.getElementById('userSearchInput');
    const roleButtonsContainer = document.getElementById('adminRoleFilterButtons');
    const statusFilter = document.getElementById('adminUserStatusFilter');
    const sortSelect = document.getElementById('adminUserSortSelect');

    let selectedRole = 'all';

    const fetchAndRenderUsers = async () => {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:3rem 1rem; color:var(--secondary-text);">
                    <i class="fa-solid fa-spinner fa-spin mr-2" style="color:#5B3FE8; font-size:1.25rem;"></i> Loading user records...
                </td>
            </tr>
        `;

        try {
            const query = searchInput ? searchInput.value.trim() : '';
            const statusVal = statusFilter ? statusFilter.value : 'all';
            const sortVal = sortSelect ? sortSelect.value : 'newest';

            const params = {};
            if (query) params.search = query;
            if (selectedRole && selectedRole !== 'all') params.role = selectedRole;
            if (statusVal && statusVal !== 'all') params.status = statusVal;

            const rawUsers = await window.api.getAdminUsers(params);
            const usersList = Array.isArray(rawUsers) ? rawUsers : (rawUsers && Array.isArray(rawUsers.items) ? rawUsers.items : (rawUsers && Array.isArray(rawUsers.data) ? rawUsers.data : []));
            allAdminUsersList = usersList || [];

            if (sortVal === 'newest') {
                allAdminUsersList.sort((a, b) => (b.id || 0) - (a.id || 0));
            } else if (sortVal === 'oldest') {
                allAdminUsersList.sort((a, b) => (a.id || 0) - (b.id || 0));
            } else if (sortVal === 'name_asc') {
                allAdminUsersList.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
            }

            renderUsersDirectoryTable(allAdminUsersList);
        } catch (err) {
            console.error("Error loading admin users:", err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:3rem 1rem; color:#EF4444;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size:1.5rem; margin-bottom:0.5rem; display:block;"></i>
                        <strong>Unable to load users</strong>
                        <div style="font-size:13px; color:#64748b; margin-top:0.25rem;">${escapeHtml(err.message || 'Please check your connection and login status.')}</div>
                    </td>
                </tr>
            `;
        }
    };

    /**
 * Generates interactive table rows for the comprehensive user directory.
 * @param {Array<Object>} users - List of user accounts matching current search/filter.
 * Purpose: Renders user profile images, roles, verification status, and action buttons.
 */
function renderUsersDirectoryTable(users) {
        if (!tbody) return;

        if (!users || users.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:3.5rem 1rem; color:var(--secondary-text);">
                        <div style="font-size:2.2rem; margin-bottom:0.5rem;">👤</div>
                        <div style="font-weight:700; font-size:16px; color:var(--dark-navy); margin-bottom:0.25rem;">No user accounts found</div>
                        <div style="font-size:13.5px; color:#64748b;">Try adjusting your role or search filters.</div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = users.map(u => {
            const roleUpper = (u.role || 'STUDENT').toUpperCase();
            const roleBadgeClass = roleUpper === 'ADMIN' ? 'badge-admin' : (roleUpper === 'INSTRUCTOR' ? 'badge-instructor' : 'badge-student');
            const isActive = u.is_active !== 0;

            const initials = (u.full_name || u.name || 'User').split(' ').map(n => n.charAt(0)).join('').toUpperCase().substring(0, 2);

            return `
                <tr>
                    <td><strong style="color:#475569; font-size:13px;">#${u.id}</strong></td>
                    <td>
                        <div style="display:flex; align-items:center; gap:0.75rem;">
                            <div style="width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg, #7C3AED, #A855F7); color:#FFFFFF; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; flex-shrink:0;">
                                ${initials}
                            </div>
                            <div>
                                <strong style="color:var(--dark-navy); font-size:14px; display:block;">${escapeHtml(u.full_name || u.name)}</strong>
                                ${u.career_goal ? `<span style="font-size:11.5px; color:#64748b;">${escapeHtml(u.career_goal)}</span>` : ''}
                            </div>
                        </div>
                    </td>
                    <td><span style="font-size:13px; color:#334155;">${escapeHtml(u.email)}</span></td>
                    <td><span class="badge-role ${roleBadgeClass}">${escapeHtml(u.role)}</span></td>
                    <td>
                        <span class="status-indicator ${isActive ? 'status-active' : 'status-inactive'}">
                            ${isActive ? 'Active' : 'Disabled'}
                        </span>
                    </td>
                    <td><span style="font-size:12.5px; color:#64748B;">${escapeHtml(u.created_at || 'Recent')}</span></td>
                    <td style="text-align:right;">
                        ${u.is_primary_admin ? 
                            `<span style="font-size:12px; color:#64748b; font-weight:600;">Primary System Admin</span>` : 
                            `<button class="btn btn-xs ${isActive ? 'btn-outline-danger' : 'btn-outline-success'}" 
                                     style="padding:0.35rem 0.75rem; font-size:12px; border-radius:6px;"
                                     onclick="handleToggleUserStatus(${u.id}, ${isActive})">
                                ${isActive ? '<i class="fa-solid fa-user-slash mr-1"></i> Deactivate' : '<i class="fa-solid fa-user-check mr-1"></i> Activate'}
                             </button>`
                        }
                    </td>
                </tr>
            `;
        }).join('');
    }

    if (roleButtonsContainer) {
        roleButtonsContainer.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                roleButtonsContainer.querySelectorAll('.filter-btn').forEach(b => {
                    b.classList.remove('active');
                    b.style.background = 'transparent';
                    b.style.color = '#64748B';
                });
                btn.classList.add('active');
                btn.style.background = '#7C3AED';
                btn.style.color = '#FFFFFF';
                selectedRole = btn.dataset.role || 'all';
                fetchAndRenderUsers();
            });
        });
    }

    if (searchInput) {
        let timer = null;
        searchInput.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(fetchAndRenderUsers, 300);
        });
    }

    statusFilter && statusFilter.addEventListener('change', fetchAndRenderUsers);
    sortSelect && sortSelect.addEventListener('change', fetchAndRenderUsers);

    await fetchAndRenderUsers();
}

/**
 * Toggles a user account between active and suspended states.
 * @param {number} userId - Database ID of the target user.
 * @param {boolean} currentStatus - Current active state of the user.
 * Purpose: Allows admins to immediately suspend or reactivate compromised or violating accounts.
 * Dependencies: window.api.updateAdminUserStatus.
 */
window.handleToggleUserStatus = async function(userId, currentIsActive) {
    const action = currentIsActive ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} user #${userId}?`)) return;

    try {
        await window.api.updateAdminUserStatus(userId, !currentIsActive);
        alert(`User successfully ${action}d.`);
        location.reload();
    } catch (err) {
        alert(err.message || `Failed to ${action} user.`);
    }
};

// =========================================================================
// 3. DEDICATED STUDENT MANAGEMENT (students.html)
// =========================================================================

let allAdminStudentsData = [];

/**
 * Initializes the dedicated student learners directory (/admin/students.html).
 * Purpose: Fetches student profiles, enrollment stats, and binds student inspection modals.
 * Dependencies: window.api.getAdminStudents, renderAdminStudentsTable.
 */
// ==========================================
// STUDENT DIRECTORY & DETAIL MODALS
// ==========================================
async function setupAdminStudentsPage() {
    const tbody = document.getElementById('adminStudentsTableBody');
    if (!tbody) return;

    const searchInput = document.getElementById('adminStudentsSearchInput');
    const courseFilter = document.getElementById('adminStudentCourseFilter');
    const statusFilter = document.getElementById('adminStudentStatusFilter');
    const sortSelect = document.getElementById('adminStudentSortSelect');

    // Non-blocking course dropdown population
    if (courseFilter) {
        window.api.getAdminCourses().then(catalog => {
            let optionsHtml = `<option value="all">All Courses</option>`;
            if (Array.isArray(catalog)) {
                catalog.forEach(c => {
                    optionsHtml += `<option value="${c.id}">${escapeHtml(c.title)}</option>`;
                });
            }
            courseFilter.innerHTML = optionsHtml;
        }).catch(e => console.warn("Could not load courses for student filter:", e));
    }

    const fetchAndRenderStudents = async () => {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:3rem 1rem; color:var(--secondary-text);">
                    <i class="fa-solid fa-spinner fa-spin mr-2" style="color:#5B3FE8; font-size:1.25rem;"></i> Loading student roster...
                </td>
            </tr>
        `;

        try {
            const query = searchInput ? searchInput.value.trim() : '';
            const courseVal = courseFilter ? courseFilter.value : 'all';
            const statusVal = statusFilter ? statusFilter.value : 'all';
            const sortVal = sortSelect ? sortSelect.value : 'newest';

            const params = {};
            if (query) params.search = query;
            if (courseVal && courseVal !== 'all') params.course_id = courseVal;
            if (statusVal && statusVal !== 'all') params.status = statusVal;

            const res = await window.api.getAdminStudents(params);
            
            document.getElementById('adminStudentTotalCount') && (document.getElementById('adminStudentTotalCount').textContent = res.total_students || 0);
            document.getElementById('adminStudentActiveCount') && (document.getElementById('adminStudentActiveCount').textContent = res.active_students || 0);
            document.getElementById('adminStudentCompletedCount') && (document.getElementById('adminStudentCompletedCount').textContent = res.completed_students || 0);
            document.getElementById('adminStudentAvgProgress') && (document.getElementById('adminStudentAvgProgress').textContent = `${res.avg_progress || 0}%`);

            allAdminStudentsData = res.students || [];

            if (sortVal === 'newest') {
                allAdminStudentsData.sort((a, b) => (b.student_id || 0) - (a.student_id || 0));
            } else if (sortVal === 'oldest') {
                allAdminStudentsData.sort((a, b) => (a.student_id || 0) - (b.student_id || 0));
            } else if (sortVal === 'name_asc') {
                allAdminStudentsData.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            } else if (sortVal === 'progress_high') {
                allAdminStudentsData.sort((a, b) => (b.overall_progress || 0) - (a.overall_progress || 0));
            }

            renderAdminStudentsTable(allAdminStudentsData);
        } catch (err) {
            console.error("Error loading admin students:", err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:3rem 1rem; color:#EF4444;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size:1.5rem; margin-bottom:0.5rem; display:block;"></i>
                        <strong>Unable to load student roster</strong>
                        <div style="font-size:13px; color:#64748b; margin-top:0.25rem;">${escapeHtml(err.message || 'Please check your connection and login status.')}</div>
                    </td>
                </tr>
            `;
        }
    };

    /**
 * Renders table of student learners with enrolled course counts and completion progress.
 * @param {Array<Object>} students - Array of student learner records.
 */
function renderAdminStudentsTable(students) {
        if (!tbody) return;

        if (!students || students.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:3.5rem 1rem; color:var(--secondary-text);">
                        <div style="font-size:2.2rem; margin-bottom:0.5rem;">🎓</div>
                        <div style="font-weight:700; font-size:16px; color:var(--dark-navy); margin-bottom:0.25rem;">No students registered yet.</div>
                        <div style="font-size:13.5px; color:#64748b;">Student accounts and course progress will appear here.</div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = students.map((s, idx) => {
            const initials = (s.name || 'Student').split(' ').map(n => n.charAt(0)).join('').toUpperCase().substring(0, 2);
            const isCompleted = s.completed_courses_count > 0;
            const pct = s.overall_progress || 0;

            const courseNames = (s.enrollments || []).map(e => e.course_title).join(', ');

            return `
                <tr style="cursor:pointer;" onclick="openAdminStudentDetailModal(${s.student_id})">
                    <td>
                        <div style="display:flex; align-items:center; gap:0.75rem;">
                            <div style="width:38px; height:38px; border-radius:50%; background:linear-gradient(135deg, #7C3AED, #A855F7); color:#FFFFFF; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13.5px; flex-shrink:0;">
                                ${initials}
                            </div>
                            <div>
                                <strong style="color:var(--dark-navy); font-size:14px; display:block;">${escapeHtml(s.name)}</strong>
                                <span style="font-size:12px; color:#64748b;">${escapeHtml(s.email)}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="badge-category" style="font-size:11.5px; padding:3px 10px; border-radius:12px;"><i class="fa-solid fa-bullseye mr-1"></i> ${escapeHtml(s.career_goal)}</span>
                    </td>
                    <td>
                        <strong style="font-size:13px; color:#1E293B;">${s.enrolled_courses_count || 0} Courses</strong>
                        <div style="font-size:11.5px; color:#64748b; max-width:220px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHtml(courseNames || 'No enrollments')}</div>
                    </td>
                    <td>
                        <div style="min-width:130px;">
                            <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:600; margin-bottom:4px;">
                                <span style="color:#64748B;">Avg Progress</span>
                                <span style="color:#7C3AED;">${pct}%</span>
                            </div>
                            <div style="height:6px; background:#E2E8F0; border-radius:9999px; overflow:hidden;">
                                <div style="height:100%; width:${pct}%; background:${isCompleted ? '#10B981' : 'linear-gradient(90deg, #7C3AED, #A855F7)'}; border-radius:9999px;"></div>
                            </div>
                        </div>
                    </td>
                    <td><span style="font-size:12.5px; color:#475569;">${escapeHtml(s.created_at || 'Recent')}</span></td>
                    <td>
                        <span class="status-indicator ${s.is_active ? 'status-active' : 'status-inactive'}">
                            ${s.status}
                        </span>
                    </td>
                    <td style="text-align:right;">
                        <button class="btn-outline" style="padding:0.35rem 0.65rem; font-size:11.5px; border-radius:6px;" onclick="event.stopPropagation(); openAdminStudentDetailModal(${s.student_id});">
                            <i class="fa-solid fa-id-card mr-1"></i> View Profile
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    if (searchInput) {
        let timer = null;
        searchInput.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(fetchAndRenderStudents, 300);
        });
    }

    courseFilter && courseFilter.addEventListener('change', fetchAndRenderStudents);
    statusFilter && statusFilter.addEventListener('change', fetchAndRenderStudents);
    sortSelect && sortSelect.addEventListener('change', fetchAndRenderStudents);

    await fetchAndRenderStudents();
}

/**
 * Opens detailed modal showing student academic progress, enrolled courses, and assessment scores.
 * @param {number} studentId - Target student database identifier.
 * Purpose: Provides deep diagnostic insights into learner performance and history.
 */
window.openAdminStudentDetailModal = async function(studentId) {
    try {
        const s = await window.api.getAdminStudentDetail(studentId);
        if (!s) return;

        let modal = document.getElementById('adminStudentDetailModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'adminStudentDetailModal';
            modal.className = 'modal-backdrop';
            modal.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(15,23,42,0.65); backdrop-filter:blur(4px); z-index:1100; display:flex; align-items:center; justify-content:center; padding:1.5rem;';
            document.body.appendChild(modal);
        }

        const initials = (s.name || 'Student').split(' ').map(n => n.charAt(0)).join('').toUpperCase().substring(0, 2);

        const skillsHtml = (s.skills || []).map(sk => `
            <span style="background:#F3E8FF; color:#6B21A8; font-weight:600; font-size:12px; padding:4px 10px; border-radius:12px; border:1px solid #D8B4FE;">
                ${escapeHtml(sk.name || sk)} • ${escapeHtml(sk.proficiency || 'Intermediate')}
            </span>
        `).join('');

        const interestsHtml = (s.interests || []).map(i => `
            <span style="background:#EFF6FF; color:#1E40AF; font-size:11.5px; padding:3px 9px; border-radius:12px;">
                #${escapeHtml(i)}
            </span>
        `).join('');

        const enrollmentsHtml = (s.enrollments || []).length > 0 ? (s.enrollments.map(e => `
            <tr>
                <td><strong style="font-size:13px; color:#0F172A;">${escapeHtml(e.course_title)}</strong></td>
                <td><span style="font-size:12px; color:#475569;">${escapeHtml(e.instructor_name)}</span></td>
                <td><span style="font-size:12px; color:#64748B;">${escapeHtml(e.enrolled_at)}</span></td>
                <td>
                    <div style="min-width:110px;">
                        <div style="font-size:11px; font-weight:600; color:#7C3AED;">${e.completed_lessons}/${e.total_lessons} lessons (${e.progress_percentage}%)</div>
                        <div style="height:5px; background:#E2E8F0; border-radius:9999px; overflow:hidden;">
                            <div style="height:100%; width:${e.progress_percentage}%; background:${e.progress_percentage === 100 ? '#10B981' : '#7C3AED'};"></div>
                        </div>
                    </div>
                </td>
                <td>
                    <span style="font-size:11.5px; font-weight:600; padding:2px 8px; border-radius:10px; background:${e.status === 'completed' ? '#ECFDF5' : '#EFF6FF'}; color:${e.status === 'completed' ? '#047857' : '#1D4ED8'};">
                        ${e.status === 'completed' ? 'Completed' : 'In Progress'}
                    </span>
                </td>
            </tr>
        `).join('')) : `<tr><td colspan="5" style="text-align:center; padding:1rem; color:#64748b;">No active course enrollments yet.</td></tr>`;

        modal.innerHTML = `
            <div style="background:#FFFFFF; border-radius:16px; width:100%; max-width:750px; max-height:90vh; overflow-y:auto; padding:2rem; box-shadow:0 20px 25px -5px rgba(0,0,0,0.2); position:relative;">
                <button onclick="closeAdminStudentDetailModal()" style="position:absolute; top:1.25rem; right:1.25rem; background:none; border:none; font-size:1.25rem; color:#64748B; cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>

                <div style="display:flex; align-items:center; gap:1.25rem; margin-bottom:1.5rem; padding-bottom:1.25rem; border-bottom:1px solid #E2E8F0;">
                    <div style="width:60px; height:60px; border-radius:50%; background:linear-gradient(135deg, #7C3AED, #A855F7); color:#FFFFFF; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:22px; flex-shrink:0;">
                        ${initials}
                    </div>
                    <div>
                        <h2 style="font-size:20px; color:#0F172A; margin:0 0 2px; font-weight:800;">${escapeHtml(s.name)}</h2>
                        <div style="font-size:13.5px; color:#64748B;">${escapeHtml(s.email)} • Joined ${escapeHtml(s.created_at)}</div>
                    </div>
                </div>

                <!-- Personal Info & Career Goals -->
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1.5rem;">
                    <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px; padding:1rem;">
                        <h4 style="font-size:13px; text-transform:uppercase; color:#64748B; margin:0 0 0.5rem;"><i class="fa-solid fa-user mr-1"></i> Personal Information</h4>
                        <div style="font-size:12.5px; color:#334155; line-height:1.6;">
                            <div>Phone: <strong>${escapeHtml(s.profile.phone)}</strong></div>
                            <div>Location: <strong>${escapeHtml(s.profile.city)}</strong></div>
                            <div>Education: <strong>${escapeHtml(Array.isArray(s.profile.education) ? s.profile.education.join(', ') : s.profile.education)}</strong></div>
                        </div>
                    </div>

                    <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px; padding:1rem;">
                        <h4 style="font-size:13px; text-transform:uppercase; color:#64748B; margin:0 0 0.5rem;"><i class="fa-solid fa-bullseye mr-1"></i> Career Goals</h4>
                        <div style="font-size:12.5px; color:#334155; line-height:1.6;">
                            <div>Primary Goal: <strong style="color:#7C3AED;">${escapeHtml(s.career_goals.primary)}</strong></div>
                            ${s.career_goals.secondary ? `<div>Secondary: <strong>${escapeHtml(s.career_goals.secondary)}</strong></div>` : ''}
                        </div>
                    </div>
                </div>

                <!-- Interests & Skills -->
                <div style="margin-bottom:1.5rem;">
                    <h4 style="font-size:13px; text-transform:uppercase; color:#64748B; margin:0 0 0.5rem;"><i class="fa-solid fa-bolt mr-1"></i> Skills & Proficiencies</h4>
                    <div style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
                        ${skillsHtml}
                    </div>

                    <h4 style="font-size:13px; text-transform:uppercase; color:#64748B; margin:0 0 0.5rem;"><i class="fa-solid fa-heart mr-1"></i> Learning Interests</h4>
                    <div style="display:flex; flex-wrap:wrap; gap:0.4rem;">
                        ${interestsHtml}
                    </div>
                </div>

                <!-- Course History -->
                <div>
                    <h4 style="font-size:14px; color:#0F172A; margin:0 0 0.75rem; font-weight:700;"><i class="fa-solid fa-book-open mr-1"></i> Course History & Progression</h4>
                    <div style="overflow-x:auto;">
                        <table class="admin-table" style="font-size:12.5px;">
                            <thead>
                                <tr>
                                    <th>Course</th>
                                    <th>Instructor</th>
                                    <th>Enrolled</th>
                                    <th>Progress</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${enrollmentsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div style="text-align:right; margin-top:1.5rem;">
                    <button onclick="closeAdminStudentDetailModal()" class="btn-primary" style="padding:0.55rem 1.25rem; font-size:13px; border-radius:8px;">Close</button>
                </div>
            </div>
        `;

        modal.style.display = 'flex';
    } catch (err) {
        alert("Could not load student profile: " + err.message);
    }
};

/**
 * Closes and resets the student detail inspection modal.
 */
window.closeAdminStudentDetailModal = function() {
    const modal = document.getElementById('adminStudentDetailModal');
    if (modal) modal.style.display = 'none';
};

// =========================================================================
// 4. DEDICATED INSTRUCTOR MANAGEMENT (instructors.html)
// =========================================================================

let allAdminInstructorsData = [];

/**
 * Initializes the instructor directory and verification portal (/admin/instructors.html).
 * Purpose: Manages instructor applications, course authoring metrics, and payout summaries.
 */
// ==========================================
// INSTRUCTOR DIRECTORY & DETAIL MODALS
// ==========================================
async function setupAdminInstructorsPage() {
    const tbody = document.getElementById('adminInstructorsTableBody');
    if (!tbody) return;

    const searchInput = document.getElementById('adminInstructorsSearchInput');
    const statusFilter = document.getElementById('adminInstructorStatusFilter');
    const sortSelect = document.getElementById('adminInstructorSortSelect');

    const fetchAndRenderInstructors = async () => {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:3rem 1rem; color:var(--secondary-text);">
                    <i class="fa-solid fa-spinner fa-spin mr-2" style="color:#5B3FE8; font-size:1.25rem;"></i> Loading instructor directory...
                </td>
            </tr>
        `;

        try {
            const query = searchInput ? searchInput.value.trim() : '';
            const statusVal = statusFilter ? statusFilter.value : 'all';
            const sortVal = sortSelect ? sortSelect.value : 'newest';

            const params = {};
            if (query) params.search = query;
            if (statusVal && statusVal !== 'all') params.status = statusVal;

            const res = await window.api.getAdminInstructors(params);
            allAdminInstructorsData = res.instructors || [];

            let totalCoursesCount = 0;
            let totalStudentsCount = 0;
            let sumRatings = 0;

            allAdminInstructorsData.forEach(i => {
                totalCoursesCount += (i.total_courses || 0);
                totalStudentsCount += (i.total_students || 0);
                sumRatings += (i.avg_rating || 5.0);
            });

            const avgPlatformRating = allAdminInstructorsData.length > 0 ? (sumRatings / allAdminInstructorsData.length).toFixed(1) : '5.0';

            document.getElementById('adminInstTotalCount') && (document.getElementById('adminInstTotalCount').textContent = res.total_instructors || allAdminInstructorsData.length);
            document.getElementById('adminInstCoursesCount') && (document.getElementById('adminInstCoursesCount').textContent = totalCoursesCount);
            document.getElementById('adminInstStudentsCount') && (document.getElementById('adminInstStudentsCount').textContent = totalStudentsCount);
            document.getElementById('adminInstAvgRating') && (document.getElementById('adminInstAvgRating').textContent = `⭐ ${avgPlatformRating}`);

            if (sortVal === 'newest') {
                allAdminInstructorsData.sort((a, b) => (b.instructor_id || 0) - (a.instructor_id || 0));
            } else if (sortVal === 'oldest') {
                allAdminInstructorsData.sort((a, b) => (a.instructor_id || 0) - (b.instructor_id || 0));
            } else if (sortVal === 'name_asc') {
                allAdminInstructorsData.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            } else if (sortVal === 'students_high') {
                allAdminInstructorsData.sort((a, b) => (b.total_students || 0) - (a.total_students || 0));
            } else if (sortVal === 'rating_high') {
                allAdminInstructorsData.sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0));
            }

            renderAdminInstructorsTable(allAdminInstructorsData);
        } catch (err) {
            console.error("Error loading admin instructors:", err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:3rem 1rem; color:#EF4444;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size:1.5rem; margin-bottom:0.5rem; display:block;"></i>
                        <strong>Unable to load instructor directory</strong>
                        <div style="font-size:13px; color:#64748b; margin-top:0.25rem;">${escapeHtml(err.message || 'Please check your connection and login status.')}</div>
                    </td>
                </tr>
            `;
        }
    };

    /**
 * Renders table of platform instructors with authored course counts, student reach, and ratings.
 * @param {Array<Object>} instructors - List of instructor profiles.
 */
function renderAdminInstructorsTable(instructors) {
        if (!tbody) return;

        if (!instructors || instructors.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:3.5rem 1rem; color:var(--secondary-text);">
                        <div style="font-size:2.2rem; margin-bottom:0.5rem;">👨‍🏫</div>
                        <div style="font-weight:700; font-size:16px; color:var(--dark-navy); margin-bottom:0.25rem;">No instructor accounts found.</div>
                        <div style="font-size:13.5px; color:#64748b;">Faculty members will appear here as they register and author courses.</div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = instructors.map(inst => {
            const initials = (inst.name || 'Instructor').split(' ').map(n => n.charAt(0)).join('').toUpperCase().substring(0, 2);

            return `
                <tr style="cursor:pointer;" onclick="openAdminInstructorDetailModal(${inst.instructor_id})">
                    <td>
                        <div style="display:flex; align-items:center; gap:0.75rem;">
                            <div style="width:38px; height:38px; border-radius:50%; background:linear-gradient(135deg, #2563EB, #3B82F6); color:#FFFFFF; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13.5px; flex-shrink:0;">
                                ${initials}
                            </div>
                            <div>
                                <strong style="color:var(--dark-navy); font-size:14px; display:block;">${escapeHtml(inst.name)}</strong>
                                <span style="font-size:12px; color:#64748b;">${escapeHtml(inst.email)}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <strong style="font-size:13.5px; color:#1E293B;">${inst.total_courses || 0} Courses</strong>
                        <div style="font-size:11.5px; color:#059669;">${inst.published_courses || 0} Published • ${inst.draft_courses || 0} Draft</div>
                    </td>
                    <td><strong style="font-size:13px; color:#3730A3;">${inst.total_students || 0} Learners</strong></td>
                    <td>
                        <div style="color:#D97706; font-size:13px; font-weight:700;">⭐ ${(inst.avg_rating || 5.0).toFixed(1)}</div>
                        <div style="font-size:11.5px; color:#64748b;">${inst.total_reviews || 0} reviews</div>
                    </td>
                    <td><span style="font-size:12.5px; color:#475569;">${escapeHtml(inst.created_at || 'Recent')}</span></td>
                    <td>
                        <span class="status-indicator ${inst.is_active ? 'status-active' : 'status-inactive'}">
                            ${inst.status}
                        </span>
                    </td>
                    <td style="text-align:right;">
                        <button class="btn-outline" style="padding:0.35rem 0.65rem; font-size:11.5px; border-radius:6px;" onclick="event.stopPropagation(); openAdminInstructorDetailModal(${inst.instructor_id});">
                            <i class="fa-solid fa-chart-pie mr-1"></i> View Performance
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    if (searchInput) {
        let timer = null;
        searchInput.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(fetchAndRenderInstructors, 300);
        });
    }

    statusFilter && statusFilter.addEventListener('change', fetchAndRenderInstructors);
    sortSelect && sortSelect.addEventListener('change', fetchAndRenderInstructors);

    await fetchAndRenderInstructors();
}

/**
 * Opens comprehensive modal showing instructor bio, authored courses, and review ratings.
 * @param {number} instructorId - Target instructor database identifier.
 */
window.openAdminInstructorDetailModal = async function(instructorId) {
    try {
        const inst = await window.api.getAdminInstructorDetail(instructorId);
        if (!inst) return;

        let modal = document.getElementById('adminInstructorDetailModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'adminInstructorDetailModal';
            modal.className = 'modal-backdrop';
            modal.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(15,23,42,0.65); backdrop-filter:blur(4px); z-index:1100; display:flex; align-items:center; justify-content:center; padding:1.5rem;';
            document.body.appendChild(modal);
        }

        const initials = (inst.name || 'Instructor').split(' ').map(n => n.charAt(0)).join('').toUpperCase().substring(0, 2);
        const sum = inst.summary || {};

        const skillsHtml = (inst.skills || []).map(sk => `
            <span style="background:#EFF6FF; color:#1D4ED8; font-weight:600; font-size:12px; padding:4px 10px; border-radius:12px; border:1px solid #BFDBFE;">
                ${escapeHtml(sk.name || sk)} • ${escapeHtml(sk.proficiency || 'Expert')}
            </span>
        `).join('');

        const coursesHtml = (inst.authored_courses || []).length > 0 ? (inst.authored_courses.map(c => `
            <tr>
                <td>
                    <strong style="font-size:13px; color:#0F172A;">${escapeHtml(c.title)}</strong>
                    <div style="font-size:11px; color:#64748B;">${escapeHtml(c.category)} • ${escapeHtml(c.level)}</div>
                </td>
                <td><strong style="color:#2563EB;">${c.enrolled_students_count || 0}</strong></td>
                <td><span style="color:#7C3AED; font-weight:600;">${c.avg_progress}%</span></td>
                <td><span style="color:#059669; font-weight:600;">${c.completion_rate}%</span></td>
                <td><span style="color:#D97706; font-weight:700;">⭐ ${(c.rating || 5.0).toFixed(1)} (${c.review_count})</span></td>
                <td>
                    <span style="font-size:11.5px; font-weight:600; padding:2px 8px; border-radius:10px; background:${c.status === 'published' ? '#ECFDF5' : '#F1F5F9'}; color:${c.status === 'published' ? '#047857' : '#64748B'};">
                        ${c.status === 'published' ? 'Published' : 'Draft'}
                    </span>
                </td>
            </tr>
        `).join('')) : `<tr><td colspan="6" style="text-align:center; padding:1rem; color:#64748b;">No authored courses yet.</td></tr>`;

        const reviewsHtml = (inst.reviews || []).length > 0 ? (inst.reviews.map(r => `
            <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; padding:0.85rem; margin-bottom:0.65rem;">
                <div style="display:flex; justify-content:space-between; margin-bottom:3px; font-size:12.5px;">
                    <strong style="color:#0F172A;">${escapeHtml(r.student_name)} (${escapeHtml(r.course_title)})</strong>
                    <span style="color:#D97706;">⭐ ${r.rating}</span>
                </div>
                <p style="margin:0; font-size:12px; color:#475569;">"${escapeHtml(r.comment)}"</p>
            </div>
        `).join('')) : `<div style="font-size:12.5px; color:#64748B;">No student reviews submitted yet.</div>`;

        modal.innerHTML = `
            <div style="background:#FFFFFF; border-radius:16px; width:100%; max-width:800px; max-height:90vh; overflow-y:auto; padding:2rem; box-shadow:0 20px 25px -5px rgba(0,0,0,0.2); position:relative;">
                <button onclick="closeAdminInstructorDetailModal()" style="position:absolute; top:1.25rem; right:1.25rem; background:none; border:none; font-size:1.25rem; color:#64748B; cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>

                <div style="display:flex; align-items:center; gap:1.25rem; margin-bottom:1.5rem; padding-bottom:1.25rem; border-bottom:1px solid #E2E8F0;">
                    <div style="width:60px; height:60px; border-radius:50%; background:linear-gradient(135deg, #2563EB, #3B82F6); color:#FFFFFF; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:22px; flex-shrink:0;">
                        ${initials}
                    </div>
                    <div>
                        <h2 style="font-size:20px; color:#0F172A; margin:0 0 2px; font-weight:800;">${escapeHtml(inst.name)}</h2>
                        <div style="font-size:13.5px; color:#64748B;">${escapeHtml(inst.email)} • Instructor since ${escapeHtml(inst.created_at)}</div>
                    </div>
                </div>

                <!-- KPI Cards -->
                <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:0.85rem; margin-bottom:1.5rem;">
                    <div style="background:#F8F7FF; border:1px solid #EDE9FE; border-radius:10px; padding:0.85rem; text-align:center;">
                        <span style="font-size:11.5px; color:#64748B; display:block;">Authored Courses</span>
                        <strong style="font-size:18px; color:#7C3AED;">${sum.total_courses || 0}</strong>
                    </div>
                    <div style="background:#EFF6FF; border:1px solid #BFDBFE; border-radius:10px; padding:0.85rem; text-align:center;">
                        <span style="font-size:11.5px; color:#64748B; display:block;">Enrolled Students</span>
                        <strong style="font-size:18px; color:#2563EB;">${sum.total_students || 0}</strong>
                    </div>
                    <div style="background:#ECFDF5; border:1px solid #A7F3D0; border-radius:10px; padding:0.85rem; text-align:center;">
                        <span style="font-size:11.5px; color:#64748B; display:block;">Avg Rating</span>
                        <strong style="font-size:18px; color:#059669;">⭐ ${(sum.avg_rating || 5.0).toFixed(1)}</strong>
                    </div>
                    <div style="background:#FFFBEB; border:1px solid #FDE68A; border-radius:10px; padding:0.85rem; text-align:center;">
                        <span style="font-size:11.5px; color:#64748B; display:block;">Total Reviews</span>
                        <strong style="font-size:18px; color:#D97706;">${sum.total_reviews || 0}</strong>
                    </div>
                </div>

                <!-- Skills -->
                <div style="margin-bottom:1.5rem;">
                    <h4 style="font-size:13px; text-transform:uppercase; color:#64748B; margin:0 0 0.5rem;"><i class="fa-solid fa-bolt mr-1"></i> Instructor Expertise</h4>
                    <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
                        ${skillsHtml}
                    </div>
                </div>

                <!-- Authored Courses Table -->
                <div style="margin-bottom:1.5rem;">
                    <h4 style="font-size:14px; color:#0F172A; margin:0 0 0.75rem; font-weight:700;"><i class="fa-solid fa-book-open mr-1"></i> Authored Curriculum & Course-wise Analytics</h4>
                    <div style="overflow-x:auto;">
                        <table class="admin-table" style="font-size:12.5px;">
                            <thead>
                                <tr>
                                    <th>Course Title</th>
                                    <th>Students</th>
                                    <th>Avg Progress</th>
                                    <th>Completion Rate</th>
                                    <th>Rating</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${coursesHtml}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Reviews Feed -->
                <div>
                    <h4 style="font-size:14px; color:#0F172A; margin:0 0 0.75rem; font-weight:700;"><i class="fa-solid fa-star mr-1" style="color:#D97706;"></i> Student Reviews & Feedback</h4>
                    ${reviewsHtml}
                </div>

                <div style="text-align:right; margin-top:1.5rem;">
                    <button onclick="closeAdminInstructorDetailModal()" class="btn-primary" style="padding:0.55rem 1.25rem; font-size:13px; border-radius:8px;">Close</button>
                </div>
            </div>
        `;

        modal.style.display = 'flex';
    } catch (err) {
        alert("Could not load instructor profile: " + err.message);
    }
};

/**
 * Closes the instructor detail inspection modal.
 */
window.closeAdminInstructorDetailModal = function() {
    const modal = document.getElementById('adminInstructorDetailModal');
    if (modal) modal.style.display = 'none';
};

// =========================================================================
// 5. COURSE CATALOG & MODERATION (courses.html)
// =========================================================================

let adminCurrentModules = [];

/**
 * Initializes the course catalog moderation and management view (/admin/courses.html).
 * Purpose: Binds category filters, publish status toggles, and catalog search.
 */
// ==========================================
// COURSE CATALOG MODERATION & CONTROLS
// ==========================================
async function setupAdminCoursesPage() {
    const tbody = document.getElementById('adminCoursesTableBody');
    const searchInput = document.getElementById('adminCourseSearchInput');
    const filterContainer = document.getElementById('adminStatusFilters');
    const categoryFilter = document.getElementById('adminCategoryFilter');
    const difficultyFilter = document.getElementById('adminDifficultyFilter');
    const sortSelect = document.getElementById('adminSortSelect');

    let currentStatus = 'all';

    if (categoryFilter) {
        try {
            const cats = await window.api.getCategories();
            if (Array.isArray(cats)) {
                cats.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.name;
                    opt.textContent = c.name;
                    categoryFilter.appendChild(opt);
                });
            }
        } catch (e) {
            console.warn("Could not load categories for admin filter:", e);
        }
    }

    /**
 * Fetches filtered course catalog and updates the course moderation table.
 * Purpose: Retrieves course list from backend API applying search queries and status filters.
 */
async function fetchAndRenderCourses() {
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--secondary-text);"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Loading catalog...</td></tr>`;

        try {
            const query = searchInput ? searchInput.value.trim() : '';
            const category = categoryFilter ? categoryFilter.value : 'all';
            const difficulty = difficultyFilter ? difficultyFilter.value : 'all';
            const sortBy = sortSelect ? sortSelect.value : 'newest';

            const params = {};
            if (query) params.search = query;
            if (currentStatus && currentStatus !== 'all') params.status = currentStatus;
            if (category && category !== 'all') params.category = category;
            if (difficulty && difficulty !== 'all') params.difficulty = difficulty;
            if (sortBy) params.sort_by = sortBy;

            const courses = await window.api.getAdminCourses(params);
            renderAdminCoursesTable(courses || []);
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#EF4444; padding:2rem;">${escapeHtml(err.message)}</td></tr>`;
        }
    }

    /**
 * Renders table of all courses with thumbnail, instructor, pricing, status, and control actions.
 * @param {Array<Object>} courses - List of course records.
 */
function renderAdminCoursesTable(courses) {
        if (!tbody) return;

        if (!courses || courses.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center; padding:3rem 1rem; color:var(--secondary-text);">
                        <div style="font-size:2rem; margin-bottom:0.5rem;">🔍</div>
                        <div style="font-weight:700; font-size:16px; color:var(--dark-navy); margin-bottom:0.25rem;">No courses found</div>
                        <div style="font-size:13.5px; color:#64748b; margin-bottom:1.25rem;">No courses matched your search or status filters.</div>
                        <a href="course-editor.html" class="btn-primary" style="text-decoration:none; padding:0.6rem 1.4rem; font-size:13px; display:inline-block; border-radius:6px;">Add New Course</a>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = courses.map(c => {
            const status = (c.status || 'draft').toLowerCase();
            const isPublished = status === 'published';
            const isDeactivated = status === 'deactivated' || c.is_active === 0;

            let statusBadgeClass = 'badge-status-draft';
            let statusText = 'Draft';
            if (isDeactivated) {
                statusBadgeClass = 'badge-status-inactive';
                statusText = 'Deactivated';
            } else if (isPublished) {
                statusBadgeClass = 'badge-status-published';
                statusText = 'Published';
            }

            return `
                <tr>
                    <td>
                        <strong style="color:var(--dark-navy); font-size:14px;">${escapeHtml(c.title)}</strong>
                        <div style="font-size:11.5px; color:#64748b; margin-top:2px;">${escapeHtml(c.short_description || '')}</div>
                    </td>
                    <td><span class="badge-category">${escapeHtml(c.category || 'General')}</span></td>
                    <td><span class="instructor-name">${escapeHtml(c.instructor || c.instructor_name || 'Faculty')}</span></td>
                    <td><span style="font-size:12.5px; color:#475569;">${escapeHtml(c.level || c.difficulty || 'Intermediate')}</span></td>
                    <td>⭐ ${(c.rating || 4.8).toFixed(1)}</td>
                    <td><strong>${c.enrollment_count || c.students_count || 0}</strong></td>
                    <td>
                        <span class="status-pill ${statusBadgeClass}">
                            ${statusText}
                        </span>
                    </td>
                    <td style="text-align:right; white-space:nowrap;">
                        <a href="../student/course-details.html?id=${c.id}" target="_blank" class="btn-outline" style="padding:0.35rem 0.65rem; font-size:12px; text-decoration:none; margin-right:4px; border-radius:6px;" title="View Details"><i class="fa-solid fa-eye"></i> View</a>
                        <a href="course-editor.html?id=${c.id}" class="btn-primary-small" style="text-decoration:none; padding:0.35rem 0.75rem; font-size:12px; margin-right:4px; border-radius:6px;"><i class="fa-solid fa-pen-to-square mr-1"></i> Edit</a>
                        
                        ${!isDeactivated ? `
                            <button onclick="handleAdminTogglePublish(${c.id}, ${isPublished})" class="btn-outline" style="padding:0.35rem 0.65rem; font-size:12px; border-radius:6px; cursor:pointer; margin-right:4px;" title="${isPublished ? 'Unpublish course' : 'Publish course'}">
                                ${isPublished ? 'Unpublish' : 'Publish'}
                            </button>
                        ` : ''}

                        <button onclick="handleAdminToggleDeactivate(${c.id}, ${isDeactivated})" class="btn-outline" style="padding:0.35rem 0.65rem; font-size:12px; border-radius:6px; cursor:pointer; color:${isDeactivated ? '#10B981' : '#EF4444'}; border-color:${isDeactivated ? '#A7F3D0' : '#FECACA'};" title="${isDeactivated ? 'Activate course' : 'Deactivate course'}">
                            ${isDeactivated ? 'Activate' : 'Deactivate'}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    if (filterContainer) {
        filterContainer.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                filterContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentStatus = btn.dataset.status || 'all';
                fetchAndRenderCourses();
            });
        });
    }

    if (searchInput) {
        let timer = null;
        searchInput.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(fetchAndRenderCourses, 300);
        });
    }

    if (categoryFilter) categoryFilter.addEventListener('change', fetchAndRenderCourses);
    if (difficultyFilter) difficultyFilter.addEventListener('change', fetchAndRenderCourses);
    if (sortSelect) sortSelect.addEventListener('change', fetchAndRenderCourses);

    await fetchAndRenderCourses();
}

/**
 * Approves and toggles publication status of an instructor-submitted course.
 * @param {number} courseId - Database ID of the course.
 * @param {boolean} currentPublishedState - Current publish status flag.
 */
window.handleAdminTogglePublish = async function(courseId, isPublished) {
    const action = isPublished ? 'unpublish' : 'publish';
    if (!confirm(`Are you sure you want to ${action} course #${courseId}?`)) return;

    try {
        await window.api.updateAdminCourseStatus(courseId, isPublished ? 'draft' : 'published');
        alert(`Course successfully ${action}ed.`);
        location.reload();
    } catch (err) {
        alert(err.message || `Failed to ${action} course.`);
    }
};

/**
 * Deactivates or archives a course from the public catalog.
 * @param {number} courseId - Database ID of the course.
 * @param {boolean} currentActiveState - Current active flag.
 */
window.handleAdminToggleDeactivate = async function(courseId, isDeactivated) {
    const action = isDeactivated ? 'activate' : 'deactivate';
    if (!confirm(`Are you sure you want to ${action} course #${courseId}?`)) return;

    try {
        await window.api.updateAdminCourseStatus(courseId, isDeactivated ? 'published' : 'deactivated');
        alert(`Course successfully ${action}d.`);
        location.reload();
    } catch (err) {
        alert(err.message || `Failed to ${action} course.`);
    }
};

// Global exports
window.initAdminApp = initAdminApp;
window.setupAdminUsersPage = setupAdminUsersPage;
window.setupAdminStudentsPage = setupAdminStudentsPage;
window.setupAdminInstructorsPage = setupAdminInstructorsPage;
window.setupAdminCoursesPage = setupAdminCoursesPage;
window.setupAdminRecommendationsPage = setupAdminRecommendationsPage;

// =========================================================================
// RECOMMENDATION MANAGEMENT & GOVERNANCE MODULE
// =========================================================================

let currentRecPage = 1;
let currentRecLimit = 10;
let currentRecFilters = {
    search: '',
    category: 'all',
    career_goal: 'all',
    status: 'all',
    min_score: 0
};

/**
 * Initializes the recommendation engine audit and monitoring dashboard (/admin/recommendations.html).
 * Purpose: Monitors recommendation hit-rates, triggers manual batch re-scoring, and audits rationale.
 */
// ==========================================
// RECOMMENDATION MONITORING & AUDIT
// ==========================================
async function setupAdminRecommendationsPage() {
    await loadRecFilterOptions();
    await loadRecStats();
    await loadRecRecordsTable();
    await loadRecAnalytics();
    await loadCourseRelevanceMonitoring();

    setupRecEventListeners();
}

/**
 * Loads dynamic filter options (career goals, categories) for recommendation audit logs.
 */
async function loadRecFilterOptions() {
    try {
        const categories = await (window.api.getCategories ? window.api.getCategories() : []);
        const catSelect = document.getElementById('recCategoryFilter');
        if (catSelect && categories && Array.isArray(categories)) {
            catSelect.innerHTML = `<option value="all">All Categories</option>` +
                categories.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
        }
    } catch (_) {}

    try {
        const goals = await (window.api.getCareerGoals ? window.api.getCareerGoals() : []);
        const goalSelect = document.getElementById('recCareerGoalFilter');
        if (goalSelect && goals && Array.isArray(goals)) {
            goalSelect.innerHTML = `<option value="all">All Career Goals</option>` +
                goals.map(g => `<option value="${escapeHtml(g.title)}">${escapeHtml(g.title)}</option>`).join('');
        }
    } catch (_) {}
}

/**
 * Fetches recommendation engine diagnostic statistics (accuracy, coverage, active models).
 */
async function loadRecStats() {
    try {
        const stats = await window.api.getAdminRecommendationStats();
        if (!stats) return;

        document.getElementById('kpiTotalRecRecords') && (document.getElementById('kpiTotalRecRecords').textContent = stats.total_recommendation_records ?? 0);
        document.getElementById('kpiTotalRecRecordsFunnel') && (document.getElementById('kpiTotalRecRecordsFunnel').textContent = stats.total_recommendation_records ?? 0);
        document.getElementById('kpiStudentsWithRecs') && (document.getElementById('kpiStudentsWithRecs').textContent = stats.students_with_recommendations ?? 0);
        document.getElementById('kpiRecommendedCourses') && (document.getElementById('kpiRecommendedCourses').textContent = stats.recommended_courses_count ?? 0);
        document.getElementById('kpiGeneratedToday') && (document.getElementById('kpiGeneratedToday').textContent = stats.recommendations_generated_today ?? 0);
        document.getElementById('kpiAcceptedEnrolled') && (document.getElementById('kpiAcceptedEnrolled').textContent = stats.accepted_enrolled_count ?? 0);
        document.getElementById('kpiConversionRate') && (document.getElementById('kpiConversionRate').textContent = `${stats.enrollment_conversion_rate ?? 0}% conversion rate`);
    } catch (err) {
        console.error("Error loading recommendation stats:", err);
        const totalEl = document.getElementById('kpiTotalRecRecords');
        if (totalEl) totalEl.innerHTML = `<span style="font-size:0.9rem; color:#ef4444;" title="${escapeHtml(err.message)}">Unable to load</span>`;
    }
}

/**
 * Fetches and renders paginated student recommendation logs with match score breakdowns.
 * @param {number} page - Page number to retrieve (1-indexed).
 */
async function loadRecRecordsTable() {
    const tbody = document.getElementById('recTableBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:2rem; color:var(--admin-text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading recommendation records from database...</td></tr>`;

    try {
        const res = await window.api.getAdminRecommendations({
            page: currentRecPage,
            limit: currentRecLimit,
            ...currentRecFilters
        });

        if (!res || !res.records) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:2rem; color:var(--admin-danger);"><i class="fa-solid fa-triangle-exclamation"></i> Unable to load recommendation data. <button class="btn btn-xs btn-outline-primary" style="margin-left:0.5rem;" onclick="loadRecRecordsTable()"><i class="fa-solid fa-arrows-rotate"></i> Retry</button></td></tr>`;
            return;
        }

        const records = res.records || [];
        const total = res.total || 0;
        const totalPages = res.total_pages || 1;

        if (records.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:2.5rem; color:var(--admin-text-muted);"><i class="fa-solid fa-inbox" style="font-size:1.5rem; display:block; margin-bottom:0.5rem;"></i> No recommendation records available.</td></tr>`;
            updateRecPagination(0, 0, 0, 1);
            return;
        }

        tbody.innerHTML = records.map(r => {
            const score = r.recommendation_score || 0;
            const scoreClass = score >= 75 ? 'score-high' : (score >= 55 ? 'score-med' : 'score-low');
            
            const st = (r.status || 'Recommended').toLowerCase();
            let statusBadgeClass = 'status-badge-recommended';
            if (st === 'viewed') statusBadgeClass = 'status-badge-viewed';
            else if (st === 'wishlisted') statusBadgeClass = 'status-badge-wishlisted';
            else if (st === 'enrolled') statusBadgeClass = 'status-badge-enrolled';
            else if (st === 'completed') statusBadgeClass = 'status-badge-completed';
            else if (st === 'dismissed') statusBadgeClass = 'status-badge-dismissed';

            const reasonTruncated = (r.recommendation_reason || 'Profile match').length > 45 ? 
                (r.recommendation_reason.substring(0, 45) + '...') : r.recommendation_reason;

            return `
                <tr>
                    <td><strong>#${r.id}</strong></td>
                    <td>
                        <strong>${escapeHtml(r.student_name)}</strong>
                        <div style="font-size:11px; color:#64748b;">${escapeHtml(r.student_email)}</div>
                    </td>
                    <td>
                        <strong style="color:var(--admin-text);">${escapeHtml(r.course_title)}</strong>
                    </td>
                    <td><span class="badge-category">${escapeHtml(r.category)}</span></td>
                    <td><span class="badge-role badge-student">${escapeHtml(r.difficulty_level || 'Intermediate')}</span></td>
                    <td>
                        <span class="score-pill ${scoreClass}">
                            <i class="fa-solid fa-bolt"></i> ${score}%
                        </span>
                    </td>
                    <td><span style="font-size:12px; color:#475569;" title="${escapeHtml(r.recommendation_reason)}">${escapeHtml(reasonTruncated)}</span></td>
                    <td><span style="font-size:12px; color:#64748b;">${escapeHtml(r.generated_at ? r.generated_at.substring(0, 10) : 'Recent')}</span></td>
                    <td>
                        <span class="badge-role ${statusBadgeClass}" style="text-transform:capitalize;">
                            ${escapeHtml(r.status || 'Recommended')}
                        </span>
                    </td>
                    <td style="text-align:right;">
                        <button class="btn btn-xs btn-outline-primary" onclick="handleViewRecDetails(${r.id})">
                            <i class="fa-solid fa-eye"></i> View
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        const startItem = (currentRecPage - 1) * currentRecLimit + 1;
        const endItem = Math.min(currentRecPage * currentRecLimit, total);
        updateRecPagination(startItem, endItem, total, totalPages);

    } catch (err) {
        console.error("Error loading recommendation records:", err);
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:2rem; color:var(--admin-danger);"><i class="fa-solid fa-triangle-exclamation"></i> Unable to load recommendation data. <button class="btn btn-xs btn-outline-primary" style="margin-left:0.5rem;" onclick="loadRecRecordsTable()"><i class="fa-solid fa-arrows-rotate"></i> Retry</button></td></tr>`;
    }
}

/**
 * Updates pagination buttons and page indicators for recommendation audit records.
 * @param {number} currentPage - Currently active page index.
 * @param {number} totalPages - Total available pages count.
 */
function updateRecPagination(start, end, total, totalPages) {
    const info = document.getElementById('paginationInfo');
    const pageNum = document.getElementById('currentPageNum');
    const btnPrev = document.getElementById('btnPrevPage');
    const btnNext = document.getElementById('btnNextPage');

    if (info) info.textContent = `Showing ${start}–${end} of ${total} records`;
    if (pageNum) pageNum.textContent = `Page ${currentRecPage} of ${totalPages || 1}`;

    if (btnPrev) btnPrev.disabled = (currentRecPage <= 1);
    if (btnNext) btnNext.disabled = (currentRecPage >= totalPages);
}

/**
 * Renders recommendation analytics charts (match score distribution, top recommended courses).
 */
async function loadRecAnalytics() {
    try {
        const analytics = await window.api.getAdminRecommendationAnalytics();
        if (!analytics) throw new Error("No analytics response");

        // 1. Top Recommended Courses
        const topCoursesContainer = document.getElementById('analyticsTopCourses');
        if (topCoursesContainer) {
            const courses = analytics.most_recommended_courses || [];
            if (courses.length === 0) {
                topCoursesContainer.innerHTML = `<p style="font-size:0.85rem; color:#64748b;">No analytics data available yet.</p>`;
            } else {
                topCoursesContainer.innerHTML = courses.map(c => `
                    <div style="margin-bottom: 0.65rem;">
                        <div style="display:flex; justify-content:space-between; font-size:12.5px; font-weight:600; margin-bottom:0.2rem;">
                            <span style="color:#0f172a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:70%;">${escapeHtml(c.title)}</span>
                            <span style="color:var(--primary-purple);">${c.recommendation_count} recs (${c.avg_score}% avg)</span>
                        </div>
                        <div class="progress-bar-bg" style="height:6px;">
                            <div class="progress-bar-fill" style="width:${Math.min(100, c.avg_score)}%; background: linear-gradient(90deg, #6366f1, #a855f7);"></div>
                        </div>
                    </div>
                `).join('');
            }
        }

        // 2. Categories breakdown
        const catContainer = document.getElementById('analyticsCategories');
        if (catContainer) {
            const categories = analytics.most_recommended_categories || [];
            if (categories.length === 0) {
                catContainer.innerHTML = `<p style="font-size:0.85rem; color:#64748b;">No category analytics available.</p>`;
            } else {
                catContainer.innerHTML = `<div style="display:flex; flex-wrap:wrap; gap:0.5rem;">` +
                    categories.map(cat => `
                        <span class="badge-category" style="padding:0.35rem 0.65rem; font-size:12px;">
                            ${escapeHtml(cat.category)}: <strong>${cat.count}</strong>
                        </span>
                    `).join('') + `</div>`;
            }
        }

        // 3. Conversions
        const enrollPct = analytics.enrollment_conversion ? analytics.enrollment_conversion.percentage : 0;
        const completePct = analytics.completion_conversion ? analytics.completion_conversion.percentage : 0;

        document.getElementById('analyticsEnrollConversion') && (document.getElementById('analyticsEnrollConversion').textContent = `${enrollPct}%`);
        document.getElementById('analyticsCompleteConversion') && (document.getElementById('analyticsCompleteConversion').textContent = `${completePct}%`);

    } catch (err) {
        console.error("Error loading recommendation analytics:", err);
        const topCoursesContainer = document.getElementById('analyticsTopCourses');
        if (topCoursesContainer) {
            topCoursesContainer.innerHTML = `<div style="color:#ef4444; font-size:0.85rem;"><i class="fa-solid fa-triangle-exclamation"></i> Unable to load analytics. <button class="btn btn-xs btn-outline-secondary ms-1" onclick="loadRecAnalytics()">Retry</button></div>`;
        }
    }
}

/**
 * Monitors course catalog relevance scores and flags stale courses with low recommendation affinity.
 */
async function loadCourseRelevanceMonitoring() {
    const container = document.getElementById('monitoringContainer');
    if (!container) return;

    try {
        const res = await window.api.getAdminRecommendations({ limit: 4 });
        const records = res ? (res.records || []) : [];

        if (records.length === 0) {
            container.innerHTML = `<p style="font-size:0.85rem; color:#64748b;">No active recommendation relevance pairs to monitor.</p>`;
            return;
        }

        container.innerHTML = records.map(r => {
            const matchingSkills = r.matching_skills || [];
            const missingSkills = r.missing_skills || [];
            const score = r.recommendation_score || 0;

            return `
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:0.75rem; padding:1rem;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
                        <div>
                            <strong style="font-size:0.9rem; color:#0f172a;">${escapeHtml(r.student_name)}</strong>
                            <div style="font-size:0.8rem; color:#4f46e5; font-weight:600;"><i class="fa-solid fa-arrow-right"></i> ${escapeHtml(r.course_title)}</div>
                        </div>
                        <span class="score-pill score-high" style="font-size:0.75rem;">${score}% Match</span>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; font-size:0.75rem; margin-top:0.5rem;">
                        <div>
                            <span style="color:#64748b; font-weight:600; display:block;">MATCHING SKILLS:</span>
                            ${matchingSkills.length > 0 ? 
                                matchingSkills.map(s => `<span class="tag-pill tag-pill-match">${escapeHtml(typeof s === 'string' ? s : s.name)}</span>`).join('') :
                                '<span style="color:#94a3b8;">None identified</span>'
                            }
                        </div>
                        <div>
                            <span style="color:#64748b; font-weight:600; display:block;">MISSING GAPS ADDRESSED:</span>
                            ${missingSkills.length > 0 ? 
                                missingSkills.map(s => `<span class="tag-pill tag-pill-missing">${escapeHtml(typeof s === 'string' ? s : s.name)}</span>`).join('') :
                                '<span style="color:#94a3b8;">None identified</span>'
                            }
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error("Error loading relevance monitoring:", err);
        container.innerHTML = `<div style="color:#ef4444; font-size:0.85rem;"><i class="fa-solid fa-triangle-exclamation"></i> Unable to load relevance data. <button class="btn btn-xs btn-outline-secondary ms-1" onclick="loadCourseRelevanceMonitoring()">Retry</button></div>`;
    }
}

/**
 * Binds DOM event listeners for recommendation filters, search inputs, and batch regeneration triggers.
 */
function setupRecEventListeners() {
    // Search input
    let searchTimeout;
    const searchInput = document.getElementById('recSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentRecFilters.search = e.target.value.trim();
                currentRecPage = 1;
                loadRecRecordsTable();
            }, 300);
        });
    }

    // Category filter
    const catSelect = document.getElementById('recCategoryFilter');
    if (catSelect) {
        catSelect.addEventListener('change', (e) => {
            currentRecFilters.category = e.target.value;
            currentRecPage = 1;
            loadRecRecordsTable();
        });
    }

    // Career goal filter
    const goalSelect = document.getElementById('recCareerGoalFilter');
    if (goalSelect) {
        goalSelect.addEventListener('change', (e) => {
            currentRecFilters.career_goal = e.target.value;
            currentRecPage = 1;
            loadRecRecordsTable();
        });
    }

    // Status filter
    const statusSelect = document.getElementById('recStatusFilter');
    if (statusSelect) {
        statusSelect.addEventListener('change', (e) => {
            currentRecFilters.status = e.target.value;
            currentRecPage = 1;
            loadRecRecordsTable();
        });
    }

    // Min score filter slider
    const minScoreRange = document.getElementById('recMinScoreFilter');
    const minScoreVal = document.getElementById('minScoreVal');
    if (minScoreRange) {
        minScoreRange.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value) || 0;
            if (minScoreVal) minScoreVal.textContent = val;
            currentRecFilters.min_score = val;
            currentRecPage = 1;
            loadRecRecordsTable();
        });
    }

    // Reset filters button
    const btnReset = document.getElementById('btnResetFilters');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            currentRecFilters = { search: '', category: 'all', career_goal: 'all', status: 'all', min_score: 0 };
            if (searchInput) searchInput.value = '';
            if (catSelect) catSelect.value = 'all';
            if (goalSelect) goalSelect.value = 'all';
            if (statusSelect) statusSelect.value = 'all';
            if (minScoreRange) minScoreRange.value = 0;
            if (minScoreVal) minScoreVal.textContent = '0';
            currentRecPage = 1;
            loadRecRecordsTable();
        });
    }

    // Pagination buttons
    const btnPrev = document.getElementById('btnPrevPage');
    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
            if (currentRecPage > 1) {
                currentRecPage--;
                loadRecRecordsTable();
            }
        });
    }

    const btnNext = document.getElementById('btnNextPage');
    if (btnNext) {
        btnNext.addEventListener('click', () => {
            currentRecPage++;
            loadRecRecordsTable();
        });
    }

    // Export CSV button
    const btnExport = document.getElementById('btnExportCSV');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            const url = window.api.getAdminRecommendationsExportUrl(currentRecFilters);
            window.open(url, '_blank');
        });
    }

    // Modal Details Close buttons
    const btnCloseModal = document.getElementById('btnCloseDetailsModal');
    const btnCloseModalFooter = document.getElementById('btnCloseDetailsModalFooter');
    const modal = document.getElementById('recDetailsModal');
    
    [btnCloseModal, btnCloseModalFooter].forEach(btn => {
        btn && btn.addEventListener('click', () => {
            if (modal) modal.style.display = 'none';
        });
    });

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
    }

    // Regenerate Modal Controls
    const btnOpenRegen = document.getElementById('btnOpenRegenerateModal');
    const regenModal = document.getElementById('regenerateModal');
    const btnCloseRegen = document.getElementById('btnCloseRegenModal');
    const btnCancelRegen = document.getElementById('btnCancelRegen');
    const btnConfirmRegen = document.getElementById('btnConfirmRegen');
    const regenScopeSelect = document.getElementById('regenScopeSelect');
    const regenStudentGroup = document.getElementById('regenStudentSelectGroup');

    if (btnOpenRegen && regenModal) {
        btnOpenRegen.addEventListener('click', async () => {
            regenModal.style.display = 'flex';
            await loadRegenStudentList();
        });
    }

    [btnCloseRegen, btnCancelRegen].forEach(btn => {
        btn && btn.addEventListener('click', () => {
            if (regenModal) regenModal.style.display = 'none';
        });
    });

    if (regenScopeSelect && regenStudentGroup) {
        regenScopeSelect.addEventListener('change', (e) => {
            if (e.target.value === 'single') {
                regenStudentGroup.style.display = 'block';
            } else {
                regenStudentGroup.style.display = 'none';
            }
        });
    }

    if (btnConfirmRegen) {
        btnConfirmRegen.addEventListener('click', async () => {
            const scope = regenScopeSelect ? regenScopeSelect.value : 'all';
            const studentId = document.getElementById('regenStudentSelect') ? document.getElementById('regenStudentSelect').value : null;

            if (scope === 'single' && !studentId) {
                alert("Please select a student from the dropdown.");
                return;
            }

            if (!confirm(`Are you sure you want to regenerate recommendations? Backend engine will re-calculate matching scores.`)) {
                return;
            }

            btnConfirmRegen.disabled = true;
            btnConfirmRegen.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;

            try {
                let result;
                if (scope === 'single' && studentId) {
                    result = await window.api.regenerateAdminRecommendationsForStudent(parseInt(studentId));
                } else {
                    result = await window.api.regenerateAdminRecommendationsAll();
                }

                alert(result.message || "Recommendations regenerated successfully.");
                if (regenModal) regenModal.style.display = 'none';

                // Refresh all page data
                await loadRecStats();
                await loadRecRecordsTable();
                await loadRecAnalytics();
                await loadCourseRelevanceMonitoring();

            } catch (err) {
                alert(err.message || "Failed to regenerate recommendations.");
            } finally {
                btnConfirmRegen.disabled = false;
                btnConfirmRegen.innerHTML = `<i class="fa-solid fa-play"></i> Confirm & Regenerate`;
            }
        });
    }
}

/**
 * Fetches student selection list for targeted recommendation cache recalculation.
 */
async function loadRegenStudentList() {
    const studentSelect = document.getElementById('regenStudentSelect');
    if (!studentSelect) return;

    try {
        const response = await window.api.getAdminUsers ? window.api.getAdminUsers({ role: 'Student' }) : null;
        const students = response ? (response.users || response) : [];

        if (students && Array.isArray(students) && students.length > 0) {
            studentSelect.innerHTML = `<option value="">-- Select Student --</option>` +
                students.map(s => `<option value="${s.id}">${escapeHtml(s.full_name || s.name)} (${escapeHtml(s.email)})</option>`).join('');
        } else {
            studentSelect.innerHTML = `<option value="">No students found in DB</option>`;
        }
    } catch (_) {
        studentSelect.innerHTML = `<option value="">Failed to load students</option>`;
    }
}

// Global View Details Handler
/**
 * Opens detailed audit modal displaying factor weights (goals, skills, interests) for a specific recommendation.
 * @param {number} recId - Unique recommendation database identifier.
 */
window.handleViewRecDetails = async function(recId) {
    const modal = document.getElementById('recDetailsModal');
    if (!modal) return;

    try {
        const details = await window.api.getAdminRecommendationDetails(recId);
        if (!details) throw new Error("Could not load recommendation record details.");

        document.getElementById('modalTitle') && (document.getElementById('modalTitle').textContent = `Recommendation Record #${details.id}`);

        // Student info
        const sInfo = details.student_info || {};
        document.getElementById('modalStudentName') && (document.getElementById('modalStudentName').textContent = sInfo.name || 'Unknown Student');
        document.getElementById('modalStudentEmail') && (document.getElementById('modalStudentEmail').textContent = sInfo.email || '');
        document.getElementById('modalStudentCareerGoals') && (document.getElementById('modalStudentCareerGoals').textContent = 
            sInfo.career_goal ? (sInfo.secondary_career_goal ? `${sInfo.career_goal} (Secondary: ${sInfo.secondary_career_goal})` : sInfo.career_goal) : 'None specified');

        // Student skills
        const sSkillsContainer = document.getElementById('modalStudentSkills');
        if (sSkillsContainer) {
            const skills = sInfo.skills || [];
            if (skills.length === 0) {
                sSkillsContainer.innerHTML = `<span style="font-size:0.8rem; color:#94a3b8;">No profile skills added</span>`;
            } else {
                sSkillsContainer.innerHTML = skills.map(sk => {
                    const skName = typeof sk === 'string' ? sk : (sk.name || sk.skill || '');
                    const skProf = typeof sk === 'object' && sk.level ? ` (${sk.level})` : '';
                    return `<span class="tag-pill">${escapeHtml(skName)}${escapeHtml(skProf)}</span>`;
                }).join('');
            }
        }

        // Student interests
        const sInterestsContainer = document.getElementById('modalStudentInterests');
        if (sInterestsContainer) {
            const interests = sInfo.interests || [];
            if (interests.length === 0) {
                sInterestsContainer.innerHTML = `<span style="font-size:0.8rem; color:#94a3b8;">No interests specified</span>`;
            } else {
                sInterestsContainer.innerHTML = interests.map(i => {
                    const iName = typeof i === 'string' ? i : (i.name || i.interest || '');
                    return `<span class="tag-pill">${escapeHtml(iName)}</span>`;
                }).join('');
            }
        }

        // Student assessment results
        const sAssessContainer = document.getElementById('modalStudentAssessments');
        if (sAssessContainer) {
            const attempts = sInfo.assessment_results || [];
            if (attempts.length === 0) {
                sAssessContainer.innerHTML = `<span style="color:#94a3b8;">No assessment attempts taken</span>`;
            } else {
                sAssessContainer.innerHTML = attempts.map(a => `
                    <div style="margin-bottom:0.25rem;">
                        <strong>${escapeHtml(a.title)}:</strong> ${a.percentage}% (${escapeHtml(a.performance_level)})
                    </div>
                `).join('');
            }
        }

        // Student skill gaps
        const sGapsContainer = document.getElementById('modalStudentGaps');
        if (sGapsContainer) {
            const gaps = sInfo.identified_skill_gaps || [];
            if (gaps.length === 0) {
                sGapsContainer.innerHTML = `<span style="font-size:0.8rem; color:#10b981;">No skill gaps identified</span>`;
            } else {
                sGapsContainer.innerHTML = gaps.map(g => `<span class="tag-pill tag-pill-missing">${escapeHtml(typeof g === 'string' ? g : g.name)}</span>`).join('');
            }
        }

        // Course info
        const cInfo = details.course_info || {};
        document.getElementById('modalCourseTitle') && (document.getElementById('modalCourseTitle').textContent = cInfo.title || 'Course');
        document.getElementById('modalCourseCategory') && (document.getElementById('modalCourseCategory').textContent = cInfo.category || 'General');
        document.getElementById('modalCourseDifficulty') && (document.getElementById('modalCourseDifficulty').textContent = cInfo.difficulty || 'Intermediate');
        document.getElementById('modalCourseInstructor') && (document.getElementById('modalCourseInstructor').textContent = cInfo.instructor || 'Faculty');

        const cSkillsContainer = document.getElementById('modalCourseSkills');
        if (cSkillsContainer) {
            const skills = cInfo.skills_taught || [];
            cSkillsContainer.innerHTML = skills.map(sk => `<span class="tag-pill">${escapeHtml(sk)}</span>`).join('');
        }

        const cRolesContainer = document.getElementById('modalCourseTargetRoles');
        if (cRolesContainer) {
            const roles = cInfo.target_roles || [];
            cRolesContainer.innerHTML = roles.map(r => `<span class="tag-pill" style="background:#e0e7ff; color:#3730a3;">${escapeHtml(r)}</span>`).join('');
        }

        const cPrereqsContainer = document.getElementById('modalCoursePrereqs');
        if (cPrereqsContainer) {
            const prereqs = cInfo.prerequisites || [];
            cPrereqsContainer.textContent = prereqs.join(', ') || 'None specified';
        }

        // Recommendation reasons & scores
        document.getElementById('modalRecReason') && (document.getElementById('modalRecReason').textContent = details.recommendation_reason || 'Profile match');
        
        const scorePill = document.getElementById('modalTotalScorePill');
        if (scorePill) {
            const score = details.recommendation_score || 0;
            scorePill.textContent = `${score}% Match`;
            scorePill.className = `score-pill ${score >= 75 ? 'score-high' : (score >= 55 ? 'score-med' : 'score-low')}`;
        }

        // Score Breakdown
        const breakdownContainer = document.getElementById('modalScoreBreakdown');
        if (breakdownContainer) {
            const b = details.scores_breakdown || {};
            const items = [
                { label: 'Career Goal Match', val: b.career_score || 0, max: 35, color: 'var(--primary-purple)' },
                { label: 'Skill Gap & Overlap', val: b.skill_gap_score || 0, max: 30, color: 'var(--magenta-pink)' },
                { label: 'Interests Match', val: b.interest_score || 0, max: 20, color: '#06B6D4' },
                { label: 'Assessment Relevance', val: b.assessment_score || 0, max: 15, color: '#10B981' }
            ];

            breakdownContainer.innerHTML = items.map(it => {
                const pct = Math.min(100, Math.round((it.val / it.max) * 100));
                return `
                    <div class="breakdown-bar-container">
                        <div class="breakdown-bar-label">
                            <span>${escapeHtml(it.label)}</span>
                            <span style="color:${it.color};">${it.val} / ${it.max} pts (${pct}%)</span>
                        </div>
                        <div class="breakdown-bar-bg">
                            <div class="breakdown-bar-fill" style="width:${pct}%; background:${it.color};"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Matching & Missing skills
        const matchSkillsContainer = document.getElementById('modalMatchingSkills');
        if (matchSkillsContainer) {
            const matches = details.matching_skills || [];
            matchSkillsContainer.innerHTML = matches.length > 0 ?
                matches.map(m => `<span class="tag-pill tag-pill-match">${escapeHtml(typeof m === 'string' ? m : m.name)}</span>`).join('') :
                `<span style="font-size:0.8rem; color:#94a3b8;">None identified</span>`;
        }

        const missSkillsContainer = document.getElementById('modalMissingSkills');
        if (missSkillsContainer) {
            const missing = details.missing_skills || [];
            missSkillsContainer.innerHTML = missing.length > 0 ?
                missing.map(m => `<span class="tag-pill tag-pill-missing">${escapeHtml(typeof m === 'string' ? m : m.name)}</span>`).join('') :
                `<span style="font-size:0.8rem; color:#94a3b8;">None identified</span>`;
        }

        modal.style.display = 'flex';

    } catch (err) {
        alert(err.message || "Failed to load recommendation details.");
    }
};

window.setupAdminRecommendationsPage = setupAdminRecommendationsPage;

// =========================================================================
// 8. DEDICATED ADMIN REPORTS (reports.html)
// =========================================================================

const adminReportCharts = {};

/**
 * Safely tears down and destroys an existing Chart.js report instance to prevent canvas memory leaks.
 * @param {string} chartKey - Key identifier in the active charts registry.
 */
function destroyReportChart(chartId) {
    if (adminReportCharts[chartId]) {
        adminReportCharts[chartId].destroy();
        delete adminReportCharts[chartId];
    }
}

/**
 * Initializes the business reporting and CSV/PDF export dashboard (/admin/reports.html).
 * Purpose: Orchestrates sales, enrollment, completion, and student progress reports.
 */
// ==========================================
// BUSINESS REPORTS & DATA EXPORTS
// ==========================================
async function setupAdminReportsPage() {
    const popularTbody = document.getElementById('popularCoursesTableBody');
    if (!popularTbody) return;

    // 1. Configure CSV export URLs
    document.getElementById('exportUsersBtn') && (document.getElementById('exportUsersBtn').href = window.api.getAdminReportExportUrl('users'));
    document.getElementById('exportCoursesBtn') && (document.getElementById('exportCoursesBtn').href = window.api.getAdminReportExportUrl('courses'));
    document.getElementById('exportEnrollmentsBtn') && (document.getElementById('exportEnrollmentsBtn').href = window.api.getAdminReportExportUrl('enrollments'));
    document.getElementById('exportPaymentsBtn') && (document.getElementById('exportPaymentsBtn').href = window.api.getAdminReportExportUrl('payments'));

    // 2. Fetch Summary Statistics Overview
    try {
        const overview = await window.api.getAdminReportsOverview();
        document.getElementById('repTotalUsers') && (document.getElementById('repTotalUsers').textContent = overview.total_users || 0);
        document.getElementById('repUsersBreakdown') && (document.getElementById('repUsersBreakdown').textContent = `${overview.total_students || 0} Students • ${overview.total_instructors || 0} Inst`);
        document.getElementById('repTotalEnrollments') && (document.getElementById('repTotalEnrollments').textContent = overview.total_enrollments || 0);
        document.getElementById('repEnrollmentBreakdown') && (document.getElementById('repEnrollmentBreakdown').textContent = `${overview.active_enrollments || 0} Active`);
        document.getElementById('repCompleted') && (document.getElementById('repCompleted').textContent = overview.completed_enrollments || 0);
        document.getElementById('repRate') && (document.getElementById('repRate').textContent = `${overview.completion_rate || 0}%`);
        document.getElementById('repTotalRevenue') && (document.getElementById('repTotalRevenue').textContent = `₹${(overview.total_revenue || 0).toLocaleString('en-IN')}`);
        document.getElementById('repPaidCount') && (document.getElementById('repPaidCount').textContent = `${overview.paid_enrollments_count || 0} Verified Orders`);
    } catch (err) {
        console.error("Error loading admin reports summary:", err);
    }

    // 3. Load Popular Courses raw table & bar chart
    try {
        const popularRes = await window.api.getAdminPopularCourses();
        const courses = popularRes.courses || [];
        renderPopularCoursesTable(courses);
        renderPopularCoursesBarChart(courses.slice(0, 5));
    } catch (err) {
        console.error("Error loading popular courses:", err);
        popularTbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:2rem; color:#EF4444;">Unable to load popular courses.</td></tr>`;
    }

    // 4. Load Course Catalog dropdown for global filter
    try {
        const catalog = await window.api.getAdminCourses();
        const courseSelect = document.getElementById('reportCourseFilter');
        if (courseSelect && Array.isArray(catalog)) {
            let options = `<option value="all">All Courses</option>`;
            catalog.forEach(c => {
                options += `<option value="${c.id}">${escapeHtml(c.title)}</option>`;
            });
            courseSelect.innerHTML = options;
        }
    } catch (e) {
        console.warn("Could not load course filter options:", e);
    }

    // 5. Setup Enrollment Report Table with Pagination & Filtering
    let currentEnrollmentPage = 1;
    const fetchEnrollments = async () => {
        const tbody = document.getElementById('enrollmentReportTableBody');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:#64748B;"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Loading enrollments...</td></tr>`;

        try {
            const courseVal = document.getElementById('reportCourseFilter') ? document.getElementById('reportCourseFilter').value : 'all';
            const statusVal = document.getElementById('reportStatusFilter') ? document.getElementById('reportStatusFilter').value : 'all';
            const searchVal = document.getElementById('reportSearchInput') ? document.getElementById('reportSearchInput').value.trim() : '';

            const res = await window.api.getAdminEnrollmentsReport({
                course_id: courseVal,
                status: statusVal,
                search: searchVal,
                page: currentEnrollmentPage,
                limit: 10
            });

            renderEnrollmentReportTable(res.items || []);
            renderEnrollmentPagination(res.total || 0, res.page || 1, res.limit || 10);
        } catch (err) {
            console.error("Error loading enrollment report:", err);
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:#EF4444;">Unable to load enrollment records.</td></tr>`;
        }
    };

    // Filter event listeners
    const courseFilter = document.getElementById('reportCourseFilter');
    const statusFilter = document.getElementById('reportStatusFilter');
    const searchInput = document.getElementById('reportSearchInput');
    const resetBtn = document.getElementById('btnResetFilters');

    courseFilter && courseFilter.addEventListener('change', () => { currentEnrollmentPage = 1; fetchEnrollments(); });
    statusFilter && statusFilter.addEventListener('change', () => { currentEnrollmentPage = 1; fetchEnrollments(); });
    
    if (searchInput) {
        let timer = null;
        searchInput.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => { currentEnrollmentPage = 1; fetchEnrollments(); }, 300);
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (courseFilter) courseFilter.value = 'all';
            if (statusFilter) statusFilter.value = 'all';
            if (searchInput) searchInput.value = '';
            currentEnrollmentPage = 1;
            fetchEnrollments();
        });
    }

    document.getElementById('prevEnrollmentPage') && document.getElementById('prevEnrollmentPage').addEventListener('click', () => {
        if (currentEnrollmentPage > 1) {
            currentEnrollmentPage--;
            fetchEnrollments();
        }
    });

    document.getElementById('nextEnrollmentPage') && document.getElementById('nextEnrollmentPage').addEventListener('click', () => {
        currentEnrollmentPage++;
        fetchEnrollments();
    });

    await fetchEnrollments();

    // 6. Load Course Completion Performance
    try {
        const perfRes = await window.api.getAdminCoursePerformanceReport();
        renderCourseCompletionTable(perfRes.courses || []);
    } catch (e) {
        console.warn("Could not load completion performance:", e);
    }

    // 7. Load Student Progress Report
    try {
        const progRes = await window.api.getAdminStudentProgressReport();
        renderStudentProgressTable(progRes.students || []);
    } catch (e) {
        console.warn("Could not load student progress report:", e);
    }

    // 8. Load Instructor Performance Report
    try {
        const instRes = await window.api.getAdminInstructorsReport();
        renderInstructorReportTable(instRes.instructors || []);
    } catch (e) {
        console.warn("Could not load instructor report:", e);
    }

    // 9. Load Payment Report
    try {
        const payRes = await window.api.getAdminPaymentsReport();
        renderPaymentReportTable(payRes.items || []);
    } catch (e) {
        console.warn("Could not load payment report:", e);
    }

    // 10. Load Recommendation Report
    try {
        const recRes = await window.api.getAdminRecommendationsReport();
        renderRecommendationReportTable(recRes.items || []);
    } catch (e) {
        console.warn("Could not load recommendation report:", e);
    }

    // 11. Load Distribution & Trend Charts
    try {
        const chartData = await window.api.getAdminAnalyticsCharts();
        renderUserDistributionPieChart(chartData.user_distribution || {});
        renderCategoryDistributionChart(chartData.courses_by_category || {});
        renderDifficultyDistributionChart(chartData.courses_by_difficulty || {});
        renderEnrollmentTrendChart(chartData.enrollment_trend || []);
    } catch (e) {
        console.warn("Could not load report distribution charts:", e);
    }
}

/**
 * Renders formatted tabular breakdown of top revenue and enrollment courses.
 * @param {Array<Object>} courses - List of top-performing courses.
 */
function renderPopularCoursesTable(courses) {
    const tbody = document.getElementById('popularCoursesTableBody');
    if (!tbody) return;

    if (!courses || courses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:2rem; color:var(--secondary-text);">No course activity is available yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = courses.map((c, idx) => `
        <tr>
            <td><strong style="color:var(--primary-purple);">#${idx + 1}</strong></td>
            <td><strong style="color:var(--dark-navy); font-size:13px;">${escapeHtml(c.title)}</strong></td>
            <td><span class="badge-category">${escapeHtml(c.category)}</span></td>
            <td><span style="color:#475569;">${escapeHtml(c.instructor)}</span></td>
            <td><span class="badge-role badge-student">${escapeHtml(c.level)}</span></td>
            <td><strong style="color:var(--primary-purple); font-size:13.5px;">${c.enrollments}</strong></td>
            <td><strong style="color:#10B981;">${c.completed}</strong></td>
            <td>${c.avg_progress}%</td>
            <td>⭐ ${c.rating}</td>
            <td><strong>₹${(c.revenue || 0).toLocaleString('en-IN')}</strong></td>
            <td><span class="status-indicator status-active">${escapeHtml(c.status)}</span></td>
        </tr>
    `).join('');
}

/**
 * Renders Chart.js horizontal bar chart visualizing enrollment distribution across top courses.
 * @param {Array<Object>} courses - Top course data.
 */
function renderPopularCoursesBarChart(topCourses) {
    const canvas = document.getElementById('popularCoursesBarChart');
    if (!canvas || typeof Chart === 'undefined') return;

    destroyReportChart('popularCoursesBarChart');

    const labels = topCourses.map(c => c.title.length > 18 ? c.title.substring(0, 16) + '...' : c.title);
    const data = topCourses.map(c => c.enrollments);

    adminReportCharts['popularCoursesBarChart'] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Enrollments',
                data: data,
                backgroundColor: 'rgba(91, 63, 232, 0.85)',
                borderColor: '#5B3FE8',
                borderWidth: 1.5,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ` ${ctx.raw} Enrolled` } }
            },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } },
                x: { ticks: { font: { size: 11 } } }
            }
        }
    });
}

/**
 * Renders Chart.js pie chart depicting platform user role ratios (Students vs Instructors vs Admins).
 * @param {Object} roleCounts - User counts indexed by role.
 */
function renderUserDistributionPieChart(dist) {
    const canvas = document.getElementById('userDistributionChart');
    if (!canvas || typeof Chart === 'undefined') return;

    destroyReportChart('userDistributionChart');

    const labels = Object.keys(dist);
    const data = Object.values(dist);

    adminReportCharts['userDistributionChart'] = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: ['#5B3FE8', '#8B4AD9', '#E83FA5'],
                borderWidth: 2,
                borderColor: '#FFFFFF'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

/**
 * Renders Chart.js doughnut chart showing course distribution across subject categories.
 * @param {Object} categoryCounts - Course count map per category.
 */
function renderCategoryDistributionChart(catData) {
    const canvas = document.getElementById('coursesByCategoryChart');
    if (!canvas || typeof Chart === 'undefined') return;

    destroyReportChart('coursesByCategoryChart');

    const labels = Object.keys(catData);
    const data = Object.values(catData);

    adminReportCharts['coursesByCategoryChart'] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Courses',
                data: data,
                backgroundColor: 'rgba(232, 63, 165, 0.85)',
                borderColor: '#E83FA5',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    });
}

/**
 * Renders Chart.js bar chart showing course counts per difficulty tier (Beginner, Intermediate, Advanced).
 * @param {Object} levels - Course counts grouped by difficulty.
 */
function renderDifficultyDistributionChart(diffData) {
    const canvas = document.getElementById('difficultyDistributionChart');
    if (!canvas || typeof Chart === 'undefined') return;

    destroyReportChart('difficultyDistributionChart');

    adminReportCharts['difficultyDistributionChart'] = new Chart(canvas, {
        type: 'pie',
        data: {
            labels: Object.keys(diffData),
            datasets: [{
                data: Object.values(diffData),
                backgroundColor: ['#10B981', '#3B82F6', '#F59E0B'],
                borderWidth: 2,
                borderColor: '#FFFFFF'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

/**
 * Renders detailed enrollment transactions table with student names, course titles, and dates.
 * @param {Array<Object>} enrollments - Enrollment records.
 */
function renderEnrollmentReportTable(items) {
    const tbody = document.getElementById('enrollmentReportTableBody');
    if (!tbody) return;

    if (!items || items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--secondary-text);">No enrollments found for current criteria.</td></tr>`;
        return;
    }

    tbody.innerHTML = items.map(e => {
        const isComp = e.status === 'Completed';
        const isNotStarted = e.status === 'Not Started';
        const badgeColor = isComp ? '#10B981' : (isNotStarted ? '#64748B' : '#5B3FE8');
        const badgeBg = isComp ? '#ECFDF5' : (isNotStarted ? '#F1F5F9' : '#F3EEFF');

        return `
            <tr>
                <td>
                    <strong style="color:var(--dark-navy);">${escapeHtml(e.student_name)}</strong>
                    <div style="font-size:11px; color:#64748B;">${escapeHtml(e.student_email)}</div>
                </td>
                <td><strong style="font-size:12.5px; color:#1E293B;">${escapeHtml(e.course_title)}</strong></td>
                <td><span style="color:#475569;">${escapeHtml(e.instructor_name)}</span></td>
                <td><span style="color:#64748B;">${escapeHtml(e.enrolled_at)}</span></td>
                <td>
                    <div style="min-width:100px;">
                        <div style="font-size:11px; font-weight:700; color:#5B3FE8; margin-bottom:2px;">${e.progress_percentage}%</div>
                        <div style="height:5px; background:#E2E8F0; border-radius:9999px; overflow:hidden;">
                            <div style="height:100%; width:${e.progress_percentage}%; background:${badgeColor};"></div>
                        </div>
                    </div>
                </td>
                <td>
                    <span style="font-size:11.5px; font-weight:700; padding:3px 8px; border-radius:12px; background:${badgeBg}; color:${badgeColor};">
                        ${escapeHtml(e.status)}
                    </span>
                </td>
                <td><span style="font-size:11.5px; color:#64748B;">${escapeHtml(e.last_accessed)}</span></td>
            </tr>
        `;
    }).join('');
}

/**
 * Updates pagination controls for enrollment reports.
 * @param {number} page - Active page index.
 * @param {number} total - Total enrollment records.
 */
function renderEnrollmentPagination(total, page, limit) {
    const meta = document.getElementById('enrollmentPaginationInfo');
    const prevBtn = document.getElementById('prevEnrollmentPage');
    const nextBtn = document.getElementById('nextEnrollmentPage');

    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(total, page * limit);

    if (meta) meta.textContent = `Showing ${start}-${end} of ${total} records`;
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = end >= total;
}

/**
 * Renders Chart.js monthly/weekly enrollment velocity line graph.
 * @param {Array<Object>} trendData - Chronological enrollment count data points.
 */
function renderEnrollmentTrendChart(trendData) {
    const canvas = document.getElementById('enrollmentTrendLineChart');
    if (!canvas || typeof Chart === 'undefined') return;

    destroyReportChart('enrollmentTrendLineChart');

    const labels = trendData.map(t => t.month);
    const data = trendData.map(t => t.count);

    adminReportCharts['enrollmentTrendLineChart'] = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Enrollments',
                data: data,
                fill: true,
                backgroundColor: 'rgba(242, 27, 143, 0.1)',
                borderColor: '#F21B8F',
                borderWidth: 2,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: '#F21B8F'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    });
}

/**
 * Renders course graduation rate report with completion percentages and average time to complete.
 * @param {Array<Object>} completionStats - Aggregated completion metrics per course.
 */
function renderCourseCompletionTable(courses) {
    const tbody = document.getElementById('courseCompletionTableBody');
    if (!tbody) return;

    if (!courses || courses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:#64748B;">No completion performance data.</td></tr>`;
        return;
    }

    tbody.innerHTML = courses.slice(0, 8).map(c => `
        <tr>
            <td><strong style="color:var(--dark-navy); font-size:12.5px;">${escapeHtml(c.title)}</strong></td>
            <td><strong>${c.enrollments}</strong></td>
            <td><span style="color:#10B981; font-weight:700;">${c.completed}</span></td>
            <td>${c.in_progress}</td>
            <td>
                <span style="font-weight:700; color:${c.completion_rate >= 50 ? '#10B981' : '#F59E0B'};">
                    ${c.completion_rate}%
                </span>
            </td>
            <td>${c.avg_progress}%</td>
        </tr>
    `).join('');
}

/**
 * Renders granular student milestone progress metrics across enrolled curricula.
 * @param {Array<Object>} progressData - Student progress entries.
 */
function renderStudentProgressTable(students) {
    const tbody = document.getElementById('studentProgressTableBody');
    if (!tbody) return;

    if (!students || students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:#64748B;">No student progress data available.</td></tr>`;
        return;
    }

    tbody.innerHTML = students.slice(0, 8).map(s => `
        <tr>
            <td>
                <strong style="color:var(--dark-navy);">${escapeHtml(s.name)}</strong>
                <div style="font-size:11px; color:#64748B;">${escapeHtml(s.email)}</div>
            </td>
            <td><span class="badge-category" style="font-size:11px;">${escapeHtml(s.career_goal)}</span></td>
            <td><strong>${s.enrolled_courses}</strong></td>
            <td><span style="color:#10B981; font-weight:700;">${s.completed_courses}</span></td>
            <td>
                <span style="font-weight:700; color:#5B3FE8;">${s.avg_progress}%</span>
            </td>
            <td><span style="font-size:11px; color:#64748B;">${escapeHtml(s.last_activity)}</span></td>
        </tr>
    `).join('');
}

/**
 * Renders instructor productivity report with total courses authored, active students, and ratings.
 * @param {Array<Object>} instructors - Instructor report records.
 */
function renderInstructorReportTable(instructors) {
    const tbody = document.getElementById('instructorReportTableBody');
    if (!tbody) return;

    if (!instructors || instructors.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:#64748B;">No instructor data recorded.</td></tr>`;
        return;
    }

    tbody.innerHTML = instructors.map(inst => `
        <tr>
            <td>
                <strong style="color:var(--dark-navy);">${escapeHtml(inst.name)}</strong>
                <div style="font-size:11px; color:#64748B;">${escapeHtml(inst.email)}</div>
            </td>
            <td>${inst.courses_created}</td>
            <td><span style="color:#10B981; font-weight:700;">${inst.published_courses}</span></td>
            <td><strong>${inst.total_enrollments}</strong></td>
            <td>${inst.completed_enrollments}</td>
            <td><span style="font-weight:700; color:#F59E0B;">⭐ ${inst.avg_rating}</span></td>
        </tr>
    `).join('');
}

/**
 * Renders financial transactions report with gross revenue, instructor splits, and gateway fees.
 * @param {Array<Object>} payments - Payment transaction records.
 */
function renderPaymentReportTable(items) {
    const tbody = document.getElementById('paymentReportTableBody');
    if (!tbody) return;

    if (!items || items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:#64748B;">No payment records in database yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = items.slice(0, 8).map(p => `
        <tr>
            <td><strong style="font-size:11.5px; color:#475569;">${escapeHtml(p.transaction_id)}</strong></td>
            <td>${escapeHtml(p.student_name)}</td>
            <td><span style="font-size:12px;">${escapeHtml(p.course_title)}</span></td>
            <td><strong style="color:#10B981;">₹${p.amount.toLocaleString('en-IN')}</strong></td>
            <td><span style="font-size:11.5px; color:#64748B;">${escapeHtml(p.payment_method)}</span></td>
            <td>
                <span class="status-indicator ${p.status === 'Successful' ? 'status-active' : 'status-inactive'}">
                    ${escapeHtml(p.status)}
                </span>
            </td>
        </tr>
    `).join('');
}

/**
 * Renders recommendation conversion report showing click-through and enrollment rates from recommendations.
 * @param {Array<Object>} recMetrics - Conversion metric data.
 */
function renderRecommendationReportTable(items) {
    const tbody = document.getElementById('recommendationReportTableBody');
    if (!tbody) return;

    if (!items || items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:#64748B;">No recommendation activity recorded yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = items.slice(0, 8).map(r => `
        <tr>
            <td><strong style="color:var(--dark-navy);">${escapeHtml(r.student_name)}</strong></td>
            <td><strong style="color:#5B3FE8; font-size:12.5px;">${escapeHtml(r.course_title)}</strong></td>
            <td><span style="font-size:12px; color:#475569;">${escapeHtml(r.recommendation_reason)}</span></td>
            <td><span style="font-weight:700; color:#10B981;">${r.recommendation_score}% Fit</span></td>
            <td><span style="font-size:11.5px; color:#64748B;">${escapeHtml(r.generated_at)}</span></td>
            <td><span class="badge-role badge-student">${escapeHtml(r.status)}</span></td>
        </tr>
    `).join('');
}

// =========================================================================
// 9. DEDICATED ADMIN ANALYTICS (analytics.html)
// =========================================================================

const adminAnalyticsCharts = {};

/**
 * Destroys existing Chart.js instances in the platform analytics tab.
 * @param {string} chartKey - Target chart registry identifier.
 */
function destroyAnalyticsChart(chartId) {
    if (adminAnalyticsCharts[chartId]) {
        adminAnalyticsCharts[chartId].destroy();
        delete adminAnalyticsCharts[chartId];
    }
}

/**
 * Initializes the real-time operational analytics dashboard (/admin/analytics.html).
 * Purpose: Powers platform telemetry, active user concurrency, and system utilization metrics.
 */
// ==========================================
// PLATFORM ANALYTICS & VISUALIZATIONS
// ==========================================
async function setupAdminAnalyticsPage() {
    // 1. Fetch Overview & Factual Insights
    try {
        const overview = await window.api.getAdminAnalyticsOverview();
        document.getElementById('anTotalStudents') && (document.getElementById('anTotalStudents').textContent = overview.total_students || 0);
        document.getElementById('anTotalInstructors') && (document.getElementById('anTotalInstructors').textContent = overview.total_instructors || 0);
        document.getElementById('anTotalCourses') && (document.getElementById('anTotalCourses').textContent = overview.total_courses || 0);
        document.getElementById('anActiveStudents') && (document.getElementById('anActiveStudents').textContent = overview.active_students || 0);
        document.getElementById('anTotalEnrollments') && (document.getElementById('anTotalEnrollments').textContent = overview.total_enrollments || 0);
        document.getElementById('anCompletionRate') && (document.getElementById('anCompletionRate').textContent = `${overview.completion_rate || 0}%`);
        document.getElementById('anAvgProgress') && (document.getElementById('anAvgProgress').textContent = `${overview.avg_course_progress || 0}%`);
        document.getElementById('anPublishedCourses') && (document.getElementById('anPublishedCourses').textContent = overview.published_courses || 0);
        document.getElementById('anAvgRating') && (document.getElementById('anAvgRating').textContent = `⭐ ${overview.avg_course_rating || 5.0}`);

        // Render dynamic platform insight bullet points
        const insightList = document.getElementById('analyticsInsightList');
        if (insightList && Array.isArray(overview.insights)) {
            if (overview.insights.length > 0) {
                insightList.innerHTML = overview.insights.map(str => `
                    <li><i class="fa-solid fa-circle-check"></i> ${escapeHtml(str)}</li>
                `).join('');
            } else {
                insightList.innerHTML = `<li><i class="fa-solid fa-circle-info"></i> Sufficient database activity records are needed to generate platform trends.</li>`;
            }
        }
    } catch (err) {
        console.error("Error loading analytics overview:", err);
    }

    // 2. Fetch Charts Data & Render 11 Visualizations
    try {
        const cData = await window.api.getAdminAnalyticsCharts();
        
        const themeColors = window.SmartLearnTheme ? window.SmartLearnTheme.getColors() : { primary: '#5B3FE8', secondary: '#8B4AD9', accent: '#E83FA5' };
        const isDark = window.SmartLearnTheme ? window.SmartLearnTheme.getResolvedAppearance() === 'dark' : false;

        // A. Enrollment Growth (Line)
        renderAnalyticsLineChart('chartEnrollmentGrowth', cData.enrollment_trend || [], 'month', 'count', 'Enrollments', themeColors.primary);
        
        // B. Course Popularity (Horizontal Bar)
        renderAnalyticsHorizontalBarChart('chartCoursePopularity', cData.popular_courses || [], 'title', 'enrollments', 'Enrollments', themeColors.secondary);

        // C. Completion Rate by Course (Bar)
        renderAnalyticsBarChart('chartCompletionRateByCourse', cData.completion_rate_by_course || [], 'title', 'rate', 'Completion Rate %', '#10B981');

        // D. Courses by Category (Doughnut)
        renderAnalyticsDoughnutChart('chartCoursesByCategory', cData.courses_by_category || {}, [themeColors.primary, themeColors.secondary, themeColors.accent, '#10B981', '#3B82F6', '#F59E0B']);

        // E. Courses by Difficulty (Pie)
        renderAnalyticsPieChart('chartCoursesByDifficulty', cData.courses_by_difficulty || {}, ['#10B981', '#3B82F6', '#F59E0B']);

        // F. Student Enrollment Status (Doughnut)
        renderAnalyticsDoughnutChart('chartStudentStatus', cData.enrollment_status || {}, ['#64748B', themeColors.primary, '#10B981']);

        // G. Rating Distribution (Bar)
        renderAnalyticsRatingBarChart('chartRatingDistribution', cData.rating_distribution || {});

        // H. Monthly Revenue (Line)
        renderAnalyticsLineChart('chartMonthlyRevenue', cData.monthly_revenue || [], 'month', 'amount', 'Revenue (₹)', '#10B981');

        // I. Recommendation Frequency (Bar)
        renderAnalyticsBarChart('chartRecommendationDistribution', cData.recommendation_distribution || [], 'title', 'count', 'Times Recommended', themeColors.accent);

        // J. Top Student Skills (Horizontal Bar)
        renderAnalyticsHorizontalBarChart('chartSkillTrends', cData.skills_insights || [], 'skill', 'count', 'Students with Skill', themeColors.secondary);

        // K. Common Career Goals (Horizontal Bar)
        renderAnalyticsHorizontalBarChart('chartCareerGoalDistribution', cData.career_goals_insights || [], 'goal', 'count', 'Students pursuing Goal', themeColors.primary);

    } catch (err) {
        console.error("Error loading analytics charts:", err);
    }
}

/**
 * Renders interactive line chart tracking daily active users (DAU) and platform engagement over time.
 * @param {string} canvasId - Target DOM canvas element ID.
 * @param {Object} chartData - Time series data points.
 */
function renderAnalyticsLineChart(canvasId, items, labelKey, valueKey, labelName, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    destroyAnalyticsChart(canvasId);

    const labels = items.map(it => it[labelKey]);
    const data = items.map(it => it[valueKey]);

    adminAnalyticsCharts[canvasId] = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: labelName,
                data: data,
                fill: true,
                backgroundColor: `${color}1A`,
                borderColor: color,
                borderWidth: 2.5,
                tension: 0.35,
                pointRadius: 4,
                pointBackgroundColor: color
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

/**
 * Renders vertical bar chart comparing quarterly revenue or enrollment metrics.
 * @param {string} canvasId - Canvas DOM ID.
 * @param {Object} chartData - Formatted Chart.js dataset.
 */
function renderAnalyticsBarChart(canvasId, items, labelKey, valueKey, labelName, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    destroyAnalyticsChart(canvasId);

    const labels = items.map(it => (it[labelKey] || '').length > 18 ? (it[labelKey] || '').substring(0, 16) + '...' : it[labelKey]);
    const data = items.map(it => it[valueKey]);

    adminAnalyticsCharts[canvasId] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: labelName,
                data: data,
                backgroundColor: color,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

/**
 * Renders horizontal bar chart ranking top learning skills or career goals by student adoption.
 * @param {string} canvasId - Canvas DOM ID.
 * @param {Object} chartData - Skills or goals dataset.
 */
function renderAnalyticsHorizontalBarChart(canvasId, items, labelKey, valueKey, labelName, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    destroyAnalyticsChart(canvasId);

    const labels = items.map(it => (it[labelKey] || '').length > 20 ? (it[labelKey] || '').substring(0, 18) + '...' : it[labelKey]);
    const data = items.map(it => it[valueKey]);

    adminAnalyticsCharts[canvasId] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: labelName,
                data: data,
                backgroundColor: color,
                borderRadius: 6
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    });
}

/**
 * Renders doughnut chart illustrating device, browser, or traffic breakdown.
 * @param {string} canvasId - Canvas DOM ID.
 * @param {Object} chartData - Categorical proportion dataset.
 */
function renderAnalyticsDoughnutChart(canvasId, objData, palette) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    destroyAnalyticsChart(canvasId);

    adminAnalyticsCharts[canvasId] = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: Object.keys(objData),
            datasets: [{
                data: Object.values(objData),
                backgroundColor: palette,
                borderWidth: 2,
                borderColor: '#FFFFFF'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

/**
 * Renders pie chart showing payment method or geographical distributions.
 * @param {string} canvasId - Canvas DOM ID.
 * @param {Object} chartData - Proportion data.
 */
function renderAnalyticsPieChart(canvasId, objData, palette) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    destroyAnalyticsChart(canvasId);

    adminAnalyticsCharts[canvasId] = new Chart(canvas, {
        type: 'pie',
        data: {
            labels: Object.keys(objData),
            datasets: [{
                data: Object.values(objData),
                backgroundColor: palette,
                borderWidth: 2,
                borderColor: '#FFFFFF'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

/**
 * Renders bar chart displaying course review star distribution (1 to 5 stars).
 * @param {string} canvasId - Canvas DOM ID.
 * @param {Object} chartData - Rating frequencies dataset.
 */
function renderAnalyticsRatingBarChart(canvasId, ratingObj) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    destroyAnalyticsChart(canvasId);

    const labels = ['1 Star', '2 Stars', '3 Stars', '4 Stars', '5 Stars'];
    const data = [ratingObj[1] || 0, ratingObj[2] || 0, ratingObj[3] || 0, ratingObj[4] || 0, ratingObj[5] || 0];

    adminAnalyticsCharts[canvasId] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Reviews',
                data: data,
                backgroundColor: '#F59E0B',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    });
}

window.setupAdminReportsPage = setupAdminReportsPage;

// Listen to theme changes to dynamically re-render analytics & report charts
window.addEventListener('smartlearn:themechanged', () => {
    if (typeof setupAdminAnalyticsPage === 'function' && document.getElementById('chartEnrollmentGrowth')) {
        setupAdminAnalyticsPage();
    }
    if (typeof setupAdminReportsPage === 'function' && document.getElementById('popularCoursesBarChart')) {
        setupAdminReportsPage();
    }
});
window.setupAdminAnalyticsPage = setupAdminAnalyticsPage;



// ==========================================
// 10. CATEGORIES MANAGEMENT (categories.html)
// ==========================================
async function setupAdminCategoriesPage() {
    const tbody = document.getElementById('adminCategoriesTableBody');
    if (!tbody) return;

    let editingCategoryId = null;
    const modal = document.getElementById('categoryModal');
    const form = document.getElementById('categoryForm');
    const catNameInput = document.getElementById('catName');
    const catDescInput = document.getElementById('catDesc');
    const catIconInput = document.getElementById('catIcon');
    const addBtn = document.getElementById('addCategoryBtn');

    window.closeCategoryModal = function() {
        if (modal) modal.style.display = 'none';
        if (form) form.reset();
        editingCategoryId = null;
        const modalTitle = modal ? modal.querySelector('h3') : null;
        if (modalTitle) modalTitle.textContent = 'Add New Category';
    };

    window.openCategoryModalForEdit = function(catJsonStr) {
        try {
            const cat = JSON.parse(decodeURIComponent(catJsonStr));
            editingCategoryId = cat.id;
            if (catNameInput) catNameInput.value = cat.name || '';
            if (catDescInput) catDescInput.value = cat.description || '';
            if (catIconInput) catIconInput.value = cat.icon || 'fa-solid fa-code';
            const modalTitle = modal ? modal.querySelector('h3') : null;
            if (modalTitle) modalTitle.textContent = 'Edit Category';
            if (modal) modal.style.display = 'flex';
        } catch (e) {
            console.error('Error opening edit modal:', e);
        }
    };

    window.handleDeleteCategory = async function(id, name) {
        if (!confirm(`Are you sure you want to delete category "${name}"?`)) return;
        try {
            await window.api.deleteAdminCategory(id);
            alert('Category deleted successfully.');
            await fetchAndRenderCategories();
        } catch (err) {
            alert(err.message || 'Failed to delete category.');
        }
    };

    if (addBtn) {
        addBtn.addEventListener('click', () => {
            editingCategoryId = null;
            if (form) form.reset();
            if (catIconInput) catIconInput.value = 'fa-solid fa-code';
            const modalTitle = modal ? modal.querySelector('h3') : null;
            if (modalTitle) modalTitle.textContent = 'Add New Category';
            if (modal) modal.style.display = 'flex';
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = (catNameInput ? catNameInput.value : '').trim();
            const description = (catDescInput ? catDescInput.value : '').trim();
            const icon = (catIconInput ? catIconInput.value : '').trim() || 'fa-solid fa-code';

            if (!name) {
                alert('Category Name is required.');
                return;
            }

            const payload = { name, description, icon };
            try {
                if (editingCategoryId) {
                    await window.api.updateAdminCategory(editingCategoryId, payload);
                    alert('Category updated successfully!');
                } else {
                    await window.api.createAdminCategory(payload);
                    alert('Category created successfully!');
                }
                closeCategoryModal();
                await fetchAndRenderCategories();
            } catch (err) {
                alert(err.message || 'Failed to save category.');
            }
        });
    }

    const fetchAndRenderCategories = async () => {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; padding:3rem 1rem; color:var(--secondary-text);">
                    <i class="fa-solid fa-spinner fa-spin mr-2" style="color:#5B3FE8; font-size:1.25rem;"></i> Loading categories...
                </td>
            </tr>
        `;

        try {
            const categories = await window.api.getAdminCategories();
            if (!categories || categories.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align:center; padding:3.5rem 1rem; color:var(--secondary-text);">
                            <div style="font-size:2.2rem; margin-bottom:0.5rem;">🗂️</div>
                            <div style="font-weight:700; font-size:16px; color:var(--dark-navy); margin-bottom:0.25rem;">No categories found</div>
                            <div style="font-size:13.5px; color:#64748b;">Click "Add Category" to create your first course domain.</div>
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = categories.map(c => {
                const iconClass = c.icon || 'fa-solid fa-code';
                const courseCount = c.course_count || 0;
                const encodedData = encodeURIComponent(JSON.stringify(c));

                return `
                    <tr>
                        <td>
                            <div style="display:flex; align-items:center; gap:0.75rem;">
                                <div style="width:36px; height:36px; border-radius:8px; background:#EEF2FF; color:#4F46E5; display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0;">
                                    <i class="${escapeHtml(iconClass)}"></i>
                                </div>
                                <strong style="color:var(--dark-navy); font-size:14px;">${escapeHtml(c.name)}</strong>
                            </div>
                        </td>
                        <td><span style="font-size:13px; color:#475569;">${escapeHtml(c.description || 'No description provided.')}</span></td>
                        <td><code style="font-size:12px; background:#F1F5F9; padding:2px 6px; border-radius:4px; color:#475569;">${escapeHtml(iconClass)}</code></td>
                        <td>
                            <span class="badge" style="background:#EDE9FE; color:#5B21B6; font-weight:700; font-size:12px; padding:3px 10px; border-radius:99px;">
                                ${courseCount} Course${courseCount === 1 ? '' : 's'}
                            </span>
                        </td>
                        <td style="text-align:right; white-space:nowrap;">
                            <button class="btn btn-xs btn-outline" style="padding:0.35rem 0.65rem; font-size:12px; margin-right:4px; border-radius:6px;" onclick="window.openCategoryModalForEdit('${encodedData}')" title="Edit Category">
                                <i class="fa-solid fa-pen-to-square"></i> Edit
                            </button>
                            <button class="btn btn-xs btn-outline-danger" style="padding:0.35rem 0.65rem; font-size:12px; border-radius:6px;" onclick="window.handleDeleteCategory(${c.id}, '${escapeHtml(c.name)}')" title="Delete Category">
                                <i class="fa-solid fa-trash"></i> Delete
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            console.error('Error loading admin categories:', err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center; padding:3rem 1rem; color:#EF4444;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size:1.5rem; margin-bottom:0.5rem; display:block;"></i>
                        <strong>Unable to load categories</strong>
                        <div style="font-size:13px; color:#64748b; margin-top:0.25rem;">${escapeHtml(err.message || 'Please check server connection.')}</div>
                        <button class="btn btn-primary-small" style="margin-top:0.75rem;" onclick="location.reload()">Retry</button>
                    </td>
                </tr>
            `;
        }
    };

    await fetchAndRenderCategories();
}

// ==========================================
// 11. SKILLS MANAGEMENT (skills.html)
// ==========================================
async function setupAdminSkillsPage() {
    const tbody = document.getElementById('adminSkillsTableBody');
    if (!tbody) return;

    let editingSkillId = null;
    const modal = document.getElementById('skillModal');
    const form = document.getElementById('skillForm');
    const skillNameInput = document.getElementById('skillName');
    const skillCategoryInput = document.getElementById('skillCategory');
    const skillDescInput = document.getElementById('skillDesc');
    const addBtn = document.getElementById('addSkillBtn');

    window.closeSkillModal = function() {
        if (modal) modal.style.display = 'none';
        if (form) form.reset();
        editingSkillId = null;
        const modalTitle = modal ? modal.querySelector('h3') : null;
        if (modalTitle) modalTitle.textContent = 'Add New Skill';
    };

    window.openSkillModalForEdit = function(skillJsonStr) {
        try {
            const skill = JSON.parse(decodeURIComponent(skillJsonStr));
            editingSkillId = skill.id;
            if (skillNameInput) skillNameInput.value = skill.name || '';
            if (skillCategoryInput) skillCategoryInput.value = skill.category || '';
            if (skillDescInput) skillDescInput.value = skill.description || '';
            const modalTitle = modal ? modal.querySelector('h3') : null;
            if (modalTitle) modalTitle.textContent = 'Edit Skill';
            if (modal) modal.style.display = 'flex';
        } catch (e) {
            console.error('Error opening edit skill modal:', e);
        }
    };

    window.handleDeleteSkill = async function(id, name) {
        if (!confirm(`Are you sure you want to delete skill "${name}"?`)) return;
        try {
            await window.api.deleteAdminSkill(id);
            alert('Skill deleted successfully.');
            await fetchAndRenderSkills();
        } catch (err) {
            alert(err.message || 'Failed to delete skill.');
        }
    };

    if (addBtn) {
        addBtn.addEventListener('click', () => {
            editingSkillId = null;
            if (form) form.reset();
            const modalTitle = modal ? modal.querySelector('h3') : null;
            if (modalTitle) modalTitle.textContent = 'Add New Skill';
            if (modal) modal.style.display = 'flex';
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = (skillNameInput ? skillNameInput.value : '').trim();
            const category = (skillCategoryInput ? skillCategoryInput.value : '').trim();
            const description = (skillDescInput ? skillDescInput.value : '').trim();

            if (!name || !category) {
                alert('Skill Name and Category are required.');
                return;
            }

            const payload = { name, category, description };
            try {
                if (editingSkillId) {
                    await window.api.updateAdminSkill(editingSkillId, payload);
                    alert('Skill updated successfully!');
                } else {
                    await window.api.createAdminSkill(payload);
                    alert('Skill created successfully!');
                }
                closeSkillModal();
                await fetchAndRenderSkills();
            } catch (err) {
                alert(err.message || 'Failed to save skill.');
            }
        });
    }

    const fetchAndRenderSkills = async () => {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center; padding:3rem 1rem; color:var(--secondary-text);">
                    <i class="fa-solid fa-spinner fa-spin mr-2" style="color:#5B3FE8; font-size:1.25rem;"></i> Loading skills catalog...
                </td>
            </tr>
        `;

        try {
            const skills = await window.api.getAdminSkills();
            if (!skills || skills.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" style="text-align:center; padding:3.5rem 1rem; color:var(--secondary-text);">
                            <div style="font-size:2.2rem; margin-bottom:0.5rem;">⚡</div>
                            <div style="font-weight:700; font-size:16px; color:var(--dark-navy); margin-bottom:0.25rem;">No skills found</div>
                            <div style="font-size:13.5px; color:#64748b;">Click "Add Skill" to define key technical competencies.</div>
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = skills.map(s => {
                const encodedData = encodeURIComponent(JSON.stringify(s));
                return `
                    <tr>
                        <td><strong style="color:var(--dark-navy); font-size:14px;"><i class="fa-solid fa-bolt mr-2" style="color:#F59E0B;"></i> ${escapeHtml(s.name)}</strong></td>
                        <td>
                            <span class="badge" style="background:#F0FDF4; color:#15803D; font-weight:600; font-size:12px; padding:3px 8px; border-radius:6px; border:1px solid #BBF7D0;">
                                ${escapeHtml(s.category)}
                            </span>
                        </td>
                        <td><span style="font-size:13px; color:#475569;">${escapeHtml(s.description || 'Standard platform skill competency.')}</span></td>
                        <td style="text-align:right; white-space:nowrap;">
                            <button class="btn btn-xs btn-outline" style="padding:0.35rem 0.65rem; font-size:12px; margin-right:4px; border-radius:6px;" onclick="window.openSkillModalForEdit('${encodedData}')" title="Edit Skill">
                                <i class="fa-solid fa-pen-to-square"></i> Edit
                            </button>
                            <button class="btn btn-xs btn-outline-danger" style="padding:0.35rem 0.65rem; font-size:12px; border-radius:6px;" onclick="window.handleDeleteSkill(${s.id}, '${escapeHtml(s.name)}')" title="Delete Skill">
                                <i class="fa-solid fa-trash"></i> Delete
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            console.error('Error loading admin skills:', err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align:center; padding:3rem 1rem; color:#EF4444;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size:1.5rem; margin-bottom:0.5rem; display:block;"></i>
                        <strong>Unable to load skills</strong>
                        <div style="font-size:13px; color:#64748b; margin-top:0.25rem;">${escapeHtml(err.message || 'Please check server connection.')}</div>
                        <button class="btn btn-primary-small" style="margin-top:0.75rem;" onclick="location.reload()">Retry</button>
                    </td>
                </tr>
            `;
        }
    };

    await fetchAndRenderSkills();
}

// ==========================================
// 12. CAREER GOALS MANAGEMENT (career-goals.html)
// ==========================================
async function setupAdminCareerGoalsPage() {
    const tbody = document.getElementById('adminGoalsTableBody');
    if (!tbody) return;

    let editingGoalId = null;
    const modal = document.getElementById('goalModal');
    const form = document.getElementById('goalForm');
    const goalTitleInput = document.getElementById('goalTitle');
    const goalDescInput = document.getElementById('goalDesc');
    const goalSkillsInput = document.getElementById('goalSkills');
    const addBtn = document.getElementById('addGoalBtn');

    window.closeGoalModal = function() {
        if (modal) modal.style.display = 'none';
        if (form) form.reset();
        editingGoalId = null;
        const modalTitle = modal ? modal.querySelector('h3') : null;
        if (modalTitle) modalTitle.textContent = 'Add Career Goal Benchmark';
    };

    window.openGoalModalForEdit = function(goalJsonStr) {
        try {
            const goal = JSON.parse(decodeURIComponent(goalJsonStr));
            editingGoalId = goal.id;
            if (goalTitleInput) goalTitleInput.value = goal.title || '';
            if (goalDescInput) goalDescInput.value = goal.description || '';
            const skillsArr = Array.isArray(goal.required_skills) ? goal.required_skills : [];
            if (goalSkillsInput) goalSkillsInput.value = skillsArr.join(', ');
            const modalTitle = modal ? modal.querySelector('h3') : null;
            if (modalTitle) modalTitle.textContent = 'Edit Career Goal Benchmark';
            if (modal) modal.style.display = 'flex';
        } catch (e) {
            console.error('Error opening edit goal modal:', e);
        }
    };

    window.handleDeleteGoal = async function(id, title) {
        if (!confirm(`Are you sure you want to delete career goal "${title}"?`)) return;
        try {
            await window.api.deleteAdminCareerGoal(id);
            alert('Career goal deleted successfully.');
            await fetchAndRenderGoals();
        } catch (err) {
            alert(err.message || 'Failed to delete career goal.');
        }
    };

    if (addBtn) {
        addBtn.addEventListener('click', () => {
            editingGoalId = null;
            if (form) form.reset();
            const modalTitle = modal ? modal.querySelector('h3') : null;
            if (modalTitle) modalTitle.textContent = 'Add Career Goal Benchmark';
            if (modal) modal.style.display = 'flex';
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = (goalTitleInput ? goalTitleInput.value : '').trim();
            const description = (goalDescInput ? goalDescInput.value : '').trim();
            const rawSkills = (goalSkillsInput ? goalSkillsInput.value : '').trim();

            if (!title || !rawSkills) {
                alert('Target Role Title and Required Skills are required.');
                return;
            }

            const required_skills = rawSkills.split(',').map(s => s.trim()).filter(Boolean);
            const payload = { title, description, required_skills };

            try {
                if (editingGoalId) {
                    await window.api.updateAdminCareerGoal(editingGoalId, payload);
                    alert('Career goal updated successfully!');
                } else {
                    await window.api.createAdminCareerGoal(payload);
                    alert('Career goal created successfully!');
                }
                closeGoalModal();
                await fetchAndRenderGoals();
            } catch (err) {
                alert(err.message || 'Failed to save career goal.');
            }
        });
    }

    const fetchAndRenderGoals = async () => {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center; padding:3rem 1rem; color:var(--secondary-text);">
                    <i class="fa-solid fa-spinner fa-spin mr-2" style="color:#5B3FE8; font-size:1.25rem;"></i> Loading career goals...
                </td>
            </tr>
        `;

        try {
            const goals = await window.api.getAdminCareerGoals();
            if (!goals || goals.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" style="text-align:center; padding:3.5rem 1rem; color:var(--secondary-text);">
                            <div style="font-size:2.2rem; margin-bottom:0.5rem;">🎯</div>
                            <div style="font-weight:700; font-size:16px; color:var(--dark-navy); margin-bottom:0.25rem;">No career goals found</div>
                            <div style="font-size:13.5px; color:#64748b;">Click "Add Goal" to define target industry career pathways.</div>
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = goals.map(g => {
                const skillsArr = Array.isArray(g.required_skills) ? g.required_skills : (typeof g.required_skills === 'string' ? JSON.parse(g.required_skills || '[]') : []);
                const chipsHtml = skillsArr.length > 0 
                    ? skillsArr.map(s => `<span class="badge" style="background:#EDE9FE; color:#5B21B6; font-size:11px; padding:2px 8px; border-radius:99px; margin-right:4px; margin-bottom:4px; display:inline-block;">${escapeHtml(s)}</span>`).join('')
                    : `<span style="font-size:12px; color:#94A3B8; font-style:italic;">None specified</span>`;

                const encodedData = encodeURIComponent(JSON.stringify(g));

                return `
                    <tr>
                        <td><strong style="color:var(--dark-navy); font-size:14px;"><i class="fa-solid fa-bullseye mr-2" style="color:#7C3AED;"></i> ${escapeHtml(g.title)}</strong></td>
                        <td><span style="font-size:13px; color:#475569;">${escapeHtml(g.description || 'Target career role benchmark.')}</span></td>
                        <td><div style="max-width:380px;">${chipsHtml}</div></td>
                        <td style="text-align:right; white-space:nowrap;">
                            <button class="btn btn-xs btn-outline" style="padding:0.35rem 0.65rem; font-size:12px; margin-right:4px; border-radius:6px;" onclick="window.openGoalModalForEdit('${encodedData}')" title="Edit Career Goal">
                                <i class="fa-solid fa-pen-to-square"></i> Edit
                            </button>
                            <button class="btn btn-xs btn-outline-danger" style="padding:0.35rem 0.65rem; font-size:12px; border-radius:6px;" onclick="window.handleDeleteGoal(${g.id}, '${escapeHtml(g.title)}')" title="Delete Career Goal">
                                <i class="fa-solid fa-trash"></i> Delete
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            console.error('Error loading admin career goals:', err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align:center; padding:3rem 1rem; color:#EF4444;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size:1.5rem; margin-bottom:0.5rem; display:block;"></i>
                        <strong>Unable to load career goals</strong>
                        <div style="font-size:13px; color:#64748b; margin-top:0.25rem;">${escapeHtml(err.message || 'Please check server connection.')}</div>
                        <button class="btn btn-primary-small" style="margin-top:0.75rem;" onclick="location.reload()">Retry</button>
                    </td>
                </tr>
            `;
        }
    };

    await fetchAndRenderGoals();
}

// ==========================================
// 13. ASSESSMENT QUESTIONS MANAGEMENT (assessment-questions.html)
// ==========================================
async function setupAdminAssessmentQuestionsPage() {
    const tbody = document.getElementById('adminQuestionsTableBody');
    if (!tbody) return;

    let allQuestions = [];
    let editingQuestionId = null;
    const modal = document.getElementById('questionModal');
    const form = document.getElementById('questionForm');
    const assessmentSelect = document.getElementById('qAssessmentSelect');
    const filterSelect = document.getElementById('adminAssessmentFilterSelect');
    const searchInput = document.getElementById('adminQuestionSearchInput');
    const addBtn = document.getElementById('addQuestionBtn');

    window.closeQuestionModal = function() {
        if (modal) modal.style.display = 'none';
        if (form) form.reset();
        editingQuestionId = null;
        const titleEl = document.getElementById('questionModalTitle');
        if (titleEl) titleEl.textContent = 'Add Assessment Question';
    };

    window.openQuestionModalForEdit = function(qJsonStr) {
        try {
            const q = JSON.parse(decodeURIComponent(qJsonStr));
            editingQuestionId = q.id;
            if (assessmentSelect) assessmentSelect.value = q.assessment_id;
            document.getElementById('qText').value = q.question_text || '';
            const opts = Array.isArray(q.options) ? q.options : ['', '', '', ''];
            document.getElementById('qOpt0').value = opts[0] || '';
            document.getElementById('qOpt1').value = opts[1] || '';
            document.getElementById('qOpt2').value = opts[2] || '';
            document.getElementById('qOpt3').value = opts[3] || '';
            
            const radios = document.getElementsByName('qCorrectRadio');
            radios.forEach(r => {
                r.checked = (parseInt(r.value, 10) === parseInt(q.correct_option, 10));
            });

            document.getElementById('qPoints').value = q.points || 10;
            document.getElementById('qExplanation').value = q.explanation || '';

            const titleEl = document.getElementById('questionModalTitle');
            if (titleEl) titleEl.textContent = 'Edit Assessment Question';
            if (modal) modal.style.display = 'flex';
        } catch (e) {
            console.error('Error opening question edit modal:', e);
        }
    };

    window.handleDeleteQuestion = async function(id) {
        if (!confirm(`Are you sure you want to delete question #${id}?`)) return;
        try {
            await window.api.deleteAdminAssessmentQuestion(id);
            alert('Assessment question deleted successfully.');
            await fetchAndRenderQuestions();
        } catch (err) {
            alert(err.message || 'Failed to delete question.');
        }
    };

    // Populate assessment dropdown
    try {
        const assessments = await window.api.getAdminAssessments();
        if (assessmentSelect && assessments) {
            assessmentSelect.innerHTML = assessments.map(a => `<option value="${a.id}">${escapeHtml(a.title)} (${escapeHtml(a.category)})</option>`).join('');
        }
        if (filterSelect && assessments) {
            filterSelect.innerHTML = `<option value="all">All Assessments</option>` + assessments.map(a => `<option value="${a.id}">${escapeHtml(a.title)}</option>`).join('');
            filterSelect.addEventListener('change', () => filterAndRender());
        }
    } catch (e) {
        console.warn('Could not load assessments dropdown:', e);
    }

    if (addBtn) {
        addBtn.addEventListener('click', () => {
            editingQuestionId = null;
            if (form) form.reset();
            const titleEl = document.getElementById('questionModalTitle');
            if (titleEl) titleEl.textContent = 'Add Assessment Question';
            if (modal) modal.style.display = 'flex';
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const assessment_id = parseInt(document.getElementById('qAssessmentSelect').value, 10);
            const question_text = document.getElementById('qText').value.trim();
            const opt0 = document.getElementById('qOpt0').value.trim();
            const opt1 = document.getElementById('qOpt1').value.trim();
            const opt2 = document.getElementById('qOpt2').value.trim();
            const opt3 = document.getElementById('qOpt3').value.trim();
            const points = parseInt(document.getElementById('qPoints').value, 10) || 10;
            const explanation = document.getElementById('qExplanation').value.trim();

            let correct_option = 0;
            const radios = document.getElementsByName('qCorrectRadio');
            for (const r of radios) {
                if (r.checked) { correct_option = parseInt(r.value, 10); break; }
            }

            if (!question_text || !opt0 || !opt1) {
                alert('Question text and at least 2 options are required.');
                return;
            }

            const options = [opt0, opt1, opt2, opt3].filter(Boolean);
            const payload = { assessment_id, question_text, options, correct_option, points, explanation };

            try {
                if (editingQuestionId) {
                    await window.api.updateAdminAssessmentQuestion(editingQuestionId, payload);
                    alert('Assessment question updated successfully!');
                } else {
                    await window.api.createAdminAssessmentQuestion(payload);
                    alert('Assessment question created successfully!');
                }
                closeQuestionModal();
                await fetchAndRenderQuestions();
            } catch (err) {
                alert(err.message || 'Failed to save question.');
            }
        });
    }

    if (searchInput) {
        let timer = null;
        searchInput.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(filterAndRender, 250);
        });
    }

    function filterAndRender() {
        const filterVal = filterSelect ? filterSelect.value : 'all';
        const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
        let filtered = allQuestions;
        if (filterVal !== 'all') {
            filtered = filtered.filter(q => String(q.assessment_id) === String(filterVal));
        }
        if (query) {
            filtered = filtered.filter(q => (q.question_text || '').toLowerCase().includes(query) || (q.assessment_title || '').toLowerCase().includes(query));
        }
        renderTableRows(filtered);
    }

    function renderTableRows(questions) {
        if (!questions || questions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center; padding:3.5rem 1rem; color:var(--secondary-text);">
                        <div style="font-size:2.2rem; margin-bottom:0.5rem;">📋</div>
                        <div style="font-weight:700; font-size:16px; color:var(--dark-navy); margin-bottom:0.25rem;">No assessment questions found</div>
                        <div style="font-size:13.5px; color:#64748b;">Click "Add Question" to author diagnostic questions.</div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = questions.map(q => {
            const opts = Array.isArray(q.options) ? q.options : [];
            const encodedData = encodeURIComponent(JSON.stringify(q));
            const optionsHtml = opts.map((opt, idx) => {
                const isCorrect = idx === Number(q.correct_option);
                return `
                    <div style="display:flex; align-items:center; gap:6px; font-size:12.5px; margin-bottom:3px; color:${isCorrect ? '#065F46' : '#475569'}; ${isCorrect ? 'font-weight:700;' : ''}">
                        <i class="fa-solid ${isCorrect ? 'fa-circle-check text-success' : 'fa-circle-dot'}" style="color:${isCorrect ? '#059669' : '#CBD5E1'}; font-size:11px;"></i>
                        <span>${escapeHtml(opt)}</span>
                        ${isCorrect ? '<span style="font-size:10px; background:#D1FAE5; color:#065F46; padding:1px 5px; border-radius:4px;">CORRECT</span>' : ''}
                    </div>
                `;
            }).join('');

            return `
                <tr>
                    <td>
                        <span class="badge" style="background:#EDE9FE; color:#5B21B6; font-size:11.5px; padding:3px 8px; border-radius:6px; font-weight:600; display:inline-block; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(q.assessment_title || '')}">
                            ${escapeHtml(q.assessment_title || `Assessment #${q.assessment_id}`)}
                        </span>
                    </td>
                    <td>
                        <strong style="color:var(--dark-navy); font-size:13.5px; display:block; margin-bottom:4px;">${escapeHtml(q.question_text)}</strong>
                        ${q.explanation ? `<div style="font-size:11.5px; color:#64748B;"><i class="fa-solid fa-lightbulb mr-1" style="color:#F59E0B;"></i> ${escapeHtml(q.explanation)}</div>` : ''}
                    </td>
                    <td><div style="max-width:320px;">${optionsHtml}</div></td>
                    <td><strong style="color:#4F46E5; font-size:13px;">${q.points || 10} pts</strong></td>
                    <td style="text-align:right; white-space:nowrap;">
                        <button class="btn btn-xs btn-outline" style="padding:0.35rem 0.65rem; font-size:12px; margin-right:4px; border-radius:6px;" onclick="window.openQuestionModalForEdit('${encodedData}')" title="Edit Question">
                            <i class="fa-solid fa-pen-to-square"></i> Edit
                        </button>
                        <button class="btn btn-xs btn-outline-danger" style="padding:0.35rem 0.65rem; font-size:12px; border-radius:6px;" onclick="window.handleDeleteQuestion(${q.id})" title="Delete Question">
                            <i class="fa-solid fa-trash"></i> Delete
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    const fetchAndRenderQuestions = async () => {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; padding:3rem 1rem; color:var(--secondary-text);">
                    <i class="fa-solid fa-spinner fa-spin mr-2" style="color:#5B3FE8; font-size:1.25rem;"></i> Loading assessment questions...
                </td>
            </tr>
        `;

        try {
            allQuestions = await window.api.getAdminAssessmentQuestions();
            filterAndRender();
        } catch (err) {
            console.error('Error loading assessment questions:', err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center; padding:3rem 1rem; color:#EF4444;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size:1.5rem; margin-bottom:0.5rem; display:block;"></i>
                        <strong>Unable to load assessment questions</strong>
                        <div style="font-size:13px; color:#64748b; margin-top:0.25rem;">${escapeHtml(err.message || 'Please check server connection.')}</div>
                        <button class="btn btn-primary-small" style="margin-top:0.75rem;" onclick="location.reload()">Retry</button>
                    </td>
                </tr>
            `;
        }
    };

    await fetchAndRenderQuestions();
}

// ==========================================
// 14. PLATFORM ENROLLMENTS (enrollments.html)
// ==========================================
async function setupAdminEnrollmentsPage() {
    const tbody = document.getElementById('adminEnrollmentsTableBody');
    if (!tbody) return;

    let currentPage = 1;
    const limit = 20;
    const courseFilter = document.getElementById('adminEnrollmentCourseFilter');
    const statusFilter = document.getElementById('adminEnrollmentStatusFilter');
    const searchInput = document.getElementById('adminEnrollmentSearchInput');
    const resetBtn = document.getElementById('adminEnrollmentResetBtn');
    const prevBtn = document.getElementById('prevEnrollmentBtn');
    const nextBtn = document.getElementById('nextEnrollmentBtn');
    const pageInfo = document.getElementById('enrollmentsPageInfo');

    // Populate course dropdown
    try {
        const courses = await window.api.getAdminCourses();
        if (courseFilter && courses) {
            courseFilter.innerHTML = `<option value="all">All Courses</option>` + courses.map(c => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join('');
        }
    } catch (_) {}

    const fetchAndRenderEnrollments = async () => {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:3rem 1rem; color:var(--secondary-text);">
                    <i class="fa-solid fa-spinner fa-spin mr-2" style="color:#5B3FE8; font-size:1.25rem;"></i> Loading platform enrollments...
                </td>
            </tr>
        `;

        try {
            const params = {
                page: currentPage,
                limit: limit
            };
            if (courseFilter && courseFilter.value !== 'all') params.course_id = courseFilter.value;
            if (statusFilter && statusFilter.value !== 'all') params.status = statusFilter.value;
            if (searchInput && searchInput.value.trim()) params.search = searchInput.value.trim();

            const res = await window.api.getAdminEnrollments(params);
            const items = res.enrollments || res.items || (Array.isArray(res) ? res : []);
            const total = res.total !== undefined ? res.total : items.length;

            // Update stats
            const completedCount = items.filter(e => (e.status || '').toLowerCase() === 'completed').length;
            const inProgressCount = items.filter(e => (e.status || '').toLowerCase() === 'in_progress').length;
            const uniqueUsers = new Set(items.map(e => e.user_id || e.student_id)).size;

            document.getElementById('statTotalEnrollments') && (document.getElementById('statTotalEnrollments').textContent = total);
            document.getElementById('statCompletedEnrollments') && (document.getElementById('statCompletedEnrollments').textContent = completedCount);
            document.getElementById('statInProgressEnrollments') && (document.getElementById('statInProgressEnrollments').textContent = inProgressCount);
            document.getElementById('statActiveLearners') && (document.getElementById('statActiveLearners').textContent = uniqueUsers || items.length);

            // Pagination info
            const start = total === 0 ? 0 : (currentPage - 1) * limit + 1;
            const end = Math.min(currentPage * limit, total);
            if (pageInfo) pageInfo.textContent = `Showing ${start}-${end} of ${total} enrollments`;
            if (prevBtn) prevBtn.disabled = currentPage <= 1;
            if (nextBtn) nextBtn.disabled = end >= total;

            if (items.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align:center; padding:3.5rem 1rem; color:var(--secondary-text);">
                            <div style="font-size:2.2rem; margin-bottom:0.5rem;">🎓</div>
                            <div style="font-weight:700; font-size:16px; color:var(--dark-navy); margin-bottom:0.25rem;">No enrollments found</div>
                            <div style="font-size:13.5px; color:#64748b;">Try adjusting your course, status, or search filters.</div>
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = items.map(e => {
                const studentName = e.student_name || e.user_name || 'Learner';
                const studentEmail = e.student_email || e.user_email || '';
                const courseTitle = e.course_title || `Course #${e.course_id}`;
                const instructorName = e.instructor_name || 'Faculty';
                const enrolledDate = e.enrolled_at || e.created_at || 'Recent';
                const progress = Math.min(100, Math.max(0, Number(e.progress_percentage || e.progress || 0)));
                const status = (e.status || 'in_progress').toLowerCase();
                const statusColor = status === 'completed' ? '#059669' : (status === 'in_progress' ? '#2563EB' : '#64748B');
                const statusBg = status === 'completed' ? '#ECFDF5' : (status === 'in_progress' ? '#EFF6FF' : '#F1F5F9');
                const statusLabel = status === 'completed' ? 'Completed' : (status === 'in_progress' ? 'In Progress' : 'Not Started');

                const initials = studentName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'ST';

                return `
                    <tr>
                        <td>
                            <div style="display:flex; align-items:center; gap:0.75rem;">
                                <div style="width:34px; height:34px; border-radius:50%; background:linear-gradient(135deg, #4F46E5, #7C3AED); color:#FFF; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; flex-shrink:0;">
                                    ${initials}
                                </div>
                                <div>
                                    <strong style="color:var(--dark-navy); font-size:13.5px; display:block;">${escapeHtml(studentName)}</strong>
                                    <span style="font-size:11.5px; color:#64748B;">${escapeHtml(studentEmail)}</span>
                                </div>
                            </div>
                        </td>
                        <td>
                            <strong style="color:var(--dark-navy); font-size:13.5px; display:block;">${escapeHtml(courseTitle)}</strong>
                            <span style="font-size:11.5px; color:#64748B;">${escapeHtml(e.course_category || 'General')}</span>
                        </td>
                        <td><span style="font-size:13px; color:#475569;">${escapeHtml(instructorName)}</span></td>
                        <td><span style="font-size:12.5px; color:#64748B;">${escapeHtml(enrolledDate)}</span></td>
                        <td>
                            <div style="display:flex; align-items:center; gap:0.6rem;">
                                <div style="flex:1; height:6px; background:#E2E8F0; border-radius:999px; overflow:hidden; min-width:60px;">
                                    <div style="width:${progress}%; height:100%; background:linear-gradient(90deg, #4F46E5, #10B981);"></div>
                                </div>
                                <span style="font-size:12px; font-weight:700; color:#4F46E5;">${progress}%</span>
                            </div>
                        </td>
                        <td>
                            <span class="badge" style="background:${statusBg}; color:${statusColor}; font-weight:700; font-size:11.5px; padding:3px 8px; border-radius:6px;">
                                ${statusLabel}
                            </span>
                        </td>
                        <td><span style="font-size:12px; color:#64748B;">${escapeHtml(e.last_activity || e.last_accessed || 'Recently active')}</span></td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            console.error('Error loading admin enrollments:', err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:3rem 1rem; color:#EF4444;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size:1.5rem; margin-bottom:0.5rem; display:block;"></i>
                        <strong>Unable to load enrollments</strong>
                        <div style="font-size:13px; color:#64748b; margin-top:0.25rem;">${escapeHtml(err.message || 'Please check server connection.')}</div>
                        <button class="btn btn-primary-small" style="margin-top:0.75rem;" onclick="location.reload()">Retry</button>
                    </td>
                </tr>
            `;
        }
    };

    courseFilter && courseFilter.addEventListener('change', () => { currentPage = 1; fetchAndRenderEnrollments(); });
    statusFilter && statusFilter.addEventListener('change', () => { currentPage = 1; fetchAndRenderEnrollments(); });
    if (searchInput) {
        let timer = null;
        searchInput.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => { currentPage = 1; fetchAndRenderEnrollments(); }, 300);
        });
    }
    resetBtn && resetBtn.addEventListener('click', () => {
        if (courseFilter) courseFilter.value = 'all';
        if (statusFilter) statusFilter.value = 'all';
        if (searchInput) searchInput.value = '';
        currentPage = 1;
        fetchAndRenderEnrollments();
    });
    prevBtn && prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            fetchAndRenderEnrollments();
        }
    });
    nextBtn && nextBtn.addEventListener('click', () => {
        currentPage++;
        fetchAndRenderEnrollments();
    });

    await fetchAndRenderEnrollments();
}
