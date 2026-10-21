// Course Management Studio Logic
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Auth check
    const user = window.auth ? window.auth.requireRole('instructor') : window.api.getCurrentUser();
    if (!user) return;

    // Display user in sidebar/topbar
    const nameEls = document.querySelectorAll('#sidebarName, #topName');
    const roleEls = document.querySelectorAll('#sidebarRole');
    const avatarEls = document.querySelectorAll('#sidebarAvatar, #topAvatar');

    nameEls.forEach(el => el.textContent = user.name || user.full_name || 'Instructor');
    roleEls.forEach(el => el.textContent = (user.role || 'instructor').toUpperCase());
    const initials = (user.name || user.full_name || 'IN').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    avatarEls.forEach(el => el.textContent = initials);

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.api.logout();
        });
    }

    // 2. Fetch instructor courses to enable switcher and resolve course ID gracefully
    let instructorCourses = [];
    try {
        const fetched = await window.api.getInstructorCourses();
        instructorCourses = Array.isArray(fetched) ? fetched : (fetched.courses || []);
    } catch (e) {
        console.warn('Could not load instructor courses list:', e);
    }

    // If instructor has no courses created at all
    if (!instructorCourses || instructorCourses.length === 0) {
        renderNoCoursesState();
        return;
    }

    // 3. Resolve course ID:
    // Priority: URL param (?id=) -> localStorage -> first course
    const urlParams = new URLSearchParams(window.location.search);
    let courseId = urlParams.get('id');

    if (!courseId) {
        const cachedId = localStorage.getItem('smartlearn_instructor_active_course_id');
        if (cachedId && instructorCourses.some(c => String(c.id) === String(cachedId))) {
            courseId = cachedId;
        } else {
            courseId = instructorCourses[0].id;
        }
        // Update URL cleanly without reloading
        window.history.replaceState(null, '', `course-manage.html?id=${courseId}`);
    }

    // Save to localStorage
    localStorage.setItem('smartlearn_instructor_active_course_id', courseId);

    // Render course switcher dropdown
    renderCourseSwitcher(instructorCourses, courseId);

    const idHidden = document.getElementById('courseIdHidden');
    if (idHidden) idHidden.value = courseId;
    const previewBtn = document.getElementById('previewCourseBtn');
    if (previewBtn) {
        previewBtn.href = `../student/course-details.html?id=${courseId}`;
    }

    // 4. Load Course Data
    await loadCourseStudio(courseId);

    // 5. Bind Save & Handlers
    document.getElementById('saveStudioBtn')?.addEventListener('click', () => saveCourseStudio(courseId));
    document.getElementById('studioForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        saveCourseStudio(courseId);
    });

    // Check hash navigation (e.g. #curriculum)
    if (window.location.hash) {
        const hashTarget = window.location.hash.replace('#', '');
        if (hashTarget === 'curriculum') {
            scrollToSection('sec-curriculum');
        }
    }
});

function renderNoCoursesState() {
    const mainContainer = document.querySelector('.dashboard-content');
    if (!mainContainer) return;
    mainContainer.innerHTML = `
        <div style="text-align: center; max-width: 600px; margin: 4rem auto; padding: 3rem 2rem; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.04);">
            <div style="width: 72px; height: 72px; border-radius: 50%; background: #EEF2FF; color: #4F46E5; display: inline-flex; align-items: center; justify-content: center; font-size: 2rem; margin-bottom: 1.5rem;">
                <i class="fa-solid fa-book-open"></i>
            </div>
            <h2 style="font-size: 1.5rem; font-weight: 700; color: #0F172A; margin-bottom: 0.75rem;">No Courses Created Yet</h2>
            <p style="color: #64748B; font-size: 14.5px; line-height: 1.6; margin-bottom: 2rem;">
                To use the Course Content Studio, create your first course. You can design curriculum chapters, add video lectures, build interactive quizzes, and upload lesson materials.
            </p>
            <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
                <a href="course-editor.html" class="btn-primary" style="text-decoration: none; padding: 0.75rem 1.75rem; font-size: 14px; border-radius: 8px;">
                    <i class="fa-solid fa-plus-circle mr-1"></i> Create Your First Course
                </a>
                <a href="dashboard.html" class="btn-outline" style="text-decoration: none; padding: 0.75rem 1.5rem; font-size: 14px; border-radius: 8px;">
                    Back to Dashboard
                </a>
            </div>
        </div>
    `;
}

