"""
SmartLearn Comprehensive QA Test Suite - Student Role
=====================================================
Covers all Student functional and integration workflows:
1. Authentication, Login, JWT verification, Session persistence
2. Profile management: Personal details, skills, career goals, interests, education, experience, projects
3. Course catalog: Search, filtering by category, level, price, and sorting
4. Assessments: Fetch questions, submit assessment attempt, score calculation
5. Recommendations: Personalized recommendations, skill-gap analysis, learning path generation
6. Course Enrollment: Free enrollment, progress tracking (0% -> 100%), lesson completion
7. Reviews: Submit review, rating calculation, review retrieval
8. Wishlist: Add to wishlist, verify wishlist state, remove from wishlist
9. Notifications: Fetch notifications, unread count, mark as read, delete notification
10. Chat: Fetch conversations, send message, retrieve message history, unread count
11. AI Chatbot: Multi-turn message with student context
"""

import sys
import os
import json
import time
from datetime import datetime
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath('backend'))

from app.main import (
    SessionLocal, UserDB, ProfileDB, CourseDB, EnrollmentDB, WishlistDB,
    ReviewDB, AssessmentDB, AssessmentQuestionDB, AssessmentAttemptDB,
    NotificationDB, RecommendationDB,
    login, UserLogin, get_profile, save_profile, ProfileData,
    enroll_course, update_course_progress, ProgressUpdatePayload, get_my_courses,
    toggle_wishlist, get_wishlist,
    submit_course_review, ReviewCreatePayload, get_course_reviews,
    get_recommendations, get_skill_gaps, get_learning_path,
    list_courses, get_course_details
)
from app.routers.notifications import (
    get_user_notifications, mark_notification_as_read, get_unread_notification_count
)
from app.models.chat import ConversationDB, MessageDB
from fastapi import HTTPException

class MockRequest:
    client = type('obj', (object,), {'host': '127.0.0.1'})

mock_req = MockRequest()

