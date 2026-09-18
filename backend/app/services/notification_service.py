import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Any
from collections import defaultdict
from fastapi import WebSocket
from sqlalchemy.orm import Session
import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))


def _get_models():
    try:
        from app.main import (
            UserDB, ProfileDB, CourseDB, EnrollmentDB,
            AssessmentAttemptDB, AssessmentDB, CareerGoalDB, NotificationDB
        )
    except ImportError:
        try:
            from main import (
                UserDB, ProfileDB, CourseDB, EnrollmentDB,
                AssessmentAttemptDB, AssessmentDB, CareerGoalDB, NotificationDB
            )
        except ImportError:
            from backend.app.main import (
                UserDB, ProfileDB, CourseDB, EnrollmentDB,
                AssessmentAttemptDB, AssessmentDB, CareerGoalDB, NotificationDB
            )
    return UserDB, ProfileDB, CourseDB, EnrollmentDB, AssessmentAttemptDB, AssessmentDB, CareerGoalDB, NotificationDB


def _get_rec_engine():
    try:
        from app.recommendation.recommendation_engine import RecommendationEngine
    except ImportError:
        try:
            from recommendation.recommendation_engine import RecommendationEngine
        except ImportError:
            from backend.app.recommendation.recommendation_engine import RecommendationEngine
    return RecommendationEngine


def _get_email_service():
    try:
        from app.services.email_service import EmailService
        import app.services.email_templates as email_templates
    except ImportError:
        try:
            from services.email_service import EmailService
            import services.email_templates as email_templates
        except ImportError:
            from backend.app.services.email_service import EmailService
            import backend.app.services.email_templates as email_templates
    return EmailService, email_templates


class ConnectionManager:
    """In-memory WebSocket manager tracking active user websocket connections."""

    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = defaultdict(list)

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_id].append(websocket)
        print(f"[WebSocket] User {user_id} connected. Total connections for user: {len(self.active_connections[user_id])}")

    def disconnect(self, user_id: int, websocket: WebSocket):
        if websocket in self.active_connections[user_id]:
            self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        print(f"[WebSocket] User {user_id} disconnected.")

    async def send_personal_message(self, user_id: int, message: dict):
        if user_id in self.active_connections:
            dead_sockets = []
            for websocket in list(self.active_connections[user_id]):
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    print(f"[WebSocket] Failed to send message to user {user_id}: {e}")
                    dead_sockets.append(websocket)
            for ds in dead_sockets:
                self.disconnect(user_id, ds)

    def push_notification_to_user_sync(self, user_id: int, notification_data: dict):
        """Helper to send push notifications from synchronous DB operations."""
        if user_id in self.active_connections:
            try:
                try:
                    loop = asyncio.get_running_loop()
                except RuntimeError:
                    loop = None

                if loop and loop.is_running():
                    asyncio.run_coroutine_threadsafe(
                        self.send_personal_message(user_id, {
                            "type": "NOTIFICATION",
                            "data": notification_data
                        }),
                        loop
                    )
                else:
                    new_loop = asyncio.new_event_loop()
                    new_loop.run_until_complete(
                        self.send_personal_message(user_id, {
                            "type": "NOTIFICATION",
                            "data": notification_data
                        })
                    )
                    new_loop.close()
            except Exception as err:
                print(f"[WebSocket Sync Push Warning] Could not dispatch sync event: {err}")


ws_manager = ConnectionManager()


