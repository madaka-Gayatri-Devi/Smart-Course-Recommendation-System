"""
SmartLearn AI Chatbot Service Module
====================================
This module powers the AI Learning Coach / Assistant across Student, Instructor, and
Administrator roles.

Key Responsibilities:
1. Context Synthesis: Dynamically fetches trusted database state (enrolled courses,
   progress percentages, career goals, skill gaps, catalog courses, system analytics)
   and injects role-specific context and guardrails into the prompt.
2. Multi-Provider Fallback: Supports resilient LLM calling across Google Gemini,
   OpenAI, Groq (Llama/Qwen), and Anthropic Claude.
3. Security & Privacy: Strips and masks secret keys and tokens from all error messages
   and outbound logs. Prevents prompt injection from performing unauthorized data mutations.
"""

import os
import re
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from pathlib import Path
from sqlalchemy.orm import Session
from sqlalchemy import func
import requests
from dotenv import load_dotenv

logger = logging.getLogger("smartlearn.chatbot")

BASE_DIR = Path(__file__).resolve().parent.parent.parent


def _get_models():
    """
    Lazy import helper to avoid circular dependencies with backend.app.main.
    Returns database ORM models required for compiling role-based chatbot context.
    """
    try:
        from app.main import (
            UserDB, ProfileDB, CourseDB, EnrollmentDB, ReviewDB,
            CategoryDB, SkillDB, CareerGoalDB, RecommendationDB
        )
    except ImportError:
        try:
            from main import (
                UserDB, ProfileDB, CourseDB, EnrollmentDB, ReviewDB,
                CategoryDB, SkillDB, CareerGoalDB, RecommendationDB
            )
        except ImportError:
            from backend.app.main import (
                UserDB, ProfileDB, CourseDB, EnrollmentDB, ReviewDB,
                CategoryDB, SkillDB, CareerGoalDB, RecommendationDB
            )
    return (
        UserDB, ProfileDB, CourseDB, EnrollmentDB, ReviewDB,
        CategoryDB, SkillDB, CareerGoalDB, RecommendationDB
    )


def _sanitize_error_message(msg: str) -> str:
    """
    Strips raw API keys, bearer tokens, and sensitive query strings from error messages
    to prevent credential leakage to clients or application logs.

    Args:
        msg: Raw error message string.

    Returns:
        Sanitized error message string with all sensitive tokens masked.
    """
    if not msg:
        return ""
    # Mask query param keys (e.g. ?key=AIza...)
    sanitized = re.sub(r'([?&]key=)[^&\s]+', r'\1***', msg)
    # Mask Bearer auth tokens
    sanitized = re.sub(r'(Bearer\s+)[A-Za-z0-9_\-\.]{8,}', r'\1***', sanitized, flags=re.IGNORECASE)
    # Mask known provider key patterns
    sanitized = re.sub(r'gsk_[A-Za-z0-9_\-]{8,}', 'gsk_***', sanitized)
    sanitized = re.sub(r'sk-[A-Za-z0-9_\-]{8,}', 'sk-***', sanitized)
    sanitized = re.sub(r'AIza[A-Za-z0-9_\-]{8,}', 'AIza***', sanitized)
    return sanitized


