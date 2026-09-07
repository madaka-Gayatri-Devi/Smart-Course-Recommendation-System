document.addEventListener('DOMContentLoaded', () => {

    // ----------------------------------------------------
    // BACKEND INTEGRATION
    // ----------------------------------------------------
    const nameEl = document.getElementById('profileFullName');
    const emailEl = document.getElementById('profileEmail');
    
    async function loadUserData() {
        try {
            const user = await window.api.getMe();
            if (nameEl) nameEl.value = user.full_name;
            if (emailEl) emailEl.value = user.email;
            
            // Try to load existing profile
            const profile = await window.api.getProfile();
            if (profile && Object.keys(profile).length > 0) {
                console.log("Loaded existing profile data", profile);
            }
        } catch (error) {
            console.error(error);
            window.location.href = 'login.html'; // Redirect to login if not authenticated
        }
    }
    
    // Call it immediately
    loadUserData();


    // ----------------------------------------------------
    // WIZARD NAVIGATION STATE
    // ----------------------------------------------------
    let currentStep = 1;
    const totalSteps = 10;
    
    const nextBtn = document.getElementById('nextBtn');
    const prevBtn = document.getElementById('prevBtn');
    const submitWizardBtn = document.getElementById('submitWizardBtn');
    const dashboardBtn = document.getElementById('dashboardBtn');

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
            1: 'Personal Information', 2: 'Education', 3: 'Skills',
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
            if(prevBtn) prevBtn.style.display = 'none';
        } else {
            if(prevBtn) prevBtn.style.display = 'block';
        }

        if (currentStep === totalSteps) {
            if(nextBtn) nextBtn.style.display = 'none';
            if(submitWizardBtn) submitWizardBtn.style.display = 'block';
        } else {
            if(nextBtn) nextBtn.style.display = 'block';
            if(submitWizardBtn) submitWizardBtn.style.display = 'none';
        }
        
        // Populate Review section on step 10
        if (currentStep === 10) {
            populateReview();
        }
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const currentStepEl = document.getElementById(`step-${currentStep}`);
            if (!currentStepEl) return;
            
            let isStepValid = true;
            const inputs = currentStepEl.querySelectorAll('input[required], select[required], textarea[required]');
            
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
                const selectedSkills = document.querySelectorAll('#step-3 .skill-chip.selected');
                if (selectedSkills.length === 0) {
                    isStepValid = false;
                    const pool = document.getElementById('skill-pool');
                    if (pool) {
                        pool.style.border = '1px solid #e11d48';
                        pool.style.padding = '10px';
                        pool.style.borderRadius = '8px';
                        setTimeout(() => { pool.style.border = 'none'; pool.style.padding = '0'; }, 3000);
                    }
                }
            }

            if (currentStep === 4) {
                const selectedInterests = document.querySelectorAll('#step-4 .interest-chip.selected');
                if (selectedInterests.length === 0) {
                    isStepValid = false;
                    const pool = document.getElementById('interest-pool');
                    if(pool) {
                        pool.style.border = '1px solid #e11d48';
                        pool.style.padding = '10px';
                        pool.style.borderRadius = '8px';
                        setTimeout(() => { pool.style.border = 'none'; pool.style.padding = '0'; }, 3000);
                    }
                }
            }

            if (currentStep === 5) {
                const primaryCareer = document.getElementById('primaryCareer');
                if (!primaryCareer.value) {
                    isStepValid = false;
                    const cards = document.querySelector('.career-cards');
                    if (cards) {
                        cards.style.border = '1px solid #e11d48';
                        cards.style.padding = '10px';
                        cards.style.borderRadius = '16px';
                        setTimeout(() => { cards.style.border = 'none'; cards.style.padding = '0'; }, 3000);
                    }
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

    if (submitWizardBtn) {
        submitWizardBtn.addEventListener('click', async () => {
            const submitBtn = submitWizardBtn;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving Profile...';
            
            try {
                // Gather data
                const phone = document.getElementById('profilePhone')?.value;
                const dob = document.getElementById('profileDob')?.value;
                const gender = document.getElementById('profileGender')?.value;
                const city = document.getElementById('profileCity')?.value;
                
                const careerGoal = document.getElementById('primaryCareer')?.value;
                
                const skills = Array.from(document.querySelectorAll('#step-3 .skill-chip.selected')).map(c => c.textContent);
                const interests = Array.from(document.querySelectorAll('#step-4 .interest-chip.selected:not(.lang-chip)')).map(c => c.textContent);
                const languages = Array.from(document.querySelectorAll('#step-4 .lang-chip.selected')).map(c => c.textContent);
                
                await window.api.saveProfile({
                    phone, dob, gender, city, career_goal: careerGoal,
                    skills, interests, languages,
                    completion_percentage: 100
                });
                
                window.location.href = 'student/dashboard.html';
            } catch (error) {
                console.error(error);
                alert("Unable to save your profile. Please try again.");
                submitBtn.disabled = false;
                submitBtn.textContent = 'Complete Profile';
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
                removeBtn.addEventListener('click', function() { clone.remove(); });
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
                removeBtn.addEventListener('click', function() { clone.remove(); });
                clone.appendChild(removeBtn);
                section.insertBefore(clone, addCourseBtn);
            }
        });
    }

    // ROBUST CHIP SELECTION & ADDITION LOGIC
    document.addEventListener('click', function(e) {
        if (e.target.closest('.selectable-chip') && !e.target.closest('.pref-chip') && !e.target.closest('.career-card-select')) {
            const chip = e.target.closest('.selectable-chip');
            chip.classList.toggle('selected');
        } else if (e.target.closest('.pref-chip')) {
            const chip = e.target.closest('.pref-chip');
            chip.classList.toggle('selected');
        }
    });

    document.querySelectorAll('.custom-chip-input').forEach(input => {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = this.value.trim();
                if (val) {
                    const targetId = this.getAttribute('data-target');
                    const chipType = this.getAttribute('data-type');
                    const pool = document.getElementById(targetId);
                    
                    if (pool) {
                        const newChip = document.createElement('div');
                        let classes = 'selectable-chip ' + chipType + ' selected';
                        if (chipType === 'skill-chip') {
                            classes += ' gradient-selected';
                        }
                        newChip.className = classes;
                        newChip.textContent = val;
                        
                        pool.appendChild(newChip);
                        this.value = ''; 
                        
                        if (this.id === 'skillSearch') {
                            document.querySelectorAll('#skill-pool .skill-chip').forEach(c => c.style.display = 'inline-block');
                        }
                    }
                }
            }
        });
    });

    const skillSearch = document.getElementById('skillSearch');
    if (skillSearch) {
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

    document.querySelectorAll('.career-card-select').forEach(card => {
        card.addEventListener('click', function() {
            document.querySelectorAll('.career-card-select').forEach(c => c.classList.remove('selected'));
            this.classList.add('selected');
            const primaryCareerInput = document.getElementById('primaryCareer');
            if(primaryCareerInput) primaryCareerInput.value = this.textContent;
        });
    });

    const expRadios = document.querySelectorAll('input[name="hasExp"]');
    const expSection = document.getElementById('experienceSection');
    expRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if(expSection) expSection.style.display = e.target.value === 'yes' ? 'block' : 'none';
        });
    });

    const courseRadios = document.querySelectorAll('input[name="hasCourses"]');
    const coursesSection = document.getElementById('coursesSection');
    courseRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if(coursesSection) coursesSection.style.display = e.target.value === 'yes' ? 'block' : 'none';
        });
    });

    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', function() {
            const targetStep = parseInt(this.getAttribute('data-target'));
            if (targetStep) {
                currentStep = targetStep;
                updateWizardUI();
            }
        });
    });
    // Clone Education
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
                removeBtn.addEventListener('click', function() { clone.remove(); });
                clone.appendChild(removeBtn);
                list.appendChild(clone);
            }
        });
    }

    // Clone Internship
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
                removeBtn.addEventListener('click', function() { clone.remove(); });
                clone.appendChild(removeBtn);
                section.insertBefore(clone, addIntBtn);
            }
        });
    }


});