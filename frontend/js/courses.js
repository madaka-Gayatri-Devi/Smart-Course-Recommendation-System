/**
 * SmartLearn - Course Catalog, Search, Filtering, Sorting & Details Logic
 * 100% dynamic data connected to backend SQLite database APIs.
 */

let allLoadedCourses = [];
let currentPage = 1;
const PAGE_SIZE = 9;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Auth Check & Topbar User Info
    let currentUser = null;
    let profileData = null;
    try {
        currentUser = await window.api.getMe();
        profileData = await window.api.getProfile().catch(() => ({}));
        const fullName = currentUser.full_name || 'Student';
        const roleName = currentUser.role || 'Student';

        document.getElementById('topName') && (document.getElementById('topName').textContent = fullName);
        document.getElementById('sidebarName') && (document.getElementById('sidebarName').textContent = fullName);
        document.getElementById('sidebarRole') && (document.getElementById('sidebarRole').textContent = roleName);

        const names = fullName.trim().split(' ');
        let initials = names[0].charAt(0);
        if (names.length > 1) initials += names[1].charAt(0);
        initials = initials.toUpperCase();

        if (profileData && profileData.profile_image) {
            const imgUrl = window.api.getImageUrl(profileData.profile_image);
            const imgTag = `<img src="${imgUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" alt="Profile">`;
            document.getElementById('topAvatar') && (document.getElementById('topAvatar').innerHTML = imgTag);
            document.getElementById('sidebarAvatar') && (document.getElementById('sidebarAvatar').innerHTML = imgTag);
        } else {
            document.getElementById('topAvatar') && (document.getElementById('topAvatar').textContent = initials);
            document.getElementById('sidebarAvatar') && (document.getElementById('sidebarAvatar').textContent = initials);
        }
    } catch (e) {
        console.error("Auth check notice:", e);
        // If student is not logged in, redirect to login
        if (window.location.pathname.includes('/student/')) {
            window.location.href = '../login.html';
            return;
        }
    }

    // Toggle & Logout
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('dashboardSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (menuToggle && sidebar && overlay) {
        menuToggle.addEventListener('click', () => { sidebar.classList.add('active'); overlay.classList.add('active'); });
        overlay.addEventListener('click', () => { sidebar.classList.remove('active'); overlay.classList.remove('active'); });
    }
    document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.api.clearToken();
        window.location.href = '../login.html';
    });

    // ----------------------------------------------------
    // 2. COURSE CATALOG PAGE LOGIC
    // ----------------------------------------------------
    const catalogGrid = document.getElementById('catalogCoursesGrid');
    if (catalogGrid) {
        setupCatalogPage();
    }

    // ----------------------------------------------------
    // 3. COURSE DETAILS PAGE
    // ----------------------------------------------------
    const detailsContainer = document.getElementById('courseDetailsContent');
    if (detailsContainer) {
        setupCourseDetailsPage(detailsContainer);
    }

    // ----------------------------------------------------
    // 4. MY COURSES PAGE LOGIC
    // ----------------------------------------------------
    const myCoursesGrid = document.getElementById('myCoursesGrid');
    if (myCoursesGrid) {
        setupMyCoursesPage(myCoursesGrid);
    }
});

/**
 * Setup Course Catalog Search, Filter, Sort, URL Sync & Pagination
 */
