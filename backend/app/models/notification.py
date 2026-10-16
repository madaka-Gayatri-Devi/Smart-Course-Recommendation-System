"""
SmartLearn In-App Notification Database Model
Stores user notification alerts, categories, links, and read/unread receipt states.
"""
from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship

try:
    from app.main import Base
except ImportError:
    try:
        from main import Base
    except ImportError:
        from backend.app.main import Base


class NotificationDB(Base):
    """Represents a system or activity alert dispatched to a user."""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(50), default="SYSTEM")
    title = Column(String(255), nullable=False)
    message = Column(String(1000), nullable=False)
    link = Column(String(255), nullable=True)
    is_read = Column(Integer, default=0)
    created_at = Column(String(50), nullable=True)
