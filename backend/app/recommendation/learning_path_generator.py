"""Learning Path Generator for SmartLearn."""
from typing import List, Dict, Any, Optional

try:
    from app.recommendation.skill_gap_analyzer import SkillGapAnalyzer
except ImportError:
    try:
        from recommendation.skill_gap_analyzer import SkillGapAnalyzer
    except ImportError:
        from backend.app.recommendation.skill_gap_analyzer import SkillGapAnalyzer


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
        courses_catalog: List[Dict[str, Any]],
        db_career_goals: Optional[List[Dict[str, Any]]] = None,
        secondary_career_goal: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generates an ordered curriculum of milestones for a student's career goal."""
        goal = (career_goal or "Full Stack Web Developer").strip()
        goal_lower = goal.lower()
        sec_goal_lower = (secondary_career_goal or "").strip().lower()

        # Run skill gap analysis to identify missing skills and readiness
        gap_analysis = SkillGapAnalyzer.analyze(
            career_goal=goal,
            student_skills=student_skills,
            courses_catalog=courses_catalog,
            db_career_goals=db_career_goals
        )
        missing_skills_set = {m["skill"].lower() for m in gap_analysis.get("missing_skills", [])}
        missing_skills_names = [m["skill"] for m in gap_analysis.get("missing_skills", [])]
        matching_skills_names = [m["skill"] for m in gap_analysis.get("matching_skills", [])]

        # Filter relevant courses for this career goal & secondary goal
        primary_matches: List[Dict[str, Any]] = []
        secondary_matches: List[Dict[str, Any]] = []
        skill_bridge_matches: List[Dict[str, Any]] = []
        other_courses: List[Dict[str, Any]] = []

        for c in courses_catalog:
            target_roles = [str(r).lower() for r in (c.get("target_roles") or c.get("career_goals") or [])]
            category = (c.get("category") or "").lower()
            domains = [str(d).lower() for d in (c.get("domains") or [])]
            course_skills = [str(s).lower() for s in (c.get("skills") or [])]

            is_primary = any(goal_lower in r or r in goal_lower for r in target_roles) or (goal_lower in category) or any(goal_lower in d for d in domains)
            is_secondary = sec_goal_lower and (any(sec_goal_lower in r or r in sec_goal_lower for r in target_roles) or (sec_goal_lower in category) or any(sec_goal_lower in d for d in domains))
            
            overlap_missing = set(course_skills).intersection(missing_skills_set)

            if is_primary:
                primary_matches.append((c, len(overlap_missing)))
            elif is_secondary:
                secondary_matches.append((c, len(overlap_missing)))
            elif overlap_missing:
                skill_bridge_matches.append((c, len(overlap_missing)))
            else:
                other_courses.append((c, 0))

        # Sort candidates within buckets by missing skill overlap desc, then rating
        def score_candidate(item_tuple):
            course, overlap = item_tuple
            diff = (course.get("level") or course.get("difficulty") or "Intermediate").lower()
            diff_num = cls.DIFFICULTY_ORDER.get(diff, 2)
            rating = float(course.get("rating") or 4.8)
            return (overlap, rating)

        primary_matches.sort(key=score_candidate, reverse=True)
        secondary_matches.sort(key=score_candidate, reverse=True)
        skill_bridge_matches.sort(key=score_candidate, reverse=True)

        # Pool candidates in priority order, ensuring unique course IDs
        candidate_pool: List[Dict[str, Any]] = []
        seen_ids = set()

        for group in [primary_matches, secondary_matches, skill_bridge_matches, other_courses]:
            for c, _ in group:
                cid = c.get("id")
                if cid not in seen_ids:
                    seen_ids.add(cid)
                    candidate_pool.append(c)

        # Separate candidates by difficulty level for structured progressive roadmap
        beginners = [c for c in candidate_pool if (c.get("level") or c.get("difficulty") or "").lower() == "beginner"]
        intermediates = [c for c in candidate_pool if (c.get("level") or c.get("difficulty") or "").lower() == "intermediate"]
        advanceds = [c for c in candidate_pool if (c.get("level") or c.get("difficulty") or "").lower() in ["advanced", "expert"]]

        selected: List[Dict[str, Any]] = []

        # 1. Foundation
        if beginners:
            selected.append(beginners[0])
        elif intermediates:
            selected.append(intermediates[0])

        # 2. Core
        used_ids = {c["id"] for c in selected}
        remaining_intermediates = [c for c in intermediates if c["id"] not in used_ids]
        if remaining_intermediates:
            selected.append(remaining_intermediates[0])
        elif beginners:
            rem_b = [c for c in beginners if c["id"] not in used_ids]
            if rem_b:
                selected.append(rem_b[0])

        # 3. Advanced / Specialization
        used_ids = {c["id"] for c in selected}
        remaining_advanceds = [c for c in advanceds if c["id"] not in used_ids]
        if remaining_advanceds:
            selected.append(remaining_advanceds[0])
        else:
            rem_i = [c for c in intermediates if c["id"] not in used_ids]
            if rem_i:
                selected.append(rem_i[0])

        # 4. Capstone / Mastery
        used_ids = {c["id"] for c in selected}
        rem_all = [c for c in candidate_pool if c["id"] not in used_ids]
        if rem_all:
            rem_all.sort(key=lambda x: cls.DIFFICULTY_ORDER.get((x.get("level") or "").lower(), 2), reverse=True)
            selected.append(rem_all[0])

        # If fewer than 4, fill remaining from candidate pool
        for c in candidate_pool:
            if len(selected) >= 4:
                break
            if c["id"] not in {s["id"] for s in selected}:
                selected.append(c)

        # Sort selected by difficulty order so progression is strictly logical
        selected.sort(key=lambda item: cls.DIFFICULTY_ORDER.get((item.get("level") or item.get("difficulty") or "Intermediate").lower(), 2))

        # Build enrollment map
        enrolled_map: Dict[Any, Dict[str, Any]] = {}
        for ec in enrolled_courses:
            c_id = ec.get("id") or ec.get("course_id")
            title = (ec.get("title") or ec.get("course_name") or "").lower().strip()
            if c_id:
                enrolled_map[c_id] = ec
                enrolled_map[str(c_id)] = ec
            if title:
                enrolled_map[title] = ec

        stage_names = [
            "Foundational Fundamentals",
            "Core Intermediate Mastery",
            "Advanced Systems & Specialization",
            "Production Architecture & Capstone"
        ]

        milestones: List[Dict[str, Any]] = []
        total_progress = 0
        all_previous_completed = True

        for idx, course in enumerate(selected):
            c_id = course.get("id")
            c_title = (course.get("title") or "").lower().strip()
            c_skills = course.get("skills") or []
            
            # Enrollment check
            enrolled_info = enrolled_map.get(c_id) or enrolled_map.get(str(c_id)) or enrolled_map.get(c_title)

            progress_pct = 0
            is_enrolled = enrolled_info is not None

            if enrolled_info:
                progress_pct = int(enrolled_info.get("progress") or enrolled_info.get("progress_percentage") or 0)
                if enrolled_info.get("status") == "completed" or progress_pct >= 100:
                    progress_pct = 100

            total_progress += progress_pct

            # Generate "Why Recommended" badge
            c_skills_lower = [str(s).lower() for s in c_skills]
            bridged = [s for s in c_skills if s.lower() in missing_skills_set]
            
            if bridged:
                why_recommended = f"Bridges critical skill gap in {', '.join(bridged[:2])}"
            elif idx == 0:
                why_recommended = f"Essential foundational prerequisite for {goal}"
            elif idx == len(selected) - 1:
                why_recommended = f"Capstone mastery & production architecture for {goal}"
            else:
                why_recommended = f"Core specialization aligned with target role ({course.get('category')})"

            # Prerequisite status computation:
            # Step 1 is never locked by prior step.
            # Step N is locked if Step N-1 is not completed, unless Step N is already completed/in-progress.
            is_completed = (progress_pct >= 100) or (enrolled_info and enrolled_info.get("status") == "completed")
            
            if is_completed:
                status_text = "COMPLETED"
                is_locked = False
                is_in_progress = False
                prereq_note = None
            elif not all_previous_completed and not (is_enrolled and progress_pct > 0):
                # Locked because previous milestone not finished
                prev_milestone = milestones[idx - 1]
                status_text = "LOCKED"
                is_locked = True
                is_in_progress = False
                prereq_note = f"Complete \"{prev_milestone['title']}\" first"
            else:
                # Unlocked / Available / In Progress
                is_locked = False
                if is_enrolled and progress_pct > 0:
                    status_text = "IN PROGRESS"
                    is_in_progress = True
                elif is_enrolled:
                    status_text = "AVAILABLE"
                    is_in_progress = True
                else:
                    status_text = "AVAILABLE"
                    is_in_progress = False
                prereq_note = None

            if not is_completed:
                all_previous_completed = False

            milestones.append({
                "step_number": idx + 1,
                "stage": stage_names[idx] if idx < len(stage_names) else f"Phase {idx + 1}",
                "course_id": course.get("id"),
                "title": course.get("title"),
                "category": course.get("category"),
                "level": course.get("level") or course.get("difficulty") or "Intermediate",
                "duration": course.get("duration") or "30 hours",
                "instructor": course.get("instructor") or course.get("instructor_name", "SmartLearn Faculty"),
                "icon": course.get("icon", "fa-solid fa-graduation-cap"),
                "color_theme": course.get("color_theme", "linear-gradient(135deg, #5B3FE8, #8B4AD9)"),
                "skills": c_skills[:4],
                "description": course.get("short_description") or course.get("description", ""),
                "progress_percentage": progress_pct,
                "status": status_text,
                "is_completed": is_completed,
                "is_in_progress": is_in_progress,
                "is_locked": is_locked,
                "is_available": not is_locked,
                "why_recommended": why_recommended,
                "prerequisite_note": prereq_note,
                "bridged_skills": bridged
            })

        overall_path_progress = round(total_progress / len(milestones)) if milestones else 0
        completed_steps = sum(1 for m in milestones if m["is_completed"])

        return {
            "career_goal": goal,
            "secondary_career_goal": secondary_career_goal or "",
            "readiness_percentage": gap_analysis.get("readiness_percentage", 0),
            "total_steps": len(milestones),
            "completed_steps": completed_steps,
            "overall_progress_percentage": overall_path_progress,
            "matching_skills_count": len(matching_skills_names),
            "missing_skills_count": len(missing_skills_names),
            "missing_skills": missing_skills_names,
            "milestones": milestones
        }

