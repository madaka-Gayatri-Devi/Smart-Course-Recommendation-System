/**
 * SmartLearn - Personalized Course Recommendations Engine
 * Dynamically loads and filters AI-matched courses based on student profile,
 * target career goals, skill gaps, proficiency, and learning history.
 */

(function () {
    'use strict';

    // State
    let fullData = null;
    let allRecommendations = [];
    let currentTrack = 'all';
    let currentCategory = 'all';
    let searchQuery = '';
    let wishlistCourseIds = new Set();

    document.addEventListener('DOMContentLoaded', () => {
        initRecommendations();
    });

    async function initRecommendations() {
        setupFilterListeners();
        setupSearchListener();
        setupWhyModalListeners();

        // Load wishlist IDs to highlight heart buttons
        try {
            if (window.api && window.api.getWishlist) {
                const wl = await window.api.getWishlist();
                if (Array.isArray(wl)) {
                    wishlistCourseIds = new Set(wl.map(item => item.course_id || item.id));
                }
            }
        } catch (_) {}

        await fetchAndRenderRecommendations();
    }

    async function fetchAndRenderRecommendations() {
        const grid = document.getElementById('recommendationsListGrid');
        if (!grid) return;

        // Loading state
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem;">
                <i class="fa-solid fa-spinner fa-spin" style="font-size: 2.25rem; color: #5B3FE8; margin-bottom: 1rem;"></i>
                <p style="font-size: 1rem; font-weight: 600; color: #334155;">Calculating personalized course matches...</p>
                <p style="font-size: 0.85rem; color: #64748B; margin-top: 0.25rem;">Analyzing your career goals, skill gaps, and learning profile</p>
            </div>
        `;

        try {
            if (!window.api || !window.api.getRecommendations) {
                throw new Error('API client not available.');
            }

            const data = await window.api.getRecommendations();
            fullData = data;

            // Extract all recommendation courses
            if (Array.isArray(data)) {
                allRecommendations = data;
            } else if (data && typeof data === 'object') {
                allRecommendations = data.recommendations || [];
            } else {
                allRecommendations = [];
            }

            // Render Profile Summary Banner
            renderProfileBanner(data);

            // Filter and render courses
            renderFilteredCourses();

        } catch (err) {
            console.error('[Recommendations] Error fetching recommendations:', err);
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3.5rem 1rem; background: #FFF; border-radius: 16px; border: 1px solid #E2E8F0;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 2.5rem; color: #EF4444; margin-bottom: 1rem;"></i>
                    <h3 style="font-size: 1.15rem; font-weight: 700; color: #1E293B; margin-bottom: 0.5rem;">Unable to Load Recommendations</h3>
                    <p style="font-size: 0.9rem; color: #64748B; max-width: 480px; margin: 0 auto 1.5rem;">${escapeHTML(err.message || 'Please check your connection and try again.')}</p>
                    <button type="button" class="btn-primary" onclick="window.location.reload()" style="padding: 0.6rem 1.5rem; border-radius: 10px; background: #5B3FE8; color: #fff; border: none; font-weight: 600; cursor: pointer;">
                        <i class="fa-solid fa-rotate-right mr-1"></i> Retry
                    </button>
                </div>
            `;
        }
    }

    function renderProfileBanner(data) {
        const bannerContainer = document.getElementById('profileSummaryBanner');
        if (!bannerContainer) return;

        if (!data || typeof data !== 'object') {
            bannerContainer.innerHTML = '';
            return;
        }

        const careerGoal = data.career_goal || (data.student_profile_summary && data.student_profile_summary.career_goal) || 'Full Stack Developer';
        const totalMatches = data.total_matches || (allRecommendations ? allRecommendations.length : 0);
        const topCategory = allRecommendations.length > 0 ? (allRecommendations[0].category || 'Web Development') : 'General';

        bannerContainer.innerHTML = `
            <div class="rec-summary-banner">
                <div class="rec-summary-content">
                    <div style="display: inline-flex; align-items: center; gap: 0.4rem; background: rgba(255,255,255,0.2); padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">
                        <i class="fa-solid fa-bullseye"></i> Target Career Goal
                    </div>
                    <h3>${escapeHTML(careerGoal)}</h3>
                    <p>Courses ranked using dynamic multi-factor matching across your career goal, skill gaps, proficiency, and interests.</p>
                </div>
                <div class="rec-summary-stats">
                    <div class="rec-summary-stat-box">
                        <div class="rec-summary-stat-num">${totalMatches}</div>
                        <div class="rec-summary-stat-lbl">Matches Found</div>
                    </div>
                    <div class="rec-summary-stat-box">
                        <div class="rec-summary-stat-num">${allRecommendations.length > 0 ? (allRecommendations[0].match_percentage || 95) + '%' : '100%'}</div>
                        <div class="rec-summary-stat-lbl">Top Match Score</div>
                    </div>
                    <div class="rec-summary-stat-box">
                        <div class="rec-summary-stat-num" style="font-size: 1.05rem; padding-top: 4px;">${escapeHTML(topCategory)}</div>
                        <div class="rec-summary-stat-lbl">Leading Domain</div>
                    </div>
                </div>
            </div>
        `;
    }

    function setupFilterListeners() {
        // Track filters
        const trackButtons = document.querySelectorAll('#trackContainer .filter-btn');
        trackButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                trackButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentTrack = btn.dataset.track || 'all';
                renderFilteredCourses();
            });
        });

        // Category filters
        const categoryButtons = document.querySelectorAll('#filterContainer .filter-btn');
        categoryButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                categoryButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentCategory = btn.dataset.category || 'all';
                renderFilteredCourses();
            });
        });
    }

    function setupSearchListener() {
        const searchInput = document.getElementById('recSearchInput');
        if (!searchInput) return;

        let debounceTimer = null;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                searchQuery = (e.target.value || '').trim().toLowerCase();
                renderFilteredCourses();
            }, 250);
        });
    }

    function getTrackCourses() {
        if (!fullData || typeof fullData !== 'object' || Array.isArray(fullData)) {
            return allRecommendations;
        }

        switch (currentTrack) {
            case 'career':
                return fullData.career_goal_recommendations && fullData.career_goal_recommendations.length > 0
                    ? fullData.career_goal_recommendations
                    : allRecommendations.filter(c => (c.match_reasons || []).some(r => r.toLowerCase().includes('career')));

            case 'gap':
                return fullData.skill_gap_recommendations && fullData.skill_gap_recommendations.length > 0
                    ? fullData.skill_gap_recommendations
                    : allRecommendations.filter(c => (c.skills_gaps_addressed && c.skills_gaps_addressed.length > 0) || (c.match_reasons || []).some(r => r.toLowerCase().includes('gap')));

            case 'interests':
                return fullData.interest_recommendations && fullData.interest_recommendations.length > 0
                    ? fullData.interest_recommendations
                    : allRecommendations.filter(c => (c.scores_breakdown && c.scores_breakdown.interest_score > 0));

            case 'next_level':
                return fullData.next_level_recommendations && fullData.next_level_recommendations.length > 0
                    ? fullData.next_level_recommendations
                    : allRecommendations.filter(c => (c.level || c.difficulty || '').toLowerCase() === 'advanced' || (c.level || c.difficulty || '').toLowerCase() === 'intermediate');

            case 'all':
            default:
                return allRecommendations;
        }
    }

    function renderFilteredCourses() {
        const grid = document.getElementById('recommendationsListGrid');
        if (!grid) return;

        let list = getTrackCourses() || [];

        // Apply domain category filter
        if (currentCategory !== 'all') {
            const catLower = currentCategory.toLowerCase();
            list = list.filter(c => {
                const courseCat = (c.category || '').toLowerCase();
                const domains = (c.domains || []).map(d => String(d).toLowerCase());
                return courseCat.includes(catLower) || domains.some(d => d.includes(catLower));
            });
        }

        // Apply search query filter
        if (searchQuery) {
            list = list.filter(c => {
                const title = (c.title || '').toLowerCase();
                const desc = (c.description || c.short_description || '').toLowerCase();
                const instructor = (c.instructor || '').toLowerCase();
                const skills = (c.skills || []).map(s => String(s).toLowerCase()).join(' ');
                return title.includes(searchQuery) || desc.includes(searchQuery) || instructor.includes(searchQuery) || skills.includes(searchQuery);
            });
        }

        // Handle empty state
        if (list.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; background: #FFFFFF; border-radius: 16px; border: 1.5px dashed #CBD5E1;">
                    <div style="width: 64px; height: 64px; border-radius: 50%; background: #EEECFE; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem;">
                        <i class="fa-solid fa-compass" style="font-size: 1.75rem; color: #5B3FE8;"></i>
                    </div>
                    <h3 style="font-size: 1.15rem; font-weight: 700; color: #1E293B; margin-bottom: 0.5rem;">No Courses Found</h3>
                    <p style="font-size: 0.9rem; color: #64748B; max-width: 440px; margin: 0 auto 1.5rem;">
                        We couldn't find any courses matching your selected filter or search query.
                    </p>
                    <button type="button" class="filter-btn active" id="resetRecFiltersBtn" style="padding: 0.6rem 1.5rem; font-size: 0.9rem;">
                        <i class="fa-solid fa-arrows-rotate mr-1"></i> Reset All Filters
                    </button>
                </div>
            `;
            const resetBtn = document.getElementById('resetRecFiltersBtn');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    currentTrack = 'all';
                    currentCategory = 'all';
                    searchQuery = '';
                    const searchInput = document.getElementById('recSearchInput');
                    if (searchInput) searchInput.value = '';
                    document.querySelectorAll('#trackContainer .filter-btn').forEach(b => {
                        b.classList.toggle('active', b.dataset.track === 'all');
                    });
                    document.querySelectorAll('#filterContainer .filter-btn').forEach(b => {
                        b.classList.toggle('active', b.dataset.category === 'all');
                    });
                    renderFilteredCourses();
                });
            }
            return;
        }

        // Render Cards
        grid.innerHTML = list.map(course => buildCourseCardHTML(course)).join('');

        // Attach card action handlers (Wishlist, Why modal, Enroll)
        attachCardEvents(grid);
    }

    function buildCourseCardHTML(c) {
        const matchScore = c.match_percentage != null ? Math.round(c.match_percentage) : 85;
        let badgeClass = 'rec-badge-good';
        if (matchScore >= 80) badgeClass = 'rec-badge-high';
        else if (matchScore >= 60) badgeClass = 'rec-badge-med';

        const isWishlisted = wishlistCourseIds.has(c.id);
        const wishlistHeart = isWishlisted ? 'fa-solid fa-heart active' : 'fa-regular fa-heart';

        const rating = c.rating ? Number(c.rating).toFixed(1) : '4.8';
        const reviewsCount = c.review_count || 1;
        const duration = c.duration || '24 hours';
        const lessons = c.lessons_count ? `${c.lessons_count} lessons` : '10 lessons';
        const level = c.level || c.difficulty || 'All Levels';
        const category = c.category || 'Technology';
        const instructor = c.instructor || 'SmartLearn Academy';

        const skills = (c.skills || []).slice(0, 4);
        const skillsHTML = skills.map(s => `<span class="rec-skill-chip">${escapeHTML(s)}</span>`).join('');

        // Reasons highlight
        let reasonText = '';
        if (c.match_reasons && c.match_reasons.length > 0) {
            reasonText = c.match_reasons[0];
        } else if (c.skills_gaps_addressed && c.skills_gaps_addressed.length > 0) {
            reasonText = `Closes skill gap: ${c.skills_gaps_addressed.slice(0, 2).join(', ')}`;
        } else {
            reasonText = `Top match for your target career role`;
        }

        const isEnrolled = !!c.is_enrolled;
        const primaryBtnLabel = isEnrolled ? 'Continue Course' : 'View Course';
        const primaryBtnHref = isEnrolled ? `course-player.html?id=${c.id}` : `course-details.html?id=${c.id}`;

        return `
            <div class="rec-card" data-course-id="${c.id}">
                <div class="rec-card-header">
                    <span class="rec-badge-match ${badgeClass}">
                        <i class="fa-solid fa-bolt"></i> ${matchScore}% Match
                    </span>
                    <button type="button" class="rec-wishlist-btn" data-course-id="${c.id}" title="${isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}" aria-label="Toggle Wishlist">
                        <i class="${wishlistHeart}"></i>
                    </button>
                </div>

                <div class="rec-card-body">
                    <div class="rec-category-tag">${escapeHTML(category)}</div>
                    <h3 class="rec-card-title">
                        <a href="${primaryBtnHref}">${escapeHTML(c.title)}</a>
                    </h3>
                    <p class="rec-card-desc">${escapeHTML(c.short_description || c.description || '')}</p>

                    <div class="rec-meta-row">
                        <div class="rec-meta-item">
                            <i class="fa-solid fa-star" style="color: #F59E0B;"></i>
                            <span style="font-weight: 700; color: #1E293B;">${rating}</span>
                            <span style="color: #94A3B8;">(${reviewsCount})</span>
                        </div>
                        <div class="rec-meta-item">
                            <i class="fa-regular fa-clock"></i>
                            <span>${escapeHTML(duration)}</span>
                        </div>
                        <div class="rec-meta-item">
                            <i class="fa-solid fa-layer-group"></i>
                            <span>${escapeHTML(level)}</span>
                        </div>
                    </div>

                    ${skillsHTML ? `<div class="rec-skills-wrap">${skillsHTML}</div>` : ''}

                    <div class="rec-reasons-box">
                        <i class="fa-solid fa-wand-magic-sparkles" style="color: #5B3FE8; margin-right: 0.35rem;"></i>
                        <span>${escapeHTML(reasonText)}</span>
                    </div>

                    <div class="rec-card-actions">
                        <a href="${primaryBtnHref}" class="rec-btn-primary">
                            <i class="fa-solid ${isEnrolled ? 'fa-play' : 'fa-arrow-right'}"></i> ${primaryBtnLabel}
                        </a>
                        <button type="button" class="rec-btn-outline why-recommended-btn" data-course-id="${c.id}" title="See why this was recommended">
                            <i class="fa-solid fa-circle-question"></i> Why?
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    function attachCardEvents(container) {
        // Wishlist button click
        container.querySelectorAll('.rec-wishlist-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const courseId = parseInt(btn.dataset.courseId, 10);
                if (!courseId) return;

                const heartIcon = btn.querySelector('i');
                const isCurrentlyWishlisted = wishlistCourseIds.has(courseId);

                try {
                    if (isCurrentlyWishlisted) {
                        if (window.api && window.api.removeFromWishlist) {
                            await window.api.removeFromWishlist(courseId);
                        }
                        wishlistCourseIds.delete(courseId);
                        heartIcon.className = 'fa-regular fa-heart';
                        btn.classList.remove('active');
                    } else {
                        if (window.api && window.api.addToWishlist) {
                            await window.api.addToWishlist(courseId);
                        }
                        wishlistCourseIds.add(courseId);
                        heartIcon.className = 'fa-solid fa-heart active';
                        btn.classList.add('active');
                    }
                } catch (err) {
                    console.error('[Wishlist] Toggle failed:', err);
                }
            });
        });

        // Why Recommended button click
        container.querySelectorAll('.why-recommended-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const courseId = parseInt(btn.dataset.courseId, 10);
                const course = allRecommendations.find(c => c.id === courseId);
                if (course) {
                    showWhyModal(course);
                }
            });
        });
    }

    function setupWhyModalListeners() {
        const modal = document.getElementById('whyRecommendedModal');
        const closeBtn = document.getElementById('closeWhyModalBtn');
        if (!modal) return;

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    function showWhyModal(course) {
        let modal = document.getElementById('whyRecommendedModal');
        if (!modal) {
            // Create modal if not already in DOM
            modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.id = 'whyRecommendedModal';
            modal.innerHTML = `
                <div class="modal-container" style="max-width: 520px; background: #FFF; border-radius: 16px; padding: 1.5rem; box-shadow: 0 20px 40px rgba(0,0,0,0.2);">
                    <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #E2E8F0; padding-bottom: 1rem; margin-bottom: 1rem;">
                        <h3 style="font-size: 1.15rem; font-weight: 700; color: #1E293B; margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fa-solid fa-wand-magic-sparkles" style="color: #5B3FE8;"></i> Why Recommended For You
                        </h3>
                        <button class="modal-close-btn" id="closeWhyModalBtn" style="background: none; border: none; font-size: 1.25rem; color: #94A3B8; cursor: pointer;">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <h4 id="whyModalCourseTitle" style="font-size: 1rem; color: #0F172A; margin: 0 0 1rem; font-weight: 700;">Course Title</h4>
                        <div id="whyModalContent"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            setupWhyModalListeners();
        }

        const titleEl = document.getElementById('whyModalCourseTitle');
        const contentEl = document.getElementById('whyModalContent');
        if (titleEl) titleEl.textContent = course.title || 'Course Details';

        const matchScore = course.match_percentage != null ? Math.round(course.match_percentage) : 85;
        const breakdown = course.scores_breakdown || {};
        const careerScore = breakdown.career_score != null ? Math.round(breakdown.career_score) : 30;
        const gapScore = breakdown.skill_gap_score != null ? Math.round(breakdown.skill_gap_score) : 20;
        const profScore = breakdown.skill_proficiency_score != null ? Math.round(breakdown.skill_proficiency_score) : 15;
        const interestScore = breakdown.interest_score != null ? Math.round(breakdown.interest_score) : 10;

        const reasons = course.match_reasons || ['Strong match for your current learning path and career aspirations.'];
        const reasonsList = reasons.map(r => `
            <li style="display: flex; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.5rem; font-size: 0.85rem; color: #334155;">
                <i class="fa-solid fa-circle-check" style="color: #10B981; margin-top: 0.2rem;"></i>
                <span>${escapeHTML(r)}</span>
            </li>
        `).join('');

        if (contentEl) {
            contentEl.innerHTML = `
                <div style="background: #F8FAFC; border-radius: 12px; padding: 1rem; margin-bottom: 1.25rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                        <span style="font-weight: 700; color: #1E293B; font-size: 0.9rem;">Overall AI Match Score</span>
                        <span style="font-weight: 800; color: #5B3FE8; font-size: 1.15rem;">${matchScore}%</span>
                    </div>
                    <div style="height: 8px; border-radius: 9999px; background: #E2E8F0; overflow: hidden; margin-bottom: 1rem;">
                        <div style="height: 100%; width: ${matchScore}%; background: linear-gradient(90deg, #5B3FE8, #10B981); border-radius: 9999px;"></div>
                    </div>

                    <!-- Breakdown Meters -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; font-size: 0.78rem;">
                        <div>
                            <span style="color: #64748B;">Career Alignment</span>
                            <div style="font-weight: 700; color: #1E293B;">${careerScore} / 30 pts</div>
                        </div>
                        <div>
                            <span style="color: #64748B;">Skill Gap Bridge</span>
                            <div style="font-weight: 700; color: #1E293B;">${gapScore} / 25 pts</div>
                        </div>
                        <div>
                            <span style="color: #64748B;">Skill Proficiency</span>
                            <div style="font-weight: 700; color: #1E293B;">${profScore} / 20 pts</div>
                        </div>
                        <div>
                            <span style="color: #64748B;">Interests & Domain</span>
                            <div style="font-weight: 700; color: #1E293B;">${interestScore} / 15 pts</div>
                        </div>
                    </div>
                </div>

                <div style="margin-bottom: 1rem;">
                    <h5 style="font-size: 0.85rem; font-weight: 700; color: #1E293B; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">Match Rationales</h5>
                    <ul style="list-style: none; padding: 0; margin: 0;">
                        ${reasonsList}
                    </ul>
                </div>

                <div style="text-align: right; margin-top: 1.25rem;">
                    <a href="course-details.html?id=${course.id}" class="rec-btn-primary" style="display: inline-flex; width: auto; padding: 0.6rem 1.25rem;">
                        View Full Course Details <i class="fa-solid fa-arrow-right ml-1"></i>
                    </a>
                </div>
            `;
        }

        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
    }

    function escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Expose for external calls if needed
    window.refreshRecommendations = fetchAndRenderRecommendations;
})();
