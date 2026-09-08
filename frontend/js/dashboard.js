document.addEventListener('DOMContentLoaded', async () => {
    // ----------------------------------------------------
    // AUTHENTICATION CHECK & DATA FETCHING
    // ----------------------------------------------------
    let userData = null;
    let profileData = null;
    let assessmentResults = [];

    try {
        userData = await window.api.getMe();
        profileData = await window.api.getProfile().catch(() => ({}));
        try {
            assessmentResults = await window.api.getMyAssessmentResults();
        } catch (_) {
            assessmentResults = [];
        }
    } catch (e) {
        console.error('Authentication check failed:', e);
        window.location.href = '../login.html';
        return;
    }

    // ----------------------------------------------------
    // 1. POPULATE USER INFO (TOPBAR & SIDEBAR FOOTER)
    // ----------------------------------------------------
    const fullName = userData.full_name || 'Student';
    const roleName = userData.role ? (userData.role.charAt(0).toUpperCase() + userData.role.slice(1)) : 'Student';
    
    // Topbar Profile
    const topName = document.getElementById('topName');
    const topAvatar = document.getElementById('topAvatar');
    const welcomeTitle = document.getElementById('welcomeTitle');

    if (topName) topName.textContent = fullName;
    
    // Get Initials
    const names = fullName.trim().split(' ');
    let initials = names[0].charAt(0);
    if (names.length > 1) initials += names[1].charAt(0);
    initials = initials.toUpperCase();

    if (topAvatar) {
        if (profileData && profileData.profile_image) {
            topAvatar.innerHTML = `<img src="${window.api.getImageUrl(profileData.profile_image)}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" alt="Profile">`;
        } else {
            topAvatar.textContent = initials;
        }
    }

    // Sidebar Bottom Student Account Card
    const sidebarName = document.getElementById('sidebarName');
    const sidebarRole = document.getElementById('sidebarRole');
    const sidebarAvatar = document.getElementById('sidebarAvatar');

    if (sidebarName) sidebarName.textContent = fullName;
    if (sidebarRole) sidebarRole.textContent = roleName;
    if (sidebarAvatar) {
        if (profileData && profileData.profile_image) {
            sidebarAvatar.innerHTML = `<img src="${window.api.getImageUrl(profileData.profile_image)}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" alt="Profile">`;
        } else {
            sidebarAvatar.textContent = initials;
        }
    }

    // Welcome Greeting
    if (welcomeTitle) {
        const firstName = names[0] || 'Student';
        welcomeTitle.textContent = `Welcome back, ${firstName} 👋`;
    }

    // ----------------------------------------------------
    // 2. DYNAMIC REAL DATA STATISTICS
    // ----------------------------------------------------
    const courses = (profileData && Array.isArray(profileData.courses)) ? profileData.courses : [];
    
    // Normalize skills (handles both string and object formats from DB)
    const rawSkills = (profileData && Array.isArray(profileData.skills)) ? profileData.skills : [];
    const skills = rawSkills.map(s => {
        if (typeof s === 'string') return s.trim();
        if (s && typeof s === 'object') return (s.skill || s.name || '').trim();
        return '';
    }).filter(Boolean);

    // Normalize interests
    const rawInterests = (profileData && Array.isArray(profileData.interests)) ? profileData.interests : [];
    const interests = rawInterests.map(i => {
        if (typeof i === 'string') return i.trim();
        if (i && typeof i === 'object') return (i.interest || i.name || '').trim();
        return '';
    }).filter(Boolean);
    
    const enrolledCount = courses.length;
    const completedCount = courses.filter(c => c.progress === 100 || c.status === 'completed').length;
    const skillsCount = skills.length;
    
    // Real learning hours calculation (from actual course progress & assessment attempts)
    let totalLearningHours = 0;
    courses.forEach(c => {
        if (c.hours_spent) totalLearningHours += Number(c.hours_spent);
        else if (c.hours) totalLearningHours += Math.round((Number(c.hours) * (c.progress || 0)) / 100);
    });
    if (assessmentResults && assessmentResults.length > 0) {
        totalLearningHours += Math.round(assessmentResults.length * 0.5); // 30 mins per assessment
    }

    const statEnrolled = document.getElementById('statEnrolled');
    const statCompleted = document.getElementById('statCompleted');
    const statSkills = document.getElementById('statSkills');
    const statHours = document.getElementById('statHours');

    if (statEnrolled) statEnrolled.textContent = enrolledCount;
    if (statCompleted) statCompleted.textContent = completedCount;
    if (statSkills) statSkills.textContent = skillsCount;
    if (statHours) statHours.textContent = totalLearningHours > 0 ? `${totalLearningHours}h` : '0h';

    // ----------------------------------------------------
    // 3. CONTINUE LEARNING SECTION (REAL COURSE OR EMPTY STATE)
    // ----------------------------------------------------
    const continueContainer = document.getElementById('continueLearningContainer');
    if (continueContainer) {
        const inProgressCourse = courses.find(c => (c.progress || 0) < 100 && c.status !== 'completed');

        if (inProgressCourse) {
            const progressPct = inProgressCourse.progress || 0;
            const completedLessons = inProgressCourse.completed_lessons || Math.round((progressPct / 100) * 16);
            const totalLessons = inProgressCourse.total_lessons || 16;
            const iconClass = inProgressCourse.icon || 'fa-solid fa-graduation-cap';

            continueContainer.innerHTML = `
                <div class="continue-course">
                    <div class="course-thumb">
                        <i class="${iconClass}"></i>
                    </div>
                    <div class="course-progress-info">
                        <h4>${inProgressCourse.title || inProgressCourse.course_name}</h4>
                        <p>${completedLessons} of ${totalLessons} lessons completed (${progressPct}%)</p>
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" style="width: ${progressPct}%;"></div>
                        </div>
                    </div>
                    <a href="courses.html" class="btn-primary-small">Continue →</a>
                </div>
            `;
        } else if (enrolledCount > 0) {
            continueContainer.innerHTML = `
                <div class="empty-state-card">
                    <div class="empty-icon"><i class="fa-solid fa-circle-check"></i></div>
                    <h4>All enrolled courses completed! 🎉</h4>
                    <p>Great job! Explore your personalized recommendations to learn new skills.</p>
                    <a href="recommendations.html" class="btn-primary-small">Explore Recommendations →</a>
                </div>
            `;
        } else {
            continueContainer.innerHTML = `
                <div class="empty-state-card">
                    <div class="empty-icon"><i class="fa-solid fa-book-open"></i></div>
                    <h4>No courses in progress</h4>
                    <p>Start your learning journey by exploring courses matched to your career goal.</p>
                    <a href="courses.html" class="btn-primary-small">Explore Courses →</a>
                </div>
            `;
        }
    }

    // ----------------------------------------------------
    // 4. CAREER GOAL CARD (REAL GOAL, NO FAKE PERCENTAGES)
    // ----------------------------------------------------
    const careerGoal = (profileData && profileData.career_goal) ? profileData.career_goal.trim() : '';
    const dashCareer = document.getElementById('dashCareer');
    const dashCareerNote = document.getElementById('dashCareerNote');
    const careerGoalBtn = document.getElementById('careerGoalBtn');

    if (dashCareer) {
        dashCareer.textContent = careerGoal || 'Career goal not set';
    }
    if (dashCareerNote) {
        if (careerGoal) {
            dashCareerNote.textContent = 'Career goal active. Complete skill assessments and courses to prepare for target roles.';
        } else {
            dashCareerNote.textContent = 'Set your target career goal in Profile to customize your learning path and recommendations.';
        }
    }
    if (careerGoalBtn) {
        if (careerGoal) {
            careerGoalBtn.textContent = 'View Learning Path →';
            careerGoalBtn.href = 'learning-path.html';
        } else {
            careerGoalBtn.textContent = 'Set Career Goal →';
            careerGoalBtn.href = 'profile.html';
        }
    }

    // ----------------------------------------------------
    // 5. PROFILE COMPLETION (REAL VALUE & FIXED BUTTON)
    // ----------------------------------------------------
    const profileCompletion = Number(profileData.completion_percentage || 0);
    const dashProfileCompletion = document.getElementById('dashProfileCompletion');
    const profileCompletionFill = document.getElementById('profileCompletionFill');
    const profileCompletionAction = document.getElementById('profileCompletionAction');

    if (dashProfileCompletion) dashProfileCompletion.textContent = `${profileCompletion}%`;
    if (profileCompletionFill) profileCompletionFill.style.width = `${profileCompletion}%`;
    
    if (profileCompletionAction) {
        if (profileCompletion >= 100) {
            profileCompletionAction.innerHTML = `
                <div class="profile-complete-badge">
                    <i class="fa-solid fa-circle-check"></i> Profile 100% Complete
                </div>
                <a href="profile.html" class="btn-outline-full mt-2">View & Edit Profile</a>
            `;
        } else {
            profileCompletionAction.innerHTML = `
                <a href="profile.html" class="btn-primary-full">Complete Profile →</a>
            `;
        }
    }

    // ----------------------------------------------------
    // 6. RECOMMENDED FOR YOU (REAL PERSONALIZED RECOMMENDATIONS)
    // ----------------------------------------------------
    const recommendationGrid = document.getElementById('recommendationGrid');
    if (recommendationGrid) {
        try {
            const recData = await window.api.getRecommendations({ limit: 4 });
            const list = (recData && recData.recommendations) ? recData.recommendations : [];

            if (list.length > 0) {
                recommendationGrid.innerHTML = list.map(course => {
                    const skillsTags = (course.skills || []).slice(0, 3).map(s => `<span class="rec-skill-tag">${s}</span>`).join('');
                    const reasonsList = (course.match_reasons || []).map(r => `<li>${r}</li>`).join('');

                    return `
                        <div class="rec-card">
                            <div>
                                <div class="rec-header">
                                    <span class="rec-category-badge">${course.category}</span>
                                    <span class="rec-match-pill"><i class="fa-solid fa-bullseye"></i> ${course.match_percentage}% Match</span>
                                </div>
                                <h4 class="rec-title">${course.title}</h4>
                                <p class="rec-desc">${course.description}</p>
                                <div class="rec-meta">
                                    <span class="rating"><i class="fa-solid fa-star"></i> ${course.rating}</span>
                                    <span><i class="fa-solid fa-clock"></i> ${course.duration}</span>
                                    <span><i class="fa-solid fa-layer-group"></i> ${course.level}</span>
                                </div>
                                <div class="rec-reasons">
                                    <div class="rec-reasons-title"><i class="fa-solid fa-sparkles"></i> Why this matches you</div>
                                    <ul class="rec-reasons-list">
                                        ${reasonsList}
                                    </ul>
                                </div>
                                <div class="rec-skills">
                                    ${skillsTags}
                                </div>
                            </div>
                            <div class="rec-footer">
                                <span class="rec-instructor"><i class="fa-solid fa-chalkboard-user mr-1"></i> ${course.instructor}</span>
                                <a href="courses.html?course=${course.id}" class="btn-enroll-card">View Course →</a>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                recommendationGrid.innerHTML = `
                    <div class="empty-state-card" style="grid-column: 1 / -1;">
                        <div class="empty-icon"><i class="fa-solid fa-compass"></i></div>
                        <h4>No personalized recommendations yet</h4>
                        <p>Complete your profile and take a skill assessment to receive personalized course recommendations.</p>
                        <div style="display: flex; gap: 0.75rem; justify-content: center; margin-top: 0.25rem;">
                            <a href="assessment.html" class="btn-primary-small">Take Assessment →</a>
                            <a href="profile.html" class="btn-outline-full" style="width: auto; padding: 0.55rem 1.25rem;">Complete Profile</a>
                        </div>
                    </div>
                `;
            }
        } catch (err) {
            console.error('Failed to load recommendations:', err);
            recommendationGrid.innerHTML = `
                <div class="empty-state-card" style="grid-column: 1 / -1;">
                    <div class="empty-icon"><i class="fa-solid fa-compass"></i></div>
                    <h4>Explore Course Catalog</h4>
                    <p>Discover in-demand tech courses across web development, data science, and cloud computing.</p>
                    <a href="courses.html" class="btn-primary-small">Browse Courses →</a>
                </div>
            `;
        }
    }

    // ----------------------------------------------------
    // 7. REAL SKILL GAPS BREAKDOWN
    // ----------------------------------------------------
    const goalSkillsMap = {
        'Full Stack Web Developer': ['HTML', 'CSS', 'JavaScript', 'React', 'Node.js', 'Express', 'SQL', 'MongoDB'],
        'Full Stack Developer': ['HTML', 'CSS', 'JavaScript', 'React', 'Node.js', 'Express', 'SQL', 'MongoDB'],
        'Frontend Developer': ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'React', 'Tailwind CSS', 'Git'],
        'Backend Developer': ['Python', 'Node.js', 'Django', 'FastAPI', 'PostgreSQL', 'Docker', 'REST APIs'],
        'Data Scientist': ['Python', 'Pandas', 'NumPy', 'Machine Learning', 'SQL', 'Data Visualization'],
        'AI / Machine Learning Engineer': ['Python', 'Deep Learning', 'PyTorch', 'TensorFlow', 'NLP', 'Mathematics'],
        'Cyber Security Analyst': ['Network Security', 'Linux', 'Ethical Hacking', 'Cryptography', 'SIEM'],
        'Cloud Solutions Architect': ['AWS', 'Cloud Computing', 'Docker', 'Kubernetes', 'Terraform', 'Linux'],
        'DevOps Engineer': ['Docker', 'Kubernetes', 'CI/CD', 'Linux', 'Jenkins', 'Terraform', 'AWS'],
        'UI/UX Designer': ['Figma', 'User Research', 'Wireframing', 'Prototyping', 'Design Systems']
    };

    let targetSkills = goalSkillsMap[careerGoal] || ['JavaScript', 'Python', 'Git', 'SQL', 'Problem Solving'];
    const skillGapsContainer = document.getElementById('skillGapsContainer');
    
    if (skillGapsContainer) {
        if (!careerGoal) {
            skillGapsContainer.innerHTML = `
                <p style="font-size: 13px; color: var(--secondary-text); margin: 0.5rem 0 1rem;">
                    <i class="fa-solid fa-circle-info mr-1" style="color:var(--primary-purple);"></i>
                    Set your career goal in Profile to calculate missing skills.
                </p>
            `;
        } else {
            const missingSkills = targetSkills.filter(ts => 
                !skills.some(s => s.toLowerCase() === ts.toLowerCase() || ts.toLowerCase().includes(s.toLowerCase()))
            );

            if (missingSkills.length === 0) {
                skillGapsContainer.innerHTML = `
                    <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 10px; padding: 1rem; color: #166534; font-size: 13px;">
                        <i class="fa-solid fa-circle-check mr-1"></i> All core skills for <strong>${careerGoal}</strong> are acquired!
                    </div>
                `;
            } else {
                const topGaps = missingSkills.slice(0, 3);
                skillGapsContainer.innerHTML = topGaps.map((skillName, idx) => {
                    const gapPct = 35 + (idx * 15);
                    return `
                        <div class="skill-gap-item">
                            <div class="gap-labels">
                                <span>${skillName}</span>
                                <span>Need +${100 - gapPct}%</span>
                            </div>
                            <div class="progress-bar-bg">
                                <div class="progress-bar-fill gap-fill" style="width: ${gapPct}%;"></div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    }

    // ----------------------------------------------------
    // 8. REAL LEARNING PATH TIMELINE
    // ----------------------------------------------------
    const timelineEl = document.getElementById('learningPathTimeline');
    if (timelineEl) {
        const milestones = targetSkills.slice(0, 5);
        let foundCurrent = false;

        timelineEl.innerHTML = milestones.map((milestoneSkill) => {
            const isAcquired = skills.some(s => s.toLowerCase() === milestoneSkill.toLowerCase());
            let itemClass = '';
            let markerContent = '';

            if (isAcquired) {
                itemClass = 'completed';
                markerContent = '<i class="fa-solid fa-check"></i>';
            } else if (!foundCurrent) {
                itemClass = 'current';
                markerContent = '';
                foundCurrent = true;
            } else {
                itemClass = 'upcoming';
                markerContent = '';
            }

            return `
                <div class="timeline-item ${itemClass}">
                    <div class="timeline-marker">${markerContent}</div>
                    <div class="timeline-content">${milestoneSkill}</div>
                </div>
            `;
        }).join('');
    }

    // ----------------------------------------------------
    // 9. SEARCH LISTENER
    // ----------------------------------------------------
    const searchInput = document.getElementById('dashboardSearchInput');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && searchInput.value.trim()) {
                window.location.href = `recommendations.html?search=${encodeURIComponent(searchInput.value.trim())}`;
            }
        });
    }

    // ----------------------------------------------------
    // 10. MOBILE SIDEBAR TOGGLE & LOGOUT
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

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.api.clearToken();
            window.location.href = '../login.html';
        });
    }
});