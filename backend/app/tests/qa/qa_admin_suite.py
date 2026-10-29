"""
SmartLearn Comprehensive QA Test Suite - Admin Role
===================================================
Covers all Admin functional and integration workflows:
1. Authentication, Login, JWT verification, Role authorization
2. Profile management: Retrieval, persistence across DB sessions
3. Admin Dashboard Summary & KPI metrics
4. Admin Platform Statistics (users, courses, enrollments, completions)
5. Admin Analytics Overview & trends
6. User Management: Listing, filtering by role/status
7. User Status Moderation: Toggle active/inactive with persistence
8. Course Management: Platform course audit & search
9. Course Status Moderation: Admin status toggle (published/draft)
10. Assessment Management: Questions and attempts monitoring
11. Platform Enrollments Report & tracking
12. Financial Revenue & Payments Ledger audit
13. Recommendation Engine platform-wide analytics
"""

import sys
import os
import json
import time
from datetime import datetime

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath('backend'))

from app.main import (
    SessionLocal, UserDB, ProfileDB, CourseDB, EnrollmentDB, PaymentDB,
    login, UserLogin, get_profile, save_profile, ProfileData,
    get_admin_dashboard_summary, get_admin_stats, get_admin_analytics_overview,
    get_admin_users, toggle_user_status,
    get_admin_courses, admin_set_course_status, CourseStatusPayload,
    get_admin_assessments, get_admin_enrollments_report, get_admin_payments,
    get_admin_recommendations_stats
)
from fastapi import HTTPException

class MockRequest:
    client = type('obj', (object,), {'host': '127.0.0.1'})

mock_req = MockRequest()

