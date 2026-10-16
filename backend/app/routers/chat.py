import os
import shutil
import uuid
from pathlib import Path
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query, Header, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from jose import jwt, JWTError

try:
    from app.models.chat import (
        ConversationDB, ConversationMemberDB, MessageDB,
        MessageReactionDB, MessageAttachmentDB, MessageUserDeletionDB
    )
    from app.schemas.chat import (
        ConversationResponse, MessageResponse, CreateConversationPayload,
        SendMessagePayload, EditMessagePayload, ReactionPayload,
        ForwardMessagePayload, CreateGroupPayload, UpdateGroupPayload,
        GroupMemberPayload, AllowedContact, MessageAttachmentSchema,
        SharedContentResponse, ContactInfoResponse
    )
    from app.services.chat_service import ChatService, chat_ws_manager
except ImportError:
    try:
        from models.chat import (
            ConversationDB, ConversationMemberDB, MessageDB,
            MessageReactionDB, MessageAttachmentDB, MessageUserDeletionDB
        )
        from schemas.chat import (
            ConversationResponse, MessageResponse, CreateConversationPayload,
            SendMessagePayload, EditMessagePayload, ReactionPayload,
            ForwardMessagePayload, CreateGroupPayload, UpdateGroupPayload,
            GroupMemberPayload, AllowedContact, MessageAttachmentSchema,
            SharedContentResponse, ContactInfoResponse
        )
        from services.chat_service import ChatService, chat_ws_manager
    except ImportError:
        from backend.app.models.chat import (
            ConversationDB, ConversationMemberDB, MessageDB,
            MessageReactionDB, MessageAttachmentDB, MessageUserDeletionDB
        )
        from backend.app.schemas.chat import (
            ConversationResponse, MessageResponse, CreateConversationPayload,
            SendMessagePayload, EditMessagePayload, ReactionPayload,
            ForwardMessagePayload, CreateGroupPayload, UpdateGroupPayload,
            GroupMemberPayload, AllowedContact, MessageAttachmentSchema,
            SharedContentResponse, ContactInfoResponse
        )
        from backend.app.services.chat_service import ChatService, chat_ws_manager

router = APIRouter(prefix="/chat", tags=["Chat & Communication"])


# ============================================================================
# AUTHENTICATION & DATABASE DEPENDENCY INJECTION
# ============================================================================
def _get_main_deps():
    """
    Dynamically resolves get_db and get_current_user dependencies from core application.

    Returns:
        Tuple of (get_db, get_current_user).
    """
    try:
        from app.main import get_db, get_current_user, UserDB, SessionLocal, SECRET_KEY, ALGORITHM, BASE_DIR
    except ImportError:
        try:
            from main import get_db, get_current_user, UserDB, SessionLocal, SECRET_KEY, ALGORITHM, BASE_DIR
        except ImportError:
            from backend.app.main import get_db, get_current_user, UserDB, SessionLocal, SECRET_KEY, ALGORITHM, BASE_DIR
    return get_db, get_current_user, UserDB, SessionLocal, SECRET_KEY, ALGORITHM, BASE_DIR


def get_db_session():
    """
    FastAPI dependency providing an active SQLAlchemy database session.

    Yields:
        Session: Active database session.
    """
    get_db, _, _, SessionLocal, _, _, _ = _get_main_deps()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def authenticate_user(token: Optional[str] = Query(None), authorization: Optional[str] = Header(None), db: Session = Depends(get_db_session)):
    """
    FastAPI dependency verifying JWT Bearer token and retrieving authenticated user record.

    Returns:
        UserDB: Authenticated user database model instance.

    Error handling:
        Raises HTTPException(401) if token is invalid or user record not found.
    """
    _, get_current_user_fn, _, _, _, _, _ = _get_main_deps()
    return get_current_user_fn(token=token, authorization=authorization, db=db)


# --- CONVERSATIONS ---

