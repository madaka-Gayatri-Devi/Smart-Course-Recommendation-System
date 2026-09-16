/**
 * Instructor Dashboard & Course Studio JavaScript
 * 100% Dynamic data flow connected to live backend APIs.
 * Full LMS course creator with structured requirements, interactive tag chips,
 * expandable curriculum builder, multi-type lesson editors, quizzes, demo video,
 * thumbnail manager, pricing controls, draft saving, and live student preview.
 */

let currentModules = [];
let skillsList = [];
let targetRolesList = [];
let careerGoalsList = [];
let learningOutcomesList = [];
let courseResourcesList = [];
let selectedPricingMode = 'free'; // 'free' | 'paid'
let uploadedThumbnailUrl = '';
let uploadedDemoVideoUrl = '';

async function initInstructorApp() {
    const user = window.guardPage('INSTRUCTOR');
    if (!user) return;

    setupInstructorHeader(user);

    // 1. Dashboard View
    if (document.getElementById('instructorWelcomeName') || document.getElementById('statMyCourses')) {
        await loadInstructorDashboardData(user);
    }

    // 2. Courses Table View (courses.html)
    if (document.getElementById('instructorMyCoursesBody')) {
        await loadInstructorCoursesPage();
    }

    // 3. Course Studio / Editor View (course-editor.html)
    if (document.getElementById('courseForm')) {
        await setupCourseStudio(user);
    }

    // 4. Students & Enrollments Page (students.html)
    if (document.getElementById('instructorStudentsTableBody')) {
        await loadInstructorStudentsPage();
    }

    // 5. Ratings & Reviews Page (reviews.html)
    if (document.getElementById('instructorReviewsContainer')) {
        await loadInstructorReviewsPage();
    }

    // 6. Course Analytics Page (analytics.html)
    if (document.getElementById('instructorAnalyticsTableBody')) {
        await loadInstructorAnalyticsPage();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInstructorApp);
} else {
    initInstructorApp();
}

function setupInstructorHeader(user) {
    const name = user.full_name || user.name || 'Instructor';
    const initial = name.charAt(0).toUpperCase();

    document.getElementById('topName') && (document.getElementById('topName').textContent = name);
    document.getElementById('sidebarName') && (document.getElementById('sidebarName').textContent = name);
    document.getElementById('sidebarRole') && (document.getElementById('sidebarRole').textContent = 'Instructor');
    document.getElementById('topAvatar') && (document.getElementById('topAvatar').textContent = initial);
    document.getElementById('sidebarAvatar') && (document.getElementById('sidebarAvatar').textContent = initial);
}

// =========================================================================
// 1. DASHBOARD & COURSES LISTING METHODS
// =========================================================================

async function loadInstructorDashboardData(user) {
    try {
        const summary = await window.api.getInstructorDashboardSummary();
        if (!summary) throw new Error("Could not load instructor dashboard summary");

        const welcomeEl = document.getElementById('instructorWelcomeName');
        if (welcomeEl) welcomeEl.textContent = `Welcome, ${user.full_name || 'Instructor'}! 👨‍🏫`;

        const stats = summary.stats || {};
        document.getElementById('statMyCourses') && (document.getElementById('statMyCourses').textContent = stats.my_courses_count || 0);
        document.getElementById('statPublishedCourses') && (document.getElementById('statPublishedCourses').textContent = stats.published_courses_count || 0);
        document.getElementById('statDraftCourses') && (document.getElementById('statDraftCourses').textContent = stats.draft_courses_count || 0);

        renderMyCoursesTable(summary.my_courses || []);
        renderStudentEnrollmentsAndProgress(summary.recent_students || []);
        renderCompletionStats(stats, summary.recent_students || []);
        renderReviews(summary.reviews || [], stats.avg_rating);
        renderCourseAnalytics(summary.my_courses || []);
    } catch (err) {
        console.error("Instructor dashboard error:", err);
    }
}

function renderMyCoursesTable(courses) {
    const tbodies = [
        document.getElementById('instructorCoursesTableBody'),
        document.getElementById('instructorMyCoursesBody')
    ].filter(Boolean);

    if (tbodies.length === 0) return;

    if (!courses || courses.length === 0) {
        const emptyHtml = `
            <tr>
                <td colspan="9" style="text-align:center; padding:3rem 1rem; color:var(--secondary-text);">
                    <div style="font-size:2rem; margin-bottom:0.5rem;">📚</div>
                    <div style="font-weight:700; font-size:16px; color:var(--dark-navy); margin-bottom:0.25rem;">No courses created yet.</div>
                    <div style="font-size:13.5px; margin-bottom:1.25rem; color:#64748b;">Start creating and sharing your expertise with eager students!</div>
                    <div><a href="course-editor.html" class="btn-primary" style="text-decoration:none; padding:0.6rem 1.4rem; font-size:13px; display:inline-block; border-radius:6px;">Create Course</a></div>
                </td>
            </tr>
        `;
        tbodies.forEach(tb => tb.innerHTML = emptyHtml);
        return;
    }

    const rowsHtml = courses.map(c => {
        const isPublished = (c.status || '').toLowerCase() === 'published';
        const isFree = c.is_free !== 0 && c.is_free !== false && (!c.price || Number(c.price) === 0);
        const priceDisplay = isFree 
            ? '<span class="badge-status-published" style="background:#ECFDF5; color:#059669; font-weight:600; font-size:11.5px; padding:2px 8px; border-radius:12px;">Free</span>' 
            : `<span style="background:#EEF2FF; color:#4F46E5; font-weight:700; font-size:12px; padding:2px 8px; border-radius:12px;">₹${Number(c.price || 0).toLocaleString()}</span>`;

        return `
            <tr>
                <td>
                    <strong style="color:var(--dark-navy); font-size:14px;">${escapeHtml(c.title)}</strong>
                    <div style="font-size:11.5px; color:#64748b; margin-top:2px;">${escapeHtml(c.short_description || '')}</div>
                </td>
                <td><span class="badge-category">${escapeHtml(c.category || 'General')}</span></td>
                <td><span style="font-size:12.5px; color:#475569; font-weight:500;">${escapeHtml(c.difficulty || c.level || 'Intermediate')}</span></td>
                <td><span style="font-size:12.5px; color:#475569;">${escapeHtml(c.duration || '30 hours')}</span></td>
                <td>${priceDisplay}</td>
                <td>
                    <span class="status-pill ${isPublished ? 'badge-status-published' : 'badge-status-draft'}">
                        ${isPublished ? 'Published' : 'Draft'}
                    </span>
                </td>
                <td><strong>${c.students_count || c.enrollment_count || 0}</strong></td>
                <td>⭐ ${(c.rating || 4.8).toFixed(1)}</td>
                <td style="text-align:right; white-space:nowrap;">
                    <a href="../student/course-details.html?id=${c.id}" target="_blank" class="btn-outline" style="padding:0.3rem 0.55rem; font-size:11.5px; text-decoration:none; margin-right:3px; border-radius:6px;" title="Preview Public Page"><i class="fa-solid fa-eye"></i> View</a>
                    <a href="course-editor.html?id=${c.id}" class="btn-primary-small" style="text-decoration:none; padding:0.3rem 0.65rem; font-size:11.5px; margin-right:3px; border-radius:6px; background:#4F46E5;" title="Edit in Course Studio"><i class="fa-solid fa-pen-to-square mr-1"></i> Edit Studio</a>
                    <button onclick="handleInstructorTogglePublish(${c.id}, ${isPublished})" class="btn-outline" style="padding:0.3rem 0.55rem; font-size:11.5px; border-radius:6px; cursor:pointer;" title="${isPublished ? 'Unpublish course' : 'Publish course'}">
                        ${isPublished ? 'Unpublish' : 'Publish'}
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    tbodies.forEach(tb => tb.innerHTML = rowsHtml);
}

window.handleInstructorTogglePublish = async function(courseId, isPublished) {
    const action = isPublished ? 'unpublish' : 'publish';
    if (!confirm(`Are you sure you want to ${action} this course?`)) return;

    try {
        const newStatus = isPublished ? 'draft' : 'published';
        await window.api.updateCourseStatus(courseId, newStatus);
        if (document.getElementById('instructorMyCoursesBody')) {
            await loadInstructorCoursesPage();
        } else {
            await loadInstructorDashboardData(window.api.getCurrentUser());
        }
    } catch (err) {
        alert(err.message || `Failed to ${action} course.`);
    }
};

function renderStudentEnrollmentsAndProgress(students) {
    const enrollmentsList = document.getElementById('instStudentEnrollmentsList');
    const progressList = document.getElementById('instStudentProgressList');
    const countBadge = document.getElementById('instTotalStudentsBadge');

    if (countBadge) countBadge.textContent = `${students.length} Students`;

    if (!students || students.length === 0) {
        const emptyHtml = `<div style="text-align:center; padding:1.5rem; color:var(--secondary-text);">No student enrollments yet.</div>`;
        if (enrollmentsList) enrollmentsList.innerHTML = emptyHtml;
        if (progressList) progressList.innerHTML = emptyHtml;
        return;
    }

    if (enrollmentsList) {
        enrollmentsList.innerHTML = students.slice(0, 4).map(s => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:0.6rem 0; border-bottom:1px solid #EDE9FE; font-size:13px;">
                <div>
                    <strong>${escapeHtml(s.student_name)}</strong>
                    <div style="font-size:11.5px; color:var(--secondary-text);">${escapeHtml(s.course_title)}</div>
                </div>
                <span style="font-size:11px; color:#64748b; background:#F1F5F9; padding:2px 6px; border-radius:4px;">${escapeHtml(s.enrolled_at || 'Recent')}</span>
            </div>
        `).join('');
    }

    if (progressList) {
        progressList.innerHTML = students.slice(0, 4).map(s => `
            <div style="padding:0.6rem 0; border-bottom:1px solid #EDE9FE;">
                <div style="display:flex; justify-content:space-between; font-size:12.5px; font-weight:600; margin-bottom:3px;">
                    <span>${escapeHtml(s.student_name)}</span>
                    <span style="color:var(--primary-purple);">${s.progress_percentage || 0}%</span>
                </div>
                <div style="height:5px; background:#E2E8F0; border-radius:9999px; overflow:hidden;">
                    <div style="height:100%; width:${s.progress_percentage || 0}%; background:linear-gradient(90deg, #10B981, #059669); border-radius:9999px;"></div>
                </div>
            </div>
        `).join('');
    }
}

function renderCompletionStats(stats, students) {
    const totalLearners = stats.total_students || (students ? students.length : 0);
    const completedLearners = students ? students.filter(s => s.progress_percentage === 100).length : 0;
    const rate = totalLearners > 0 ? Math.round((completedLearners / totalLearners) * 100) : 0;

    document.getElementById('instStatTotalLearners') && (document.getElementById('instStatTotalLearners').textContent = totalLearners);
    document.getElementById('instStatCompletedLearners') && (document.getElementById('instStatCompletedLearners').textContent = completedLearners);
    document.getElementById('instStatCompletionRate') && (document.getElementById('instStatCompletionRate').textContent = `${rate}%`);
}

function renderReviews(reviews, avgRating) {
    const feed = document.getElementById('instReviewsFeed');
    const badge = document.getElementById('instAvgRatingBadge');

    if (badge) badge.textContent = `⭐ ${(avgRating || 5.0).toFixed(1)} Avg`;

    if (!feed) return;

    if (!reviews || reviews.length === 0) {
        feed.innerHTML = `<div style="text-align:center; padding:1.5rem; color:var(--secondary-text);">No student reviews yet.</div>`;
        return;
    }

    feed.innerHTML = reviews.slice(0, 3).map(r => `
        <div style="background:#F8F7FF; border:1px solid #EDE9FE; border-radius:8px; padding:0.75rem 1rem; margin-bottom:0.5rem; font-size:12.5px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                <strong>${escapeHtml(r.reviewer_name)}</strong>
                <span style="color:#F59E0B;">${'⭐'.repeat(r.rating || 5)}</span>
            </div>
            <div style="font-size:11px; color:var(--primary-purple); margin-bottom:2px;">Course: ${escapeHtml(r.course_title)}</div>
            <p style="margin:0; color:#475569;">${escapeHtml(r.comment || 'Great curriculum!')}</p>
        </div>
    `).join('');
}

function renderCourseAnalytics(courses) {
    const container = document.getElementById('instCourseAnalyticsContainer');
    if (!container) return;

    if (!courses || courses.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:1.5rem; color:var(--secondary-text);">No course analytics available yet.</div>`;
        return;
    }

    container.innerHTML = courses.slice(0, 4).map(c => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.6rem 0; border-bottom:1px solid #EDE9FE; font-size:13px;">
            <span style="color:var(--dark-navy); font-weight:600;">${escapeHtml(c.title)}</span>
            <span style="color:var(--secondary-text);">${c.students_count || 0} students • ⭐ ${(c.rating || 4.8).toFixed(1)}</span>
        </div>
    `).join('');
}

let allInstructorCourses = [];
let currentFilterTab = 'all';

async function loadInstructorCoursesPage() {
    const tbody = document.getElementById('instructorMyCoursesBody');
    if (!tbody) return;

    try {
        allInstructorCourses = await window.api.getInstructorCourses() || [];
        updateCourseTabCounts();
        applyInstructorCourseFilters();
        setupCoursePageEventListeners();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#EF4444; padding:2rem;">${escapeHtml(err.message)}</td></tr>`;
    }
}