function renderCourseSwitcher(courses, activeId) {
    const container = document.getElementById('courseSwitcherContainer');
    if (!container) return;

    if (!courses || courses.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <label for="courseSwitcherSelect" style="font-size: 12px; font-weight: 600; color: #64748B;"><i class="fa-solid fa-shuffle mr-1"></i> Course:</label>
        <select id="courseSwitcherSelect" class="form-input" style="padding: 0.25rem 0.6rem; font-size: 12px; border: 1px solid #CBD5E1; border-radius: 6px; background: #FFFFFF; font-weight: 600; color: #1E293B; max-width: 320px;">
            ${courses.map(c => `
                <option value="${c.id}" ${String(c.id) === String(activeId) ? 'selected' : ''}>
                    ${escapeHtml(c.title || `Course #${c.id}`)}
                </option>
            `).join('')}
        </select>
    `;

    document.getElementById('courseSwitcherSelect')?.addEventListener('change', (e) => {
        const newId = e.target.value;
        if (newId) {
            localStorage.setItem('smartlearn_instructor_active_course_id', newId);
            window.location.href = `course-manage.html?id=${newId}`;
        }
    });
}

// State
let courseState = {
    id: null,
    title: '',
    category: '',
    subcategory: '',
    difficulty: 'Intermediate',
    duration: '30 hours',
    language: 'English',
    short_description: '',
    detailed_description: '',
    is_free: 1,
    price: 0,
    currency: 'INR',
    demo_video_url: '',
    status: 'draft',
    prerequisites: [],
    technical_requirements: [],
    recommended_knowledge: [],
    skills_taught: [],
    target_roles: [],
    target_career_goals: [],
    modules: []
};

let activeQuizEditor = {
    moduleIdx: null,
    lessonIdx: null,
    questions: []
};

// --- LOAD COURSE STUDIO ---
/**
 * Loads existing course details and curriculum structure into the instructor studio, or prepares blank form.
 * Purpose: Fetches course data via window.api.getCourseDetails if editing, and populates inputs.
 */
// ==========================================
// COURSE STUDIO INITIALIZATION & NAVIGATION
// ==========================================
async function loadCourseStudio(courseId) {
    try {
        const data = await window.api.getCourseContent(courseId);
        courseState = {
            ...courseState,
            ...data,
            id: data.id || courseId,
            title: data.title || '',
            category: data.category || 'Web Development',
            subcategory: data.subcategory || '',
            difficulty: data.difficulty || data.level || 'Intermediate',
            duration: data.duration || '30 hours',
            language: data.language || 'English',
            short_description: data.short_description || '',
            detailed_description: data.detailed_description || data.description || '',
            is_free: data.is_free !== undefined ? data.is_free : 1,
            price: data.price || 0,
            currency: data.currency || 'INR',
            demo_video_url: data.demo_video_url || '',
            status: data.status || 'draft',
            prerequisites: Array.isArray(data.prerequisites) ? data.prerequisites : [],
            technical_requirements: Array.isArray(data.technical_requirements) ? data.technical_requirements : [],
            recommended_knowledge: Array.isArray(data.recommended_knowledge) ? data.recommended_knowledge : [],
            skills_taught: Array.isArray(data.skills_taught) ? data.skills_taught : (Array.isArray(data.skills) ? data.skills : []),
            target_roles: Array.isArray(data.target_roles) ? data.target_roles : [],
            target_career_goals: Array.isArray(data.target_career_goals) ? data.target_career_goals : (Array.isArray(data.career_goals) ? data.career_goals : []),
            modules: Array.isArray(data.modules) ? data.modules : []
        };

        // Populate Basic Info
        const titleEl = document.getElementById('courseTitle');
        if (titleEl) titleEl.value = courseState.title || '';
        const catEl = document.getElementById('courseCategory');
        if (catEl) catEl.value = courseState.category || 'Web Development';
        const subCatEl = document.getElementById('courseSubcategory');
        if (subCatEl) subCatEl.value = courseState.subcategory || '';
        const diffEl = document.getElementById('courseDifficulty');
        if (diffEl) diffEl.value = courseState.difficulty || 'Intermediate';
        const durEl = document.getElementById('courseDuration');
        if (durEl) durEl.value = courseState.duration || '';
        const langEl = document.getElementById('courseLanguage');
        if (langEl) langEl.value = courseState.language || 'English';

        // Populate Description
        const shortDescEl = document.getElementById('courseShortDesc');
        if (shortDescEl) shortDescEl.value = courseState.short_description || '';
        const detailedDescEl = document.getElementById('courseDetailedDesc');
        if (detailedDescEl) detailedDescEl.value = courseState.detailed_description || '';

        // Populate Demo Video
        const demoEl = document.getElementById('demoVideoUrl');
        if (demoEl) demoEl.value = courseState.demo_video_url || '';
        updateDemoPreview(courseState.demo_video_url || '');

        // Populate Pricing
        const isFree = courseState.is_free !== 0 && courseState.is_free !== false && (!courseState.price || Number(courseState.price) === 0);
        if (isFree) {
            const freeRadio = document.getElementById('priceTypeFree');
            if (freeRadio) freeRadio.checked = true;
            togglePricingFields(true);
        } else {
            const paidRadio = document.getElementById('priceTypePaid');
            if (paidRadio) paidRadio.checked = true;
            togglePricingFields(false);
            const priceInput = document.getElementById('coursePrice');
            if (priceInput) priceInput.value = courseState.price || 0;
        }

        // Render Tag Lists
        renderAllTagLists();

        // Render Curriculum Modules
        renderCurriculumModules();

        // Render Preview Lessons Summary
        renderPreviewLessonsSummary();

        // Update Sticky Bar & Validation
        updateStudioHeaderAndValidation();

    } catch (err) {
        console.error('Failed to load course details:', err);
        const mainContainer = document.querySelector('.dashboard-content');
        if (mainContainer) {
            mainContainer.innerHTML = `
                <div style="text-align: center; max-width: 600px; margin: 4rem auto; padding: 2.5rem 2rem; background: #FFFFFF; border: 1px solid #FECACA; border-radius: 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.03);">
                    <div style="font-size: 2.5rem; color: #EF4444; margin-bottom: 1rem;"><i class="fa-solid fa-triangle-exclamation"></i></div>
                    <h3 style="font-size: 1.3rem; font-weight: 700; color: #991B1B; margin-bottom: 0.5rem;">Could Not Load Course</h3>
                    <p style="color: #64748B; font-size: 14px; margin-bottom: 1.5rem;">${escapeHtml(err.message || 'The requested course could not be retrieved.')}</p>
                    <div style="display: flex; gap: 0.75rem; justify-content: center;">
                        <a href="courses.html" class="btn-primary" style="text-decoration:none; padding: 0.6rem 1.4rem; font-size: 13px; border-radius: 8px;">Back to My Courses</a>
                    </div>
                </div>
            `;
        }
    }
}

// --- NAVIGATION ---
/**
 * Smoothly scrolls the studio window to a specified editor section (Curriculum, Pricing, Media).
 * @param {string} sectionId - Target DOM section ID.
 */
window.scrollToSection = function(sectionId) {
    const el = document.getElementById(sectionId);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.querySelectorAll('.section-nav-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(sectionId)) {
                btn.classList.add('active');
            }
        });
    }
};

