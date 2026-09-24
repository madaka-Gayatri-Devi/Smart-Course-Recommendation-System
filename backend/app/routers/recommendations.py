"""APIRouter for Recommendation Management endpoints in SmartLearn.
Note: All primary Admin Recommendation routes are registered in backend/app/main.py as single source of truth.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any

try:
    from app.main import (
        get_db, get_current_admin, get_current_user,
        RecommendationDB, UserDB, CourseDB, ProfileDB, AssessmentAttemptDB, AssessmentDB, CareerGoalDB,
        sync_student_recommendations, RegenerateRecommendationsPayload
    )
except ImportError:
    try:
        from main import (
            get_db, get_current_admin, get_current_user,
            RecommendationDB, UserDB, CourseDB, ProfileDB, AssessmentAttemptDB, AssessmentDB, CareerGoalDB,
            sync_student_recommendations, RegenerateRecommendationsPayload
        )
    except ImportError:
        from backend.app.main import (
            get_db, get_current_admin, get_current_user,
            RecommendationDB, UserDB, CourseDB, ProfileDB, AssessmentAttemptDB, AssessmentDB, CareerGoalDB,
            sync_student_recommendations, RegenerateRecommendationsPayload
        )

router = APIRouter(prefix="/admin/recommendations", tags=["Admin Recommendations"])

@router.get("/stats")
def get_recommendation_stats(admin: UserDB = Depends(get_current_admin), db: Session = Depends(get_db)):
    total_records = db.query(RecommendationDB).count()
    students_count = db.query(RecommendationDB.student_id).distinct().count()
    courses_count = db.query(RecommendationDB.course_id).distinct().count()
    accepted_count = db.query(RecommendationDB).filter(RecommendationDB.status.in_(["Enrolled", "Completed"])).count()
    
    return {
        "total_recommendation_records": total_records,
        "students_with_recommendations": students_count,
        "recommended_courses_count": courses_count,
        "accepted_enrolled_count": accepted_count,
        "enrollment_conversion_rate": round((accepted_count / total_records * 100), 1) if total_records > 0 else 0.0
    }