function updateCourseTabCounts() {
    const total = allInstructorCourses.length;
    const published = allInstructorCourses.filter(c => (c.status || '').toLowerCase() === 'published').length;
    const drafts = allInstructorCourses.filter(c => (c.status || '').toLowerCase() !== 'published').length;
    const free = allInstructorCourses.filter(c => c.is_free !== 0 && c.is_free !== false && (!c.price || Number(c.price) === 0)).length;
    const paid = allInstructorCourses.filter(c => !(c.is_free !== 0 && c.is_free !== false && (!c.price || Number(c.price) === 0))).length;

    document.getElementById('countAll') && (document.getElementById('countAll').textContent = total);
    document.getElementById('countPublished') && (document.getElementById('countPublished').textContent = published);
    document.getElementById('countDrafts') && (document.getElementById('countDrafts').textContent = drafts);
    document.getElementById('countFree') && (document.getElementById('countFree').textContent = free);
    document.getElementById('countPaid') && (document.getElementById('countPaid').textContent = paid);
}

function applyInstructorCourseFilters() {
    let filtered = [...allInstructorCourses];

    if (currentFilterTab === 'published') {
        filtered = filtered.filter(c => (c.status || '').toLowerCase() === 'published');
    } else if (currentFilterTab === 'draft') {
        filtered = filtered.filter(c => (c.status || '').toLowerCase() !== 'published');
    } else if (currentFilterTab === 'free') {
        filtered = filtered.filter(c => c.is_free !== 0 && c.is_free !== false && (!c.price || Number(c.price) === 0));
    } else if (currentFilterTab === 'paid') {
        filtered = filtered.filter(c => !(c.is_free !== 0 && c.is_free !== false && (!c.price || Number(c.price) === 0)));
    }

    const searchInput = document.getElementById('myCoursesSearch');
    const term = searchInput ? searchInput.value.trim().toLowerCase() : '';
    if (term) {
        filtered = filtered.filter(c => 
            (c.title || '').toLowerCase().includes(term) ||
            (c.category || '').toLowerCase().includes(term) ||
            (c.short_description || '').toLowerCase().includes(term) ||
            (c.description || '').toLowerCase().includes(term) ||
            (c.difficulty || c.level || '').toLowerCase().includes(term)
        );
    }

    const sortSelect = document.getElementById('instructorSortSelect');
    const sortBy = sortSelect ? sortSelect.value : 'newest';
    if (sortBy === 'students') {
        filtered.sort((a, b) => (b.students_count || b.enrollment_count || 0) - (a.students_count || a.enrollment_count || 0));
    } else if (sortBy === 'rating') {
        filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortBy === 'title') {
        filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else {
        // default newest (id descending)
        filtered.sort((a, b) => (b.id || 0) - (a.id || 0));
    }

    renderMyCoursesTable(filtered);
}

let coursePageEventsSetup = false;
function setupCoursePageEventListeners() {
    if (coursePageEventsSetup) return;
    coursePageEventsSetup = true;

    const tabBtns = document.querySelectorAll('#coursesTabPills .course-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilterTab = btn.getAttribute('data-filter') || 'all';
            applyInstructorCourseFilters();
        });
    });

    const searchInput = document.getElementById('myCoursesSearch');
    if (searchInput) {
        searchInput.addEventListener('input', applyInstructorCourseFilters);
    }

    const sortSelect = document.getElementById('instructorSortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', applyInstructorCourseFilters);
    }
}



// =========================================================================
// 2. COURSE STUDIO (CREATE & EDIT) SYSTEM
// =========================================================================

async function setupCourseStudio(user) {
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('id');
    const headerTitle = document.getElementById('editorHeaderTitle');
    const alertBox = document.getElementById('editorAlert');
    const idInput = document.getElementById('editingCourseId');

    // 1. Initialize Tag/Chip inputs
    initChipInput('skillInput', 'skillsListWrapper', skillsList, () => {
        document.getElementById('errSkills') && (document.getElementById('errSkills').style.display = 'none');
    });
    initChipInput('roleInput', 'rolesListWrapper', targetRolesList);
    initChipInput('goalInput', 'goalsListWrapper', careerGoalsList);

    // 2. Initialize Learning Outcomes
    document.getElementById('addOutcomeBtn')?.addEventListener('click', () => {
        addLearningOutcomeRow('');
    });

    // 3. Initialize Module Builder
    document.getElementById('addModuleBtn')?.addEventListener('click', () => {
        const newModIdx = currentModules.length + 1;
        currentModules.push({
            module_id: newModIdx,
            title: `Module ${newModIdx}: Core Concepts & Practical Foundations`,
            duration: "6 hours",
            description: "",
            objectives: "",
            is_expanded: true,
            lessons: [
                {
                    lesson_id: 1,
                    title: `Lesson 1: Introduction & Architecture`,
                    type: "video",
                    duration: "30 mins",
                    short_description: "",
                    content: "",
                    video_url: "",
                    is_preview: true,
                    preview_enabled: true,
                    is_expanded: true,
                    materials: []
                }
            ],
            materials: ""
        });
        renderModulesBuilder();
    });

    // 4. Default Seed Data for New Course
    if (!courseId) {
        skillsList = ["HTML5", "CSS3", "JavaScript ES6+", "React", "Node.js", "REST APIs"];
        renderChipList('skillsListWrapper', skillsList);

        targetRolesList = ["Full Stack Developer", "Frontend Engineer", "Web Developer"];
        renderChipList('rolesListWrapper', targetRolesList);

        careerGoalsList = ["Full Stack Mastery", "Software Engineering Career"];
        renderChipList('goalsListWrapper', careerGoalsList);

        learningOutcomesList = [
            "Build production-ready, responsive full stack web applications.",
            "Architect and integrate secure RESTful APIs with databases.",
            "Implement modern state management and asynchronous patterns."
        ];
        renderLearningOutcomes();

        currentModules = [
            {
                module_id: 1,
                title: "Module 1: Web Foundations & Modern Architecture",
                duration: "6 hours",
                description: "Deep dive into web standards, core architecture, and developer setup.",
                objectives: "Set up development tooling and master the fundamental protocols.",
                is_expanded: true,
                lessons: [
                    {
                        lesson_id: 1,
                        title: "1.1 Introduction to Web Architecture & Protocols",
                        type: "video",
                        duration: "25 mins",
                        short_description: "Overview of client-server models, HTTP/HTTPS, and rendering pipelines.",
                        content: "In this lesson we explore how browsers communicate with backend services.",
                        video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                        is_preview: true,
                        preview_enabled: true,
                        is_expanded: true,
                        materials: [
                            { title: "Architecture Diagram PDF", type: "PDF", url: "https://example.com/diagram.pdf" }
                        ]
                    },
                    {
                        lesson_id: 2,
                        title: "1.2 Hands-on Workspace Configuration & Tooling",
                        type: "hands-on",
                        duration: "40 mins",
                        short_description: "Configuring VS Code, Linters, Git, and runtime dependencies.",
                        content: "Follow step-by-step instructions to initialize your workspace repository.",
                        video_url: "",
                        is_preview: false,
                        preview_enabled: false,
                        is_expanded: false,
                        materials: []
                    }
                ]
            }
        ];
        renderModulesBuilder();
    }

    // 5. Load Existing Course Data if Editing
    if (courseId) {
        if (headerTitle) headerTitle.textContent = 'Edit Course Studio';
        if (idInput) idInput.value = courseId;

        try {
            const course = await window.api.getCourseDetails(courseId);
            if (course) {
                document.getElementById('courseTitle').value = course.title || '';
                document.getElementById('courseCategory').value = course.category || 'Web Development';
                document.getElementById('courseLevel').value = course.level || course.difficulty || 'Intermediate';
                document.getElementById('courseDuration').value = course.duration || '30 hours';
                document.getElementById('courseStatus').value = course.status || 'published';
                document.getElementById('courseLanguage') && (document.getElementById('courseLanguage').value = course.language || 'English');
                document.getElementById('courseShortDesc').value = course.short_description || '';
                document.getElementById('courseDescription').value = course.description || '';

                // Skills
                skillsList = Array.isArray(course.skills) ? [...course.skills] : [];
                renderChipList('skillsListWrapper', skillsList);

                // Prerequisites & Reqs
                document.getElementById('coursePrereqs').value = (course.prerequisites || []).join('\n');
                document.getElementById('courseTechReqs').value = (course.technical_requirements || []).join('\n');
                document.getElementById('courseRecKnowledge').value = (course.recommended_knowledge || []).join('\n');

                // Roles & Goals
                targetRolesList = Array.isArray(course.target_roles) ? [...course.target_roles] : [];
                renderChipList('rolesListWrapper', targetRolesList);

                careerGoalsList = Array.isArray(course.career_goals) ? [...course.career_goals] : [];
                renderChipList('goalsListWrapper', careerGoalsList);

                // Learning Outcomes
                learningOutcomesList = Array.isArray(course.learning_outcomes) && course.learning_outcomes.length > 0 
                    ? [...course.learning_outcomes] 
                    : ["Master course fundamentals and core patterns."];
                renderLearningOutcomes();

                // Modules
                if (course.modules && Array.isArray(course.modules) && course.modules.length > 0) {
                    currentModules = course.modules.map(m => ({
                        ...m,
                        is_expanded: m.is_expanded !== undefined ? m.is_expanded : true,
                        lessons: (m.lessons || []).map(l => ({
                            ...l,
                            is_preview: !!(l.is_preview || l.preview_enabled),
                            preview_enabled: !!(l.is_preview || l.preview_enabled),
                            is_expanded: l.is_expanded !== undefined ? l.is_expanded : false,
                            materials: l.materials || []
                        }))
                    }));
                }
                renderModulesBuilder();

                // Demo Video
                if (course.demo_video_url) {
                    uploadedDemoVideoUrl = course.demo_video_url;
                    document.getElementById('demoVideoUrl').value = course.demo_video_url;
                    updateDemoPreview();
                }

                // Pricing
                const isPaid = course.is_free === 0 || (course.price && Number(course.price) > 0);
                if (isPaid) {
                    selectPricingOption('paid');
                    document.getElementById('coursePrice').value = course.price || '';
                    document.getElementById('courseCurrency').value = course.currency || 'INR';
                } else {
                    selectPricingOption('free');
                }

                // Thumbnail
                if (course.thumbnail_url) {
                    uploadedThumbnailUrl = course.thumbnail_url;
                    document.getElementById('courseThumbnailUrl').value = course.thumbnail_url;
                    updateThumbnailPreview();
                }
            }
        } catch (err) {
            console.error("Failed to load course details:", err);
            if (alertBox) {
                alertBox.style.display = 'block';
                alertBox.style.background = '#FEF2F2';
                alertBox.style.color = '#991B1B';
                alertBox.style.border = '1px solid #FECACA';
                alertBox.textContent = `Error: ${err.message}`;
            }
        }
    }
}


// =========================================================================
// 3. TAG CHIP UI LOGIC
// =========================================================================

function initChipInput(inputId, wrapperId, dataArray, onChangeCallback) {
    const input = document.getElementById(inputId);
    if (!input) return;

    renderChipList(wrapperId, dataArray);

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const val = input.value.trim().replace(/^,+|,+$/g, '');
            if (val && !dataArray.includes(val)) {
                dataArray.push(val);
                input.value = '';
                renderChipList(wrapperId, dataArray);
                if (onChangeCallback) onChangeCallback();
            }
        } else if (e.key === 'Backspace' && input.value === '' && dataArray.length > 0) {
            dataArray.pop();
            renderChipList(wrapperId, dataArray);
            if (onChangeCallback) onChangeCallback();
        }
    });

    input.addEventListener('blur', () => {
        const val = input.value.trim().replace(/^,+|,+$/g, '');
        if (val && !dataArray.includes(val)) {
            dataArray.push(val);
            input.value = '';
            renderChipList(wrapperId, dataArray);
            if (onChangeCallback) onChangeCallback();
        }
    });
}

function renderChipList(wrapperId, dataArray) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;

    wrapper.innerHTML = dataArray.map((item, idx) => `
        <span class="chip-pill">
            <span>${escapeHtml(item)}</span>
            <button type="button" class="remove-chip-btn" onclick="removeChip('${wrapperId}', ${idx})" title="Remove">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </span>
    `).join('');
}

window.removeChip = function(wrapperId, idx) {
    let arr = null;
    if (wrapperId === 'skillsListWrapper') arr = skillsList;
    else if (wrapperId === 'rolesListWrapper') arr = targetRolesList;
    else if (wrapperId === 'goalsListWrapper') arr = careerGoalsList;

    if (arr && idx >= 0 && idx < arr.length) {
        arr.splice(idx, 1);
        renderChipList(wrapperId, arr);
    }
};


// =========================================================================
// 4. LEARNING OUTCOMES REPEATABLE MANAGER
// =========================================================================

