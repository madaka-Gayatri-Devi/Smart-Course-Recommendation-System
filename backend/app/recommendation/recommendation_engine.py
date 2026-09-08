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
        category: Optional[str] = None
    ) -> Dict[str, Any]:
        
        profile = profile_data or {}
        attempts = assessment_attempts or []
        
        career_goal = profile.get("career_goal") or ""
        secondary_goal = profile.get("secondary_career_goal") or ""
        
        # Normalize skills list
        raw_skills = profile.get("skills") or []
        skills: List[str] = []
        for s in raw_skills:
            if isinstance(s, str):
                skills.append(s.strip())
            elif isinstance(s, dict):
                skills.append(s.get("skill") or s.get("name") or "")
        skills = [s for s in skills if s]

        # Normalize interests list
        raw_interests = profile.get("interests") or []
        interests: List[str] = []
        for i in raw_interests:
            if isinstance(i, str):
                interests.append(i.strip())
            elif isinstance(i, dict):
                interests.append(i.get("interest") or i.get("name") or "")
        interests = [i for i in interests if i]

        # Completed courses list
        raw_courses = profile.get("courses") or []
        completed_titles: List[str] = []
        for c in raw_courses:
            if isinstance(c, dict) and (c.get("status") == "completed" or c.get("progress") == 100):
                completed_titles.append(c.get("title") or c.get("course_name") or "")

        has_profile_data = bool(career_goal or skills or interests or attempts)

        scored_courses: List[Dict[str, Any]] = []

        for course in COURSE_CATALOG:
            # Filter by category if requested
            if category and category.lower() != "all":
                course_cat = course.get("category", "").lower()
                course_domains = [d.lower() for d in course.get("domains", [])]
                cat_lower = category.lower()
                if cat_lower not in course_cat and not any(cat_lower in d for d in course_domains):
                    continue

            scored = CourseScorer.score_course(
                course=course,
                career_goal=career_goal,
                secondary_goal=secondary_goal,
                student_skills=skills,
                student_interests=interests,
                assessment_results=attempts,
                completed_course_titles=completed_titles
            )
            if scored:
                scored_courses.append(scored)

        # Sort by match_percentage DESC, then rating DESC
        scored_courses.sort(key=lambda x: (x.get("match_percentage", 0), x.get("rating", 0.0)), reverse=True)

        results = scored_courses[:limit]

        return {
            "has_profile_data": has_profile_data,
            "total_matches": len(scored_courses),
            "career_goal": career_goal,
            "recommendations": results
        }
