document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Mobile Navigation Toggle
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const navbar = document.getElementById('navbar');
    
    if (mobileBtn && navbar) {
        mobileBtn.addEventListener('click', () => {
            navbar.classList.toggle('active');
            
            // Toggle icon between bars and times (close)
            const icon = mobileBtn.querySelector('i');
            if (navbar.classList.contains('active')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-xmark');
            } else {
                icon.classList.remove('fa-xmark');
                icon.classList.add('fa-bars');
            }
        });

        // Close mobile menu when a link is clicked
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
    }

    // 2. Sticky Header & Active Nav Link Tracking
    const header = document.getElementById('header');
    const sections = document.querySelectorAll('section[id]');
    
    function updateHeaderAndNav() {
        const scrollY = window.pageYOffset;
        
        // Sticky Header
        if (scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
        
        // Active Nav Link
        sections.forEach(section => {
            const sectionHeight = section.offsetHeight;
            const sectionTop = section.offsetTop - 150; // Offset for sticky header
            const sectionId = section.getAttribute('id');
            
            if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
                const activeLink = document.querySelector(`.nav-links a[href*=${sectionId}]`);
                if (activeLink) {
                    // Remove active from all
                    document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
                    // Add active to current
                    activeLink.classList.add('active');
                }
            }
        });
    }

    window.addEventListener('scroll', updateHeaderAndNav);
    // Initial call
    updateHeaderAndNav();

    // 3. Intersection Observer for Fade-In Animations
    // Respect prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    if (!prefersReducedMotion) {
        const fadeElements = document.querySelectorAll('.fade-in-up, .fade-in-left, .fade-in-right');
        
        const fadeObserverOptions = {
            root: null,
            threshold: 0.1,
            rootMargin: "0px 0px -50px 0px"
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
        // If reduced motion is preferred, make everything visible immediately
        document.querySelectorAll('.fade-in-up, .fade-in-left, .fade-in-right').forEach(el => {
            el.classList.add('visible');
            el.style.opacity = '1';
            el.style.transform = 'none';
        });
    }

    // 4. Animated Counters
    const counters = document.querySelectorAll('.counter');
    let hasAnimatedCounters = false;
    const statsSection = document.getElementById('statistics');
    
    if (counters.length > 0 && statsSection && !prefersReducedMotion) {
        const statsObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !hasAnimatedCounters) {
                hasAnimatedCounters = true;
                
                counters.forEach(counter => {
                    const target = +counter.getAttribute('data-target');
                    const duration = 2000; // 2 seconds
                    const increment = target / (duration / 16); // 60fps
                    
                    let current = 0;
                    
                    const updateCounter = () => {
                        current += increment;
                        if (current < target) {
                            counter.innerText = Math.ceil(current);
                            requestAnimationFrame(updateCounter);
                        } else {
                            counter.innerText = target.toLocaleString(); // Add commas for thousands
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

    // 5. Skill Gap Progress Bars Animation
    const skillGapSection = document.getElementById('skill-gap');
    const progressFills = document.querySelectorAll('.progress-fill');
    let hasAnimatedBars = false;

    if (skillGapSection && progressFills.length > 0) {
        if (!prefersReducedMotion) {
            const barsObserver = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && !hasAnimatedBars) {
                    hasAnimatedBars = true;
                    
                    // Add a small delay so the section fades in first
                    setTimeout(() => {
                        progressFills.forEach(fill => {
                            const targetWidth = fill.getAttribute('data-width');
                            fill.style.width = targetWidth;
                        });
                    }, 300);
                }
            }, { threshold: 0.3 });

            barsObserver.observe(skillGapSection);
        } else {
            // Instant fill for reduced motion
            progressFills.forEach(fill => {
                fill.style.width = fill.getAttribute('data-width');
                fill.style.transition = 'none';
            });
        }
    }

});