function renderLearningOutcomes() {
    const container = document.getElementById('outcomesContainer');
    if (!container) return;

    if (learningOutcomesList.length === 0) {
        learningOutcomesList = [""];
    }

    container.innerHTML = learningOutcomesList.map((outcome, idx) => `
        <div class="outcome-row" id="outcomeRow_${idx}">
            <div class="outcome-index">${idx + 1}</div>
            <input type="text" value="${escapeHtml(outcome)}" onchange="updateOutcome(${idx}, this.value)" placeholder="e.g. Master modern asynchronous JavaScript & React state management..." class="custom-input" style="flex:1;">
            <button type="button" onclick="removeLearningOutcomeRow(${idx})" class="btn-outline-cancel" style="padding:0.65rem 0.8rem; color:#EF4444; border-color:#FCA5A5;" title="Remove Outcome">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </div>
    `).join('');
}

window.addLearningOutcomeRow = function(initialText = '') {
    learningOutcomesList.push(initialText);
    renderLearningOutcomes();
    const rows = document.querySelectorAll('#outcomesContainer input');
    if (rows.length > 0) {
        rows[rows.length - 1].focus();
    }
    document.getElementById('errOutcomes') && (document.getElementById('errOutcomes').style.display = 'none');
};

window.removeLearningOutcomeRow = function(idx) {
    if (learningOutcomesList.length <= 1) {
        learningOutcomesList = [""];
    } else {
        learningOutcomesList.splice(idx, 1);
    }
    renderLearningOutcomes();
};

window.updateOutcome = function(idx, val) {
    learningOutcomesList[idx] = val;
};


// =========================================================================
// 5. EXPANDABLE CURRICULUM, MODULES & MULTI-TYPE LESSON BUILDER
// =========================================================================

