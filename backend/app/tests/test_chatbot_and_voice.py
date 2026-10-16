"""
SmartLearn AI Chatbot and Voice Integration Test Suite
======================================================
Tests:
1. Provider health diagnostics and key masking.
2. Context synthesis for Student, Instructor, and Admin roles.
3. API key sanitization in error messages.
4. Real LLM generation across configured providers.
5. Authenticated /chatbot/message endpoint across all three roles.
6. Conversation session CRUD operations.
7. User isolation & RBAC authorization guards (preventing cross-user conversation access).
8. Frontend voice controls and Web Speech API structural integration contract.
"""

import sys
import unittest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PROJECT_ROOT = BASE_DIR.parent if BASE_DIR.name == "backend" else BASE_DIR
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
APP_DIR = BASE_DIR / "app"
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

from fastapi.testclient import TestClient
from app.main import app, SessionLocal, UserDB, create_access_token
from app.services.ai_chatbot_service import AIChatbotService, _sanitize_error_message
from app.models.ai_chatbot import AIChatbotConversationDB, AIChatbotMessageDB


class TestAIChatbotAndVoice(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.db = SessionLocal()

        # Retrieve test users for Student, Instructor, and Admin
        cls.student_user = cls.db.query(UserDB).filter(UserDB.role == "Student").first()
        cls.instructor_user = cls.db.query(UserDB).filter(UserDB.role == "Instructor").first()
        cls.admin_user = cls.db.query(UserDB).filter(UserDB.role == "Admin").first()

        assert cls.student_user, "A Student account must exist in database"
        assert cls.instructor_user, "An Instructor account must exist in database"
        assert cls.admin_user, "An Admin account must exist in database"

        cls.student_token = create_access_token({
            "sub": cls.student_user.email,
            "id": cls.student_user.id,
            "role": cls.student_user.role
        })
        cls.instructor_token = create_access_token({
            "sub": cls.instructor_user.email,
            "id": cls.instructor_user.id,
            "role": cls.instructor_user.role
        })
        cls.admin_token = create_access_token({
            "sub": cls.admin_user.email,
            "id": cls.admin_user.id,
            "role": cls.admin_user.role
        })

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def test_01_chatbot_health_diagnostic(self):
        """Verify the health endpoint reports status without exposing secret keys."""
        res = self.client.get("/chatbot/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("Groq", data)
        self.assertIn("Gemini", data)
        self.assertIn("OpenAI", data)

        for provider, info in data.items():
            masked_key = info.get("masked_key", "")
            # Ensure key is not exposed in full
            if masked_key and masked_key != "Not Configured":
                self.assertIn("...", masked_key, f"Key for {provider} must be masked")

    def test_02_error_sanitization(self):
        """Verify _sanitize_error_message strips raw keys and bearer tokens."""
        raw_err = "Error on https://generativelanguage.googleapis.com?key=AIzaSyAWzBTJNTYkrewp9pYeXHFUAp7Gyx9TV-0: Bearer eyJhbGciOiJIUzI1NiJ9.test and gsk_Zj2JjQ427c3v7cW9t6u7WGdyb3FYdPHlUu5hC5G76n3w8JppHpm"
        sanitized = _sanitize_error_message(raw_err)

        self.assertNotIn("AIzaSyAWzBTJNTYkrewp9pYeXHFUAp7Gyx9TV-0", sanitized)
        self.assertNotIn("gsk_Zj2JjQ427c3v7cW9t6u7WGdyb3FYdPHlUu5hC5G76n3w8JppHpm", sanitized)
        self.assertIn("key=***", sanitized)
        self.assertIn("gsk_***", sanitized)

    def test_03_role_context_generation(self):
        """Verify context generation builds role-specific prompts and guardrails."""
        student_ctx = AIChatbotService.get_role_context(self.db, self.student_user)
        self.assertIn("STUDENT CONTEXT", student_ctx)
        self.assertIn("Career Goal", student_ctx)

        instructor_ctx = AIChatbotService.get_role_context(self.db, self.instructor_user)
        self.assertIn("INSTRUCTOR CONTEXT", instructor_ctx)
        self.assertIn("AUTHORED COURSES CATALOG", instructor_ctx)

        admin_ctx = AIChatbotService.get_role_context(self.db, self.admin_user)
        self.assertIn("ADMINISTRATOR CONTEXT", admin_ctx)
        self.assertIn("Platform User Statistics", admin_ctx)
        self.assertIn("DO NOT execute administrative database mutations", admin_ctx)

    def test_04_ai_response_generation(self):
        """Verify AIChatbotService generates actual LLM responses."""
        resp = AIChatbotService.generate_ai_response(
            messages_history=[],
            system_context="You are a helpful educational tutor. Keep answer to 1 sentence.",
            user_message="What is HTML?"
        )
        self.assertIsInstance(resp, str)
        self.assertGreater(len(resp), 10)
        self.assertTrue("html" in resp.lower() or "hypertext" in resp.lower() or "markup" in resp.lower())

    def test_05_student_chatbot_message(self):
        """Verify Student role can post message and receives actual AI response."""
        headers = {"Authorization": f"Bearer {self.student_token}"}
        payload = {"message": "Hello AI Coach, can you suggest a 1-day study plan?"}
        res = self.client.post("/chatbot/message", json=payload, headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("conversation_id", data)
        self.assertIn("ai_response", data)
        self.assertGreater(len(data["ai_response"]), 15)
        self.assertEqual(data["user_message"], payload["message"])

    def test_06_instructor_chatbot_message(self):
        """Verify Instructor role can post message and receives actual AI response."""
        headers = {"Authorization": f"Bearer {self.instructor_token}"}
        payload = {"message": "Draft a 3-bullet syllabus outline for a Python module."}
        res = self.client.post("/chatbot/message", json=payload, headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("conversation_id", data)
        self.assertIn("ai_response", data)
        self.assertGreater(len(data["ai_response"]), 15)

    def test_07_admin_chatbot_message(self):
        """Verify Administrator role can post message and receives actual AI response."""
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        payload = {"message": "Summarize platform course metrics."}
        res = self.client.post("/chatbot/message", json=payload, headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("conversation_id", data)
        self.assertIn("ai_response", data)
        self.assertGreater(len(data["ai_response"]), 15)

    def test_08_conversation_isolation_and_rbac(self):
        """Verify user isolation: Student cannot access or delete Instructor's conversations."""
        # 1. Create conversation as Instructor
        inst_headers = {"Authorization": f"Bearer {self.instructor_token}"}
        create_res = self.client.post("/chatbot/conversations", headers=inst_headers)
        self.assertEqual(create_res.status_code, 200)
        conv_id = create_res.json()["id"]

        # 2. Student attempts to GET Instructor's conversation -> Expect 403 Forbidden
        student_headers = {"Authorization": f"Bearer {self.student_token}"}
        get_res = self.client.get(f"/chatbot/conversations/{conv_id}", headers=student_headers)
        self.assertEqual(get_res.status_code, 403)
        self.assertIn("Access denied", get_res.json()["detail"])

        # 3. Student attempts to DELETE Instructor's conversation -> Expect 403 Forbidden
        del_res = self.client.delete(f"/chatbot/conversations/{conv_id}", headers=student_headers)
        self.assertEqual(del_res.status_code, 403)
        self.assertIn("Access denied", del_res.json()["detail"])

        # 4. Instructor owner deletes conversation -> Expect 200 OK
        owner_del_res = self.client.delete(f"/chatbot/conversations/{conv_id}", headers=inst_headers)
        self.assertEqual(owner_del_res.status_code, 200)

    def test_09_frontend_voice_and_tts_elements_contract(self):
        """Verify chatbot.js contains voice-based STT, TTS, and cleanup logic."""
        js_path = PROJECT_ROOT / "frontend" / "js" / "chatbot.js"
        self.assertTrue(js_path.exists(), "frontend/js/chatbot.js must exist")
        content = js_path.read_text(encoding="utf-8")

        # Verify SpeechRecognition & SpeechSynthesis usage
        self.assertIn("SpeechRecognition", content)
        self.assertIn("webkitSpeechRecognition", content)
        self.assertIn("speechSynthesis", content)

        # Verify DOM elements
        self.assertIn("chatbot-mic-btn", content)
        self.assertIn("chatbot-voice-status", content)
        self.assertIn("chatbot-tts-btn", content)

        # Verify lifecycle and error handlers
        self.assertIn("not-allowed", content)
        self.assertIn("no-speech", content)
        self.assertIn("cleanupAudioResources", content)


if __name__ == "__main__":
    unittest.main()
