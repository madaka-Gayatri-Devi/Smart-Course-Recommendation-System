from pydantic import BaseModel, ConfigDict
from typing import Optional

class NotificationBase(BaseModel):
    title: str
    message: str
    type: str
    related_course_id: Optional[int] = None
    reference_id: Optional[str] = None

class NotificationCreate(NotificationBase):
    user_id: int

class NotificationResponse(NotificationBase):
    id: int
    user_id: int
    is_read: int
    created_at: str
    read_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class UnreadCountResponse(BaseModel):
    unread_count: int