async function setupCatalogPage() {
    const catalogGrid = document.getElementById('catalogCoursesGrid');
    const searchInput = document.getElementById('courseSearchInput');
    const searchClearBtn = document.getElementById('courseSearchClear');
    const searchBtn = document.getElementById('courseSearchBtn');
    const catFilter = document.getElementById('categoryFilter');
    const diffFilter = document.getElementById('difficultyFilter');
    const durFilter = document.getElementById('durationFilter');
    const ratingFilter = document.getElementById('ratingFilter');
    const priceFilter = document.getElementById('priceFilter');
    const skillFilter = document.getElementById('skillFilter');
    const careerGoalFilter = document.getElementById('careerGoalFilter');
    const sortBy = document.getElementById('sortBy');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    const chipsContainer = document.getElementById('activeFilterChips');
    const countDisplay = document.getElementById('coursesCountDisplay');
    const paginationContainer = document.getElementById('catalogPagination');

    // Mobile filter drawer controls
    const mobileToggle = document.getElementById('mobileFilterToggle');
    const sidebarDrawer = document.getElementById('catalogSidebar');
    const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');

    if (mobileToggle && sidebarDrawer) {
        mobileToggle.addEventListener('click', () => {
            sidebarDrawer.classList.toggle('active');
        });
        sidebarCloseBtn?.addEventListener('click', () => {
            sidebarDrawer.classList.remove('active');
        });
    }

    // Load filter options dynamically from real DB
    await populateFilterOptions(catFilter, skillFilter, careerGoalFilter);

    // Read initial state from URL query parameters
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('search')) searchInput.value = urlParams.get('search');
    if (urlParams.get('category')) catFilter.value = urlParams.get('category');
    if (urlParams.get('level')) diffFilter.value = urlParams.get('level');
    if (urlParams.get('difficulty')) diffFilter.value = urlParams.get('difficulty');
    if (urlParams.get('duration')) durFilter.value = urlParams.get('duration');
    if (urlParams.get('rating')) ratingFilter.value = urlParams.get('rating');
    if (urlParams.get('price')) priceFilter.value = urlParams.get('price');
    if (urlParams.get('skill')) skillFilter.value = urlParams.get('skill');
    if (urlParams.get('career_goal')) careerGoalFilter.value = urlParams.get('career_goal');
    if (urlParams.get('sort_by')) sortBy.value = urlParams.get('sort_by');
    if (urlParams.get('page')) currentPage = parseInt(urlParams.get('page')) || 1;

    updateSearchClearVisibility();

    // Main fetch & render function
    async function loadCatalog() {
        catalogGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem;">
                <i class="fa-solid fa-spinner fa-spin" style="font-size: 2.2rem; color: var(--primary-purple);"></i>
                <p style="margin-top: 1rem; color: var(--secondary-text); font-weight: 500;">Loading course catalog...</p>
            </div>
        `;

        const params = {
            search: searchInput ? searchInput.value.trim() : '',
            category: catFilter ? catFilter.value : 'all',
            level: diffFilter ? diffFilter.value : 'all',
            duration: durFilter ? durFilter.value : 'all',
            rating: ratingFilter ? ratingFilter.value : 'all',
            price: priceFilter ? priceFilter.value : 'all',
            skill: skillFilter ? skillFilter.value : 'all',
            career_goal: careerGoalFilter ? careerGoalFilter.value : 'all',
            sort_by: sortBy ? sortBy.value : 'recommended'
        };

        // Sync URL parameters
        syncUrlParams(params, currentPage);

        // Update active filter chips
        renderActiveFilterChips(params);

        try {
            allLoadedCourses = await window.api.getCourses(params);
            
            if (countDisplay) {
                countDisplay.textContent = allLoadedCourses.length;
            }

            if (allLoadedCourses.length === 0) {
                catalogGrid.innerHTML = `
                    <div class="empty-catalog-state">
                        <div class="empty-catalog-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
                        <h4 class="empty-catalog-title">No courses found</h4>
                        <p class="empty-catalog-desc">Try changing your search keywords or clearing some filters to explore more courses.</p>
                        <button type="button" class="btn-clear-filters" style="max-width: 200px; margin: 0 auto;" onclick="window.clearAllCatalogFilters()">
                            <i class="fa-solid fa-rotate-left"></i> Reset All Filters
                        </button>
                    </div>
                `;
                if (paginationContainer) paginationContainer.style.display = 'none';
                return;
            }

            // Paginate results
            renderPaginatedGrid();

        } catch (err) {
            console.error("Failed to load catalog:", err);
            catalogGrid.innerHTML = `
                <div class="empty-catalog-state">
                    <div class="empty-catalog-icon" style="color: #EF4444;"><i class="fa-solid fa-circle-exclamation"></i></div>
                    <h4 class="empty-catalog-title">Unable to load courses</h4>
                    <p class="empty-catalog-desc">${escapeHtml(err.message || 'Error connecting to SmartLearn server.')}</p>
                    <button type="button" class="btn-clear-filters" style="max-width: 160px; margin: 0 auto;" onclick="window.reloadCatalog()">
                        <i class="fa-solid fa-rotate-right"></i> Try Again
                    </button>
                </div>
            `;
            if (paginationContainer) paginationContainer.style.display = 'none';
        }
    }

    function renderPaginatedGrid() {
        const totalItems = allLoadedCourses.length;
        const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIdx = (currentPage - 1) * PAGE_SIZE;
        const endIdx = startIdx + PAGE_SIZE;
        const pageCourses = allLoadedCourses.slice(startIdx, endIdx);

        catalogGrid.innerHTML = pageCourses.map(c => {
            const isFree = c.is_free !== 0 && c.is_free !== false && (!c.price || Number(c.price) === 0);
            const priceHtml = isFree 
                ? `<span class="card-price-tag free"><i class="fa-solid fa-gift mr-1"></i> FREE</span>`
                : `<span class="card-price-tag">₹${Number(c.price || 0).toLocaleString()}</span>`;

            const matchPill = (c.match_percentage && c.match_percentage >= 60)
                ? `<span class="card-match-badge" title="${escapeHtml((c.match_reasons || []).join(' • '))}"><i class="fa-solid fa-bolt"></i> ${c.match_percentage}% Match</span>`
                : '';

            const ratingDisplay = c.review_count > 0 
                ? `⭐ ${(c.rating || 4.8).toFixed(1)} <span style="font-weight:400; opacity:0.85; font-size:11px;">(${c.review_count})</span>`
                : `<span style="font-weight:500; font-size:11px; color:#64748b;">No reviews yet</span>`;

            const iconClass = c.icon || 'fa-solid fa-code';
            const skillsTags = (c.skills || []).slice(0, 3).map(s => `<span class="card-skill-pill">${escapeHtml(s)}</span>`).join('');

            const thumbStyle = c.thumbnail_url 
                ? `background-image: url('${escapeHtml(c.thumbnail_url)}'); background-size: cover; background-position: center;` 
                : `background: ${c.color_theme || 'linear-gradient(135deg, #5B3FE8 0%, #8B4AD9 60%, #E83FA5 100%)'};`;

            return `
                <div class="smart-course-card">
                    <div class="card-thumb-banner" style="${thumbStyle}">
                        ${!c.thumbnail_url ? `<i class="${iconClass}"></i>` : ''}
                        <span class="card-difficulty-badge">${escapeHtml(c.level || c.difficulty || 'Intermediate')}</span>
                        ${matchPill}
                    </div>

                    <div class="card-body-content">
                        <div class="card-category-header">
                            <span class="card-category-tag">${escapeHtml(c.category || 'General')}</span>
                            <span class="card-rating-badge">${ratingDisplay}</span>
                        </div>

                        <h3 class="card-title">
                            <a href="course-details.html?id=${c.id}">${escapeHtml(c.title)}</a>
                        </h3>

                        <p class="card-desc">${escapeHtml(c.short_description || c.description || '')}</p>

                        <div class="card-meta-pills">
                            <span class="card-meta-item"><i class="fa-solid fa-clock"></i> ${escapeHtml(c.duration || '30 hours')}</span>
                            <span class="card-meta-item"><i class="fa-solid fa-graduation-cap"></i> ${c.lessons_count || 24} lessons</span>
                        </div>

                        <div class="card-skills-row">
                            ${skillsTags || '<span class="card-skill-pill">General Skills</span>'}
                        </div>

                        <div class="card-footer-row">
                            <div class="card-instructor-info">
                                <span style="font-size:11px; color:#94A3B8;">Instructor</span>
                                <span class="card-instructor-name">${escapeHtml(c.instructor || c.instructor_name || 'SmartLearn Faculty')}</span>
                            </div>

                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                ${priceHtml}
                                <div class="card-actions-group">
                                    <button onclick="toggleCourseWishlist(${c.id}, this)" class="btn-wishlist-icon" title="Save to Wishlist"><i class="fa-regular fa-heart"></i></button>
                                    <a href="course-details.html?id=${c.id}" class="btn-view-course">View Course →</a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        renderPaginationControls(totalPages);
    }

    function renderPaginationControls(totalPages) {
        if (!paginationContainer) return;
        if (totalPages <= 1) {
            paginationContainer.style.display = 'none';
            return;
        }

        paginationContainer.style.display = 'flex';
        let html = `
            <button type="button" class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="window.goToCatalogPage(${currentPage - 1})">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
        `;

        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                html += `
                    <button type="button" class="page-btn ${i === currentPage ? 'active' : ''}" onclick="window.goToCatalogPage(${i})">
                        ${i}
                    </button>
                `;
            } else if (i === currentPage - 2 || i === currentPage + 2) {
                html += `<span style="padding: 0 4px; color: #94A3B8;">...</span>`;
            }
        }

        html += `
            <button type="button" class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="window.goToCatalogPage(${currentPage + 1})">
                <i class="fa-solid fa-chevron-right"></i>
            </button>
        `;

        paginationContainer.innerHTML = html;
    }

    window.goToCatalogPage = function(page) {
        currentPage = page;
        renderPaginatedGrid();
        window.scrollTo({ top: 180, behavior: 'smooth' });
    };

    window.reloadCatalog = loadCatalog;

    function renderActiveFilterChips(params) {
        if (!chipsContainer) return;
        const chips = [];

        if (params.search) {
            chips.push({ key: 'search', label: `Search: "${params.search}"` });
        }
        if (params.category && params.category !== 'all') {
            chips.push({ key: 'category', label: `Category: ${params.category}` });
        }
        if (params.level && params.level !== 'all') {
            chips.push({ key: 'level', label: `Difficulty: ${params.level}` });
        }
        if (params.duration && params.duration !== 'all') {
            const durLabels = { '<10': '< 10 hrs', '10-20': '10–20 hrs', '20-40': '20–40 hrs', '40+': '40+ hrs' };
            chips.push({ key: 'duration', label: `Duration: ${durLabels[params.duration] || params.duration}` });
        }
        if (params.rating && params.rating !== 'all') {
            chips.push({ key: 'rating', label: `Rating: ${params.rating}+ ⭐` });
        }
        if (params.price && params.price !== 'all') {
            chips.push({ key: 'price', label: `Access: ${params.price === 'free' ? 'Free' : 'Paid'}` });
        }
        if (params.skill && params.skill !== 'all') {
            chips.push({ key: 'skill', label: `Skill: ${params.skill}` });
        }
        if (params.career_goal && params.career_goal !== 'all') {
            chips.push({ key: 'career_goal', label: `Goal: ${params.career_goal}` });
        }

        const countBadge = document.getElementById('mobileFilterCountBadge');
        if (countBadge) {
            if (chips.length > 0) {
                countBadge.style.display = 'inline-block';
                countBadge.textContent = chips.length;
            } else {
                countBadge.style.display = 'none';
            }
        }

        if (chips.length === 0) {
            chipsContainer.style.display = 'none';
            chipsContainer.innerHTML = '';
            return;
        }

        chipsContainer.style.display = 'flex';
        chipsContainer.innerHTML = chips.map(c => `
            <span class="active-chip">
                ${escapeHtml(c.label)}
                <button type="button" class="active-chip-remove" onclick="window.removeActiveFilter('${c.key}')" title="Remove filter">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </span>
        `).join('') + `
            <button type="button" class="chip-clear-all" onclick="window.clearAllCatalogFilters()">Clear All</button>
        `;
    }

    window.removeActiveFilter = function(key) {
        if (key === 'search') searchInput.value = '';
        if (key === 'category') catFilter.value = 'all';
        if (key === 'level') diffFilter.value = 'all';
        if (key === 'duration') durFilter.value = 'all';
        if (key === 'rating') ratingFilter.value = 'all';
        if (key === 'price') priceFilter.value = 'all';
        if (key === 'skill') skillFilter.value = 'all';
        if (key === 'career_goal') careerGoalFilter.value = 'all';
        updateSearchClearVisibility();
        currentPage = 1;
        loadCatalog();
    };

    window.clearAllCatalogFilters = function() {
        if (searchInput) searchInput.value = '';
        if (catFilter) catFilter.value = 'all';
        if (diffFilter) diffFilter.value = 'all';
        if (durFilter) durFilter.value = 'all';
        if (ratingFilter) ratingFilter.value = 'all';
        if (priceFilter) priceFilter.value = 'all';
        if (skillFilter) skillFilter.value = 'all';
        if (careerGoalFilter) careerGoalFilter.value = 'all';
        if (sortBy) sortBy.value = 'recommended';
        updateSearchClearVisibility();
        currentPage = 1;
        loadCatalog();
    };

    function updateSearchClearVisibility() {
        if (searchClearBtn && searchInput) {
            searchClearBtn.style.display = searchInput.value.trim() ? 'block' : 'none';
        }
    }

    // Event listeners
    searchInput?.addEventListener('input', () => {
        updateSearchClearVisibility();
        debounce(() => { currentPage = 1; loadCatalog(); }, 350)();
    });

    searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            currentPage = 1;
            loadCatalog();
        }
    });

    searchBtn?.addEventListener('click', () => {
        currentPage = 1;
        loadCatalog();
    });

    searchClearBtn?.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        updateSearchClearVisibility();
        currentPage = 1;
        loadCatalog();
    });

    catFilter?.addEventListener('change', () => { currentPage = 1; loadCatalog(); });
    diffFilter?.addEventListener('change', () => { currentPage = 1; loadCatalog(); });
    durFilter?.addEventListener('change', () => { currentPage = 1; loadCatalog(); });
    ratingFilter?.addEventListener('change', () => { currentPage = 1; loadCatalog(); });
    priceFilter?.addEventListener('change', () => { currentPage = 1; loadCatalog(); });
    skillFilter?.addEventListener('change', () => { currentPage = 1; loadCatalog(); });
    careerGoalFilter?.addEventListener('change', () => { currentPage = 1; loadCatalog(); });
    sortBy?.addEventListener('change', () => { currentPage = 1; loadCatalog(); });
    clearFiltersBtn?.addEventListener('click', window.clearAllCatalogFilters);

    // Initial load
    loadCatalog();
}

