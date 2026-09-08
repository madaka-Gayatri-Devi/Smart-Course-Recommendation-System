document.addEventListener('DOMContentLoaded', async () => {

    // ----------------------------------------------------
    // AUTHENTICATION & USER INITIALIZATION
    // ----------------------------------------------------
    let currentUser = null;
    let profileData = null;
    const topName = document.getElementById('topName');
    const topAvatar = document.getElementById('topAvatar');
    const sidebarName = document.getElementById('sidebarName');
    const sidebarRole = document.getElementById('sidebarRole');
    const sidebarAvatar = document.getElementById('sidebarAvatar');

    try {
        currentUser = await window.api.getMe();
        profileData = await window.api.getProfile().catch(() => ({}));

        const fullName = currentUser.full_name || 'Student';
        const roleName = currentUser.role ? (currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)) : 'Student';

        if (topName) topName.textContent = fullName;
        if (sidebarName) sidebarName.textContent = fullName;
        if (sidebarRole) sidebarRole.textContent = roleName;

        const names = fullName.trim().split(' ');
        let initials = names[0].charAt(0);
        if (names.length > 1) initials += names[1].charAt(0);
        initials = initials.toUpperCase();

        if (profileData && profileData.profile_image) {
            const imgUrl = window.api.getImageUrl(profileData.profile_image);
            if (topAvatar) topAvatar.innerHTML = `<img src="${imgUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" alt="Profile">`;
            if (sidebarAvatar) sidebarAvatar.innerHTML = `<img src="${imgUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" alt="Profile">`;
        } else {
            if (topAvatar) topAvatar.textContent = initials;
            if (sidebarAvatar) sidebarAvatar.textContent = initials;
        }
    } catch (err) {
        console.error('Not authenticated:', err);
        window.location.href = '../login.html';
        return;
    }

    // ----------------------------------------------------
    // STATE & DOM VIEWS
    // ----------------------------------------------------
    const viewCatalog = document.getElementById('viewCatalog');
    const viewActiveTest = document.getElementById('viewActiveTest');
    const viewResult = document.getElementById('viewResult');

    const assessmentsListContainer = document.getElementById('assessmentsListContainer');
    const historyListContainer = document.getElementById('historyListContainer');

    let activeAssessment = null;
    let currentQuestions = [];
    let currentQIndex = 0;
    let studentAnswers = {}; // { questionId: selectedIndex }
    let timerInterval = null;
    let remainingSeconds = 0;

    // ----------------------------------------------------
    // TIMER UTILITIES
    // ----------------------------------------------------
    function startTimer(durationMinutes) {
        if (timerInterval) clearInterval(timerInterval);
        remainingSeconds = (durationMinutes || 15) * 60;
        updateTimerDisplay();

        timerInterval = setInterval(() => {
            remainingSeconds--;
            updateTimerDisplay();
            if (remainingSeconds <= 0) {
                stopTimer();
                alert('Time is up! Submitting your assessment now...');
                triggerAssessmentSubmission();
            }
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function updateTimerDisplay() {
        const timerTextEl = document.getElementById('testTimerText');
        const timerBadgeEl = document.getElementById('testTimerBadge');
        if (!timerTextEl) return;

        const mins = Math.floor(Math.max(0, remainingSeconds) / 60);
        const secs = Math.max(0, remainingSeconds) % 60;
        timerTextEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        if (timerBadgeEl) {
            if (remainingSeconds <= 120) {
                timerBadgeEl.classList.remove('normal');
            } else {
                timerBadgeEl.classList.add('normal');
            }
        }
    }

    // ----------------------------------------------------
    // VIEW SWITCHER
    // ----------------------------------------------------
    function switchView(viewName) {
        if (viewCatalog) viewCatalog.style.display = viewName === 'catalog' ? 'block' : 'none';
        if (viewActiveTest) viewActiveTest.style.display = viewName === 'test' ? 'block' : 'none';
        if (viewResult) viewResult.style.display = viewName === 'result' ? 'block' : 'none';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ----------------------------------------------------
    // LOAD ASSESSMENTS & HISTORY
    // ----------------------------------------------------
    async function loadCatalog() {
        try {
            const assessments = await window.api.getAssessments();
            renderAssessments(assessments);

            const history = await window.api.getMyAssessmentResults();
            renderHistory(history);
        } catch (err) {
            console.error('Failed to load assessment catalog:', err);
            if (assessmentsListContainer) {
                assessmentsListContainer.innerHTML = `
                    <div style="background:#fef2f2; border:1px solid #fecaca; padding:1.5rem; border-radius:12px; color:#991b1b;">
                        <i class="fa-solid fa-circle-exclamation mr-2"></i> Failed to load assessments from server.
                    </div>
                `;
            }
        }
    }

    function renderAssessments(list) {
        if (!assessmentsListContainer) return;
        if (!list || list.length === 0) {
            assessmentsListContainer.innerHTML = '<p style="color: var(--secondary-text);">No assessments currently available.</p>';
            return;
        }

        assessmentsListContainer.innerHTML = '';
        list.forEach(item => {
            const card = document.createElement('div');
            card.className = 'assessment-card';
            card.innerHTML = `
                <div class="assessment-header">
                    <span class="assessment-category">${item.category || 'Skill Test'}</span>
                    <span style="font-size: 12.5px; font-weight: 700; color: #10b981;"><i class="fa-solid fa-circle-check mr-1"></i> Passing Score: ${item.passing_score || 60}%</span>
                </div>
                <h4 style="font-size: 18px; font-weight: 800; color: var(--dark-navy); margin-bottom: 0.4rem; letter-spacing:-0.2px;">${item.title}</h4>
                <p style="font-size: 13.5px; color: var(--secondary-text); margin-bottom: 1rem; line-height: 1.55;">${item.description}</p>
                
                <div class="assessment-meta">
                    <span><i class="fa-regular fa-circle-question" style="color:var(--primary-purple);"></i> ${item.total_questions} Questions</span>
                    <span><i class="fa-regular fa-clock" style="color:var(--primary-purple);"></i> ~${item.duration_minutes || 15} mins</span>
                    <span><i class="fa-solid fa-trophy" style="color:var(--magenta-pink);"></i> Multiple Choice</span>
                </div>

                <button type="button" class="btn-primary-small btn-start-assessment" data-id="${item.id}">
                    Start Assessment →
                </button>
            `;
            assessmentsListContainer.appendChild(card);
        });

        // Add start event listeners
        assessmentsListContainer.querySelectorAll('.btn-start-assessment').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                startAssessment(id);
            });
        });
    }

    function renderHistory(history) {
        if (!historyListContainer) return;
        if (!history || history.length === 0) {
            historyListContainer.innerHTML = '<p style="color: var(--secondary-text); font-size: 13px;">No previous assessment attempts recorded.</p>';
            return;
        }

        historyListContainer.innerHTML = '';
        history.forEach(item => {
            const isPassing = (item.percentage || 0) >= 60;
            const row = document.createElement('div');
            row.style.cssText = 'padding: 0.9rem 0; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;';
            row.innerHTML = `
                <div>
                    <h5 style="font-size: 13.5px; font-weight: 700; color: var(--dark-navy); margin-bottom: 0.2rem;">${item.assessment_title}</h5>
                    <span style="font-size: 12px; color: var(--secondary-text);">${item.submitted_at || 'Recent'}</span>
                </div>
                <div style="text-align: right;">
                    <span style="font-size: 15px; font-weight: 800; color: ${isPassing ? '#10b981' : '#ef4444'};">${item.percentage}%</span>
                    <div style="font-size: 11.5px; font-weight: 700; color: var(--primary-purple);">${item.performance_level}</div>
                </div>
            `;
            historyListContainer.appendChild(row);
        });
    }

    // ----------------------------------------------------
    // START & RENDER ACTIVE TEST
    // ----------------------------------------------------
    async function startAssessment(id) {
        try {
            const data = await window.api.getAssessment(id);
            activeAssessment = data;
            currentQuestions = data.questions || [];
            currentQIndex = 0;
            studentAnswers = {};

            if (currentQuestions.length === 0) {
                alert('This assessment has no questions configured yet.');
                return;
            }

            const activeTitleEl = document.getElementById('activeAssessmentTitle');
            const totalQNumEl = document.getElementById('totalQNum');

            if (activeTitleEl) activeTitleEl.textContent = data.title;
            if (totalQNumEl) totalQNumEl.textContent = currentQuestions.length;

            startTimer(data.duration_minutes || 15);
            renderQuestion();
            switchView('test');
        } catch (err) {
            console.error(err);
            alert('Failed to load assessment: ' + err.message);
        }
    }

    function renderQuestion() {
        const q = currentQuestions[currentQIndex];
        if (!q) return;

        const currentQNum = document.getElementById('currentQNum');
        const qBadgeNum = document.getElementById('qBadgeNum');
        const qPointsBadge = document.getElementById('qPointsBadge');
        const qText = document.getElementById('qText');
        const testProgressFill = document.getElementById('testProgressFill');
        const optionsContainer = document.getElementById('optionsContainer');

        const btnPrev = document.getElementById('btnPrevQuestion');
        const btnNext = document.getElementById('btnNextQuestion');
        const btnSubmit = document.getElementById('btnSubmitAssessment');

        if (currentQNum) currentQNum.textContent = currentQIndex + 1;
        if (qBadgeNum) qBadgeNum.textContent = `Question ${currentQIndex + 1}`;
        if (qPointsBadge) qPointsBadge.textContent = `+${q.points || 20} Points`;
        if (qText) qText.textContent = q.question_text;
        
        if (testProgressFill) {
            const pct = ((currentQIndex + 1) / currentQuestions.length) * 100;
            testProgressFill.style.width = pct + '%';
        }

        // Render Options (Inspired by Reference 5)
        if (optionsContainer) {
            optionsContainer.innerHTML = '';
            const selectedOpt = studentAnswers[q.id];

            (q.options || []).forEach((optText, idx) => {
                const isSelected = selectedOpt === idx;
                const optEl = document.createElement('div');
                optEl.className = `option-item ${isSelected ? 'selected' : ''}`;
                optEl.setAttribute('data-idx', idx);
                optEl.innerHTML = `
                    <div class="option-indicator">${isSelected ? '<i class="fa-solid fa-check"></i>' : String.fromCharCode(65 + idx)}</div>
                    <div>${optText}</div>
                `;
                optEl.addEventListener('click', () => {
                    studentAnswers[q.id] = idx;
                    renderQuestion();
                });
                optionsContainer.appendChild(optEl);
            });
        }

        // Navigation Buttons
        if (btnPrev) btnPrev.style.display = currentQIndex > 0 ? 'inline-flex' : 'none';
        
        const isLast = currentQIndex === currentQuestions.length - 1;
        if (btnNext) btnNext.style.display = isLast ? 'none' : 'inline-flex';
        if (btnSubmit) btnSubmit.style.display = isLast ? 'inline-flex' : 'none';
    }

    // Question Navigation Listeners
    document.getElementById('btnPrevQuestion')?.addEventListener('click', () => {
        if (currentQIndex > 0) {
            currentQIndex--;
            renderQuestion();
        }
    });

    document.getElementById('btnNextQuestion')?.addEventListener('click', () => {
        if (currentQIndex < currentQuestions.length - 1) {
            currentQIndex++;
            renderQuestion();
        }
    });

    document.getElementById('btnExitAssessment')?.addEventListener('click', () => {
        if (confirm('Are you sure you want to exit? Your progress will not be saved.')) {
            stopTimer();
            switchView('catalog');
            loadCatalog();
        }
    });

    // ----------------------------------------------------
    // SUBMIT ASSESSMENT & RENDER RESULT
    // ----------------------------------------------------
    async function triggerAssessmentSubmission() {
        stopTimer();
        const btnSubmit = document.getElementById('btnSubmitAssessment');
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Scoring...';
        }

        try {
            const result = await window.api.submitAssessment(activeAssessment.id, studentAnswers);
            renderResultView(result);
            switchView('result');
        } catch (err) {
            console.error(err);
            alert('Failed to submit assessment: ' + err.message);
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = 'Submit Assessment <i class="fa-solid fa-circle-check ml-2"></i>';
            }
        }
    }

    document.getElementById('btnSubmitAssessment')?.addEventListener('click', async () => {
        const answeredCount = Object.keys(studentAnswers).length;
        const totalCount = currentQuestions.length;

        if (answeredCount < totalCount) {
            const proceed = confirm(`You have answered ${answeredCount} of ${totalCount} questions. Submit anyway?`);
            if (!proceed) return;
        }

        await triggerAssessmentSubmission();
    });

    function renderResultView(res) {
        const resPercentage = document.getElementById('resPercentage');
        const resScoreFraction = document.getElementById('resScoreFraction');
        const resAssessmentTitle = document.getElementById('resAssessmentTitle');
        const resRecommendationNote = document.getElementById('resRecommendationNote');
        const resPerformanceLevel = document.getElementById('resPerformanceLevel');
        const resCorrectCount = document.getElementById('resCorrectCount');
        const resIncorrectCount = document.getElementById('resIncorrectCount');
        const resSubmittedDate = document.getElementById('resSubmittedDate');
        const resFeedbackList = document.getElementById('resFeedbackList');

        if (resPercentage) resPercentage.textContent = `${res.percentage}%`;
        if (resScoreFraction) resScoreFraction.textContent = `${res.score} / ${res.max_score}`;
        if (resAssessmentTitle) resAssessmentTitle.textContent = `${res.assessment_title} Completed!`;
        if (resRecommendationNote) resRecommendationNote.textContent = res.recommendation_note || 'Assessment evaluation complete.';
        if (resPerformanceLevel) resPerformanceLevel.textContent = res.performance_level || 'Evaluated';
        if (resCorrectCount) resCorrectCount.textContent = res.correct_count;
        if (resIncorrectCount) resIncorrectCount.textContent = res.incorrect_count;
        if (resSubmittedDate) resSubmittedDate.textContent = res.submitted_at ? res.submitted_at.split(' ')[0] : 'Today';

        // Render Feedback List with Explanations
        if (resFeedbackList && res.feedback) {
            resFeedbackList.innerHTML = '';
            res.feedback.forEach((item, index) => {
                const isCorrect = item.is_correct;
                const card = document.createElement('div');
                card.className = `feedback-item ${isCorrect ? 'correct' : 'incorrect'}`;
                
                const selectedText = item.selected_option !== undefined && item.selected_option !== null && item.options
                    ? item.options[item.selected_option] 
                    : '<span style="color:#ef4444;">Unanswered</span>';
                
                const correctText = item.options && item.options[item.correct_option] !== undefined
                    ? item.options[item.correct_option]
                    : 'N/A';

                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                        <span style="font-weight:700; font-size:14px; color:var(--dark-navy);">Question ${index + 1}</span>
                        <span style="font-size:12px; font-weight:700; color:${isCorrect ? '#10b981' : '#ef4444'};">
                            <i class="fa-solid ${isCorrect ? 'fa-circle-check' : 'fa-circle-xmark'} mr-1"></i>
                            ${isCorrect ? `+${item.points_earned} Points` : '0 Points'}
                        </span>
                    </div>
                    <p style="font-size:15px; font-weight:600; color:var(--dark-navy); margin-bottom:0.75rem;">${item.question_text}</p>
                    <div style="font-size:13.5px; margin-bottom:0.4rem;"><strong>Your Answer:</strong> <span style="color:${isCorrect ? '#10b981' : '#ef4444'};">${selectedText}</span></div>
                    ${!isCorrect ? `<div style="font-size:13.5px; color:#10b981; margin-bottom:0.4rem;"><strong>Correct Answer:</strong> ${correctText}</div>` : ''}
                    ${item.explanation ? `<div class="feedback-explanation"><strong>Explanation:</strong> ${item.explanation}</div>` : ''}
                `;
                resFeedbackList.appendChild(card);
            });
        }
    }

    // Retake & Back buttons
    document.getElementById('btnRetakeAssessment')?.addEventListener('click', () => {
        if (activeAssessment) {
            startAssessment(activeAssessment.id);
        }
    });

    document.getElementById('btnBackToCatalog')?.addEventListener('click', () => {
        switchView('catalog');
        loadCatalog();
    });

    // ----------------------------------------------------
    // SIDEBAR & LOGOUT
    // ----------------------------------------------------
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('dashboardSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (menuToggle && sidebar && overlay) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.add('active');
            overlay.classList.add('active');
        });
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
    }

    document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.api.clearToken();
        window.location.href = '../login.html';
    });

    // Initial Load
    loadCatalog();
});
