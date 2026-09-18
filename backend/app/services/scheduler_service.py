"""
SmartLearn Inactivity Reminder Background Scheduler Service
Monitors student activity, detects inactive learners, and dispatches personalized emails.
"""

import os
import asyncio
from datetime import datetime, timedelta
from pathlib import Path
import sys

BASE_DIR = Path(__file__).resolve().parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

INACTIVITY_THRESHOLD_DAYS = int(os.getenv("INACTIVITY_THRESHOLD_DAYS", "3"))
REMINDER_COOLDOWN_DAYS = int(os.getenv("REMINDER_COOLDOWN_DAYS", "7"))
SCHEDULER_CHECK_INTERVAL_SECONDS = int(os.getenv("SCHEDULER_CHECK_INTERVAL_SECONDS", "3600"))  # Default 1 hour

def _get_services_and_models():
    try:
        from app.main import SessionLocal, UserDB, ProfileDB, CourseDB, EnrollmentDB, EmailLogDB
        from app.services.email_service import EmailService
        from app.services.email_templates import generate_inactivity_reminder_email
        from app.services.notification_service import NotificationService
    except ImportError:
        try:
            from main import SessionLocal, UserDB, ProfileDB, CourseDB, EnrollmentDB, EmailLogDB
            from services.email_service import EmailService
            from services.email_templates import generate_inactivity_reminder_email
            from services.notification_service import NotificationService
        except ImportError:
            from backend.app.main import SessionLocal, UserDB, ProfileDB, CourseDB, EnrollmentDB, EmailLogDB
            from backend.app.services.email_service import EmailService
            from backend.app.services.email_templates import generate_inactivity_reminder_email
            from backend.app.services.notification_service import NotificationService

    return SessionLocal, UserDB, ProfileDB, CourseDB, EnrollmentDB, EmailLogDB, EmailService, generate_inactivity_reminder_email, NotificationService

def check_and_send_inactivity_reminders():
    """
    Synchronous scanner function that queries database for inactive students
    and triggers personalized learning reminder emails and in-app notifications.
    """
    SessionLocal, UserDB, ProfileDB, CourseDB, EnrollmentDB, EmailLogDB, EmailService, generate_inactivity_reminder_email, NotificationService = _get_services_and_models()

    db = SessionLocal()
    try:
        now = datetime.utcnow()
        inactivity_limit = now - timedelta(days=INACTIVITY_THRESHOLD_DAYS)
        cooldown_limit = now - timedelta(days=REMINDER_COOLDOWN_DAYS)

        # Query all active students
        students = db.query(UserDB).filter(
            UserDB.role.in_(["Student", "student", "STUDENT"]),
            getattr(UserDB, "is_active", 1) == 1
        ).all()

        reminders_sent_count = 0

        for student in students:
            # Query enrollments in progress
            enrollments = db.query(EnrollmentDB).filter(
                EnrollmentDB.user_id == student.id,
                EnrollmentDB.status == "in_progress",
                EnrollmentDB.progress_percentage < 100
            ).all()

            if not enrollments:
                continue

            # Pick enrollment with most recent activity or highest progress
            for enrollment in enrollments:
                course = db.query(CourseDB).filter(CourseDB.id == enrollment.course_id).first()
                if not course:
                    continue

                # Parse last_accessed date
                last_accessed_dt = None
                if enrollment.last_accessed:
                    try:
                        last_accessed_dt = datetime.strptime(enrollment.last_accessed.split(".")[0], "%Y-%m-%d %H:%M:%S")
                    except Exception:
                        try:
                            last_accessed_dt = datetime.strptime(enrollment.last_accessed, "%Y-%m-%d")
                        except Exception:
                            pass
                
                if not last_accessed_dt and enrollment.enrolled_at:
                    try:
                        last_accessed_dt = datetime.strptime(enrollment.enrolled_at.split(".")[0], "%Y-%m-%d %H:%M:%S")
                    except Exception:
                        try:
                            last_accessed_dt = datetime.strptime(enrollment.enrolled_at, "%Y-%m-%d")
                        except Exception:
                            pass

                # If student accessed recently (within threshold), skip
                if last_accessed_dt and last_accessed_dt > inactivity_limit:
                    continue

                # Check if reminder email sent within cooldown period
                recent_email_log = db.query(EmailLogDB).filter(
                    EmailLogDB.user_id == student.id,
                    EmailLogDB.notification_type == "LEARNING_REMINDER",
                    EmailLogDB.course_id == course.id,
                    EmailLogDB.status == "sent"
                ).order_by(EmailLogDB.id.desc()).first()

                if recent_email_log and recent_email_log.sent_at:
                    try:
                        log_dt = datetime.strptime(recent_email_log.sent_at.split(".")[0], "%Y-%m-%d %H:%M:%S")
                        if log_dt > cooldown_limit:
                            continue  # Cooldown period active, skip
                    except Exception:
                        pass

                # Find suggested next lesson
                next_lesson_title = "Lesson 1"
                if course.modules and isinstance(course.modules, list):
                    comp_ids = set(enrollment.completed_lesson_ids or [])
                    found = False
                    for mod in course.modules:
                        for les in mod.get("lessons", []):
                            les_id = les.get("lesson_id")
                            if les_id not in comp_ids and str(les_id) not in comp_ids:
                                next_lesson_title = les.get("title", f"Lesson {les_id}")
                                found = True
                                break
                        if found:
                            break

                # Generate Email content
                email_data = generate_inactivity_reminder_email(
                    student_name=student.full_name,
                    course_name=course.title,
                    last_lesson_title=enrollment.last_lesson_title,
                    progress_percentage=enrollment.progress_percentage or 0,
                    suggested_next_lesson=next_lesson_title
                )

                # Send personalized email
                sent = EmailService.send_personalized_email(
                    db=db,
                    user_id=student.id,
                    notification_type="LEARNING_REMINDER",
                    subject=email_data["subject"],
                    html_content=email_data["html"],
                    text_content=email_data["text"],
                    course_id=course.id,
                    event_milestone=f"{enrollment.progress_percentage}%",
                    preference_key="learning_reminder"
                )

                # Also create in-app notification
                NotificationService.create_notification(
                    db=db,
                    user_id=student.id,
                    title="Continue Your Learning Journey 📚",
                    message=f"Hi {student.full_name}, pick up where you left off in '{course.title}' ({enrollment.progress_percentage}% completed).",
                    notification_type="LEARNING_REMINDER",
                    related_course_id=course.id
                )

                if sent:
                    reminders_sent_count += 1
                break  # Send 1 reminder per inactive student per scan cycle

        print(f"[Scheduler] Inactivity check completed. Sent {reminders_sent_count} learning reminder email(s).")
    except Exception as e:
        print(f"[Scheduler Error] Error during inactivity scan: {e}")
    finally:
        db.close()

async def start_inactivity_scheduler():
    """Background asyncio loop that periodically triggers the inactivity check."""
    print(f"[Scheduler] Inactivity Reminder Scheduler initialized (Threshold: {INACTIVITY_THRESHOLD_DAYS} days, Interval: {SCHEDULER_CHECK_INTERVAL_SECONDS}s).")
    while True:
        try:
            await asyncio.to_thread(check_and_send_inactivity_reminders)
        except Exception as err:
            print(f"[Scheduler Async Loop Error] {err}")
        await asyncio.sleep(SCHEDULER_CHECK_INTERVAL_SECONDS)
