"""Course catalog and dynamic personalization scoring logic for SmartLearn recommendation engine."""
from typing import List, Dict, Any, Optional, Tuple, Set

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

CAREER_BENCHMARKS: Dict[str, List[str]] = {
    "full stack web developer": ["html", "css", "javascript", "react", "node.js", "express", "sql", "mongodb", "rest apis", "git"],
    "full stack developer": ["html", "css", "javascript", "react", "node.js", "express", "postgresql", "rest apis", "docker", "git"],
    "frontend developer": ["html", "css", "javascript", "typescript", "react", "next.js", "tailwind css", "ui/ux", "state management", "git"],
    "backend developer": ["python", "fastapi", "node.js", "postgresql", "docker", "rest apis", "redis", "sqlalchemy", "git"],
    "data scientist": ["python", "pandas", "numpy", "sql", "machine learning", "scikit-learn", "data visualization", "deep learning", "statistics"],
    "ai / machine learning engineer": ["python", "pytorch", "deep learning", "transformers", "nlp", "computer vision", "docker"],
    "ai engineer": ["python", "pytorch", "deep learning", "transformers", "nlp", "computer vision", "docker"],
    "cloud solutions architect": ["aws", "cloud computing", "docker", "kubernetes", "terraform", "ci/cd", "linux"],
    "cloud engineer": ["aws", "cloud computing", "docker", "kubernetes", "terraform", "ci/cd", "linux"],
    "devops engineer": ["linux", "docker", "kubernetes", "ci/cd", "terraform", "aws", "python", "git"],
    "cyber security analyst": ["network security", "linux", "ethical hacking", "cryptography", "siem", "incident response", "threat detection", "python"],
    "ui/ux designer": ["figma", "user research", "wireframing", "prototyping", "design systems", "usability testing", "ui design"],
    "mobile developer": ["flutter", "dart", "firebase", "mobile app development", "state management", "rest apis"],
    "data engineer": ["python", "sql", "apache spark", "airflow", "etl", "data pipelines", "postgresql", "aws"]
}

PROFICIENCY_LEVELS: Dict[str, int] = {
    "beginner": 1,
    "intermediate": 2,
    "advanced": 3,
    "expert": 4
}

COURSE_LEVELS: Dict[str, int] = {
    "beginner": 1,
    "intermediate": 2,
    "advanced": 3
}


