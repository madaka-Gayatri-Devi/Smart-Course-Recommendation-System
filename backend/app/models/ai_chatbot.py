from sqlalchemy import Column, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship

try:
    from app.main import Base
except ImportError:
    try:
        from main import Base
    except ImportError:
        from backend.app.main import Base


class AIChatbotConversationDB(Base):
    __tablename__ = "ai_chatbot_conversations"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    title = Column(String, default="New Conversation")
    role = Column(String, default="Student")  # Student, Instructor, Admin
    created_at = Column(String)
    updated_at = Column(String, nullable=True)


class AIChatbotMessageDB(Base):
    __tablename__ = "ai_chatbot_messages"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("ai_chatbot_conversations.id"), index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    sender = Column(String, nullable=False)  # "user" or "assistant"
    content = Column(Text, nullable=False)
    created_at = Column(String, index=True)
