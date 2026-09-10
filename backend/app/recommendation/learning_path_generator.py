"""Learning Path Generator for SmartLearn."""
from typing import List, Dict, Any, Optional


class LearningPathGenerator:
    """Generates structured, progressive learning paths aligned with target career goals."""

    DIFFICULTY_ORDER = {
        "beginner": 1,
        "intermediate": 2,
        "advanced": 3,
        "expert": 4
    }

    @classmethod
    def generate_path(
        cls,
        career_goal: str,
        student_skills: List[Dict[str, Any]],
        assessment_results: List[Dict[str, Any]],
        enrolled_courses: List[Dict[str, Any]],
        courses_catalog: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Generates an ordered curriculum of milestones for a student's career goal."""
        goal = (career_goal or "Full Stack Web Developer").strip()
        goal_lower = goal.lower()

        # Filter relevant courses for this career goal
        relevant_courses: List[Dict[str, Any]] = []
        other_courses: List[Dict[str, Any]] = []

        for c in courses_catalog:
            target_roles = [r.lower() for r in (c.get("target_roles") or c.get("career_goals") or [])]
            category = (c.get("category") or "").lower()
            domains = [d.lower() for d in (c.get("domains") or [])]

            is_match = any(goal_lower in r or r in goal_lower for r in target_roles) or (goal_lower in category) or any(goal_lower in d for d in domains)
            if is_match:
                relevant_courses.append(c)
            else:
                other_courses.append(c)

        # If not enough matches, backfill from other high-rated courses
        all_candidates = relevant_courses + other_courses

        # Sort candidates by difficulty order, then rating
        def sort_key(item):
            diff = (item.get("level") or item.get("difficulty") or "Intermediate").lower()
            diff_num = cls.DIFFICULTY_ORDER.get(diff, 2)
            rating = item.get("rating", 4.5)
            return (diff_num, -rating)

        sorted_candidates = sorted(all_candidates, key=sort_key)

        # Select top 4 progressive courses
        selected_courses = sorted_candidates[:4]

        # Map enrolled status & progress
        enrolled_map: Dict[Any, Dict[str, Any]] = {}
        for ec in enrolled_courses:
            c_id = ec.get("id") or ec.get("course_id")
            title = (ec.get("title") or ec.get("course_name") or "").lower().strip()
            if c_id:
                enrolled_map[c_id] = ec
            if title:
                enrolled_map[title] = ec

        milestones: List[Dict[str, Any]] = []
        stage_names = [
            "Foundational Fundamentals",
            "Core Intermediate Mastery",
            "Advanced Systems & Specialization",
            "Production Architecture & Capstone"
        ]

        total_progress = 0

        for idx, course in enumerate(selected_courses):
            c_id = course.get("id")
            c_title = (course.get("title") or "").lower().strip()
            
            # Check enrollment
            enrolled_info = enrolled_map.get(c_id) or enrolled_map.get(c_title)

            progress_pct = 0
            status_text = "Not Started"
            is_completed = False
            is_in_progress = False

            if enrolled_info:
                progress_pct = int(enrolled_info.get("progress") or enrolled_info.get("progress_percentage") or 0)
                if progress_pct >= 100 or enrolled_info.get("status") == "completed":
                    progress_pct = 100
                    status_text = "Completed"
                    is_completed = True
                elif progress_pct > 0:
                    status_text = "In Progress"
                    is_in_progress = True
                else:
                    status_text = "Enrolled"
                    is_in_progress = True

            total_progress += progress_pct

            milestones.append({
                "step_number": idx + 1,
                "stage": stage_names[idx] if idx < len(stage_names) else f"Phase {idx + 1}",
                "course_id": course.get("id"),
                "title": course.get("title"),
                "category": course.get("category"),
                "level": course.get("level") or course.get("difficulty"),
                "duration": course.get("duration"),
                "instructor": course.get("instructor") or course.get("instructor_name", "SmartLearn Instructor"),
                "icon": course.get("icon", "fa-solid fa-graduation-cap"),
                "color_theme": course.get("color_theme", "linear-gradient(135deg, #5B3FE8, #8B4AD9)"),
                "skills": (course.get("skills") or [])[:4],
                "description": course.get("short_description") or course.get("description", ""),
                "progress_percentage": progress_pct,
                "status": status_text,
                "is_completed": is_completed,
                "is_in_progress": is_in_progress
            })

        overall_path_progress = round(total_progress / len(milestones)) if milestones else 0

        return {
            "career_goal": goal,
            "total_steps": len(milestones),
            "completed_steps": sum(1 for m in milestones if m["is_completed"]),
            "overall_progress_percentage": overall_path_progress,
            "milestones": milestones
        }

