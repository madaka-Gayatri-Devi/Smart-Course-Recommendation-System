from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class NotificationDB(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    title = Column(String, index=True)
    message = Column(String)
    type = Column(String, index=True)  # COURSE_RECOMMENDATION, NEW_COURSE, ENROLLMENT_SUCCESS, PAYMENT_SUCCESS, COURSE_COMPLETION, LEARNING_REMINDER, SYSTEM
    related_course_id = Column(Integer, ForeignKey("courses.id"), nullable=True, index=True)
    reference_id = Column(String, nullable=True)
    is_read = Column(Integer, default=0)  # 0 = unread, 1 = read
    created_at = Column(String)
    read_at = Column(String, nullable=True)
