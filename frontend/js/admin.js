/**
 * Admin Dashboard & Governance JavaScript
 * 100% Dynamic data flow connected to live backend APIs.
 * Renders EXACTLY and ONLY the 13 Admin Dashboard sections.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const user = window.guardPage('ADMIN');
    if (!user) return;

    setupAdminHeader(user);

    // 1. Dashboard View
    if (document.getElementById('kpiTotalUsers') || document.getElementById('adminRecentUsersBody')) {
        await loadAdminDashboardData();
    }

    // 2. Courses Table View (courses.html)
    if (document.getElementById('adminCoursesTableBody')) {
        await setupAdminCoursesPage();
    }

    // 3. Course Editor View (course-editor.html)
    if (document.getElementById('adminCourseForm')) {
        await setupAdminCourseEditor(user);
    }
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

// 1. System Overview KPIs
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

// 2. User Management Table
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

// 3. Course Catalog Management
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

// 4. Course Categories
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

// 5 & 6. Skills & Career Goals
function renderSkillsAndCareers(stats) {
    document.getElementById('kpiTotalSkills') && (document.getElementById('kpiTotalSkills').textContent = stats.total_skills || 0);
    document.getElementById('kpiTotalCareers') && (document.getElementById('kpiTotalCareers').textContent = stats.total_career_goals || 0);
}

// 7 & 8. Assessments & System-wide Enrollments
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

// 9. Platform Statistics
function renderPlatformStatistics(stats) {
    document.getElementById('kpiCompletionRate') && (document.getElementById('kpiCompletionRate').textContent = `${stats.completion_rate || 0}%`);
}

// 11. Popular Courses
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

// Global module state for admin course editor
let adminCurrentModules = [];

// Sub-page: Admin Courses Page (courses.html)
async function setupAdminCoursesPage() {
    const tbody = document.getElementById('adminCoursesTableBody');
    const searchInput = document.getElementById('adminCourseSearchInput');
    const filterContainer = document.getElementById('adminStatusFilters');
    const categoryFilter = document.getElementById('adminCategoryFilter');
    const difficultyFilter = document.getElementById('adminDifficultyFilter');
    const sortSelect = document.getElementById('adminSortSelect');

    let currentStatus = 'all';

    // Populate categories dropdown
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

    if (categoryFilter) {
        categoryFilter.addEventListener('change', fetchAndRenderCourses);
    }

    if (difficultyFilter) {
        difficultyFilter.addEventListener('change', fetchAndRenderCourses);
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', fetchAndRenderCourses);
    }

    await fetchAndRenderCourses();
}

// Sub-page: Admin Course Editor (course-editor.html)
async function setupAdminCourseEditor(user) {
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('id');
    const headerTitle = document.getElementById('adminEditorHeaderTitle');
    const form = document.getElementById('adminCourseForm');
    const alertBox = document.getElementById('adminEditorAlert');
    const idInput = document.getElementById('adminEditingCourseId');
    const addModBtn = document.getElementById('adminAddModuleBtn');

    addModBtn?.addEventListener('click', () => {
        adminCurrentModules.push({
            module_id: adminCurrentModules.length + 1,
            title: `Module ${adminCurrentModules.length + 1}: Core Principles & Practice`,
            duration: "8 hours",
            lessons: [
                { lesson_id: 1, title: "Module Overview & Setup", duration: "45 mins", type: "video" }
            ],
            materials: "Source Code & Lab Exercises"
        });
        renderAdminModulesBuilder();
    });

    if (courseId) {
        if (headerTitle) headerTitle.textContent = 'Edit Platform Course';
        if (idInput) idInput.value = courseId;

        try {
            const course = await window.api.getCourseDetails(courseId);
            if (course) {
                document.getElementById('adminCourseTitle').value = course.title || '';
                document.getElementById('adminCourseInstructor').value = course.instructor || course.instructor_name || '';
                document.getElementById('adminCourseCategory').value = course.category || 'Web Development';
                document.getElementById('adminCourseLevel').value = course.level || course.difficulty || 'Intermediate';
                document.getElementById('adminCourseDuration').value = course.duration || '35 hours';
                document.getElementById('adminCourseLanguage').value = course.language || 'English';
                document.getElementById('adminCourseStatus').value = (course.status || 'published').toLowerCase();
                document.getElementById('adminCourseShortDesc').value = course.short_description || '';
                document.getElementById('adminCourseDescription').value = course.description || '';
                document.getElementById('adminCourseSkills').value = (course.skills || []).join(', ');
                document.getElementById('adminCoursePrereqs').value = (course.prerequisites || []).join('\n');
                document.getElementById('adminCourseTechReqs').value = (course.technical_requirements || []).join('\n');
                document.getElementById('adminCourseRecKnowledge').value = (course.recommended_knowledge || []).join('\n');
                document.getElementById('adminCourseRoles').value = (course.target_roles || course.career_goals || []).join(', ');
                document.getElementById('adminCourseOutcomes').value = (course.learning_outcomes || []).join('\n');

                if (course.modules && Array.isArray(course.modules) && course.modules.length > 0) {
                    adminCurrentModules = course.modules;
                }
            }
        } catch (err) {
            console.error("Admin load course error:", err);
            if (alertBox) {
                alertBox.style.display = 'block';
                alertBox.style.background = '#FEF2F2';
                alertBox.style.color = '#991B1B';
                alertBox.style.border = '1px solid #FECACA';
                alertBox.textContent = `Error: ${err.message}`;
            }
        }
    }

    renderAdminModulesBuilder();

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('adminSaveCourseBtn');

        const title = document.getElementById('adminCourseTitle').value.trim();
        const instructor = document.getElementById('adminCourseInstructor').value.trim();
        const category = document.getElementById('adminCourseCategory').value;
        const description = document.getElementById('adminCourseDescription').value.trim();
        const short_description = document.getElementById('adminCourseShortDesc').value.trim();
        const skillsRaw = document.getElementById('adminCourseSkills').value.trim();

        if (!title) {
            alert('Please provide a Course Title.');
            return;
        }
        if (!category) {
            alert('Please select a Category.');
            return;
        }
        if (!description) {
            alert('Please enter a Detailed Description.');
            return;
        }

        const parseList = (val) => {
            if (!val) return [];
            return val.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
        };

        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving System Course...'; }

        try {
            const payload = {
                title: title,
                instructor_name: instructor || 'SmartLearn Faculty',
                category: category,
                level: document.getElementById('adminCourseLevel').value,
                duration: document.getElementById('adminCourseDuration').value.trim() || '35 hours',
                language: document.getElementById('adminCourseLanguage').value.trim() || 'English',
                status: document.getElementById('adminCourseStatus').value,
                short_description: short_description || (description.slice(0, 120) + '...'),
                description: description,
                skills: parseList(skillsRaw),
                prerequisites: parseList(document.getElementById('adminCoursePrereqs').value),
                technical_requirements: parseList(document.getElementById('adminCourseTechReqs').value),
                recommended_knowledge: parseList(document.getElementById('adminCourseRecKnowledge').value),
                target_roles: parseList(document.getElementById('adminCourseRoles').value),
                career_goals: parseList(document.getElementById('adminCourseRoles').value),
                learning_outcomes: parseList(document.getElementById('adminCourseOutcomes').value),
                modules: adminCurrentModules
            };

            if (courseId) {
                await window.api.updateCourse(courseId, payload);
            } else {
                await window.api.createCourse(payload);
            }

            if (alertBox) {
                alertBox.style.display = 'block';
                alertBox.style.background = '#ECFDF5';
                alertBox.style.color = '#065F46';
                alertBox.style.border = '1px solid #A7F3D0';
                alertBox.textContent = 'Platform course successfully saved to database! Redirecting to Catalog...';
            }

            setTimeout(() => {
                window.location.href = 'courses.html';
            }, 1000);

        } catch (err) {
            if (alertBox) {
                alertBox.style.display = 'block';
                alertBox.style.background = '#FEF2F2';
                alertBox.style.color = '#991B1B';
                alertBox.style.border = '1px solid #FECACA';
                alertBox.textContent = err.message || 'Failed to save course.';
            }
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Save System Course'; }
        }
    });
}

function renderAdminModulesBuilder() {
    const container = document.getElementById('adminModulesContainer');
    if (!container) return;

    if (adminCurrentModules.length === 0) {
        adminCurrentModules = [
            {
                module_id: 1,
                title: "Module 1: Foundations & Architecture",
                duration: "6 hours",
                lessons: [
                    { lesson_id: 1, title: "Course Introduction & Setup", duration: "45 mins", type: "video" },
                    { lesson_id: 2, title: "Core Architecture Deep Dive", duration: "60 mins", type: "hands-on" }
                ],
                materials: "Downloadable Starter Repository & PDF Handout"
            }
        ];
    }

    container.innerHTML = adminCurrentModules.map((m, mIdx) => `
        <div class="module-card" style="border:1px solid #DDD6FE; background:#FBFBFE; border-radius:8px; padding:1rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                <input type="text" value="${escapeHtml(m.title)}" onchange="updateAdminModuleTitle(${mIdx}, this.value)" placeholder="Module Title" class="form-input" style="font-weight:700; flex:1; margin-right:0.75rem; padding:0.4rem 0.6rem; border:1px solid #CBD5E1; border-radius:6px; font-size:13px;">
                <input type="text" value="${escapeHtml(m.duration || '6 hours')}" onchange="updateAdminModuleDuration(${mIdx}, this.value)" placeholder="Duration (e.g. 6 hours)" class="form-input" style="width:140px; margin-right:0.75rem; padding:0.4rem 0.6rem; border:1px solid #CBD5E1; border-radius:6px; font-size:13px;">
                <button type="button" onclick="removeAdminModule(${mIdx})" class="btn-outline" style="color:#EF4444; border-color:#FCA5A5; padding:0.35rem 0.6rem; font-size:12px; border-radius:6px;" title="Delete Module"><i class="fa-solid fa-trash"></i></button>
            </div>

            <div style="margin-left:0.5rem; margin-bottom:0.75rem;">
                <div style="font-size:12px; font-weight:600; color:#475569; margin-bottom:0.4rem;">Lessons:</div>
                <div id="adminLessonsContainer_${mIdx}" style="display:flex; flex-direction:column; gap:0.4rem;">
                    ${(m.lessons || []).map((l, lIdx) => `
                        <div style="display:flex; gap:0.5rem; align-items:center;">
                            <span style="font-size:11.5px; color:#94A3B8;">${lIdx + 1}.</span>
                            <input type="text" value="${escapeHtml(l.title)}" onchange="updateAdminLessonTitle(${mIdx}, ${lIdx}, this.value)" placeholder="Lesson Title" class="form-input" style="flex:1; padding:0.35rem 0.5rem; font-size:12.5px; border:1px solid #E2E8F0; border-radius:6px;">
                            <input type="text" value="${escapeHtml(l.duration || '45 mins')}" onchange="updateAdminLessonDuration(${mIdx}, ${lIdx}, this.value)" placeholder="Duration" class="form-input" style="width:100px; padding:0.35rem 0.5rem; font-size:12.5px; border:1px solid #E2E8F0; border-radius:6px;">
                            <select onchange="updateAdminLessonType(${mIdx}, ${lIdx}, this.value)" class="form-input" style="width:110px; padding:0.35rem 0.5rem; font-size:12px; border:1px solid #E2E8F0; border-radius:6px;">
                                <option value="video" ${l.type === 'video' ? 'selected' : ''}>Video</option>
                                <option value="hands-on" ${l.type === 'hands-on' ? 'selected' : ''}>Hands-on Lab</option>
                                <option value="project" ${l.type === 'project' ? 'selected' : ''}>Project</option>
                                <option value="capstone" ${l.type === 'capstone' ? 'selected' : ''}>Capstone</option>
                            </select>
                            <button type="button" onclick="removeAdminLesson(${mIdx}, ${lIdx})" style="border:none; background:none; color:#94A3B8; cursor:pointer; font-size:13px;" title="Delete Lesson"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    `).join('')}
                </div>
                <button type="button" onclick="addAdminLesson(${mIdx})" style="background:none; border:none; color:var(--primary-purple); font-size:12px; font-weight:600; cursor:pointer; margin-top:0.4rem;"><i class="fa-solid fa-plus mr-1"></i> Add Lesson</button>
            </div>

            <div style="margin-left:0.5rem;">
                <label style="font-size:12px; font-weight:600; color:#475569; display:block; margin-bottom:0.25rem;">Course Materials / Resources:</label>
                <input type="text" value="${escapeHtml(m.materials || '')}" onchange="updateAdminModuleMaterials(${mIdx}, this.value)" placeholder="e.g. GitHub Repository, Lecture Slides PDF, Sandbox starter files" class="form-input" style="width:100%; padding:0.35rem 0.5rem; font-size:12.5px; border:1px solid #E2E8F0; border-radius:6px;">
            </div>
        </div>
    `).join('');
}

window.addAdminLesson = function(mIdx) {
    if (!adminCurrentModules[mIdx].lessons) adminCurrentModules[mIdx].lessons = [];
    adminCurrentModules[mIdx].lessons.push({
        lesson_id: adminCurrentModules[mIdx].lessons.length + 1,
        title: `Lesson ${adminCurrentModules[mIdx].lessons.length + 1}: Practical Application`,
        duration: "45 mins",
        type: "video"
    });
    renderAdminModulesBuilder();
};

window.removeAdminLesson = function(mIdx, lIdx) {
    adminCurrentModules[mIdx].lessons.splice(lIdx, 1);
    renderAdminModulesBuilder();
};

window.updateAdminModuleTitle = function(mIdx, val) { adminCurrentModules[mIdx].title = val; };
window.updateAdminModuleDuration = function(mIdx, val) { adminCurrentModules[mIdx].duration = val; };
window.updateAdminModuleMaterials = function(mIdx, val) { adminCurrentModules[mIdx].materials = val; };
window.updateAdminLessonTitle = function(mIdx, lIdx, val) { adminCurrentModules[mIdx].lessons[lIdx].title = val; };
window.updateAdminLessonDuration = function(mIdx, lIdx, val) { adminCurrentModules[mIdx].lessons[lIdx].duration = val; };
window.updateAdminLessonType = function(mIdx, lIdx, val) { adminCurrentModules[mIdx].lessons[lIdx].type = val; };
window.removeAdminModule = function(mIdx) {
    adminCurrentModules.splice(mIdx, 1);
    renderAdminModulesBuilder();
};

// Global Admin Action Handlers
window.handleAdminTogglePublish = async function(courseId, isPublished) {
    const action = isPublished ? 'unpublish' : 'publish';
    if (!confirm(`Are you sure you want to ${action} this course?`)) return;

    try {
        const newStatus = isPublished ? 'draft' : 'published';
        await window.api.updateCourseStatus(courseId, newStatus);
        if (document.getElementById('adminCoursesTableBody')) {
            await setupAdminCoursesPage();
        } else {
            window.location.reload();
        }
    } catch (err) {
        alert(err.message || `Failed to ${action} course.`);
    }
};

window.handleAdminToggleDeactivate = async function(courseId, isDeactivated) {
    const action = isDeactivated ? 'activate' : 'deactivate';
    if (!confirm(`Are you sure you want to ${action} this course?`)) return;

    try {
        if (isDeactivated) {
            await window.api.updateCourseStatus(courseId, 'published');
        } else {
            await window.api.deleteCourse(courseId); // Deactivates course
        }
        if (document.getElementById('adminCoursesTableBody')) {
            await setupAdminCoursesPage();
        } else {
            window.location.reload();
        }
    } catch (err) {
        alert(err.message || `Failed to ${action} course.`);
    }
};

// Global actions
window.handleToggleUserStatus = async function(userId, currentActive) {
    try {
        const actionName = currentActive ? "deactivate" : "activate";
        if (!confirm(`Are you sure you want to ${actionName} this user?`)) return;

        await window.api.updateAdminUserStatus(userId, !currentActive);
        if (document.getElementById('adminRecentUsersBody')) await loadAdminDashboardData();
        else window.location.reload();
    } catch (err) {
        alert(err.message || "Failed to update user status.");
    }
};

window.handleToggleCoursePublish = async function(courseId, currentPublished) {
    try {
        const actionName = currentPublished ? "unpublish" : "publish";
        if (!confirm(`Are you sure you want to ${actionName} this course?`)) return;

        const newStatus = currentPublished ? 'draft' : 'published';
        await window.api.updateCourseStatus(courseId, newStatus);
        
        if (document.getElementById('adminCoursesBody')) {
            await loadAdminDashboardData();
        } else {
            window.location.reload();
        }
    } catch (err) {
        alert(err.message || "Failed to update course status.");
    }
};

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