# ============================================================================
# CONVERSATION MANAGEMENT ENDPOINTS
# ============================================================================
@router.get("/conversations", response_model=List[ConversationResponse])
def list_user_conversations(
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint GET /conversations - Retrieve all active chat conversations for the authenticated user.

    Returns:
        List[ConversationResponse]: Sorted list of conversations with unread counts and recent messages.
    """
    return ChatService.get_user_conversations(db, user)


@router.post("/conversations", response_model=ConversationResponse)
def create_or_get_conversation(
    payload: CreateConversationPayload,
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint POST /conversations - Initialize or retrieve a direct, self, or group conversation.

    Args:
        payload: ConversationCreate request body (type, target_user_id, course_id, group_name).

    Returns:
        ConversationResponse: Details of created or retrieved conversation.

    Error handling:
        Raises HTTPException(400) if messaging permission is denied.
    """
    if payload.type == "PERSONAL":
        if not payload.target_user_id:
            raise HTTPException(status_code=400, detail="Target user ID required for personal chat.")
        try:
            conv = ChatService.get_or_create_personal_conversation(db, user, payload.target_user_id)
            convs = ChatService.get_user_conversations(db, user)
            matching = next((c for c in convs if c.id == conv.id), None)
            if matching:
                return matching
            raise HTTPException(status_code=500, detail="Failed to format conversation response.")
        except PermissionError as pe:
            raise HTTPException(status_code=403, detail=str(pe))
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))
    else:
        # Custom group creation (Admin or Authorized user)
        my_role = (user.role or "").upper()
        if my_role != "ADMIN":
            raise HTTPException(status_code=403, detail="Only Admins can create custom group chats.")
        if not payload.title:
            raise HTTPException(status_code=400, detail="Group title required.")

        now_str = ChatService.now_str()
        conv = ConversationDB(
            type="CUSTOM_GROUP",
            title=payload.title,
            description=payload.description or f"Custom group created by {user.full_name}",
            icon="fa-solid fa-users-gear",
            created_by=user.id,
            created_at=now_str,
            updated_at=now_str
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)

        # Add creator
        db.add(ConversationMemberDB(conversation_id=conv.id, user_id=user.id, role="admin", joined_at=now_str))

        # Add other members
        if payload.member_ids:
            for mid in set(payload.member_ids):
                if mid != user.id:
                    db.add(ConversationMemberDB(conversation_id=conv.id, user_id=mid, role="member", joined_at=now_str))
        db.commit()

        convs = ChatService.get_user_conversations(db, user)
        return next((c for c in convs if c.id == conv.id), convs[0])


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
def get_conversation_details(
    conversation_id: int,
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint GET /conversations/{conversation_id} - Retrieve metadata for a specific conversation.

    Args:
        conversation_id: Unique database identifier of the conversation.

    Returns:
        ConversationResponse: Conversation metadata and participants.

    Error handling:
        Raises HTTPException(403) if user is not a participant, or 404 if not found.
    """
    if not ChatService.can_access_conversation(db, user, conversation_id):
        raise HTTPException(status_code=403, detail="Access denied.")
    convs = ChatService.get_user_conversations(db, user)
    conv = next((c for c in convs if c.id == conversation_id), None)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return conv


@router.get("/conversations/{conversation_id}/shared-content", response_model=SharedContentResponse)
def get_conversation_shared_content(
    conversation_id: int,
    q: Optional[str] = Query(None),
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint GET /conversations/{conversation_id}/shared-content - Retrieve shared media, documents, and links.

    Returns:
        SharedContentResponse: Categorized media items, documents, and extracted links.
    """
    try:
        return ChatService.get_shared_content(db, user, conversation_id, q=q)
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))


@router.get("/conversations/{conversation_id}/contact-info", response_model=ContactInfoResponse)
def get_conversation_contact_info(
    conversation_id: int,
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint GET /conversations/{conversation_id}/contact-info - Retrieve contact details of conversation partner.

    Returns:
        ContactInfoResponse: Profile summary, role, mutual courses, and availability.
    """
    try:
        return ChatService.get_contact_info(db, user, conversation_id)
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@router.post("/conversations/{conversation_id}/clear")
def clear_conversation_history(
    conversation_id: int,
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint POST /conversations/{conversation_id}/clear - Clear message history for the requesting user.

    Returns:
        dict: Success status message.
    """
    try:
        return ChatService.clear_conversation_messages(db, user, conversation_id)
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))


