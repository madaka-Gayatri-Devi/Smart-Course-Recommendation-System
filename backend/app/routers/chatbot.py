"""
SmartLearn AI Chatbot Router
============================
FastAPI Router managing the AI Chatbot Assistant endpoints.

Endpoints:
- GET  /chatbot/health: Diagnostic health check verifying provider connectivity.
- POST /chatbot/message: Main endpoint to handle typed and voice-recognized user messages.
- GET  /chatbot/conversations: Lists conversation history sessions for the authenticated user.
- POST /chatbot/conversations: Creates a new conversation session.
- GET  /chatbot/conversations/{id}: Fetches full transcript for a specific conversation session.
- DELETE /chatbot/conversations/{id}: Deletes a specific conversation session and its messages.

Security & Permissions:
- Strict JWT authentication via query parameter or Authorization Bearer header.
- Multi-tenant user isolation: Users (Students, Instructors, Admins) can only view
  and delete their own conversation history.
- Context is securely constructed from verified server-side database records.
"""

from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query, Header, UploadFile, File
from sqlalchemy.orm import Session

try:
    from app.models.ai_chatbot import AIChatbotConversationDB, AIChatbotMessageDB
    from app.schemas.ai_chatbot import (
        ChatMessagePayload, ChatMessageResponse,
        ConversationSummaryResponse, ConversationDetailResponse, ChatbotMessageItem,
        TranscribeResponse
    )
    from app.services.ai_chatbot_service import AIChatbotService
except ImportError:
    try:
        from models.ai_chatbot import AIChatbotConversationDB, AIChatbotMessageDB
        from schemas.ai_chatbot import (
            ChatMessagePayload, ChatMessageResponse,
            ConversationSummaryResponse, ConversationDetailResponse, ChatbotMessageItem,
            TranscribeResponse
        )
        from services.ai_chatbot_service import AIChatbotService
    except ImportError:
        from backend.app.models.ai_chatbot import AIChatbotConversationDB, AIChatbotMessageDB
        from backend.app.schemas.ai_chatbot import (
            ChatMessagePayload, ChatMessageResponse,
            ConversationSummaryResponse, ConversationDetailResponse, ChatbotMessageItem,
            TranscribeResponse
        )
        from backend.app.services.ai_chatbot_service import AIChatbotService


router = APIRouter(prefix="/chatbot", tags=["AI Chatbot Assistant"])

# Ensure database tables exist across SQLite and PostgreSQL upon router registration
try:
    try:
        from app.main import engine
    except ImportError:
        try:
            from main import engine
        except ImportError:
            from backend.app.main import engine
    AIChatbotConversationDB.__table__.create(bind=engine, checkfirst=True)
    AIChatbotMessageDB.__table__.create(bind=engine, checkfirst=True)
except Exception as _tb_err:
    pass


@router.get("/health")
def chatbot_health():
    """
    Health and configuration diagnostic endpoint for the AI Chatbot Assistant.
    Returns the availability status and masked API keys of configured LLM providers
    without revealing sensitive credentials.
    """
    return AIChatbotService.check_health()


def _get_main_deps():
    """
    Resolves dependency functions from the core main application module
    to avoid static circular import problems.
    """
    try:
        from app.main import get_db, get_current_user, UserDB
    except ImportError:
        try:
            from main import get_db, get_current_user, UserDB
        except ImportError:
            from backend.app.main import get_db, get_current_user, UserDB
    return get_db, get_current_user, UserDB


def get_db_session():
    """
    FastAPI dependency yielding an active SQLAlchemy database session
    and safely closing it after the request lifecycle terminates.
    """
    get_db, _, _ = _get_main_deps()
    yield from get_db()


def authenticate_user(
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db_session)
):
    """
    FastAPI dependency that extracts and validates the JWT authentication token
    from either query parameter '?token=...' or 'Authorization: Bearer ...' header.
    Returns the verified UserDB instance or raises HTTP 401 Unauthorized.
    """
    _, get_current_user_fn, _ = _get_main_deps()
    return get_current_user_fn(token=token, authorization=authorization, db=db)