function renderModulesBuilder() {
    const container = document.getElementById('modulesContainer');
    if (!container) return;

    if (currentModules.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:3rem 1.5rem; background:#FAF8FF; border:1px dashed #C4B5FD; border-radius:12px;">
                <i class="fa-solid fa-layer-group" style="font-size:2.5rem; color:#A78BFA; margin-bottom:0.75rem;"></i>
                <h4 style="color:#0F172A; margin-bottom:0.3rem;">No Modules in Curriculum Yet</h4>
                <p style="font-size:13px; color:#64748B; margin-bottom:1.25rem;">Click "Add Module" to start structuring your lessons and materials.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = currentModules.map((m, mIdx) => {
        const isExpanded = m.is_expanded !== false;
        const lessonCount = (m.lessons || []).length;

        return `
            <div class="module-block" id="moduleCard_${mIdx}">
                <!-- Module Header -->
                <div class="module-header" onclick="toggleModuleExpand(${mIdx})">
                    <div style="display:flex; align-items:center; gap:0.75rem; flex:1;">
                        <span style="font-size:13px; font-weight:800; color:#6D28D9; background:#EDE9FE; padding:4px 10px; border-radius:6px;">MODULE ${mIdx + 1}</span>
                        <span style="font-weight:700; font-size:14.5px; color:#0F172A;">${escapeHtml(m.title || 'Untitled Module')}</span>
                    </div>

                    <div style="display:flex; align-items:center; gap:0.75rem;" onclick="event.stopPropagation()">
                        <span style="font-size:12px; color:#64748B; background:#FFFFFF; border:1px solid #E2E8F0; padding:3px 8px; border-radius:6px;">
                            <i class="fa-solid fa-clock mr-1"></i> ${escapeHtml(m.duration || '4 hours')}
                        </span>
                        <span style="font-size:12px; color:#64748B; background:#FFFFFF; border:1px solid #E2E8F0; padding:3px 8px; border-radius:6px;">
                            <i class="fa-solid fa-book-open mr-1"></i> ${lessonCount} ${lessonCount === 1 ? 'Lesson' : 'Lessons'}
                        </span>
                        <button type="button" onclick="removeModule(${mIdx})" class="btn-outline-cancel" style="padding:0.35rem 0.65rem; font-size:12px; color:#EF4444; border-color:#FCA5A5;" title="Delete Module">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                        <button type="button" onclick="toggleModuleExpand(${mIdx})" style="background:none; border:none; color:#64748B; font-size:14px; cursor:pointer; padding:0.2rem;" title="Expand/Collapse">
                            <i class="fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                        </button>
                    </div>
                </div>

                <!-- Module Content Body -->
                <div class="module-body" style="display:${isExpanded ? 'block' : 'none'};">
                    <div class="grid-2col" style="display:grid; grid-template-columns: 2fr 1fr; gap:1rem; margin-bottom:1rem;">
                        <div>
                            <label class="form-label-custom">Module Title <span class="req">*</span></label>
                            <input type="text" value="${escapeHtml(m.title)}" onchange="updateModuleField(${mIdx}, 'title', this.value)" placeholder="e.g. Module 1: Foundations & Architecture" class="custom-input">
                        </div>
                        <div>
                            <label class="form-label-custom">Estimated Duration</label>
                            <input type="text" value="${escapeHtml(m.duration || '6 hours')}" onchange="updateModuleField(${mIdx}, 'duration', this.value)" placeholder="e.g. 6 hours" class="custom-input">
                        </div>
                    </div>

                    <div style="margin-bottom:1.25rem;">
                        <label class="form-label-custom">Module Description / Overview</label>
                        <textarea rows="2" onchange="updateModuleField(${mIdx}, 'description', this.value)" placeholder="Summary of what this module covers and why it is important..." class="custom-textarea">${escapeHtml(m.description || '')}</textarea>
                    </div>

                    <!-- Lessons in Module -->
                    <div style="background:#FAF8FF; border:1px solid #EDE9FE; border-radius:10px; padding:1.25rem; margin-bottom:1rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                            <div style="display:flex; align-items:center; gap:0.5rem;">
                                <strong style="font-size:13.5px; color:#0F172A;"><i class="fa-solid fa-list-check mr-1" style="color:#7C3AED;"></i> Lessons in this Module</strong>
                                <span style="font-size:11.5px; color:#64748B;">(${lessonCount} total)</span>
                            </div>
                            <button type="button" onclick="addLessonToModule(${mIdx})" class="btn-action-draft" style="font-size:12px; padding:0.4rem 0.85rem;">
                                <i class="fa-solid fa-plus"></i> Add Lesson
                            </button>
                        </div>

                        <div id="moduleLessonsList_${mIdx}" style="display:flex; flex-direction:column; gap:0.75rem;">
                            ${renderLessonsList(m, mIdx)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderLessonsList(module, mIdx) {
    if (!module.lessons || module.lessons.length === 0) {
        return `
            <div style="text-align:center; padding:1.5rem; background:#FFFFFF; border:1px dashed #CBD5E1; border-radius:8px; color:#64748B; font-size:13px;">
                No lessons in this module. Click "+ Add Lesson" above.
            </div>
        `;
    }

    return module.lessons.map((l, lIdx) => {
        const isExpanded = l.is_expanded !== false;
        const isPreview = !!(l.is_preview || l.preview_enabled);
        const lessonType = (l.type || 'video').toLowerCase();

        return `
            <div class="lesson-card" id="lessonCard_${mIdx}_${lIdx}">
                <!-- Lesson Header -->
                <div class="lesson-header" onclick="toggleLessonExpand(${mIdx}, ${lIdx})">
                    <div style="display:flex; align-items:center; gap:0.6rem; flex:1;">
                        <span style="font-size:12px; font-weight:700; color:#475569;">${mIdx + 1}.${lIdx + 1}</span>
                        <span class="type-badge ${lessonType}">${escapeHtml(lessonType)}</span>
                        <strong style="font-size:13.5px; color:#1E293B;">${escapeHtml(l.title || 'Untitled Lesson')}</strong>
                    </div>

                    <div style="display:flex; align-items:center; gap:0.6rem;" onclick="event.stopPropagation()">
                        <span style="font-size:11.5px; color:#64748B;"><i class="fa-solid fa-clock mr-1"></i> ${escapeHtml(l.duration || '30 mins')}</span>
                        
                        <!-- Free Preview Toggle -->
                        <div class="preview-badge-toggle ${isPreview ? 'is-active' : 'is-inactive'}" onclick="toggleLessonPreview(${mIdx}, ${lIdx})" title="Toggle Free Sample Preview">
                            <i class="fa-solid ${isPreview ? 'fa-unlock' : 'fa-lock'}"></i>
                            <span>${isPreview ? 'Free Preview' : 'Enrolled Only'}</span>
                        </div>

                        <button type="button" onclick="removeLessonFromModule(${mIdx}, ${lIdx})" style="background:none; border:none; color:#EF4444; font-size:13px; cursor:pointer; padding:0.25rem;" title="Delete Lesson">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                        <button type="button" onclick="toggleLessonExpand(${mIdx}, ${lIdx})" style="background:none; border:none; color:#64748B; font-size:13px; cursor:pointer; padding:0.25rem;">
                            <i class="fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                        </button>
                    </div>
                </div>

                <!-- Lesson Body Details (Expandable) -->
                <div class="lesson-body" style="display:${isExpanded ? 'block' : 'none'};">
                    <div class="grid-3col" style="display:grid; grid-template-columns: 2fr 1fr 1fr; gap:1rem; margin-bottom:1rem;">
                        <div>
                            <label class="form-label-custom">Lesson Title <span class="req">*</span></label>
                            <input type="text" value="${escapeHtml(l.title)}" onchange="updateLessonField(${mIdx}, ${lIdx}, 'title', this.value)" placeholder="e.g. Introduction to Asynchronous Architecture" class="custom-input">
                        </div>
                        <div>
                            <label class="form-label-custom">Lesson Type</label>
                            <select onchange="updateLessonField(${mIdx}, ${lIdx}, 'type', this.value)" class="custom-select">
                                <option value="video" ${lessonType === 'video' ? 'selected' : ''}>Video</option>
                                <option value="article" ${lessonType === 'article' || lessonType === 'text' ? 'selected' : ''}>Article / Text</option>
                                <option value="pdf" ${lessonType === 'pdf' || lessonType === 'document' ? 'selected' : ''}>PDF / Document</option>
                                <option value="hands-on" ${lessonType === 'hands-on' || lessonType === 'lab' ? 'selected' : ''}>Hands-on Lab</option>
                                <option value="project" ${lessonType === 'project' ? 'selected' : ''}>Project</option>
                                <option value="quiz" ${lessonType === 'quiz' ? 'selected' : ''}>Quiz</option>
                                <option value="assignment" ${lessonType === 'assignment' ? 'selected' : ''}>Assignment</option>
                                <option value="capstone" ${lessonType === 'capstone' ? 'selected' : ''}>Capstone</option>
                                <option value="external" ${lessonType === 'external' ? 'selected' : ''}>External Resource</option>
                            </select>
                        </div>
                        <div>
                            <label class="form-label-custom">Duration</label>
                            <input type="text" value="${escapeHtml(l.duration || '30 mins')}" onchange="updateLessonField(${mIdx}, ${lIdx}, 'duration', this.value)" placeholder="e.g. 45 mins" class="custom-input">
                        </div>
                    </div>

                    <div style="margin-bottom:1rem;">
                        <label class="form-label-custom">Short Summary / Objectives</label>
                        <input type="text" value="${escapeHtml(l.short_description || '')}" onchange="updateLessonField(${mIdx}, ${lIdx}, 'short_description', this.value)" placeholder="Key takeaway or brief lesson description..." class="custom-input">
                    </div>

                    <!-- Type-Specific Dynamic Fields -->
                    ${renderTypeSpecificLessonFields(l, mIdx, lIdx)}

                    <!-- Lesson Materials Manager -->
                    <div style="margin-top:1.25rem; padding-top:1rem; border-top:1px dashed #E2E8F0;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem;">
                            <label class="form-label-custom" style="margin:0;"><i class="fa-solid fa-paperclip mr-1" style="color:#7C3AED;"></i> Lesson Materials / Attachments</label>
                            <button type="button" onclick="addLessonMaterial(${mIdx}, ${lIdx})" style="background:none; border:none; color:#7C3AED; font-size:12px; font-weight:600; cursor:pointer;">
                                <i class="fa-solid fa-plus mr-1"></i> Add Material
                            </button>
                        </div>
                        <div id="lessonMaterials_${mIdx}_${lIdx}">
                            ${(l.materials || []).map((mat, matIdx) => `
                                <div style="display:flex; gap:0.5rem; align-items:center; margin-bottom:0.4rem;">
                                    <input type="text" value="${escapeHtml(mat.title || '')}" onchange="updateLessonMaterial(${mIdx}, ${lIdx}, ${matIdx}, 'title', this.value)" placeholder="Material Title (e.g. Slides PDF)" class="custom-input" style="flex:1; padding:0.4rem 0.6rem; font-size:12.5px;">
                                    <select onchange="updateLessonMaterial(${mIdx}, ${lIdx}, ${matIdx}, 'type', this.value)" class="custom-select" style="width:110px; padding:0.4rem 0.6rem; font-size:12px;">
                                        <option value="PDF" ${mat.type === 'PDF' ? 'selected' : ''}>PDF</option>
                                        <option value="ZIP" ${mat.type === 'ZIP' ? 'selected' : ''}>ZIP</option>
                                        <option value="Code" ${mat.type === 'Code' ? 'selected' : ''}>Code File</option>
                                        <option value="GitHub" ${mat.type === 'GitHub' ? 'selected' : ''}>GitHub</option>
                                        <option value="URL" ${mat.type === 'URL' ? 'selected' : ''}>Link</option>
                                    </select>
                                    <input type="text" value="${escapeHtml(mat.url || '')}" onchange="updateLessonMaterial(${mIdx}, ${lIdx}, ${matIdx}, 'url', this.value)" placeholder="URL / Path" class="custom-input" style="flex:1.5; padding:0.4rem 0.6rem; font-size:12.5px;">
                                    <button type="button" onclick="removeLessonMaterial(${mIdx}, ${lIdx}, ${matIdx})" style="border:none; background:none; color:#EF4444; cursor:pointer;" title="Delete Material"><i class="fa-solid fa-trash"></i></button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderTypeSpecificLessonFields(lesson, mIdx, lIdx) {
    const type = (lesson.type || 'video').toLowerCase();

    if (type === 'video') {
        return `
            <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:1rem; margin-bottom:1rem;">
                <div class="grid-2col" style="display:grid; grid-template-columns: 1.5fr 1fr; gap:1rem; align-items:start;">
                    <div>
                        <label class="form-label-custom">Video URL (YouTube, Vimeo, MP4)</label>
                        <input type="url" value="${escapeHtml(lesson.video_url || '')}" onchange="updateLessonField(${mIdx}, ${lIdx}, 'video_url', this.value)" placeholder="https://www.youtube.com/watch?v=... or MP4 URL" class="custom-input">
                        <span class="input-helper-text">Direct streaming URL or video embed link.</span>
                    </div>
                    <div>
                        <label class="form-label-custom">Or Upload Video File</label>
                        <div style="display:flex; gap:0.4rem;">
                            <input type="file" id="lessonVideoFile_${mIdx}_${lIdx}" accept="video/mp4,video/webm" class="custom-input" style="padding:0.4rem; font-size:11.5px;">
                            <button type="button" onclick="handleUploadLessonVideo(${mIdx}, ${lIdx})" class="btn-action-draft" style="padding:0.4rem 0.8rem; font-size:12px; white-space:nowrap;">
                                <i class="fa-solid fa-upload"></i>
                            </button>
                        </div>
                        <span id="lessonUploadStatus_${mIdx}_${lIdx}" style="font-size:11px; color:#64748B; margin-top:0.2rem; display:block;">Max 150MB</span>
                    </div>
                </div>

                <div style="margin-top:0.75rem;">
                    <label class="form-label-custom">Lesson Content / Transcript Notes</label>
                    <textarea rows="3" onchange="updateLessonField(${mIdx}, ${lIdx}, 'content', this.value)" placeholder="Accompanying explanation, lecture timestamps, and code references..." class="custom-textarea">${escapeHtml(lesson.content || '')}</textarea>
                </div>
            </div>
        `;
    }

    if (type === 'article' || type === 'text') {
        return `
            <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:1rem; margin-bottom:1rem;">
                <label class="form-label-custom">Article / Tutorial Text Content</label>
                <textarea rows="6" onchange="updateLessonField(${mIdx}, ${lIdx}, 'content', this.value)" placeholder="Rich markdown or structured text content for students to read..." class="custom-textarea">${escapeHtml(lesson.content || '')}</textarea>
            </div>
        `;
    }

    if (type === 'pdf' || type === 'document') {
        return `
            <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:1rem; margin-bottom:1rem;">
                <label class="form-label-custom">Document Link / PDF File URL</label>
                <input type="url" value="${escapeHtml(lesson.content || '')}" onchange="updateLessonField(${mIdx}, ${lIdx}, 'content', this.value)" placeholder="https://... PDF URL" class="custom-input">
                <span class="input-helper-text">Students will be able to view and download this document.</span>
            </div>
        `;
    }

    if (type === 'hands-on' || type === 'lab') {
        return `
            <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:1rem; margin-bottom:1rem;">
                <label class="form-label-custom">Lab Instructions & Setup Guide</label>
                <textarea rows="4" onchange="updateLessonField(${mIdx}, ${lIdx}, 'content', this.value)" placeholder="Step-by-step instructions, sandbox environment links, and expected outputs..." class="custom-textarea">${escapeHtml(lesson.content || '')}</textarea>
            </div>
        `;
    }

    if (type === 'project' || type === 'capstone') {
        return `
            <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:1rem; margin-bottom:1rem;">
                <label class="form-label-custom">Project Brief, Deliverables & Submission Criteria</label>
                <textarea rows="4" onchange="updateLessonField(${mIdx}, ${lIdx}, 'content', this.value)" placeholder="Detailed project specifications, starter repository link, and grading rubric..." class="custom-textarea">${escapeHtml(lesson.content || '')}</textarea>
            </div>
        `;
    }

    if (type === 'quiz') {
        const quiz = lesson.quiz || { passing_score: 70, questions: [] };
        return `
            <div style="background:#FFFDF7; border:1px solid #FDE68A; border-radius:8px; padding:1.25rem; margin-bottom:1rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                    <div>
                        <strong style="color:#B45309; font-size:14px;"><i class="fa-solid fa-clipboard-question mr-1"></i> Interactive Lesson Quiz</strong>
                        <div style="font-size:12px; color:#78350F;">Add multiple choice assessment questions for this lesson.</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <label style="font-size:12px; font-weight:600; color:#B45309;">Passing Score:</label>
                        <input type="number" min="10" max="100" value="${quiz.passing_score || 70}" onchange="updateQuizPassingScore(${mIdx}, ${lIdx}, this.value)" class="custom-input" style="width:70px; padding:0.3rem 0.5rem; font-size:12px;">
                        <span style="font-size:12px; font-weight:700;">%</span>
                    </div>
                </div>

                <div id="quizQuestions_${mIdx}_${lIdx}">
                    ${(quiz.questions || []).map((q, qIdx) => `
                        <div style="background:#FFFFFF; border:1px solid #FCD34D; border-radius:8px; padding:0.9rem; margin-bottom:0.75rem;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
                                <strong style="font-size:12.5px; color:#1E293B;">Question ${qIdx + 1}</strong>
                                <button type="button" onclick="removeQuizQuestion(${mIdx}, ${lIdx}, ${qIdx})" style="border:none; background:none; color:#EF4444; font-size:12px; cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
                            </div>
                            <input type="text" value="${escapeHtml(q.question_text || '')}" onchange="updateQuizQuestionText(${mIdx}, ${lIdx}, ${qIdx}, this.value)" placeholder="Enter question prompt..." class="custom-input" style="margin-bottom:0.5rem; font-size:13px;">
                            
                            <div style="font-size:11.5px; font-weight:600; color:#64748B; margin-bottom:0.3rem;">Answer Options (Select the correct radio):</div>
                            ${(q.options || ['A', 'B', 'C', 'D']).map((opt, optIdx) => `
                                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.3rem;">
                                    <input type="radio" name="quiz_correct_${mIdx}_${lIdx}_${qIdx}" ${q.correct_option === optIdx ? 'checked' : ''} onchange="updateQuizCorrectOption(${mIdx}, ${lIdx}, ${qIdx}, ${optIdx})" style="accent-color:#7C3AED; cursor:pointer;">
                                    <input type="text" value="${escapeHtml(opt)}" onchange="updateQuizOptionText(${mIdx}, ${lIdx}, ${qIdx}, ${optIdx}, this.value)" placeholder="Option ${optIdx + 1}" class="custom-input" style="padding:0.3rem 0.5rem; font-size:12.5px;">
                                </div>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>

                <button type="button" onclick="addQuizQuestion(${mIdx}, ${lIdx})" class="btn-action-draft" style="font-size:12px; padding:0.4rem 0.85rem; border-color:#FCD34D; background:#FFFBEB; color:#B45309;">
                    <i class="fa-solid fa-plus"></i> Add Question
                </button>
            </div>
        `;
    }

    if (type === 'external') {
        return `
            <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:1rem; margin-bottom:1rem;">
                <label class="form-label-custom">External Resource URL</label>
                <input type="url" value="${escapeHtml(lesson.content || '')}" onchange="updateLessonField(${mIdx}, ${lIdx}, 'content', this.value)" placeholder="https://..." class="custom-input">
            </div>
        `;
    }

    return `
        <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:1rem; margin-bottom:1rem;">
            <label class="form-label-custom">Lesson Content</label>
            <textarea rows="3" onchange="updateLessonField(${mIdx}, ${lIdx}, 'content', this.value)" class="custom-textarea">${escapeHtml(lesson.content || '')}</textarea>
        </div>
    `;
}

// Module & Lesson Mutation Handlers
window.toggleModuleExpand = function(mIdx) {
    if (currentModules[mIdx]) {
        currentModules[mIdx].is_expanded = !currentModules[mIdx].is_expanded;
        renderModulesBuilder();
    }
};

window.toggleLessonExpand = function(mIdx, lIdx) {
    if (currentModules[mIdx] && currentModules[mIdx].lessons && currentModules[mIdx].lessons[lIdx]) {
        currentModules[mIdx].lessons[lIdx].is_expanded = !currentModules[mIdx].lessons[lIdx].is_expanded;
        renderModulesBuilder();
    }
};

window.toggleLessonPreview = function(mIdx, lIdx) {
    if (currentModules[mIdx] && currentModules[mIdx].lessons && currentModules[mIdx].lessons[lIdx]) {
        const l = currentModules[mIdx].lessons[lIdx];
        const nextState = !l.is_preview;
        l.is_preview = nextState;
        l.preview_enabled = nextState;
        renderModulesBuilder();
    }
};

window.updateModuleField = function(mIdx, field, val) {
    if (currentModules[mIdx]) {
        currentModules[mIdx][field] = val;
    }
};

window.updateLessonField = function(mIdx, lIdx, field, val) {
    if (currentModules[mIdx] && currentModules[mIdx].lessons && currentModules[mIdx].lessons[lIdx]) {
        currentModules[mIdx].lessons[lIdx][field] = val;
        if (field === 'type') {
            renderModulesBuilder();
        }
    }
};

window.removeModule = function(mIdx) {
    if (confirm('Are you sure you want to delete this entire module?')) {
        currentModules.splice(mIdx, 1);
        renderModulesBuilder();
    }
};

window.addLessonToModule = function(mIdx) {
    if (!currentModules[mIdx].lessons) currentModules[mIdx].lessons = [];
    const nextLessonIdx = currentModules[mIdx].lessons.length + 1;
    currentModules[mIdx].lessons.push({
        lesson_id: nextLessonIdx,
        title: `Lesson ${nextLessonIdx}: Practical Concept Application`,
        type: "video",
        duration: "30 mins",
        short_description: "",
        content: "",
        video_url: "",
        is_preview: false,
        preview_enabled: false,
        is_expanded: true,
        materials: []
    });
    renderModulesBuilder();
};

window.removeLessonFromModule = function(mIdx, lIdx) {
    if (confirm('Delete this lesson?')) {
        currentModules[mIdx].lessons.splice(lIdx, 1);
        renderModulesBuilder();
    }
};

// Lesson Materials helpers
window.addLessonMaterial = function(mIdx, lIdx) {
    if (!currentModules[mIdx].lessons[lIdx].materials) {
        currentModules[mIdx].lessons[lIdx].materials = [];
    }
    currentModules[mIdx].lessons[lIdx].materials.push({
        title: "Lecture Notes & Starter Files",
        type: "PDF",
        url: ""
    });
    renderModulesBuilder();
};

window.updateLessonMaterial = function(mIdx, lIdx, matIdx, field, val) {
    if (currentModules[mIdx]?.lessons[lIdx]?.materials[matIdx]) {
        currentModules[mIdx].lessons[lIdx].materials[matIdx][field] = val;
    }
};

window.removeLessonMaterial = function(mIdx, lIdx, matIdx) {
    if (currentModules[mIdx]?.lessons[lIdx]?.materials) {
        currentModules[mIdx].lessons[lIdx].materials.splice(matIdx, 1);
        renderModulesBuilder();
    }
};

// Quiz Builder helpers
window.addQuizQuestion = function(mIdx, lIdx) {
    const l = currentModules[mIdx]?.lessons[lIdx];
    if (!l) return;
    if (!l.quiz) l.quiz = { passing_score: 70, questions: [] };
    if (!l.quiz.questions) l.quiz.questions = [];

    const qNum = l.quiz.questions.length + 1;
    l.quiz.questions.push({
        question_id: qNum,
        question_text: `Question ${qNum}: Which pattern is best suited for this implementation?`,
        options: ["Option A", "Option B", "Option C", "Option D"],
        correct_option: 0,
        explanation: "Correct answer based on the concepts covered in this lesson."
    });
    renderModulesBuilder();
};

window.removeQuizQuestion = function(mIdx, lIdx, qIdx) {
    const l = currentModules[mIdx]?.lessons[lIdx];
    if (l?.quiz?.questions) {
        l.quiz.questions.splice(qIdx, 1);
        renderModulesBuilder();
    }
};

window.updateQuizPassingScore = function(mIdx, lIdx, val) {
    const l = currentModules[mIdx]?.lessons[lIdx];
    if (l) {
        if (!l.quiz) l.quiz = { passing_score: 70, questions: [] };
        l.quiz.passing_score = parseInt(val) || 70;
    }
};

window.updateQuizQuestionText = function(mIdx, lIdx, qIdx, val) {
    const q = currentModules[mIdx]?.lessons[lIdx]?.quiz?.questions[qIdx];
    if (q) q.question_text = val;
};

window.updateQuizOptionText = function(mIdx, lIdx, qIdx, optIdx, val) {
    const q = currentModules[mIdx]?.lessons[lIdx]?.quiz?.questions[qIdx];
    if (q && q.options) q.options[optIdx] = val;
};

window.updateQuizCorrectOption = function(mIdx, lIdx, qIdx, optIdx) {
    const q = currentModules[mIdx]?.lessons[lIdx]?.quiz?.questions[qIdx];
    if (q) q.correct_option = optIdx;
};

// Video Upload Handlers
window.handleUploadLessonVideo = async function(mIdx, lIdx) {
    const fileInput = document.getElementById(`lessonVideoFile_${mIdx}_${lIdx}`);
    const statusEl = document.getElementById(`lessonUploadStatus_${mIdx}_${lIdx}`);
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert('Please choose a video file first.');
        return;
    }

    const file = fileInput.files[0];
    if (statusEl) {
        statusEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Uploading ${escapeHtml(file.name)}...`;
        statusEl.style.color = '#7C3AED';
    }

    try {
        const res = await window.api.uploadCourseVideo(file);
        if (res && res.video_url) {
            updateLessonField(mIdx, lIdx, 'video_url', res.video_url);
            if (statusEl) {
                statusEl.textContent = `✓ Uploaded: ${res.filename || 'video file'}`;
                statusEl.style.color = '#10B981';
            }
            renderModulesBuilder();
        }
    } catch (err) {
        if (statusEl) {
            statusEl.textContent = `Error: ${err.message}`;
            statusEl.style.color = '#EF4444';
        }
    }
};


// =========================================================================
// 6. DEMO VIDEO & MEDIA LOGIC
// =========================================================================

window.toggleDemoVideoSource = function(srcType) {
    const urlGroup = document.getElementById('demoUrlGroup');
    const uploadGroup = document.getElementById('demoUploadGroup');
    if (srcType === 'url') {
        urlGroup.style.display = 'block';
        uploadGroup.style.display = 'none';
    } else {
        urlGroup.style.display = 'none';
        uploadGroup.style.display = 'block';
    }
};

window.handleUploadDemoVideo = async function() {
    const fileInput = document.getElementById('demoVideoFile');
    const statusEl = document.getElementById('demoUploadStatus');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert('Please select a video file to upload.');
        return;
    }

    const file = fileInput.files[0];
    if (statusEl) {
        statusEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Uploading ${escapeHtml(file.name)}...`;
        statusEl.style.color = '#7C3AED';
    }

    try {
        const res = await window.api.uploadCourseVideo(file);
        if (res && res.video_url) {
            uploadedDemoVideoUrl = res.video_url;
            document.getElementById('demoVideoUrl').value = res.video_url;
            if (statusEl) {
                statusEl.textContent = `✓ Uploaded: ${res.filename || 'demo video'}`;
                statusEl.style.color = '#10B981';
            }
            updateDemoPreview();
        }
    } catch (err) {
        if (statusEl) {
            statusEl.textContent = `Upload failed: ${err.message}`;
            statusEl.style.color = '#EF4444';
        }
    }
};

window.updateDemoPreview = function() {
    const url = document.getElementById('demoVideoUrl').value.trim() || uploadedDemoVideoUrl;
    const previewBox = document.getElementById('demoVideoPreviewBox');
    if (!previewBox) return;

    if (!url) {
        previewBox.innerHTML = `
            <div>
                <i class="fa-solid fa-circle-play" style="font-size:2.5rem; opacity:0.5; margin-bottom:0.5rem;"></i>
                <div style="font-size:12.5px;">Enter video URL to test player</div>
            </div>
        `;
        return;
    }

    if (url.includes('youtube.com/watch') || url.includes('youtu.be')) {
        let vidId = '';
        if (url.includes('v=')) vidId = url.split('v=')[1]?.split('&')[0];
        else if (url.includes('youtu.be/')) vidId = url.split('youtu.be/')[1]?.split('?')[0];

        previewBox.innerHTML = `
            <iframe src="https://www.youtube.com/embed/${vidId}" style="width:100%; height:100%; border:none;" allowfullscreen></iframe>
        `;
    } else {
        const fullUrl = url.startsWith('/uploads/') ? `${window.api.API_URL}${url}` : url;
        previewBox.innerHTML = `
            <video controls style="width:100%; height:100%; object-fit:contain;" src="${fullUrl}">
                Your browser does not support the video tag.
            </video>
        `;
    }
};


// =========================================================================
// 7. COURSE ACCESS & PRICING
// =========================================================================

window.selectPricingOption = function(mode) {
    selectedPricingMode = mode;
    const freeCard = document.getElementById('optFreeCard');
    const paidCard = document.getElementById('optPaidCard');
    const paidFields = document.getElementById('paidPricingFields');
    const freeRadio = document.querySelector('input[name="courseAccessType"][value="free"]');
    const paidRadio = document.querySelector('input[name="courseAccessType"][value="paid"]');

    if (mode === 'free') {
        freeCard?.classList.add('selected');
        paidCard?.classList.remove('selected');
        if (freeRadio) freeRadio.checked = true;
        if (paidFields) paidFields.style.display = 'none';
    } else {
        paidCard?.classList.add('selected');
        freeCard?.classList.remove('selected');
        if (paidRadio) paidRadio.checked = true;
        if (paidFields) paidFields.style.display = 'block';
    }
};


// =========================================================================
// 8. COURSE THUMBNAIL MANAGER
// =========================================================================

window.handleUploadThumbnail = async function() {
    const fileInput = document.getElementById('thumbnailFileInput');
    const statusEl = document.getElementById('thumbUploadStatus');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert('Please choose an image file.');
        return;
    }

    const file = fileInput.files[0];
    if (statusEl) {
        statusEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Uploading image...`;
        statusEl.style.color = '#7C3AED';
    }

    try {
        const res = await window.api.uploadCourseThumbnail(file);
        if (res && res.thumbnail_url) {
            uploadedThumbnailUrl = res.thumbnail_url;
            document.getElementById('courseThumbnailUrl').value = res.thumbnail_url;
            if (statusEl) {
                statusEl.textContent = `✓ Image uploaded successfully`;
                statusEl.style.color = '#10B981';
            }
            updateThumbnailPreview();
        }
    } catch (err) {
        if (statusEl) {
            statusEl.textContent = `Upload failed: ${err.message}`;
            statusEl.style.color = '#EF4444';
        }
    }
};

window.updateThumbnailPreview = function() {
    const url = document.getElementById('courseThumbnailUrl').value.trim() || uploadedThumbnailUrl;
    const imgEl = document.getElementById('thumbImgDisplay');
    const placeholder = document.getElementById('thumbPlaceholder');

    if (!imgEl || !placeholder) return;

    if (url) {
        const fullUrl = url.startsWith('/uploads/') ? `${window.api.API_URL}${url}` : url;
        imgEl.src = fullUrl;
        imgEl.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        imgEl.style.display = 'none';
        placeholder.style.display = 'block';
    }
};


// =========================================================================
// 9. COURSE-LEVEL RESOURCES MANAGER
// =========================================================================

window.addCourseResourceRow = function() {
    courseResourcesList.push({
        title: "Course Starter Code Repository",
        type: "GitHub",
        url: "https://github.com/...",
        description: "Official starter code and assets for following along."
    });
    renderCourseResources();
};

function renderCourseResources() {
    const container = document.getElementById('courseResourcesContainer');
    if (!container) return;

    if (courseResourcesList.length === 0) {
        container.innerHTML = `<div style="color:#64748B; font-size:12.5px;">No downloadable attachments added yet.</div>`;
        return;
    }

    container.innerHTML = courseResourcesList.map((res, idx) => `
        <div style="display:flex; gap:0.6rem; align-items:center; background:#FAF8FF; border:1px solid #EDE9FE; border-radius:8px; padding:0.6rem 0.85rem;">
            <input type="text" value="${escapeHtml(res.title)}" onchange="updateCourseResource(${idx}, 'title', this.value)" placeholder="Resource Title" class="custom-input" style="flex:1; padding:0.4rem 0.6rem; font-size:12.5px;">
            <select onchange="updateCourseResource(${idx}, 'type', this.value)" class="custom-select" style="width:120px; padding:0.4rem 0.6rem; font-size:12px;">
                <option value="GitHub" ${res.type === 'GitHub' ? 'selected' : ''}>GitHub Repo</option>
                <option value="PDF" ${res.type === 'PDF' ? 'selected' : ''}>PDF Document</option>
                <option value="ZIP" ${res.type === 'ZIP' ? 'selected' : ''}>ZIP Archive</option>
                <option value="Code" ${res.type === 'Code' ? 'selected' : ''}>Source Code</option>
                <option value="Presentation" ${res.type === 'Presentation' ? 'selected' : ''}>Presentation</option>
                <option value="Other" ${res.type === 'Other' ? 'selected' : ''}>Other Link</option>
            </select>
            <input type="text" value="${escapeHtml(res.url)}" onchange="updateCourseResource(${idx}, 'url', this.value)" placeholder="URL / Download Link" class="custom-input" style="flex:1.5; padding:0.4rem 0.6rem; font-size:12.5px;">
            <button type="button" onclick="removeCourseResource(${idx})" style="border:none; background:none; color:#EF4444; cursor:pointer;" title="Delete Resource"><i class="fa-solid fa-trash"></i></button>
        </div>
    `).join('');
}

window.updateCourseResource = function(idx, field, val) {
    if (courseResourcesList[idx]) courseResourcesList[idx][field] = val;
};

window.removeCourseResource = function(idx) {
    courseResourcesList.splice(idx, 1);
    renderCourseResources();
};


// =========================================================================
// 10. VALIDATION & PERSISTENCE (SAVE DRAFT VS PUBLISH)
// =========================================================================

function validateCourseStudio(isDraft = false) {
    // Clear existing error states
    document.querySelectorAll('.error-msg').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));

    const title = document.getElementById('courseTitle')?.value.trim();
    const category = document.getElementById('courseCategory')?.value;
    const description = document.getElementById('courseDescription')?.value.trim();
    const price = parseFloat(document.getElementById('coursePrice')?.value) || 0;

    let isValid = true;
    let firstErrorElement = null;

    // 1. Title
    if (!title) {
        document.getElementById('errCourseTitle').style.display = 'block';
        document.getElementById('courseTitle').classList.add('is-invalid');
        isValid = false;
        firstErrorElement = firstErrorElement || document.getElementById('courseTitle');
    }

    // If saving draft, only basic title & category are strictly required
    if (isDraft) {
        return { isValid, firstErrorElement };
    }

    // 2. Detailed Description
    if (!description) {
        document.getElementById('errCourseDesc').style.display = 'block';
        document.getElementById('courseDescription').classList.add('is-invalid');
        isValid = false;
        firstErrorElement = firstErrorElement || document.getElementById('courseDescription');
    }

    // 3. Skills Taught
    if (skillsList.length === 0) {
        document.getElementById('errSkills').style.display = 'block';
        isValid = false;
        firstErrorElement = firstErrorElement || document.getElementById('skillsChipContainer');
    }

    // 4. Learning Outcomes
    const validOutcomes = learningOutcomesList.filter(o => o.trim().length > 0);
    if (validOutcomes.length === 0) {
        document.getElementById('errOutcomes').style.display = 'block';
        isValid = false;
        firstErrorElement = firstErrorElement || document.getElementById('secLearning');
    }

    // 5. Curriculum Modules & Lessons
    if (currentModules.length === 0) {
        document.getElementById('errCurriculum').style.display = 'block';
        isValid = false;
        firstErrorElement = firstErrorElement || document.getElementById('secCurriculum');
    } else {
        const hasLessons = currentModules.some(m => m.lessons && m.lessons.length > 0);
        if (!hasLessons) {
            document.getElementById('errCurriculum').style.display = 'block';
            isValid = false;
            firstErrorElement = firstErrorElement || document.getElementById('secCurriculum');
        }
    }

    // 6. Paid Course Price Validation
    if (selectedPricingMode === 'paid' && (isNaN(price) || price <= 0)) {
        document.getElementById('errCoursePrice').style.display = 'block';
        document.getElementById('coursePrice').classList.add('is-invalid');
        isValid = false;
        firstErrorElement = firstErrorElement || document.getElementById('coursePrice');
    }

    return { isValid, firstErrorElement };
}

window.handleSaveCourse = async function(isDraft = false) {
    const alertBox = document.getElementById('editorAlert');
    const saveDraftBtn = document.getElementById('saveDraftBtn');
    const publishBtn = document.getElementById('publishCourseBtn');
    const courseId = document.getElementById('editingCourseId')?.value;
    const user = window.api.getCurrentUser();

    const { isValid, firstErrorElement } = validateCourseStudio(isDraft);

    if (!isValid) {
        if (alertBox) {
            alertBox.style.display = 'block';
            alertBox.style.background = '#FEF2F2';
            alertBox.style.color = '#991B1B';
            alertBox.style.border = '1px solid #FECACA';
            alertBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> Please complete the highlighted required fields before ${isDraft ? 'saving' : 'publishing'}.`;
        }
        if (firstErrorElement) {
            firstErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
    }

    const title = document.getElementById('courseTitle').value.trim();
    const category = document.getElementById('courseCategory').value;
    const level = document.getElementById('courseLevel').value;
    const duration = document.getElementById('courseDuration').value.trim() || '30 hours';
    const statusVal = isDraft ? 'draft' : document.getElementById('courseStatus').value;
    const language = document.getElementById('courseLanguage')?.value.trim() || 'English';
    const description = document.getElementById('courseDescription').value.trim() || (isDraft ? `${title} course syllabus.` : '');
    const short_description = document.getElementById('courseShortDesc').value.trim() || (description.slice(0, 120) + '...');

    const parseList = (val) => {
        if (!val) return [];
        return val.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    };

    const isFreeCourse = selectedPricingMode === 'free';
    const priceVal = isFreeCourse ? 0.0 : (parseFloat(document.getElementById('coursePrice')?.value) || 0.0);
    const currencyVal = document.getElementById('courseCurrency')?.value || 'INR';

    const demoUrl = document.getElementById('demoVideoUrl')?.value.trim() || uploadedDemoVideoUrl;
    const thumbUrl = document.getElementById('courseThumbnailUrl')?.value.trim() || uploadedThumbnailUrl;

    const payload = {
        title,
        category,
        subcategory: category,
        level,
        duration,
        language,
        status: statusVal,
        short_description,
        description,
        is_free: isFreeCourse ? 1 : 0,
        price: priceVal,
        currency: currencyVal,
        demo_video_url: demoUrl || "",
        thumbnail_url: thumbUrl || "",
        skills: skillsList.length > 0 ? skillsList : ["General"],
        prerequisites: parseList(document.getElementById('coursePrereqs')?.value),
        technical_requirements: parseList(document.getElementById('courseTechReqs')?.value),
        recommended_knowledge: parseList(document.getElementById('courseRecKnowledge')?.value),
        target_roles: targetRolesList.length > 0 ? targetRolesList : [category],
        career_goals: careerGoalsList.length > 0 ? careerGoalsList : targetRolesList,
        learning_outcomes: learningOutcomesList.filter(o => o.trim().length > 0),
        modules: currentModules,
        instructor_name: user?.full_name || user?.name || 'Instructor'
    };

    const activeBtn = isDraft ? saveDraftBtn : publishBtn;
    if (activeBtn) {
        activeBtn.disabled = true;
        activeBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Saving to Database...`;
    }

    try {
        let result;
        if (courseId) {
            result = await window.api.updateCourse(courseId, payload);
        } else {
            result = await window.api.createCourse(payload);
        }

        if (alertBox) {
            alertBox.style.display = 'block';
            alertBox.style.background = '#ECFDF5';
            alertBox.style.color = '#065F46';
            alertBox.style.border = '1px solid #A7F3D0';
            alertBox.innerHTML = `
                <i class="fa-solid fa-circle-check mr-1"></i> Course successfully saved ${isDraft ? 'as Draft' : 'and Published'}! Redirecting to My Courses...
            `;
        }

        setTimeout(() => {
            window.location.href = 'courses.html';
        }, 1200);

    } catch (err) {
        console.error("Save error:", err);
        if (alertBox) {
            alertBox.style.display = 'block';
            alertBox.style.background = '#FEF2F2';
            alertBox.style.color = '#991B1B';
            alertBox.style.border = '1px solid #FECACA';
            alertBox.textContent = err.message || 'Failed to save course. Please check all entries.';
        }
        if (activeBtn) {
            activeBtn.disabled = false;
            activeBtn.innerHTML = isDraft ? `<i class="fa-solid fa-floppy-disk"></i> Save Draft` : `<i class="fa-solid fa-circle-check"></i> Publish Course`;
        }
    }
};


// =========================================================================
// 11. STUDENT PREVIEW MODAL
// =========================================================================

window.openCoursePreviewModal = function() {
    const modal = document.getElementById('coursePreviewModal');
    const modalBody = document.getElementById('coursePreviewModalBody');
    if (!modal || !modalBody) return;

    const title = document.getElementById('courseTitle')?.value.trim() || 'Course Title';
    const category = document.getElementById('courseCategory')?.value || 'Web Development';
    const level = document.getElementById('courseLevel')?.value || 'Intermediate';
    const duration = document.getElementById('courseDuration')?.value.trim() || '30 hours';
    const desc = document.getElementById('courseDescription')?.value.trim() || 'Comprehensive course syllabus and deep curriculum objectives.';
    const shortDesc = document.getElementById('courseShortDesc')?.value.trim() || desc.slice(0, 140);
    const demoUrl = document.getElementById('demoVideoUrl')?.value.trim() || uploadedDemoVideoUrl;
    const thumbUrl = document.getElementById('courseThumbnailUrl')?.value.trim() || uploadedThumbnailUrl;

    const isFree = selectedPricingMode === 'free';
    const price = parseFloat(document.getElementById('coursePrice')?.value) || 0;
    const priceText = isFree ? 'FREE' : `₹${price.toLocaleString()} INR`;

    const skillsHtml = skillsList.map(s => `
        <span style="background:#EDE9FE; color:#5B21B6; font-size:12px; font-weight:600; padding:4px 10px; border-radius:6px; margin:3px 4px 3px 0; display:inline-block;">${escapeHtml(s)}</span>
    `).join('');

    const outcomesHtml = learningOutcomesList.filter(o => o.trim()).map(o => `
        <li style="margin-bottom:0.4rem; display:flex; align-items:flex-start; gap:0.5rem; font-size:13.5px; color:#334155;">
            <i class="fa-solid fa-circle-check" style="color:#10B981; margin-top:3px;"></i>
            <span>${escapeHtml(o)}</span>
        </li>
    `).join('');

    const modulesHtml = currentModules.map((m, mIdx) => `
        <div style="border:1px solid #EDE9FE; background:#F8F7FF; border-radius:10px; padding:1rem; margin-bottom:0.75rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                <strong style="font-size:14px; color:#0F172A;">Module ${mIdx + 1}: ${escapeHtml(m.title)}</strong>
                <span style="font-size:12px; color:#64748B; font-weight:600;">${escapeHtml(m.duration || '')} • ${(m.lessons || []).length} lessons</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:0.35rem;">
                ${(m.lessons || []).map((l, lIdx) => `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#FFFFFF; border:1px solid #F1F5F9; border-radius:6px; padding:0.4rem 0.65rem; font-size:12.5px;">
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <i class="fa-solid fa-circle-play" style="color:#7C3AED;"></i>
                            <span>${escapeHtml(l.title)}</span>
                        </div>
                        <div>
                            ${l.is_preview || l.preview_enabled ? `
                                <span style="background:#ECFDF5; color:#059669; font-weight:700; font-size:11px; padding:2px 6px; border-radius:4px;"><i class="fa-solid fa-unlock mr-1"></i> Free Sample</span>
                            ` : `
                                <span style="color:#94A3B8; font-size:11px;"><i class="fa-solid fa-lock mr-1"></i> Enrolled</span>
                            `}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');

    modalBody.innerHTML = `
        <div style="margin-bottom:1.5rem;">
            ${thumbUrl ? `
                <img src="${thumbUrl.startsWith('/uploads/') ? window.api.API_URL + thumbUrl : thumbUrl}" style="width:100%; max-height:220px; object-fit:cover; border-radius:12px; margin-bottom:1rem;" alt="Course Banner">
            ` : ''}

            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap;">
                <div>
                    <span style="background:#EDE9FE; color:#6D28D9; font-weight:700; font-size:11.5px; padding:3px 10px; border-radius:12px; text-transform:uppercase;">${escapeHtml(category)}</span>
                    <h2 style="font-size:1.5rem; color:#0F172A; margin:0.4rem 0;">${escapeHtml(title)}</h2>
                    <p style="font-size:14px; color:#64748B; margin:0 0 0.75rem 0;">${escapeHtml(shortDesc)}</p>
                </div>

                <div style="text-align:right;">
                    <div style="font-size:1.8rem; font-weight:800; color:${isFree ? '#059669' : '#7C3AED'};">${priceText}</div>
                    <span style="font-size:12px; color:#64748B;">Includes Full Lifetime Access</span>
                </div>
            </div>

            <div style="display:flex; gap:1.5rem; margin-top:0.75rem; padding-top:0.75rem; border-top:1px solid #E2E8F0; font-size:13px; color:#475569;">
                <span><i class="fa-solid fa-layer-group mr-1" style="color:#7C3AED;"></i> ${escapeHtml(level)}</span>
                <span><i class="fa-solid fa-clock mr-1" style="color:#7C3AED;"></i> ${escapeHtml(duration)}</span>
                <span><i class="fa-solid fa-certificate mr-1" style="color:#10B981;"></i> Certificate</span>
            </div>
        </div>

        ${demoUrl ? `
            <div style="margin-bottom:1.5rem; background:#0F172A; border-radius:10px; overflow:hidden;">
                <div style="padding:0.5rem 1rem; background:#1E293B; color:#F8FAFC; font-size:12.5px; font-weight:700;">
                    <i class="fa-solid fa-play mr-1" style="color:#10B981;"></i> Course Demo Preview
                </div>
                <video controls style="width:100%; max-height:280px;" src="${demoUrl.startsWith('/uploads/') ? window.api.API_URL + demoUrl : demoUrl}"></video>
            </div>
        ` : ''}

        <div style="margin-bottom:1.5rem;">
            <h4 style="font-size:15px; color:#0F172A; margin-bottom:0.5rem;">About This Course</h4>
            <p style="font-size:13.5px; color:#334155; line-height:1.6; white-space:pre-line;">${escapeHtml(desc)}</p>
        </div>

        ${outcomesHtml ? `
            <div style="margin-bottom:1.5rem;">
                <h4 style="font-size:15px; color:#0F172A; margin-bottom:0.6rem;">What You'll Learn</h4>
                <ul style="padding:0; list-style:none;">${outcomesHtml}</ul>
            </div>
        ` : ''}

        ${skillsHtml ? `
            <div style="margin-bottom:1.5rem;">
                <h4 style="font-size:15px; color:#0F172A; margin-bottom:0.5rem;">Skills Covered</h4>
                <div>${skillsHtml}</div>
            </div>
        ` : ''}

        <div>
            <h4 style="font-size:15px; color:#0F172A; margin-bottom:0.75rem;">Curriculum Breakdown</h4>
            <div>${modulesHtml || '<p style="color:#64748B;">No modules added yet.</p>'}</div>
        </div>
    `;

    modal.style.display = 'flex';
};

window.closeCoursePreviewModal = function() {
    const modal = document.getElementById('coursePreviewModal');
    if (modal) modal.style.display = 'none';
};

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// =========================================================================
// 5. STUDENTS / ENROLLMENTS PAGE FUNCTIONS
// =========================================================================

// =========================================================================
// 5. STUDENTS / ENROLLMENTS PAGE FUNCTIONS
// =========================================================================

let allInstructorStudents = [];

async function loadInstructorStudentsPage() {
    const tbody = document.getElementById('instructorStudentsTableBody');
    if (!tbody) return;

    const courseFilter = document.getElementById('courseFilterSelect');
    const searchInput = document.getElementById('studentsSearchInput');
    const statusFilter = document.getElementById('statusFilterSelect');
    const sortSelect = document.getElementById('studentsSortSelect');

    // 1. Populate course dropdown dynamically from instructor's authored courses
    try {
        if (courseFilter) {
            courseFilter.innerHTML = `<option value="all">Loading courses...</option>`;
            const courses = await window.api.getInstructorCourses();
            let optionsHtml = `<option value="all">All Courses</option>`;
            if (Array.isArray(courses)) {
                courses.forEach(c => {
                    optionsHtml += `<option value="${c.id}">${escapeHtml(c.title)}</option>`;
                });
            }
            courseFilter.innerHTML = optionsHtml;
        }
    } catch (err) {
        console.warn("Could not load instructor courses for filter dropdown:", err);
        if (courseFilter) {
            courseFilter.innerHTML = `<option value="all">All Courses</option>`;
        }
    }

    // Filter function for client-side search, status, and sort
    const applyFilters = () => {
        const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
        const statusVal = statusFilter ? statusFilter.value : 'all';
        const sortVal = sortSelect ? sortSelect.value : 'newest';

        let filtered = allInstructorStudents.filter(s => {
            const matchesSearch = !query || 
                (s.student_name && s.student_name.toLowerCase().includes(query)) ||
                (s.student_email && s.student_email.toLowerCase().includes(query)) ||
                (s.course_title && s.course_title.toLowerCase().includes(query));

            const matchesStatus = statusVal === 'all' || 
                (statusVal === 'completed' && (s.status === 'completed' || s.progress_percentage === 100)) ||
                (statusVal === 'in_progress' && s.progress_percentage > 0 && s.progress_percentage < 100) ||
                (statusVal === 'not_started' && (s.progress_percentage === 0 || !s.progress_percentage));

            return matchesSearch && matchesStatus;
        });

        if (sortVal === 'newest') {
            filtered.sort((a, b) => (b.enrollment_id || 0) - (a.enrollment_id || 0));
        } else if (sortVal === 'oldest') {
            filtered.sort((a, b) => (a.enrollment_id || 0) - (b.enrollment_id || 0));
        } else if (sortVal === 'progress_high') {
            filtered.sort((a, b) => (b.progress_percentage || 0) - (a.progress_percentage || 0));
        } else if (sortVal === 'progress_low') {
            filtered.sort((a, b) => (a.progress_percentage || 0) - (b.progress_percentage || 0));
        } else if (sortVal === 'name_asc') {
            filtered.sort((a, b) => (a.student_name || '').localeCompare(b.student_name || ''));
        }

        renderInstructorStudentsTable(filtered);
    };

    // 2. Fetch student enrollments for selected course scope
    const fetchAndRender = async (courseId = 'all') => {
        try {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 3rem 1rem; color: var(--secondary-text);">
                        <i class="fa-solid fa-spinner fa-spin mr-2" style="color: #5B3FE8; font-size: 1.25rem;"></i> Loading student enrollments...
                    </td>
                </tr>
            `;

            const data = await window.api.getInstructorStudents(courseId);
            if (!data) throw new Error("Could not load student enrollments");

            document.getElementById('instStatTotalStudents') && (document.getElementById('instStatTotalStudents').textContent = data.total_students || 0);
            document.getElementById('instStatActiveLearners') && (document.getElementById('instStatActiveLearners').textContent = data.active_learners || 0);
            document.getElementById('instStatCompletedStudents') && (document.getElementById('instStatCompletedStudents').textContent = data.completed_students || 0);
            document.getElementById('instStatAvgProgress') && (document.getElementById('instStatAvgProgress').textContent = `${data.avg_progress || 0}%`);

            allInstructorStudents = data.students || [];
            applyFilters();
        } catch (err) {
            console.error("Error loading instructor students:", err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:3rem 1rem; color:#EF4444;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size:1.5rem; margin-bottom:0.5rem; display:block;"></i>
                        Unable to load student enrollments. Please try again.
                    </td>
                </tr>
            `;
        }
    };

    // Initial load for all courses
    await fetchAndRender('all');

    // Bind event listeners
    if (courseFilter) {
        courseFilter.addEventListener('change', async () => {
            await fetchAndRender(courseFilter.value);
        });
    }

    searchInput && searchInput.addEventListener('input', applyFilters);
    statusFilter && statusFilter.addEventListener('change', applyFilters);
    sortSelect && sortSelect.addEventListener('change', applyFilters);
}

function renderInstructorStudentsTable(students) {
    const tbody = document.getElementById('instructorStudentsTableBody');
    if (!tbody) return;

    if (!students || students.length === 0) {
        const courseFilter = document.getElementById('courseFilterSelect');
        const searchInput = document.getElementById('studentsSearchInput');
        const isFiltered = (courseFilter && courseFilter.value !== 'all') || (searchInput && searchInput.value.trim() !== '');

        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:3.5rem 1rem; color:var(--secondary-text);">
                    <div style="font-size:2.2rem; margin-bottom:0.5rem;">🎓</div>
                    <div style="font-weight:700; font-size:16px; color:var(--dark-navy); margin-bottom:0.25rem;">
                        ${isFiltered ? 'No students found for this course.' : 'No students enrolled in your courses yet.'}
                    </div>
                    <div style="font-size:13.5px; color:#64748b;">
                        ${isFiltered ? 'Try selecting a different course or clearing your search filter.' : 'Learners who enroll in your courses will be listed here automatically.'}
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = students.map((s, idx) => {
        const isCompleted = s.status === 'completed' || s.progress_percentage === 100;
        const pct = s.progress_percentage || 0;

        let statusBadge = '';
        if (isCompleted) {
            statusBadge = `<span class="badge-status-published" style="background:#ECFDF5; color:#047857; font-weight:600; font-size:11.5px; padding:3px 10px; border-radius:12px;"><i class="fa-solid fa-circle-check mr-1"></i> Completed</span>`;
        } else if (pct > 0) {
            statusBadge = `<span style="background:#EFF6FF; color:#1D4ED8; font-weight:600; font-size:11.5px; padding:3px 10px; border-radius:12px;"><i class="fa-solid fa-spinner fa-spin mr-1"></i> In Progress</span>`;
        } else {
            statusBadge = `<span style="background:#F1F5F9; color:#64748B; font-weight:600; font-size:11.5px; padding:3px 10px; border-radius:12px;"><i class="fa-solid fa-clock mr-1"></i> Not Started</span>`;
        }

        const initials = (s.student_name || 'Student').split(' ').map(n => n.charAt(0)).join('').toUpperCase().substring(0, 2);

        return `
            <tr style="cursor:pointer;" onclick="openStudentDetailModal(${idx})">
                <td>
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        <div style="width:38px; height:38px; border-radius:50%; background:linear-gradient(135deg, #7C3AED, #A855F7); color:#FFFFFF; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13.5px; flex-shrink:0;">
                            ${initials}
                        </div>
                        <div>
                            <strong style="color:var(--dark-navy); font-size:14px; display:block;">${escapeHtml(s.student_name)}</strong>
                            <span style="font-size:12px; color:#64748b;">${escapeHtml(s.student_email)}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <strong style="font-size:13.5px; color:#1E293B; display:block;">${escapeHtml(s.course_title)}</strong>
                    <span class="badge-category" style="font-size:11px;">${escapeHtml(s.course_category || 'General')}</span>
                </td>
                <td>
                    <span style="font-size:13px; color:#475569;">${escapeHtml(s.enrolled_at || 'Recent')}</span>
                </td>
                <td>
                    <div style="min-width:130px;">
                        <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:600; margin-bottom:4px;">
                            <span style="color:#64748B;">${s.completed_lessons || 0}/${s.total_lessons || 24} lessons</span>
                            <span style="color:#7C3AED;">${pct}%</span>
                        </div>
                        <div style="height:6px; background:#E2E8F0; border-radius:9999px; overflow:hidden;">
                            <div style="height:100%; width:${pct}%; background:${isCompleted ? '#10B981' : 'linear-gradient(90deg, #7C3AED, #A855F7)'}; border-radius:9999px; transition:width 0.3s ease;"></div>
                        </div>
                    </div>
                </td>
                <td>${statusBadge}</td>
                <td>
                    <span style="font-size:12.5px; color:#64748B;"><i class="fa-regular fa-clock mr-1"></i> ${escapeHtml(s.last_active || 'Recent')}</span>
                </td>
                <td style="text-align:right;">
                    <button class="btn-outline" style="padding:0.35rem 0.65rem; font-size:11.5px; border-radius:6px;" onclick="event.stopPropagation(); openStudentDetailModal(${idx});">
                        <i class="fa-solid fa-circle-info mr-1"></i> Details
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

window.openStudentDetailModal = function(idx) {
    const s = allInstructorStudents[idx];
    if (!s) return;

    let modal = document.getElementById('studentDetailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'studentDetailModal';
        modal.className = 'modal-backdrop';
        modal.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(15,23,42,0.65); backdrop-filter:blur(4px); z-index:1100; display:flex; align-items:center; justify-content:center; padding:1rem;';
        document.body.appendChild(modal);
    }

    const isCompleted = s.status === 'completed' || s.progress_percentage === 100;
    const pct = s.progress_percentage || 0;
    const initials = (s.student_name || 'Student').split(' ').map(n => n.charAt(0)).join('').toUpperCase().substring(0, 2);

    modal.innerHTML = `
        <div style="background:#FFFFFF; border-radius:16px; width:100%; max-width:550px; padding:2rem; box-shadow:0 20px 25px -5px rgba(0,0,0,0.2); position:relative; animation:fadeIn 0.2s ease;">
            <button onclick="closeStudentDetailModal()" style="position:absolute; top:1.25rem; right:1.25rem; background:none; border:none; font-size:1.25rem; color:#64748B; cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
            
            <div style="display:flex; align-items:center; gap:1rem; margin-bottom:1.5rem; padding-bottom:1rem; border-bottom:1px solid #E2E8F0;">
                <div style="width:52px; height:52px; border-radius:50%; background:linear-gradient(135deg, #7C3AED, #A855F7); color:#FFFFFF; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:18px; flex-shrink:0;">
                    ${initials}
                </div>
                <div>
                    <h3 style="font-size:18px; color:#0F172A; margin:0 0 2px;">${escapeHtml(s.student_name)}</h3>
                    <div style="font-size:13px; color:#64748B;">${escapeHtml(s.student_email)}</div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1.5rem;">
                <div style="background:#F8F7FF; border:1px solid #EDE9FE; border-radius:10px; padding:0.85rem;">
                    <span style="font-size:11.5px; color:#64748B; display:block;">Enrolled Course</span>
                    <strong style="font-size:13.5px; color:#1E293B; display:block; margin-top:2px;">${escapeHtml(s.course_title)}</strong>
                </div>
                <div style="background:#F8F7FF; border:1px solid #EDE9FE; border-radius:10px; padding:0.85rem;">
                    <span style="font-size:11.5px; color:#64748B; display:block;">Enrollment Date</span>
                    <strong style="font-size:13.5px; color:#1E293B; display:block; margin-top:2px;">${escapeHtml(s.enrolled_at || 'Recent')}</strong>
                </div>
                <div style="background:#F8F7FF; border:1px solid #EDE9FE; border-radius:10px; padding:0.85rem;">
                    <span style="font-size:11.5px; color:#64748B; display:block;">Completion Status</span>
                    <strong style="font-size:13.5px; color:${isCompleted ? '#059669' : '#1D4ED8'}; display:block; margin-top:2px;">${isCompleted ? 'Completed' : (pct > 0 ? 'In Progress' : 'Not Started')}</strong>
                </div>
                <div style="background:#F8F7FF; border:1px solid #EDE9FE; border-radius:10px; padding:0.85rem;">
                    <span style="font-size:11.5px; color:#64748B; display:block;">Last Activity</span>
                    <strong style="font-size:13.5px; color:#1E293B; display:block; margin-top:2px;">${escapeHtml(s.last_active || 'Recent')}</strong>
                </div>
            </div>

            <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px; padding:1.25rem; margin-bottom:1.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; font-size:13px; font-weight:700;">
                    <span>Overall Progress</span>
                    <span style="color:#7C3AED;">${pct}%</span>
                </div>
                <div style="height:8px; background:#E2E8F0; border-radius:9999px; overflow:hidden; margin-bottom:0.5rem;">
                    <div style="height:100%; width:${pct}%; background:${isCompleted ? '#10B981' : 'linear-gradient(90deg, #7C3AED, #A855F7)'}; border-radius:9999px;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:12px; color:#64748B;">
                    <span>Completed Lessons: <strong>${s.completed_lessons || 0}</strong></span>
                    <span>Total Lessons: <strong>${s.total_lessons || 24}</strong></span>
                </div>
            </div>

            <div style="text-align:right;">
                <button onclick="closeStudentDetailModal()" class="btn-primary" style="padding:0.55rem 1.25rem; font-size:13px; border-radius:8px;">Close</button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
};

window.closeStudentDetailModal = function() {
    const modal = document.getElementById('studentDetailModal');
    if (modal) modal.style.display = 'none';
};

// =========================================================================
// 6. RATINGS & REVIEWS PAGE FUNCTIONS
// =========================================================================

let allInstructorReviews = [];

async function loadInstructorReviewsPage() {
    const container = document.getElementById('instructorReviewsContainer');
    if (!container) return;

    try {
        const data = await window.api.getInstructorReviews();
        if (!data) throw new Error("Could not load reviews");

        document.getElementById('instReviewsAvgRating') && (document.getElementById('instReviewsAvgRating').textContent = (data.avg_rating || 5.0).toFixed(1));
        document.getElementById('instReviewsTotalCount') && (document.getElementById('instReviewsTotalCount').textContent = data.total_reviews || 0);

        // Rating breakdown
        const breakdown = data.rating_breakdown || {5:0, 4:0, 3:0, 2:0, 1:0};
        const total = data.total_reviews || 1;
        for (let star = 5; star >= 1; star--) {
            const count = breakdown[star] || 0;
            const pct = Math.round((count / total) * 100);
            const countEl = document.getElementById(`starCount${star}`);
            const barEl = document.getElementById(`starBar${star}`);
            countEl && (countEl.textContent = count);
            barEl && (barEl.style.width = `${pct}%`);
        }

        allInstructorReviews = data.reviews || [];

        populateReviewsCourseFilter(allInstructorReviews);

        renderInstructorReviewsList(allInstructorReviews);

        // Bind Filters
        const searchInput = document.getElementById('reviewsSearchInput');
        const courseFilter = document.getElementById('reviewsCourseFilterSelect');
        const starFilter = document.getElementById('reviewsStarFilterSelect');

        const applyFilters = () => {
            const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
            const courseVal = courseFilter ? courseFilter.value : 'all';
            const starVal = starFilter ? starFilter.value : 'all';

            const filtered = allInstructorReviews.filter(r => {
                const matchesSearch = !query ||
                    (r.student_name && r.student_name.toLowerCase().includes(query)) ||
                    (r.course_title && r.course_title.toLowerCase().includes(query)) ||
                    (r.comment && r.comment.toLowerCase().includes(query));

                const matchesCourse = courseVal === 'all' || String(r.course_id) === courseVal;
                const matchesStar = starVal === 'all' || String(r.rating) === starVal;

                return matchesSearch && matchesCourse && matchesStar;
            });

            renderInstructorReviewsList(filtered);
        };

        searchInput && searchInput.addEventListener('input', applyFilters);
        courseFilter && courseFilter.addEventListener('change', applyFilters);
        starFilter && starFilter.addEventListener('change', applyFilters);

    } catch (err) {
        console.error("Error loading instructor reviews:", err);
        container.innerHTML = `
            <div style="text-align:center; padding:3rem 1rem; color:#EF4444;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size:1.5rem; margin-bottom:0.5rem; display:block;"></i>
                Unable to load reviews. Please try again.
            </div>
        `;
    }
}

function populateReviewsCourseFilter(reviews) {
    const courseFilter = document.getElementById('reviewsCourseFilterSelect');
    if (!courseFilter) return;

    const uniqueCourses = new Map();
    reviews.forEach(r => {
        if (r.course_id && r.course_title && !uniqueCourses.has(r.course_id)) {
            uniqueCourses.set(r.course_id, r.course_title);
        }
    });

    let optionsHtml = `<option value="all">All Courses</option>`;
    uniqueCourses.forEach((title, id) => {
        optionsHtml += `<option value="${id}">${escapeHtml(title)}</option>`;
    });

    courseFilter.innerHTML = optionsHtml;
}

function renderInstructorReviewsList(reviews) {
    const container = document.getElementById('instructorReviewsContainer');
    if (!container) return;

    if (!reviews || reviews.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:3.5rem 1rem; color:var(--secondary-text); background:#FFFFFF; border:1px solid #E2E8F0; border-radius:16px;">
                <div style="font-size:2.2rem; margin-bottom:0.5rem;">⭐</div>
                <div style="font-weight:700; font-size:16px; color:var(--dark-navy); margin-bottom:0.25rem;">No reviews yet.</div>
                <div style="font-size:13.5px; color:#64748b;">Reviews submitted by students in your courses will appear here.</div>
            </div>
        `;
        return;
    }

    container.innerHTML = reviews.map(r => {
        const initials = (r.student_name || 'Student').split(' ').map(n => n.charAt(0)).join('').toUpperCase().substring(0, 2);
        const stars = '⭐'.repeat(r.rating || 5);

        return `
            <div class="dashboard-card" style="padding:1.5rem; margin-bottom:1rem; transition:transform 0.2s;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.75rem; margin-bottom:0.75rem;">
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        <div style="width:42px; height:42px; border-radius:50%; background:linear-gradient(135deg, #7C3AED, #A855F7); color:#FFFFFF; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:14px; flex-shrink:0;">
                            ${initials}
                        </div>
                        <div>
                            <strong style="font-size:15px; color:#0F172A; display:block;">${escapeHtml(r.student_name)}</strong>
                            <span class="badge-category" style="font-size:11.5px; padding:2px 8px; border-radius:12px;"><i class="fa-solid fa-book-open mr-1"></i> ${escapeHtml(r.course_title)}</span>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="color:#F59E0B; font-size:15px; margin-bottom:2px;">${stars}</div>
                        <span style="font-size:12px; color:#64748B;">${escapeHtml(r.created_at || 'Recent')}</span>
                    </div>
                </div>
                <p style="margin:0; font-size:14px; color:#334155; line-height:1.6; background:#F8F7FF; padding:0.85rem 1.1rem; border-radius:10px; border:1px solid #EDE9FE;">
                    "${escapeHtml(r.comment || 'Great curriculum!')}"
                </p>
            </div>
        `;
    }).join('');
}

// =========================================================================
// 7. COURSE ANALYTICS PAGE FUNCTIONS
// =========================================================================

let allCourseAnalyticsData = null;

async function loadInstructorAnalyticsPage() {
    const tbody = document.getElementById('instructorAnalyticsTableBody');
    if (!tbody) return;

    try {
        const data = await window.api.getInstructorAnalytics();
        if (!data) throw new Error("Could not load course analytics");

        allCourseAnalyticsData = data;

        document.getElementById('instAnalyticsTotalCourses') && (document.getElementById('instAnalyticsTotalCourses').textContent = data.total_courses || 0);
        document.getElementById('instAnalyticsTotalStudents') && (document.getElementById('instAnalyticsTotalStudents').textContent = data.total_students || 0);
        document.getElementById('instAnalyticsCompletionRate') && (document.getElementById('instAnalyticsCompletionRate').textContent = `${data.completion_rate || 0}%`);
        document.getElementById('instAnalyticsAvgRating') && (document.getElementById('instAnalyticsAvgRating').textContent = `⭐ ${(data.avg_rating || 5.0).toFixed(1)}`);

        // Highlight Cards
        const topEnrolled = data.top_enrolled_course;
        const topRated = data.top_rated_course;
        const topCompletion = data.top_completion_course;

        document.getElementById('topEnrolledName') && (document.getElementById('topEnrolledName').textContent = topEnrolled ? topEnrolled.course_title : 'N/A');
        document.getElementById('topEnrolledCount') && (document.getElementById('topEnrolledCount').textContent = topEnrolled ? `${topEnrolled.enrolled_students} Students` : '0 Students');

        document.getElementById('topRatedName') && (document.getElementById('topRatedName').textContent = topRated ? topRated.course_title : 'N/A');
        document.getElementById('topRatedScore') && (document.getElementById('topRatedScore').textContent = topRated ? `⭐ ${topRated.rating.toFixed(1)} (${topRated.review_count} reviews)` : '⭐ 5.0');

        document.getElementById('topCompletionName') && (document.getElementById('topCompletionName').textContent = topCompletion ? topCompletion.course_title : 'N/A');
        document.getElementById('topCompletionScore') && (document.getElementById('topCompletionScore').textContent = topCompletion ? `${topCompletion.completion_rate}% Completion` : '0% Completion');

        renderInstructorAnalyticsTable(data.courses || []);

        // Bind Search
        const searchInput = document.getElementById('analyticsSearchInput');
        searchInput && searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase().trim();
            const filtered = (data.courses || []).filter(c => 
                !query || (c.course_title && c.course_title.toLowerCase().includes(query)) || (c.category && c.category.toLowerCase().includes(query))
            );
            renderInstructorAnalyticsTable(filtered);
        });

    } catch (err) {
        console.error("Error loading course analytics:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; padding:3rem 1rem; color:#EF4444;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size:1.5rem; margin-bottom:0.5rem; display:block;"></i>
                    Unable to load analytics data. Please try again.
                </td>
            </tr>
        `;
    }
}

function renderInstructorAnalyticsTable(courses) {
    const tbody = document.getElementById('instructorAnalyticsTableBody');
    if (!tbody) return;

    if (!courses || courses.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; padding:3.5rem 1rem; color:var(--secondary-text);">
                    <div style="font-size:2.2rem; margin-bottom:0.5rem;">📊</div>
                    <div style="font-weight:700; font-size:16px; color:var(--dark-navy); margin-bottom:0.25rem;">Not enough analytics data yet.</div>
                    <div style="font-size:13.5px; color:#64748b;">Analytics will populate as students enroll and progress through your courses.</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = courses.map((c, idx) => {
        const isPublished = (c.status || '').toLowerCase() === 'published';

        return `
            <tr style="cursor:pointer;" onclick="openCourseAnalyticsModal(${idx})">
                <td>
                    <strong style="color:var(--dark-navy); font-size:14px; display:block;">${escapeHtml(c.course_title)}</strong>
                </td>
                <td><span class="badge-category">${escapeHtml(c.category || 'General')}</span></td>
                <td>
                    <span class="status-pill ${isPublished ? 'badge-status-published' : 'badge-status-draft'}">
                        ${isPublished ? 'Published' : 'Draft'}
                    </span>
                </td>
                <td><strong>${c.enrolled_students || 0}</strong></td>
                <td><strong>${c.completed_students || 0}</strong></td>
                <td>
                    <span style="font-weight:700; color:#10B981;">${c.completion_rate || 0}%</span>
                </td>
                <td>
                    <div style="min-width:110px;">
                        <div style="font-size:12px; font-weight:700; color:#7C3AED; margin-bottom:3px;">${c.avg_progress || 0}%</div>
                        <div style="height:5px; background:#E2E8F0; border-radius:9999px; overflow:hidden;">
                            <div style="height:100%; width:${c.avg_progress || 0}%; background:linear-gradient(90deg, #7C3AED, #A855F7); border-radius:9999px;"></div>
                        </div>
                    </div>
                </td>
                <td>
                    <span style="color:#F59E0B; font-weight:700;">⭐ ${(c.rating || 4.8).toFixed(1)}</span>
                    <span style="font-size:11.5px; color:#64748B;">(${c.review_count || 0})</span>
                </td>
                <td style="text-align:right;">
                    <button class="btn-outline" style="padding:0.35rem 0.65rem; font-size:11.5px; border-radius:6px;" onclick="event.stopPropagation(); openCourseAnalyticsModal(${idx});">
                        <i class="fa-solid fa-chart-pie mr-1"></i> Insights
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

window.openCourseAnalyticsModal = function(idx) {
    if (!allCourseAnalyticsData || !allCourseAnalyticsData.courses || !allCourseAnalyticsData.courses[idx]) return;
    const c = allCourseAnalyticsData.courses[idx];

    let modal = document.getElementById('courseAnalyticsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'courseAnalyticsModal';
        modal.className = 'modal-backdrop';
        modal.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(15,23,42,0.65); backdrop-filter:blur(4px); z-index:1100; display:flex; align-items:center; justify-content:center; padding:1rem;';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div style="background:#FFFFFF; border-radius:16px; width:100%; max-width:580px; padding:2rem; box-shadow:0 20px 25px -5px rgba(0,0,0,0.2); position:relative; animation:fadeIn 0.2s ease;">
            <button onclick="closeCourseAnalyticsModal()" style="position:absolute; top:1.25rem; right:1.25rem; background:none; border:none; font-size:1.25rem; color:#64748B; cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
            
            <div style="margin-bottom:1.5rem; padding-bottom:1rem; border-bottom:1px solid #E2E8F0;">
                <span class="badge-category" style="margin-bottom:0.5rem; display:inline-block;">${escapeHtml(c.category)}</span>
                <h3 style="font-size:18px; color:#0F172A; margin:0;">${escapeHtml(c.course_title)}</h3>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:0.85rem; margin-bottom:1.5rem;">
                <div style="background:#F8F7FF; border:1px solid #EDE9FE; border-radius:10px; padding:0.85rem; text-align:center;">
                    <span style="font-size:11.5px; color:#64748B; display:block;">Enrolled Students</span>
                    <strong style="font-size:18px; color:#7C3AED; display:block; margin-top:2px;">${c.enrolled_students}</strong>
                </div>
                <div style="background:#ECFDF5; border:1px solid #A7F3D0; border-radius:10px; padding:0.85rem; text-align:center;">
                    <span style="font-size:11.5px; color:#065F46; display:block;">Completions</span>
                    <strong style="font-size:18px; color:#047857; display:block; margin-top:2px;">${c.completed_students}</strong>
                </div>
                <div style="background:#FEF3C7; border:1px solid #FDE68A; border-radius:10px; padding:0.85rem; text-align:center;">
                    <span style="font-size:11.5px; color:#92400E; display:block;">Average Rating</span>
                    <strong style="font-size:18px; color:#B45309; display:block; margin-top:2px;">⭐ ${c.rating.toFixed(1)}</strong>
                </div>
            </div>

            <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px; padding:1.25rem; margin-bottom:1.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; font-size:13px; font-weight:700;">
                    <span>Completion Rate</span>
                    <span style="color:#10B981;">${c.completion_rate}%</span>
                </div>
                <div style="height:8px; background:#E2E8F0; border-radius:9999px; overflow:hidden; margin-bottom:1rem;">
                    <div style="height:100%; width:${c.completion_rate}%; background:#10B981; border-radius:9999px;"></div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; font-size:13px; font-weight:700;">
                    <span>Average Learner Progress</span>
                    <span style="color:#7C3AED;">${c.avg_progress}%</span>
                </div>
                <div style="height:8px; background:#E2E8F0; border-radius:9999px; overflow:hidden;">
                    <div style="height:100%; width:${c.avg_progress}%; background:linear-gradient(90deg, #7C3AED, #A855F7); border-radius:9999px;"></div>
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center;">
                <a href="../student/course-details.html?id=${c.course_id}" target="_blank" class="btn-outline" style="padding:0.55rem 1rem; font-size:12.5px; border-radius:8px; text-decoration:none;"><i class="fa-solid fa-eye mr-1"></i> Public Page</a>
                <button onclick="closeCourseAnalyticsModal()" class="btn-primary" style="padding:0.55rem 1.25rem; font-size:13px; border-radius:8px;">Close</button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
};

window.closeCourseAnalyticsModal = function() {
    const modal = document.getElementById('courseAnalyticsModal');
    if (modal) modal.style.display = 'none';
};

window.loadInstructorStudentsPage = loadInstructorStudentsPage;
window.loadInstructorReviewsPage = loadInstructorReviewsPage;
window.loadInstructorAnalyticsPage = loadInstructorAnalyticsPage;
window.initInstructorApp = initInstructorApp;