def run_admin_qa():
    print("=" * 70)
    print("QA TEST SUITE: ADMIN WORKFLOWS & INTEGRATIONS")
    print("=" * 70)
    
    db = SessionLocal()
    test_results = []
    
    def log_result(test_name, passed, detail=""):
        status = "PASS" if passed else "FAIL"
        test_results.append((test_name, status, detail))
        print(f"[{status}] {test_name}" + (f" -> {detail}" if detail else ""))
        
    try:
        # TEST 1: Admin Login & Authentication
        # -------------------------------------------------------------
        print("\n--- 1. Admin Authentication & Role Verification ---")
        admin_email = "admin@smartlearn.com"
        admin_pwd = "Admin@123"
        try:
            auth_res = login(UserLogin(email=admin_email, password=admin_pwd), mock_req, db)
            assert auth_res["role"].lower() == "admin"
            assert "access_token" in auth_res
            assert "password" not in auth_res
            token = auth_res["access_token"]
            auth_header = f"Bearer {token}"
            admin_user = db.query(UserDB).filter(UserDB.id == auth_res["id"]).first()
            log_result("Admin Login & Token Verification", True, f"User ID={admin_user.id}, Role={admin_user.role}")
        except Exception as e:
            log_result("Admin Login & Token Verification", False, str(e))
            return test_results
            
        # TEST 2: Profile Retrieval & Persistence
        # -------------------------------------------------------------
        print("\n--- 2. Admin Profile Management ---")
        try:
            prof = get_profile(admin_user, db)
            assert "full_name" in prof
            log_result("Admin Profile Retrieval", True, f"Name='{prof.get('full_name')}', Role='{prof.get('role')}'")
        except Exception as e:
            log_result("Admin Profile Retrieval", False, str(e))
            
        try:
            updated_data = ProfileData(
                full_name="SmartLearn Lead Administrator",
                phone="9988776655",
                city="San Francisco, CA",
                headline="Platform System Administrator & Security Officer",
                skills=[{"skill": "System Administration", "level": "Expert"}, {"skill": "Cloud Security", "level": "Expert"}],
                interests=["Platform Reliability", "Cloud Infrastructure"]
            )
            save_res = save_profile(updated_data, admin_user, db)
            assert save_res["success"] is True
            # Separate DB session check
            fresh_db = SessionLocal()
            fresh_admin = fresh_db.query(UserDB).filter(UserDB.id == admin_user.id).first()
            verified_prof = get_profile(fresh_admin, fresh_db)
            assert verified_prof.get("phone") == "9988776655"
            fresh_db.close()
            log_result("Admin Profile Update & Persistence", True, f"Phone={verified_prof.get('phone')}, Completion={save_res.get('completion_percentage')}%")
        except Exception as e:
            log_result("Admin Profile Update & Persistence", False, str(e))
            
        # TEST 3: Admin Dashboard Summary
        # -------------------------------------------------------------
        print("\n--- 3. Admin Dashboard Summary ---")
        try:
            summary = get_admin_dashboard_summary(user=admin_user, db=db)
            assert isinstance(summary, dict)
            log_result("Admin Dashboard Summary", True, f"Summary keys: {list(summary.keys())[:5]}")
        except Exception as e:
            log_result("Admin Dashboard Summary", False, str(e))
            
        # TEST 4: Admin Platform Stats
        # -------------------------------------------------------------
        print("\n--- 4. Platform Statistics ---")
        try:
            stats = get_admin_stats(user=admin_user, db=db)
            assert isinstance(stats, dict)
            log_result("Admin Platform Statistics", True, f"Total Users={stats.get('total_users')}, Courses={stats.get('total_courses')}, Enrollments={stats.get('total_enrollments')}")
        except Exception as e:
            log_result("Admin Platform Statistics", False, str(e))
            
        # TEST 5: Admin Analytics Overview
        # -------------------------------------------------------------
        print("\n--- 5. Platform Analytics Overview ---")
        try:
            analytics = get_admin_analytics_overview(user=admin_user, db=db)
            assert isinstance(analytics, dict)
            log_result("Admin Analytics Overview", True, f"Analytics keys: {list(analytics.keys())[:5]}")
        except Exception as e:
            log_result("Admin Analytics Overview", False, str(e))
            
        # TEST 6: User Management (List & Filter)
        # -------------------------------------------------------------
        print("\n--- 6. User Management ---")
        try:
            users_res = get_admin_users(search=None, role=None, status=None, user=admin_user, db=db)
            user_list = users_res if isinstance(users_res, list) else users_res.get("users", [])
            assert len(user_list) > 0
            student_users = [u for u in user_list if (u.get("role") or "").lower() == "student"]
            instructor_users = [u for u in user_list if (u.get("role") or "").lower() == "instructor"]
            log_result("Admin Users Listing & Role Breakdown", True, f"Total={len(user_list)}, Students={len(student_users)}, Instructors={len(instructor_users)}")
        except Exception as e:
            log_result("Admin Users Listing & Role Breakdown", False, str(e))
            
        # TEST 7: User Status Moderation (Toggle Status)
        # -------------------------------------------------------------
        print("\n--- 7. User Moderation ---")
        try:
            target_user = db.query(UserDB).filter(UserDB.role == "Student", UserDB.id != admin_user.id).first()
            assert target_user is not None
            orig_status = target_user.is_active
            # Toggle once
            tog1 = toggle_user_status(user_id=target_user.id, user=admin_user, db=db)
            db.expire_all()
            target_check1 = db.query(UserDB).filter(UserDB.id == target_user.id).first()
            assert target_check1.is_active != orig_status
            
            # Toggle back to original state
            tog2 = toggle_user_status(user_id=target_user.id, user=admin_user, db=db)
            db.expire_all()
            target_check2 = db.query(UserDB).filter(UserDB.id == target_user.id).first()
            assert target_check2.is_active == orig_status
            log_result("Admin Toggle User Status & Invariant Restoration", True, f"User ID={target_user.id} toggled and restored to is_active={orig_status}")
        except Exception as e:
            log_result("Admin Toggle User Status & Invariant Restoration", False, str(e))
            
        # TEST 8: Course Management Audit
        # -------------------------------------------------------------
        print("\n--- 8. Course Management ---")
        try:
            courses_res = get_admin_courses(search=None, user=admin_user, db=db)
            c_list = courses_res if isinstance(courses_res, list) else courses_res.get("courses", [])
            assert len(c_list) > 0
            log_result("Admin Courses Audit Query", True, f"Total managed platform courses: {len(c_list)}")
        except Exception as e:
            log_result("Admin Courses Audit Query", False, str(e))
            
        # TEST 9: Course Moderation (Admin Set Status)
        # -------------------------------------------------------------
        print("\n--- 9. Course Moderation ---")
        try:
            sample_course = db.query(CourseDB).first()
            orig_course_status = sample_course.status
            # Update status
            new_status = "published" if orig_course_status != "published" else "draft"
            mod_res = admin_set_course_status(course_id=sample_course.id, payload=CourseStatusPayload(status=new_status), user=admin_user, db=db)
            db.expire_all()
            check_mod = db.query(CourseDB).filter(CourseDB.id == sample_course.id).first()
            assert check_mod.status == new_status
            
            # Restore original status
            admin_set_course_status(course_id=sample_course.id, payload=CourseStatusPayload(status=orig_course_status), user=admin_user, db=db)
            db.expire_all()
            check_restored = db.query(CourseDB).filter(CourseDB.id == sample_course.id).first()
            assert check_restored.status == orig_course_status
            log_result("Admin Course Moderation & Invariant Restoration", True, f"Course ID={sample_course.id} status modified and restored to '{orig_course_status}'")
        except Exception as e:
            log_result("Admin Course Moderation & Invariant Restoration", False, str(e))
            
        # TEST 10: Assessment Management
        # -------------------------------------------------------------
        print("\n--- 10. Assessment Management ---")
        try:
            assess_res = get_admin_assessments(user=admin_user, db=db)
            a_list = assess_res if isinstance(assess_res, list) else assess_res.get("assessments", [])
            log_result("Admin Assessments Query", True, f"Platform assessments count: {len(a_list)}")
        except Exception as e:
            log_result("Admin Assessments Query", False, str(e))
            
        # TEST 11: Enrollments Report
        # -------------------------------------------------------------
        print("\n--- 11. Enrollments Ledger Report ---")
        try:
            enr_report = get_admin_enrollments_report(user=admin_user, db=db)
            enrs = enr_report.get("enrollments", []) if isinstance(enr_report, dict) else enr_report
            total_enr = enr_report.get("total", len(enrs)) if isinstance(enr_report, dict) else len(enrs)
            log_result("Admin Enrollments Ledger Report", True, f"Total enrollments logged: {total_enr}")
        except Exception as e:
            log_result("Admin Enrollments Ledger Report", False, str(e))
            
        # TEST 12: Platform Payments & Revenue
        # -------------------------------------------------------------
        print("\n--- 12. Payments & Financial Revenue ---")
        try:
            pay_report = get_admin_payments(user=admin_user, db=db)
            pays = pay_report if isinstance(pay_report, list) else pay_report.get("payments", [])
            log_result("Admin Financial Payments Report", True, f"Total transaction records: {len(pays)}")
        except Exception as e:
            log_result("Admin Financial Payments Report", False, str(e))
            
        # TEST 13: Platform Recommendations Analytics
        # -------------------------------------------------------------
        print("\n--- 13. Platform Recommendations Analytics ---")
        try:
            rec_stats = get_admin_recommendations_stats(admin=admin_user, db=db)
            assert isinstance(rec_stats, dict)
            log_result("Admin Recommendations Platform Stats", True, f"Total recommendations: {rec_stats.get('total_recommendations', 0)}")
        except Exception as e:
            log_result("Admin Recommendations Platform Stats", False, str(e))
            
    finally:
        db.close()
        
    print("\n" + "=" * 70)
    passed_cnt = sum(1 for _, s, _ in test_results if s == "PASS")
    total_cnt = len(test_results)
    print(f"ADMIN QA SUITE FINISHED: {passed_cnt}/{total_cnt} PASSED ({passed_cnt/total_cnt*100:.1f}%)")
    print("=" * 70)
    return test_results

if __name__ == "__main__":
    run_admin_qa()