// --- TAGS / LISTS RENDERING ---
function renderAllTagLists() {
    // Prerequisites
    renderTagList('containerPrereq', courseState.prerequisites, (idx) => {
        courseState.prerequisites.splice(idx, 1);
        renderAllTagLists();
        updateStudioHeaderAndValidation();
    });

    // Tech Requirements
    renderTagList('containerTechReq', courseState.technical_requirements, (idx) => {
        courseState.technical_requirements.splice(idx, 1);
        renderAllTagLists();
        updateStudioHeaderAndValidation();
    });

    // Recommended Knowledge
    renderTagList('containerRecKnowledge', courseState.recommended_knowledge, (idx) => {
        courseState.recommended_knowledge.splice(idx, 1);
        renderAllTagLists();
        updateStudioHeaderAndValidation();
    });

    // Target Roles
    renderTagList('containerTargetRoles', courseState.target_roles, (idx) => {
        courseState.target_roles.splice(idx, 1);
        renderAllTagLists();
        updateStudioHeaderAndValidation();
    });

    // Career Goals
    renderTagList('containerCareerGoals', courseState.target_career_goals, (idx) => {
        courseState.target_career_goals.splice(idx, 1);
        renderAllTagLists();
        updateStudioHeaderAndValidation();
    });

    // Skills Taught
    renderSkillsList();
}

function renderTagList(containerId, items, onRemove) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!items || items.length === 0) {
        container.innerHTML = `<span style="font-size:12px; color:#94A3B8; font-style:italic;">None added yet</span>`;
        return;
    }
    container.innerHTML = items.map((item, idx) => `
        <span class="tag-pill">
            ${escapeHtml(item)}
            <button type="button" onclick="window.removeTagItem('${containerId}', ${idx})">&times;</button>
        </span>
    `).join('');

    window[`remove_${containerId}`] = onRemove;
}

window.removeTagItem = function(containerId, idx) {
    if (window[`remove_${containerId}`]) {
        window[`remove_${containerId}`](idx);
    }
};

window.addListTag = function(type) {
    let inputEl, targetArr;
    if (type === 'prereq') {
        inputEl = document.getElementById('inputPrereq');
        targetArr = courseState.prerequisites;
    } else if (type === 'techReq') {
        inputEl = document.getElementById('inputTechReq');
        targetArr = courseState.technical_requirements;
    } else if (type === 'recKnowledge') {
        inputEl = document.getElementById('inputRecKnowledge');
        targetArr = courseState.recommended_knowledge;
    } else if (type === 'targetRole') {
        inputEl = document.getElementById('inputTargetRole');
        targetArr = courseState.target_roles;
    } else if (type === 'careerGoal') {
        inputEl = document.getElementById('inputCareerGoal');
        targetArr = courseState.target_career_goals;
    }

    if (inputEl && inputEl.value.trim()) {
        const val = inputEl.value.trim();
        if (!targetArr.includes(val)) {
            targetArr.push(val);
            inputEl.value = '';
            renderAllTagLists();
            updateStudioHeaderAndValidation();
        }
    }
};

// Skills with Level
function renderSkillsList() {
    const container = document.getElementById('containerSkillsTaught');
    if (!container) return;

    if (!courseState.skills_taught || courseState.skills_taught.length === 0) {
        container.innerHTML = `<span style="font-size:12px; color:#94A3B8; font-style:italic;">No skills added yet</span>`;
        return;
    }

    container.innerHTML = courseState.skills_taught.map((item, idx) => {
        const skillName = typeof item === 'object' ? (item.skill || item.name || '') : item;
        const skillLevel = typeof item === 'object' ? (item.level || 'Intermediate') : 'Intermediate';
        return `
            <span class="tag-pill">
                <strong>${escapeHtml(skillName)}</strong>
                <span style="font-size:10.5px; opacity:0.8; background:#DDD6FE; padding:1px 5px; border-radius:4px;">${escapeHtml(skillLevel)}</span>
                <button type="button" onclick="removeSkillTaught(${idx})">&times;</button>
            </span>
        `;
    }).join('');
}

window.addSkillWithLevel = function() {
    const inputName = document.getElementById('inputSkillName');
    const selectLevel = document.getElementById('inputSkillLevel');
    if (inputName && inputName.value.trim()) {
        const name = inputName.value.trim();
        const level = selectLevel.value || 'Intermediate';
        courseState.skills_taught.push({ skill: name, level: level });
        inputName.value = '';
        renderSkillsList();
        updateStudioHeaderAndValidation();
    }
};

window.removeSkillTaught = function(idx) {
    courseState.skills_taught.splice(idx, 1);
    renderSkillsList();
    updateStudioHeaderAndValidation();
};

// --- DEMO VIDEO & PRICING ---
window.updateDemoPreview = function(url) {
    const container = document.getElementById('demoVideoPlayerContainer');
    if (!container) return;

    const trimmed = (url || '').trim();
    if (!trimmed) {
        container.innerHTML = `<span>No demo video provided yet</span>`;
        return;
    }

    // Direct video stream or embedded
    const base = (window.API_URL || (window.api && window.api.API_URL) || '');
    const videoUrl = trimmed.startsWith('/uploads/') ? `${base}${trimmed}` : trimmed;
    container.innerHTML = `
        <video controls style="width: 100%; max-height: 240px; border-radius: 6px; background: #000;" src="${escapeHtml(videoUrl)}">
            Your browser does not support video preview.
        </video>
    `;
};

window.handleDemoVideoUpload = async function(input) {
    const file = input.files[0];
    if (!file) return;

    const statusEl = document.getElementById('demoUploadStatus');
    statusEl.innerHTML = `<span style="color:#4F46E5;"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Uploading video file (${Math.round(file.size / 1024 / 1024)}MB)...</span>`;

    try {
        const res = await window.api.uploadCourseVideo(file, courseState.id);
        if (res.video_url) {
            document.getElementById('demoVideoUrl').value = res.video_url;
            courseState.demo_video_url = res.video_url;
            updateDemoPreview(res.video_url);
            statusEl.innerHTML = `<span style="color:#059669;"><i class="fa-solid fa-circle-check mr-1"></i> Video uploaded successfully!</span>`;
            updateStudioHeaderAndValidation();
        }
    } catch (err) {
        statusEl.innerHTML = `<span style="color:#EF4444;"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Upload failed: ${escapeHtml(err.message)}</span>`;
    }
};

