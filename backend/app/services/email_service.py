"""
SmartLearn Real Email Delivery Service
Handles SMTP email sending, duplicate prevention, logging, and preference checking.
"""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from pathlib import Path
import sys

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

load_dotenv(BASE_DIR / ".env")

# --- ENVIRONMENT CONFIG ---
# ============================================================================
# ENVIRONMENT CONFIGURATION & MODEL RESOLUTION
# ============================================================================
def _clean_env(key: str, default: str = "") -> str:
    """
    Sanitize environment variable strings, stripping leading/trailing quotes and whitespace.

    Args:
        val: Raw string from os.getenv.

    Returns:
        str: Cleaned configuration string.
    """
    val = os.getenv(key, default)
    if val:
        val = val.strip().strip('"').strip("'")
    return val

SMTP_HOST = _clean_env("EMAIL_HOST", _clean_env("SMTP_HOST", "smtp.gmail.com"))
SMTP_PORT_VAL = _clean_env("EMAIL_PORT", _clean_env("SMTP_PORT", "587"))
try:
    SMTP_PORT = int(SMTP_PORT_VAL)
except (ValueError, TypeError):
    SMTP_PORT = 587
SMTP_USERNAME = _clean_env("EMAIL_USERNAME", _clean_env("SMTP_USERNAME", ""))
SMTP_PASSWORD = _clean_env("EMAIL_PASSWORD", _clean_env("SMTP_PASSWORD", ""))
EMAIL_FROM = _clean_env("EMAIL_FROM", "SmartLearn <noreply@smartlearn.edu>")
SMTP_TLS = _clean_env("SMTP_TLS", "true").lower() in ["true", "1", "yes"]

APP_URL = _clean_env("APP_URL", "http://127.0.0.1:8080")

def _get_models():
    """
    Dynamically loads and resolves database models used for email delivery and logging.

    Returns:
        Tuple of (SentEmailLogDB, UserDB, ProfileDB).

    Purpose:
        Prevents circular dependencies between the email subsystem and database models.
    """
    try:
        from app.main import UserDB, ProfileDB, EmailLogDB
    except ImportError:
        try:
            from main import UserDB, ProfileDB, EmailLogDB
        except ImportError:
            from backend.app.main import UserDB, ProfileDB, EmailLogDB
    return UserDB, ProfileDB, EmailLogDB

# ============================================================================
# EMAIL SERVICE & TRANSACTIONAL DISPATCH ENGINE
# ============================================================================
class EmailService:
    """Core SMTP Email Dispatcher and Duplicate Prevention Manager."""

    @staticmethod
    def is_email_configured() -> bool:
        """
        Verify whether outbound SMTP server credentials and endpoints are fully configured.

        Returns:
            bool: True if SMTP_SERVER, SMTP_PORT, and SMTP_USERNAME are set.

        Purpose:
            Guards mail dispatch operations to avoid unconfigured socket crashes.
        """
        return bool(SMTP_HOST and SMTP_USERNAME and SMTP_PASSWORD)

# ----------------------------------------------------------------------------
# Spam Prevention & Preference Verification
# ----------------------------------------------------------------------------
    @staticmethod
    def is_duplicate_email(
        db: Session,
        user_id: int,
        notification_type: str,
        course_id: Optional[int] = None,
        event_milestone: Optional[str] = None
    ) -> bool:
        """
        Check if an identical notification was recently dispatched within a rate-limit window.

        Args:
            db: Active SQLAlchemy database session.
            user_id: Database ID of recipient user.
            email_type: Categorical notification type (e.g. 'INACTIVITY', 'MILESTONE').
            reference_id: Optional entity ID (e.g., course_id) linked to this email.
            window_hours: Cooldown window duration in hours (default: 24h).

        Returns:
            bool: True if duplicate email exists within window; False if dispatch is allowed.

        Purpose:
            Protects users against repetitive notification spam.
        """
        _, _, EmailLogDB = _get_models()
        query = db.query(EmailLogDB).filter(
            EmailLogDB.user_id == user_id,
            EmailLogDB.notification_type == notification_type,
            EmailLogDB.status == "sent"
        )
        if course_id is not None:
            query = query.filter(EmailLogDB.course_id == course_id)
        if event_milestone is not None:
            query = query.filter(EmailLogDB.event_milestone == event_milestone)
        
        return query.first() is not None

    @staticmethod
    def is_email_preference_enabled(db: Session, user_id: int, preference_key: str) -> bool:
        """
        Check whether the user has opted in to receive emails for a given notification category.

        Args:
            db: Active SQLAlchemy database session.
            user_id: Target user database ID.
            email_type: Categorical notification type.

        Returns:
            bool: True if user preferences permit dispatch, False if opted out.
        """
        _, ProfileDB, _ = _get_models()
        profile = db.query(ProfileDB).filter(ProfileDB.user_id == user_id).first()
        if not profile or not profile.email_preferences:
            return True
        prefs = profile.email_preferences
        if isinstance(prefs, dict):
            return prefs.get(preference_key, True)
        return True

    @staticmethod
    def log_email_send(
        db: Session,
        user_id: int,
        email_address: str,
        notification_type: str,
        status: str,
        course_id: Optional[int] = None,
        event_milestone: Optional[str] = None,
        failure_reason: Optional[str] = None
    ):
        """
        Record an outbound email attempt into the persistent audit log table.

        Args:
            db: Active SQLAlchemy database session.
            user_id: Recipient user ID.
            email_type: Categorical notification type.
            recipient_email: Recipient destination email address.
            subject: Email subject headline.
            reference_id: Optional related entity identifier.
            status: Delivery status string ('SENT' or 'FAILED').
            error_message: Optional error message trace if failed.

        Returns:
            SentEmailLogDB: Created log database record.
        """
        _, _, EmailLogDB = _get_models()
        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        log_entry = EmailLogDB(
            user_id=user_id,
            email_address=email_address,
            notification_type=notification_type,
            course_id=course_id,
            event_milestone=event_milestone,
            status=status,
            sent_at=now_str,
            failure_reason=failure_reason
        )
        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)
        return log_entry

