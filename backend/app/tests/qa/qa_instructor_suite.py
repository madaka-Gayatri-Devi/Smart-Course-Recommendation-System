"""
SmartLearn Comprehensive QA Test Suite - Instructor Role
========================================================
Covers all Instructor functional and integration workflows:
1. Authentication, Login, JWT verification, Role authorization
2. Profile management: Retrieval, persistence across DB sessions
3. Dashboard summary & statistics (total courses, students, revenue, ratings)
4. Instructor course list retrieval
5. Course creation (Draft, modules, lessons, tags, outcomes)
6. Course status management (Draft -> Published)
7. Course editing and content updates
8. Student enrollments monitoring & progress tracking
9. Instructor course reviews & ratings retrieval
10. Analytics & financial earnings/payment reports
11. Course deletion & cleanup
"""

import sys
import os
import json
import time
from datetime import datetime

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath('backend'))

from app.main import (
    SessionLocal, UserDB, ProfileDB, CourseDB, EnrollmentDB, ReviewDB,
    login, UserLogin, get_profile, save_profile, ProfileData,
    get_instructor_dashboard_summary, get_instructor_stats,
    get_instructor_courses, get_instructor_students, get_instructor_reviews,
    get_instructor_analytics, get_instructor_payments,
    create_course, update_course, set_course_status, delete_course,
    CourseCreatePayload, CourseStatusPayload
)
from fastapi import HTTPException

class MockRequest:
    client = type('obj', (object,), {'host': '127.0.0.1'})

mock_req = MockRequest()