/**
 * Populate Category, Skill, and Career Goal Dropdowns from DB
 */
async function populateFilterOptions(catFilter, skillFilter, careerGoalFilter) {
    try {
        const [categories, skills, goals] = await Promise.all([
            window.api.getCategories().catch(() => []),
            window.api.getSkills().catch(() => []),
            window.api.getCareerGoals().catch(() => [])
        ]);

        if (catFilter && categories && categories.length > 0) {
            const currentCat = catFilter.value;
            catFilter.innerHTML = `<option value="all">All Categories</option>` + 
                categories.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)} (${c.course_count || 0})</option>`).join('');
            if (currentCat) catFilter.value = currentCat;
        }

        if (skillFilter && skills && skills.length > 0) {
            const currentSkill = skillFilter.value;
            skillFilter.innerHTML = `<option value="all">All Skills</option>` + 
                skills.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join('');
            if (currentSkill) skillFilter.value = currentSkill;
        }

        if (careerGoalFilter && goals && goals.length > 0) {
            const currentGoal = careerGoalFilter.value;
            careerGoalFilter.innerHTML = `<option value="all">All Career Goals</option>` + 
                goals.map(g => `<option value="${escapeHtml(g.title)}">${escapeHtml(g.title)}</option>`).join('');
            if (currentGoal) careerGoalFilter.value = currentGoal;
        }
    } catch (e) {
        console.warn("Could not dynamically load filter options:", e);
    }
}

/**
 * Sync search and filter state into URL query params
 */
function syncUrlParams(params, page) {
    const url = new URL(window.location);
    Object.keys(params).forEach(key => {
        if (params[key] && params[key] !== 'all' && params[key] !== '') {
            url.searchParams.set(key, params[key]);
        } else {
            url.searchParams.delete(key);
        }
    });
    if (page > 1) {
        url.searchParams.set('page', page);
    } else {
        url.searchParams.delete('page');
    }
    window.history.replaceState({}, '', url.toString());
}

/**
 * Setup Structured Course Details View
 */
async function setupCourseDetailsPage(detailsContainer) {
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('id');

    if (!courseId) {
        detailsContainer.innerHTML = `
            <div class="empty-catalog-state">
                <div class="empty-catalog-icon" style="color: #EF4444;"><i class="fa-solid fa-circle-exclamation"></i></div>
                <h4 class="empty-catalog-title">No course specified</h4>
                <p class="empty-catalog-desc">Please return to the Course Catalog to select a course.</p>
                <a href="courses.html" class="btn-primary" style="display: inline-block; text-decoration: none; padding: 0.6rem 1.4rem; border-radius: 8px;">← Browse Catalog</a>
            </div>
        `;
        return;
    }

    try {
        const course = await window.api.getCourseDetails(courseId);
        if (!course) throw new Error("Course not found");

        let reviewsData = { total_reviews: 0, average_rating: course.rating || 4.8, reviews: [] };
        try {
            reviewsData = await window.api.getCourseReviews(course.id) || reviewsData;
        } catch (_) {}

        const reviewCount = reviewsData.total_reviews !== undefined ? reviewsData.total_reviews : (course.review_count || 0);
        const avgRatingVal = (reviewsData.average_rating || course.rating || 4.8).toFixed(1);
        const ratingDisplay = reviewCount > 0 
            ? `${avgRatingVal} (${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'})`
            : 'No reviews yet';
        
        const skillsList = (course.skills || []).map(s => `<span class="badge-role student" style="margin: 3px; padding: 0.4rem 0.85rem; font-size: 13px;">${escapeHtml(s)}</span>`).join('');
        const targetRolesList = (course.target_roles || course.career_goals || []).map(r => `<span style="display:inline-block; background:#EDE9FE; color:#5B21B6; padding:4px 12px; border-radius:8px; font-size:13px; font-weight:600; margin:3px 4px;">🎯 ${escapeHtml(r)}</span>`).join('');

        // Clean lists with robust empty messages (no empty bullets)
        const prereqsList = (course.prerequisites && course.prerequisites.length > 0)
            ? course.prerequisites.map(p => `<li><i class="fa-solid fa-circle-check" style="color:#10B981; margin-top:3px;"></i> <span>${escapeHtml(p)}</span></li>`).join('')
            : '<p class="details-empty-text">No specific prerequisites required. Beginners are welcome!</p>';

        const techReqsList = (course.technical_requirements && course.technical_requirements.length > 0)
            ? course.technical_requirements.map(t => `<li><i class="fa-solid fa-laptop-code" style="color:var(--primary-purple); margin-top:3px;"></i> <span>${escapeHtml(t)}</span></li>`).join('')
            : '<p class="details-empty-text">A standard modern web browser and internet connection.</p>';

        const recKnowledgeList = (course.recommended_knowledge && course.recommended_knowledge.length > 0)
            ? course.recommended_knowledge.map(r => `<li><i class="fa-solid fa-lightbulb" style="color:#F59E0B; margin-top:3px;"></i> <span>${escapeHtml(r)}</span></li>`).join('')
            : '<p class="details-empty-text">Basic computer literacy and enthusiasm to learn.</p>';

        const outcomesList = (course.learning_outcomes && course.learning_outcomes.length > 0)
            ? course.learning_outcomes.map(o => `<li style="display:flex; align-items:flex-start; gap:0.6rem; margin-bottom:0.6rem;"><i class="fa-solid fa-circle-check" style="color:#10B981; margin-top:3px;"></i> <span style="color:#334155;">${escapeHtml(o)}</span></li>`).join('')
            : '<li>Comprehensive theoretical foundation and practical applications in this domain.</li>';

        const isFreeCourse = course.is_free !== 0 && course.is_free !== false && (!course.price || Number(course.price) === 0);
        const priceTagHtml = isFreeCourse 
            ? `<div style="font-size:34px; font-weight:800; color:#059669; margin-bottom:0.25rem;">FREE</div><span style="font-size:13px; color:#10B981; font-weight:700;"><i class="fa-solid fa-gift mr-1"></i> Full Lifetime Access</span>`
            : `<div style="font-size:34px; font-weight:800; color:var(--primary-purple); margin-bottom:0.25rem;">₹${Number(course.price).toLocaleString()}</div><span style="font-size:12.5px; color:#64748b; font-weight:600;"><i class="fa-solid fa-shield-halved mr-1"></i> 30-Day Money Back Guarantee</span>`;

        // Demo video player
        const demoEmbedHtml = course.demo_video_url ? parseVideoEmbed(course.demo_video_url) : '';
        const demoVideoSection = demoEmbedHtml ? `
            <div style="margin-bottom: 2rem; border-radius: 16px; overflow: hidden; background: #0F172A; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
                <div style="padding: 0.75rem 1.25rem; background: #1E293B; display:flex; justify-content:space-between; align-items:center;">
                    <span style="color:#F8FAFC; font-weight:700; font-size:13px;"><i class="fa-solid fa-play mr-1" style="color:#10B981;"></i> Course Introduction & Demo Video</span>
                    <span style="color:#94A3B8; font-size:11px; background:#334155; padding:2px 8px; border-radius:4px;">Free Preview</span>
                </div>
                ${demoEmbedHtml}
            </div>
        ` : '';

        // Modules accordion with preview lessons
        const modulesAccordion = (course.modules && course.modules.length > 0) ? course.modules.map((m, mIdx) => `
            <div style="background:#F8F7FF; border:1px solid #EDE9FE; border-radius:12px; padding:1.25rem; margin-bottom:1rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
                    <h4 style="color:var(--dark-navy); font-size:15px; font-weight:700; margin:0;">${escapeHtml(m.title)}</h4>
                    <span style="font-size:12px; color:var(--secondary-text); font-weight:600;">${escapeHtml(m.duration || '')} • ${(m.lessons || []).length} lessons</span>
                </div>
                <ul style="margin-top:0.75rem; padding-left:0; list-style:none; font-size:13px; color:var(--secondary-text);">
                    ${(m.lessons || []).map((l, lIdx) => {
                        const isPreview = !!(l.is_preview || l.preview_enabled);
                        const typeIcon = l.type === 'video' ? 'fa-circle-play' : (l.type === 'quiz' ? 'fa-clipboard-question' : (l.type === 'document' || l.type === 'pdf' ? 'fa-file-pdf' : (l.type === 'article' || l.type === 'text' ? 'fa-newspaper' : (l.type === 'hands-on' || l.type === 'lab' ? 'fa-flask' : 'fa-link'))));
                        return `
                            <li style="margin-bottom:0.4rem; display:flex; justify-content:space-between; align-items:center; padding:0.45rem 0.75rem; border-radius:8px; background:#FFFFFF; border:1px solid #F1F5F9;">
                                <div style="display:flex; align-items:center; gap:0.6rem;">
                                    <i class="fa-solid ${typeIcon}" style="color:var(--primary-purple);"></i>
                                    <span style="color:var(--dark-navy); font-weight:500;">${escapeHtml(l.title)}</span>
                                    <span style="font-size:11px; color:#64748b;">(${escapeHtml(l.duration || '20 mins')})</span>
                                </div>
                                <div>
                                    ${isPreview ? `
                                        <button type="button" onclick="openLessonPreviewModal(${course.id}, ${l.lesson_id || (lIdx+1)})" style="background:#ECFDF5; color:#059669; border:1px solid #A7F3D0; font-size:11.5px; font-weight:700; padding:3px 9px; border-radius:6px; cursor:pointer;">
                                            <i class="fa-solid fa-unlock mr-1"></i> Free Preview
                                        </button>
                                    ` : `
                                        <span style="font-size:11.5px; color:#94A3B8;"><i class="fa-solid fa-lock mr-1"></i> Enrolled</span>
                                    `}
                                </div>
                            </li>
                        `;
                    }).join('')}
                </ul>
                ${m.materials ? `
                    <div style="margin-top:0.6rem; padding-top:0.5rem; border-top:1px dashed #DDD6FE; font-size:12px; color:#475569;">
                        <i class="fa-solid fa-folder-open mr-1" style="color:var(--primary-purple);"></i> <strong>Included Resources:</strong> ${escapeHtml(m.materials)}
                    </div>
                ` : ''}
            </div>
        `).join('') : '<p class="details-empty-text">Complete syllabus available upon enrollment.</p>';

        // Reviews list HTML
        const reviewsListHtml = (reviewsData.reviews && reviewsData.reviews.length > 0) ? reviewsData.reviews.map(r => `
            <div class="review-item-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <div style="width:28px; height:28px; border-radius:50%; background:#EEF2FF; color:var(--primary-purple); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">
                            ${escapeHtml((r.reviewer_name || 'S').charAt(0).toUpperCase())}
                        </div>
                        <strong style="color:var(--dark-navy); font-size:13.5px;">${escapeHtml(r.reviewer_name)}</strong>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <span style="color:#F59E0B; font-size:13px;">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
                        <span style="font-size:11.5px; color:#94A3B8;">${escapeHtml(r.created_at || 'Recent')}</span>
                    </div>
                </div>
                <p style="margin:0; font-size:13.5px; color:#475569; line-height:1.5;">${escapeHtml(r.comment || 'Great course with comprehensive practical examples.')}</p>
            </div>
        `).join('') : '<div style="background:#F8FAFC; border:1px dashed #CBD5E1; border-radius:8px; padding:1.5rem; text-align:center; color:#64748b; font-size:13.5px;">No student reviews yet. Be the first to review this course after enrolling!</div>';

        // Review submission box (for enrolled students)
        const reviewFormHtml = course.is_enrolled ? `
            <div class="review-submission-box" id="reviewSubmissionBox">
                <h4 style="margin:0 0 0.5rem 0; font-size:15px; color:var(--dark-navy); font-weight:700;"><i class="fa-solid fa-pen mr-1" style="color:var(--primary-purple);"></i> Rate & Review This Course</h4>
                <p style="margin:0 0 1rem 0; font-size:13px; color:#64748b;">Share your feedback and learning experience with other students.</p>
                
                <div style="margin-bottom:0.75rem;">
                    <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:0.25rem;">YOUR RATING</label>
                    <div class="star-rating-picker" id="starPicker">
                        <i class="fa-solid fa-star star active" data-rating="1"></i>
                        <i class="fa-solid fa-star star active" data-rating="2"></i>
                        <i class="fa-solid fa-star star active" data-rating="3"></i>
                        <i class="fa-solid fa-star star active" data-rating="4"></i>
                        <i class="fa-solid fa-star star active" data-rating="5"></i>
                    </div>
                </div>

                <div style="margin-bottom:1rem;">
                    <label for="reviewCommentInput" style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:0.25rem;">YOUR FEEDBACK</label>
                    <textarea id="reviewCommentInput" rows="3" placeholder="What did you learn? How was the instructor's teaching style?" style="width:100%; padding:0.75rem; border:1px solid #CBD5E1; border-radius:8px; font-size:13.5px; outline:none; resize:vertical;"></textarea>
                </div>

                <button type="button" onclick="submitCourseReviewAction(${course.id})" class="btn-primary" style="padding:0.6rem 1.4rem; font-size:13.5px; font-weight:700; border-radius:8px; border:none; cursor:pointer;">
                    <i class="fa-solid fa-paper-plane mr-1"></i> Submit Review
                </button>
            </div>
        ` : '';

        detailsContainer.innerHTML = `
            <div class="course-details-grid">
                <!-- Left: Main Overview & Syllabus -->
                <div>
                    ${demoVideoSection}

                    <div class="details-hero-card">
                        <div class="details-badge-row">
                            <span class="rec-category-badge" style="background:#FAF5FF; color:#6B21A8; border:1px solid #E9D5FF; padding:3px 10px; border-radius:20px; font-weight:700; font-size:11px;">${escapeHtml(course.category)}</span>
                            <span style="background:#F1F5F9; color:#475569; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700;"><i class="fa-solid fa-layer-group mr-1"></i> ${escapeHtml(course.level || course.difficulty || 'Intermediate')}</span>
                        </div>

                        <h1 class="details-title">${escapeHtml(course.title)}</h1>
                        ${course.short_description ? `<p class="details-short-desc">${escapeHtml(course.short_description)}</p>` : ''}
                        
                        <div class="details-meta-bar">
                            <span><i class="fa-solid fa-chalkboard-user mr-1" style="color:var(--primary-purple);"></i> <strong>${escapeHtml(course.instructor || course.instructor_name || 'SmartLearn Faculty')}</strong></span>
                            <span><i class="fa-solid fa-clock mr-1" style="color:var(--magenta-pink);"></i> ${escapeHtml(course.duration || '30 hours')}</span>
                            <span><i class="fa-solid fa-star mr-1" style="color:#F59E0B;"></i> ${ratingDisplay}</span>
                            <span><i class="fa-solid fa-users mr-1" style="color:#06B6D4;"></i> ${course.enrollment_count || 0} students enrolled</span>
                        </div>

                        <h3 class="details-section-title"><i class="fa-solid fa-book-open"></i> About This Course</h3>
                        <p style="color:var(--secondary-text); font-size:15px; line-height:1.75; margin-bottom:2rem; white-space:pre-line;">${escapeHtml(course.description || course.detailed_description || course.short_description || '')}</p>

                        <h3 class="details-section-title"><i class="fa-solid fa-circle-check"></i> What You Will Learn</h3>
                        <ul style="list-style:none; padding-left:0; line-height:1.8; margin-bottom:2rem; font-size:14px;">
                            ${outcomesList}
                        </ul>

                        <h3 class="details-section-title"><i class="fa-solid fa-bolt"></i> Skills You Will Master</h3>
                        <div style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-bottom:2rem;">
                            ${skillsList || '<p class="details-empty-text">Core domain skills.</p>'}
                        </div>

                        ${targetRolesList ? `
                            <h3 class="details-section-title"><i class="fa-solid fa-bullseye"></i> Target Roles & Career Alignment</h3>
                            <div style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-bottom:2rem;">
                                ${targetRolesList}
                            </div>
                        ` : ''}

                        <h3 class="details-section-title"><i class="fa-solid fa-list-check"></i> Course Curriculum & Syllabus</h3>
                        <div style="margin-bottom:2rem;">
                            ${modulesAccordion}
                        </div>

                        <!-- Reviews & Ratings Section -->
                        <h3 class="details-section-title"><i class="fa-solid fa-star" style="color:#F59E0B;"></i> Student Ratings & Reviews</h3>
                        <div style="margin-bottom:2rem;">
                            <div style="display:flex; align-items:center; gap:1.5rem; background:#F8F7FF; border:1px solid #EDE9FE; border-radius:12px; padding:1.25rem 1.5rem; margin-bottom:1.5rem;">
                                <div style="text-align:center;">
                                    <div style="font-size:2.5rem; font-weight:800; color:var(--dark-navy); line-height:1;">${avgRatingVal}</div>
                                    <div style="color:#F59E0B; font-size:16px; margin:4px 0;">★★★★★</div>
                                    <div style="font-size:11.5px; color:#64748b;">${reviewCount} total reviews</div>
                                </div>
                                <div style="flex:1; border-left:1px solid #E2E8F0; padding-left:1.5rem;">
                                    <p style="margin:0; font-size:13.5px; color:#475569;">
                                        Learner feedback and peer reviews for this curriculum. Only enrolled learners who have taken lessons can rate this course.
                                    </p>
                                </div>
                            </div>

                            ${reviewFormHtml}

                            <div id="courseReviewsListContainer">
                                ${reviewsListHtml}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Right: Enrollment & Requirements Sidebar -->
                <div>
                    <div class="details-action-box">
                        <div style="text-align:center; margin-bottom:1.5rem;">
                            ${priceTagHtml}
                        </div>

                        <div style="display:flex; flex-direction:column; gap:0.75rem; margin-bottom:1.75rem;">
                            ${course.is_enrolled ? `
                                <div style="background:#DCFCE7; color:#166534; padding:0.85rem; border-radius:10px; text-align:center; font-weight:700; font-size:14px;">
                                    <i class="fa-solid fa-circle-check"></i> You are enrolled! (${course.progress_percentage || 0}% completed)
                                </div>
                                <a href="course-player.html?id=${course.id}&lesson=${course.last_lesson_id || ''}" class="btn-primary" style="text-align:center; text-decoration:none; padding:0.85rem; font-weight:700; font-size:15px; border-radius:10px;">Continue Learning →</a>
                            ` : (isFreeCourse ? `
                                <button onclick="enrollInCourse(${course.id}, true, 0)" class="btn-primary" style="padding:0.95rem; border:none; cursor:pointer; font-size:16px; font-weight:700; border-radius:10px;">
                                    <i class="fa-solid fa-gift mr-1"></i> Enroll in Free Course →
                                </button>
                            ` : `
                                <a href="checkout.html?course_id=${course.id}" class="btn-primary" style="text-align:center; text-decoration:none; padding:0.95rem; border:none; cursor:pointer; font-size:16px; font-weight:700; border-radius:10px; display:block;">
                                    <i class="fa-solid fa-lock mr-1"></i> Enroll Now — ₹${Number(course.price).toLocaleString()} →
                                </a>
                            `)}
                            <button onclick="toggleCourseWishlist(${course.id}, this)" class="btn-outline" style="padding:0.75rem; border:1px solid #CBD5E1; cursor:pointer; border-radius:10px; font-weight:600;">
                                <i class="fa-solid fa-heart mr-1" style="color:${course.is_wishlisted ? '#E83FA5' : 'inherit'};"></i> ${course.is_wishlisted ? 'Saved in Wishlist' : 'Add to Wishlist'}
                            </button>
                        </div>

                        <!-- Requirements Cards -->
                        <div class="details-req-card">
                            <div class="details-req-title"><i class="fa-solid fa-clipboard-check" style="color:#10B981;"></i> Prerequisites</div>
                            <ul class="details-req-list">
                                ${prereqsList}
                            </ul>
                        </div>

                        <div class="details-req-card">
                            <div class="details-req-title"><i class="fa-solid fa-laptop-code" style="color:var(--primary-purple);"></i> Technical Requirements</div>
                            <ul class="details-req-list">
                                ${techReqsList}
                            </ul>
                        </div>

                        <div class="details-req-card">
                            <div class="details-req-title"><i class="fa-solid fa-lightbulb" style="color:#F59E0B;"></i> Recommended Knowledge</div>
                            <ul class="details-req-list">
                                ${recKnowledgeList}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;

        setupStarPicker();

    } catch (err) {
        console.error("Course details load error:", err);
        detailsContainer.innerHTML = `
            <div class="empty-catalog-state">
                <div class="empty-catalog-icon" style="color: #EF4444;"><i class="fa-solid fa-circle-exclamation"></i></div>
                <h4 class="empty-catalog-title">Failed to load course</h4>
                <p class="empty-catalog-desc">${escapeHtml(err.message || 'Error fetching course details.')}</p>
                <a href="courses.html" class="btn-primary" style="display:inline-block; text-decoration:none; padding:0.6rem 1.4rem; border-radius:8px;">← Return to Catalog</a>
            </div>
        `;
    }
}

let selectedReviewRating = 5;
function setupStarPicker() {
    const starPicker = document.getElementById('starPicker');
    if (!starPicker) return;
    const stars = starPicker.querySelectorAll('.star');
    stars.forEach(s => {
        s.addEventListener('click', () => {
            const rating = parseInt(s.dataset.rating, 10) || 5;
            selectedReviewRating = rating;
            stars.forEach(st => {
                const rVal = parseInt(st.dataset.rating, 10);
                if (rVal <= rating) {
                    st.classList.add('active');
                } else {
                    st.classList.remove('active');
                }
            });
        });
    });
}

window.submitCourseReviewAction = async function(courseId) {
    const commentInput = document.getElementById('reviewCommentInput');
    const comment = commentInput ? commentInput.value.trim() : '';

    try {
        await window.api.submitCourseReview(courseId, selectedReviewRating, comment);
        alert('Thank you for submitting your review!');
        const detailsContainer = document.getElementById('courseDetailsContent');
        if (detailsContainer) {
            await setupCourseDetailsPage(detailsContainer);
        }
    } catch (err) {
        alert('Failed to submit review: ' + (err.message || err));
    }
};

/**
 * Setup Student My Courses View
 */
async function setupMyCoursesPage(myCoursesGrid) {
    try {
        const enrolled = await window.api.getMyCourses();

        // Update Summary Stats
        const totalEnrolled = enrolled.length;
        const totalInProgress = enrolled.filter(c => (c.progress || 0) < 100 && (c.progress || 0) > 0).length;
        const totalCompleted = enrolled.filter(c => (c.progress || 0) >= 100).length;
        const totalNotStarted = enrolled.filter(c => (c.progress || 0) === 0).length;

        const statEnrolled = document.getElementById('statEnrolledCount');
        const statInProgress = document.getElementById('statInProgressCount');
        const statCompleted = document.getElementById('statCompletedCount');

        if (statEnrolled) statEnrolled.textContent = totalEnrolled;
        if (statInProgress) statInProgress.textContent = totalInProgress + totalNotStarted;
        if (statCompleted) statCompleted.textContent = totalCompleted;

        if (enrolled.length === 0) {
            myCoursesGrid.innerHTML = `
                <div class="empty-catalog-state" style="grid-column: 1 / -1;">
                    <div class="empty-catalog-icon"><i class="fa-solid fa-graduation-cap"></i></div>
                    <h4 class="empty-catalog-title">No active enrollments</h4>
                    <p class="empty-catalog-desc">Explore our course catalog to find courses that align with your career goals!</p>
                    <a href="courses.html" class="btn-primary" style="display:inline-block; margin-top:1rem; text-decoration:none; padding:0.65rem 1.4rem; border-radius:8px;">Browse Catalog →</a>
                </div>
            `;
        } else {
            myCoursesGrid.innerHTML = enrolled.map(c => {
                const progressPct = Math.min(100, Math.max(0, c.progress || 0));
                const isCompleted = progressPct >= 100;
                const isNotStarted = progressPct === 0;

                let statusLabel = 'In Progress';
                let statusClass = 'in_progress';
                if (isCompleted) {
                    statusLabel = 'Completed';
                    statusClass = 'completed';
                } else if (isNotStarted) {
                    statusLabel = 'Not Started';
                    statusClass = 'not_started';
                }

                const totalLessons = c.total_lessons || 12;
                const completedLessons = c.completed_lessons !== undefined ? c.completed_lessons : Math.round((progressPct / 100) * totalLessons);
                
                // Calculate next unfinished lesson for Continue Learning
                const completedIds = Array.isArray(c.completed_lesson_ids) ? c.completed_lesson_ids.map(Number) : [];
                let nextLessonId = c.last_lesson_id || 1;
                if (completedIds.length > 0 && !isCompleted) {
                    const maxCompleted = Math.max(...completedIds);
                    nextLessonId = maxCompleted + 1;
                }

                const thumbStyle = c.thumbnail_url 
                    ? `background-image: url('${escapeHtml(c.thumbnail_url)}'); background-size: cover; background-position: center;`
                    : '';

                return `
                    <div class="my-course-card">
                        <div class="my-course-thumb" style="${thumbStyle}">
                            ${!c.thumbnail_url ? `<i class="fa-solid fa-graduation-cap"></i>` : ''}
                            <span class="card-difficulty-badge" style="left:10px; top:10px; background: rgba(15, 23, 42, 0.75); color: #fff; backdrop-filter: blur(4px);">${escapeHtml(c.category || 'Course')}</span>
                            <span class="my-course-badge-status ${statusClass}">${statusLabel}</span>
                        </div>
                        <div class="my-course-body">
                            <h3 style="font-size:15px; font-weight:700; color:var(--dark-navy); margin:0 0 0.5rem 0; line-height:1.4;">
                                <a href="course-details.html?id=${c.course_id}" style="text-decoration:none; color:inherit;">${escapeHtml(c.title)}</a>
                            </h3>

                            <div style="font-size:12.5px; color:#64748b; margin-bottom:0.75rem; display:flex; align-items:center; gap:0.4rem;">
                                <i class="fa-solid fa-chalkboard-user" style="color:var(--primary-purple);"></i>
                                <span>Instructor: <strong>${escapeHtml(c.instructor || 'SmartLearn Faculty')}</strong></span>
                            </div>

                            <div style="display:flex; justify-content:space-between; font-size:12px; color:#475569; margin-bottom:0.75rem; background:#F8FAFC; padding:0.4rem 0.6rem; border-radius:6px;">
                                <span><i class="fa-solid fa-layer-group mr-1"></i> ${escapeHtml(c.level || c.difficulty || 'Intermediate')}</span>
                                <span><i class="fa-solid fa-clock mr-1"></i> ${escapeHtml(c.duration || '30 hours')}</span>
                            </div>

                            <div style="margin-top:auto; padding-top:0.75rem; border-top:1px solid #F1F5F9;">
                                <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:600; color:#334155; margin-bottom:0.35rem;">
                                    <span>Progress</span>
                                    <span style="color:var(--primary-purple); font-weight:700;">${progressPct}%</span>
                                </div>

                                <div style="height:6px; background:#F1F5F9; border-radius:9999px; overflow:hidden; margin-bottom:0.45rem;">
                                    <div style="width:${progressPct}%; height:100%; background:linear-gradient(90deg, #5B3FE8, #10B981); border-radius:9999px; transition:width 0.3s;"></div>
                                </div>

                                <div style="font-size:11.5px; color:#64748b; margin-bottom:1rem;">
                                    ${completedLessons} of ${totalLessons} lessons completed
                                </div>

                                <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
                                    <a href="course-player.html?id=${c.course_id}&lesson=${nextLessonId}" class="btn-primary" style="padding:0.5rem 1rem; border-radius:8px; font-size:12.5px; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:0.35rem;">
                                        <i class="fa-solid fa-play" style="font-size:11px;"></i> ${isCompleted ? 'Review Course' : 'Continue Learning'}
                                    </a>
                                    <a href="course-details.html?id=${c.course_id}" style="color:var(--primary-purple); font-size:12.5px; font-weight:700; text-decoration:none;">View Syllabus</a>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (e) {
        myCoursesGrid.innerHTML = `<p style="color:#EF4444; grid-column:1/-1;">${escapeHtml(e.message)}</p>`;
    }
}

// Utility & Modal Functions

function debounce(fn, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}

async function enrollInCourse(courseId, isFree = true, price = 0) {
    if (!isFree && price > 0) {
        window.location.href = `checkout.html?course_id=${courseId}`;
        return;
    }

    try {
        const res = await window.api.enrollCourse(courseId);
        alert(res?.message || '🎉 Successfully enrolled! You can now track your learning journey in My Courses.');
        window.location.reload();
    } catch (e) {
        if (e.message && e.message.includes('paid course')) {
            window.location.href = `checkout.html?course_id=${courseId}`;
        } else {
            alert('Enrollment notice: ' + e.message);
        }
    }
}

async function toggleCourseWishlist(courseId, btn) {
    try {
        const res = await window.api.toggleWishlist(courseId);
        alert(res.message);
        window.location.reload();
    } catch (e) {
        alert('Wishlist action failed: ' + e.message);
    }
}

// Preview Lesson Modal Handlers
window.openLessonPreviewModal = async function(courseId, lessonId) {
    const modal = document.getElementById('lessonPreviewModal');
    const titleEl = document.getElementById('previewModalTitle');
    const bodyEl = document.getElementById('previewModalBody');
    if (!modal || !bodyEl) return;

    modal.style.display = 'flex';
    titleEl.textContent = 'Loading Lesson Preview...';
    bodyEl.innerHTML = `<div style="text-align:center; padding:3rem; color:#64748b;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top:0.5rem;">Loading preview content...</p></div>`;

    try {
        const data = await window.api.getPreviewLesson(courseId, lessonId);
        titleEl.textContent = `${data.title} (${data.duration || '20 mins'})`;

        const type = (data.type || 'video').toLowerCase();
        let playerHtml = '';

        if (type === 'video' && data.video_url) {
            const vidUrl = data.video_url;
            if (vidUrl.includes('youtube.com/watch') || vidUrl.includes('youtu.be')) {
                let vidId = '';
                if (vidUrl.includes('v=')) vidId = vidUrl.split('v=')[1]?.split('&')[0];
                else if (vidUrl.includes('youtu.be/')) vidId = vidUrl.split('youtu.be/')[1]?.split('?')[0];
                playerHtml = `
                    <div style="background:#0F172A; border-radius:10px; overflow:hidden; margin-bottom:1rem; aspect-ratio:16/9;">
                        <iframe src="https://www.youtube.com/embed/${vidId}?autoplay=1" style="width:100%; height:100%; border:none;" allowfullscreen allow="autoplay"></iframe>
                    </div>
                `;
            } else {
                const fullUrl = vidUrl.startsWith('/uploads/') ? 'http://127.0.0.1:8080' + vidUrl : vidUrl;
                playerHtml = `
                    <div style="background:#0F172A; border-radius:10px; overflow:hidden; margin-bottom:1rem;">
                        <video controls autoplay style="width:100%; max-height:420px; display:block;" src="${escapeHtml(fullUrl)}"></video>
                    </div>
                `;
            }

            bodyEl.innerHTML = `
                ${playerHtml}
                ${data.content ? `<div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:1rem; margin-top:0.75rem; font-size:13.5px; line-height:1.6; color:#334155;">${escapeHtml(data.content)}</div>` : ''}
                <div style="font-size:12.5px; color:#64748B; margin-top:0.75rem;">
                    <strong>Lesson Type:</strong> Video Lecture • <strong>Duration:</strong> ${escapeHtml(data.duration || '20 mins')}
                </div>
            `;
        } else if (type === 'article' || type === 'text' || data.content) {
            bodyEl.innerHTML = `
                <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:1.5rem; line-height:1.7; font-size:14px; color:#1E293B; white-space:pre-wrap;">
                    ${escapeHtml(data.content || data.article_content || 'No text content available for this lesson.')}
                </div>
            `;
        } else if (type === 'document' || type === 'pdf') {
            const docUrl = data.document_url?.startsWith('/uploads/') ? 'http://127.0.0.1:8080' + data.document_url : (data.document_url || '#');
            bodyEl.innerHTML = `
                <div style="text-align:center; padding:2rem; background:#F8FAFC; border-radius:8px;">
                    <i class="fa-solid fa-file-pdf" style="font-size:3rem; color:#EF4444; margin-bottom:1rem;"></i>
                    <h4 style="margin-bottom:0.5rem; color:#1E293B;">Sample Lesson Document / PDF</h4>
                    <p style="font-size:13px; color:#64748b; margin-bottom:1.5rem;">Preview the lesson material attached to this module.</p>
                    <a href="${escapeHtml(docUrl)}" target="_blank" class="btn-primary" style="text-decoration:none; padding:0.6rem 1.25rem; font-size:13px; border-radius:6px; display:inline-block;">
                        <i class="fa-solid fa-arrow-up-right-from-square mr-1"></i> Open Document in New Tab
                    </a>
                </div>
            `;
        } else {
            bodyEl.innerHTML = `
                <div style="text-align:center; padding:2rem; color:#64748b;">
                    <p>Free sample lesson available. Enroll in the full course for complete interactive exercises and certification!</p>
                </div>
            `;
        }
    } catch (err) {
        bodyEl.innerHTML = `<div style="text-align:center; color:#EF4444; padding:2rem;"><i class="fa-solid fa-circle-exclamation fa-2x mb-2"></i><p>${escapeHtml(err.message)}</p></div>`;
    }
};

window.closeLessonPreviewModal = function() {
    const modal = document.getElementById('lessonPreviewModal');
    if (modal) {
        modal.style.display = 'none';
        const bodyEl = document.getElementById('previewModalBody');
        if (bodyEl) bodyEl.innerHTML = '';
    }
};

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
    return `<video controls style="width:100%; max-height:420px; aspect-ratio:16/9; border-radius:10px; background:#000; display:block;" src="${escapeHtml(resolvedUrl)}"></video>`;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}