@router.delete("/conversations/{conversation_id}")
def leave_or_archive_conversation(
    conversation_id: int,
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint POST /conversations/{conversation_id}/leave - Leave a group or archive a chat conversation.

    Returns:
        dict: Confirmation status.
    """
    if not ChatService.can_access_conversation(db, user, conversation_id):
        raise HTTPException(status_code=403, detail="Access denied.")

    mem = db.query(ConversationMemberDB).filter(
        ConversationMemberDB.conversation_id == conversation_id,
        ConversationMemberDB.user_id == user.id
    ).first()

    if mem:
        db.delete(mem)
        db.commit()

    return {"status": "success", "message": "Successfully left conversation."}


# --- MESSAGES ---

# ============================================================================
# MESSAGE CRUD, REACTIONS & FORWARDING ENDPOINTS
# ============================================================================
@router.get("/conversations/{conversation_id}/messages", response_model=List[MessageResponse])
def get_messages(
    conversation_id: int,
    limit: int = Query(50, ge=1, le=100),
    before_id: Optional[int] = Query(None),
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint GET /conversations/{conversation_id}/messages - Retrieve paginated chronological message history.

    Args:
        conversation_id: Target conversation ID.
        limit: Max number of messages (default: 50).
        before_id: Optional pagination cursor message ID.

    Returns:
        List[MessageResponse]: Message records with attachments, reactions, and forward metadata.
    """
    try:
        return ChatService.get_messages(db, user, conversation_id, limit=limit, before_id=before_id)
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))


