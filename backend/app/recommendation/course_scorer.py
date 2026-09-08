"""Course catalog and scoring logic for SmartLearn recommendation engine."""
from typing import List, Dict, Any, Optional

COURSE_CATALOG: List[Dict[str, Any]] = [
    {
        "id": 1,
        "title": "Full Stack Web Development Bootcamp",
        "category": "Web Development",
        "description": "Master frontend and backend with React, Node.js, Express, MongoDB, and modern REST APIs.",
        "instructor": "Alex Turner",
        "rating": 4.9,
        "review_count": 1280,
        "duration": "48 hours",
        "lessons_count": 36,
        "level": "Intermediate",
        "icon": "fa-solid fa-code",
        "color_theme": "linear-gradient(135deg, #4F46E5, #7C3AED)",
        "skills": ["JavaScript", "React", "Node.js", "Express", "MongoDB", "REST APIs", "HTML", "CSS"],
        "target_roles": ["Full Stack Developer", "Full Stack Web Developer", "Frontend Developer", "Backend Developer"],
        "domains": ["Web Development", "Software Engineering", "Full Stack"]
    },
    {
        "id": 2,
        "title": "Advanced React & Next.js Architecture",
        "category": "Frontend Development",
        "description": "Build high-performance, scalable web apps with Next.js 14, TypeScript, Server Components, and Tailwind CSS.",
        "instructor": "Sarah Jenkins",
        "rating": 4.8,
        "review_count": 940,
        "duration": "32 hours",
        "lessons_count": 28,
        "level": "Advanced",
        "icon": "fa-brands fa-react",
        "color_theme": "linear-gradient(135deg, #2563EB, #38BDF8)",
        "skills": ["React", "Next.js", "TypeScript", "Tailwind CSS", "State Management", "Performance Optimization"],
        "target_roles": ["Frontend Developer", "Full Stack Developer", "UI Engineer"],
        "domains": ["Web Development", "Frontend Development"]
    },
    {
        "id": 3,
        "title": "High-Performance Backend with FastAPI & Python",
        "category": "Backend Development",
        "description": "Design asynchronous microservices, PostgreSQL databases, JWT authentication, and Docker containerization.",
        "instructor": "Marcus Chen",
        "rating": 4.9,
        "review_count": 1120,
        "duration": "28 hours",
        "lessons_count": 24,
        "level": "Intermediate",
        "icon": "fa-brands fa-python",
        "color_theme": "linear-gradient(135deg, #059669, #10B981)",
        "skills": ["Python", "FastAPI", "PostgreSQL", "Docker", "REST APIs", "Redis", "SQLAlchemy"],
        "target_roles": ["Backend Developer", "Python Developer", "Software Engineer", "Full Stack Developer"],
        "domains": ["Backend Development", "Software Engineering", "Cloud & DevOps"]
    },
    {
        "id": 4,
        "title": "Data Science & Machine Learning Masterclass",
        "category": "Data Science & AI",
        "description": "Comprehensive pipeline from exploratory data analysis to training predictive Scikit-Learn models and deep neural nets.",
        "instructor": "Dr. Emily Watson",
        "rating": 4.9,
        "review_count": 1650,
        "duration": "54 hours",
        "lessons_count": 42,
        "level": "Intermediate",
        "icon": "fa-solid fa-brain",
        "color_theme": "linear-gradient(135deg, #7C3AED, #EC4899)",
        "skills": ["Python", "Pandas", "NumPy", "Machine Learning", "Scikit-learn", "SQL", "Data Visualization"],
        "target_roles": ["Data Scientist", "Machine Learning Engineer", "AI / Machine Learning Engineer", "Data Analyst"],
        "domains": ["Data Science & AI", "Machine Learning", "Data Analysis"]
    },
    {
        "id": 5,
        "title": "Applied Deep Learning with PyTorch & Generative AI",
        "category": "Artificial Intelligence",
        "description": "Build Convolutional Networks, Transformers, LLM fine-tuning pipelines, and Computer Vision models.",
        "instructor": "David K.",
        "rating": 4.8,
        "review_count": 820,
        "duration": "40 hours",
        "lessons_count": 30,
        "level": "Advanced",
        "icon": "fa-solid fa-robot",
        "color_theme": "linear-gradient(135deg, #DC2626, #F97316)",
        "skills": ["PyTorch", "Deep Learning", "NLP", "Transformers", "Computer Vision", "Python"],
        "target_roles": ["AI / Machine Learning Engineer", "AI Researcher", "Data Scientist"],
        "domains": ["Artificial Intelligence", "Data Science & AI", "Machine Learning"]
    },
    {
        "id": 6,
        "title": "AWS Cloud Solutions Architect & DevOps Pipeline",
        "category": "Cloud & DevOps",
        "description": "Design resilient multi-tier cloud architectures on AWS with Terraform, Kubernetes, and CI/CD automation.",
        "instructor": "Rachel Green",
        "rating": 4.9,
        "review_count": 1430,
        "duration": "38 hours",
        "lessons_count": 32,
        "level": "Intermediate",
        "icon": "fa-solid fa-cloud",
        "color_theme": "linear-gradient(135deg, #D97706, #F59E0B)",
        "skills": ["AWS", "Cloud Computing", "Docker", "Kubernetes", "Terraform", "CI/CD", "Linux"],
        "target_roles": ["Cloud Solutions Architect", "DevOps Engineer", "Cloud Engineer", "Infrastructure Engineer"],
        "domains": ["Cloud & DevOps", "Cloud Computing", "Infrastructure"]
    },
    {
        "id": 7,
        "title": "Cyber Security & Defensive Operations",
        "category": "Cyber Security",
        "description": "Hands-on threat intelligence, ethical hacking methodologies, network defense, SIEM monitoring, and cryptography.",
        "instructor": "Jonathan Vance",
        "rating": 4.8,
        "review_count": 910,
        "duration": "36 hours",
        "lessons_count": 29,
        "level": "Intermediate",
        "icon": "fa-solid fa-shield-halved",
        "color_theme": "linear-gradient(135deg, #0F766E, #14B8A6)",
        "skills": ["Network Security", "Ethical Hacking", "Linux", "Cryptography", "SIEM", "Incident Response"],
        "target_roles": ["Cyber Security Analyst", "Security Engineer", "Information Security Specialist"],
        "domains": ["Cyber Security", "Information Security", "Networking"]
    },
    {
        "id": 8,
        "title": "UI/UX Design Systems & Product Strategy",
        "category": "UI/UX Design",
        "description": "Craft intuitive interfaces, user journeys, wireframes, interactive prototypes, and production design systems in Figma.",
        "instructor": "Elena Rostova",
        "rating": 4.9,
        "review_count": 1050,
        "duration": "26 hours",
        "lessons_count": 22,
        "level": "Beginner",
        "icon": "fa-solid fa-palette",
        "color_theme": "linear-gradient(135deg, #DB2777, #F43F5E)",
        "skills": ["Figma", "User Research", "Wireframing", "Prototyping", "Design Systems", "Usability Testing"],
        "target_roles": ["UI/UX Designer", "Product Designer", "UX Researcher"],
        "domains": ["UI/UX Design", "Product Design"]
    },
    {
        "id": 9,
        "title": "Cross-Platform Mobile Development with Flutter",
        "category": "Mobile Development",
        "description": "Create native iOS and Android apps with Dart, state management (Bloc), Firebase backend, and slick animations.",
        "instructor": "Carlos Mendez",
        "rating": 4.7,
        "review_count": 780,
        "duration": "34 hours",
        "lessons_count": 26,
        "level": "Intermediate",
        "icon": "fa-solid fa-mobile-screen-button",
        "color_theme": "linear-gradient(135deg, #0284C7, #06B6D4)",
        "skills": ["Flutter", "Dart", "Firebase", "Mobile App Development", "State Management", "REST APIs"],
        "target_roles": ["Mobile Developer", "Flutter Developer", "Frontend Developer"],
        "domains": ["Mobile Development", "Software Engineering"]
    },
    {
        "id": 10,
        "title": "Modern Data Engineering with Spark & Airflow",
        "category": "Data Science & AI",
        "description": "Build scalable big data pipelines, ETL workflows, data lakehouses, and real-time streaming architectures.",
        "instructor": "Sanjay Gupta",
        "rating": 4.8,
        "review_count": 690,
        "duration": "30 hours",
        "lessons_count": 25,
        "level": "Advanced",
        "icon": "fa-solid fa-database",
        "color_theme": "linear-gradient(135deg, #4338CA, #6366F1)",
        "skills": ["Python", "SQL", "Apache Spark", "Airflow", "ETL", "Data Pipelines"],
        "target_roles": ["Data Engineer", "Data Scientist", "Big Data Developer"],
        "domains": ["Data Science & AI", "Backend Development"]
    }
]


