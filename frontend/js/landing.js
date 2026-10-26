/**
 * SmartLearn Landing Page Controller
 * Handles header scrolling, active link tracking, mobile navigation,
 * dynamic auth buttons, course detail links with login redirection,
 * and interactive animations.
 */
document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // 1. MOBILE NAVIGATION TOGGLE & CLICK-OUTSIDE
    // ==========================================
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const navbar = document.getElementById('navbar');
    
    if (mobileBtn && navbar) {
        mobileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navbar.classList.toggle('active');
            
            const icon = mobileBtn.querySelector('i');
            if (navbar.classList.contains('active')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-xmark');
            } else {
                icon.classList.remove('fa-xmark');
                icon.classList.add('fa-bars');
            }
        });

        // Close mobile menu when a nav link is clicked
        const navLinks = navbar.querySelectorAll('a');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                navbar.classList.remove('active');
                const icon = mobileBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-xmark');
                    icon.classList.add('fa-bars');
                }
            });
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (navbar.classList.contains('active') && !navbar.contains(e.target) && !mobileBtn.contains(e.target)) {
                navbar.classList.remove('active');
                const icon = mobileBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-xmark');
                    icon.classList.add('fa-bars');
                }
            }
        });
    }

    // ==========================================
    // 2. STICKY HEADER & ACTIVE NAV LINK TRACKING
    // ==========================================
    const header = document.getElementById('header');
    const sections = document.querySelectorAll('section[id]');
    
    function updateHeaderAndNav() {
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;
        
        // Sticky Header appearance
        if (header) {
            if (scrollY > 40) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        }
        
        // Active Nav Link Tracking
        let currentSectionId = '';
        sections.forEach(section => {
            const sectionHeight = section.offsetHeight;
            const sectionTop = section.offsetTop - 120; // Offset for fixed navbar
            const sectionId = section.getAttribute('id');
            
            if (scrollY >= sectionTop && scrollY < sectionTop + sectionHeight) {
                currentSectionId = sectionId;
            }
        });

        if (scrollY < 100) {
            currentSectionId = 'home';
        }

        if (currentSectionId) {
            document.querySelectorAll('.nav-links a').forEach(a => {
                const href = a.getAttribute('href');
                if (href === `#${currentSectionId}`) {
                    a.classList.add('active');
                } else if (href && href.startsWith('#')) {
                    a.classList.remove('active');
                }
            });
        }
    }

    window.addEventListener('scroll', updateHeaderAndNav, { passive: true });
    updateHeaderAndNav();

    // ==========================================
    // 3. AUTHENTICATION STATE & DYNAMIC BUTTONS
    // ==========================================
    function setupAuthAndCourseLinks() {
        const token = localStorage.getItem('smartlearn_token');
        const userStr = localStorage.getItem('smartlearn_user');
        let user = null;
        if (token && userStr) {
            try {
                user = JSON.parse(userStr);
            } catch (_) {}
        }

        const isStudent = user && (!user.role || user.role.toUpperCase() === 'STUDENT');
        const isAdmin = user && user.role && user.role.toUpperCase() === 'ADMIN';
        const isInstructor = user && user.role && user.role.toUpperCase() === 'INSTRUCTOR';

        // 1. Update Header Auth Buttons
        const navAuthButtons = document.getElementById('navAuthButtons');
        if (user && navAuthButtons) {
            let portalUrl = 'student/dashboard.html';
            let portalLabel = 'Dashboard';
            if (isAdmin) {
                portalUrl = 'admin/dashboard.html';
                portalLabel = 'Admin Portal';
            } else if (isInstructor) {
                portalUrl = 'instructor/dashboard.html';
                portalLabel = 'Instructor Portal';
            }

            navAuthButtons.innerHTML = `
                <a href="${portalUrl}" class="btn btn-primary" id="navDashboardBtn">
                    <i class="fa-solid fa-gauge-high" style="margin-right: 6px;"></i> ${portalLabel}
                </a>
            `;
        }

        // 2. Update Course Card "View Course" Buttons
        const courseButtons = document.querySelectorAll('.btn-course-view');
        courseButtons.forEach(btn => {
            const courseId = btn.getAttribute('data-course-id') || '1';
            if (user && isStudent) {
                btn.href = `student/course-details.html?id=${encodeURIComponent(courseId)}`;
            } else {
                btn.href = `login.html?redirect=student/course-details.html?id=${encodeURIComponent(courseId)}&course_id=${encodeURIComponent(courseId)}`;
            }
        });

        // 3. Update "View All Courses" CTA
        const viewAllBtn = document.getElementById('viewAllCoursesBtn');
        if (viewAllBtn) {
            if (user && isStudent) {
                viewAllBtn.href = 'student/courses.html';
            } else {
                viewAllBtn.href = 'login.html?redirect=student/courses.html';
            }
        }
    }

    setupAuthAndCourseLinks();

    // ==========================================
    // 4. INTERSECTION OBSERVER FOR FADE-IN ANIMATIONS
    // ==========================================
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    if (!prefersReducedMotion) {
        const fadeElements = document.querySelectorAll('.fade-in-up, .fade-in-left, .fade-in-right');
        
        const fadeObserverOptions = {
            root: null,
            threshold: 0.1,
            rootMargin: "0px 0px -40px 0px"
        };

        const fadeObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, fadeObserverOptions);

        fadeElements.forEach(element => {
            fadeObserver.observe(element);
        });
    } else {
        document.querySelectorAll('.fade-in-up, .fade-in-left, .fade-in-right').forEach(el => {
            el.classList.add('visible');
            el.style.opacity = '1';
            el.style.transform = 'none';
        });
    }

    // ==========================================
    // 5. ANIMATED COUNTERS
    // ==========================================
    const counters = document.querySelectorAll('.counter');
    let hasAnimatedCounters = false;
    const statsSection = document.getElementById('statistics');
    
    if (counters.length > 0 && statsSection && !prefersReducedMotion) {
        const statsObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !hasAnimatedCounters) {
                hasAnimatedCounters = true;
                
                counters.forEach(counter => {
                    const target = +counter.getAttribute('data-target');
                    const duration = 2000;
                    const increment = target / (duration / 16);
                    
                    let current = 0;
                    const updateCounter = () => {
                        current += increment;
                        if (current < target) {
                            counter.innerText = Math.ceil(current);
                            requestAnimationFrame(updateCounter);
                        } else {
                            counter.innerText = target.toLocaleString();
                        }
                    };
                    updateCounter();
                });
            }
        }, { threshold: 0.2 });
        
        statsObserver.observe(statsSection);
    } else if (prefersReducedMotion) {
        counters.forEach(counter => {
            counter.innerText = (+counter.getAttribute('data-target')).toLocaleString();
        });
    }

    // ==========================================
    // 6. SKILL GAP PROGRESS BARS ANIMATION
    // ==========================================
    const skillGapSection = document.getElementById('skill-gap');
    const progressFills = document.querySelectorAll('.progress-fill');
    let hasAnimatedBars = false;

    if (skillGapSection && progressFills.length > 0) {
        if (!prefersReducedMotion) {
            const barsObserver = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && !hasAnimatedBars) {
                    hasAnimatedBars = true;
                    setTimeout(() => {
                        progressFills.forEach(fill => {
                            const targetWidth = fill.getAttribute('data-width');
                            fill.style.width = targetWidth;
                        });
                    }, 250);
                }
            }, { threshold: 0.3 });

            barsObserver.observe(skillGapSection);
        } else {
            progressFills.forEach(fill => {
                fill.style.width = fill.getAttribute('data-width');
                fill.style.transition = 'none';
            });
        }
    }

});