@router.post("/messages", response_model=MessageResponse)
def send_message(
    payload: SendMessagePayload,
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint POST /conversations/{conversation_id}/messages - Send a new message within a conversation.

    Args:
        conversation_id: Target conversation ID.
        payload: MessageCreate request body (content, reply_to_id, attachments).

    Returns:
        MessageResponse: Created message record.
    """
    if not payload.content and not payload.attachment_ids:
        raise HTTPException(status_code=400, detail="Message must contain text content or attachments.")

    try:
        return ChatService.send_message(
            db=db,
            current_user=user,
            conversation_id=payload.conversation_id,
            content=payload.content or "",
            message_type=payload.message_type or "TEXT",
            reply_to_message_id=payload.reply_to_message_id,
            is_announcement=payload.is_announcement or False,
            attachment_ids=payload.attachment_ids
        )
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))


@router.patch("/messages/{message_id}", response_model=MessageResponse)
def edit_message(
    message_id: int,
    payload: EditMessagePayload,
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint PUT /messages/{message_id} - Edit the text content of a previously sent message.

    Args:
        message_id: ID of the message to update.
        payload: MessageEdit request body.

    Returns:
        MessageResponse: Updated message record.
    """
    if not payload.content.strip():
        raise HTTPException(status_code=400, detail="Content cannot be empty.")
    try:
        return ChatService.edit_message(db, user, message_id, payload.content.strip())
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@router.delete("/messages/{message_id}")
def delete_message(
    message_id: int,
    for_everyone: bool = Query(True),
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint DELETE /messages/{message_id} - Delete a message for requesting user or everyone.

    Args:
        message_id: ID of the message to delete.
        for_everyone: Boolean flag indicating global deletion.

    Returns:
        dict: Deletion confirmation status.
    """
    try:
        ChatService.delete_message(db, user, message_id, for_everyone=for_everyone)
        return {"status": "success", "message": "Message deleted."}
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@router.delete("/messages/{message_id}/me")
def delete_message_for_me(
    message_id: int,
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint POST /messages/{message_id}/delete-for-me - Hide message view for requesting user only.

    Returns:
        dict: Confirmation status.
    """
    try:
        ChatService.delete_message(db, user, message_id, for_everyone=False)
        return {"status": "success", "message": "Message deleted for me."}
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@router.delete("/messages/{message_id}/everyone")
def delete_message_for_everyone(
    message_id: int,
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint POST /messages/{message_id}/delete-for-everyone - Soft-delete message globally for all members.

    Returns:
        dict: Confirmation status.
    """
    try:
        ChatService.delete_message(db, user, message_id, for_everyone=True)
        return {"status": "success", "message": "Message deleted for everyone."}
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@router.post("/messages/{message_id}/reactions")
def toggle_reaction(
    message_id: int,
    payload: ReactionPayload,
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint POST /messages/{message_id}/reactions - Add or remove an emoji reaction on a message.

    Args:
        message_id: ID of target message.
        payload: ReactionToggle request body (emoji).

    Returns:
        dict: Updated emoji reaction counts and participant statuses.
    """
    allowed_emojis = ["👍", "❤️", "😂", "😮", "😢", "👏", "🔥", "🎉"]
    if payload.emoji not in allowed_emojis:
        raise HTTPException(status_code=400, detail="Unsupported emoji reaction.")
    try:
        ChatService.toggle_reaction(db, user, message_id, payload.emoji)
        return {"status": "success"}
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@router.get("/forward-targets")
def get_forward_targets(
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint GET /forward-targets - Retrieve list of conversations and contacts eligible for forwarding.

    Returns:
        dict: Grouped recipients (recent chats, allowed direct contacts, groups).
    """
    try:
        return ChatService.get_forward_targets(db, user)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/messages/forward")
def batch_forward_messages(
    payload: ForwardMessagePayload,
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint POST /messages/batch-forward - Forward multiple messages simultaneously to multiple target conversations.

    Args:
        payload: BatchForwardRequest (message_ids, target_conversation_ids).

    Returns:
        dict: Forwarding operation result metrics.
    """
    if not payload.target_conversation_ids and not getattr(payload, "target_user_ids", None):
        raise HTTPException(status_code=400, detail="At least one target conversation or user required.")
    if not payload.message_ids:
        raise HTTPException(status_code=400, detail="Message IDs required for forwarding.")

    try:
        result = ChatService.forward_message(
            db=db,
            current_user=user,
            target_conversation_ids=payload.target_conversation_ids,
            target_user_ids=getattr(payload, "target_user_ids", None),
            message_ids=payload.message_ids
        )
        return result
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@router.post("/messages/{message_id}/forward")
def forward_message(
    message_id: int,
    payload: ForwardMessagePayload,
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint POST /messages/{message_id}/forward - Forward a single message to target conversations.

    Args:
        message_id: ID of the message to forward.
        payload: ForwardRequest (target_conversation_ids).

    Returns:
        List[MessageResponse]: Newly created forwarded message records.
    """
    if not payload.target_conversation_ids and not getattr(payload, "target_user_ids", None):
        raise HTTPException(status_code=400, detail="Target conversation or user IDs required.")

    msg_ids = payload.message_ids or [message_id]

    try:
        result = ChatService.forward_message(
            db=db,
            current_user=user,
            message_id=message_id,
            target_conversation_ids=payload.target_conversation_ids,
            target_user_ids=getattr(payload, "target_user_ids", None),
            message_ids=msg_ids
        )
        return result
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@router.post("/conversations/{conversation_id}/read")
def mark_conversation_read(
    conversation_id: int,
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint POST /conversations/{conversation_id}/read - Mark conversation as read to clear unread counters.

    Returns:
        dict: Success status.
    """
    if not ChatService.can_access_conversation(db, user, conversation_id):
        raise HTTPException(status_code=403, detail="Access denied.")
    ChatService.mark_conversation_read(db, user, conversation_id)
    return {"status": "success"}


@router.get("/conversations/{group_id}/members")
@router.get("/groups/{group_id}/members")
def get_group_members(
    group_id: int,
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint GET /conversations/{conversation_id}/members - Retrieve participant roster for a group chat.

    Returns:
        dict: Member list with roles, avatars, and online status.
    """
    try:
        return ChatService.get_group_members(db, user, group_id)
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))



# --- FILE UPLOADS & ATTACHMENTS ---

# ============================================================================
# FILE ATTACHMENTS & SEARCH ENDPOINTS
# ============================================================================
@router.post("/upload", response_model=MessageAttachmentSchema)
async def upload_chat_file(
    file: UploadFile = File(...),
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint POST /upload - Upload a file attachment for chat messages (images, PDFs, documents).

    Args:
        file: Uploaded file multipart payload.

    Returns:
        dict: Attachment metadata (file_url, file_name, file_size, file_type).

    Error handling:
        Validates file extensions and size limit (max 25MB). Raises HTTPException(400) on violations.
    """
    _, _, _, _, _, _, BASE_DIR = _get_main_deps()

    # Safe validation
    allowed_extensions = {
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4", ".webm",
        ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".txt", ".zip", ".rar",
        ".json", ".py", ".js", ".html", ".css", ".c", ".cpp", ".java"
    }
    filename = file.filename or "attachment"
    file_ext = Path(filename).suffix.lower()

    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"Unsupported file format '{file_ext}'. Allowed formats include images, videos, documents, PDFs, ZIP archives, and code files.")

    chat_upload_dir = BASE_DIR / "uploads" / "chat_files"
    chat_upload_dir.mkdir(parents=True, exist_ok=True)

    # Safe server filename
    safe_name = f"{uuid.uuid4().hex}{file_ext}"
    dest_path = chat_upload_dir / safe_name

    contents = await file.read()
    file_size = len(contents)

    # Max 25 MB
    if file_size > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds maximum limit of 25MB.")

    with open(dest_path, "wb") as f:
        f.write(contents)

    rel_path = f"/uploads/chat_files/{safe_name}"
    now_str = ChatService.now_str()

    attachment = MessageAttachmentDB(
        message_id=0,  # placeholder until message sent
        file_name=filename,
        file_path=rel_path,
        file_type=file.content_type or file_ext[1:],
        file_size=file_size,
        created_at=now_str
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)

    return MessageAttachmentSchema(
        id=attachment.id,
        message_id=0,
        file_name=attachment.file_name,
        file_path=attachment.file_path,
        file_type=attachment.file_type,
        file_size=attachment.file_size,
        created_at=attachment.created_at,
        download_url=f"/chat/files/{attachment.id}"
    )


@router.get("/files/{attachment_id}")
def download_chat_file(
    attachment_id: int,
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint GET /attachments/{attachment_id}/download - Stream a secure attachment file to authorized users.

    Args:
        attachment_id: ID of the attachment record.

    Returns:
        FileResponse: File stream with proper Content-Disposition header.
    """
    _, get_current_user_fn, _, _, _, _, BASE_DIR = _get_main_deps()
    user = get_current_user_fn(token=token, authorization=authorization, db=db)

    att = db.query(MessageAttachmentDB).filter(MessageAttachmentDB.id == attachment_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="File not found.")

    if att.message_id > 0:
        msg = db.query(MessageDB).filter(MessageDB.id == att.message_id).first()
        if msg:
            if msg.is_deleted or msg.deleted_for_everyone:
                raise HTTPException(status_code=404, detail="File is no longer accessible.")
            user_del = db.query(MessageUserDeletionDB).filter(
                MessageUserDeletionDB.message_id == msg.id,
                MessageUserDeletionDB.user_id == user.id
            ).first()
            if user_del:
                raise HTTPException(status_code=404, detail="File is no longer accessible.")
            if not ChatService.can_access_conversation(db, user, msg.conversation_id):
                raise HTTPException(status_code=403, detail="Access denied to file attachment.")

    full_path = BASE_DIR / att.file_path.lstrip("/")
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File content not found on server.")

    return FileResponse(path=full_path, filename=att.file_name, media_type=att.file_type)


# --- CONTACTS & GROUPS MANAGEMENT ---

@router.get("/allowed-contacts", response_model=List[AllowedContact])
def get_allowed_contacts(
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint GET /allowed-contacts - Retrieve role-filtered list of users that can be direct messaged.

    Returns:
        List[AllowedContact]: Catalog of eligible messaging contacts.
    """
    return ChatService.get_allowed_contacts(db, user)


@router.post("/conversations/{conversation_id}/pin")
def toggle_pin_conversation(
    conversation_id: int,
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint POST /conversations/{conversation_id}/pin - Pin or unpin a conversation to top of inbox.

    Returns:
        dict: Updated pin status.
    """
    mem = db.query(ConversationMemberDB).filter(
        ConversationMemberDB.conversation_id == conversation_id,
        ConversationMemberDB.user_id == user.id
    ).first()

    if not mem:
        raise HTTPException(status_code=404, detail="Membership not found.")

    mem.is_pinned = 0 if mem.is_pinned else 1
    db.commit()
    return {"status": "success", "is_pinned": bool(mem.is_pinned)}


@router.post("/conversations/{conversation_id}/mute")
def toggle_mute_conversation(
    conversation_id: int,
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint POST /conversations/{conversation_id}/mute - Mute or unmute notification sounds for a conversation.

    Returns:
        dict: Updated mute status.
    """
    mem = db.query(ConversationMemberDB).filter(
        ConversationMemberDB.conversation_id == conversation_id,
        ConversationMemberDB.user_id == user.id
    ).first()

    if not mem:
        raise HTTPException(status_code=404, detail="Membership not found.")

    mem.is_muted = 0 if mem.is_muted else 1
    db.commit()
    return {"status": "success", "is_muted": bool(mem.is_muted)}


@router.get("/search")
def search_chat(
    q: str = Query(..., min_length=1),
    user=Depends(authenticate_user),
    db: Session = Depends(get_db_session)
):
    """
    Endpoint GET /search - Search messages and conversation titles matching query string.

    Args:
        q: Search query keyword string.

    Returns:
        dict: Search results grouped by messages and conversations.
    """
    query_str = f"%{q.strip()}%"

    # User's accessible conversations
    my_convs = ChatService.get_user_conversations(db, user)
    conv_ids = [c.id for c in my_convs]

    if not conv_ids:
        return {"messages": [], "conversations": []}

    # Search messages
    matching_msgs = db.query(MessageDB).filter(
        MessageDB.conversation_id.in_(conv_ids),
        MessageDB.content.ilike(query_str),
        MessageDB.is_deleted == 0
    ).order_by(MessageDB.id.desc()).limit(20).all()

    msg_results = []
    for m in matching_msgs:
        conv = next((c for c in my_convs if c.id == m.conversation_id), None)
        msg_results.append({
            "id": m.id,
            "conversation_id": m.conversation_id,
            "conversation_title": conv.title if conv else "Chat",
            "sender_name": m.sender_name,
            "content": m.content,
            "created_at": m.created_at
        })

    # Search conversations
    conv_results = [
        {
            "id": c.id,
            "title": c.title,
            "type": c.type,
            "unread_count": c.unread_count
        } for c in my_convs if q.lower() in c.title.lower() or (c.course_title and q.lower() in c.course_title.lower())
    ]

    return {
        "messages": msg_results,
        "conversations": conv_results
    }


# --- WEBSOCKET ENGINE ---

@router.websocket("/ws")
async def websocket_chat_endpoint(websocket: WebSocket, token: Optional[str] = Query(None)):
    """
    WebSocket endpoint /ws/{user_id} - Real-time bidirectional messaging and presence connection.

    Args:
        websocket: FastAPI WebSocket instance.
        user_id: ID of connecting user.

    Purpose:
        Handles instant message delivery, typing indicators, read receipts, and presence updates.
    """
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    get_db, get_current_user_fn, UserDB, SessionLocal, SECRET_KEY, ALGORITHM, _ = _get_main_deps()

    user_id = None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if not email:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        db = SessionLocal()
        try:
            user = db.query(UserDB).filter(UserDB.email == email).first()
            if not user or getattr(user, "is_active", 1) == 0:
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return
            user_id = user.id
            user_name = user.full_name
        finally:
            db.close()

    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await chat_ws_manager.connect(user_id, websocket)

    try:
        while True:
            data = await websocket.receive_json()
            event_type = data.get("type")
            event_data = data.get("data", {})

            if event_type == "PING":
                await websocket.send_json({"type": "PONG"})

            elif event_type == "TYPING":
                conv_id = event_data.get("conversation_id")
                is_typing = event_data.get("is_typing", False)
                if conv_id:
                    db = SessionLocal()
                    try:
                        all_members = db.query(ConversationMemberDB.user_id).filter(ConversationMemberDB.conversation_id == conv_id).all()
                        member_uids = [m[0] for m in all_members]
                        await chat_ws_manager.send_typing_indicator(conv_id, member_uids, user_id, user_name, is_typing)
                    finally:
                        db.close()

    except WebSocketDisconnect:
        chat_ws_manager.disconnect(user_id, websocket)
    except Exception as e:
        print(f"[ChatWS Loop Error] {e}")
        chat_ws_manager.disconnect(user_id, websocket)
