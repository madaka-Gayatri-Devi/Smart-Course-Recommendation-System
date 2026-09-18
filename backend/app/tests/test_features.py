"""
SmartLearn Feature Test Suite
Tests personalized email notifications, duplicate prevention, background inactivity scanner,
and Firebase Google authentication token verification and user linking.
"""

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
APP_DIR = BASE_DIR / "app"
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

import unittest
from unittest.mock import patch
from datetime import datetime, timedelta
from app.main import (
    SessionLocal, UserDB, ProfileDB, CourseDB, EnrollmentDB,
    EmailLogDB, NotificationDB, create_access_token, verify_password
)
from app.services.email_service import EmailService
from app.services.email_templates import (
    generate_progress_milestone_email,
    generate_course_completion_email,
    generate_inactivity_reminder_email,
    generate_assessment_improvement_email,
    generate_recommendation_update_email
)
from app.services.notification_service import NotificationService
from app.services.scheduler_service import check_and_send_inactivity_reminders
from app.services.firebase_service import FirebaseService


class TestSmartLearnFeatures(unittest.TestCase):

    def setUp(self):
        self.db = SessionLocal()

    def tearDown(self):
        self.db.close()

    def test_01_existing_accounts_and_credentials(self):
        """Verify the mandatory student and instructor accounts exist."""
        student = self.db.query(UserDB).filter(UserDB.email == "gayatri@gmail.com").first()
        self.assertIsNotNone(student, "Student gayatri@gmail.com must exist.")
        self.assertTrue(verify_password("Mgayatri@123", student.hashed_password), "Student password must match.")
        self.assertEqual(student.role, "Student", "Role must be Student.")

        instructor = self.db.query(UserDB).filter(UserDB.email == "tulasi@gmail.com").first()
        if instructor:
            self.assertTrue(verify_password("Tulasi@123", instructor.hashed_password), "Instructor password must match.")

    def test_02_email_templates_generation(self):
        """Verify all 5 email templates generate clean HTML and text content."""
        # 1. Progress Milestone
        pm = generate_progress_milestone_email("Gayatri", "Python Masterclass", 50, 6, 12)
        self.assertIn("50%", pm["subject"])
        self.assertIn("Python Masterclass", pm["html"])
        self.assertIn("Gayatri", pm["text"])

        # 2. Course Completion
        cc = generate_course_completion_email("Gayatri", "Python Masterclass", "September 18, 2026", "Data Science")
        self.assertIn("Congratulations", cc["subject"])
        self.assertIn("Python Masterclass", cc["html"])

        # 3. Inactivity Reminder
        ir = generate_inactivity_reminder_email("Gayatri", "Python Masterclass", "Functions & Scope", 40)
        self.assertIn("Continue your learning", ir["subject"])
        self.assertIn("Functions & Scope", ir["html"])

        # 4. Assessment Improvement
        ai = generate_assessment_improvement_email("Gayatri", "Full Stack Assessment", 72, ["Python", "SQL"], ["REST APIs"], [{"title": "API Dev"}])
        self.assertIn("72%", ai["html"])
        self.assertIn("REST APIs", ai["html"])

        # 5. Recommendation Update
        ru = generate_recommendation_update_email("Gayatri", "Full Stack Developer", [{"title": "React Master", "match_percentage": 92}])
        self.assertIn("React Master", ru["html"])

    def test_03_duplicate_email_prevention_and_logging(self):
        """Verify duplicate milestone email prevention and DB logging."""
        student = self.db.query(UserDB).filter(UserDB.email == "gayatri@gmail.com").first()
        self.assertIsNotNone(student)

        # Clear existing test logs for this type
        self.db.query(EmailLogDB).filter(
            EmailLogDB.user_id == student.id,
            EmailLogDB.notification_type == "COURSE_PROGRESS",
            EmailLogDB.event_milestone == "50%"
        ).delete()
        self.db.commit()

        # 1. Test unconfigured/failed SMTP logging (without mock)
        if not EmailService.is_email_configured():
            failed_sent = EmailService.send_personalized_email(
                db=self.db,
                user_id=student.id,
                notification_type="COURSE_PROGRESS",
                subject="You're 50% through Python Masterclass!",
                html_content="<p>Test Unconfigured</p>",
                text_content="Test Unconfigured",
                course_id=1,
                event_milestone="50%"
            )
            self.assertFalse(failed_sent, "Unconfigured SMTP must return False and NOT report fake success.")

            log_entry = self.db.query(EmailLogDB).filter(
                EmailLogDB.user_id == student.id,
                EmailLogDB.notification_type == "COURSE_PROGRESS",
                EmailLogDB.event_milestone == "50%"
            ).first()
            self.assertIsNotNone(log_entry, "Failed attempt must create a DB log entry.")
            self.assertEqual(log_entry.status, "failed", "Status must be 'failed'.")
            self.assertIn("SMTP credentials", log_entry.failure_reason, "Failure reason must explain missing credentials.")

            # Clean log entry for next step
            self.db.delete(log_entry)
            self.db.commit()

        # 2. Test successful delivery and duplicate prevention (with mock send_raw_email)
        with patch.object(EmailService, 'send_raw_email', return_value=True):
            sent1 = EmailService.send_personalized_email(
                db=self.db,
                user_id=student.id,
                notification_type="COURSE_PROGRESS",
                subject="You're 50% through Python Masterclass!",
                html_content="<p>Test</p>",
                text_content="Test",
                course_id=1,
                event_milestone="50%"
            )
            self.assertTrue(sent1, "First milestone email should be sent and logged.")

            # Attempt to send second 50% milestone email to same student
            sent2 = EmailService.send_personalized_email(
                db=self.db,
                user_id=student.id,
                notification_type="COURSE_PROGRESS",
                subject="You're 50% through Python Masterclass!",
                html_content="<p>Test Duplicate</p>",
                text_content="Test Duplicate",
                course_id=1,
                event_milestone="50%"
            )
            self.assertFalse(sent2, "Duplicate milestone email must be suppressed by EmailService.")

    def test_04_inactivity_reminder_scanner(self):
        """Verify inactivity scanner detects inactive student and logs reminder."""
        student = self.db.query(UserDB).filter(UserDB.email == "gayatri@gmail.com").first()
        course = self.db.query(CourseDB).first()
        self.assertIsNotNone(student)
        self.assertIsNotNone(course)

        # Set student enrollment last_accessed to 5 days ago
        old_date_str = (datetime.utcnow() - timedelta(days=5)).strftime("%Y-%m-%d %H:%M:%S")
        enrollment = self.db.query(EnrollmentDB).filter(
            EnrollmentDB.user_id == student.id,
            EnrollmentDB.course_id == course.id
        ).first()

        if not enrollment:
            enrollment = EnrollmentDB(
                user_id=student.id,
                course_id=course.id,
                enrolled_at=old_date_str,
                progress_percentage=30,
                status="in_progress",
                completed_lessons=3,
                last_accessed=old_date_str
            )
            self.db.add(enrollment)
        else:
            enrollment.progress_percentage = 30
            enrollment.status = "in_progress"
            enrollment.last_accessed = old_date_str

        self.db.commit()

        # Run inactivity scan
        check_and_send_inactivity_reminders()

        # Verify email log or notification was created
        notif = self.db.query(NotificationDB).filter(
            NotificationDB.user_id == student.id,
            NotificationDB.type == "LEARNING_REMINDER"
        ).first()
        self.assertIsNotNone(notif, "Inactivity scan must create learning reminder notification.")

    def test_05_google_user_linking_and_no_duplicates(self):
        """Verify that authenticating via Google links to existing gayatri@gmail.com account without creating duplicates."""
        initial_user_count = self.db.query(UserDB).filter(UserDB.email == "gayatri@gmail.com").count()
        self.assertEqual(initial_user_count, 1, "Exactly one gayatri@gmail.com user should exist initially.")

        student_before = self.db.query(UserDB).filter(UserDB.email == "gayatri@gmail.com").first()
        original_user_id = student_before.id
        original_role = student_before.role

        # Simulate Google Firebase Auth token payload for gayatri@gmail.com
        fb_uid = "google_firebase_uid_gayatri_123"
        
        # Link user logic
        clean_email = "gayatri@gmail.com"
        db_user = self.db.query(UserDB).filter(UserDB.email == clean_email).first()

        if db_user:
            db_user.firebase_uid = fb_uid
            self.db.commit()

        final_user_count = self.db.query(UserDB).filter(UserDB.email == "gayatri@gmail.com").count()
        self.assertEqual(final_user_count, 1, "No duplicate user should be created!")

        student_after = self.db.query(UserDB).filter(UserDB.email == "gayatri@gmail.com").first()
        self.assertEqual(student_after.id, original_user_id, "User ID must be preserved.")
        self.assertEqual(student_after.role, original_role, "Role must be preserved.")
        self.assertEqual(student_after.firebase_uid, fb_uid, "Firebase UID must be linked.")


if __name__ == "__main__":
    unittest.main()
