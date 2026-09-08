document.addEventListener('DOMContentLoaded', async () => {

    // ----------------------------------------------------
    // AUTHENTICATION & USER INITIALIZATION
    // ----------------------------------------------------
    let currentUser = null;
    let existingProfile = null;
    const topName = document.getElementById('topName');
    const topAvatar = document.getElementById('topAvatar');
    const sidebarName = document.getElementById('sidebarName');
    const sidebarRole = document.getElementById('sidebarRole');
    const sidebarAvatar = document.getElementById('sidebarAvatar');

    try {
        currentUser = await window.api.getMe();
        existingProfile = await window.api.getProfile().catch(() => ({}));

        const fullName = currentUser.full_name || 'Student';
        const roleName = currentUser.role ? (currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)) : 'Student';

        if (topName) topName.textContent = fullName;
        if (sidebarName) sidebarName.textContent = fullName;
        if (sidebarRole) sidebarRole.textContent = roleName;

        const names = fullName.trim().split(' ');
        let initials = names[0].charAt(0);
        if (names.length > 1) initials += names[1].charAt(0);
        initials = initials.toUpperCase();

        if (existingProfile && existingProfile.profile_image) {
            const imgUrl = window.api.getImageUrl(existingProfile.profile_image);
            if (topAvatar) topAvatar.innerHTML = `<img src="${imgUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" alt="Profile">`;
            if (sidebarAvatar) sidebarAvatar.innerHTML = `<img src="${imgUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" alt="Profile">`;
        } else {
            if (topAvatar) topAvatar.textContent = initials;
            if (sidebarAvatar) sidebarAvatar.textContent = initials;
        }
    } catch (err) {
        console.error('Not authenticated in profile:', err);
        window.location.href = '../login.html';
        return;
    }

    // ----------------------------------------------------
    // STATE & VARIABLES
    // ----------------------------------------------------
    const nameEl = document.getElementById('profileFullName');
    const emailEl = document.getElementById('profileEmail');
    const phoneEl = document.getElementById('profilePhone');
    const dobEl = document.getElementById('profileDob');
    const genderEl = document.getElementById('profileGender');
    const cityEl = document.getElementById('profileCity');
    const primaryCareerEl = document.getElementById('primaryCareer');
    const secondaryCareerEl = document.getElementById('secondaryCareer');
    
    // Avatar elements
    const avatarTrigger = document.getElementById('avatarUploadTrigger');
    const avatarInput = document.getElementById('profilePhotoInput');
    const avatarPreviewImg = document.getElementById('avatarPreviewImg');
    const avatarUploadIcon = document.getElementById('avatarUploadIcon');
    const avatarStatus = document.getElementById('avatarUploadStatus');
    let currentUploadedAvatarUrl = (existingProfile && existingProfile.profile_image) ? existingProfile.profile_image : '';

    if (nameEl && currentUser) nameEl.value = currentUser.full_name || '';
    if (emailEl && currentUser) emailEl.value = currentUser.email || '';
    if (phoneEl && existingProfile) phoneEl.value = existingProfile.phone || '';
    if (dobEl && existingProfile) dobEl.value = existingProfile.dob || '';
    if (genderEl && existingProfile) genderEl.value = existingProfile.gender || '';
    if (cityEl && existingProfile) cityEl.value = existingProfile.city || '';
    if (primaryCareerEl && existingProfile) primaryCareerEl.value = existingProfile.career_goal || '';
    if (secondaryCareerEl && existingProfile) secondaryCareerEl.value = existingProfile.secondary_career_goal || '';

    // Configured Skills Map: Map<skillName, { skill: string, level: string }>
    const configuredSkills = new Map();

    // ----------------------------------------------------
    // AVATAR UPLOAD HANDLER
    // ----------------------------------------------------
    if (avatarTrigger && avatarInput) {
        avatarTrigger.addEventListener('click', () => {
            avatarInput.click();
        });

        avatarInput.addEventListener('change', async function() {
            const file = this.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                alert('File size exceeds 5MB limit. Please choose a smaller image.');
                return;
            }

            // Local Preview immediately
            const reader = new FileReader();
            reader.onload = (e) => {
                if (avatarPreviewImg) {
                    avatarPreviewImg.src = e.target.result;
                    avatarPreviewImg.style.display = 'block';
                }
                if (avatarUploadIcon) avatarUploadIcon.style.display = 'none';
            };
            reader.readAsDataURL(file);

            if (avatarStatus) avatarStatus.textContent = 'Uploading photo...';

            try {
                const res = await window.api.uploadAvatar(file);
                currentUploadedAvatarUrl = res.relative_url || res.image_url;
                if (avatarStatus) avatarStatus.textContent = 'Photo uploaded successfully!';
            } catch (err) {
                console.error(err);
                if (avatarStatus) avatarStatus.textContent = 'Upload failed. Will save locally.';
            }
        });
    }

    // ----------------------------------------------------
    // SKILL PROFICIENCY RENDERING & MANAGEMENT
    // ----------------------------------------------------
    const selectedSkillsGrid = document.getElementById('selectedSkillsGrid');

    function renderConfiguredSkills() {
        if (!selectedSkillsGrid) return;
        selectedSkillsGrid.innerHTML = '';

        if (configuredSkills.size === 0) {
            selectedSkillsGrid.innerHTML = '<p style="color: var(--secondary-text); font-size: 13px; grid-column: 1/-1;">No skills selected yet. Click skill chips above or add custom skills.</p>';
            return;
        }

        configuredSkills.forEach((item, skillName) => {
            const card = document.createElement('div');
            card.className = 'skill-level-card';
            card.innerHTML = `
                <div class="skill-name">
                    <i class="fa-solid fa-code"></i>
                    <span>${skillName}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <select class="skill-level-select" data-skill="${skillName}">
                        <option value="Beginner" ${item.level === 'Beginner' ? 'selected' : ''}>Beginner</option>
                        <option value="Intermediate" ${item.level === 'Intermediate' ? 'selected' : ''}>Intermediate</option>
                        <option value="Advanced" ${item.level === 'Advanced' ? 'selected' : ''}>Advanced</option>
                        <option value="Expert" ${item.level === 'Expert' ? 'selected' : ''}>Expert</option>
                    </select>
                    <button type="button" class="btn-remove-skill" data-skill="${skillName}" title="Remove skill">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `;
            selectedSkillsGrid.appendChild(card);
        });

        // Add event listeners to selects and remove buttons
        selectedSkillsGrid.querySelectorAll('.skill-level-select').forEach(sel => {
            sel.addEventListener('change', function() {
                const sk = this.getAttribute('data-skill');
                if (configuredSkills.has(sk)) {
                    configuredSkills.get(sk).level = this.value;
                }
            });
        });

        selectedSkillsGrid.querySelectorAll('.btn-remove-skill').forEach(btn => {
            btn.addEventListener('click', function() {
                const sk = this.getAttribute('data-skill');
                removeSkill(sk);
            });
        });
    }

    function addSkill(skillName, level = 'Intermediate') {
        const cleanName = skillName.trim();
        if (!cleanName) return;
        configuredSkills.set(cleanName, { skill: cleanName, level });
        
        // Highlight in pool if exists
        document.querySelectorAll('#skill-pool .skill-chip').forEach(chip => {
            if (chip.textContent.trim().toLowerCase() === cleanName.toLowerCase()) {
                chip.classList.add('selected');
            }
        });

        renderConfiguredSkills();
    }

    function removeSkill(skillName) {
        configuredSkills.delete(skillName);
        // Unhighlight in pool
        document.querySelectorAll('#skill-pool .skill-chip').forEach(chip => {
            if (chip.textContent.trim().toLowerCase() === skillName.toLowerCase()) {
                chip.classList.remove('selected');
            }
        });
        renderConfiguredSkills();
    }

    // ----------------------------------------------------
    // LOAD EXISTING USER & PROFILE DATA
    // ----------------------------------------------------
    async function loadUserData() {
        try {
            const user = await window.api.getMe();
            if (nameEl) nameEl.value = user.full_name || '';
            if (emailEl) emailEl.value = user.email || '';
            
            const profile = await window.api.getProfile();
            if (profile && Object.keys(profile).length > 0) {
                if (phoneEl && profile.phone) phoneEl.value = profile.phone;
                if (dobEl && profile.dob) dobEl.value = profile.dob;
                if (genderEl && profile.gender) genderEl.value = profile.gender;
                if (cityEl && profile.city) cityEl.value = profile.city;
                
                // Photo
                if (profile.profile_image) {
                    currentUploadedAvatarUrl = profile.profile_image;
                    if (avatarPreviewImg) {
                        avatarPreviewImg.src = window.api.getImageUrl(profile.profile_image);
                        avatarPreviewImg.style.display = 'block';
                    }
                    if (avatarUploadIcon) avatarUploadIcon.style.display = 'none';
                }

                // Primary Career
                if (profile.career_goal) {
                    if (primaryCareerEl) primaryCareerEl.value = profile.career_goal;
                    document.querySelectorAll('.career-card-select').forEach(card => {
                        if (card.textContent.trim() === profile.career_goal) {
                            card.classList.add('selected');
                        } else {
                            card.classList.remove('selected');
                        }
                    });
                }

                // Secondary Career
                if (profile.secondary_career_goal) {
                    if (secondaryCareerEl) secondaryCareerEl.value = profile.secondary_career_goal;
                    document.querySelectorAll('.secondary-career-card-select').forEach(card => {
                        if (card.getAttribute('data-value') === profile.secondary_career_goal) {
                            card.classList.add('selected');
                        } else {
                            card.classList.remove('selected');
                        }
                    });
                }

                // Skills
                if (profile.skills && Array.isArray(profile.skills)) {
                    profile.skills.forEach(s => {
                        if (typeof s === 'string') {
                            addSkill(s, 'Intermediate');
                        } else if (s && typeof s === 'object' && s.skill) {
                            addSkill(s.skill, s.level || 'Intermediate');
                        }
                    });
                }

                // Interests
                if (profile.interests && Array.isArray(profile.interests)) {
                    document.querySelectorAll('#interest-pool .interest-chip').forEach(chip => {
                        const text = chip.textContent.trim();
                        if (profile.interests.some(i => text.includes(i) || i.includes(text))) {
                            chip.classList.add('selected');
                        }
                    });
                }

                // Languages
                if (profile.languages && Array.isArray(profile.languages)) {
                    document.querySelectorAll('#lang-pool .lang-chip').forEach(chip => {
                        const text = chip.textContent.trim();
                        if (profile.languages.includes(text)) {
                            chip.classList.add('selected');
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Authentication or profile load error:', error);
            window.location.href = 'login.html';
        }
    }
    
    loadUserData();

    // ----------------------------------------------------
    // WIZARD NAVIGATION STATE
    // ----------------------------------------------------
    let currentStep = 1;
    const totalSteps = 10;
    
    const nextBtn = document.getElementById('nextBtn');
    const prevBtn = document.getElementById('prevBtn');
    const submitWizardBtn = document.getElementById('submitWizardBtn');

    function updateWizardUI() {
        // Hide all steps
        document.querySelectorAll('.wizard-step').forEach(step => {
            step.classList.remove('active');
        });
        
        // Show current step
        const stepEl = document.getElementById(`step-${currentStep}`);
        if (stepEl) stepEl.classList.add('active');

        // Update Desktop Stepper
        document.querySelectorAll('.stepper-desktop .step-item').forEach(step => {
            const stepNum = parseInt(step.getAttribute('data-step'));
            step.classList.remove('active', 'completed');
            if (stepNum === currentStep) {
                step.classList.add('active');
                step.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            } else if (stepNum < currentStep) {
                step.classList.add('completed');
                const numEl = step.querySelector('.step-num');
                if (numEl && !numEl.innerHTML.includes('fa-check')) {
                    numEl.innerHTML = '<i class="fa-solid fa-check"></i>';
                }
            } else {
                const numEl = step.querySelector('.step-num');
                if (numEl && numEl.innerHTML.includes('fa-check')) {
                    numEl.innerHTML = stepNum;
                }
            }
        });
        
        // Update Mobile Stepper
        const mobStepNum = document.getElementById('mobStepNum');
        const mobStepName = document.getElementById('mobStepName');
        const mobProgressFill = document.getElementById('mobProgressFill');
        
        if (mobStepNum) mobStepNum.textContent = currentStep;
        if (mobProgressFill) mobProgressFill.style.width = (currentStep / totalSteps * 100) + '%';
        
        const stepNames = {
            1: 'Personal Information', 2: 'Education', 3: 'Skills & Proficiency',
            4: 'Interests & Languages', 5: 'Career Goals', 6: 'Experience',
            7: 'Projects', 8: 'Learning Preferences', 9: 'Documents & Courses', 10: 'Review & Complete'
        };
        if (mobStepName) mobStepName.textContent = stepNames[currentStep];
        
        // Update Desktop Completion Widget
        const compText = document.getElementById('compText');
        const compFill = document.getElementById('compFill');
        if (compText && compFill) {
            const pct = Math.round((currentStep / totalSteps) * 100);
            compText.textContent = pct + '%';
            compFill.style.width = pct + '%';
        }

        // Buttons
        if (currentStep === 1) {
            if (prevBtn) prevBtn.style.display = 'none';
        } else {
            if (prevBtn) prevBtn.style.display = 'block';
        }

        if (currentStep === totalSteps) {
            if (nextBtn) nextBtn.style.display = 'none';
            if (submitWizardBtn) submitWizardBtn.style.display = 'block';
            populateReview();
        } else {
            if (nextBtn) nextBtn.style.display = 'block';
            if (submitWizardBtn) submitWizardBtn.style.display = 'none';
        }
    }

    // ----------------------------------------------------
    // POPULATE REVIEW STEP 10
    // ----------------------------------------------------
    function populateReview() {
        // Personal
        const revName = document.getElementById('revName');
        const revEmail = document.getElementById('revEmail');
        const revPhone = document.getElementById('revPhone');
        const revDob = document.getElementById('revDob');
        const revCity = document.getElementById('revCity');
        
        if (revName) revName.textContent = nameEl?.value || '—';
        if (revEmail) revEmail.textContent = emailEl?.value || '—';
        if (revPhone) revPhone.textContent = phoneEl?.value || '—';
        if (revDob) revDob.textContent = dobEl?.value || '—';
        if (revCity) revCity.textContent = cityEl?.value || '—';

        // Education
        const revEduSummary = document.getElementById('revEduSummary');
        const eduEntries = document.querySelectorAll('#educationList .box-entry');
        if (revEduSummary) {
            const eduList = [];
            eduEntries.forEach(card => {
                const qual = card.querySelector('.edu-qualification')?.value;
                const inst = card.querySelector('.edu-institution')?.value;
                const spec = card.querySelector('.edu-specialization')?.value;
                const yr = card.querySelector('.edu-year')?.value;
                if (qual) {
                    eduList.push(`${qual} in ${spec || 'General'} from ${inst || 'University'} (${yr || 'N/A'})`);
                }
            });
            revEduSummary.innerHTML = eduList.length > 0 
                ? eduList.map(e => `<p style="margin-bottom: 0.3rem;"><i class="fa-solid fa-graduation-cap" style="color:var(--primary-purple); margin-right: 0.4rem;"></i>${e}</p>`).join('')
                : 'No education details entered';
        }

        // Skills with Proficiency
        const revSkillsSummary = document.getElementById('revSkillsSummary');
        if (revSkillsSummary) {
            if (configuredSkills.size > 0) {
                const skillBadges = [];
                configuredSkills.forEach((item, name) => {
                    skillBadges.push(`<span class="chip-sm" style="background: var(--light-lavender); color: var(--primary-purple); padding: 4px 10px; border-radius: 6px; display: inline-block; margin: 3px; font-size: 12px; font-weight: 600;">${name} <strong style="color: var(--magenta-pink);">(${item.level})</strong></span>`);
                });
                revSkillsSummary.innerHTML = skillBadges.join(' ');
            } else {
                revSkillsSummary.textContent = 'No skills configured';
            }
        }

        // Interests & Languages
        const revInterests = document.getElementById('revInterests');
        const revLanguages = document.getElementById('revLanguages');
        const selectedInterests = Array.from(document.querySelectorAll('#interest-pool .interest-chip.selected')).map(c => c.textContent.trim());
        const selectedLangs = Array.from(document.querySelectorAll('#lang-pool .lang-chip.selected')).map(c => c.textContent.trim());

        if (revInterests) revInterests.textContent = selectedInterests.length > 0 ? selectedInterests.join(', ') : 'None selected';
        if (revLanguages) revLanguages.textContent = selectedLangs.length > 0 ? selectedLangs.join(', ') : 'English';

        // Career Goals
        const revCareer = document.getElementById('revCareer');
        const revSecondaryCareer = document.getElementById('revSecondaryCareer');
        if (revCareer) revCareer.textContent = primaryCareerEl?.value || 'Not selected';
        if (revSecondaryCareer) revSecondaryCareer.textContent = secondaryCareerEl?.value || 'None (Optional)';

        // Experience & Projects
        const revExpSummary = document.getElementById('revExpSummary');
        const revProjSummary = document.getElementById('revProjSummary');
        const expCards = document.querySelectorAll('#experienceSection .box-entry');
        const hasExp = document.querySelector('input[name="hasExp"]:checked')?.value === 'yes';

        if (revExpSummary) {
            if (hasExp && expCards.length > 0) {
                const exps = [];
                expCards.forEach(c => {
                    const comp = c.querySelector('.exp-company')?.value;
                    const role = c.querySelector('.exp-role')?.value;
                    if (comp || role) exps.push(`${role || 'Role'} at ${comp || 'Company'}`);
                });
                revExpSummary.textContent = exps.length > 0 ? exps.join(' | ') : 'None added';
            } else {
                revExpSummary.textContent = 'None specified';
            }
        }

        const projCards = document.querySelectorAll('#projectSection .box-entry');
        if (revProjSummary) {
            const projs = [];
            projCards.forEach(c => {
                const title = c.querySelector('.proj-title')?.value;
                const type = c.querySelector('.proj-type')?.value;
                if (title) projs.push(`${title} (${type || 'Project'})`);
            });
            revProjSummary.textContent = projs.length > 0 ? projs.join(', ') : 'None added';
        }
    }

    // ----------------------------------------------------
    // NEXT BUTTON VALIDATION & NAVIGATION
    // ----------------------------------------------------
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const currentStepEl = document.getElementById(`step-${currentStep}`);
            if (!currentStepEl) return;
            
            let isStepValid = true;
            const inputs = currentStepEl.querySelectorAll('input[required], select[required]');
            
            inputs.forEach(input => {
                if (!input.value.trim()) {
                    isStepValid = false;
                    input.style.borderColor = '#e11d48';
                    input.addEventListener('input', function() {
                        this.style.borderColor = '';
                    }, { once: true });
                } else {
                    input.style.borderColor = '';
                }
            });

            if (currentStep === 3) {
                if (configuredSkills.size === 0) {
                    isStepValid = false;
                    const pool = document.getElementById('skill-pool');
                    if (pool) {
                        pool.style.border = '1px solid #e11d48';
                        pool.style.padding = '10px';
                        pool.style.borderRadius = '8px';
                        setTimeout(() => { pool.style.border = 'none'; pool.style.padding = '0'; }, 3000);
                    }
                    alert('Please select or add at least one skill.');
                }
            }

            if (currentStep === 4) {
                const selectedInterests = document.querySelectorAll('#interest-pool .interest-chip.selected');
                if (selectedInterests.length === 0) {
                    isStepValid = false;
                    alert('Please select at least one interest topic.');
                }
            }

            if (currentStep === 5) {
                if (!primaryCareerEl || !primaryCareerEl.value) {
                    isStepValid = false;
                    alert('Please select your primary career goal.');
                }
            }

            if (isStepValid) {
                if (currentStep < totalSteps) {
                    currentStep++;
                    updateWizardUI();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentStep > 1) {
                currentStep--;
                updateWizardUI();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }

    // ----------------------------------------------------
    // SUBMIT WIZARD & SAVE FULL PROFILE
    // ----------------------------------------------------
    if (submitWizardBtn) {
        submitWizardBtn.addEventListener('click', async () => {
            submitWizardBtn.disabled = true;
            submitWizardBtn.textContent = 'Saving Profile...';
            
            try {
                // 1. Personal
                const phone = phoneEl?.value || '';
                const dob = dobEl?.value || '';
                const gender = genderEl?.value || '';
                const city = cityEl?.value || '';
                
                // 2. Career Goals
                const careerGoal = primaryCareerEl?.value || '';
                const secondaryCareerGoal = secondaryCareerEl?.value || '';
                
                // 3. Skills with Levels
                const skillsList = Array.from(configuredSkills.values());
                
                // 4. Interests & Languages
                const interests = Array.from(document.querySelectorAll('#interest-pool .interest-chip.selected')).map(c => c.textContent.trim());
                const languages = Array.from(document.querySelectorAll('#lang-pool .lang-chip.selected')).map(c => c.textContent.trim());
                
                // 5. Education
                const education = [];
                document.querySelectorAll('#educationList .box-entry').forEach(card => {
                    const qualification = card.querySelector('.edu-qualification')?.value || '';
                    const institution = card.querySelector('.edu-institution')?.value || '';
                    const specialization = card.querySelector('.edu-specialization')?.value || '';
                    const year = card.querySelector('.edu-year')?.value || '';
                    const cgpa = card.querySelector('.edu-cgpa')?.value || '';
                    if (qualification) {
                        education.push({ qualification, institution, specialization, year, cgpa });
                    }
                });

                // 6. Experience
                const experience = [];
                const hasExp = document.querySelector('input[name="hasExp"]:checked')?.value === 'yes';
                if (hasExp) {
                    document.querySelectorAll('#experienceSection .box-entry').forEach(card => {
                        const company = card.querySelector('.exp-company')?.value || '';
                        const role = card.querySelector('.exp-role')?.value || '';
                        const startDate = card.querySelector('.exp-start')?.value || '';
                        const endDate = card.querySelector('.exp-end')?.value || '';
                        const description = card.querySelector('.exp-desc')?.value || '';
                        if (company || role) {
                            experience.push({ company, role, startDate, endDate, description });
                        }
                    });
                }

                // 7. Projects
                const projects = [];
                document.querySelectorAll('#projectSection .box-entry').forEach(card => {
                    const title = card.querySelector('.proj-title')?.value || '';
                    const type = card.querySelector('.proj-type')?.value || '';
                    const description = card.querySelector('.proj-desc')?.value || '';
                    const githubUrl = card.querySelector('.proj-github')?.value || '';
                    const liveUrl = card.querySelector('.proj-live')?.value || '';
                    if (title) {
                        projects.push({ title, type, description, githubUrl, liveUrl });
                    }
                });

                // 8. Courses
                const courses = [];
                const hasCourses = document.querySelector('input[name="hasCourses"]:checked')?.value === 'yes';
                if (hasCourses) {
                    document.querySelectorAll('#coursesSection .box-entry').forEach(card => {
                        const courseName = card.querySelector('.course-name')?.value || '';
                        const platform = card.querySelector('.course-platform')?.value || '';
                        const date = card.querySelector('.course-date')?.value || '';
                        if (courseName) {
                            courses.push({ courseName, platform, date });
                        }
                    });
                }

                // 9. Preferences
                const learningStyle = document.querySelector('.pref-chip.selected')?.textContent.trim() || 'Video';
                const learningPace = document.getElementById('prefPace')?.value || 'Moderate';

                const payload = {
                    phone,
                    dob,
                    gender,
                    city,
                    career_goal: careerGoal,
                    secondary_career_goal: secondaryCareerGoal,
                    profile_image: currentUploadedAvatarUrl,
                    skills: skillsList,
                    interests,
                    languages,
                    education,
                    experience,
                    projects,
                    courses,
                    learning_style: learningStyle,
                    completion_percentage: 100
                };

                await window.api.saveProfile(payload);
                
                // Show success container
                const reviewBoxFields = document.getElementById('reviewBoxFields');
                const successMsg = document.getElementById('onboardingSuccess');
                const reviewHeader = document.getElementById('reviewHeaderBlock');

                if (reviewBoxFields) reviewBoxFields.style.display = 'none';
                if (reviewHeader) reviewHeader.style.display = 'none';
                if (successMsg) successMsg.style.display = 'block';

                setTimeout(() => {
                    window.location.href = 'student/dashboard.html';
                }, 1500);

            } catch (error) {
                console.error(error);
                alert("Unable to save your profile. Error: " + (error.message || 'Please try again.'));
                submitWizardBtn.disabled = false;
                submitWizardBtn.textContent = 'Complete Profile';
            }
        });
    }

    // ----------------------------------------------------
    // REPEATABLE CARDS CLONING
    // ----------------------------------------------------
    const addEduBtn = document.getElementById('addEduBtn');
    if (addEduBtn) {
        addEduBtn.addEventListener('click', () => {
            const list = document.getElementById('educationList');
            const entry = list.querySelector('.box-entry');
            if (entry) {
                const clone = entry.cloneNode(true);
                clone.querySelectorAll('input, select').forEach(i => i.value = '');
                const removeBtn = document.createElement('button');
                removeBtn.className = 'btn-remove-card';
                removeBtn.textContent = 'Remove';
                removeBtn.type = 'button';
                removeBtn.style.cssText = 'background:none; border:none; color:#ef4444; font-size:13px; font-weight:600; cursor:pointer; margin-top:0.5rem;';
                removeBtn.addEventListener('click', () => clone.remove());
                clone.appendChild(removeBtn);
                list.appendChild(clone);
            }
        });
    }

    const addIntBtn = document.getElementById('addIntBtn');
    if (addIntBtn) {
        addIntBtn.addEventListener('click', () => {
            const section = document.getElementById('experienceSection');
            const entry = section.querySelector('.box-entry');
            if (entry) {
                const clone = entry.cloneNode(true);
                clone.querySelectorAll('input, textarea').forEach(i => i.value = '');
                const removeBtn = document.createElement('button');
                removeBtn.className = 'btn-remove-card';
                removeBtn.textContent = 'Remove';
                removeBtn.type = 'button';
                removeBtn.style.cssText = 'background:none; border:none; color:#ef4444; font-size:13px; font-weight:600; cursor:pointer; margin-top:0.5rem;';
                removeBtn.addEventListener('click', () => clone.remove());
                clone.appendChild(removeBtn);
                section.insertBefore(clone, addIntBtn);
            }
        });
    }

    const addProjBtn = document.getElementById('addProjBtn');
    if (addProjBtn) {
        addProjBtn.addEventListener('click', () => {
            const section = document.getElementById('projectSection');
            const entry = section.querySelector('.box-entry');
            if (entry) {
                const clone = entry.cloneNode(true);
                clone.querySelectorAll('input, textarea').forEach(i => i.value = '');
                const removeBtn = document.createElement('button');
                removeBtn.className = 'btn-remove-card';
                removeBtn.textContent = 'Remove';
                removeBtn.type = 'button';
                removeBtn.style.cssText = 'background:none; border:none; color:#ef4444; font-size:13px; font-weight:600; cursor:pointer; margin-top:0.5rem;';
                removeBtn.addEventListener('click', () => clone.remove());
                clone.appendChild(removeBtn);
                section.insertBefore(clone, addProjBtn);
            }
        });
    }

    const addCourseBtn = document.getElementById('addCourseBtn');
    if (addCourseBtn) {
        addCourseBtn.addEventListener('click', () => {
            const section = document.getElementById('coursesSection');
            const entry = section.querySelector('.box-entry');
            if (entry) {
                const clone = entry.cloneNode(true);
                clone.querySelectorAll('input').forEach(i => i.value = '');
                const removeBtn = document.createElement('button');
                removeBtn.className = 'btn-remove-card';
                removeBtn.textContent = 'Remove';
                removeBtn.type = 'button';
                removeBtn.style.cssText = 'background:none; border:none; color:#ef4444; font-size:13px; font-weight:600; cursor:pointer; margin-top:0.5rem;';
                removeBtn.addEventListener('click', () => clone.remove());
                clone.appendChild(removeBtn);
                section.insertBefore(clone, addCourseBtn);
            }
        });
    }

    // ----------------------------------------------------
    // CHIP INTERACTIONS & SEARCH
    // ----------------------------------------------------
    document.addEventListener('click', (e) => {
        // Skill Chip Click
        if (e.target.closest('#skill-pool .skill-chip')) {
            const chip = e.target.closest('#skill-pool .skill-chip');
            const name = chip.textContent.trim();
            if (configuredSkills.has(name)) {
                removeSkill(name);
            } else {
                addSkill(name, 'Intermediate');
            }
        }
        // Interest Chip Click
        else if (e.target.closest('#interest-pool .interest-chip')) {
            const chip = e.target.closest('#interest-pool .interest-chip');
            chip.classList.toggle('selected');
        }
        // Language Chip Click
        else if (e.target.closest('#lang-pool .lang-chip')) {
            const chip = e.target.closest('#lang-pool .lang-chip');
            chip.classList.toggle('selected');
        }
        // Pref Chip Click
        else if (e.target.closest('.pref-chip')) {
            document.querySelectorAll('.pref-chip').forEach(c => c.classList.remove('selected'));
            e.target.closest('.pref-chip').classList.add('selected');
        }
    });

    const skillSearch = document.getElementById('skillSearch');
    if (skillSearch) {
        skillSearch.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = this.value.trim();
                if (val) {
                    addSkill(val, 'Intermediate');
                    this.value = '';
                    document.querySelectorAll('#skill-pool .skill-chip').forEach(c => c.style.display = 'inline-block');
                }
            }
        });

        skillSearch.addEventListener('input', function() {
            const query = this.value.toLowerCase();
            document.querySelectorAll('#skill-pool .skill-chip').forEach(chip => {
                if (chip.textContent.toLowerCase().includes(query)) {
                    chip.style.display = 'inline-block';
                } else {
                    chip.style.display = 'none';
                }
            });
        });
    }

    // Primary Career Card selection
    document.querySelectorAll('.career-card-select').forEach(card => {
        card.addEventListener('click', function() {
            document.querySelectorAll('.career-card-select').forEach(c => c.classList.remove('selected'));
            this.classList.add('selected');
            if (primaryCareerEl) primaryCareerEl.value = this.textContent.trim();
        });
    });

    // Secondary Career Card selection
    document.querySelectorAll('.secondary-career-card-select').forEach(card => {
        card.addEventListener('click', function() {
            document.querySelectorAll('.secondary-career-card-select').forEach(c => c.classList.remove('selected'));
            this.classList.add('selected');
            const val = this.getAttribute('data-value') || '';
            if (secondaryCareerEl) secondaryCareerEl.value = val;
        });
    });

    // Radio toggles
    const expRadios = document.querySelectorAll('input[name="hasExp"]');
    const expSection = document.getElementById('experienceSection');
    expRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (expSection) expSection.style.display = e.target.value === 'yes' ? 'block' : 'none';
        });
    });

    const courseRadios = document.querySelectorAll('input[name="hasCourses"]');
    const coursesSection = document.getElementById('coursesSection');
    courseRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (coursesSection) coursesSection.style.display = e.target.value === 'yes' ? 'block' : 'none';
        });
    });

    // Edit buttons in review
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', function() {
            const targetStep = parseInt(this.getAttribute('data-target'));
            if (targetStep) {
                currentStep = targetStep;
                updateWizardUI();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    });

    // Mobile Sidebar Toggle & Logout
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
});