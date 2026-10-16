"""
SmartLearn AI Chatbot Pydantic Schemas
======================================
Defines the request and response data contracts for the AI Chatbot Assistant endpoints.
"""

from typing import Optional, List
from pydantic import BaseModel, Field


class ChatMessagePayload(BaseModel):
    """
    Inbound payload sent from the frontend when the user submits a message
    (either via typing or via speech-to-text voice recognition).
    """
    message: str = Field(
        ...,
        min_length=1,
        max_length=4000,
        description="The user's query or instruction text."
    )
    conversation_id: Optional[int] = Field(
        None,
        description="Optional active conversation session ID. If omitted, a new conversation is created."
    )


class ChatMessageResponse(BaseModel):
    """
    Outbound response returned to the frontend containing the conversation ID,
    echo of the user message, generated AI response, and timestamp.
    """
    conversation_id: int = Field(..., description="ID of the active conversation session.")
    title: str = Field(..., description="Short summary title of the conversation.")
    user_message: str = Field(..., description="The user's submitted query.")
    ai_response: str = Field(..., description="The LLM-generated assistant response.")
    created_at: str = Field(..., description="Timestamp in 'YYYY-MM-DD HH:MM:SS' format.")


class ConversationSummaryResponse(BaseModel):
    """
    Summary representation of a conversation session used in the history drawer list.
    """
    id: int = Field(..., description="Primary key of the conversation.")
    title: str = Field(..., description="Title or excerpt of the initial prompt.")
    role: str = Field(..., description="The user role when conversation was started (Student, Instructor, Admin).")
    created_at: str = Field(..., description="Session creation timestamp.")
    updated_at: Optional[str] = Field(None, description="Last message timestamp.")
    last_message: Optional[str] = Field(None, description="Preview of the latest message snippet.")


class ChatbotMessageItem(BaseModel):
    """
    Single message turn within a conversation detail transcript.
    """
    id: int = Field(..., description="Message primary key.")
    sender: str = Field(..., description="'user' or 'assistant'")
    content: str = Field(..., description="Message text or markdown.")
    created_at: str = Field(..., description="Timestamp when message was stored.")


class ConversationDetailResponse(BaseModel):
    """
    Detailed transcript of a conversation session including full message history.
    """
    id: int = Field(..., description="Primary key of the conversation.")
    title: str = Field(..., description="Conversation title.")
    role: str = Field(..., description="User role associated with this conversation.")
    created_at: str = Field(..., description="Session creation timestamp.")
    updated_at: Optional[str] = Field(None, description="Last updated timestamp.")
    messages: List[ChatbotMessageItem] = Field(
        default_factory=list,
        description="Chronological list of all messages exchanged in this conversation."
    )


class TranscribeResponse(BaseModel):
    """
    Response schema returned by the speech audio transcription endpoint.
    """
    success: bool = Field(..., description="Whether speech was successfully transcribed.")
    transcript: str = Field(..., description="Recognized speech text.")
    provider: Optional[str] = Field(None, description="STT service provider utilized.")
