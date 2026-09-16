/**
 * Admin Dashboard & LMS Governance JavaScript
 * 100% Dynamic data flow connected to live backend APIs.
 * Comprehensive Platform Administration: Users, Students, Instructors, Course Catalog,
 * Categories, Skills, Career Goals, Assessments, Enrollments, Reports, & Analytics.
 */

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function initAdminApp() {
    const user = window.guardPage('ADMIN');
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

    await Promise.allSettled(tasks);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminApp);
} else {
    initAdminApp();
}
window.addEventListener('load', () => {
    initAdminApp();
});

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

function renderSkillsAndCareers(stats) {
    document.getElementById('kpiTotalSkills') && (document.getElementById('kpiTotalSkills').textContent = stats.total_skills || 0);
    document.getElementById('kpiTotalCareers') && (document.getElementById('kpiTotalCareers').textContent = stats.total_career_goals || 0);
}

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

function renderPlatformStatistics(stats) {
    document.getElementById('kpiCompletionRate') && (document.getElementById('kpiCompletionRate').textContent = `${stats.completion_rate || 0}%`);
}

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

window.closeAdminStudentDetailModal = function() {
    const modal = document.getElementById('adminStudentDetailModal');
    if (modal) modal.style.display = 'none';
};

// =========================================================================
// 4. DEDICATED INSTRUCTOR MANAGEMENT (instructors.html)
// =========================================================================

let allAdminInstructorsData = [];

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

window.closeAdminInstructorDetailModal = function() {
    const modal = document.getElementById('adminInstructorDetailModal');
    if (modal) modal.style.display = 'none';
};

// =========================================================================
// 5. COURSE CATALOG & MODERATION (courses.html)
// =========================================================================

let adminCurrentModules = [];

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
