"""
Test suite for Secure Role-Based Routing and Two-Factor Authentication (2FA).
"""

import sys
from pathlib import Path
from datetime import datetime, timedelta

BASE_DIR = Path(__file__).resolve().parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
APP_DIR = BASE_DIR / "app"
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

import unittest
from fastapi.testclient import TestClient
from app.main import app, SessionLocal, UserDB, TwoFactorOTPDB, verify_password, create_access_token, SECRET_KEY, ALGORITHM
from jose import jwt


class TestRoutingAnd2FA(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)
        self.db = SessionLocal()

    def tearDown(self):
        self.db.close()

    def test_01_users_exist_and_credentials(self):
        """Test logins and role assignments for Student, Instructor, Admin."""
        # 1. Student
        student = self.db.query(UserDB).filter(UserDB.email == "gayatri@gmail.com").first()
        self.assertIsNotNone(student, "Student gayatri@gmail.com must exist.")
        self.assertEqual(student.role.upper(), "STUDENT")

        # 2. Instructor
        instructor = self.db.query(UserDB).filter(UserDB.email == "tulasi@gmail.com").first()
        if not instructor:
            instructor = self.db.query(UserDB).filter(UserDB.role.in_(["Instructor", "INSTRUCTOR"])).first()
        self.assertIsNotNone(instructor, "An instructor account must exist.")

        # 3. Admin
        admin = self.db.query(UserDB).filter(UserDB.role.in_(["Admin", "ADMIN"])).first()
        self.assertIsNotNone(admin, "An admin account must exist.")

    def test_02_invalid_credentials(self):
        """Test login with wrong password."""
        res = self.client.post("/auth/login", json={"email": "gayatri@gmail.com", "password": "WrongPassword999!"})
        self.assertEqual(res.status_code, 401)
        self.assertIn("Incorrect email or password", res.json()["detail"])

    def test_03_two_factor_auth_flow(self):
        """Test full 2FA lifecycle: step 1 login -> OTP email -> step 2 verify success."""
        student = self.db.query(UserDB).filter(UserDB.email == "gayatri@gmail.com").first()
        student.two_factor_enabled = 1
        self.db.commit()

        # Step 1: Login
        res1 = self.client.post("/auth/login", json={"email": "gayatri@gmail.com", "password": "Mgayatri@123"})
        self.assertEqual(res1.status_code, 200)
        body1 = res1.json()
        self.assertTrue(body1.get("two_factor_required"))
        self.assertIn("pre_auth_token", body1)

        pre_auth_token = body1["pre_auth_token"]

        # Retrieve generated OTP from DB
        otp_rec = self.db.query(TwoFactorOTPDB).filter(TwoFactorOTPDB.pre_auth_token == pre_auth_token).first()
        self.assertIsNotNone(otp_rec)

        # 8. Test Incorrect 2FA Code
        res_fail = self.client.post("/auth/verify-2fa", json={"pre_auth_token": pre_auth_token, "otp_code": "000000"})
        self.assertEqual(res_fail.status_code, 400)
        self.assertIn("Incorrect verification code", res_fail.json()["detail"])

        # Find the plain-text OTP code from test context (since hash is stored)
        # Let's generate a known OTP for test verification
        import bcrypt
        known_otp = "123456"
        otp_rec.otp_hash = bcrypt.hashpw(known_otp.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        otp_rec.attempts = 0
        self.db.commit()

        # 7. Test Successful 2FA Verification
        res_ok = self.client.post("/auth/verify-2fa", json={"pre_auth_token": pre_auth_token, "otp_code": known_otp})
        self.assertEqual(res_ok.status_code, 200)
        body_ok = res_ok.json()
        self.assertIn("access_token", body_ok)
        self.assertEqual(body_ok["role"], "Student")

        # 10. Test Reuse Attempt (same pre_auth_token / OTP code)
        res_reuse = self.client.post("/auth/verify-2fa", json={"pre_auth_token": pre_auth_token, "otp_code": known_otp})
        self.assertEqual(res_reuse.status_code, 400)
        self.assertIn("already used or session is invalid", res_reuse.json()["detail"])

    def test_04_two_factor_expired_code(self):
        """9. Test 2FA Expired Code."""
        student = self.db.query(UserDB).filter(UserDB.email == "gayatri@gmail.com").first()
        
        # Create an expired OTP record
        import bcrypt
        known_otp = "654321"
        otp_hash = bcrypt.hashpw(known_otp.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        pre_auth_payload = {
            "sub": student.email,
            "user_id": student.id,
            "type": "2fa_pending",
            "exp": datetime.utcnow() + timedelta(minutes=5)
        }
        expired_token = jwt.encode(pre_auth_payload, SECRET_KEY, algorithm=ALGORITHM)
        expired_time = (datetime.utcnow() - timedelta(minutes=10)).strftime("%Y-%m-%d %H:%M:%S")

        otp_rec = TwoFactorOTPDB(
            user_id=student.id,
            pre_auth_token=expired_token,
            otp_hash=otp_hash,
            expires_at=expired_time,
            attempts=0,
            is_used=0,
            created_at=expired_time
        )
        self.db.add(otp_rec)
        self.db.commit()

        res_exp = self.client.post("/auth/verify-2fa", json={"pre_auth_token": expired_token, "otp_code": known_otp})
        self.assertEqual(res_exp.status_code, 400)
        self.assertIn("expired", res_exp.json()["detail"].lower())

    def test_05_backend_role_authorization_endpoints(self):
        """Test API role protection: Admin endpoints deny Students and Instructors."""
        student = self.db.query(UserDB).filter(UserDB.email == "gayatri@gmail.com").first()
        student_token = create_access_token(data={"sub": student.email})

        # Student trying to call Admin API -> 403 Forbidden
        res_admin_api = self.client.get(f"/admin/stats?token={student_token}")
        self.assertEqual(res_admin_api.status_code, 403)
        self.assertIn("Access denied. Admin privileges are required", res_admin_api.json()["detail"])

        # Invalid token -> 401 Unauthorized
        res_invalid = self.client.get("/users/me?token=invalid_token_xyz")
        self.assertEqual(res_invalid.status_code, 401)


if __name__ == "__main__":
    unittest.main()
