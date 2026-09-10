// SmartLearn Course Player Logic
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Auth check
    const user = window.api.getCurrentUser();
    if (!user) {
        window.location.replace('../login.html');
        return;
    }

    const nameEls = document.querySelectorAll('#topName');
    const avatarEls = document.querySelectorAll('#topAvatar');
    nameEls.forEach(el => el.textContent = user.name || user.full_name || 'Student');
    const initials = (user.name || user.full_name || 'ST').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    avatarEls.forEach(el => el.textContent = initials);

    // 2. Parse course ID & initial lesson ID
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('id');
    const initialLessonId = urlParams.get('lesson');

    if (!courseId) {
        alert('No course ID specified.');
        window.location.replace('my-courses.html');
        return;
    }

    // 3. Load Player Data
    await initCoursePlayer(courseId, initialLessonId);
});

// Player State
let playerData = null;
let flatLessons = [];
let currentLesson = null;
let quizUserAnswers = {};

async function initCoursePlayer(courseId, targetLessonId) {
    try {
        const data = await window.api.getCoursePlayer(courseId);
        playerData = data;
        playerData.id = Number(data.id || data.course_id || courseId);

        document.getElementById('playerCourseTitle').textContent = data.title || 'Course';

        // Flatten all lessons across modules for easy indexing & navigation
        flatLessons = [];
        (data.modules || []).forEach((m, mIdx) => {
            (m.lessons || []).forEach((l, lIdx) => {
                const lid = Number(l.lesson_id !== undefined ? l.lesson_id : (l.id !== undefined ? l.id : (lIdx + 1)));
                flatLessons.push({
                    ...l,
                    lesson_id: lid,
                    moduleId: m.module_id || (mIdx + 1),
                    moduleTitle: m.title || `Module ${mIdx + 1}`,
                    moduleMaterials: m.materials || ''
                });
            });
        });

        if (flatLessons.length === 0) {
            document.getElementById('lessonViewerCard').innerHTML = `
                <div style="text-align:center; padding:3rem; color:#64748b;">
                    <i class="fa-solid fa-book-open fa-3x mb-3" style="color:#CBD5E1;"></i>
                    <h3 style="color:#1E293B; margin-bottom:0.5rem;">No lessons available</h3>
                    <p style="margin:0;">The instructor has not published any lessons for this curriculum yet.</p>
                </div>
            `;
            return;
        }

        // Standardize completed_lesson_ids to numbers
        if (playerData.completed_lesson_ids) {
            playerData.completed_lesson_ids = playerData.completed_lesson_ids.map(Number);
        } else {
            playerData.completed_lesson_ids = [];
        }

        // Determine active lesson: targetLessonId or last_lesson_id or first uncompleted or first lesson
        let activeId = targetLessonId ? parseInt(targetLessonId, 10) : null;
        if (!activeId && data.last_lesson_id) {
            activeId = Number(data.last_lesson_id);
        }
        if (!activeId) {
            const firstUnfinished = flatLessons.find(l => !playerData.completed_lesson_ids.includes(l.lesson_id));
            activeId = firstUnfinished ? firstUnfinished.lesson_id : flatLessons[0].lesson_id;
        }

        // Bind Nav buttons
        const prevBtn = document.getElementById('prevLessonBtn');
        const nextBtn = document.getElementById('nextLessonBtn');
        const completeBtn = document.getElementById('completeLessonBtn');

        if (prevBtn) prevBtn.addEventListener('click', navigatePrevLesson);
        if (nextBtn) nextBtn.addEventListener('click', navigateNextLesson);
        if (completeBtn) completeBtn.addEventListener('click', handleMarkComplete);

        // Render Sidebar and Initial Lesson
        renderProgressSummary();
        renderCurriculumTree();
        selectLesson(activeId);

    } catch (err) {
        console.error('Error in initCoursePlayer:', err);
        document.getElementById('lessonViewerCard').innerHTML = `
            <div style="text-align:center; padding:3rem; color:#EF4444;">
                <i class="fa-solid fa-circle-exclamation fa-3x mb-3"></i>
                <h3 style="margin-bottom:0.5rem;">Unable to load course player</h3>
                <p style="color:#64748b; margin-bottom:1.5rem;">${escapeHtml(err.message)}</p>
                <a href="course-details.html?id=${courseId}" class="btn-primary" style="display:inline-block; text-decoration:none; padding:0.65rem 1.4rem; border-radius:8px;">View Course Details</a>
            </div>
        `;
    }
}