class NotificationService:
    """Core Service handling database notification creation, duplicate checks, and push triggers."""

    @staticmethod
    def create_notification(
        db: Session,
        user_id: int,
        title: str,
        message: str,
        notification_type: str,
        related_course_id: Optional[int] = None,
        reference_id: Optional[str] = None
    ):
        """Create a new notification record in the database and push via WebSocket."""
        _, _, _, _, _, _, _, NotificationDB = _get_models()
        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

        notification = NotificationDB(
            user_id=user_id,
            title=title,
            message=message,
            type=notification_type,
            related_course_id=related_course_id,
            reference_id=reference_id,
            is_read=0,
            created_at=now_str
        )
        db.add(notification)
        db.commit()
        db.refresh(notification)

        unread_count = db.query(NotificationDB).filter(
            NotificationDB.user_id == user_id,
            NotificationDB.is_read == 0
        ).count()

        notif_dict = {
            "id": notification.id,
            "user_id": notification.user_id,
            "title": notification.title,
            "message": notification.message,
            "type": notification.type,
            "related_course_id": notification.related_course_id,
            "reference_id": notification.reference_id,
            "is_read": notification.is_read,
            "created_at": notification.created_at,
            "unread_count": unread_count
        }

        ws_manager.push_notification_to_user_sync(user_id, notif_dict)
        return notification

    @staticmethod
    def generate_personalized_recommendation_notifications(db: Session, user_id: int, db_courses: List[Dict[str, Any]], db_goals: Dict[str, List[str]]):
        """
        Generate non-duplicate personalized course recommendation notifications for a specific student.
        Uses RecommendationEngine to identify top matches based on student's profile and sends an email.
        """
        UserDB, ProfileDB, _, EnrollmentDB, AssessmentAttemptDB, AssessmentDB, _, NotificationDB = _get_models()
        RecommendationEngine = _get_rec_engine()
        EmailService, email_templates = _get_email_service()

        user = db.query(UserDB).filter(UserDB.id == user_id).first()
        if not user or user.role.lower() != "student":
            return

        profile = db.query(ProfileDB).filter(ProfileDB.user_id == user_id).first()
        attempts_db = db.query(AssessmentAttemptDB).filter(AssessmentAttemptDB.user_id == user_id).all()
        attempts = []
        for a in attempts_db:
            assess = db.query(AssessmentDB).filter(AssessmentDB.id == a.assessment_id).first()
            attempts.append({
                "assessment_id": a.assessment_id,
                "category": assess.category if assess else "",
                "score": a.score,
                "percentage": a.percentage,
                "performance_level": a.performance_level
            })

        enrollments = db.query(EnrollmentDB).filter(EnrollmentDB.user_id == user_id).all()
        enrolled_course_ids = [e.course_id for e in enrollments]
        completed_course_ids = [e.course_id for e in enrollments if e.status == "completed" or (e.progress_percentage or 0) >= 100]

        profile_dict = {}
        if profile:
            profile_dict = {
                "career_goal": profile.career_goal,
                "secondary_career_goal": profile.secondary_career_goal,
                "skills": profile.skills or [],
                "interests": profile.interests or [],
                "education": profile.education or [],
                "courses": profile.courses or [],
                "learning_style": profile.learning_style
            }

        recs_result = RecommendationEngine.get_recommendations(
            profile_data=profile_dict,
            assessment_attempts=attempts,
            limit=5,
            courses_catalog=db_courses,
            enrolled_course_ids=enrolled_course_ids,
            completed_course_ids=completed_course_ids,
            goals_map=db_goals
        )

        top_recs = recs_result.get("recommendations", [])
        career_goal = profile.career_goal if profile and profile.career_goal else "Full Stack Developer"
        new_recs = []

        for rec in top_recs[:3]:
            course_id = rec.get("id")
            course_title = rec.get("title")
            match_pct = rec.get("match_percentage", 85)

            if not course_id or not course_title:
                continue

            existing_notif = db.query(NotificationDB).filter(
                NotificationDB.user_id == user_id,
                NotificationDB.type == "COURSE_RECOMMENDATION",
                NotificationDB.related_course_id == course_id
            ).first()

            if existing_notif:
                continue

            breakdown = rec.get("scores_breakdown", {})
            c_score = breakdown.get("career_score", 0)
            i_score = breakdown.get("interest_score", 0)
            sg_score = breakdown.get("skill_gap_score", 0)

            if c_score >= 20:
                msg = f"'{course_title}' is recommended based on your skills and '{career_goal}' career goal ({match_pct}% match)."
                reason = f"Matches '{career_goal}' career goal"
            elif sg_score >= 15:
                msg = f"'{course_title}' addresses key skill gaps in your profile ({match_pct}% match)."
                reason = "Addresses identified skill gaps"
            elif i_score >= 8:
                msg = f"'{course_title}' matches your expressed learning interests ({match_pct}% match)."
                reason = "Matches your learning interests"
            else:
                msg = f"'{course_title}' is recommended for your learning goals ({match_pct}% match)."
                reason = "Aligns with your learning path"

            new_recs.append({"title": course_title, "match_percentage": match_pct, "reason": reason, "id": course_id})

            NotificationService.create_notification(
                db=db,
                user_id=user_id,
                title="New Course Recommendation",
                message=msg,
                notification_type="COURSE_RECOMMENDATION",
                related_course_id=course_id
            )

        if new_recs:
            email_data = email_templates.generate_recommendation_update_email(
                student_name=user.full_name,
                career_goal=career_goal,
                recommended_courses=new_recs
            )
            EmailService.send_personalized_email(
                db=db,
                user_id=user_id,
                notification_type="COURSE_RECOMMENDATION",
                subject=email_data["subject"],
                html_content=email_data["html"],
                text_content=email_data["text"],
                course_id=new_recs[0]["id"] if new_recs else None,
                event_milestone=f"recs_{len(new_recs)}",
                preference_key="course_recommendation"
            )

    @staticmethod
    def notify_eligible_students_for_new_course(db: Session, course_db):
        """
        When an Instructor or Admin publishes a new course:
        Evaluate all active students and notify eligible students based on matching interests, skills, or career goals.
        """
        UserDB, ProfileDB, _, _, _, _, _, NotificationDB = _get_models()

        if not course_db or getattr(course_db, "status", "").lower() != "published":
            return

        course_cat = (course_db.category or "").lower()
        course_skills = [str(s).lower() for s in (course_db.skills or [])]
        course_target_roles = [str(r).lower() for r in (course_db.target_roles or [])]
        course_career_goals = [str(g).lower() for g in (course_db.career_goals or [])]

        students = db.query(UserDB).filter(UserDB.role.in_(["Student", "student", "STUDENT"])).all()

        for student in students:
            existing = db.query(NotificationDB).filter(
                NotificationDB.user_id == student.id,
                NotificationDB.type == "NEW_COURSE",
                NotificationDB.related_course_id == course_db.id
            ).first()

            if existing:
                continue

            profile = db.query(ProfileDB).filter(ProfileDB.user_id == student.id).first()
            is_eligible = False
            matched_reason = "learning interests"

            if profile:
                st_goal = (profile.career_goal or "").lower()
                st_sec_goal = (profile.secondary_career_goal or "").lower()
                st_skills = [str(s).lower() if isinstance(s, str) else str(s.get("name", "")).lower() for s in (profile.skills or [])]
                st_interests = [str(i).lower() if isinstance(i, str) else str(i.get("name", "")).lower() for i in (profile.interests or [])]

                if st_goal and (st_goal in course_cat or any(st_goal in r for r in course_target_roles) or any(st_goal in g for g in course_career_goals)):
                    is_eligible = True
                    matched_reason = f"your '{profile.career_goal}' career goal"
                elif st_sec_goal and (st_sec_goal in course_cat or any(st_sec_goal in r for r in course_target_roles)):
                    is_eligible = True
                    matched_reason = f"your interest in {profile.secondary_career_goal}"
                elif any(i in course_cat or any(i in s for s in course_skills) for i in st_interests):
                    is_eligible = True
                    matched_reason = "your learning interests"
                elif any(s in course_skills for s in st_skills):
                    is_eligible = True
                    matched_reason = "your technical skill profile"
                else:
                    is_eligible = True
            else:
                is_eligible = True

            if is_eligible:
                msg = f"'{course_db.title}' is now available and matches {matched_reason}."
                NotificationService.create_notification(
                    db=db,
                    user_id=student.id,
                    title="New Course Available",
                    message=msg,
                    notification_type="NEW_COURSE",
                    related_course_id=course_db.id
                )

    @staticmethod
    def notify_enrollment_success(db: Session, user_id: int, course_id: int, course_title: str):
        _, _, _, _, _, _, _, NotificationDB = _get_models()
        existing = db.query(NotificationDB).filter(
            NotificationDB.user_id == user_id,
            NotificationDB.type == "ENROLLMENT_SUCCESS",
            NotificationDB.related_course_id == course_id
        ).first()

        if not existing:
            NotificationService.create_notification(
                db=db,
                user_id=user_id,
                title="Enrollment Successful 🎉",
                message=f"You have successfully enrolled in '{course_title}'. Happy learning!",
                notification_type="ENROLLMENT_SUCCESS",
                related_course_id=course_id
            )

    @staticmethod
    def notify_payment_success(db: Session, user_id: int, course_id: int, course_title: str, amount: float, transaction_id: str):
        NotificationService.create_notification(
            db=db,
            user_id=user_id,
            title="Payment Successful 💳",
            message=f"Your payment of ₹{amount:,.2f} for '{course_title}' was successful. Transaction ID: {transaction_id}.",
            notification_type="PAYMENT_SUCCESS",
            related_course_id=course_id,
            reference_id=transaction_id
        )

    @staticmethod
    def notify_course_progress_milestone(db: Session, user_id: int, course_id: int, progress_pct: int, completed_lessons: int, total_lessons: int):
        UserDB, _, CourseDB, _, _, _, _, NotificationDB = _get_models()
        EmailService, email_templates = _get_email_service()

        user = db.query(UserDB).filter(UserDB.id == user_id).first()
        course = db.query(CourseDB).filter(CourseDB.id == course_id).first()
        if not user or not course:
            return

        milestones = [25, 50, 75, 100]
        hit_milestone = None
        for m in sorted(milestones, reverse=True):
            if progress_pct >= m:
                hit_milestone = m
                break

        if not hit_milestone:
            return

        milestone_str = f"{hit_milestone}%"

        if hit_milestone == 100:
            NotificationService.notify_course_completion(db, user_id, course_id, course.title)
            return

        # Check if email milestone already sent
        if EmailService.is_duplicate_email(db, user_id, "COURSE_PROGRESS", course_id, milestone_str):
            return

        email_data = email_templates.generate_progress_milestone_email(
            student_name=user.full_name,
            course_name=course.title,
            progress_percentage=hit_milestone,
            completed_lessons=completed_lessons,
            total_lessons=total_lessons
        )

        EmailService.send_personalized_email(
            db=db,
            user_id=user_id,
            notification_type="COURSE_PROGRESS",
            subject=email_data["subject"],
            html_content=email_data["html"],
            text_content=email_data["text"],
            course_id=course_id,
            event_milestone=milestone_str,
            preference_key="course_progress"
        )

        existing_in_app = db.query(NotificationDB).filter(
            NotificationDB.user_id == user_id,
            NotificationDB.type == "COURSE_PROGRESS",
            NotificationDB.related_course_id == course_id,
            NotificationDB.reference_id == milestone_str
        ).first()

        if not existing_in_app:
            NotificationService.create_notification(
                db=db,
                user_id=user_id,
                title=f"{hit_milestone}% Course Progress Milestone 📈",
                message=f"You're {hit_milestone}% through '{course.title}'! Keep going to complete your remaining lessons.",
                notification_type="COURSE_PROGRESS",
                related_course_id=course_id,
                reference_id=milestone_str
            )

    @staticmethod
    def notify_course_completion(db: Session, user_id: int, course_id: int, course_title: str):
        UserDB, _, _, _, _, _, _, NotificationDB = _get_models()
        EmailService, email_templates = _get_email_service()

        user = db.query(UserDB).filter(UserDB.id == user_id).first()
        if not user:
            return

        existing = db.query(NotificationDB).filter(
            NotificationDB.user_id == user_id,
            NotificationDB.type == "COURSE_COMPLETION",
            NotificationDB.related_course_id == course_id
        ).first()

        if not existing:
            NotificationService.create_notification(
                db=db,
                user_id=user_id,
                title="Course Completed 🏆",
                message=f"Congratulations! You have completed 100% of '{course_title}'. Certificate generated!",
                notification_type="COURSE_COMPLETION",
                related_course_id=course_id
            )

        now_date_str = datetime.utcnow().strftime("%B %d, %Y")
        email_data = email_templates.generate_course_completion_email(
            student_name=user.full_name,
            course_name=course_title,
            completion_date=now_date_str
        )

        EmailService.send_personalized_email(
            db=db,
            user_id=user_id,
            notification_type="COURSE_COMPLETION",
            subject=email_data["subject"],
            html_content=email_data["html"],
            text_content=email_data["text"],
            course_id=course_id,
            event_milestone="100%",
            preference_key="course_completion"
        )

    @staticmethod
    def notify_assessment_improvement(
        db: Session,
        user_id: int,
        assessment_title: str,
        score_percentage: int,
        strong_skills: List[str],
        weak_skills: List[str],
        recommended_courses: List[Dict[str, Any]],
        assessment_id: Optional[int] = None
    ):
        UserDB, _, _, _, _, _, _, NotificationDB = _get_models()
        EmailService, email_templates = _get_email_service()

        user = db.query(UserDB).filter(UserDB.id == user_id).first()
        if not user:
            return

        milestone_key = f"attempt_{assessment_id}_{score_percentage}" if assessment_id else f"score_{score_percentage}"

        email_data = email_templates.generate_assessment_improvement_email(
            student_name=user.full_name,
            assessment_name=assessment_title,
            score_percentage=score_percentage,
            strong_skills=strong_skills,
            weak_skills=weak_skills,
            recommended_courses=recommended_courses
        )

        EmailService.send_personalized_email(
            db=db,
            user_id=user_id,
            notification_type="ASSESSMENT_UPDATE",
            subject=email_data["subject"],
            html_content=email_data["html"],
            text_content=email_data["text"],
            course_id=None,
            event_milestone=milestone_key,
            preference_key="assessment_update"
        )

        NotificationService.create_notification(
            db=db,
            user_id=user_id,
            title="Assessment Skill Improvement Update 📊",
            message=f"Your '{assessment_title}' score is {score_percentage}%. We identified {len(weak_skills)} area(s) for improvement and updated your course recommendations.",
            notification_type="ASSESSMENT_UPDATE"
        )

    @staticmethod
    def notify_system_welcome(db: Session, user_id: int, full_name: str, role: str = "Student"):
        _, _, _, _, _, _, _, NotificationDB = _get_models()
        existing = db.query(NotificationDB).filter(
            NotificationDB.user_id == user_id,
            NotificationDB.type == "SYSTEM"
        ).first()

        if not existing:
            if role.lower() == "instructor":
                msg = f"Welcome {full_name}! Publish courses, track student enrollments, and view analytics in your Instructor Command Center."
            elif role.lower() == "admin":
                msg = f"Welcome {full_name}! Monitor platform health, manage curriculum catalogs, and oversee user governance."
            else:
                msg = f"Welcome {full_name}! Set up your skills and career goal in Profile to unlock personalized course recommendations."

            NotificationService.create_notification(
                db=db,
                user_id=user_id,
                title="Welcome to SmartLearn 🎓",
                message=msg,
                notification_type="SYSTEM"
            )

    # --- INSTRUCTOR & ADMIN NOTIFICATION TRIGGERS ---

    @staticmethod
    def notify_instructor_course_published(db: Session, instructor_id: int, course_id: int, course_title: str):
        if not instructor_id:
            return
        NotificationService.create_notification(
            db=db,
            user_id=instructor_id,
            title="Course Published 🚀",
            message=f"Your course '{course_title}' has been published and is now live in the catalog.",
            notification_type="COURSE_PUBLISHED",
            related_course_id=course_id
        )

    @staticmethod
    def notify_instructor_new_enrollment(db: Session, instructor_id: int, student_name: str, course_id: int, course_title: str):
        if not instructor_id:
            return
        NotificationService.create_notification(
            db=db,
            user_id=instructor_id,
            title="New Student Enrollment 🎓",
            message=f"{student_name} has enrolled in your course '{course_title}'.",
            notification_type="NEW_ENROLLMENT",
            related_course_id=course_id
        )

    @staticmethod
    def notify_instructor_payment_received(db: Session, instructor_id: int, amount: float, course_id: int, course_title: str):
        if not instructor_id:
            return
        NotificationService.create_notification(
            db=db,
            user_id=instructor_id,
            title="Payment Received 💰",
            message=f"New enrollment payment of ₹{amount:,.2f} recorded for '{course_title}'.",
            notification_type="PAYMENT_RECEIVED",
            related_course_id=course_id
        )

    @staticmethod
    def notify_instructor_new_review(db: Session, instructor_id: int, rating: int, student_name: str, course_id: int, course_title: str):
        if not instructor_id:
            return
        NotificationService.create_notification(
            db=db,
            user_id=instructor_id,
            title="New Course Review ⭐",
            message=f"{student_name} left a {rating}-star review on '{course_title}'.",
            notification_type="NEW_REVIEW",
            related_course_id=course_id
        )

    @staticmethod
    def notify_admin_platform_event(db: Session, title: str, message: str, notification_type: str = "SYSTEM", related_course_id: Optional[int] = None, reference_id: Optional[str] = None):
        UserDB, _, _, _, _, _, _, _ = _get_models()
        admins = db.query(UserDB).filter(UserDB.role.in_(["Admin", "admin", "ADMIN"])).all()
        for admin in admins:
            NotificationService.create_notification(
                db=db,
                user_id=admin.id,
                title=title,
                message=message,
                notification_type=notification_type,
                related_course_id=related_course_id,
                reference_id=reference_id
            )

    @staticmethod
    def ensure_admin_notifications(db: Session, admin_id: int, full_name: Optional[str] = None):
        UserDB, _, CourseDB, EnrollmentDB, _, _, _, NotificationDB = _get_models()
        name = full_name or "Administrator"

        count = db.query(NotificationDB).filter(NotificationDB.user_id == admin_id).count()
        if count == 0:
            total_courses = db.query(CourseDB).count()
            total_users = db.query(UserDB).count()
            total_enrollments = db.query(EnrollmentDB).count()

            NotificationService.create_notification(
                db=db,
                user_id=admin_id,
                title="🛡️ System Overview & Platform Governance",
                message=f"Welcome {name}! SmartLearn active stats: {total_users} users, {total_courses} courses, and {total_enrollments} student enrollments monitored.",
                notification_type="SYSTEM"
            )
            NotificationService.create_notification(
                db=db,
                user_id=admin_id,
                title="📊 Course Catalog Audit Complete",
                message="All published and draft courses are verified in the catalog database.",
                notification_type="SYSTEM"
            )

    @staticmethod
    def ensure_instructor_notifications(db: Session, instructor_id: int, full_name: Optional[str] = None):
        UserDB, _, CourseDB, EnrollmentDB, _, _, _, NotificationDB = _get_models()
        name = full_name or "Instructor"

        count = db.query(NotificationDB).filter(NotificationDB.user_id == instructor_id).count()
        if count == 0:
            my_courses_count = db.query(CourseDB).filter(CourseDB.instructor_id == instructor_id).count()

            NotificationService.create_notification(
                db=db,
                user_id=instructor_id,
                title="👨‍🏫 Instructor Studio Activated",
                message=f"Welcome {name}! You currently have {my_courses_count} course(s) in your studio. Track enrollments and analytics in real-time.",
                notification_type="SYSTEM"
            )