window.togglePricingFields = function(isFree) {
    const wrapper = document.getElementById('priceInputWrapper');
    const priceInput = document.getElementById('coursePrice');
    if (isFree) {
        if (wrapper) wrapper.style.display = 'none';
        if (priceInput) priceInput.value = 0;
        courseState.is_free = 1;
        courseState.price = 0;
    } else {
        if (wrapper) wrapper.style.display = 'block';
        courseState.is_free = 0;
        if (!courseState.price || courseState.price === 0) {
            if (priceInput) priceInput.value = 499;
            courseState.price = 499;
        }
    }
    updateStudioHeaderAndValidation();
};

// --- CURRICULUM STUDIO BUILDER ---
/**
 * Renders curriculum accordion containing chapter modules, lessons, and assessment quizzes.
 * Purpose: Allows instructors to add, reorder, expand, and configure chapters and lessons.
 */
// ==========================================
// CURRICULUM & MODULE ACCORDION BUILDER
// ==========================================
function renderCurriculumModules() {
    const container = document.getElementById('curriculumModulesContainer');
    if (!container) return;

    if (!courseState.modules || courseState.modules.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; background: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 8px;">
                <div style="font-size: 2rem; margin-bottom: 0.5rem;">📂</div>
                <div style="font-weight: 700; color: var(--dark-navy);">No Curriculum Modules Yet</div>
                <p style="font-size: 13px; color: #64748b; margin-bottom: 1rem;">Structure your course into modules and lessons (videos, quizzes, articles, and downloadable materials).</p>
                <button type="button" onclick="addNewModule()" class="btn-primary-small" style="padding: 0.5rem 1.25rem;"><i class="fa-solid fa-plus mr-1"></i> Add First Module</button>
            </div>
        `;
        return;
    }

    container.innerHTML = courseState.modules.map((m, mIdx) => `
        <div class="module-item">
            <!-- Module Header -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; gap: 0.75rem; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1; min-width: 260px;">
                    <span style="font-weight: 800; color: #4F46E5; font-size: 14px;">M${mIdx + 1}:</span>
                    <input type="text" value="${escapeHtml(m.title || '')}" onchange="updateModuleField(${mIdx}, 'title', this.value)" placeholder="Module Title (e.g. 1. Foundations & Setup)" class="form-input" style="font-weight: 700; flex: 1; padding: 0.45rem 0.65rem; border: 1px solid #CBD5E1; border-radius: 6px; font-size: 13.5px;">
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <input type="text" value="${escapeHtml(m.duration || '')}" onchange="updateModuleField(${mIdx}, 'duration', this.value)" placeholder="e.g. 4 hours" class="form-input" style="width: 120px; padding: 0.45rem 0.65rem; border: 1px solid #CBD5E1; border-radius: 6px; font-size: 12.5px;">
                    <button type="button" onclick="removeModule(${mIdx})" class="btn-outline" style="color: #EF4444; border-color: #FCA5A5; padding: 0.4rem 0.65rem; font-size: 12px; border-radius: 6px;" title="Delete Module"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>

            <!-- Lessons Section -->
            <div style="margin-bottom: 1rem;">
                <div style="font-size: 12.5px; font-weight: 700; color: #334155; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
                    <span>Lessons in Module ${mIdx + 1} (${(m.lessons || []).length}):</span>
                    <button type="button" onclick="addNewLesson(${mIdx})" style="background: none; border: none; color: #4F46E5; font-weight: 700; font-size: 12px; cursor: pointer;">
                        <i class="fa-solid fa-plus mr-1"></i> Add Lesson
                    </button>
                </div>

                <div id="lessonsList_${mIdx}">
                    ${(m.lessons || []).map((l, lIdx) => renderLessonCard(mIdx, lIdx, l)).join('')}
                </div>
            </div>

            <!-- Module Resources / Materials -->
            <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 6px; padding: 0.75rem;">
                <label style="font-size: 12px; font-weight: 700; color: #475569; display: block; margin-bottom: 0.25rem;">
                    <i class="fa-solid fa-paperclip mr-1" style="color: #4F46E5;"></i> Module Downloadable Resources / Attachment:
                </label>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <input type="text" value="${escapeHtml(m.materials || '')}" onchange="updateModuleField(${mIdx}, 'materials', this.value)" placeholder="e.g. GitHub Repository URL, Cheatsheet PDF, or Starter Code" class="form-input" style="flex: 1; padding: 0.4rem 0.6rem; font-size: 12.5px; border: 1px solid #CBD5E1; border-radius: 6px;">
                    <input type="file" id="modFile_${mIdx}" style="display: none;" onchange="handleModuleMaterialUpload(${mIdx}, this)">
                    <button type="button" onclick="document.getElementById('modFile_${mIdx}').click()" class="btn-outline" style="padding: 0.4rem 0.75rem; font-size: 12px; border-radius: 6px; white-space: nowrap;">
                        <i class="fa-solid fa-upload mr-1"></i> Upload File
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * Renders individual lesson item card with type icon (Video/Article/Quiz), title input, and duration.
 * @param {Object} lesson - Lesson data object.
 * @param {number} mIdx - Parent module index.
 * @param {number} lIdx - Lesson index.
 */
function renderLessonCard(mIdx, lIdx, lesson) {
    const type = lesson.type || 'video';
    const isPreview = !!lesson.is_preview;

    return `
        <div class="lesson-item">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 0.6rem; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 0.4rem; flex: 1; min-width: 240px;">
                    <span style="font-size: 12px; color: #64748b; font-weight: 700;">${mIdx + 1}.${lIdx + 1}</span>
                    <input type="text" value="${escapeHtml(lesson.title || '')}" onchange="updateLessonField(${mIdx}, ${lIdx}, 'title', this.value)" placeholder="Lesson Title" class="form-input" style="flex: 1; padding: 0.35rem 0.55rem; font-size: 12.5px; border: 1px solid #CBD5E1; border-radius: 6px; font-weight: 600;">
                </div>

                <div style="display: flex; align-items: center; gap: 0.4rem;">
                    <!-- Lesson Type Selector -->
                    <select onchange="updateLessonField(${mIdx}, ${lIdx}, 'type', this.value); renderCurriculumModules();" class="form-input" style="padding: 0.35rem 0.55rem; font-size: 12px; border: 1px solid #CBD5E1; border-radius: 6px; background: #F8FAFC;">
                        <option value="video" ${type === 'video' ? 'selected' : ''}>📹 Video</option>
                        <option value="article" ${type === 'article' ? 'selected' : ''}>📄 Article / Text</option>
                        <option value="document" ${type === 'document' ? 'selected' : ''}>📑 PDF / Document</option>
                        <option value="external" ${type === 'external' ? 'selected' : ''}>🔗 External Resource</option>
                        <option value="quiz" ${type === 'quiz' ? 'selected' : ''}>❓ Quiz</option>
                    </select>

                    <input type="text" value="${escapeHtml(lesson.duration || '30 mins')}" onchange="updateLessonField(${mIdx}, ${lIdx}, 'duration', this.value)" placeholder="Duration" class="form-input" style="width: 85px; padding: 0.35rem 0.5rem; font-size: 12px; border: 1px solid #CBD5E1; border-radius: 6px;">

                    <!-- Preview Toggle -->
                    <label class="preview-toggle" title="Allow unenrolled students to preview this lesson">
                        <input type="checkbox" ${isPreview ? 'checked' : ''} onchange="updateLessonField(${mIdx}, ${lIdx}, 'is_preview', this.checked); renderPreviewLessonsSummary();">
                        <span>Preview</span>
                    </label>

                    <button type="button" onclick="removeLesson(${mIdx}, ${lIdx})" style="background: none; border: none; color: #94A3B8; cursor: pointer; font-size: 14px; padding: 2px;" title="Delete Lesson"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>

            <!-- Dynamic Body based on Lesson Type -->
            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 0.6rem; font-size: 12.5px;">
                ${renderLessonTypeBody(mIdx, lIdx, lesson, type)}
            </div>
        </div>
    `;
}

function renderLessonTypeBody(mIdx, lIdx, lesson, type) {
    if (type === 'video') {
        return `
            <div style="display: flex; gap: 0.5rem; align-items: center;">
                <label style="font-weight: 600; color: #475569; width: 80px;">Video URL:</label>
                <input type="text" value="${escapeHtml(lesson.video_url || '')}" onchange="updateLessonField(${mIdx}, ${lIdx}, 'video_url', this.value)" placeholder="https://... or upload video" class="form-input" style="flex: 1; padding: 0.35rem 0.55rem; font-size: 12px; border: 1px solid #CBD5E1; border-radius: 6px;">
                <input type="file" id="lesVid_${mIdx}_${lIdx}" accept="video/mp4,video/webm" style="display: none;" onchange="handleLessonVideoUpload(${mIdx}, ${lIdx}, this)">
                <button type="button" onclick="document.getElementById('lesVid_${mIdx}_${lIdx}').click()" class="btn-outline" style="padding: 0.35rem 0.65rem; font-size: 11.5px; border-radius: 6px;"><i class="fa-solid fa-upload mr-1"></i> Upload</button>
            </div>
        `;
    } else if (type === 'article') {
        return `
            <div>
                <label style="font-weight: 600; color: #475569; display: block; margin-bottom: 0.3rem;">Article / Reading Content (Markdown supported):</label>
                <textarea rows="3" onchange="updateLessonField(${mIdx}, ${lIdx}, 'article_content', this.value)" placeholder="Write your lesson text, key concepts, formulas, code snippets..." class="form-input" style="width: 100%; padding: 0.45rem; font-size: 12px; border: 1px solid #CBD5E1; border-radius: 6px; font-family: inherit;">${escapeHtml(lesson.article_content || '')}</textarea>
            </div>
        `;
    } else if (type === 'document') {
        return `
            <div style="display: flex; gap: 0.5rem; align-items: center;">
                <label style="font-weight: 600; color: #475569; width: 100px;">Document / PDF:</label>
                <input type="text" value="${escapeHtml(lesson.document_url || '')}" onchange="updateLessonField(${mIdx}, ${lIdx}, 'document_url', this.value)" placeholder="PDF or document URL" class="form-input" style="flex: 1; padding: 0.35rem 0.55rem; font-size: 12px; border: 1px solid #CBD5E1; border-radius: 6px;">
                <input type="file" id="lesDoc_${mIdx}_${lIdx}" accept=".pdf,.doc,.docx,.ppt,.pptx" style="display: none;" onchange="handleLessonMaterialUpload(${mIdx}, ${lIdx}, this)">
                <button type="button" onclick="document.getElementById('lesDoc_${mIdx}_${lIdx}').click()" class="btn-outline" style="padding: 0.35rem 0.65rem; font-size: 11.5px; border-radius: 6px;"><i class="fa-solid fa-upload mr-1"></i> Upload PDF</button>
            </div>
        `;
    } else if (type === 'external') {
        return `
            <div style="display: flex; flex-direction: column; gap: 0.4rem;">
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <label style="font-weight: 600; color: #475569; width: 95px;">Resource Link:</label>
                    <input type="text" value="${escapeHtml(lesson.external_url || '')}" onchange="updateLessonField(${mIdx}, ${lIdx}, 'external_url', this.value)" placeholder="https://github.com/... or https://docs..." class="form-input" style="flex: 1; padding: 0.35rem 0.55rem; font-size: 12px; border: 1px solid #CBD5E1; border-radius: 6px;">
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <label style="font-weight: 600; color: #475569; width: 95px;">Instructions:</label>
                    <input type="text" value="${escapeHtml(lesson.notes || '')}" onchange="updateLessonField(${mIdx}, ${lIdx}, 'notes', this.value)" placeholder="What students should review in this link" class="form-input" style="flex: 1; padding: 0.35rem 0.55rem; font-size: 12px; border: 1px solid #CBD5E1; border-radius: 6px;">
                </div>
            </div>
        `;
    } else if (type === 'quiz') {
        const qCount = (lesson.quiz_questions || []).length;
        return `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <span style="font-weight: 700; color: #4F46E5;"><i class="fa-solid fa-clipboard-question mr-1"></i> Interactive Quiz</span>
                    <span style="color: #64748b; margin-left: 0.5rem;">(${qCount} Question${qCount === 1 ? '' : 's'})</span>
                </div>
                <button type="button" onclick="openQuizEditor(${mIdx}, ${lIdx})" class="btn-primary-small" style="padding: 0.35rem 0.75rem; font-size: 12px; border-radius: 6px;">
                    <i class="fa-solid fa-pen mr-1"></i> Edit Questions
                </button>
            </div>
        `;
    }
    return '';
}

// Module / Lesson mutation helpers
/**
 * Appends a new blank module chapter to the curriculum builder.
 */
window.addNewModule = function() {
    const nextId = (courseState.modules.length || 0) + 1;
    courseState.modules.push({
        module_id: nextId,
        title: `Module ${nextId}: New Topic`,
        duration: '4 hours',
        materials: '',
        lessons: [
            {
                lesson_id: 1,
                title: 'Introduction & Concepts',
                type: 'video',
                duration: '20 mins',
                video_url: '',
                is_preview: nextId === 1
            }
        ]
    });
    renderCurriculumModules();
    renderPreviewLessonsSummary();
    updateStudioHeaderAndValidation();
};

window.removeModule = function(mIdx) {
    if (confirm('Are you sure you want to delete this module and all its lessons?')) {
        courseState.modules.splice(mIdx, 1);
        renderCurriculumModules();
        renderPreviewLessonsSummary();
        updateStudioHeaderAndValidation();
    }
};

window.updateModuleField = function(mIdx, field, val) {
    if (courseState.modules[mIdx]) {
        courseState.modules[mIdx][field] = val;
        updateStudioHeaderAndValidation();
    }
};

/**
 * Appends a new lesson (Video, Article, Quiz, Assignment) to a specific module.
 * @param {number} mIdx - Target module index.
 */
window.addNewLesson = function(mIdx) {
    if (!courseState.modules[mIdx]) return;
    if (!courseState.modules[mIdx].lessons) courseState.modules[mIdx].lessons = [];
    const nextLesId = courseState.modules[mIdx].lessons.length + 1;

    courseState.modules[mIdx].lessons.push({
        lesson_id: nextLesId,
        title: `Lesson ${nextLesId}`,
        type: 'video',
        duration: '25 mins',
        video_url: '',
        is_preview: false
    });
    renderCurriculumModules();
    renderPreviewLessonsSummary();
    updateStudioHeaderAndValidation();
};

window.removeLesson = function(mIdx, lIdx) {
    if (courseState.modules[mIdx] && courseState.modules[mIdx].lessons) {
        courseState.modules[mIdx].lessons.splice(lIdx, 1);
        renderCurriculumModules();
        renderPreviewLessonsSummary();
        updateStudioHeaderAndValidation();
    }
};

window.updateLessonField = function(mIdx, lIdx, field, val) {
    if (courseState.modules[mIdx] && courseState.modules[mIdx].lessons[lIdx]) {
        courseState.modules[mIdx].lessons[lIdx][field] = val;
        updateStudioHeaderAndValidation();
    }
};

// Material / Video Uploads for Modules and Lessons
window.handleModuleMaterialUpload = async function(mIdx, input) {
    const file = input.files[0];
    if (!file) return;

    try {
        const res = await window.api.uploadCourseMaterial(file, courseState.id);
        if (res.material_url && courseState.modules[mIdx]) {
            courseState.modules[mIdx].materials = res.material_url;
            renderCurriculumModules();
            alert('Module resource uploaded successfully!');
        }
    } catch (err) {
        alert('Resource upload failed: ' + (err.message || err));
    }
};

/**
 * Uploads lesson video file to backend media storage and links stream URL.
 * @param {HTMLInputElement} input - File input element containing selected video.
 * @param {number} mIdx - Target module index.
 * @param {number} lIdx - Target lesson index.
 */
window.handleLessonVideoUpload = async function(mIdx, lIdx, input) {
    const file = input.files[0];
    if (!file) return;

    try {
        const res = await window.api.uploadCourseVideo(file, courseState.id);
        if (res.video_url && courseState.modules[mIdx] && courseState.modules[mIdx].lessons[lIdx]) {
            courseState.modules[mIdx].lessons[lIdx].video_url = res.video_url;
            renderCurriculumModules();
            alert('Lesson video uploaded successfully!');
        }
    } catch (err) {
        alert('Lesson video upload failed: ' + (err.message || err));
    }
};

window.handleLessonMaterialUpload = async function(mIdx, lIdx, input) {
    const file = input.files[0];
    if (!file) return;

    try {
        const res = await window.api.uploadCourseMaterial(file, courseState.id);
        if (res.material_url && courseState.modules[mIdx] && courseState.modules[mIdx].lessons[lIdx]) {
            courseState.modules[mIdx].lessons[lIdx].document_url = res.material_url;
            renderCurriculumModules();
            alert('Lesson document uploaded successfully!');
        }
    } catch (err) {
        alert('Lesson document upload failed: ' + (err.message || err));
    }
};

// --- PREVIEW LESSONS SECTION 8 ---
function renderPreviewLessonsSummary() {
    const container = document.getElementById('previewLessonsSummaryList');
    if (!container) return;

    const allLessons = [];
    (courseState.modules || []).forEach((m, mIdx) => {
        (m.lessons || []).forEach((l, lIdx) => {
            allLessons.push({
                mIdx,
                lIdx,
                moduleTitle: m.title || `Module ${mIdx + 1}`,
                lessonTitle: l.title || `Lesson ${lIdx + 1}`,
                type: l.type || 'video',
                isPreview: !!l.is_preview
            });
        });
    });

    if (allLessons.length === 0) {
        container.innerHTML = `<span style="font-size: 13px; color: #94A3B8;">No lessons in curriculum yet.</span>`;
        return;
    }

    container.innerHTML = allLessons.map(item => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem; background: ${item.isPreview ? '#ECFDF5' : '#F8FAFC'}; border: 1px solid ${item.isPreview ? '#A7F3D0' : '#E2E8F0'}; border-radius: 6px; font-size: 13px;">
            <div>
                <strong style="color: ${item.isPreview ? '#065F46' : 'var(--dark-navy)'};">${escapeHtml(item.lessonTitle)}</strong>
                <span style="font-size: 11.5px; color: #64748b; margin-left: 0.5rem;">(${escapeHtml(item.moduleTitle)} • ${item.type})</span>
            </div>
            <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer; font-size: 12px; font-weight: 600; color: ${item.isPreview ? '#059669' : '#64748b'};">
                <input type="checkbox" ${item.isPreview ? 'checked' : ''} onchange="updateLessonField(${item.mIdx}, ${item.lIdx}, 'is_preview', this.checked); renderCurriculumModules(); renderPreviewLessonsSummary();">
                <span>${item.isPreview ? 'Preview Enabled 🔓' : 'Locked for Enrollment 🔒'}</span>
            </label>
        </div>
    `).join('');
}

// --- QUIZ MODAL EDITOR ---
/**
 * Opens modal dialog to create and edit multiple-choice assessment questions and passing scores.
 * @param {number} mIdx - Module index.
 * @param {number} lIdx - Lesson index.
 */
// ==========================================
// QUIZ EDITOR MODAL & QUESTION BUILDER
// ==========================================
window.openQuizEditor = function(mIdx, lIdx) {
    activeQuizEditor.moduleIdx = mIdx;
    activeQuizEditor.lessonIdx = lIdx;

    const lesson = courseState.modules[mIdx].lessons[lIdx];
    activeQuizEditor.questions = JSON.parse(JSON.stringify(lesson.quiz_questions || []));

    if (activeQuizEditor.questions.length === 0) {
        activeQuizEditor.questions.push({
            question: 'Sample Question: What is the primary purpose of this topic?',
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            correct_option: 0,
            explanation: 'Option A is correct because it addresses the foundational concept.'
        });
    }

    renderQuizModalQuestions();
    const modal = document.getElementById('quizModal');
    if (modal) modal.style.display = 'flex';
};

window.closeQuizModal = function() {
    const modal = document.getElementById('quizModal');
    if (modal) modal.style.display = 'none';
};

window.addQuizQuestion = function() {
    activeQuizEditor.questions.push({
        question: 'New Question',
        options: ['Choice 1', 'Choice 2', 'Choice 3', 'Choice 4'],
        correct_option: 0,
        explanation: ''
    });
    renderQuizModalQuestions();
};

window.removeQuizQuestion = function(qIdx) {
    activeQuizEditor.questions.splice(qIdx, 1);
    renderQuizModalQuestions();
};

function renderQuizModalQuestions() {
    const container = document.getElementById('quizQuestionsContainer');
    if (!container) return;

    container.innerHTML = activeQuizEditor.questions.map((q, qIdx) => `
        <div style="border: 1px solid #E2E8F0; background: #F8FAFC; border-radius: 8px; padding: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <strong style="font-size: 13px; color: #1E293B;">Question ${qIdx + 1}</strong>
                <button type="button" onclick="removeQuizQuestion(${qIdx})" style="border: none; background: none; color: #EF4444; cursor: pointer; font-size: 12px;"><i class="fa-solid fa-trash"></i></button>
            </div>
            
            <input type="text" value="${escapeHtml(q.question || '')}" onchange="activeQuizEditor.questions[${qIdx}].question = this.value" placeholder="Enter Question text..." class="form-input" style="width: 100%; padding: 0.4rem 0.6rem; font-size: 13px; border: 1px solid #CBD5E1; border-radius: 6px; margin-bottom: 0.5rem; font-weight: 600;">

            <div style="font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 0.3rem;">Options (Select radio for Correct Answer):</div>
            <div style="display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.5rem;">
                ${(q.options || ['', '', '', '']).map((opt, oIdx) => `
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <input type="radio" name="correctOpt_${qIdx}" ${Number(q.correct_option) === oIdx ? 'checked' : ''} onchange="activeQuizEditor.questions[${qIdx}].correct_option = ${oIdx}" title="Mark as correct answer">
                        <input type="text" value="${escapeHtml(opt)}" onchange="activeQuizEditor.questions[${qIdx}].options[${oIdx}] = this.value" placeholder="Option ${oIdx + 1}" class="form-input" style="flex: 1; padding: 0.35rem 0.5rem; font-size: 12px; border: 1px solid #CBD5E1; border-radius: 6px;">
                    </div>
                `).join('')}
            </div>

            <input type="text" value="${escapeHtml(q.explanation || '')}" onchange="activeQuizEditor.questions[${qIdx}].explanation = this.value" placeholder="Explanation for correct answer (optional)" class="form-input" style="width: 100%; padding: 0.35rem 0.5rem; font-size: 12px; border: 1px solid #CBD5E1; border-radius: 6px;">
        </div>
    `).join('');
}

/**
 * Validates and saves quiz questions and passing score into the active lesson data structure.
 */
window.saveQuizModal = function() {
    if (activeQuizEditor.moduleIdx !== null && activeQuizEditor.lessonIdx !== null) {
        const lesson = courseState.modules[activeQuizEditor.moduleIdx].lessons[activeQuizEditor.lessonIdx];
        lesson.quiz_questions = activeQuizEditor.questions;
        renderCurriculumModules();
        closeQuizModal();
        updateStudioHeaderAndValidation();
    }
};

// --- VALIDATION & COMPLETENESS CHECKLIST ---
function updateStudioHeaderAndValidation() {
    // Title
    const title = document.getElementById('courseTitle').value.trim() || courseState.title || 'Untitled Course';
    const stickyTitle = document.getElementById('stickyCourseTitle');
    if (stickyTitle) stickyTitle.textContent = title;

    // Status Badge
    const isPublished = (courseState.status || '').toLowerCase() === 'published';
    const statusBadge = document.getElementById('stickyStatusBadge');
    const publishDisplay = document.getElementById('publishStatusDisplay');
    const toggleBtn = document.getElementById('togglePublishBtn');

    if (statusBadge) {
        statusBadge.className = `status-pill ${isPublished ? 'badge-status-published' : 'badge-status-draft'}`;
        statusBadge.textContent = isPublished ? 'Published' : 'Draft';
    }
    if (publishDisplay) {
        publishDisplay.textContent = isPublished ? 'Published 🌐' : 'Draft 📝';
        publishDisplay.style.color = isPublished ? '#059669' : '#4C1D95';
    }
    if (toggleBtn) {
        toggleBtn.textContent = isPublished ? 'Unpublish Course' : 'Publish Course';
        toggleBtn.className = isPublished ? 'btn-outline' : 'btn-primary';
    }

    // Pricing Badge
    const isFree = courseState.is_free !== 0 && courseState.is_free !== false && (!courseState.price || Number(courseState.price) === 0);
    const priceBadge = document.getElementById('stickyPriceBadge');
    if (priceBadge) {
        if (isFree) {
            priceBadge.textContent = 'Free Course';
            priceBadge.style.background = '#ECFDF5';
            priceBadge.style.color = '#059669';
        } else {
            priceBadge.textContent = `₹${Number(courseState.price || 0).toLocaleString()}`;
            priceBadge.style.background = '#EEF2FF';
            priceBadge.style.color = '#4F46E5';
        }
    }

    // Checklist
    const shortDesc = document.getElementById('courseShortDesc').value.trim() || courseState.short_description || '';
    const hasModules = (courseState.modules || []).length > 0;
    const hasLessons = hasModules && courseState.modules.some(m => (m.lessons || []).length > 0);
    const hasPrereq = (courseState.prerequisites || []).length > 0;
    const hasSkills = (courseState.skills_taught || []).length > 0;

    const checklistItems = [
        { label: 'Basic Info & Title Completed', pass: title.length > 3 },
        { label: 'Short Description Provided', pass: shortDesc.length > 10 },
        { label: 'At least 1 Curriculum Module added', pass: hasModules },
        { label: 'At least 1 Lesson added in Curriculum', pass: hasLessons },
        { label: 'Prerequisites specified', pass: hasPrereq },
        { label: 'Target Skills Taught specified', pass: hasSkills }
    ];

    const passedCount = checklistItems.filter(i => i.pass).length;
    const score = Math.round((passedCount / checklistItems.length) * 100);

    const scoreEl = document.getElementById('completenessScore');
    const progressEl = document.getElementById('completenessProgressBar');
    if (scoreEl) scoreEl.textContent = `${score}%`;
    if (progressEl) progressEl.style.width = `${score}%`;

    const checklistContainer = document.getElementById('publishingChecklist');
    if (checklistContainer) {
        checklistContainer.innerHTML = checklistItems.map(item => `
            <li style="display: flex; align-items: center; gap: 0.5rem; color: ${item.pass ? '#059669' : '#94A3B8'};">
                <i class="fa-solid ${item.pass ? 'fa-circle-check text-success' : 'fa-circle-dot'}"></i>
                <span style="${item.pass ? 'font-weight:600;' : ''}">${escapeHtml(item.label)}</span>
            </li>
        `).join('');
    }

    return { score, passedCount, total: checklistItems.length };
}

// --- SAVE STUDIO CONTENT ---
/**
 * Validates course studio inputs and submits create or update payload to backend API.
 * @param {boolean} isDraft - True if saving as draft, False if submitting for publication.
 * Purpose: Calls window.api.createCourse or window.api.updateCourse with serialized curriculum.
 */
// ==========================================
// VALIDATION & COURSE SUBMISSION
// ==========================================
async function saveCourseStudio(courseId) {
    const saveBtn = document.getElementById('saveStudioBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Saving...`;
    }

    try {
        const payload = {
            title: document.getElementById('courseTitle').value.trim(),
            category: document.getElementById('courseCategory').value,
            subcategory: document.getElementById('courseSubcategory').value.trim(),
            difficulty: document.getElementById('courseDifficulty').value,
            duration: document.getElementById('courseDuration').value.trim(),
            language: document.getElementById('courseLanguage').value.trim(),
            short_description: document.getElementById('courseShortDesc').value.trim(),
            detailed_description: document.getElementById('courseDetailedDesc').value.trim(),
            is_free: document.getElementById('priceTypeFree').checked ? 1 : 0,
            price: document.getElementById('priceTypeFree').checked ? 0.0 : Math.max(0, parseFloat(document.getElementById('coursePrice').value) || 0.0),
            currency: 'INR',
            demo_video_url: document.getElementById('demoVideoUrl').value.trim(),
            prerequisites: courseState.prerequisites,
            technical_requirements: courseState.technical_requirements,
            recommended_knowledge: courseState.recommended_knowledge,
            skills_taught: courseState.skills_taught,
            target_roles: courseState.target_roles,
            target_career_goals: courseState.target_career_goals,
            modules: courseState.modules
        };

        const res = await window.api.updateCourseContent(courseId, payload);
        courseState = { ...courseState, ...payload };
        updateStudioHeaderAndValidation();
        alert(res.message || 'Course studio changes saved successfully!');
    } catch (err) {
        alert('Failed to save course changes: ' + (err.message || err));
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk mr-1"></i> Save Changes`;
        }
    }
}

// --- PUBLISH / UNPUBLISH TOGGLE ---
window.handleStudioTogglePublish = async function() {
    const isCurrentlyPublished = (courseState.status || '').toLowerCase() === 'published';
    const newStatus = isCurrentlyPublished ? 'draft' : 'published';

    if (!isCurrentlyPublished) {
        const { score } = updateStudioHeaderAndValidation();
        if (score < 50) {
            if (!confirm(`Your course completeness score is ${score}%. We recommend filling in more course details before publishing. Publish anyway?`)) {
                return;
            }
        }
    }

    try {
        // Save first then update status
        await saveCourseStudio(courseState.id);
        const res = await window.api.updateCourseStatus(courseState.id, newStatus);
        courseState.status = newStatus;
        updateStudioHeaderAndValidation();
        alert(`Course successfully ${newStatus === 'published' ? 'published to Public Catalog' : 'moved to draft'}!`);
    } catch (err) {
        alert('Failed to update publication status: ' + (err.message || err));
    }
};

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