// --- RENDER SIDEBAR & PROGRESS ---
function renderProgressSummary() {
    if (!playerData) return;
    const completedIds = playerData.completed_lesson_ids || [];
    const total = flatLessons.length;
    const percent = total > 0 ? Math.min(100, Math.round((completedIds.length / total) * 100)) : 0;

    const percentEl = document.getElementById('playerProgressPercent');
    const barEl = document.getElementById('playerProgressBar');
    if (percentEl) percentEl.textContent = `${percent}% (${completedIds.length}/${total})`;
    if (barEl) barEl.style.width = `${percent}%`;
}

function renderCurriculumTree() {
    const treeContainer = document.getElementById('playerCurriculumTree');
    if (!treeContainer || !playerData) return;

    const completedIds = playerData.completed_lesson_ids || [];

    treeContainer.innerHTML = (playerData.modules || []).map((m, mIdx) => {
        const lessons = m.lessons || [];
        return `
            <div class="player-module-box">
                <div class="player-module-head">
                    <span style="display:flex; align-items:center; gap:0.4rem;">
                        <i class="fa-solid fa-folder-open" style="color:#7C3AED; font-size:12px;"></i>
                        <span>${escapeHtml(m.title || `Module ${mIdx + 1}`)}</span>
                    </span>
                    <span style="font-size:11px; color:#64748b; font-weight:500;">${lessons.length} lessons</span>
                </div>
                <div>
                    ${lessons.map((l, lIdx) => {
                        const lId = Number(l.lesson_id !== undefined ? l.lesson_id : (l.id !== undefined ? l.id : (lIdx + 1)));
                        const isCompleted = completedIds.includes(lId);
                        const isActive = currentLesson && currentLesson.lesson_id === lId;
                        const typeIcon = l.type === 'video' ? 'fa-circle-play' : (l.type === 'quiz' ? 'fa-clipboard-question' : (l.type === 'document' ? 'fa-file-pdf' : (l.type === 'article' ? 'fa-newspaper' : 'fa-arrow-up-right-from-square')));

                        return `
                            <div class="player-lesson-row ${isActive ? 'active' : ''}" onclick="selectLesson(${lId})">
                                <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                    <i class="fa-solid fa-circle-check lesson-status-icon ${isCompleted ? 'completed' : ''}"></i>
                                    <span style="font-weight: ${isActive ? '700' : '500'};">${escapeHtml(l.title || `Lesson ${lIdx + 1}`)}</span>
                                </div>
                                <span style="font-size: 11px; color: #94A3B8; margin-left: 0.5rem;"><i class="fa-solid ${typeIcon}"></i></span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');
}

// --- SELECT & RENDER LESSON ---
function selectLesson(lessonId) {
    const target = flatLessons.find(l => l.lesson_id === Number(lessonId));
    if (!target) return;

    currentLesson = target;
    quizUserAnswers = {};

    // Update active highlight in curriculum tree
    renderCurriculumTree();

    // Render Lesson Viewer
    renderLessonViewer(target);

    // Update Bottom Nav State
    updateNavButtons();
}

function parseVideoEmbed(url) {
    if (!url) return null;
    const cleanUrl = url.trim();

    // YouTube regex
    const ytMatch = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
    if (ytMatch && ytMatch[1]) {
        return `<iframe src="https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0&rel=0" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%; aspect-ratio:16/9; border-radius:10px; border:none; display:block;"></iframe>`;
    }

    // Vimeo regex
    const vimeoMatch = cleanUrl.match(/(?:vimeo\.com\/)(\d+)/i);
    if (vimeoMatch && vimeoMatch[1]) {
        return `<iframe src="https://player.vimeo.com/video/${vimeoMatch[1]}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="width:100%; aspect-ratio:16/9; border-radius:10px; border:none; display:block;"></iframe>`;
    }

    // Direct uploaded or absolute video file
    const resolvedUrl = cleanUrl.startsWith('/uploads/') ? 'http://127.0.0.1:8080' + cleanUrl : cleanUrl;
    return `<video controls autoplay style="width:100%; max-height:480px; aspect-ratio:16/9; border-radius:10px; background:#000; display:block;" src="${escapeHtml(resolvedUrl)}"></video>`;
}

function renderLessonViewer(lesson) {
    const container = document.getElementById('lessonViewerCard');
    if (!container) return;

    const type = lesson.type || 'video';
    const isCompleted = (playerData.completed_lesson_ids || []).includes(lesson.lesson_id);

    let contentHtml = '';

    if (type === 'video') {
        const embedHtml = parseVideoEmbed(lesson.video_url);

        contentHtml = `
            <div style="margin-bottom: 1rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; flex-wrap:wrap; gap:0.5rem;">
                    <div>
                        <span style="font-size:12px; color:#4F46E5; font-weight:700; text-transform:uppercase;">${escapeHtml(lesson.moduleTitle)}</span>
                        <h2 style="font-size:1.3rem; color:var(--dark-navy); margin:0.2rem 0 0 0; font-weight:800;">${escapeHtml(lesson.title)}</h2>
                    </div>
                    <span style="font-size:12px; color:#64748b; background:#F1F5F9; padding:4px 10px; border-radius:6px; font-weight:600;"><i class="fa-solid fa-clock mr-1"></i> ${escapeHtml(lesson.duration || '20 mins')}</span>
                </div>

                ${embedHtml ? `
                    <div style="background:#000; border-radius:10px; overflow:hidden; box-shadow:0 4px 15px rgba(0,0,0,0.1); margin-bottom:1.25rem;">
                        ${embedHtml}
                    </div>
                ` : `
                    <div style="background:#F8FAFC; border:1px dashed #CBD5E1; border-radius:10px; padding:2.5rem 1rem; text-align:center; color:#64748b; margin-bottom:1.25rem;">
                        <i class="fa-solid fa-video-slash fa-2x mb-2" style="color:#94A3B8;"></i>
                        <p style="margin:0; font-weight:500;">No video stream URL provided for this lesson.</p>
                    </div>
                `}

                ${lesson.content ? `
                    <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:1.15rem; font-size:13.5px; line-height:1.6; color:#334155; margin-bottom:1rem;">
                        <h4 style="margin:0 0 0.5rem 0; font-size:13px; color:#1E293B; font-weight:700;"><i class="fa-solid fa-align-left mr-1" style="color:#4F46E5;"></i> Lesson Overview:</h4>
                        ${escapeHtml(lesson.content)}
                    </div>
                ` : ''}

                ${renderLessonMaterialsSection(lesson)}
            </div>
        `;
    } else if (type === 'article') {
        contentHtml = `
            <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; border-bottom:1px solid #F1F5F9; padding-bottom:0.75rem;">
                    <div>
                        <span style="font-size:12px; color:#4F46E5; font-weight:700; text-transform:uppercase;">${escapeHtml(lesson.moduleTitle)}</span>
                        <h2 style="font-size:1.3rem; color:var(--dark-navy); margin:0.2rem 0 0 0; font-weight:800;">${escapeHtml(lesson.title)}</h2>
                    </div>
                    <span style="font-size:12px; color:#64748b; background:#F1F5F9; padding:4px 10px; border-radius:6px; font-weight:600;"><i class="fa-solid fa-book-open mr-1"></i> Reading (${escapeHtml(lesson.duration || '15 mins')})</span>
                </div>

                <div style="line-height:1.8; font-size:14px; color:#1E293B; background:#FAFAFC; border:1px solid #E2E8F0; border-radius:10px; padding:1.5rem; white-space:pre-wrap; margin-bottom:1.25rem;">
                    ${escapeHtml(lesson.article_content || lesson.content || 'No article content provided.')}
                </div>

                ${renderLessonMaterialsSection(lesson)}
            </div>
        `;
    } else if (type === 'document') {
        const docUrl = lesson.document_url 
            ? (lesson.document_url.startsWith('/uploads/') ? 'http://127.0.0.1:8080' + lesson.document_url : lesson.document_url)
            : '';

        contentHtml = `
            <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
                    <div>
                        <span style="font-size:12px; color:#4F46E5; font-weight:700; text-transform:uppercase;">${escapeHtml(lesson.moduleTitle)}</span>
                        <h2 style="font-size:1.3rem; color:var(--dark-navy); margin:0.2rem 0 0 0; font-weight:800;">${escapeHtml(lesson.title)}</h2>
                    </div>
                    <span style="font-size:12px; color:#64748b; background:#F1F5F9; padding:4px 10px; border-radius:6px; font-weight:600;"><i class="fa-solid fa-file-pdf mr-1"></i> PDF Document</span>
                </div>

                <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; padding:2rem; text-align:center; margin-bottom:1.25rem;">
                    <i class="fa-solid fa-file-pdf fa-3x" style="color:#EF4444; margin-bottom:0.75rem;"></i>
                    <h3 style="color:#1E293B; margin-bottom:0.35rem; font-size:1.1rem;">Curriculum Document & Lecture Notes</h3>
                    <p style="font-size:13px; color:#64748b; margin-bottom:1.25rem;">Download or view the accompanying PDF documentation for this lesson.</p>
                    
                    ${docUrl ? `
                        <a href="${escapeHtml(docUrl)}" target="_blank" class="btn-primary" style="display:inline-flex; align-items:center; gap:0.5rem; text-decoration:none; padding:0.65rem 1.5rem; font-weight:700; border-radius:8px; font-size:13px;">
                            <i class="fa-solid fa-download"></i> Open / Download PDF
                        </a>
                    ` : `<p style="color:#94A3B8; font-size:13px;">No document link attached.</p>`}
                </div>

                ${renderLessonMaterialsSection(lesson)}
            </div>
        `;
    } else if (type === 'external') {
        contentHtml = `
            <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
                    <div>
                        <span style="font-size:12px; color:#4F46E5; font-weight:700; text-transform:uppercase;">${escapeHtml(lesson.moduleTitle)}</span>
                        <h2 style="font-size:1.3rem; color:var(--dark-navy); margin:0.2rem 0 0 0; font-weight:800;">${escapeHtml(lesson.title)}</h2>
                    </div>
                    <span style="font-size:12px; color:#64748b; background:#F1F5F9; padding:4px 10px; border-radius:6px; font-weight:600;"><i class="fa-solid fa-arrow-up-right-from-square mr-1"></i> External</span>
                </div>

                <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; padding:1.75rem; margin-bottom:1.25rem;">
                    <h4 style="color:#1E293B; margin-bottom:0.35rem; font-size:13.5px;"><i class="fa-solid fa-compass mr-1" style="color:#4F46E5;"></i> Recommended External Resource</h4>
                    <p style="font-size:13.5px; color:#475569; margin-bottom:1rem;">${escapeHtml(lesson.notes || lesson.content || 'Please visit the following link to review the external materials or interactive playground.')}</p>
                    
                    ${lesson.external_url ? `
                        <a href="${escapeHtml(lesson.external_url)}" target="_blank" class="btn-primary" style="display:inline-flex; align-items:center; gap:0.5rem; text-decoration:none; padding:0.6rem 1.4rem; font-weight:700; border-radius:8px; font-size:13px;">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> Open External Link
                        </a>
                    ` : `<span style="color:#94A3B8; font-size:13px;">No URL provided</span>`}
                </div>

                ${renderLessonMaterialsSection(lesson)}
            </div>
        `;
    } else if (type === 'quiz') {
        const questions = lesson.quiz_questions || [];
        contentHtml = `
            <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem; border-bottom:1px solid #F1F5F9; padding-bottom:0.75rem;">
                    <div>
                        <span style="font-size:12px; color:#4F46E5; font-weight:700; text-transform:uppercase;">${escapeHtml(lesson.moduleTitle)}</span>
                        <h2 style="font-size:1.3rem; color:var(--dark-navy); margin:0.2rem 0 0 0; font-weight:800;">${escapeHtml(lesson.title)}</h2>
                    </div>
                    <span style="font-size:12px; color:#64748b; background:#F1F5F9; padding:4px 10px; border-radius:6px; font-weight:600;"><i class="fa-solid fa-clipboard-question mr-1"></i> Quiz (${questions.length} Questions)</span>
                </div>

                <div id="quizResultBox" style="display:none; margin-bottom:1.25rem; padding:1.15rem; border-radius:8px;"></div>

                <form id="activeQuizForm" onsubmit="event.preventDefault(); submitActiveQuiz();">
                    ${questions.map((q, qIdx) => `
                        <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; padding:1.15rem; margin-bottom:1rem;">
                            <div style="font-weight:700; font-size:14px; color:#1E293B; margin-bottom:0.65rem;">
                                ${qIdx + 1}. ${escapeHtml(q.question || '')}
                            </div>
                            <div style="display:flex; flex-direction:column; gap:0.35rem;">
                                ${(q.options || []).map((opt, oIdx) => `
                                    <button type="button" class="quiz-choice-btn" id="optBtn_${qIdx}_${oIdx}" onclick="selectQuizOption(${qIdx}, ${oIdx})">
                                        <i class="fa-regular fa-circle" id="optRadio_${qIdx}_${oIdx}" style="color:#94A3B8;"></i>
                                        <span>${escapeHtml(opt)}</span>
                                    </button>
                                `).join('')}
                            </div>
                            <div id="qExplain_${qIdx}" style="display:none; font-size:12px; margin-top:0.5rem; padding:0.45rem 0.65rem; border-radius:6px; background:#EDE9FE; color:#5B21B6;"></div>
                        </div>
                    `).join('')}

                    <div style="text-align:right; margin-top:1.25rem;">
                        <button type="submit" id="submitQuizBtn" class="btn-primary" style="padding:0.65rem 1.75rem; font-size:13px; font-weight:700; border-radius:8px;">
                            <i class="fa-solid fa-paper-plane mr-1"></i> Submit Quiz & Verify
                        </button>
                    </div>
                </form>
            </div>
        `;
    }

    container.innerHTML = contentHtml;

    // Update Mark Complete button text/style
    const completeBtn = document.getElementById('completeLessonBtn');
    if (completeBtn) {
        if (isCompleted) {
            completeBtn.style.background = '#ECFDF5';
            completeBtn.style.color = '#059669';
            completeBtn.style.border = '1px solid #A7F3D0';
            completeBtn.innerHTML = `<i class="fa-solid fa-circle-check mr-1"></i> Completed ✓`;
        } else {
            completeBtn.style.background = '#5B3FE8';
            completeBtn.style.color = '#FFFFFF';
            completeBtn.style.border = 'none';
            completeBtn.innerHTML = `<i class="fa-solid fa-circle-check mr-1"></i> Mark as Complete`;
        }
    }
}

function renderLessonMaterialsSection(lesson) {
    const materials = lesson.materials || lesson.moduleMaterials;
    if (!materials) return '';

    let items = [];
    if (Array.isArray(materials)) {
        items = materials;
    } else if (typeof materials === 'string' && materials.trim()) {
        const str = materials.trim();
        const isUrl = str.startsWith('http://') || str.startsWith('https://') || str.startsWith('/uploads/');
        let type = 'link';
        let name = 'Resource Material';
        if (str.includes('github.com')) {
            type = 'github';
            name = 'GitHub Starter Repository';
        } else if (str.endsWith('.pdf') || str.includes('pdf')) {
            type = 'pdf';
            name = 'Course Lecture Slides (PDF)';
        }
        items.push({ name, url: str, type, isUrl });
    }

    if (items.length === 0) return '';

    return `
        <div style="background:#FAF5FF; border:1px solid #EDE9FE; border-radius:10px; padding:1.15rem; margin-top:1.25rem;">
            <div style="font-weight:700; font-size:13px; color:#6B21A8; margin-bottom:0.6rem; display:flex; align-items:center; gap:0.4rem;">
                <i class="fa-solid fa-folder-open" style="color:#7C3AED;"></i> Lesson Materials & Downloads:
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:0.6rem;">
                ${items.map(item => {
                    const url = item.url || item;
                    const fullUrl = url.startsWith('/uploads/') ? 'http://127.0.0.1:8080' + url : url;
                    const name = item.name || 'Download Resource';
                    let icon = 'fa-solid fa-file-arrow-down';
                    if (item.type === 'github' || url.includes('github.com')) icon = 'fa-brands fa-github';
                    else if (item.type === 'pdf' || url.endsWith('.pdf')) icon = 'fa-solid fa-file-pdf';
                    else if (url.startsWith('http')) icon = 'fa-solid fa-arrow-up-right-from-square';

                    return `
                        <a href="${escapeHtml(fullUrl)}" target="_blank" style="display:inline-flex; align-items:center; gap:0.4rem; background:#FFFFFF; border:1px solid #DDD6FE; color:#5B21B6; font-size:12.5px; font-weight:600; padding:0.45rem 0.9rem; border-radius:6px; text-decoration:none; transition:all 0.15s ease;">
                            <i class="${icon}" style="color:#7C3AED;"></i>
                            <span>${escapeHtml(name)}</span>
                        </a>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// --- QUIZ INTERACTIVITY ---
window.selectQuizOption = function(qIdx, oIdx) {
    quizUserAnswers[qIdx] = oIdx;
    const questions = currentLesson.quiz_questions || [];
    (questions[qIdx].options || []).forEach((_, idx) => {
        const btn = document.getElementById(`optBtn_${qIdx}_${idx}`);
        const radioIcon = document.getElementById(`optRadio_${qIdx}_${idx}`);
        if (btn) {
            if (idx === oIdx) {
                btn.classList.add('selected');
                if (radioIcon) {
                    radioIcon.className = 'fa-solid fa-circle-dot';
                    radioIcon.style.color = '#4F46E5';
                }
            } else {
                btn.classList.remove('selected');
                if (radioIcon) {
                    radioIcon.className = 'fa-regular fa-circle';
                    radioIcon.style.color = '#94A3B8';
                }
            }
        }
    });
};

window.submitActiveQuiz = async function() {
    if (!currentLesson || !playerData) return;
    const questions = currentLesson.quiz_questions || [];
    const answers = [];

    for (let i = 0; i < questions.length; i++) {
        answers.push(quizUserAnswers[i] !== undefined ? quizUserAnswers[i] : -1);
    }

    const btn = document.getElementById('submitQuizBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Evaluating...`;
    }

    try {
        const res = await window.api.submitCourseLessonQuiz(Number(playerData.id), Number(currentLesson.lesson_id), answers);
        
        const resultBox = document.getElementById('quizResultBox');
        if (resultBox) {
            resultBox.style.display = 'block';
            if (res.passed) {
                resultBox.style.background = '#ECFDF5';
                resultBox.style.border = '1px solid #A7F3D0';
                resultBox.style.color = '#065F46';
                resultBox.innerHTML = `
                    <div style="font-weight:800; font-size:14px;"><i class="fa-solid fa-circle-check mr-1"></i> Passed! Score: ${res.score}% (${res.correct_count}/${res.total_questions})</div>
                    <p style="margin:0.25rem 0 0 0; font-size:12.5px;">Great job! You have passed this quiz and the lesson has been marked completed.</p>
                `;
            } else {
                resultBox.style.background = '#FEF2F2';
                resultBox.style.border = '1px solid #FECACA';
                resultBox.style.color = '#991B1B';
                resultBox.innerHTML = `
                    <div style="font-weight:800; font-size:14px;"><i class="fa-solid fa-circle-xmark mr-1"></i> Need 70% to pass. Score: ${res.score}% (${res.correct_count}/${res.total_questions})</div>
                    <p style="margin:0.25rem 0 0 0; font-size:12.5px;">Review the topic and try again to complete this lesson.</p>
                `;
            }
        }

        // Show explanations
        (res.details || []).forEach((d, idx) => {
            const expEl = document.getElementById(`qExplain_${idx}`);
            if (expEl && d.explanation) {
                expEl.style.display = 'block';
                expEl.innerHTML = `<strong>Explanation:</strong> ${escapeHtml(d.explanation)}`;
            }
        });

        // If passed, update completed list and progress in real time
        if (res.passed) {
            if (!playerData.completed_lesson_ids) playerData.completed_lesson_ids = [];
            const lId = Number(currentLesson.lesson_id);
            if (!playerData.completed_lesson_ids.includes(lId)) {
                playerData.completed_lesson_ids.push(lId);
            }
            renderProgressSummary();
            renderCurriculumTree();
        }

    } catch (err) {
        alert('Quiz submission failed: ' + (err.message || err));
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-paper-plane mr-1"></i> Submit Quiz & Verify`;
        }
    }
};

// --- MARK LESSON COMPLETE ---
async function handleMarkComplete() {
    if (!currentLesson || !playerData) return;

    try {
        const cId = Number(playerData.id);
        const lId = Number(currentLesson.lesson_id);
        
        await window.api.completeCourseLesson(cId, lId);
        
        if (!playerData.completed_lesson_ids) playerData.completed_lesson_ids = [];
        if (!playerData.completed_lesson_ids.includes(lId)) {
            playerData.completed_lesson_ids.push(lId);
        }

        renderProgressSummary();
        renderCurriculumTree();
        renderLessonViewer(currentLesson);

        // If not last lesson, automatically prompt/advance to next
        const currentIdx = flatLessons.findIndex(l => l.lesson_id === currentLesson.lesson_id);
        if (currentIdx < flatLessons.length - 1) {
            selectLesson(flatLessons[currentIdx + 1].lesson_id);
        }

    } catch (err) {
        console.error('Failed to mark lesson complete:', err);
        alert('Failed to update lesson progress: ' + (err.message || err));
    }
}

// --- NAVIGATION HELPERS ---
function updateNavButtons() {
    const currentIdx = flatLessons.findIndex(l => l.lesson_id === currentLesson.lesson_id);
    const prevBtn = document.getElementById('prevLessonBtn');
    const nextBtn = document.getElementById('nextLessonBtn');

    if (prevBtn) {
        prevBtn.disabled = currentIdx <= 0;
        prevBtn.style.opacity = currentIdx <= 0 ? '0.5' : '1';
    }
    if (nextBtn) {
        nextBtn.disabled = currentIdx >= flatLessons.length - 1;
        nextBtn.style.opacity = currentIdx >= flatLessons.length - 1 ? '0.5' : '1';
    }
}

function navigatePrevLesson() {
    const currentIdx = flatLessons.findIndex(l => l.lesson_id === currentLesson.lesson_id);
    if (currentIdx > 0) {
        selectLesson(flatLessons[currentIdx - 1].lesson_id);
    }
}

function navigateNextLesson() {
    const currentIdx = flatLessons.findIndex(l => l.lesson_id === currentLesson.lesson_id);
    if (currentIdx < flatLessons.length - 1) {
        selectLesson(flatLessons[currentIdx + 1].lesson_id);
    }
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
