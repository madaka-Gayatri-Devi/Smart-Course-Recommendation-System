"""Recommendation model for SmartLearn."""
from sqlalchemy import Column, Integer, String, Float, JSON, ForeignKey
from app.config.database import Base if hasattr(__import__('app.config.database', fromlist=['Base']), 'Base') else None

# Standalone definition for model imports
try:
    from app.main import Base
except Exception:
    try:
        from main import Base
    except Exception:
        from sqlalchemy.orm import declarative_base
        Base = declarative_base()

class RecommendationDB(Base):
    __tablename__ = "recommendations"
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), index=True)
    recommendation_score = Column(Float, default=0.0)
    scores_breakdown = Column(JSON, nullable=True)
    recommendation_reason = Column(String, nullable=True)
    matching_skills = Column(JSON, nullable=True)
    missing_skills = Column(JSON, nullable=True)
    matching_interests = Column(JSON, nullable=True)
    matching_career_goals = Column(JSON, nullable=True)
    status = Column(String, default="Recommended")  # Recommended, Viewed, Wishlisted, Enrolled, Completed, Dismissed
    generated_at = Column(String, nullable=True)
    updated_at = Column(String, nullable=True)
