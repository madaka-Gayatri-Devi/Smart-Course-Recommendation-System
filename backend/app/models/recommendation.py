"""
SmartLearn Persistent Recommendation Snapshot Database Model
Caches personalized course recommendations and match score rationale per student.
"""
from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship

try:
    from app.main import Base
except ImportError:
    try:
        from main import Base
    except ImportError:
        from backend.app.main import Base


class RecommendationDB(Base):
    """Stores calculated course recommendations, compatibility scores, and rationale for a user."""
    __tablename__ = "recommendations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    score = Column(Float, nullable=False)
    reasons = Column(JSON, nullable=True)
    created_at = Column(String(50), nullable=True)