def run_instructor_qa():
    print("=" * 70)
    print("QA TEST SUITE: INSTRUCTOR WORKFLOWS & INTEGRATIONS")
    print("=" * 70)
    
    db = SessionLocal()
    test_results = []
    created_test_course_id = None
    
    def log_result(test_name, passed, detail=""):
        status = "PASS" if passed else "FAIL"
        test_results.append((test_name, status, detail))
        print(f"[{status}] {test_name}" + (f" -> {detail}" if detail else ""))
        
    try:
        # TEST 1: Instructor Login & Authentication
        # -------------------------------------------------------------
        print("\n--- 1. Instructor Authentication & Role Verification ---")
        inst_email = "tulasi@gmail.com"
        inst_pwd = "Tulasi@123"
        try:
            auth_res = login(UserLogin(email=inst_email, password=inst_pwd), mock_req, db)
            assert auth_res["role"].lower() == "instructor"
            assert "access_token" in auth_res
            assert "password" not in auth_res
            token = auth_res["access_token"]
            auth_header = f"Bearer {token}"
            inst_user = db.query(UserDB).filter(UserDB.id == auth_res["id"]).first()
            log_result("Instructor Login & Token Verification", True, f"User ID={inst_user.id}, Role={inst_user.role}")
        except Exception as e:
            log_result("Instructor Login & Token Verification", False, str(e))
            return test_results
            
        # TEST 2: Profile Retrieval & Persistence
        # -------------------------------------------------------------
        print("\n--- 2. Instructor Profile Management ---")
        try:
            prof = get_profile(inst_user, db)
            assert "full_name" in prof
            log_result("Instructor Profile Retrieval", True, f"Name='{prof.get('full_name')}', Title='{prof.get('headline', 'Instructor')}'")
        except Exception as e:
            log_result("Instructor Profile Retrieval", False, str(e))
            
        try:
            updated_data = ProfileData(
                full_name=inst_user.full_name,
                phone="9876543210",
                city="Bengaluru, Karnataka",
                headline="Lead AI & Full Stack Systems Architect",
                bio="Senior software engineer and technical instructor specializing in production distributed systems.",
                skills=[{"skill": "Python", "level": "Expert"}, {"skill": "FastAPI", "level": "Expert"}, {"skill": "Cloud Architecture", "level": "Advanced"}],
                interests=["Machine Learning", "System Design", "Microservices"]
            )
            save_res = save_profile(updated_data, inst_user, db)
            assert save_res["success"] is True
            # Persistence check in a separate DB session
            fresh_db = SessionLocal()
            fresh_inst = fresh_db.query(UserDB).filter(UserDB.id == inst_user.id).first()
            verified_prof = get_profile(fresh_inst, fresh_db)
            assert verified_prof.get("phone") == "9876543210"
            assert "Senior software engineer" in verified_prof.get("bio", "")
            fresh_db.close()
            log_result("Instructor Profile Update & Persistence", True, f"Phone={verified_prof.get('phone')}, Bio='{verified_prof.get('bio')[:30]}...'")
        except Exception as e:
            log_result("Instructor Profile Update & Persistence", False, str(e))
            
        # TEST 3: Dashboard Summary & Statistics
        # -------------------------------------------------------------
        print("\n--- 3. Instructor Dashboard & KPIs ---")
        try:
            summary = get_instructor_dashboard_summary(user=inst_user, db=db)
            assert isinstance(summary, dict)
            log_result("Instructor Dashboard Summary", True, f"Keys: {list(summary.keys())[:5]}")
        except Exception as e:
            log_result("Instructor Dashboard Summary", False, str(e))
            
        try:
            stats = get_instructor_stats(user=inst_user, db=db)
            assert isinstance(stats, dict)
            log_result("Instructor Statistics KPIs", True, f"Total Courses={stats.get('total_courses', 0)}, Total Students={stats.get('total_students', 0)}")
        except Exception as e:
            log_result("Instructor Statistics KPIs", False, str(e))
            
        # TEST 4: Instructor Course List
        # -------------------------------------------------------------
        print("\n--- 4. Instructor Courses Catalog ---")
        try:
            courses_res = get_instructor_courses(user=inst_user, db=db)
            course_list = courses_res if isinstance(courses_res, list) else courses_res.get("courses", [])
            log_result("Instructor Courses Listing", True, f"Active course count: {len(course_list)}")
        except Exception as e:
            log_result("Instructor Courses Listing", False, str(e))
            
        # TEST 5: Course Creation (Draft, Modules, Lessons)
        # -------------------------------------------------------------
        print("\n--- 5. Course Creation Workflow ---")
        try:
            course_payload = CourseCreatePayload(
                title="QA Automated Test - Production AI Microservices",
                short_description="End-to-end distributed system with FastAPI, Redis, and PyTorch.",
                description="Comprehensive masterclass designed for automated QA validation of course publishing workflows.",
                category="Computer Science & IT",
                subcategory="Backend Development",
                instructor_id=inst_user.id,
                instructor_name=inst_user.full_name,
                level="Advanced",
                duration="20 hours",
                language="English",
                format="Online Self-Paced",
                certificate=True,
                is_free=True,
                price=0.0,
                status="draft",
                skills=["Python", "FastAPI", "Docker", "Microservices"],
                learning_outcomes=["Build asynchronous microservices", "Implement resilient Redis caching"],
                modules=[{
                    "module_id": 1,
                    "title": "Module 1: Architecture Overview",
                    "duration": "2 hours",
                    "lessons": [
                        {
                            "lesson_id": 1,
                            "title": "Lesson 1: System Blueprint",
                            "duration": "30 mins",
                            "type": "video",
                            "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                            "is_preview": True
                        }
                    ]
                }]
            )
            create_res = create_course(payload=course_payload, user=inst_user, db=db)
            created_test_course_id = create_res.get("id") or create_res.get("course_id")
            assert created_test_course_id is not None
            # Verify in DB
            db_course = db.query(CourseDB).filter(CourseDB.id == created_test_course_id).first()
            assert db_course.title == "QA Automated Test - Production AI Microservices"
            assert db_course.status == "draft"
            log_result("Course Creation in Draft Mode", True, f"Course ID={created_test_course_id}, Status='{db_course.status}'")
        except Exception as e:
            log_result("Course Creation in Draft Mode", False, str(e))
            
        # TEST 6: Course Status Transition (Draft -> Published)
        # -------------------------------------------------------------
        print("\n--- 6. Course Lifecycle & Publishing ---")
        try:
            assert created_test_course_id is not None
            status_payload = CourseStatusPayload(status="published")
            status_res = set_course_status(course_id=created_test_course_id, payload=status_payload, user=inst_user, db=db)
            db.expire_all()
            db_course = db.query(CourseDB).filter(CourseDB.id == created_test_course_id).first()
            assert db_course.status == "published"
            log_result("Course Status Transition to Published", True, f"Course ID={created_test_course_id} is now '{db_course.status}'")
        except Exception as e:
            log_result("Course Status Transition to Published", False, str(e))
            
        # TEST 7: Course Update & Content Editing
        # -------------------------------------------------------------
        print("\n--- 7. Course Editing & Updates ---")
        try:
            assert created_test_course_id is not None
            update_payload = CourseCreatePayload(
                title="QA Automated Test - Production AI Microservices (Updated Edition)",
                short_description="Updated description with distributed messaging and Redis streams.",
                description="Comprehensive masterclass with updated curriculum modules.",
                category="Computer Science & IT",
                level="Expert",
                duration="25 hours",
                is_free=True,
                price=0.0,
                status="published",
                skills=["Python", "FastAPI", "Docker", "Redis", "Kafka"]
            )
            update_res = update_course(course_id=created_test_course_id, payload=update_payload, user=inst_user, db=db)
            db.expire_all()
            updated_c = db.query(CourseDB).filter(CourseDB.id == created_test_course_id).first()
            assert "Updated Edition" in updated_c.title
            log_result("Course Content Update", True, f"New Title='{updated_c.title[:45]}...'")
        except Exception as e:
            log_result("Course Content Update", False, str(e))
            
        # TEST 8: Student Enrollments Monitoring
        # -------------------------------------------------------------
        print("\n--- 8. Student Enrollments & Tracking ---")
        try:
            students_res = get_instructor_students(course_id=None, user=inst_user, token=token, db=db)
            st_list = students_res if isinstance(students_res, list) else students_res.get("students", [])
            log_result("Instructor Enrolled Students Query", True, f"Found {len(st_list)} enrolled student records")
        except Exception as e:
            log_result("Instructor Enrolled Students Query", False, str(e))
            
        # TEST 9: Course Reviews Retrieval
        # -------------------------------------------------------------
        print("\n--- 9. Instructor Reviews & Feedback ---")
        try:
            reviews_res = get_instructor_reviews(user=inst_user, token=token, db=db)
            rev_list = reviews_res if isinstance(reviews_res, list) else reviews_res.get("reviews", [])
            log_result("Instructor Reviews Retrieval", True, f"Found {len(rev_list)} student course reviews")
        except Exception as e:
            log_result("Instructor Reviews Retrieval", False, str(e))
            
        # TEST 10: Instructor Analytics & Financials
        # -------------------------------------------------------------
        print("\n--- 10. Analytics & Revenue ---")
        try:
            analytics_res = get_instructor_analytics(user=inst_user, token=token, db=db)
            assert isinstance(analytics_res, dict)
            log_result("Instructor Course Analytics", True, f"Analytics keys: {list(analytics_res.keys())[:4]}")
        except Exception as e:
            log_result("Instructor Course Analytics", False, str(e))
            
        try:
            pay_res = get_instructor_payments(user=inst_user, db=db)
            pay_list = pay_res if isinstance(pay_res, list) else pay_res.get("payments", [])
            log_result("Instructor Payments & Revenue Ledger", True, f"Payment records count: {len(pay_list)}")
        except Exception as e:
            log_result("Instructor Payments & Revenue Ledger", False, str(e))
            
        # TEST 11: Cleanup Test Course
        # -------------------------------------------------------------
        print("\n--- 11. Cleanup & Deletion ---")
        if created_test_course_id:
            try:
                del_res = delete_course(course_id=created_test_course_id, user=inst_user, db=db)
                db.expire_all()
                deleted_check = db.query(CourseDB).filter(CourseDB.id == created_test_course_id).first()
                assert deleted_check.status == "deactivated"
                log_result("Course Deletion & Deactivation Cleanup", True, f"Course ID={created_test_course_id} status set to '{deleted_check.status}'")
            except Exception as e:
                log_result("Course Deletion & Deactivation Cleanup", False, str(e))
                
    finally:
        db.close()
        
    print("\n" + "=" * 70)
    passed_cnt = sum(1 for _, s, _ in test_results if s == "PASS")
    total_cnt = len(test_results)
    print(f"INSTRUCTOR QA SUITE FINISHED: {passed_cnt}/{total_cnt} PASSED ({passed_cnt/total_cnt*100:.1f}%)")
    print("=" * 70)
    return test_results

if __name__ == "__main__":
    run_instructor_qa()