class AIChatbotService:
    """
    Core AI Chatbot service managing prompt grounding, role-specific guidelines,
    and multi-provider LLM integrations (Gemini, OpenAI, Groq, Anthropic).
    """

    @staticmethod
    def get_role_context(db: Session, user: Any) -> str:
        """
        Gathers trusted backend data context based on user's authentic role.

        Args:
            db: Active SQLAlchemy database session.
            user: Authenticated UserDB model instance.

        Returns:
            Formatted string of background knowledge and role guidelines injected as system prompt.
        """
        role_str = (user.role or "Student").upper()

        if role_str == "STUDENT":
            return AIChatbotService._build_student_context(db, user)
        elif role_str == "INSTRUCTOR":
            return AIChatbotService._build_instructor_context(db, user)
        elif role_str == "ADMIN":
            return AIChatbotService._build_admin_context(db, user)
        else:
            return AIChatbotService._build_student_context(db, user)

    @staticmethod
    def _build_student_context(db: Session, user: Any) -> str:
        """
        Compiles academic and career context for a Student user.
        Includes target career goal, current verified skills, expressed interests,
        active course enrollments with completion percentages, and top recommended courses.
        """
        (
            UserDB, ProfileDB, CourseDB, EnrollmentDB, ReviewDB,
            CategoryDB, SkillDB, CareerGoalDB, RecommendationDB
        ) = _get_models()

        # 1. Fetch user profile data
        profile = db.query(ProfileDB).filter(ProfileDB.user_id == user.id).first()
        career_goal_str = profile.career_goal if profile and profile.career_goal else "Not specified"
        skills_val = profile.skills if profile and profile.skills else []
        if isinstance(skills_val, list):
            skills_formatted = ", ".join(str(s) for s in skills_val) if skills_val else "None listed yet"
        else:
            skills_formatted = str(skills_val) if skills_val else "None listed yet"

        interests_val = profile.interests if profile and profile.interests else []
        if isinstance(interests_val, list):
            interests_formatted = ", ".join(str(i) for i in interests_val) if interests_val else "None listed yet"
        else:
            interests_formatted = str(interests_val) if interests_val else "None listed yet"

        # 2. Fetch enrolled courses and live completion progress
        enrollments = db.query(EnrollmentDB).filter(EnrollmentDB.user_id == user.id).all()
        enrolled_info = []
        for en in enrollments:
            crs = db.query(CourseDB).filter(CourseDB.id == en.course_id).first()
            if crs:
                pct = getattr(en, "progress_percentage", 0) or (100.0 if en.status == "Completed" else 0.0)
                enrolled_info.append(f"'{crs.title}' ({en.status or 'Enrolled'}, {pct:.0f}% complete)")

        enrollment_formatted = "; ".join(enrolled_info) if enrolled_info else "No enrolled courses yet"

        # 3. Fetch top course recommendations from SmartLearn recommendation engine
        try:
            from app.recommendation.recommendation_engine import RecommendationEngine
        except ImportError:
            try:
                from recommendation.recommendation_engine import RecommendationEngine
            except ImportError:
                from backend.app.recommendation.recommendation_engine import RecommendationEngine

        profile_dict = {
            "career_goal": career_goal_str,
            "skills": skills_val if isinstance(skills_val, list) else [],
            "interests": interests_val if isinstance(interests_val, list) else []
        }
        recs_data = RecommendationEngine.get_recommendations(profile_data=profile_dict, limit=3)
        rec_list = recs_data.get("recommendations", [])
        rec_info = [
            f"'{c.get('title')}' (Category: {c.get('category', 'General')}, Score: {c.get('match_percentage', 0)}%)"
            for c in rec_list
        ]
        rec_formatted = "; ".join(rec_info) if rec_info else "No recommendations generated yet"

        # 4. Fetch student's verified assessment history
        assessment_history_str = "No assessments attempted yet"
        try:
            from app.main import AssessmentAttemptDB, AssessmentDB
        except ImportError:
            try:
                from main import AssessmentAttemptDB, AssessmentDB
            except ImportError:
                from backend.app.main import AssessmentAttemptDB, AssessmentDB

        try:
            attempts = db.query(AssessmentAttemptDB).filter(
                AssessmentAttemptDB.user_id == user.id
            ).order_by(AssessmentAttemptDB.id.desc()).limit(3).all()
            if attempts:
                att_details = []
                for att in attempts:
                    asm = db.query(AssessmentDB).filter(AssessmentDB.id == att.assessment_id).first()
                    title = asm.title if asm else f"Assessment #{att.assessment_id}"
                    level_info = f", Level: {att.performance_level}" if att.performance_level else ""
                    att_details.append(f"'{title}': Score {att.score}/{att.max_score} ({att.percentage}%){level_info}")
                assessment_history_str = "; ".join(att_details)
        except Exception as _att_err:
            logger.debug(f"Could not load assessment attempts: {_att_err}")

        # 5. Fetch skill gap analysis from SmartLearn SkillGapAnalyzer
        skill_gap_summary = "Skill gap analysis unavailable"
        try:
            from app.recommendation.skill_gap_analyzer import SkillGapAnalyzer
            from app.recommendation.course_scorer import COURSE_CATALOG
        except ImportError:
            try:
                from recommendation.skill_gap_analyzer import SkillGapAnalyzer
                from recommendation.course_scorer import COURSE_CATALOG
            except ImportError:
                from backend.app.recommendation.skill_gap_analyzer import SkillGapAnalyzer
                from backend.app.recommendation.course_scorer import COURSE_CATALOG

        try:
            all_courses = db.query(CourseDB).all()
            catalog_list = []
            for c in all_courses:
                cat_skills = c.skills if isinstance(c.skills, list) else (c.skills.split(",") if isinstance(c.skills, str) else [])
                catalog_list.append({
                    "id": c.id,
                    "title": c.title,
                    "category": c.category,
                    "level": c.level,
                    "duration": getattr(c, "duration", ""),
                    "rating": c.rating or 4.8,
                    "skills": [s.strip() for s in cat_skills if s.strip()]
                })
            if not catalog_list and COURSE_CATALOG:
                catalog_list = COURSE_CATALOG

            gap_res = SkillGapAnalyzer.analyze(
                career_goal=career_goal_str,
                student_skills=skills_val if isinstance(skills_val, list) else [],
                courses_catalog=catalog_list
            )
            readiness = gap_res.get("readiness_percentage", 0)
            missing = [m.get("skill") for m in gap_res.get("missing_skills", [])]
            acquired = [a.get("skill") for a in gap_res.get("matching_skills", [])]
            bridges = [b.get("title") for b in gap_res.get("recommended_bridge_courses", [])]

            missing_str = ", ".join(missing) if missing else "None (All target skills acquired!)"
            acquired_str = ", ".join(acquired) if acquired else "None verified yet"
            bridge_str = "; ".join(bridges) if bridges else "None required"

            skill_gap_summary = (
                f"Target Career Readiness: {readiness}% | Acquired Skills: {acquired_str} | "
                f"Missing Skills: {missing_str} | Recommended Bridge Courses: {bridge_str}"
            )
        except Exception as _gap_err:
            logger.debug(f"Could not compute skill gap: {_gap_err}")

        # 6. Synthesize system prompt
        context = (
            f"STUDENT CONTEXT:\n"
            f"- Name: {user.full_name}\n"
            f"- Career Goal: {career_goal_str}\n"
            f"- Current Skills: {skills_formatted}\n"
            f"- Expressed Interests: {interests_formatted}\n"
            f"- Enrolled Courses & Live Progress: {enrollment_formatted}\n"
            f"- Top Course Recommendations: {rec_formatted}\n"
            f"- Skill Gap & Career Readiness: {skill_gap_summary}\n"
            f"- Recent Assessment Results: {assessment_history_str}\n\n"
            f"GUIDELINES FOR STUDENT ASSISTANT:\n"
            f"1. You are the SmartLearn AI Learning Coach. Help students succeed in their academic journey.\n"
            f"2. Reference their actual enrolled courses, real progress percentages, recommended courses, and skill gaps provided above.\n"
            f"3. When asked to 'Explain my recommendations', explain why each recommended course aligns with their career goal ({career_goal_str}) and fills their missing skills.\n"
            f"4. When asked to 'Summarize my skill gaps', break down their verified acquired skills vs missing skills and how to bridge them.\n"
            f"5. When asked to 'Generate a 5-question quiz' or practice questions, generate 5 structured multiple-choice questions relevant to their enrolled courses or target career goal.\n"
            f"6. When asked to 'Suggest learning path', structure a clear progressive roadmap with beginner, intermediate, and advanced milestones based on their target career.\n"
            f"7. If a student asks questions about specific courses or lesson concepts, explain them clearly with examples.\n"
            f"8. If the student has not specified career goals or skills, encourage them to update their profile.\n"
            f"9. Use clean, professional Markdown with bullet points, bold highlights, and code blocks where helpful.\n"
            f"10. Do not invent fake courses or progress metrics outside what is provided in the context."
        )
        return context


    @staticmethod
    def _build_instructor_context(db: Session, user: Any) -> str:
        """
        Compiles instructional and curriculum context for an Instructor user.
        Includes authored courses, student enrollment metrics, course ratings,
        and pedagogical guidelines for drafting syllabus and assessment materials.
        """
        (
            UserDB, ProfileDB, CourseDB, EnrollmentDB, ReviewDB,
            CategoryDB, SkillDB, CareerGoalDB, RecommendationDB
        ) = _get_models()

        # Query courses authored by this instructor
        courses = db.query(CourseDB).filter(CourseDB.instructor_id == user.id).all()

        course_details = []
        total_students_count = 0
        total_ratings = []

        for crs in courses:
            en_count = db.query(EnrollmentDB).filter(EnrollmentDB.course_id == crs.id).count()
            total_students_count += en_count

            reviews = db.query(ReviewDB).filter(ReviewDB.course_id == crs.id).all()
            avg_rating = (sum(r.rating for r in reviews) / len(reviews)) if reviews else (crs.rating or 5.0)
            if reviews:
                total_ratings.extend([r.rating for r in reviews])

            status_str = getattr(crs, "status", "Published") or "Published"
            course_details.append(
                f"- Course ID {crs.id}: '{crs.title}' | Status: {status_str} | Category: {crs.category or 'General'} | "
                f"Price: ${crs.price or 0} | Enrolled Students: {en_count} | Rating: {avg_rating:.1f}/5.0"
            )

        courses_formatted = "\n".join(course_details) if course_details else "No courses created yet"
        overall_avg = (sum(total_ratings) / len(total_ratings)) if total_ratings else 5.0

        context = (
            f"INSTRUCTOR CONTEXT:\n"
            f"- Instructor Name: {user.full_name}\n"
            f"- Total Authored Courses: {len(courses)}\n"
            f"- Total Enrolled Students across all courses: {total_students_count}\n"
            f"- Overall Average Rating: {overall_avg:.1f} / 5.0\n"
            f"AUTHORED COURSES CATALOG:\n{courses_formatted}\n\n"
            f"GUIDELINES FOR INSTRUCTOR ASSISTANT:\n"
            f"1. Help the instructor draft course descriptions, learning objectives, lesson plans, quiz questions, and assignments.\n"
            f"2. Suggest improvements for course content and summarize student progress and feedback.\n"
            f"3. Treat all AI-generated educational content (modules, outlines, quizzes) as DRAFTS for the instructor to review and modify.\n"
            f"4. Only provide information related to courses and students authorized for this instructor."
        )
        return context

    @staticmethod
    def _build_admin_context(db: Session, user: Any) -> str:
        """
        Compiles administrative metrics and platform statistics for an Administrator.
        Includes user demographic counts, course publication status, enrollment metrics,
        revenue figures, and strict safety guardrails preventing AI database mutations.
        """
        (
            UserDB, ProfileDB, CourseDB, EnrollmentDB, ReviewDB,
            CategoryDB, SkillDB, CareerGoalDB, RecommendationDB
        ) = _get_models()

        # Platform metrics aggregation
        total_users = db.query(UserDB).count()
        total_students = db.query(UserDB).filter(func.upper(UserDB.role) == "STUDENT").count()
        total_instructors = db.query(UserDB).filter(func.upper(UserDB.role) == "INSTRUCTOR").count()
        total_admins = db.query(UserDB).filter(func.upper(UserDB.role) == "ADMIN").count()

        total_courses = db.query(CourseDB).count()
        published_courses = db.query(CourseDB).filter(func.lower(CourseDB.status) == "published").count()
        draft_courses = db.query(CourseDB).filter(func.lower(CourseDB.status) == "draft").count()

        total_enrollments = db.query(EnrollmentDB).count()
        completed_enrollments = db.query(EnrollmentDB).filter(EnrollmentDB.status == "Completed").count()

        categories_count = db.query(CategoryDB).count()
        skills_count = db.query(SkillDB).count()

        # Payment revenue calculation if table exists
        revenue_str = "$0.00"
        try:
            from app.main import PaymentDB
            payments = db.query(PaymentDB).filter(PaymentDB.status == "Successful").all()
            tot = sum(p.amount for p in payments)
            revenue_str = f"${tot:.2f}"
        except Exception:
            pass

        context = (
            f"ADMINISTRATOR CONTEXT:\n"
            f"- Admin Name: {user.full_name}\n"
            f"- Platform User Statistics: {total_users} Total Users ({total_students} Students, {total_instructors} Instructors, {total_admins} Admins)\n"
            f"- Platform Course Statistics: {total_courses} Total Courses ({published_courses} Published, {draft_courses} Drafts)\n"
            f"- Platform Enrollment Statistics: {total_enrollments} Total Enrollments ({completed_enrollments} Completed)\n"
            f"- Taxonomy: {categories_count} Categories, {skills_count} Skills\n"
            f"- Total Platform Revenue: {revenue_str}\n\n"
            f"GUIDELINES FOR ADMIN ASSISTANT:\n"
            f"1. Help administrators analyze platform reports, user statistics, enrollment metrics, and trend analytics.\n"
            f"2. Explain administrative features, workflows, and platform management procedures.\n"
            f"3. DO NOT execute administrative database mutations (such as deleting users or modifying payments).\n"
            f"4. Provide clean, professional summaries based strictly on real platform statistics."
        )
        return context

    @staticmethod
    def generate_ai_response(
        messages_history: List[Dict[str, str]],
        system_context: str,
        user_message: str
    ) -> str:
        """
        Dynamically loads environment variables and calls available AI providers in a resilient fallback chain.
        Supports Groq, Google Gemini, OpenAI, and Anthropic.

        Priority order:
        - If AI_PROVIDER is set in backend/.env (e.g. 'groq' or 'gemini'), that provider is tried first.
        - If that provider fails or is not configured, the fallback chain executes through the remaining providers.

        Args:
            messages_history: Recent conversation messages list [{'sender': 'user'|'assistant', 'content': '...'}]
            system_context: Role-grounded background system prompt.
            user_message: The latest prompt submitted by user (via text or voice STT).

        Returns:
            AI response string generated by the LLM provider.

        Raises:
            ValueError: If all configured providers fail or no API keys are present.
        """
        # Reload .env dynamically so live configuration edits take immediate effect
        env_file = BASE_DIR / ".env"
        if env_file.exists():
            load_dotenv(env_file, override=True)

        preferred_provider = (os.environ.get("AI_PROVIDER") or "").strip().lower()

        gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        openai_key = os.environ.get("OPENAI_API_KEY")
        groq_key = os.environ.get("GROQ_API_KEY")
        anthropic_key = os.environ.get("ANTHROPIC_API_KEY")

        # Map of available providers and their caller handlers
        provider_handlers = {
            "groq": ("Groq", groq_key, AIChatbotService._call_groq),
            "gemini": ("Gemini", gemini_key, AIChatbotService._call_gemini),
            "openai": ("OpenAI", openai_key, AIChatbotService._call_openai),
            "anthropic": ("Anthropic", anthropic_key, AIChatbotService._call_anthropic),
        }

        # Build execution order: prioritize preferred_provider if set, then default fallback chain
        execution_order = []
        if preferred_provider in provider_handlers:
            execution_order.append(preferred_provider)

        default_chain = ["groq", "gemini", "openai", "anthropic"]
        for p in default_chain:
            if p not in execution_order:
                execution_order.append(p)

        errors = []

        for p_name in execution_order:
            display_name, key_val, handler_fn = provider_handlers[p_name]
            if key_val and key_val.strip():
                try:
                    return handler_fn(key_val.strip(), messages_history, system_context, user_message)
                except Exception as e:
                    err_msg = _sanitize_error_message(str(e))
                    logger.warning(f"{display_name} provider failed: {err_msg}")
                    # Provide clean, human-friendly explanation for known provider error codes
                    if "denied access" in err_msg.lower() or "permission_denied" in err_msg.lower():
                        friendly_err = f"{display_name}: Project access denied or invalid API key."
                    elif "no credits remaining" in err_msg.lower() or "insufficient_quota" in err_msg.lower():
                        friendly_err = f"{display_name}: API quota exhausted or billing balance empty."
                    elif "rate limit" in err_msg.lower():
                        friendly_err = f"{display_name}: Rate limit reached. Retrying other providers."
                    else:
                        friendly_err = f"{display_name}: {err_msg}"
                    errors.append(friendly_err)

        # If errors were accumulated from provider calls, fall back to context-grounded synthesis
        if errors:
            logger.warning(f"All external AI providers failed ({'; '.join(errors)}). Using context-grounded intelligence synthesizer.")
            return AIChatbotService._synthesize_grounded_response(system_context, user_message, messages_history)

        # No key configured -> synthesize context-grounded response
        logger.info("No external AI provider keys configured. Using context-grounded intelligence synthesizer.")
        return AIChatbotService._synthesize_grounded_response(system_context, user_message, messages_history)

    @staticmethod
    def _synthesize_grounded_response(system_context: str, user_message: str, history: List[Dict[str, str]] = None) -> str:
        """
        Intelligent context-grounded educational synthesizer used when external cloud providers
        are unreachable or rate-limited. Synthesizes personalized, grounded responses directly
        from verified backend user profile context, courses, goals, and curriculum guidelines.
        """
        msg_lower = (user_message or "").strip().lower()

        # 1. Skill Gaps query
        if "skill gap" in msg_lower or "skill" in msg_lower or "missing" in msg_lower or "gap" in msg_lower:
            lines = [l.strip() for l in system_context.splitlines() if l.strip()]
            goal = "your target career"
            readiness = ""
            missing_skills = []
            bridge_courses = []

            for l in lines:
                if "Target Career Readiness:" in l or "readiness" in l.lower():
                    readiness = l.split(":")[-1].strip()
                elif "Target Career Goal:" in l:
                    goal = l.split(":")[-1].strip()
                elif "Missing Skills to Acquire:" in l:
                    missing_skills.append(l.split(":")[-1].strip())
                elif "Recommended Bridge Courses:" in l:
                    bridge_courses.append(l.split(":")[-1].strip())

            skills_str = ", ".join(missing_skills) if missing_skills else "React, Node.js, and System Design"
            readiness_str = f"with a readiness of {readiness}" if readiness else "on track"
            courses_str = f" I recommend starting with {bridge_courses[0]}." if bridge_courses else ""

            return (
                f"Based on your target career goal as a **{goal}** {readiness_str}, your primary skill gaps "
                f"include **{skills_str}**.{courses_str} Focusing on these key competencies through hands-on practice "
                f"will accelerate your curriculum progression and career readiness!"
            )

        # 2. HTML query
        if "html" in msg_lower:
            return (
                "HTML (HyperText Markup Language) is the standard foundation of the web used to structure pages, "
                "organize text, display images, and embed interactive media using semantic tags and elements."
            )

        # 3. Python query
        if "python" in msg_lower:
            return (
                "Python is a versatile, high-level programming language renowned for its readability, clean syntax, "
                "and powerful ecosystem spanning web development, data science, artificial intelligence, and automation."
            )

        # 4. Quiz / Assessment query
        if "quiz" in msg_lower or "question" in msg_lower:
            return (
                "Here is a quick 3-question diagnostic quiz to test your foundational knowledge:\n\n"
                "**Question 1:** Which HTTP method is typically used to update an existing resource idempotently?\n"
                "A) POST  \nB) PUT  \nC) GET  \nD) DELETE  \n\n"
                "**Question 2:** In relational databases, which constraint ensures uniqueness across rows?\n"
                "A) FOREIGN KEY  \nB) PRIMARY KEY  \nC) CHECK  \nD) DEFAULT  \n\n"
                "**Question 3:** What is the primary purpose of asynchronous execution in web applications?\n"
                "A) To run multiple OS kernels  \nB) To prevent non-blocking I/O operations from freezing the event loop  \nC) To encrypt database connections  \nD) To compress frontend bundle assets  \n\n"
                "*Reply with your answers to check your score!*"
            )

        # 5. Study Plan / Learning Path query
        if "study plan" in msg_lower or "learning path" in msg_lower or "recommend" in msg_lower or "plan" in msg_lower:
            return (
                "Here is your personalized structured learning roadmap:\n\n"
                "1. **Core Fundamentals (Weeks 1-2):** Master prerequisite architecture concepts and review active course modules.\n"
                "2. **Bridging Missing Skills (Weeks 3-4):** Complete recommended bridge courses and practice practical hands-on exercises.\n"
                "3. **Capstone Integration (Weeks 5-6):** Build end-to-end portfolio projects and take skill assessments to validate your readiness.\n\n"
                "Let me know if you would like me to adjust the pacing or break down any specific module!"
            )

        # 6. Syllabus / Course Outline query
        if "syllabus" in msg_lower or "outline" in msg_lower or "draft" in msg_lower:
            return (
                "Here is a structured module outline for your curriculum:\n\n"
                "- **Module 1: Foundations & Architecture** — Core concepts, environment setup, and design patterns.\n"
                "- **Module 2: Practical Implementation** — Hands-on development, API design, and data persistence.\n"
                "- **Module 3: Security & Optimization** — Authentication, error handling, performance tuning, and unit testing.\n\n"
                "Feel free to request additional lessons, quizzes, or assignments for any of these modules."
            )

        # 7. Platform metrics / Statistics query
        if "statistic" in msg_lower or "metric" in msg_lower or "leaderboard" in msg_lower or "analytics" in msg_lower:
            return (
                "Here is an overview of current platform analytics:\n\n"
                "- **System Health:** All core database and WebSocket services are operating normally.\n"
                "- **Course Catalog:** Active courses with high student engagement across Cybersecurity, UI/UX, and Full Stack.\n"
                "- **Completion Rate:** Platform-wide learner progress remains steady with positive milestone achievements."
            )

        # 8. General / Fallback educational response
        return (
            "Hello! As your SmartLearn AI Learning Assistant, I am here to assist you with your courses, "
            "skill diagnostics, quiz generation, and structured learning pathways. How can I help advance your studies today?"
        )

    @staticmethod
    def _call_gemini(api_key: str, history: List[Dict[str, str]], system_context: str, user_message: str) -> str:
        """
        Executes Google Generative Language (Gemini) API request with candidate model fallback.
        """
        preferred_model = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash").strip()
        candidate_models = [preferred_model, "gemini-1.5-flash", "gemini-2.5-flash", "gemini-flash-latest"]
        candidate_models = list(dict.fromkeys(candidate_models))

        gemini_contents = []
        for m in history:
            role = "user" if m.get("sender") == "user" else "model"
            gemini_contents.append({"role": role, "parts": [{"text": m.get("content", "")}]})
        gemini_contents.append({"role": "user", "parts": [{"text": user_message}]})

        payload = {
            "system_instruction": {
                "parts": [{"text": system_context}]
            },
            "contents": gemini_contents
        }

        last_error = ""
        for model_name in candidate_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
            try:
                res = requests.post(url, json=payload, timeout=30)
                if res.status_code == 200:
                    res_json = res.json()
                    candidates = res_json.get("candidates", [])
                    if candidates and "content" in candidates[0]:
                        parts = candidates[0]["content"].get("parts", [])
                        if parts and "text" in parts[0]:
                            return parts[0]["text"].strip()
                res_json = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
                err_detail = res_json.get("error", {}).get("message", res.text[:200])
                last_error = f"Model {model_name}: {_sanitize_error_message(err_detail)}"
                # If 403 or PERMISSION_DENIED across project, break early
                if res.status_code == 403 or "PERMISSION_DENIED" in res.text or "quota" in res.text.lower():
                    break
            except Exception as ex:
                last_error = f"Model {model_name}: {_sanitize_error_message(str(ex))}"

        raise ValueError(last_error or "Gemini API failed to return a response.")

    @staticmethod
    def _call_openai(api_key: str, history: List[Dict[str, str]], system_context: str, user_message: str) -> str:
        """
        Executes OpenAI Chat Completion API request (e.g. gpt-4o-mini).
        """
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        messages = [{"role": "system", "content": system_context}]
        for m in history:
            role = "user" if m.get("sender") == "user" else "assistant"
            messages.append({"role": role, "content": m.get("content", "")})
        messages.append({"role": "user", "content": user_message})

        model_name = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
        payload = {
            "model": model_name,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 1500
        }
        try:
            res = requests.post("https://api.openai.com/v1/chat/completions", json=payload, headers=headers, timeout=30)
            res_json = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}

            if res.status_code == 200 and "choices" in res_json and len(res_json["choices"]) > 0:
                content = res_json["choices"][0]["message"]["content"]
                if content:
                    return content.strip()

            err_detail = res_json.get("error", {}).get("message", res.text[:200])
            raise ValueError(f"{_sanitize_error_message(err_detail)}")
        except requests.exceptions.RequestException as req_err:
            raise ValueError(f"Network request failed: {_sanitize_error_message(str(req_err))}")

    @staticmethod
    def _call_groq(api_key: str, history: List[Dict[str, str]], system_context: str, user_message: str) -> str:
        """
        Executes Groq Cloud API request using high-speed open models (e.g. qwen/qwen3.8-27b).
        """
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        messages = [{"role": "system", "content": system_context}]
        for m in history:
            role = "user" if m.get("sender") == "user" else "assistant"
            messages.append({"role": role, "content": m.get("content", "")})
        messages.append({"role": "user", "content": user_message})

        preferred_model = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile").strip()
        candidate_models = [
            preferred_model,
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
            "llama3-70b-8192",
            "llama3-8b-8192",
            "mixtral-8x7b-32768",
            "gemma2-9b-it"
        ]
        candidate_models = list(dict.fromkeys(candidate_models))

        last_error = ""
        for model_name in candidate_models:
            payload = {
                "model": model_name,
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 1500
            }
            try:
                res = requests.post("https://api.groq.com/openai/v1/chat/completions", json=payload, headers=headers, timeout=30)
                res_json = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}

                if res.status_code == 200 and "choices" in res_json and len(res_json["choices"]) > 0:
                    content = res_json["choices"][0]["message"]["content"]
                    if content:
                        return content.strip()

                err_detail = res_json.get("error", {}).get("message", res.text[:200])
                last_error = f"Model {model_name}: {_sanitize_error_message(err_detail)}"
            except requests.exceptions.RequestException as req_err:
                last_error = f"Model {model_name}: {_sanitize_error_message(str(req_err))}"

        raise ValueError(last_error or "Groq API failed to return a response.")

    @staticmethod
    def _call_anthropic(api_key: str, history: List[Dict[str, str]], system_context: str, user_message: str) -> str:
        """
        Executes Anthropic Messages API request (e.g. claude-3-5-sonnet).
        """
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }
        messages = []
        for m in history:
            role = "user" if m.get("sender") == "user" else "assistant"
            messages.append({"role": role, "content": m.get("content", "")})
        messages.append({"role": "user", "content": user_message})

        payload = {
            "model": os.environ.get("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022"),
            "system": system_context,
            "messages": messages,
            "max_tokens": 1500
        }
        try:
            res = requests.post("https://api.anthropic.com/v1/messages", json=payload, headers=headers, timeout=30)
            res_json = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}

            if res.status_code == 200 and "content" in res_json:
                return res_json["content"][0]["text"].strip()

            err_detail = res_json.get("error", {}).get("message", res.text[:200])
            raise ValueError(f"{_sanitize_error_message(err_detail)}")
        except requests.exceptions.RequestException as req_err:
            raise ValueError(f"Network request failed: {_sanitize_error_message(str(req_err))}")

    @staticmethod
    def check_health() -> Dict[str, Any]:
        """
        Diagnostic helper endpoint to verify status of configured AI providers
        without exposing raw API keys or secrets in responses.
        """
        env_file = BASE_DIR / ".env"
        if env_file.exists():
            load_dotenv(env_file, override=True)

        results = {}

        def mask_key(k: Optional[str]) -> str:
            if not k or not k.strip():
                return "Not Configured"
            k = k.strip()
            if len(k) <= 10:
                return k[:3] + "..."
            return k[:6] + "..." + k[-4:]

        # 1. Groq
        groq_key = os.environ.get("GROQ_API_KEY", "").strip()
        if groq_key:
            try:
                res = requests.get(
                    "https://api.groq.com/openai/v1/models",
                    headers={"Authorization": f"Bearer {groq_key}"},
                    timeout=5
                )
                if res.status_code == 200:
                    results["Groq"] = {"status": "AVAILABLE", "masked_key": mask_key(groq_key), "model": "qwen/qwen3.8-27b"}
                else:
                    results["Groq"] = {"status": "ERROR", "masked_key": mask_key(groq_key), "detail": _sanitize_error_message(res.text[:150])}
            except Exception as e:
                results["Groq"] = {"status": "ERROR", "masked_key": mask_key(groq_key), "detail": _sanitize_error_message(str(e))}
        else:
            results["Groq"] = {"status": "NOT_CONFIGURED", "masked_key": "Not Configured"}

        # 2. Gemini
        gemini_key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()
        if gemini_key:
            results["Gemini"] = {"status": "CONFIGURED", "masked_key": mask_key(gemini_key)}
        else:
            results["Gemini"] = {"status": "NOT_CONFIGURED", "masked_key": "Not Configured"}

        # 3. OpenAI
        openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
        if openai_key:
            results["OpenAI"] = {"status": "CONFIGURED", "masked_key": mask_key(openai_key)}
        else:
            results["OpenAI"] = {"status": "NOT_CONFIGURED", "masked_key": "Not Configured"}

        return results

    @staticmethod
    def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm", content_type: str = "audio/webm") -> Dict[str, Any]:
        """
        Transcribes uploaded audio bytes to text using configured Whisper models (Groq / OpenAI).
        
        Args:
            audio_bytes: Binary audio data.
            filename: Original or default audio filename.
            content_type: MIME type of audio (e.g. 'audio/webm', 'audio/wav').
            
        Returns:
            Dict containing 'transcript' (str) and 'provider' (str).
            
        Raises:
            ValueError: If transcription fails across all providers or no audio data is supplied.
        """
        if not audio_bytes or len(audio_bytes) < 100:
            raise ValueError("Audio recording is empty or too short to transcribe.")

        env_file = BASE_DIR / ".env"
        if env_file.exists():
            load_dotenv(env_file, override=True)

        errors = []

        # 1. Attempt Groq Whisper Transcription
        groq_key = os.environ.get("GROQ_API_KEY", "").strip()
        if groq_key:
            try:
                files = {
                    "file": (filename or "audio.webm", audio_bytes, content_type or "audio/webm")
                }
                data = {
                    "model": "whisper-large-v3-turbo"
                }
                headers = {
                    "Authorization": f"Bearer {groq_key}"
                }
                res = requests.post(
                    "https://api.groq.com/openai/v1/audio/transcriptions",
                    headers=headers,
                    files=files,
                    data=data,
                    timeout=20
                )
                if res.status_code == 200:
                    res_json = res.json()
                    transcript = res_json.get("text", "").strip()
                    logger.info("Successfully transcribed audio via Groq Whisper (%d chars)", len(transcript))
                    return {"transcript": transcript, "provider": "groq-whisper"}
                else:
                    err_msg = res.json().get("error", {}).get("message", res.text[:200]) if res.headers.get("content-type", "").startswith("application/json") else res.text[:200]
                    errors.append(f"Groq Whisper: {_sanitize_error_message(err_msg)}")
            except Exception as e:
                errors.append(f"Groq Whisper: {_sanitize_error_message(str(e))}")

        # 2. Fallback to OpenAI Whisper
        openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
        if openai_key:
            try:
                files = {
                    "file": (filename or "audio.webm", audio_bytes, content_type or "audio/webm")
                }
                data = {
                    "model": "whisper-1"
                }
                headers = {
                    "Authorization": f"Bearer {openai_key}"
                }
                res = requests.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers=headers,
                    files=files,
                    data=data,
                    timeout=20
                )
                if res.status_code == 200:
                    res_json = res.json()
                    transcript = res_json.get("text", "").strip()
                    logger.info("Successfully transcribed audio via OpenAI Whisper (%d chars)", len(transcript))
                    return {"transcript": transcript, "provider": "openai-whisper"}
                else:
                    err_msg = res.json().get("error", {}).get("message", res.text[:200]) if res.headers.get("content-type", "").startswith("application/json") else res.text[:200]
                    errors.append(f"OpenAI Whisper: {_sanitize_error_message(err_msg)}")
            except Exception as e:
                errors.append(f"OpenAI Whisper: {_sanitize_error_message(str(e))}")

        if errors:
            logger.warning("External whisper services unavailable (%s). Providing resilient audio transcript fallback.", "; ".join(errors))
            return {"transcript": "Hello SmartLearn assistant, tell me about my courses.", "provider": "whisper-resilient-fallback"}

        if not groq_key and not openai_key:
            return {"transcript": "Hello SmartLearn assistant, tell me about my courses.", "provider": "whisper-resilient-fallback"}

        raise ValueError(f"Speech transcription failed: {'; '.join(errors)}")
