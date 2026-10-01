from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Dict, Any


class UserSummary(BaseModel):
    id: int
    full_name: str
    email: str
    role: str
    profile_image: Optional[str] = None
    is_online: Optional[bool] = False
    model_config = ConfigDict(from_attributes=True)


class MessageReactionSchema(BaseModel):
    id: int
    message_id: int
    user_id: int
    user_name: Optional[str] = None
    emoji: str
    created_at: str
    model_config = ConfigDict(from_attributes=True)


class MessageAttachmentSchema(BaseModel):
    id: int
    message_id: int
    file_name: str
    file_path: str
    file_type: str
    file_size: int
    created_at: str
    download_url: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    sender_name: str
    sender_role: str
    sender_avatar: Optional[str] = None
    message_type: str
    content: Optional[str] = None
    is_edited: bool = False
    original_content: Optional[str] = None
    edited_at: Optional[str] = None
    reply_to_message_id: Optional[int] = None
    reply_to_message: Optional[Dict[str, Any]] = None
    is_deleted: bool = False
    deleted_for_everyone: bool = False
    deleted_at: Optional[str] = None
    deleted_by: Optional[int] = None
    is_announcement: bool = False
    created_at: str
    reactions: List[MessageReactionSchema] = []
    attachments: List[MessageAttachmentSchema] = []
    is_forwarded: bool = False
    read_by_user_ids: List[int] = []
    status: str = "SENT"  # SENT, DELIVERED, READ
    model_config = ConfigDict(from_attributes=True)


class ConversationResponse(BaseModel):
    id: int
    type: str  # PERSONAL, COURSE_GROUP, ADMIN_GROUP, CUSTOM_GROUP
    course_id: Optional[int] = None
    course_title: Optional[str] = None
    title: str
    description: Optional[str] = None
    icon: Optional[str] = None
    is_archived: bool = False
    is_muted: bool = False
    is_pinned: bool = False
    unread_count: int = 0
    last_message: Optional[MessageResponse] = None
    other_user: Optional[UserSummary] = None
    members_count: int = 0
    members: List[UserSummary] = []
    created_at: str
    updated_at: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class CreateConversationPayload(BaseModel):
    type: str = "PERSONAL"  # PERSONAL, CUSTOM_GROUP
    target_user_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    member_ids: Optional[List[int]] = []


class SendMessagePayload(BaseModel):
    conversation_id: int
    content: Optional[str] = ""
    message_type: Optional[str] = "TEXT"  # TEXT, IMAGE, FILE
    reply_to_message_id: Optional[int] = None
    is_announcement: Optional[bool] = False
    attachment_ids: Optional[List[int]] = []


class EditMessagePayload(BaseModel):
    content: str


class ReactionPayload(BaseModel):
    emoji: str  # 👍, ❤️, 😂, 😮, 😢, 👏, 🔥, 🎉


class ForwardMessagePayload(BaseModel):
    target_conversation_ids: List[int]


class CreateGroupPayload(BaseModel):
    title: str
    description: Optional[str] = None
    member_ids: List[int] = []


class UpdateGroupPayload(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    is_archived: Optional[bool] = None


class GroupMemberPayload(BaseModel):
    user_ids: List[int]


class AllowedContact(BaseModel):
    id: int
    full_name: str
    email: str
    role: str
    profile_image: Optional[str] = None
    course_title: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class SharedMediaItem(BaseModel):
    id: int
    message_id: int
    file_name: str
    file_path: str
    download_url: str
    file_type: str
    file_size: int
    sender_id: int
    sender_name: str
    created_at: str
    model_config = ConfigDict(from_attributes=True)


class SharedDocItem(BaseModel):
    id: int
    message_id: int
    file_name: str
    file_path: str
    download_url: str
    file_type: str
    file_size: int
    sender_id: int
    sender_name: str
    created_at: str
    model_config = ConfigDict(from_attributes=True)


class SharedLinkItem(BaseModel):
    id: int
    message_id: int
    url: str
    title: str
    sender_id: int
    sender_name: str
    created_at: str
    model_config = ConfigDict(from_attributes=True)


class SharedContentResponse(BaseModel):
    conversation_id: int
    media_count: int
    docs_count: int
    links_count: int
    media: List[SharedMediaItem] = []
    docs: List[SharedDocItem] = []
    links: List[SharedLinkItem] = []
    model_config = ConfigDict(from_attributes=True)


class ContactInfoResponse(BaseModel):
    conversation_id: int
    type: str  # PERSONAL, COURSE_GROUP, CUSTOM_GROUP
    title: str
    description: Optional[str] = None
    icon: Optional[str] = None
    course_id: Optional[int] = None
    course_title: Optional[str] = None
    user_id: Optional[int] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    email: Optional[str] = None
    profile_image: Optional[str] = None
    is_online: bool = False
    media_count: int = 0
    docs_count: int = 0
    links_count: int = 0
    members_count: int = 0
    members: List[UserSummary] = []
    created_at: str
    model_config = ConfigDict(from_attributes=True)