class CourseScorer:
    """Calculates weighted recommendation scores and match explanations."""

    @staticmethod
    def score_course(
        course: Dict[str, Any],
        career_goal: str,
        secondary_goal: str,
        student_skills: List[str],
        student_interests: List[str],
        assessment_results: List[Dict[str, Any]],
        completed_course_titles: List[str]
    ) -> Optional[Dict[str, Any]]:
        
        # Don't recommend already completed courses if specified
        if course["title"] in completed_course_titles:
            return None

        career_goal_clean = (career_goal or "").strip().lower()
        secondary_goal_clean = (secondary_goal or "").strip().lower()
        
        # Normalize student skills and interests
        norm_skills = [s.strip().lower() for s in student_skills if s]
        norm_interests = [i.strip().lower() for i in student_interests if i]
        
        course_skills = [s.lower() for s in course.get("skills", [])]
        course_roles = [r.lower() for r in course.get("target_roles", [])]
        course_domains = [d.lower() for d in course.get("domains", [])]
        course_cat = course.get("category", "").lower()

        reasons: List[str] = []
        
        # 1. Career Goal Match (35% Max)
        career_score = 0.0
        if career_goal_clean:
            if any(career_goal_clean == r or career_goal_clean in r or r in career_goal_clean for r in course_roles):
                career_score = 35.0
                reasons.append(f"Direct match for your career goal: {career_goal}")
            elif any(career_goal_clean in d or d in career_goal_clean for d in course_domains):
                career_score = 28.0
                reasons.append(f"Aligns with your primary field of {course.get('category')}")
            elif secondary_goal_clean and any(secondary_goal_clean in r or r in secondary_goal_clean for r in course_roles):
                career_score = 22.0
                reasons.append(f"Supports your secondary goal: {secondary_goal}")
            else:
                career_score = 8.0
        else:
            career_score = 15.0 # baseline if not set

        # 2. Skill Match & Gap Bridging (30% Max)
        skill_score = 0.0
        matching_skills = []
        gap_skills = []
        for cs in course.get("skills", []):
            cs_clean = cs.lower()
            if any(cs_clean == s or cs_clean in s or s in cs_clean for s in norm_skills):
                matching_skills.append(cs)
            else:
                gap_skills.append(cs)

        if norm_skills:
            if matching_skills:
                skill_score += min(18.0, len(matching_skills) * 6.0)
                reasons.append(f"Builds upon your existing skills: {', '.join(matching_skills[:3])}")
            if gap_skills and (career_score > 20.0):
                skill_score += min(12.0, len(gap_skills) * 4.0)
                reasons.append(f"Closes critical skill gaps: {', '.join(gap_skills[:2])}")
        else:
            skill_score = 15.0 # baseline

        # 3. Interest Match (20% Max)
        interest_score = 0.0
        matched_interests = []
        for intr in norm_interests:
            if intr in course_cat or any(intr in d for d in course_domains) or any(intr in s for s in course_skills):
                matched_interests.append(intr.title())
        
        if matched_interests:
            interest_score = min(20.0, 10.0 + len(matched_interests) * 5.0)
            reasons.append(f"Matches your stated interest in {', '.join(matched_interests[:2])}")
        elif norm_interests:
            interest_score = 5.0
        else:
            interest_score = 10.0

        # 4. Assessment Performance Level Match (15% Max)
        assessment_score = 10.0
        relevant_assessment = None
        for attempt in assessment_results:
            cat = (attempt.get("category") or "").lower()
            if cat in course_cat or any(cat in d for d in course_domains) or course_cat in cat:
                relevant_assessment = attempt
                break

        if relevant_assessment:
            pct = relevant_assessment.get("percentage", 0)
            course_level = course.get("level", "Intermediate").lower()
            
            if pct >= 75 and course_level in ["intermediate", "advanced"]:
                assessment_score = 15.0
                reasons.append(f"Tailored for your strong assessment score ({pct}%) in {relevant_assessment.get('category')}")
            elif pct < 60 and course_level in ["beginner", "intermediate"]:
                assessment_score = 14.0
                reasons.append(f"Strengthens fundamentals following your assessment in {relevant_assessment.get('category')}")
            else:
                assessment_score = 12.0
                reasons.append(f"Validated by your recent {relevant_assessment.get('category')} assessment")

        # Compute total raw score (0 - 100)
        total_score = career_score + skill_score + interest_score + assessment_score
        
        # Scale nicely into realistic percentage (between 68% and 98%)
        match_percentage = int(min(98, max(68, round(total_score))))
        
        # Fallback reason if none generated
        if not reasons:
            reasons.append(f"Popular high-rated course in {course.get('category')}")

        return {
            **course,
            "match_percentage": match_percentage,
            "match_reasons": reasons[:3],
            "skills_matching": matching_skills,
            "skills_gaps_addressed": gap_skills[:3]
        }