@router.post("/message", response_model=ChatMessageResponse)
def send_chatbot_message(
    payload: ChatMessagePayload,
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Primary endpoint for processing user messages sent from the AI Learning Coach widget
    (both typed keyboard messages and speech-to-text voice transcribed queries).

    Workflow:
    1. Session Lookup/Creation: Attaches message to existing conversation if conversation_id
       is provided and owned by the current user; otherwise creates a new conversation record.
    2. Context Retrieval: Gathers the last 10 messages of conversational history to give the LLM context.
    3. Role Grounding: Gathers trusted server data (enrolled courses, progress, recommendations,
       authored courses, or platform metrics) according to the user's authentic role (Student, Instructor, Admin).
    4. AI Inference: Generates a streaming or single-turn response via the multi-provider LLM service.
    5. Persistence: Saves both the user message and assistant reply to the database.
    6. Response: Returns the conversation metadata and AI response to the frontend.
    """
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    user_role = user.role or "Student"

    # 1. Conversation session handling with ownership check
    conversation = None
    if payload.conversation_id:
        conversation = db.query(AIChatbotConversationDB).filter(
            AIChatbotConversationDB.id == payload.conversation_id,
            AIChatbotConversationDB.user_id == user.id
        ).first()

    if not conversation:
        title = payload.message[:35] + ("..." if len(payload.message) > 35 else "")
        conversation = AIChatbotConversationDB(
            user_id=user.id,
            title=title,
            role=user_role,
            created_at=now_str,
            updated_at=now_str
        )
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

    # 2. Fetch conversational context (last 10 messages in chronological order)
    prev_messages = db.query(AIChatbotMessageDB).filter(
        AIChatbotMessageDB.conversation_id == conversation.id
    ).order_by(AIChatbotMessageDB.id.asc()).limit(10).all()

    messages_history = [
        {"sender": m.sender, "content": m.content}
        for m in prev_messages
    ]

    # 3. Build role context from trusted backend data
    system_context = AIChatbotService.get_role_context(db, user)

    # 4. Generate AI response from real provider with safe error handling & grounded fallback
    try:
        ai_reply = AIChatbotService.generate_ai_response(
            messages_history=messages_history,
            system_context=system_context,
            user_message=payload.message
        )
    except Exception as exc:
        import logging
        logging.getLogger("smartlearn.chatbot").warning(
            f"AI provider generation notice: {exc}. Falling back to context-grounded response synthesizer."
        )
        ai_reply = AIChatbotService._synthesize_grounded_response(
            system_context=system_context,
            user_message=payload.message,
            history=messages_history
        )

    # 5. Persist user message and AI response
    user_msg_db = AIChatbotMessageDB(
        conversation_id=conversation.id,
        user_id=user.id,
        sender="user",
        content=payload.message,
        created_at=now_str
    )
    db.add(user_msg_db)

    ai_msg_db = AIChatbotMessageDB(
        conversation_id=conversation.id,
        user_id=user.id,
        sender="assistant",
        content=ai_reply,
        created_at=now_str
    )
    db.add(ai_msg_db)

    conversation.updated_at = now_str
    db.commit()

    return ChatMessageResponse(
        conversation_id=conversation.id,
        title=conversation.title,
        user_message=payload.message,
        ai_response=ai_reply,
        created_at=now_str
    )


@router.get("/conversations", response_model=List[ConversationSummaryResponse])
def list_conversations(
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Retrieves all conversation sessions belonging to the authenticated user.
    Results are ordered by most recently updated first.
    Enforces user isolation: users cannot see other users' conversations.
    """
    convs = db.query(AIChatbotConversationDB).filter(
        AIChatbotConversationDB.user_id == user.id
    ).order_by(AIChatbotConversationDB.updated_at.desc(), AIChatbotConversationDB.id.desc()).all()

    result = []
    for c in convs:
        last_msg = db.query(AIChatbotMessageDB).filter(
            AIChatbotMessageDB.conversation_id == c.id
        ).order_by(AIChatbotMessageDB.id.desc()).first()
        result.append(ConversationSummaryResponse(
            id=c.id,
            title=c.title or "Untitled Conversation",
            role=c.role or user.role or "Student",
            created_at=c.created_at,
            updated_at=c.updated_at,
            last_message=last_msg.content[:50] if last_msg else None
        ))
    return result


@router.post("/conversations", response_model=ConversationSummaryResponse)
def create_conversation(
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Explicitly initializes a new conversation session for the authenticated user.
    """
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    user_role = user.role or "Student"
    conv = AIChatbotConversationDB(
        user_id=user.id,
        title="New Conversation",
        role=user_role,
        created_at=now_str,
        updated_at=now_str
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)

    return ConversationSummaryResponse(
        id=conv.id,
        title=conv.title,
        role=conv.role,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        last_message=None
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailResponse)
def get_conversation(
    conversation_id: int,
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Retrieves the complete message transcript for a specific conversation session.
    Enforces role and user isolation: raises HTTP 403 Forbidden if the conversation
    does not belong to the authenticated user.
    """
    conv = db.query(AIChatbotConversationDB).filter(
        AIChatbotConversationDB.id == conversation_id
    ).first()

    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if conv.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You do not have permission to view this conversation."
        )

    msgs = db.query(AIChatbotMessageDB).filter(
        AIChatbotMessageDB.conversation_id == conv.id
    ).order_by(AIChatbotMessageDB.id.asc()).all()

    msg_items = [
        ChatbotMessageItem(
            id=m.id,
            sender=m.sender,
            content=m.content,
            created_at=m.created_at
        ) for m in msgs
    ]

    return ConversationDetailResponse(
        id=conv.id,
        title=conv.title or "Untitled Conversation",
        role=conv.role or user.role or "Student",
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=msg_items
    )


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Deletes a conversation session and all its associated messages.
    Enforces user isolation: raises HTTP 403 Forbidden if the conversation
    does not belong to the requesting user.
    """
    conv = db.query(AIChatbotConversationDB).filter(
        AIChatbotConversationDB.id == conversation_id
    ).first()

    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if conv.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You do not have permission to delete this conversation."
        )

    db.query(AIChatbotMessageDB).filter(AIChatbotMessageDB.conversation_id == conv.id).delete()
    db.delete(conv)
    db.commit()

    return {"message": "Conversation deleted successfully"}


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_speech(
    file: UploadFile = File(...),
    user=Depends(authenticate_user)
):
    """
    Authenticates user and securely transcribes speech audio bytes via server-side Whisper models
    (Groq whisper-large-v3-turbo / OpenAI whisper-1).
    Ensures credentials remain isolated and never exposed to the frontend.
    """
    try:
        audio_bytes = await file.read()
        filename = file.filename or "recording.webm"
        content_type = file.content_type or "audio/webm"
        result = AIChatbotService.transcribe_audio(audio_bytes, filename=filename, content_type=content_type)
        return TranscribeResponse(
            success=True,
            transcript=result["transcript"],
            provider=result["provider"]
        )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Audio transcription service error: {str(e)}"
        )