# ----------------------------------------------------------------------------
# Low-Level SMTP & High-Level Dispatch Logic
# ----------------------------------------------------------------------------
    @staticmethod
    def send_raw_email(
        to_email: str,
        subject: str,
        html_content: str,
        text_content: str
    ) -> bool:
        """
        Dispatch an email message via SMTP with STARTTLS encryption.

        Args:
            recipient_email: Destination email address.
            subject: Email subject text.
            html_body: Formatted HTML message body.
            text_body: Plain-text fallback message content.

        Returns:
            Tuple[bool, Optional[str]]: (success_boolean, error_message_or_none).

        Purpose:
            Connects to the configured SMTP host, authenticates, and transmits multipart message.

        Dependencies:
            smtplib.SMTP, email.mime.multipart.MIMEMultipart.

        Error handling:
            Catches SMTPAuthenticationError, socket timeouts, and SMTPException, returning clean diagnostics.
        """
        if not EmailService.is_email_configured():
            raise ValueError("SMTP credentials (SMTP_USERNAME / SMTP_PASSWORD) are not configured in backend/.env")

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = EMAIL_FROM
        msg["To"] = to_email

        part_text = MIMEText(text_content, "plain")
        part_html = MIMEText(html_content, "html")

        msg.attach(part_text)
        msg.attach(part_html)

        try:
            if SMTP_PORT == 465:
                server = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=10)
            else:
                server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10)
                if SMTP_TLS:
                    server.starttls()
            
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.sendmail(EMAIL_FROM, [to_email], msg.as_string())
            server.quit()
            print(f"[EmailService] Real email successfully sent to {to_email} (Subject: {subject})")
            return True
        except Exception as e:
            print(f"[EmailService Error] Failed to send email via SMTP to {to_email}: {e}")
            raise e

    @staticmethod
    def send_personalized_email(
        db: Session,
        user_id: int,
        notification_type: str,
        subject: str,
        html_content: str,
        text_content: str,
        course_id: Optional[int] = None,
        event_milestone: Optional[str] = None,
        preference_key: Optional[str] = None
    ) -> bool:
        """
        High-level personalized email dispatcher enforcing preferences, spam suppression, and logging.

        Args:
            db: Active SQLAlchemy database session.
            user_id: Recipient user database ID.
            email_type: Category identifier ('MILESTONE', 'COMPLETION', 'INACTIVITY', 'RECOMMENDATION').
            subject: Email subject string.
            html_body: Branded HTML content body.
            text_body: Plaintext alternative content.
            reference_id: Optional entity reference ID (e.g. course_id).
            force: If True, bypasses frequency capping and duplicate checks.

        Returns:
            dict: Result summary dictionary indicating dispatch status and details.

        Purpose:
            Coordinates all outbound transactional email workflows for the SmartLearn platform.
        """
        UserDB, _, _ = _get_models()
        user = db.query(UserDB).filter(UserDB.id == user_id).first()
        if not user or not user.email:
            print(f"[EmailService] Cannot send email. User {user_id} not found or has no registered email.")
            return False

        # 1. Preference Check
        if preference_key and not EmailService.is_email_preference_enabled(db, user_id, preference_key):
            print(f"[EmailService] User {user_id} ({user.email}) has disabled email notification preference '{preference_key}'. Skipping.")
            return False

        # 2. Duplicate Check
        if EmailService.is_duplicate_email(db, user_id, notification_type, course_id, event_milestone):
            print(f"[EmailService] Duplicate prevention triggered for User {user_id}, Type '{notification_type}', Course {course_id}, Milestone '{event_milestone}'. Email already sent.")
            return False

        # 3. Deliver Email
        try:
            EmailService.send_raw_email(
                to_email=user.email,
                subject=subject,
                html_content=html_content,
                text_content=text_content
            )
            EmailService.log_email_send(
                db=db,
                user_id=user_id,
                email_address=user.email,
                notification_type=notification_type,
                status="sent",
                course_id=course_id,
                event_milestone=event_milestone
            )
            return True
        except Exception as err:
            failure_reason = str(err)
            EmailService.log_email_send(
                db=db,
                user_id=user_id,
                email_address=user.email,
                notification_type=notification_type,
                status="failed",
                course_id=course_id,
                event_milestone=event_milestone,
                failure_reason=failure_reason
            )
            return False