class CourseScorer:
    """Calculates granular, profile-driven weighted recommendation scores and match explanations."""

    @classmethod
    def get_goal_required_skills(cls, goal_name: str, goals_map: Optional[Dict[str, List[str]]] = None) -> List[str]:
        if not goal_name:
            return []
        goal_clean = goal_name.strip().lower()
        if goals_map:
            for k, v in goals_map.items():
                if k.lower() == goal_clean or goal_clean in k.lower() or k.lower() in goal_clean:
                    return [s.strip().lower() for s in (v or [])]
        for k, v in CAREER_BENCHMARKS.items():
            if k == goal_clean or goal_clean in k or k in goal_clean:
                return v
        return []

    @classmethod
    def score_course(
        cls,
        course: Dict[str, Any],
        career_goal: str = "",
        secondary_goal: str = "",
        student_skills: Optional[List[Any]] = None,
        student_interests: Optional[List[Any]] = None,
        student_education: Optional[List[Dict[str, Any]]] = None,
        assessment_results: Optional[List[Dict[str, Any]]] = None,
        completed_course_ids: Optional[List[int]] = None,
        completed_course_titles: Optional[List[str]] = None,
        enrolled_course_ids: Optional[List[int]] = None,
        goals_map: Optional[Dict[str, List[str]]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Calculates a personalized score (0-100) for a course against a student's profile.
        Returns None if course is already completed.
        """
        course_id = course.get("id")
        course_title = course.get("title", "")

        # 1. Check Completed Courses -> Exclude or Score 0
        if completed_course_ids and course_id in completed_course_ids:
            return None
        if completed_course_titles and any(t.lower() == course_title.lower() for t in completed_course_titles):
            return None

        is_enrolled = bool(enrolled_course_ids and course_id in enrolled_course_ids)

        # Parse Student Skills and Levels
        student_skill_map: Dict[str, int] = {}
        student_skill_display: Dict[str, str] = {}
        for s in (student_skills or []):
            if isinstance(s, str) and s.strip():
                clean_s = s.strip().lower()
                student_skill_map[clean_s] = 2 # default Intermediate
                student_skill_display[clean_s] = s.strip()
            elif isinstance(s, dict):
                name = (s.get("skill") or s.get("name") or "").strip()
                lvl = str(s.get("level") or s.get("proficiency") or "Intermediate").strip().lower()
                if name:
                    clean_name = name.lower()
                    student_skill_map[clean_name] = PROFICIENCY_LEVELS.get(lvl, 2)
                    student_skill_display[clean_name] = name

        # Parse Student Interests
        norm_interests: List[str] = []
        for i in (student_interests or []):
            if isinstance(i, str) and i.strip():
                norm_interests.append(i.strip().lower())
            elif isinstance(i, dict):
                name = (i.get("interest") or i.get("name") or "").strip()
                if name:
                    norm_interests.append(name.lower())

        # Course Metadata
        course_skills_raw = course.get("skills") or []
        course_skills_lower = [s.strip().lower() for s in course_skills_raw if isinstance(s, str)]
        course_roles_lower = [r.strip().lower() for r in (course.get("target_roles") or []) if isinstance(r, str)]
        course_goals_lower = [g.strip().lower() for g in (course.get("career_goals") or []) if isinstance(g, str)]
        course_domains_lower = [d.strip().lower() for d in (course.get("domains") or []) if isinstance(d, str)]
        course_cat = str(course.get("category") or "").strip().lower()
        course_subcat = str(course.get("subcategory") or "").strip().lower()
        course_desc = str(course.get("description") or "").strip().lower()
        course_level_str = str(course.get("level") or course.get("difficulty") or "Intermediate").strip().lower()
        course_level_num = COURSE_LEVELS.get(course_level_str, 2)

        reasons: List[str] = []
        career_goal_clean = (career_goal or "").strip().lower()
        secondary_goal_clean = (secondary_goal or "").strip().lower()

        # =========================================================
        # 1. CAREER GOAL MATCH (30% MAX)
        # =========================================================
        career_score = 0.0
        primary_match = False
        secondary_match = False

        if career_goal_clean:
            # Exact or strong role/goal match
            if any(career_goal_clean in r or r in career_goal_clean for r in (course_roles_lower + course_goals_lower)):
                career_score = 30.0
                primary_match = True
                reasons.append(f"Direct match for your career goal: {career_goal}")
            elif career_goal_clean in course_cat or any(career_goal_clean in d for d in course_domains_lower):
                career_score = 25.0
                primary_match = True
                reasons.append(f"Core curriculum in {course.get('category')}")
            elif any(word in (course_cat + " " + " ".join(course_roles_lower)) for word in career_goal_clean.split() if len(word) > 3):
                career_score = 20.0
                reasons.append(f"Aligns with your focus in {career_goal}")
            else:
                career_score = 4.0

            # Check secondary goal
            if secondary_goal_clean and not primary_match:
                if any(secondary_goal_clean in r or r in secondary_goal_clean for r in (course_roles_lower + course_goals_lower)):
                    career_score = max(career_score, 22.0)
                    secondary_match = True
                    reasons.append(f"Supports your secondary career goal: {secondary_goal}")
                elif secondary_goal_clean in course_cat:
                    career_score = max(career_score, 18.0)
                    reasons.append(f"Expands into your secondary area: {secondary_goal}")
        else:
            career_score = 10.0 # baseline when no goal configured

        # =========================================================
        # 2. SKILL GAP MATCH (25% MAX)
        # =========================================================
        skill_gap_score = 0.0
        required_goal_skills = cls.get_goal_required_skills(career_goal, goals_map)
        missing_goal_skills: Set[str] = set()

        for req in required_goal_skills:
            # Check if student does NOT have this skill or has it only at Beginner level
            matched_key = None
            for s_key in student_skill_map.keys():
                if req in s_key or s_key in req:
                    matched_key = s_key
                    break
            if not matched_key or student_skill_map.get(matched_key, 0) <= 1:
                missing_goal_skills.add(req)

        # Check how many missing goal skills this course teaches
        addressed_gap_skills: List[str] = []
        for cs_raw, cs_lower in zip(course_skills_raw, course_skills_lower):
            for mg in missing_goal_skills:
                if mg in cs_lower or cs_lower in mg:
                    if cs_raw not in addressed_gap_skills:
                        addressed_gap_skills.append(cs_raw)

        if missing_goal_skills and addressed_gap_skills:
            # Award points per gap addressed
            skill_gap_score = min(25.0, len(addressed_gap_skills) * 8.5)
            gap_disp = ", ".join(addressed_gap_skills[:3])
            reasons.append(f"Closes key skill gaps: {gap_disp}")
        elif not career_goal_clean and course_skills_lower:
            skill_gap_score = 10.0
        elif not missing_goal_skills:
            skill_gap_score = 15.0 # student has most core skills

        # =========================================================
        # 3. SKILL & PROFICIENCY FIT (20% MAX)
        # =========================================================
        skill_prof_score = 0.0
        overlapping_student_skills: List[Tuple[str, str, int]] = []

        for cs_raw, cs_lower in zip(course_skills_raw, course_skills_lower):
            for s_key, s_lvl in student_skill_map.items():
                if s_key in cs_lower or cs_lower in s_key:
                    disp_name = student_skill_display.get(s_key, cs_raw)
                    lvl_name = [k for k, v in PROFICIENCY_LEVELS.items() if v == s_lvl][0].title()
                    overlapping_student_skills.append((disp_name, lvl_name, s_lvl))
                    break

        if student_skill_map:
            if overlapping_student_skills:
                # Evaluate proficiency synergy vs course difficulty
                max_student_lvl = max(lvl for _, _, lvl in overlapping_student_skills)
                top_skill_name = overlapping_student_skills[0][0]
                top_skill_lvl_str = overlapping_student_skills[0][1]

                # Case A: Advanced/Expert student + Beginner Course -> Low match (they already master it)
                if max_student_lvl >= 3 and course_level_num == 1:
                    skill_prof_score = 6.0
                    # Do not over-recommend elementary courses to experts
                # Case B: Intermediate/Advanced student + Intermediate/Advanced Course -> Strong synergy
                elif max_student_lvl >= 2 and course_level_num >= 2:
                    skill_prof_score = min(20.0, 12.0 + len(overlapping_student_skills) * 3.5)
                    reasons.append(f"Builds on your {top_skill_lvl_str.lower()} {top_skill_name} skill")
                # Case C: Beginner student + Beginner/Intermediate Course -> Great foundation
                elif max_student_lvl == 1 and course_level_num <= 2:
                    skill_prof_score = min(20.0, 14.0 + len(overlapping_student_skills) * 3.0)
                    reasons.append(f"Solidifies your foundational {top_skill_name} skill")
                else:
                    skill_prof_score = min(20.0, 10.0 + len(overlapping_student_skills) * 3.0)
                    reasons.append(f"Builds upon your existing skills: {top_skill_name}")
            else:
                # No overlapping skills: if course is Beginner, good to start; if Advanced, maybe high barrier
                skill_prof_score = 8.0 if course_level_num <= 2 else 4.0
        else:
            skill_prof_score = 10.0 # baseline

        # =========================================================
        # 4. INTEREST MATCH (15% MAX)
        # =========================================================
        interest_score = 0.0
        matched_interests: List[str] = []

        for intr in norm_interests:
            intr_words = [w for w in intr.split() if len(w) > 2]
            if (intr in course_cat or 
                intr in course_subcat or 
                any(intr in d or d in intr for d in course_domains_lower) or 
                any(intr in s or s in intr for s in course_skills_lower) or 
                intr in course_desc or
                any(w in course_cat or any(w in d for d in course_domains_lower) for w in intr_words)):
                matched_interests.append(intr.title())

        if matched_interests:
            interest_score = min(15.0, 8.0 + len(matched_interests) * 4.0)
            reasons.append(f"Matches your interest in {', '.join(matched_interests[:2])}")
        elif norm_interests:
            interest_score = 2.0
        else:
            interest_score = 7.5

        # =========================================================
        # 5. ASSESSMENT & DIFFICULTY FIT (5% MAX)
        # =========================================================
        assessment_score = 2.5
        relevant_attempt = None

        if assessment_results:
            for att in assessment_results:
                att_cat = str(att.get("category") or "").strip().lower()
                if att_cat and (att_cat in course_cat or any(att_cat in d for d in course_domains_lower) or att_cat in course_desc):
                    relevant_attempt = att
                    break

        if relevant_attempt:
            att_pct = float(relevant_attempt.get("percentage") or 0)
            att_cat_name = relevant_attempt.get("category") or course.get("category")
            if att_pct >= 75 and course_level_num >= 2:
                assessment_score = 5.0
                reasons.append(f"Tailored for your strong {att_pct:.0f}% assessment in {att_cat_name}")
            elif att_pct < 60 and course_level_num == 1:
                assessment_score = 5.0
                reasons.append(f"Reinforces essentials based on your {att_cat_name} assessment")
            else:
                assessment_score = 3.5
        else:
            # Baseline difficulty fit
            if student_skill_map:
                avg_prof = sum(student_skill_map.values()) / len(student_skill_map)
                if abs(avg_prof - course_level_num) <= 1.0:
                    assessment_score = 4.0
            else:
                assessment_score = 3.0

        # =========================================================
        # 6. EDUCATION & LEARNING HISTORY FIT (5% MAX)
        # =========================================================
        history_score = 2.5
        if student_education:
            for edu in student_education:
                spec = str(edu.get("specialization") or "").lower()
                if spec and (spec in course_desc or spec in course_cat):
                    history_score = 5.0
                    reasons.append(f"Complements your background in {edu.get('specialization')}")
                    break

        # Calculate Total Score
        raw_total = career_score + skill_gap_score + skill_prof_score + interest_score + assessment_score + history_score

        # Calculate match percentage (bounded between 52% and 99%)
        match_percentage = int(min(99, max(52, round(raw_total))))

        # Fallback reason if none generated
        if not reasons:
            reasons.append(f"Highly-rated {course_level_str.title()} curriculum in {course.get('category')}")

        return {
            **course,
            "match_percentage": match_percentage,
            "match_reasons": reasons[:3],
            "is_enrolled": is_enrolled,
            "skills_matching": [s[0] for s in overlapping_student_skills],
            "skills_gaps_addressed": addressed_gap_skills[:3],
            "scores_breakdown": {
                "career_score": round(career_score, 1),
                "skill_gap_score": round(skill_gap_score, 1),
                "skill_proficiency_score": round(skill_prof_score, 1),
                "interest_score": round(interest_score, 1),
                "assessment_score": round(assessment_score, 1),
                "total_score": round(raw_total, 1)
            }
        }