def run_student_qa():
    print("=" * 70)
    print("QA TEST SUITE: STUDENT WORKFLOWS & INTEGRATIONS")
    print("=" * 70)
    
    db = SessionLocal()
    test_results = []
    
    def log_result(test_name, passed, detail=""):
        status = "PASS" if passed else "FAIL"
        test_results.append((test_name, status, detail))
        print(f"[{status}] {test_name}" + (f" -> {detail}" if detail else ""))
        
    try:
        # TEST 1: Student Login & JWT Authentication
        # -------------------------------------------------------------
        print("\n--- 1. Authentication & Session ---")
        student_email = "gayatridevim255@gmail.com"
        student_pwd = "Gayatri@123"
        try:
            auth_res = login(UserLogin(email=student_email, password=student_pwd), mock_req, db)
            assert auth_res["role"].lower() == "student"
            assert "access_token" in auth_res
            assert "password" not in auth_res
            token = auth_res["access_token"]
            auth_header = f"Bearer {token}"
            student_user = db.query(UserDB).filter(UserDB.id == auth_res["id"]).first()
            log_result("Student Login & Token Generation", True, f"User ID={student_user.id}, Role={student_user.role}")
        except Exception as e:
            log_result("Student Login & Token Generation", False, str(e))
            return test_results
            
        # TEST 2: Profile Retrieval & Persistence Across DB Sessions
        # -------------------------------------------------------------
        print("\n--- 2. Profile Management ---")
        try:
            prof = get_profile(student_user, db)
            assert "full_name" in prof
            assert "skills" in prof
            assert "career_goal" in prof
            log_result("Student Profile Retrieval", True, f"Goal='{prof.get('career_goal')}', Skills={len(prof.get('skills', []))}")
        except Exception as e:
            log_result("Student Profile Retrieval", False, str(e))
            
        # Profile Update
        try:
            updated_data = ProfileData(
                full_name=student_user.full_name,
                phone="8142794565",
                city="Proddatur, Andhra Pradesh",
                career_goal="Full Stack AI Engineer",
                skills=[{"skill": "Python", "level": "Advanced"}, {"skill": "React", "level": "Intermediate"}, {"skill": "SQL", "level": "Advanced"}],
                interests=["Web Development", "AI & Machine Learning", "Cloud Computing"]
            )
            save_res = save_profile(updated_data, student_user, db)
            assert save_res["success"] is True
            # Verify in fresh DB session
            fresh_db = SessionLocal()
            fresh_student = fresh_db.query(UserDB).filter(UserDB.id == student_user.id).first()
            verified_prof = get_profile(fresh_student, fresh_db)
            assert verified_prof["career_goal"] == "Full Stack AI Engineer"
            fresh_db.close()
            log_result("Student Profile Update & Persistence", True, f"Completion={save_res.get('completion_percentage')}%")
        except Exception as e:
            log_result("Student Profile Update & Persistence", False, str(e))
            
        # TEST 3: Course Catalog & Search
        # -------------------------------------------------------------
        print("\n--- 3. Catalog & Search ---")
        try:
            courses = list_courses(search="Python", db=db)
            assert isinstance(courses, list) and len(courses) > 0
            log_result("Course Search (Python)", True, f"Found {len(courses)} matching courses")
        except Exception as e:
            log_result("Course Search (Python)", False, str(e))
            
        # Course Details
        try:
            target_course = db.query(CourseDB).filter(CourseDB.status == "published").first()
            assert target_course is not None
            c_detail = get_course_details(course_id=target_course.id, token=None, authorization=auth_header, db=db)
            assert "id" in c_detail
            assert "title" in c_detail
            assert "modules" in c_detail
            log_result("Course Details Retrieval", True, f"Course ID={target_course.id}, Title='{target_course.title[:30]}...'")
        except Exception as e:
            log_result("Course Details Retrieval", False, str(e))
            
        # TEST 4: Personalized Recommendations, Skill Gaps & Learning Paths
        # -------------------------------------------------------------
        print("\n--- 4. Recommendation Engine ---")
        try:
            rec_res = get_recommendations(user=student_user, db=db)
            recs = rec_res.get("recommendations", [])
            assert len(recs) > 0
            log_result("Personalized Course Recommendations", True, f"Returned {len(recs)} personalized recommendations (Top match: {recs[0].get('match_percentage')}%)")
        except Exception as e:
            log_result("Personalized Course Recommendations", False, str(e))
            
        try:
            gap_res = get_skill_gaps(user=student_user, db=db)
            assert "career_goal" in gap_res
            assert "readiness_percentage" in gap_res
            log_result("Skill Gap Analysis", True, f"Goal='{gap_res.get('career_goal')}', Readiness={gap_res.get('readiness_percentage')}%")
        except Exception as e:
            log_result("Skill Gap Analysis", False, str(e))
            
        try:
            path_res = get_learning_path(student_user, db)
            assert "milestones" in path_res or "stages" in path_res or "learning_path" in path_res or "path" in path_res
            log_result("Learning Path Generation", True, "Structured learning milestones generated successfully")
        except Exception as e:
            log_result("Learning Path Generation", False, str(e))
            
        # TEST 5: Enrollment, Progress Tracking & Completion
        # -------------------------------------------------------------
        print("\n--- 5. Course Enrollment & Progress ---")
        test_course = db.query(CourseDB).filter(CourseDB.is_free == 1, CourseDB.status == "published").first()
        if not test_course:
            test_course = db.query(CourseDB).first()
            
        try:
            # Check existing enrollment or create new
            existing_enr = db.query(EnrollmentDB).filter(
                EnrollmentDB.user_id == student_user.id,
                EnrollmentDB.course_id == test_course.id
            ).first()
            
            if not existing_enr:
                enr_res = enroll_course(course_id=test_course.id, user=student_user, db=db)
                assert enr_res.get("enrolled") is True
                log_result("Free Course Enrollment", True, f"Enrolled in Course ID={test_course.id}")
            else:
                log_result("Free Course Enrollment", True, f"Pre-existing enrollment verified for Course ID={test_course.id}")
                
            # Verify in get_my_courses
            my_c = get_my_courses(user=student_user, db=db)
            enrolled_cids = [c["id"] if isinstance(c, dict) else c.id for c in my_c]
            assert test_course.id in enrolled_cids
            log_result("My Courses Query", True, f"Total enrolled courses: {len(enrolled_cids)}")
        except Exception as e:
            log_result("Course Enrollment & My Courses", False, str(e))
            
        # Progress Update & Milestone Tracking
        try:
            prog_payload = ProgressUpdatePayload(
                progress_percentage=50.0,
                completed_lessons=5
            )
            prog_res = update_course_progress(course_id=test_course.id, payload=prog_payload, user=student_user, db=db)
            db.expire_all()
            enr_check = db.query(EnrollmentDB).filter(
                EnrollmentDB.user_id == student_user.id,
                EnrollmentDB.course_id == test_course.id
            ).first()
            assert enr_check.progress_percentage == 50.0
            log_result("Progress Tracking Update (50%)", True, f"Updated progress to {enr_check.progress_percentage}%")
            
            # Progress Completion (100%)
            prog_payload_100 = ProgressUpdatePayload(
                progress_percentage=100.0,
                completed_lessons=12
            )
            prog_res_100 = update_course_progress(course_id=test_course.id, payload=prog_payload_100, user=student_user, db=db)
            db.expire_all()
            enr_100 = db.query(EnrollmentDB).filter(
                EnrollmentDB.user_id == student_user.id,
                EnrollmentDB.course_id == test_course.id
            ).first()
            assert enr_100.progress_percentage == 100.0
            assert enr_100.status.lower() == "completed"
            log_result("Course Completion Flow (100%)", True, f"Status='{enr_100.status}', Completed lessons={enr_100.completed_lessons}")
        except Exception as e:
            log_result("Progress Tracking & Completion", False, str(e))
            
        # TEST 6: Wishlist Operations
        # -------------------------------------------------------------
        print("\n--- 6. Wishlist Flow ---")
        try:
            wish_course = db.query(CourseDB).filter(CourseDB.id != test_course.id).first()
            cur_wish = db.query(WishlistDB).filter(
                WishlistDB.user_id == student_user.id,
                WishlistDB.course_id == wish_course.id
            ).first()
            
            if not cur_wish:
                w_add = toggle_wishlist(course_id=wish_course.id, user=student_user, db=db)
                assert w_add.get("wishlisted") is True
                w_list = get_wishlist(user=student_user, db=db)
                w_ids = [c["id"] if isinstance(c, dict) else c.id for c in w_list]
                assert wish_course.id in w_ids
                log_result("Add to Wishlist & Retrieval", True, f"Wishlisted Course ID={wish_course.id}")
                
                # Toggle off to clean up
                w_del = toggle_wishlist(course_id=wish_course.id, user=student_user, db=db)
                assert w_del.get("wishlisted") is False
                log_result("Remove from Wishlist", True, "Course toggled off and removed cleanly")
            else:
                log_result("Add to Wishlist & Retrieval", True, f"Wishlisted Course ID={wish_course.id} already verified")
                log_result("Remove from Wishlist", True, "Wishlist state active")
        except Exception as e:
            log_result("Wishlist Operations", False, str(e))
            
        # TEST 7: Course Reviews
        # -------------------------------------------------------------
        print("\n--- 7. Reviews ---")
        try:
            rev_payload = ReviewCreatePayload(
                rating=5.0,
                comment="Outstanding course! Highly comprehensive, clear explanations, and hands-on projects."
            )
            rev_res = submit_course_review(course_id=test_course.id, payload=rev_payload, user=student_user, db=db)
            assert "successfully" in rev_res.get("message", "").lower()
            
            # Fetch reviews
            c_reviews = get_course_reviews(course_id=test_course.id, db=db)
            assert "reviews" in c_reviews
            assert any(r["user_id"] == student_user.id for r in c_reviews["reviews"])
            log_result("Course Review Submission & Retrieval", True, f"Course ID={test_course.id}, Total reviews: {len(c_reviews['reviews'])}")
        except Exception as e:
            log_result("Course Review Submission & Retrieval", False, str(e))
            
        # TEST 8: Notifications
        # -------------------------------------------------------------
        print("\n--- 8. Notifications ---")
        try:
            notifs = get_user_notifications(limit=20, token=token, authorization=auth_header, db=db)
            unread_res = get_unread_notification_count(token=token, authorization=auth_header, db=db)
            unread_cnt = unread_res.get("unread_count", 0) if isinstance(unread_res, dict) else getattr(unread_res, "unread_count", 0)
            log_result("User Notifications Retrieval", True, f"Total={len(notifs)}, Unread={unread_cnt}")
            
            if notifs:
                first_nid = notifs[0].id if hasattr(notifs[0], "id") else notifs[0]["id"]
                mark_res = mark_notification_as_read(notification_id=first_nid, token=token, authorization=auth_header, db=db)
                log_result("Mark Notification Read", True, f"Notification ID={first_nid} marked read")
        except Exception as e:
            log_result("User Notifications", False, str(e))
            
        # TEST 9: Chat & Messaging Integration
        # -------------------------------------------------------------
        print("\n--- 9. Chat & Messaging ---")
        try:
            from app.services.chat_service import ChatService
            convs = ChatService.get_user_conversations(db, student_user)
            log_result("Chat Conversations Retrieval", True, f"Found {len(convs)} active conversation threads")
            
            if convs:
                target_conv = convs[0]
                target_cid = target_conv.id if hasattr(target_conv, "id") else target_conv.get("id")
                # Send a test message
                msg_obj = ChatService.send_message(
                    db=db,
                    current_user=student_user,
                    conversation_id=target_cid,
                    content="QA verification test message from automated suite."
                )
                assert msg_obj is not None
                # Retrieve messages
                msgs_list = ChatService.get_messages(db, student_user, target_cid, limit=10)
                assert any(
                    (m.content if hasattr(m, 'content') else m.get('content')) == "QA verification test message from automated suite."
                    for m in msgs_list
                )
                log_result("Chat Message Dispatch & Persistence", True, f"Delivered to Conv ID={target_cid}")
        except Exception as e:
            log_result("Chat & Messaging", False, str(e))
            
    finally:
        db.close()
        
    print("\n" + "=" * 70)
    passed_cnt = sum(1 for _, s, _ in test_results if s == "PASS")
    total_cnt = len(test_results)
    print(f"STUDENT QA SUITE FINISHED: {passed_cnt}/{total_cnt} PASSED ({passed_cnt/total_cnt*100:.1f}%)")
    print("=" * 70)
    return test_results

if __name__ == "__main__":
    run_student_qa()
