"""Recommendation Engine implementation for SmartLearn."""
from typing import List, Dict, Any, Optional
from .course_scorer import CourseScorer, COURSE_CATALOG


class RecommendationEngine:
    """Core recommendation engine orchestrating profile-based weighted scoring."""

    @staticmethod
    def get_recommendations(
        profile_data: Optional[Dict[str, Any]] = None,
        assessment_attempts: Optional[List[Dict[str, Any]]] = None,
        limit: int = 6,
        category: Optional[str] = None,
        courses_catalog: Optional[List[Dict[str, Any]]] = None,
        enrolled_course_ids: Optional[List[int]] = None,
        completed_course_ids: Optional[List[int]] = None,
        goals_map: Optional[Dict[str, List[str]]] = None
    ) -> Dict[str, Any]:
        
        profile = profile_data or {}
        attempts = assessment_attempts or []
        
        career_goal = profile.get("career_goal") or ""
        secondary_goal = profile.get("secondary_career_goal") or ""
        
        # Raw and normalized skills
        raw_skills = profile.get("skills") or []
        skills_clean: List[Any] = []
        for s in raw_skills:
            if isinstance(s, str) and s.strip():
                skills_clean.append(s.strip())
            elif isinstance(s, dict):
                skills_clean.append(s)

        # Raw and normalized interests
        raw_interests = profile.get("interests") or []
        interests_clean: List[str] = []
        for i in raw_interests:
            if isinstance(i, str) and i.strip():
                interests_clean.append(i.strip())
            elif isinstance(i, dict):
                name = (i.get("interest") or i.get("name") or "").strip()
                if name:
                    interests_clean.append(name)

        # Education
        education = profile.get("education") or []

        # Completed courses list
        raw_courses = profile.get("courses") or []
        completed_titles: List[str] = []
        for c in raw_courses:
            if isinstance(c, dict) and (c.get("status") == "completed" or c.get("progress") == 100):
                title = c.get("title") or c.get("course_name") or ""
                if title:
                    completed_titles.append(title)

        has_profile_data = bool(career_goal or skills_clean or interests_clean or attempts)

        scored_courses: List[Dict[str, Any]] = []

        catalog = courses_catalog if courses_catalog is not None else COURSE_CATALOG
        for course in catalog:
            # Filter by category if requested
            if category and category.lower() != "all":
                course_cat = str(course.get("category", "")).lower()
                course_domains = [str(d).lower() for d in course.get("domains", [])]
                cat_lower = category.lower()
                if cat_lower not in course_cat and not any(cat_lower in d for d in course_domains):
                    continue

            scored = CourseScorer.score_course(
                course=course,
                career_goal=career_goal,
                secondary_goal=secondary_goal,
                student_skills=skills_clean,
                student_interests=interests_clean,
                student_education=education if isinstance(education, list) else None,
                assessment_results=attempts,
                completed_course_ids=completed_course_ids,
                completed_course_titles=completed_titles,
                enrolled_course_ids=enrolled_course_ids,
                goals_map=goals_map
            )
            if scored:
                scored_courses.append(scored)

        # Sort by match_percentage DESC, then rating DESC
        scored_courses.sort(key=lambda x: (x.get("match_percentage", 0), x.get("rating", 0.0)), reverse=True)

        results = scored_courses[:limit]

        # Specialized categories
        career_goal_recs = [
            c for c in scored_courses 
            if c.get("scores_breakdown", {}).get("career_score", 0) >= 20.0
        ]
        
        skill_gap_recs = [
            c for c in scored_courses 
            if len(c.get("skills_gaps_addressed", [])) > 0 or c.get("scores_breakdown", {}).get("skill_gap_score", 0) >= 15.0
        ]

        interest_recs = [
            c for c in scored_courses 
            if c.get("scores_breakdown", {}).get("interest_score", 0) >= 8.0
        ]

        next_level_recs = [
            c for c in scored_courses 
            if c.get("scores_breakdown", {}).get("skill_proficiency_score", 0) >= 12.0
        ]

        return {
            "has_profile_data": has_profile_data,
            "total_matches": len(scored_courses),
            "career_goal": career_goal,
            "secondary_career_goal": secondary_goal,
            "student_profile_summary": {
                "skills_count": len(skills_clean),
                "interests_count": len(interests_clean),
                "career_goal": career_goal if career_goal else "Not specified",
                "secondary_career_goal": secondary_goal if secondary_goal else None,
                "has_profile_data": has_profile_data
            },
            "recommendations": results,
            "career_goal_recommendations": career_goal_recs[:4],
            "skill_gap_recommendations": skill_gap_recs[:4],
            "interest_recommendations": interest_recs[:4],
            "next_level_recommendations": next_level_recs[:4]
        }
