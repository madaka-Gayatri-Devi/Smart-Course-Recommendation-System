"""
SmartLearn Chat and Direct Messaging Database Models
Defines SQLAlchemy ORM models for conversations, participants, messages, reactions, and attachments.
"""
from sqlalchemy import Column, Integer, String, ForeignKey, JSON, Text
from sqlalchemy.orm import declarative_base

try:
    from app.main import Base
except ImportError:
    try:
        from main import Base
    except ImportError:
        from backend.app.main import Base


class ConversationDB(Base):
    """Represents a direct, group, or self conversation entity."""
    __tablename__ = "conversations"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, default="PERSONAL", index=True)  # PERSONAL, COURSE_GROUP, ADMIN_GROUP, CUSTOM_GROUP
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True, index=True)
    title = Column(String, nullable=True)
    description = Column(String, nullable=True)
    icon = Column(String, nullable=True)
    is_archived = Column(Integer, default=0)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(String)
    updated_at = Column(String, nullable=True)


class ConversationMemberDB(Base):
    """Tracks member participation, role, unread count, and mute/pin preferences."""
    __tablename__ = "conversation_members"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    role = Column(String, default="member")  # member, instructor, admin
    joined_at = Column(String)
    is_muted = Column(Integer, default=0)
    is_pinned = Column(Integer, default=0)
    last_read_message_id = Column(Integer, nullable=True)


class MessageDB(Base):
    """Represents a chat message supporting text, attachments, and replies."""
    __tablename__ = "messages"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), index=True)
    sender_name = Column(String, nullable=True)
    sender_role = Column(String, nullable=True)
    message_type = Column(String, default="TEXT", index=True)  # TEXT, IMAGE, FILE, SYSTEM
    content = Column(Text, nullable=True)
    is_edited = Column(Integer, default=0)
    original_content = Column(Text, nullable=True)
    edited_at = Column(String, nullable=True)
    reply_to_message_id = Column(Integer, ForeignKey("messages.id"), nullable=True, index=True)
    is_deleted = Column(Integer, default=0)
    deleted_for_everyone = Column(Integer, default=0)
    deleted_at = Column(String, nullable=True)
    deleted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_announcement = Column(Integer, default=0)
    created_at = Column(String, index=True)
    updated_at = Column(String, nullable=True)


class MessageUserDeletionDB(Base):
    """Records soft-deletion exclusions per user (delete-for-me)."""
    __tablename__ = "message_user_deletions"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("messages.id"), index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    deleted_at = Column(String)



class MessageReactionDB(Base):
    """Tracks emoji reactions attached to specific messages."""
    __tablename__ = "message_reactions"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("messages.id"), index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    emoji = Column(String, index=True)
    created_at = Column(String)


class MessageAttachmentDB(Base):
    """Stores metadata and file paths for media and files attached to messages."""
    __tablename__ = "message_attachments"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("messages.id"), index=True)
    file_name = Column(String)
    file_path = Column(String)
    file_type = Column(String)
    file_size = Column(Integer)
    created_at = Column(String)


class MessageForwardDB(Base):
    """Tracks message forwarding provenance and multi-destination dispatch history."""
    __tablename__ = "message_forwards"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    original_message_id = Column(Integer, ForeignKey("messages.id"), index=True)
    forwarded_message_id = Column(Integer, ForeignKey("messages.id"), index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), index=True)
    created_at = Column(String)
