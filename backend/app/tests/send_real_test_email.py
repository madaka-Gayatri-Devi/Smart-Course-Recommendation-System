"""
SmartLearn Development Test Script: Real Gmail SMTP Notification Test
Executes a real SMTP email send operation using SmartLearn's existing EmailService.
"""

import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
APP_DIR = BASE_DIR / "app"
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

from dotenv import load_dotenv
load_dotenv(BASE_DIR / ".env")

from app.services.email_service import EmailService, SMTP_HOST, SMTP_PORT, SMTP_USERNAME, EMAIL_FROM

def run_smtp_test():
    print("=" * 60)
    print(" SmartLearn Real Gmail SMTP Notification Test ")
    print("=" * 60)

    print(f"SMTP Host     : {SMTP_HOST}")
    print(f"SMTP Port     : {SMTP_PORT}")
    print(f"SMTP Username : {SMTP_USERNAME}")
    print(f"Sender (From) : {EMAIL_FROM}")
    print("SMTP Password : [PROTECTED / NOT DISCLOSED IN LOGS]")
    print("-" * 60)

    target_email = "madaka951@gmail.com"
    subject = "SmartLearn Email Notification Test"
    body = "This is a real test email from SmartLearn. If you received this email, Gmail SMTP configuration and SmartLearn email delivery are working correctly."

    print(f"Attempting real SMTP delivery to: {target_email}")
    print(f"Subject: '{subject}'")

    try:
        success = EmailService.send_raw_email(
            to_email=target_email,
            subject=subject,
            html_content=f"<div style='font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;'><h2 style='color: #4A0E4E;'>SmartLearn System Notification</h2><p>{body}</p><hr style='border: none; border-top: 1px solid #eee; margin: 20px 0;'><p style='font-size: 12px; color: #777;'>SmartLearn Automated Notification System</p></div>",
            text_content=body
        )

        if success:
            print("=" * 60)
            print("SUCCESS: Real email send operation completed successfully via SMTP!")
            print(f"Recipient: {target_email}")
            print("Status   : Accepted by Gmail SMTP server")
            print("=" * 60)
            return 0
        else:
            print("ERROR: EmailService returned False without raising an exception.")
            return 1
    except Exception as err:
        print("=" * 60)
        print("SMTP SEND FAILED: Exact error received from SMTP connection:")
        print(f"Error Type   : {type(err).__name__}")
        print(f"Error Details: {str(err)}")
        print("=" * 60)
        return 1

if __name__ == "__main__":
    sys.exit(run_smtp_test())
