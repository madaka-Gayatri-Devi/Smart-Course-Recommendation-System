"""Skill Gap Analyzer implementation for SmartLearn."""
from typing import List, Dict, Any, Optional


class SkillGapAnalyzer:
    """Analyzes student skills vs target career goals to identify gaps and bridge courses."""

    # Default benchmark skills per career goal if DB benchmark not available
    BENCHMARKS: Dict[str, Dict[str, Any]] = {
        "Full Stack Web Developer": {
            "required_skills": ["HTML", "CSS", "JavaScript", "React", "Node.js", "Express", "SQL", "MongoDB", "REST APIs", "Git"],
            "core_skills": ["JavaScript", "React", "Node.js", "SQL"]
        },
        "Full Stack Developer": {
            "required_skills": ["HTML", "CSS", "JavaScript", "React", "Node.js", "Express", "PostgreSQL", "REST APIs", "Docker", "Git"],
            "core_skills": ["JavaScript", "React", "Node.js", "PostgreSQL"]
        },
        "Frontend Developer": {
            "required_skills": ["HTML", "CSS", "JavaScript", "TypeScript", "React", "Next.js", "Tailwind CSS", "UI/UX", "State Management", "Git"],
            "core_skills": ["JavaScript", "React", "TypeScript", "CSS"]
        },
        "Backend Developer": {
            "required_skills": ["Python", "FastAPI", "Node.js", "PostgreSQL", "Docker", "REST APIs", "Redis", "SQLAlchemy", "Git"],
            "core_skills": ["Python", "FastAPI", "PostgreSQL", "Docker"]
        },
        "Data Scientist": {
            "required_skills": ["Python", "Pandas", "NumPy", "SQL", "Machine Learning", "Scikit-Learn", "Data Visualization", "Deep Learning", "Statistics"],
            "core_skills": ["Python", "Pandas", "Machine Learning", "SQL"]
        },
        "AI / Machine Learning Engineer": {
            "required_skills": ["Python", "PyTorch", "TensorFlow", "Deep Learning", "Transformers", "NLP", "Computer Vision", "Math & Linear Algebra", "Docker"],
            "core_skills": ["Python", "PyTorch", "Deep Learning", "Transformers"]
        },
        "Cloud Solutions Architect": {
            "required_skills": ["AWS", "Cloud Computing", "Docker", "Kubernetes", "Terraform", "CI/CD", "Linux", "Networking", "Security"],
            "core_skills": ["AWS", "Docker", "Kubernetes", "Terraform"]
        },
        "DevOps Engineer": {
            "required_skills": ["Linux", "Docker", "Kubernetes", "CI/CD", "Terraform", "AWS", "Python", "Monitoring & Logging", "Git"],
            "core_skills": ["Docker", "Kubernetes", "CI/CD", "Linux"]
        },
        "Cyber Security Analyst": {
            "required_skills": ["Network Security", "Linux", "Ethical Hacking", "Cryptography", "SIEM", "Incident Response", "Threat Detection", "Python"],
            "core_skills": ["Network Security", "SIEM", "Incident Response", "Ethical Hacking"]
        },
        "UI/UX Designer": {
            "required_skills": ["Figma", "User Research", "Wireframing", "Prototyping", "Design Systems", "Usability Testing", "HTML/CSS Basics"],
            "core_skills": ["Figma", "Design Systems", "Prototyping", "User Research"]
        },
        "Mobile Developer": {
            "required_skills": ["Flutter", "Dart", "React Native", "Mobile App Development", "Firebase", "State Management", "REST APIs", "iOS/Android"],
            "core_skills": ["Flutter", "Dart", "Firebase", "State Management"]
        },
        "Data Engineer": {
            "required_skills": ["Python", "SQL", "Apache Spark", "Airflow", "ETL", "Data Pipelines", "PostgreSQL", "Data Lakehouses", "AWS"],
            "core_skills": ["Python", "SQL", "Apache Spark", "Airflow"]
        }
    }

    @classmethod
    def analyze(
        cls,
        career_goal: str,
        student_skills: List[Dict[str, Any]],
        courses_catalog: List[Dict[str, Any]],
        db_career_goals: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Performs comprehensive skill gap analysis."""
        goal_clean = (career_goal or "Full Stack Web Developer").strip()

        # Find target skills from DB goals or default benchmarks
        required_skills: List[str] = []
        if db_career_goals:
            for g in db_career_goals:
                if g.get("title", "").strip().lower() == goal_clean.lower():
                    required_skills = g.get("required_skills", [])
                    break

        if not required_skills:
            # Fallback to BENCHMARKS (case-insensitive search)
            for k, v in cls.BENCHMARKS.items():
                if k.lower() == goal_clean.lower() or goal_clean.lower() in k.lower():
                    required_skills = v["required_skills"]
                    break
            if not required_skills:
                required_skills = cls.BENCHMARKS.get("Full Stack Web Developer", {})["required_skills"]

        # Parse student skills and their proficiencies
        student_skill_map: Dict[str, str] = {}
        for s in student_skills:
            if isinstance(s, str):
                student_skill_map[s.strip().lower()] = "Intermediate"
            elif isinstance(s, dict):
                name = (s.get("skill") or s.get("name") or "").strip().lower()
                lvl = s.get("level") or s.get("proficiency") or "Intermediate"
                if name:
                    student_skill_map[name] = lvl

        # Evaluate matching vs missing
        matching_skills: List[Dict[str, Any]] = []
        missing_skills: List[Dict[str, Any]] = []
        all_gap_items: List[Dict[str, Any]] = []

        proficiency_weight = {
            "beginner": 35,
            "intermediate": 70,
            "advanced": 90,
            "expert": 100
        }

        for req in required_skills:
            req_lower = req.strip().lower()
            matched_key = None
            for s_key in student_skill_map.keys():
                if req_lower in s_key or s_key in req_lower:
                    matched_key = s_key
                    break

            if matched_key:
                prof_str = student_skill_map[matched_key]
                pct = proficiency_weight.get(prof_str.lower(), 70)
                item = {
                    "skill": req,
                    "status": "Acquired",
                    "proficiency": prof_str,
                    "proficiency_percentage": pct,
                    "gap_percentage": 100 - pct,
                    "is_missing": False
                }
                matching_skills.append(item)
                all_gap_items.append(item)
            else:
                item = {
                    "skill": req,
                    "status": "Missing",
                    "proficiency": "None",
                    "proficiency_percentage": 15,
                    "gap_percentage": 85,
                    "is_missing": True
                }
                missing_skills.append(item)
                all_gap_items.append(item)

        total_req = len(required_skills)
        readiness_pct = round((len(matching_skills) / total_req) * 100) if total_req > 0 else 0

        # Find bridge courses for missing skills
        missing_skill_names = {m["skill"].lower() for m in missing_skills}
        bridge_courses: List[Dict[str, Any]] = []

        for c in courses_catalog:
            course_skills = [s.lower() for s in (c.get("skills") or [])]
            overlap = missing_skill_names.intersection(course_skills)
            if overlap:
                bridge_courses.append({
                    "course_id": c.get("id"),
                    "title": c.get("title"),
                    "category": c.get("category"),
                    "level": c.get("level") or c.get("difficulty"),
                    "duration": c.get("duration"),
                    "rating": c.get("rating", 4.8),
                    "instructor": c.get("instructor") or c.get("instructor_name", "SmartLearn Expert"),
                    "matched_missing_skills": [s.title() for s in overlap],
                    "overlap_count": len(overlap)
                })

        bridge_courses.sort(key=lambda x: (x["overlap_count"], x.get("rating", 0.0)), reverse=True)

        return {
            "career_goal": goal_clean,
            "readiness_percentage": readiness_pct,
            "total_required_skills": total_req,
            "matching_count": len(matching_skills),
            "missing_count": len(missing_skills),
            "matching_skills": matching_skills,
            "missing_skills": missing_skills,
            "all_skills_analysis": all_gap_items,
            "recommended_bridge_courses": bridge_courses[:4]
        }

