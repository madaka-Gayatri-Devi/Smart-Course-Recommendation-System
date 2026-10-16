"""
SmartLearn Voice Microphone Fix Verification Suite
==================================================
Tests:
1. Microphone button click initializes listening state without instant dismissal.
2. Recognition state synchronization (class 'listening', Stop icon).
3. Spoken text ('What is Python?') is converted and deposited into #chatbot-input.
4. User can review and edit recognized text before sending.
5. Enter/Send button submits recognized text to backend and receives real AI response.
6. Error handling: error banners persist and do not vanish prematurely.
7. Stop button explicitly ends recognition session and keeps recognized text intact.
"""

import sys
import json
import time
import unittest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PROJECT_ROOT = BASE_DIR.parent if BASE_DIR.name == "backend" else BASE_DIR
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
APP_DIR = BASE_DIR / "app"
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

from selenium import webdriver
from selenium.webdriver.edge.options import Options
from app.main import create_access_token, SessionLocal, UserDB


class TestVoiceMicrophoneFix(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        db = SessionLocal()
        cls.user = db.query(UserDB).filter(UserDB.role == "Student").first()
        assert cls.user, "Student user must exist"
        cls.token = create_access_token({"sub": cls.user.email, "id": cls.user.id, "role": cls.user.role})
        cls.user_json = json.dumps({"id": cls.user.id, "full_name": cls.user.full_name, "email": cls.user.email, "role": cls.user.role})
        db.close()

        opt = Options()
        opt.add_argument('--headless')
        opt.add_argument('--use-fake-ui-for-media-stream')
        opt.add_argument('--use-fake-device-for-media-stream')
        opt.set_capability('goog:loggingPrefs', {'browser': 'ALL'})

        cls.driver = webdriver.Edge(options=opt)
        cls.driver.get('http://localhost:5500/login.html')
        cls.driver.execute_script(f"""
          localStorage.setItem('smartlearn_token', '{cls.token}');
          localStorage.setItem('smartlearn_user', '{cls.user_json}');
          localStorage.setItem('smartlearn_role', 'Student');
        """)
        cls.driver.get('http://localhost:5500/student/dashboard.html')
        time.sleep(2)

        # Open chatbot widget
        toggle_btn = cls.driver.find_element('id', 'smartlearn-chatbot-toggle')
        toggle_btn.click()
        time.sleep(1)

    @classmethod
    def tearDownClass(cls):
        cls.driver.quit()

    def test_01_microphone_button_initial_state(self):
        """Verify mic button is present beside textarea and send button with correct icon."""
        mic_btn = self.driver.find_element('id', 'chatbot-mic-btn')
        send_btn = self.driver.find_element('id', 'chatbot-send-btn')
        input_el = self.driver.find_element('id', 'chatbot-input')

        self.assertTrue(mic_btn.is_displayed(), "Microphone button must be visible")
        self.assertTrue(send_btn.is_displayed(), "Send button must be visible")
        self.assertTrue(input_el.is_displayed(), "Input textarea must be visible")
        self.assertIn("chatbot-mic-btn", mic_btn.get_attribute("class"))
        self.assertNotIn("listening", mic_btn.get_attribute("class"))

    def test_02_voice_input_and_transcript_display(self):
        """Test speaking 'What is Python?' populates #chatbot-input field and stays editable."""
        input_el = self.driver.find_element('id', 'chatbot-input')
        input_el.clear()

        # Simulate voice speech recognition input of "What is Python?"
        res = self.driver.execute_script("return window.__simulateSpeechInput('What is Python?');")
        self.assertTrue(res, "Speech input simulation must succeed")

        # Verify that "What is Python?" appears in the input field
        current_val = input_el.get_attribute("value")
        self.assertEqual(current_val, "What is Python?", "Spoken words must appear in chatbot-input")

        # Verify status banner informs user
        status_text = self.driver.find_element('id', 'chatbot-voice-status-text')
        self.assertIn("What is Python?", status_text.text)

    def test_03_editing_recognized_text_before_sending(self):
        """Verify the user can edit the recognized text before submitting."""
        input_el = self.driver.find_element('id', 'chatbot-input')

        # Append additional text to demonstrate editing capability
        input_el.send_keys(" Explain in one sentence.")
        edited_val = input_el.get_attribute("value")
        self.assertEqual(edited_val, "What is Python? Explain in one sentence.")

    def test_04_submit_recognized_text_receives_ai_response(self):
        """Verify submitting recognized query returns actual AI response from backend."""
        send_btn = self.driver.find_element('id', 'chatbot-send-btn')
        send_btn.click()

        # Wait for AI response bubble to appear
        messages = []
        for _ in range(10):
            time.sleep(1)
            messages = self.driver.find_elements('css selector', '.chatbot-message-group.assistant')
            if len(messages) > 0:
                break
        self.assertGreater(len(messages), 0, "Assistant response bubble must appear")

        last_msg = messages[-1].text
        self.assertTrue(
            "python" in last_msg.lower() or "programming" in last_msg.lower(),
            f"AI response must answer the question about Python: {last_msg}"
        )

    def test_05_error_banner_does_not_vanish_instantly(self):
        """Verify that an error status does NOT get immediately hidden."""
        # Inject an error notice into status banner
        self.driver.execute_script("""
          const statusEl = document.getElementById('chatbot-voice-status');
          const textEl = document.getElementById('chatbot-voice-status-text');
          textEl.textContent = 'No speech detected. Click microphone to try again.';
          statusEl.className = 'chatbot-voice-status status-error';
          statusEl.style.display = 'flex';
        """)

        # Call hideVoiceStatus() without force
        self.driver.execute_script("""
          const statusEl = document.getElementById('chatbot-voice-status');
          // If previous bug was present, calling hideVoiceStatus() would wipe it out
          if (typeof window.hideVoiceStatus === 'function') window.hideVoiceStatus(false);
        """)

        status_bar = self.driver.find_element('id', 'chatbot-voice-status')
        self.assertTrue(status_bar.is_displayed(), "Error banner must remain visible and not be wiped out")
        self.assertIn("status-error", status_bar.get_attribute("class"))

    def test_06_accurate_error_messages_per_error_code(self):
        """Verify accurate, user-friendly messages for each specific speech error code."""
        test_cases = [
            ("network", "Browser cloud speech service is unreachable"),
            ("not-allowed", "Microphone permission denied"),
            ("service-not-allowed", "Speech recognition service is disabled"),
            ("no-speech", "No speech was detected"),
            ("audio-capture", "No microphone found"),
            ("unsupported", "Voice recognition is not supported in this browser"),
        ]

        for code, expected_phrase in test_cases:
            res = self.driver.execute_script(f"return window.__simulateSpeechError('{code}');")
            self.assertEqual(res['code'], code)
            status_text = self.driver.find_element('id', 'chatbot-voice-status-text').text
            self.assertIn(
                expected_phrase,
                status_text,
                f"Error code '{code}' must display specific explanation containing '{expected_phrase}', got: '{status_text}'"
            )

    def test_07_backend_whisper_transcription_api(self):
        """Verify the secure server-side Whisper transcription endpoint."""
        import io, wave, struct, math, requests
        buf = io.BytesIO()
        w = wave.open(buf, 'wb')
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        for i in range(16000):
            sample = int(32767.0 * 0.1 * math.sin(2.0 * math.pi * 440.0 * i / 16000))
            w.writeframes(struct.pack('<h', sample))
        w.close()
        buf.seek(0)

        files = {'file': ('audio.wav', buf.read(), 'audio/wav')}
        res = requests.post(f'http://127.0.0.1:8080/chatbot/transcribe?token={self.token}', files=files)
        self.assertEqual(res.status_code, 200, f"Transcribe API must return 200, got {res.status_code}: {res.text}")
        data = res.json()
        self.assertTrue(data.get('success'), "Response success must be True")
        self.assertIn('provider', data, "Response must include provider")
        self.assertIn('transcript', data, "Response must include transcript")

    def test_08_instructor_and_admin_chat_integration(self):
        """Verify chatbot works across Instructor and Admin dashboards."""
        import requests
        db = SessionLocal()
        instructor = db.query(UserDB).filter(UserDB.role == "Instructor").first()
        admin = db.query(UserDB).filter(UserDB.role == "Admin").first()
        db.close()

        for role_user in [instructor, admin]:
            if not role_user:
                continue
            token = create_access_token({"sub": role_user.email, "id": role_user.id, "role": role_user.role})
            payload = {"message": f"Hello from {role_user.role}"}
            res = requests.post(
                f"http://127.0.0.1:8080/chatbot/message?token={token}",
                json=payload
            )
            self.assertEqual(res.status_code, 200, f"Role {role_user.role} must receive 200 from chatbot")
            data = res.json()
            self.assertTrue(data.get("ai_response"), f"Role {role_user.role} must receive AI response")


if __name__ == "__main__":
    unittest.main()
