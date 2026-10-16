import asyncio
import re
from datetime import datetime
from typing import Dict, List, Optional, Set, Any
from collections import defaultdict
from fastapi import WebSocket
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_

try:
    from app.models.chat import (
        ConversationDB, ConversationMemberDB, MessageDB,
        MessageReactionDB, MessageAttachmentDB, MessageForwardDB, MessageUserDeletionDB
    )
    from app.schemas.chat import (
        MessageResponse, ConversationResponse, UserSummary,
        MessageReactionSchema, MessageAttachmentSchema, AllowedContact,
        SharedMediaItem, SharedDocItem, SharedLinkItem, SharedContentResponse, ContactInfoResponse
    )
    from app.services.notification_service import NotificationService, ws_manager as notif_ws_manager
except ImportError:
    try:
        from models.chat import (
            ConversationDB, ConversationMemberDB, MessageDB,
            MessageReactionDB, MessageAttachmentDB, MessageForwardDB, MessageUserDeletionDB
        )
        from schemas.chat import (
            MessageResponse, ConversationResponse, UserSummary,
            MessageReactionSchema, MessageAttachmentSchema, AllowedContact,
            SharedMediaItem, SharedDocItem, SharedLinkItem, SharedContentResponse, ContactInfoResponse
        )
        from services.notification_service import NotificationService, ws_manager as notif_ws_manager
    except ImportError:
        from backend.app.models.chat import (
            ConversationDB, ConversationMemberDB, MessageDB,
            MessageReactionDB, MessageAttachmentDB, MessageForwardDB, MessageUserDeletionDB
        )
        from backend.app.schemas.chat import (
            MessageResponse, ConversationResponse, UserSummary,
            MessageReactionSchema, MessageAttachmentSchema, AllowedContact,
            SharedMediaItem, SharedDocItem, SharedLinkItem, SharedContentResponse, ContactInfoResponse
        )
        from backend.app.services.notification_service import NotificationService, ws_manager as notif_ws_manager



# ============================================================================
# ASYNC DISPATCH & ORM MODEL HELPERS
# ============================================================================
def safe_dispatch_coroutine(coro):
    """
    Safely dispatches an asynchronous coroutine from either sync or async context.

    Args:
        coro: The async coroutine object to execute.

    Returns:
        None. Dispatches execution to the event loop.

    Purpose:
        Enables synchronous database handlers to trigger real-time WebSocket broadcasts
        without blocking request execution or failing if no loop is running.

    Dependencies:
        asyncio.get_running_loop, asyncio.new_event_loop.

    Error handling:
        Catches and logs any dispatch warnings without interrupting caller execution.
    """
    try:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            loop.create_task(coro)
        else:
            new_loop = asyncio.new_event_loop()
            new_loop.run_until_complete(coro)
            new_loop.close()
    except Exception as err:
        print(f"[Chat Async Dispatch Warning] {err}")


def _get_core_models():
    """
    Dynamically imports and retrieves core SQLAlchemy ORM models.

    Returns:
        Tuple of (UserDB, ProfileDB, CourseDB, EnrollmentDB).

    Purpose:
        Prevents circular import dependencies between chat services and core database models.

    Dependencies:
        app.main / main / backend.app.main.

    Error handling:
        Falls back across various relative and absolute package import paths.
    """
    try:
        from app.main import UserDB, ProfileDB, CourseDB, EnrollmentDB
    except ImportError:
        try:
            from main import UserDB, ProfileDB, CourseDB, EnrollmentDB
        except ImportError:
            from backend.app.main import UserDB, ProfileDB, CourseDB, EnrollmentDB
    return UserDB, ProfileDB, CourseDB, EnrollmentDB


# ============================================================================
# REAL-TIME WEBSOCKET CONNECTION & EVENT BROADCASTER
# ============================================================================
class ChatWebSocketManager:
    """Manages WebSocket connections and real-time event routing for chat."""

    def __init__(self):
        """
        Initialize the WebSocket connection manager.

        Purpose:
            Maintains the registry of active WebSocket sockets and online user states.
        """
        self.active_connections: Dict[int, List[WebSocket]] = defaultdict(list)
        self.online_users: Set[int] = set()

    async def connect(self, user_id: int, websocket: WebSocket):
        """
        Register an incoming WebSocket connection for an authenticated user.

        Args:
            user_id: Unique database ID of the user connecting.
            websocket: Active FastAPI WebSocket instance.

        Returns:
            None. Accepts the connection and updates active tracking.

        Purpose:
            Registers new socket instances and broadcasts online presence to connected peers.

        Dependencies:
            self.broadcast_presence, self.active_connections.

        Error handling:
            Propagates connection handshake exceptions to caller.
        """
        await websocket.accept()
        self.active_connections[user_id].append(websocket)
        self.online_users.add(user_id)
        print(f"[ChatWS] User {user_id} connected. Active connections: {len(self.active_connections[user_id])}")
        await self.broadcast_presence(user_id, is_online=True)

    def disconnect(self, user_id: int, websocket: WebSocket):
        """
        Deregister a terminating WebSocket connection.

        Args:
            user_id: Unique database ID of the user disconnecting.
            websocket: Terminating FastAPI WebSocket instance.

        Returns:
            None. Removes socket and broadcasts offline presence if no active connections remain.

        Purpose:
            Cleans up dead socket handles and manages real-time user presence state.

        Dependencies:
            self.broadcast_presence, safe_dispatch_coroutine.
        """
        if websocket in self.active_connections[user_id]:
            self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
                self.online_users.discard(user_id)
                print(f"[ChatWS] User {user_id} offline.")
                safe_dispatch_coroutine(self.broadcast_presence(user_id, is_online=False))

    def is_user_online(self, user_id: int) -> bool:
        """
        Check whether a specific user currently has an active WebSocket session.

        Args:
            user_id: Unique database ID of the target user.

        Returns:
            bool: True if user has at least one active socket connection, False otherwise.
        """
        return user_id in self.online_users and len(self.active_connections.get(user_id, [])) > 0

    async def broadcast_to_users(self, user_ids: List[int], event_payload: dict):
        """
        Broadcast a real-time JSON event payload to a list of target user IDs.

        Args:
            user_ids: List of target user database IDs to receive the payload.
            event_payload: Dictionary containing the event type and message data.

        Returns:
            None. Dispatches messages asynchronously.

        Purpose:
            Delivers instant message alerts, read receipts, and status updates to online users.

        Dependencies:
            WebSocket.send_json, self.disconnect.

        Error handling:
            Detects dead or disconnected sockets, automatically pruning them from the pool.
        """
        for uid in user_ids:
            if uid in self.active_connections:
                dead_sockets = []
                for ws in list(self.active_connections[uid]):
                    try:
                        await ws.send_json(event_payload)
                    except Exception as e:
                        print(f"[ChatWS] Error pushing to user {uid}: {e}")
                        dead_sockets.append(ws)
                for ds in dead_sockets:
                    self.disconnect(uid, ds)

    async def broadcast_presence(self, user_id: int, is_online: bool):
        """
        Broadcast user online/offline status transition to all connected peers.

        Args:
            user_id: Database ID of the user whose status changed.
            is_online: Boolean flag indicating online (True) or offline (False) status.

        Returns:
            None.

        Purpose:
            Keeps peer contact lists and conversation headers updated with live availability.
        """
        payload = {
            "type": "USER_PRESENCE",
            "data": {
                "user_id": user_id,
                "is_online": is_online,
                "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            }
        }
        all_connected = list(self.active_connections.keys())
        await self.broadcast_to_users(all_connected, payload)

    async def send_typing_indicator(self, conversation_id: int, member_user_ids: List[int], sender_id: int, sender_name: str, is_typing: bool):
        """
        Broadcast a typing indicator status event to conversation participants.

        Args:
            conversation_id: ID of the active conversation.
            member_user_ids: List of participant user IDs.
            sender_id: ID of the user who is typing.
            sender_name: Display name of the typing user.
            is_typing: Boolean flag indicating typing activity state.

        Returns:
            None.

        Purpose:
            Provides real-time feedback when a peer starts or stops typing.
        """
        recipients = [uid for uid in member_user_ids if uid != sender_id]
        payload = {
            "type": "TYPING_STATUS",
            "data": {
                "conversation_id": conversation_id,
                "user_id": sender_id,
                "user_name": sender_name,
                "is_typing": is_typing
            }
        }
        await self.broadcast_to_users(recipients, payload)


chat_ws_manager = ChatWebSocketManager()


# ============================================================================
# CORE CHAT SERVICE & BUSINESS LOGIC
# ============================================================================
class ChatService:
    @staticmethod
    def now_str() -> str:
        """
        Get current UTC timestamp formatted as an ISO standard string (YYYY-MM-DD HH:MM:SS).

        Returns:
            str: UTC timestamp string.
        """
        return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

# ----------------------------------------------------------------------------
# Access Control & Group Membership Management
# ----------------------------------------------------------------------------
    @staticmethod
    def ensure_course_groups(db: Session):
        """
        Auto-create course group conversations for all published/existing courses and auto-enroll members.

        Args:
            db: Active SQLAlchemy database session.

        Returns:
            None. Synchronizes database conversation groups.

        Purpose:
            Ensures every course has a corresponding COURSE_GROUP conversation with instructors,
            enrolled students, and system administrators as members.

        Dependencies:
            CourseDB, EnrollmentDB, ConversationDB, ConversationMemberDB.

        Error handling:
            Logs group synchronization errors and allows database transaction management.
        """
        UserDB, _, CourseDB, EnrollmentDB = _get_core_models()
        now_str = ChatService.now_str()

        courses = db.query(CourseDB).all()
        admins = db.query(UserDB).filter(UserDB.role.in_(["Admin", "ADMIN", "admin"])).all()
        admin_ids = [a.id for a in admins]

        for course in courses:
            conv = db.query(ConversationDB).filter(
                ConversationDB.type == "COURSE_GROUP",
                ConversationDB.course_id == course.id
            ).first()

            group_title = f"{course.title} - Group"
            if not conv:
                conv = ConversationDB(
                    type="COURSE_GROUP",
                    course_id=course.id,
                    title=group_title,
                    description=f"Official course group chat for {course.title}.",
                    icon="fa-solid fa-graduation-cap",
                    created_at=now_str,
                    updated_at=now_str
                )
                db.add(conv)
                db.commit()
                db.refresh(conv)

            # Ensure Instructor is member
            if course.instructor_id:
                inst_mem = db.query(ConversationMemberDB).filter(
                    ConversationMemberDB.conversation_id == conv.id,
                    ConversationMemberDB.user_id == course.instructor_id
                ).first()
                if not inst_mem:
                    db.add(ConversationMemberDB(
                        conversation_id=conv.id,
                        user_id=course.instructor_id,
                        role="instructor",
                        joined_at=now_str
                    ))

            # Ensure Admins are members
            for aid in admin_ids:
                adm_mem = db.query(ConversationMemberDB).filter(
                    ConversationMemberDB.conversation_id == conv.id,
                    ConversationMemberDB.user_id == aid
                ).first()
                if not adm_mem:
                    db.add(ConversationMemberDB(
                        conversation_id=conv.id,
                        user_id=aid,
                        role="admin",
                        joined_at=now_str
                    ))

            # Ensure Enrolled Students are members
            enrollments = db.query(EnrollmentDB).filter(EnrollmentDB.course_id == course.id).all()
            for enr in enrollments:
                if enr.user_id == course.instructor_id or enr.user_id in admin_ids:
                    continue
                st_mem = db.query(ConversationMemberDB).filter(
                    ConversationMemberDB.conversation_id == conv.id,
                    ConversationMemberDB.user_id == enr.user_id
                ).first()
                if not st_mem:
                    db.add(ConversationMemberDB(
                        conversation_id=conv.id,
                        user_id=enr.user_id,
                        role="member",
                        joined_at=now_str
                    ))


        db.commit()

    @staticmethod
    def sync_student_enrollment_group(db: Session, user_id: int, course_id: int):
        """
        Add a student to the course chat group upon course enrollment.

        Args:
            db: Active SQLAlchemy database session.
            student_id: Database ID of the enrolling student.
            course_id: Database ID of the enrolled course.

        Returns:
            None.

        Purpose:
            Maintains group membership consistency whenever a student enrolls in a course.

        Dependencies:
            ConversationDB, ConversationMemberDB, EnrollmentDB.
        """
        UserDB, _, CourseDB, _ = _get_core_models()
        now_str = ChatService.now_str()

        course = db.query(CourseDB).filter(CourseDB.id == course_id).first()
        if not course:
            return

        conv = db.query(ConversationDB).filter(
            ConversationDB.type == "COURSE_GROUP",
            ConversationDB.course_id == course_id
        ).first()

        if not conv:
            conv = ConversationDB(
                type="COURSE_GROUP",
                course_id=course_id,
                title=f"{course.title} - Group",
                description=f"Official group chat for {course.title}.",
                icon="fa-solid fa-graduation-cap",
                created_at=now_str,
                updated_at=now_str
            )
            db.add(conv)
            db.commit()
            db.refresh(conv)

        mem = db.query(ConversationMemberDB).filter(
            ConversationMemberDB.conversation_id == conv.id,
            ConversationMemberDB.user_id == user_id
        ).first()

        if not mem:
            db.add(ConversationMemberDB(
                conversation_id=conv.id,
                user_id=user_id,
                role="member",
                joined_at=now_str
            ))
            db.commit()

    @staticmethod
    def can_user_message_target(db: Session, current_user, target_user) -> bool:
        """
        Verify role-based messaging permissions between two users.

        Args:
            db: Active SQLAlchemy database session.
            user_id: ID of the requesting user.
            user_role: Role of the requesting user ('Student', 'Instructor', 'Admin').
            target_user_id: ID of the intended recipient.

        Returns:
            Tuple[bool, str]: (is_allowed, reason_message).

        Purpose:
            Enforces platform communication policies:
            - Admins can message anyone.
            - Instructors can message enrolled students and admins.
            - Students can only message instructors of courses they are enrolled in, and admins.

        Dependencies:
            EnrollmentDB, CourseDB, UserDB.
        """
        UserDB, _, CourseDB, EnrollmentDB = _get_core_models()
        my_role = (current_user.role or "").upper()
        target_role = (target_user.role or "").upper()

        if current_user.id == target_user.id:
            return True

        if my_role == "ADMIN" or target_role == "ADMIN":
            return True

        # Student messaging Instructor: student MUST be enrolled in a course taught by instructor
        if my_role == "STUDENT" and target_role == "INSTRUCTOR":
            taught_courses = db.query(CourseDB.id).filter(CourseDB.instructor_id == target_user.id).all()
            taught_ids = [c[0] for c in taught_courses]
            if not taught_ids:
                return False
            enr_count = db.query(EnrollmentDB).filter(
                EnrollmentDB.user_id == current_user.id,
                EnrollmentDB.course_id.in_(taught_ids)
            ).count()
            return enr_count > 0

        # Student messaging Student: MUST share at least one active course enrollment OR common group
        if my_role == "STUDENT" and target_role == "STUDENT":
            my_enrollments = db.query(EnrollmentDB.course_id).filter(EnrollmentDB.user_id == current_user.id).all()
            my_cids = set([e[0] for e in my_enrollments])
            if my_cids:
                target_enrollments = db.query(EnrollmentDB.course_id).filter(EnrollmentDB.user_id == target_user.id).all()
                target_cids = set([e[0] for e in target_enrollments])
                if len(my_cids.intersection(target_cids)) > 0:
                    return True

            # Also verify if they share any common group conversation
            shared_group = db.query(ConversationMemberDB.conversation_id).filter(
                ConversationMemberDB.user_id == current_user.id
            ).filter(
                ConversationMemberDB.conversation_id.in_(
                    db.query(ConversationMemberDB.conversation_id).filter(
                        ConversationMemberDB.user_id == target_user.id
                    )
                )
            ).first()
            if shared_group:
                return True

            return False

        # Instructor messaging Student: instructor MUST teach at least one course the student is enrolled in
        if my_role == "INSTRUCTOR" and target_role == "STUDENT":
            my_courses = db.query(CourseDB.id).filter(CourseDB.instructor_id == current_user.id).all()
            my_course_ids = [c[0] for c in my_courses]
            if my_course_ids:
                enr_count = db.query(EnrollmentDB).filter(
                    EnrollmentDB.user_id == target_user.id,
                    EnrollmentDB.course_id.in_(my_course_ids)
                ).count()
                if enr_count > 0:
                    return True

            shared_group = db.query(ConversationMemberDB.conversation_id).filter(
                ConversationMemberDB.user_id == current_user.id
            ).filter(
                ConversationMemberDB.conversation_id.in_(
                    db.query(ConversationMemberDB.conversation_id).filter(
                        ConversationMemberDB.user_id == target_user.id
                    )
                )
            ).first()
            if shared_group:
                return True

            return False

        # General shared group member check (e.g. Instructor/Instructor or Custom Group)
        shared_group = db.query(ConversationMemberDB.conversation_id).filter(
            ConversationMemberDB.user_id == current_user.id
        ).filter(
            ConversationMemberDB.conversation_id.in_(
                db.query(ConversationMemberDB.conversation_id).filter(
                    ConversationMemberDB.user_id == target_user.id
                )
            )
        ).first()
        if shared_group:
            return True

        return False

    @staticmethod
    def can_access_conversation(db: Session, current_user, conversation_id: int) -> bool:
        """
        Verify whether a user is an authorized participant of a conversation.

        Args:
            db: Active SQLAlchemy database session.
            user_id: Database ID of the user requesting access.
            conversation_id: Target conversation ID.

        Returns:
            bool: True if authorized, False otherwise.

        Purpose:
            Guards conversation endpoints against unauthorized viewing or message injection.

        Dependencies:
            ConversationMemberDB.
        """
        UserDB, _, CourseDB, EnrollmentDB = _get_core_models()
        my_role = (current_user.role or "").upper()

        if my_role == "ADMIN":
            return True

        conv = db.query(ConversationDB).filter(ConversationDB.id == conversation_id).first()
        if not conv:
            return False

        # Check membership table
        member = db.query(ConversationMemberDB).filter(
            ConversationMemberDB.conversation_id == conversation_id,
            ConversationMemberDB.user_id == current_user.id
        ).first()

        if member:
            return True

        # For course groups, auto-grant access if user is enrolled student or instructor
        if conv.type == "COURSE_GROUP" and conv.course_id:
            course = db.query(CourseDB).filter(CourseDB.id == conv.course_id).first()
            if course:
                if course.instructor_id == current_user.id:
                    return True
                enr = db.query(EnrollmentDB).filter(
                    EnrollmentDB.user_id == current_user.id,
                    EnrollmentDB.course_id == conv.course_id
                ).first()
                if enr:
                    return True

        return False

    @staticmethod
    def get_allowed_contacts(db: Session, current_user) -> List[AllowedContact]:
        """
        Retrieve list of users that the current user is permitted to direct-message.

        Args:
            db: Active SQLAlchemy database session.
            current_user_id: ID of the user requesting contacts.
            current_user_role: Role of the user requesting contacts.

        Returns:
            List[AllowedContact]: Catalog of eligible contacts with role, avatar, and course context.

        Purpose:
            Populates the 'New Direct Chat' contact selection modal based on role rules.

        Dependencies:
            UserDB, ProfileDB, CourseDB, EnrollmentDB.
        """
        UserDB, ProfileDB, CourseDB, EnrollmentDB = _get_core_models()
        my_role = (current_user.role or "").upper()
        res = []

        if my_role == "ADMIN":
            # Admin can message all active users except self
            users = db.query(UserDB).filter(UserDB.id != current_user.id, UserDB.is_active == 1).all()
            for u in users:
                prof = db.query(ProfileDB).filter(ProfileDB.user_id == u.id).first()
                res.append(AllowedContact(
                    id=u.id,
                    full_name=u.full_name,
                    email=u.email,
                    role=u.role,
                    profile_image=prof.profile_image if prof else None,
                    course_title="Platform User"
                ))

        elif my_role == "STUDENT":
            # 1. Admins
            admins = db.query(UserDB).filter(UserDB.role.in_(["Admin", "ADMIN", "admin"]), UserDB.is_active == 1).all()
            for a in admins:
                prof = db.query(ProfileDB).filter(ProfileDB.user_id == a.id).first()
                res.append(AllowedContact(
                    id=a.id,
                    full_name=a.full_name,
                    email=a.email,
                    role="Admin",
                    profile_image=prof.profile_image if prof else None,
                    course_title="SmartLearn Administration"
                ))

            # 2. Instructors of enrolled courses
            my_enrollments = db.query(EnrollmentDB).filter(EnrollmentDB.user_id == current_user.id).all()
            enrolled_course_ids = [e.course_id for e in my_enrollments]
            if enrolled_course_ids:
                courses = db.query(CourseDB).filter(CourseDB.id.in_(enrolled_course_ids)).all()
                instructor_ids = [c.instructor_id for c in courses if c.instructor_id]
                course_map = {c.instructor_id: c.title for c in courses if c.instructor_id}
                
                instructors = db.query(UserDB).filter(UserDB.id.in_(instructor_ids), UserDB.is_active == 1).all()
                for inst in instructors:
                    prof = db.query(ProfileDB).filter(ProfileDB.user_id == inst.id).first()
                    res.append(AllowedContact(
                        id=inst.id,
                        full_name=inst.full_name,
                        email=inst.email,
                        role="Instructor",
                        profile_image=prof.profile_image if prof else None,
                        course_title=course_map.get(inst.id, "Enrolled Course")
                    ))

            # 3. Students sharing at least one enrolled course
            if enrolled_course_ids:
                shared_enrollments = db.query(EnrollmentDB).filter(
                    EnrollmentDB.course_id.in_(enrolled_course_ids),
                    EnrollmentDB.user_id != current_user.id
                ).all()
                shared_user_ids = list(set([e.user_id for e in shared_enrollments]))

                course_title_map = {}
                for e in shared_enrollments:
                    c = db.query(CourseDB).filter(CourseDB.id == e.course_id).first()
                    if c:
                        course_title_map[e.user_id] = c.title

                shared_students = db.query(UserDB).filter(UserDB.id.in_(shared_user_ids), UserDB.is_active == 1).all()
                for st in shared_students:
                    prof = db.query(ProfileDB).filter(ProfileDB.user_id == st.id).first()
                    res.append(AllowedContact(
                        id=st.id,
                        full_name=st.full_name,
                        email=st.email,
                        role="Student",
                        profile_image=prof.profile_image if prof else None,
                        course_title=course_title_map.get(st.id, "Shared Course")
                    ))

        elif my_role == "INSTRUCTOR":
            # 1. Admins
            admins = db.query(UserDB).filter(UserDB.role.in_(["Admin", "ADMIN", "admin"]), UserDB.is_active == 1).all()
            for a in admins:
                prof = db.query(ProfileDB).filter(ProfileDB.user_id == a.id).first()
                res.append(AllowedContact(
                    id=a.id,
                    full_name=a.full_name,
                    email=a.email,
                    role="Admin",
                    profile_image=prof.profile_image if prof else None,
                    course_title="SmartLearn Administration"
                ))

            # 2. Students enrolled in taught courses
            my_courses = db.query(CourseDB).filter(CourseDB.instructor_id == current_user.id).all()
            my_course_ids = [c.id for c in my_courses]
            if my_course_ids:
                enrollments = db.query(EnrollmentDB).filter(EnrollmentDB.course_id.in_(my_course_ids)).all()
                student_ids = list(set([e.user_id for e in enrollments]))
                
                # Map student -> course title
                st_course_map = {}
                for e in enrollments:
                    c = next((crs for crs in my_courses if crs.id == e.course_id), None)
                    if c:
                        st_course_map[e.user_id] = c.title

                students = db.query(UserDB).filter(UserDB.id.in_(student_ids), UserDB.is_active == 1).all()
                for st in students:
                    prof = db.query(ProfileDB).filter(ProfileDB.user_id == st.id).first()
                    res.append(AllowedContact(
                        id=st.id,
                        full_name=st.full_name,
                        email=st.email,
                        role="Student",
                        profile_image=prof.profile_image if prof else None,
                        course_title=st_course_map.get(st.id, "Course Student")
                    ))

        # Filter duplicates by id
        unique_contacts = {}
        for c in res:
            if c.id not in unique_contacts:
                unique_contacts[c.id] = c
        return list(unique_contacts.values())

# ----------------------------------------------------------------------------
# Conversation Lifecycle & Retrieval
# ----------------------------------------------------------------------------
    @staticmethod
    def get_or_create_self_conversation(db: Session, current_user) -> ConversationDB:
        """
        Retrieve or initialize a private 'Notes to Self' / Saved Messages conversation.

        Args:
            db: Active SQLAlchemy database session.
            user_id: Database ID of the user.

        Returns:
            ConversationDB: Active self-chat conversation record.

        Purpose:
            Allows users to take personal learning notes, bookmark links, and draft messages.

        Dependencies:
            ConversationDB, ConversationMemberDB.
        """
        now_str = ChatService.now_str()

        # Find existing PERSONAL conversation where current_user is the sole member
        my_mems = db.query(ConversationMemberDB.conversation_id).filter(
            ConversationMemberDB.user_id == current_user.id
        ).all()
        my_conv_ids = [m[0] for m in my_mems]

        if my_conv_ids:
            personal_convs = db.query(ConversationDB).filter(
                ConversationDB.id.in_(my_conv_ids),
                ConversationDB.type == "PERSONAL"
            ).all()

            for conv in personal_convs:
                mems = db.query(ConversationMemberDB.user_id).filter(
                    ConversationMemberDB.conversation_id == conv.id
                ).all()
                mem_uids = [m[0] for m in mems]
                if set(mem_uids) == {current_user.id}:
                    return conv

        # Create new self conversation
        conv = ConversationDB(
            type="PERSONAL",
            title="Myself",
            description="Message yourself • Saved Messages",
            icon="fa-solid fa-user-gear",
            created_by=current_user.id,
            created_at=now_str,
            updated_at=now_str
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)

        db.add(ConversationMemberDB(
            conversation_id=conv.id,
            user_id=current_user.id,
            role="member",
            joined_at=now_str
        ))
        db.commit()

        return conv

    @staticmethod
    def get_or_create_personal_conversation(db: Session, current_user, target_user_id: int) -> ConversationDB:
        """
        Retrieve or initialize a direct 1-on-1 personal conversation between two users.

        Args:
            db: Active SQLAlchemy database session.
            current_user: UserDB model instance of the initiating user.
            target_user_id: ID of the recipient user.

        Returns:
            ConversationDB: Persistent direct conversation record.

        Purpose:
            Checks permissions and finds existing direct conversation or initializes a new one.

        Dependencies:
            can_user_message_target, ConversationDB, ConversationMemberDB.

        Error handling:
            Raises ValueError if messaging policy is violated.
        """
        if target_user_id == current_user.id:
            return ChatService.get_or_create_self_conversation(db, current_user)

        UserDB, _, _, _ = _get_core_models()
        target_user = db.query(UserDB).filter(UserDB.id == target_user_id).first()
        if not target_user:
            raise ValueError("Target user not found.")

        if not ChatService.can_user_message_target(db, current_user, target_user):
            raise PermissionError("You do not have permission to message this user.")

        now_str = ChatService.now_str()

        # Find existing PERSONAL conversation containing both users
        my_mems = db.query(ConversationMemberDB.conversation_id).filter(ConversationMemberDB.user_id == current_user.id).all()
        target_mems = db.query(ConversationMemberDB.conversation_id).filter(ConversationMemberDB.user_id == target_user_id).all()
        common_ids = list(set([m[0] for m in my_mems]).intersection(set([m[0] for m in target_mems])))

        if common_ids:
            for cid in common_ids:
                conv = db.query(ConversationDB).filter(ConversationDB.id == cid, ConversationDB.type == "PERSONAL").first()
                if conv:
                    mems = db.query(ConversationMemberDB.user_id).filter(ConversationMemberDB.conversation_id == conv.id).all()
                    mem_uids = set([m[0] for m in mems])
                    if mem_uids == {current_user.id, target_user_id}:
                        return conv

        # Create new personal conversation
        conv = ConversationDB(
            type="PERSONAL",
            created_by=current_user.id,
            created_at=now_str,
            updated_at=now_str
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)

        # Add both members
        db.add(ConversationMemberDB(conversation_id=conv.id, user_id=current_user.id, role="member", joined_at=now_str))
        db.add(ConversationMemberDB(conversation_id=conv.id, user_id=target_user_id, role="member", joined_at=now_str))
        db.commit()

        return conv

    @staticmethod
    def get_user_conversations(db: Session, current_user) -> List[ConversationResponse]:
        """
        Retrieve all active conversations for a user with unread counts and last message details.

        Args:
            db: Active SQLAlchemy database session.
            user_id: Database ID of the requesting user.

        Returns:
            List[ConversationResponse]: Sorted list of conversations (pinned first, then recent).

        Purpose:
            Powers the chat sidebar inbox interface with avatars, snippet previews, and counters.

        Dependencies:
            ConversationMemberDB, MessageDB, MessageReactionDB, chat_ws_manager.
        """
        ChatService.ensure_course_groups(db)
        UserDB, ProfileDB, CourseDB, _ = _get_core_models()

        # Fetch membership entries for current user
        memberships = db.query(ConversationMemberDB).filter(ConversationMemberDB.user_id == current_user.id).all()
        mem_map = {m.conversation_id: m for m in memberships}
        conv_ids = list(mem_map.keys())

        # Admins also see all course and custom groups even if not explicitly listed
        my_role = (current_user.role or "").upper()
        if my_role == "ADMIN":
            all_groups = db.query(ConversationDB.id).filter(ConversationDB.type != "PERSONAL").all()
            for g in all_groups:
                if g[0] not in conv_ids:
                    conv_ids.append(g[0])

        if not conv_ids:
            return []

        conversations = db.query(ConversationDB).filter(ConversationDB.id.in_(conv_ids)).order_by(ConversationDB.updated_at.desc()).all()

        res = []
        for conv in conversations:
            mem = mem_map.get(conv.id)
            is_muted = bool(mem.is_muted) if mem else False
            is_pinned = bool(mem.is_pinned) if mem else False
            last_read_id = mem.last_read_message_id if mem else 0

            # User deletions filter
            user_deleted_ids = set(
                row[0] for row in db.query(MessageUserDeletionDB.message_id).filter(
                    MessageUserDeletionDB.user_id == current_user.id
                ).all()
            )

            # Last message query
            last_msg_query = db.query(MessageDB).filter(
                MessageDB.conversation_id == conv.id
            )
            if user_deleted_ids:
                last_msg_query = last_msg_query.filter(~MessageDB.id.in_(user_deleted_ids))
            last_msg_db = last_msg_query.order_by(MessageDB.id.desc()).first()

            last_msg_schema = None
            if last_msg_db:
                sender = db.query(UserDB).filter(UserDB.id == last_msg_db.sender_id).first()
                prof = db.query(ProfileDB).filter(ProfileDB.user_id == last_msg_db.sender_id).first() if sender else None
                
                is_del = bool(last_msg_db.is_deleted or last_msg_db.deleted_for_everyone)
                last_msg_content = "This message was deleted" if is_del else (last_msg_db.content or "")
                
                last_msg_schema = MessageResponse(
                    id=last_msg_db.id,
                    conversation_id=last_msg_db.conversation_id,
                    sender_id=last_msg_db.sender_id,
                    sender_name=sender.full_name if sender else "User",
                    sender_role=sender.role if sender else "User",
                    sender_avatar=prof.profile_image if prof else None,
                    message_type=last_msg_db.message_type,
                    content=last_msg_content,
                    is_edited=bool(last_msg_db.is_edited) if not is_del else False,
                    is_deleted=is_del,
                    deleted_for_everyone=bool(last_msg_db.deleted_for_everyone),
                    deleted_at=last_msg_db.deleted_at,
                    deleted_by=last_msg_db.deleted_by,
                    created_at=last_msg_db.created_at
                )

            # Unread count
            unread_query = db.query(MessageDB).filter(
                MessageDB.conversation_id == conv.id,
                MessageDB.sender_id != current_user.id
            )
            if last_read_id:
                unread_query = unread_query.filter(MessageDB.id > last_read_id)
            if user_deleted_ids:
                unread_query = unread_query.filter(~MessageDB.id.in_(user_deleted_ids))
            unread_count = unread_query.count()

            # Members
            member_records = db.query(ConversationMemberDB).filter(ConversationMemberDB.conversation_id == conv.id).all()
            m_uids = [m.user_id for m in member_records]
            members_db = db.query(UserDB).filter(UserDB.id.in_(m_uids)).all() if m_uids else []
            
            member_summaries = []
            for u in members_db:
                prof = db.query(ProfileDB).filter(ProfileDB.user_id == u.id).first()
                member_summaries.append(UserSummary(
                    id=u.id,
                    full_name=u.full_name,
                    email=u.email,
                    role=u.role,
                    profile_image=prof.profile_image if prof else None,
                    is_online=chat_ws_manager.is_user_online(u.id)
                ))

            # Group vs Personal naming
            conv_title = conv.title or "Conversation"
            conv_desc = conv.description
            course_title = None
            other_user_summary = None

            if conv.type == "COURSE_GROUP" and conv.course_id:
                crs = db.query(CourseDB).filter(CourseDB.id == conv.course_id).first()
                if crs:
                    course_title = crs.title
                    conv_title = f"{crs.title} - Group"

            elif conv.type == "PERSONAL":
                # Find the other member
                other_mem = next((m for m in member_records if m.user_id != current_user.id), None)
                if other_mem:
                    other_u = db.query(UserDB).filter(UserDB.id == other_mem.user_id).first()
                    if other_u:
                        prof = db.query(ProfileDB).filter(ProfileDB.user_id == other_u.id).first()
                        conv_title = other_u.full_name
                        other_user_summary = UserSummary(
                            id=other_u.id,
                            full_name=other_u.full_name,
                            email=other_u.email,
                            role=other_u.role,
                            profile_image=prof.profile_image if prof else None,
                            is_online=chat_ws_manager.is_user_online(other_u.id)
                        )
                else:
                    prof = db.query(ProfileDB).filter(ProfileDB.user_id == current_user.id).first()
                    conv_title = "Myself"
                    conv_desc = "Message yourself • Saved Messages"
                    other_user_summary = UserSummary(
                        id=current_user.id,
                        full_name=f"{current_user.full_name} (You)",
                        email=current_user.email,
                        role=current_user.role,
                        profile_image=prof.profile_image if prof else None,
                        is_online=True
                    )

            res.append(ConversationResponse(
                id=conv.id,
                type=conv.type,
                course_id=conv.course_id,
                course_title=course_title,
                title=conv_title,
                description=conv_desc,
                icon=conv.icon or ("fa-solid fa-users" if conv.type != "PERSONAL" else "fa-solid fa-user"),
                is_archived=bool(conv.is_archived),
                is_muted=is_muted,
                is_pinned=is_pinned,
                unread_count=unread_count,
                last_message=last_msg_schema,
                other_user=other_user_summary,
                members_count=len(member_summaries),
                members=member_summaries,
                created_at=conv.created_at,
                updated_at=conv.updated_at
            ))

        # Sort pinned first, then by updated_at
        res.sort(key=lambda c: (1 if c.is_pinned else 0, c.updated_at or ""), reverse=True)
        return res

# ----------------------------------------------------------------------------
# Message Transmission, Editing & Deletion
# ----------------------------------------------------------------------------
    @staticmethod
    def get_messages(db: Session, current_user, conversation_id: int, limit: int = 50, before_id: Optional[int] = None) -> List[MessageResponse]:
        """
        Retrieve paginated messages for a conversation with attachments, reactions, and forward history.

        Args:
            db: Active SQLAlchemy database session.
            conversation_id: Target conversation ID.
            user_id: ID of the viewing user.
            limit: Maximum number of messages to return (default: 50).
            before_id: Optional message ID for pagination cursor.

        Returns:
            List[MessageResponse]: Chronological message history.

        Purpose:
            Renders message history in the conversation pane, filtering out soft-deleted items.

        Dependencies:
            MessageDB, MessageAttachmentDB, MessageReactionDB, MessageForwardDB.
        """
        if not ChatService.can_access_conversation(db, current_user, conversation_id):
            raise PermissionError("Access denied to conversation.")

        UserDB, ProfileDB, _, _ = _get_core_models()

        # Fetch per-user deletions for current_user
        deleted_msg_ids = set(
            row[0] for row in db.query(MessageUserDeletionDB.message_id).filter(
                MessageUserDeletionDB.user_id == current_user.id
            ).all()
        )

        query = db.query(MessageDB).filter(MessageDB.conversation_id == conversation_id)
        if before_id:
            query = query.filter(MessageDB.id < before_id)
        if deleted_msg_ids:
            query = query.filter(~MessageDB.id.in_(deleted_msg_ids))

        messages = query.order_by(MessageDB.id.desc()).limit(limit).all()
        messages.reverse()  # Chronological order

        res = []
        for msg in messages:
            is_del = bool(msg.is_deleted or msg.deleted_for_everyone)

            # Reactions
            reactions_schemas = []
            if not is_del:
                reactions_db = db.query(MessageReactionDB).filter(MessageReactionDB.message_id == msg.id).all()
                for r in reactions_db:
                    u = db.query(UserDB).filter(UserDB.id == r.user_id).first()
                    reactions_schemas.append(MessageReactionSchema(
                        id=r.id,
                        message_id=r.message_id,
                        user_id=r.user_id,
                        user_name=u.full_name if u else "User",
                        emoji=r.emoji,
                        created_at=r.created_at
                    ))

            # Attachments
            attach_schemas = []
            if not is_del:
                attach_db = db.query(MessageAttachmentDB).filter(MessageAttachmentDB.message_id == msg.id).all()
                attach_schemas = [
                    MessageAttachmentSchema(
                        id=a.id,
                        message_id=a.message_id,
                        file_name=a.file_name,
                        file_path=a.file_path,
                        file_type=a.file_type,
                        file_size=a.file_size,
                        created_at=a.created_at,
                        download_url=f"/chat/files/{a.id}"
                    ) for a in attach_db
                ]

            # Reply to preview
            reply_dict = None
            if not is_del and msg.reply_to_message_id:
                reply_msg = db.query(MessageDB).filter(MessageDB.id == msg.reply_to_message_id).first()
                if reply_msg:
                    r_sender = db.query(UserDB).filter(UserDB.id == reply_msg.sender_id).first()
                    is_r_del = bool(reply_msg.is_deleted or reply_msg.deleted_for_everyone or reply_msg.id in deleted_msg_ids)
                    reply_dict = {
                        "id": reply_msg.id,
                        "sender_name": r_sender.full_name if r_sender else "User",
                        "content": "Message deleted" if is_r_del else (reply_msg.content or "Attachment")
                    }

            # Forward check
            is_forwarded = False
            if not is_del:
                is_forwarded = db.query(MessageForwardDB).filter(MessageForwardDB.forwarded_message_id == msg.id).count() > 0

            # Sender info
            sender = db.query(UserDB).filter(UserDB.id == msg.sender_id).first()
            prof = db.query(ProfileDB).filter(ProfileDB.user_id == msg.sender_id).first() if sender else None

            content_text = "This message was deleted" if is_del else (msg.content or "")

            res.append(MessageResponse(
                id=msg.id,
                conversation_id=msg.conversation_id,
                sender_id=msg.sender_id,
                sender_name=sender.full_name if sender else (msg.sender_name or "User"),
                sender_role=sender.role if sender else (msg.sender_role or "User"),
                sender_avatar=prof.profile_image if prof else None,
                message_type=msg.message_type if not is_del else "TEXT",
                content=content_text,
                is_edited=bool(msg.is_edited) if not is_del else False,
                original_content=msg.original_content if not is_del else None,
                edited_at=msg.edited_at if not is_del else None,
                reply_to_message_id=msg.reply_to_message_id if not is_del else None,
                reply_to_message=reply_dict,
                is_deleted=is_del,
                deleted_for_everyone=bool(msg.deleted_for_everyone),
                deleted_at=msg.deleted_at,
                deleted_by=msg.deleted_by,
                is_announcement=bool(msg.is_announcement) if not is_del else False,
                created_at=msg.created_at,
                reactions=reactions_schemas,
                attachments=attach_schemas,
                is_forwarded=is_forwarded,
                status="READ" if msg.sender_id == current_user.id else "DELIVERED"
            ))

        return res

    @staticmethod
    def send_message(
        db: Session,
        current_user,
        conversation_id: int,
        content: str = "",
        message_type: str = "TEXT",
        reply_to_message_id: Optional[int] = None,
        is_announcement: bool = False,
        attachment_ids: Optional[List[int]] = None
    ) -> MessageResponse:
        """
        Create, persist, and broadcast a new message within a conversation.

        Args:
            db: Active SQLAlchemy database session.
            conversation_id: Target conversation ID.
            sender_id: Database ID of the sending user.
            content: Text body of the message.
            reply_to_id: Optional ID of the parent message being replied to.
            attachments: Optional list of attachment descriptor dicts.

        Returns:
            MessageResponse: Serialized message model ready for API response and socket broadcast.

        Purpose:
            Validates content, creates database records, generates notifications,
            and pushes real-time WebSocket payloads to all active conversation members.

        Dependencies:
            MessageDB, MessageAttachmentDB, ConversationMemberDB, chat_ws_manager, NotificationService.

        Error handling:
            Raises ValueError if conversation not found or access denied.
        """
        if not ChatService.can_access_conversation(db, current_user, conversation_id):
            raise PermissionError("Access denied to conversation.")

        UserDB, ProfileDB, _, _ = _get_core_models()
        now_str = ChatService.now_str()

        msg = MessageDB(
            conversation_id=conversation_id,
            sender_id=current_user.id,
            sender_name=current_user.full_name,
            sender_role=current_user.role,
            message_type=message_type,
            content=content,
            reply_to_message_id=reply_to_message_id,
            is_announcement=1 if is_announcement else 0,
            created_at=now_str,
            updated_at=now_str
        )
        db.add(msg)
        db.commit()
        db.refresh(msg)

        # Associate attachments if provided
        if attachment_ids:
            attachments = db.query(MessageAttachmentDB).filter(MessageAttachmentDB.id.in_(attachment_ids)).all()
            for att in attachments:
                att.message_id = msg.id
            db.commit()

        # Update conversation updated_at
        conv = db.query(ConversationDB).filter(ConversationDB.id == conversation_id).first()
        if conv:
            conv.updated_at = now_str
            db.commit()

        # Auto mark read for sender
        mem = db.query(ConversationMemberDB).filter(
            ConversationMemberDB.conversation_id == conversation_id,
            ConversationMemberDB.user_id == current_user.id
        ).first()
        if mem:
            mem.last_read_message_id = msg.id
            db.commit()

        # Get conversation members
        all_members = db.query(ConversationMemberDB.user_id).filter(ConversationMemberDB.conversation_id == conversation_id).all()
        member_uids = [m[0] for m in all_members]

        # Construct schema
        prof = db.query(ProfileDB).filter(ProfileDB.user_id == current_user.id).first()
        
        attach_db = db.query(MessageAttachmentDB).filter(MessageAttachmentDB.message_id == msg.id).all()
        attach_schemas = [
            MessageAttachmentSchema(
                id=a.id,
                message_id=a.message_id,
                file_name=a.file_name,
                file_path=a.file_path,
                file_type=a.file_type,
                file_size=a.file_size,
                created_at=a.created_at,
                download_url=f"/chat/files/{a.id}"
            ) for a in attach_db
        ]

        reply_dict = None
        if reply_to_message_id:
            reply_msg = db.query(MessageDB).filter(MessageDB.id == reply_to_message_id).first()
            if reply_msg:
                r_sender = db.query(UserDB).filter(UserDB.id == reply_msg.sender_id).first()
                reply_dict = {
                    "id": reply_msg.id,
                    "sender_name": r_sender.full_name if r_sender else "User",
                    "content": reply_msg.content if not reply_msg.is_deleted else "Message deleted"
                }

        msg_response = MessageResponse(
            id=msg.id,
            conversation_id=msg.conversation_id,
            sender_id=msg.sender_id,
            sender_name=current_user.full_name,
            sender_role=current_user.role,
            sender_avatar=prof.profile_image if prof else None,
            message_type=msg.message_type,
            content=msg.content,
            reply_to_message_id=msg.reply_to_message_id,
            reply_to_message=reply_dict,
            is_announcement=bool(msg.is_announcement),
            created_at=msg.created_at,
            attachments=attach_schemas
        )

        # Real-time WebSocket push
        event_payload = {
            "type": "NEW_MESSAGE",
            "data": msg_response.model_dump()
        }
        safe_dispatch_coroutine(chat_ws_manager.broadcast_to_users(member_uids, event_payload))

        # Push in-app notification to other members
        for recipient_id in member_uids:
            if recipient_id != current_user.id:
                notif_title = f"New message from {current_user.full_name}"
                if conv and conv.type != "PERSONAL":
                    notif_title = f"New message in {conv.title}"
                NotificationService.create_notification(
                    db=db,
                    user_id=recipient_id,
                    title=notif_title,
                    message=(content[:80] + "...") if len(content) > 80 else (content or "Shared an attachment"),
                    notification_type="CHAT_MESSAGE",
                    reference_id=str(msg.id)
                )

        return msg_response

    @staticmethod
    def edit_message(db: Session, current_user, message_id: int, new_content: str) -> MessageResponse:
        """
        Edit the text content of an existing message.

        Args:
            db: Active SQLAlchemy database session.
            message_id: ID of the message to update.
            user_id: ID of the user requesting the edit (must be the original author).
            new_content: Updated message body text.

        Returns:
            MessageResponse: Updated message data.

        Purpose:
            Allows authors to correct typos, marking the message as edited.

        Dependencies:
            MessageDB, chat_ws_manager.

        Error handling:
            Raises ValueError if message not found, permission denied, or message is deleted.
        """
        msg = db.query(MessageDB).filter(MessageDB.id == message_id).first()
        if not msg:
            raise ValueError("Message not found.")

        my_role = (current_user.role or "").upper()
        if msg.sender_id != current_user.id and my_role != "ADMIN":
            raise PermissionError("You can only edit your own messages.")

        now_str = ChatService.now_str()

        if not msg.original_content:
            msg.original_content = msg.content

        msg.content = new_content
        msg.is_edited = 1
        msg.edited_at = now_str
        db.commit()

        all_members = db.query(ConversationMemberDB.user_id).filter(ConversationMemberDB.conversation_id == msg.conversation_id).all()
        member_uids = [m[0] for m in all_members]

        event_payload = {
            "type": "MESSAGE_EDITED",
            "data": {
                "message_id": msg.id,
                "conversation_id": msg.conversation_id,
                "new_content": new_content,
                "edited_at": now_str
            }
        }
        safe_dispatch_coroutine(chat_ws_manager.broadcast_to_users(member_uids, event_payload))

        return ChatService.get_messages(db, current_user, msg.conversation_id, limit=1, before_id=msg.id + 1)[0]

    @staticmethod
    def delete_message(db: Session, current_user, message_id: int, for_everyone: bool = True):
        """
        Delete a message either for the requesting user only or for all participants.

        Args:
            db: Active SQLAlchemy database session.
            message_id: ID of the message to delete.
            user_id: ID of the requesting user.
            delete_for_everyone: Boolean flag indicating global deletion.

        Returns:
            dict: Operation status summary.

        Purpose:
            Supports private clear-for-me or global soft-deletion with real-time UI synchronization.

        Dependencies:
            MessageDB, MessageUserDeletionDB, chat_ws_manager.
        """
        msg = db.query(MessageDB).filter(MessageDB.id == message_id).first()
        if not msg:
            raise ValueError("Message not found.")

        if not ChatService.can_access_conversation(db, current_user, msg.conversation_id):
            raise PermissionError("Access denied to conversation.")

        now_str = ChatService.now_str()
        my_role = (current_user.role or "").upper()

        if for_everyone:
            if msg.sender_id != current_user.id and my_role != "ADMIN":
                raise PermissionError("You do not have permission to delete this message for everyone.")

            msg.is_deleted = 1
            msg.deleted_for_everyone = 1
            msg.deleted_at = now_str
            msg.deleted_by = current_user.id
            msg.content = "This message was deleted"
            db.commit()

            all_members = db.query(ConversationMemberDB.user_id).filter(ConversationMemberDB.conversation_id == msg.conversation_id).all()
            member_uids = [m[0] for m in all_members]

            event_payload = {
                "type": "MESSAGE_DELETED",
                "data": {
                    "message_id": msg.id,
                    "conversation_id": msg.conversation_id,
                    "for_everyone": True,
                    "deleted_at": now_str
                }
            }
            safe_dispatch_coroutine(chat_ws_manager.broadcast_to_users(member_uids, event_payload))
        else:
            existing = db.query(MessageUserDeletionDB).filter(
                MessageUserDeletionDB.message_id == msg.id,
                MessageUserDeletionDB.user_id == current_user.id
            ).first()
            if not existing:
                db.add(MessageUserDeletionDB(
                    message_id=msg.id,
                    user_id=current_user.id,
                    deleted_at=now_str
                ))
                db.commit()

            event_payload = {
                "type": "MESSAGE_DELETED",
                "data": {
                    "message_id": msg.id,
                    "conversation_id": msg.conversation_id,
                    "for_everyone": False,
                    "deleted_for_user_id": current_user.id,
                    "deleted_at": now_str
                }
            }
            safe_dispatch_coroutine(chat_ws_manager.broadcast_to_users([current_user.id], event_payload))

# ----------------------------------------------------------------------------
# Reactions, Forwarding & Message Utilities
# ----------------------------------------------------------------------------
    @staticmethod
    def toggle_reaction(db: Session, current_user, message_id: int, emoji: str):
        """
        Add or remove an emoji reaction on a message.

        Args:
            db: Active SQLAlchemy database session.
            message_id: Target message ID.
            user_id: Database ID of the reacting user.
            emoji: Emoji character or shortcode (e.g., '👍', '❤️').

        Returns:
            dict: Updated reaction counts and active user states.

        Purpose:
            Provides interactive feedback and broadcasts reaction updates via WebSocket.

        Dependencies:
            MessageReactionDB, chat_ws_manager.
        """
        msg = db.query(MessageDB).filter(MessageDB.id == message_id).first()
        if not msg:
            raise ValueError("Message not found.")

        if not ChatService.can_access_conversation(db, current_user, msg.conversation_id):
            raise PermissionError("Access denied.")

        existing = db.query(MessageReactionDB).filter(
            MessageReactionDB.message_id == message_id,
            MessageReactionDB.user_id == current_user.id,
            MessageReactionDB.emoji == emoji
        ).first()

        now_str = ChatService.now_str()

        if existing:
            db.delete(existing)
            action = "removed"
        else:
            db.add(MessageReactionDB(
                message_id=message_id,
                user_id=current_user.id,
                emoji=emoji,
                created_at=now_str
            ))
            action = "added"

        db.commit()

        all_members = db.query(ConversationMemberDB.user_id).filter(ConversationMemberDB.conversation_id == msg.conversation_id).all()
        member_uids = [m[0] for m in all_members]

        event_payload = {
            "type": "REACTION_UPDATED",
            "data": {
                "message_id": message_id,
                "conversation_id": msg.conversation_id,
                "user_id": current_user.id,
                "emoji": emoji,
                "action": action
            }
        }
        safe_dispatch_coroutine(chat_ws_manager.broadcast_to_users(member_uids, event_payload))

    @staticmethod
    def get_forward_targets(db: Session, current_user) -> dict:
        """
        Retrieve eligible recipient conversations and contacts for forwarding a message.

        Args:
            db: Active SQLAlchemy database session.
            user_id: ID of the forwarding user.
            user_role: Role of the forwarding user.

        Returns:
            dict: Grouped forward targets (recent chats, allowed direct contacts, groups).

        Purpose:
            Powers the forward message picker dialog.
        """
        UserDB, ProfileDB, CourseDB, _ = _get_core_models()
        ChatService.ensure_course_groups(db)

        # 1. Myself (Self chat)
        self_conv = ChatService.get_or_create_self_conversation(db, current_user)
        self_prof = db.query(ProfileDB).filter(ProfileDB.user_id == current_user.id).first()
        myself_data = {
            "conversation_id": self_conv.id,
            "title": "Myself",
            "subtitle": "Message yourself • Saved Messages",
            "icon": "fa-solid fa-user-gear",
            "type": "PERSONAL",
            "profile_image": self_prof.profile_image if self_prof else None,
            "role": "Self"
        }

        # 2. All user's accessible conversations formatted
        user_convs = ChatService.get_user_conversations(db, current_user)

        # Recent chats (top active, excluding self chat)
        recent_chats = []
        for c in user_convs:
            if c.id == self_conv.id:
                continue
            recent_chats.append({
                "conversation_id": c.id,
                "title": c.title,
                "subtitle": c.description or (c.course_title if c.course_title else (c.other_user.role if c.other_user else c.type)),
                "icon": c.icon or "fa-solid fa-comments",
                "type": c.type,
                "profile_image": c.other_user.profile_image if c.other_user else None,
                "unread_count": c.unread_count
            })

        # Personal chats & Allowed Contacts
        personal_chats = []
        existing_personal_user_ids = set()

        for c in user_convs:
            if c.type == "PERSONAL" and c.id != self_conv.id and c.other_user:
                existing_personal_user_ids.add(c.other_user.id)
                personal_chats.append({
                    "conversation_id": c.id,
                    "target_user_id": c.other_user.id,
                    "title": c.other_user.full_name,
                    "subtitle": f"{c.other_user.role} • {c.other_user.email}",
                    "icon": "fa-solid fa-user",
                    "type": "PERSONAL",
                    "profile_image": c.other_user.profile_image,
                    "role": c.other_user.role
                })

        # Include allowed contacts that don't have an active conversation yet
        allowed_contacts = ChatService.get_allowed_contacts(db, current_user)
        for ac in allowed_contacts:
            if ac.id not in existing_personal_user_ids and ac.id != current_user.id:
                personal_chats.append({
                    "conversation_id": None,
                    "target_user_id": ac.id,
                    "title": ac.full_name,
                    "subtitle": f"{ac.role} • {ac.course_title or ac.email}",
                    "icon": "fa-solid fa-user-plus",
                    "type": "PERSONAL",
                    "profile_image": ac.profile_image,
                    "role": ac.role
                })

        # Course Groups
        course_groups = []
        for c in user_convs:
            if c.type in ["COURSE_GROUP", "CUSTOM_GROUP"]:
                course_groups.append({
                    "conversation_id": c.id,
                    "title": c.title,
                    "subtitle": f"{c.members_count} members" + (f" • {c.course_title}" if c.course_title else ""),
                    "icon": c.icon or "fa-solid fa-graduation-cap",
                    "type": c.type,
                    "members_count": c.members_count
                })

        return {
            "myself": myself_data,
            "recent": recent_chats,
            "personal": personal_chats,
            "groups": course_groups
        }

    @staticmethod
    def forward_message(
        db: Session,
        current_user,
        message_id: Optional[int] = None,
        target_conversation_ids: Optional[List[int]] = None,
        target_user_ids: Optional[List[int]] = None,
        message_ids: Optional[List[int]] = None
    ) -> dict:
        """
        Forward an existing message to one or more destination conversations.

        Args:
            db: Active SQLAlchemy database session.
            message_id: ID of the original message.
            sender_id: ID of the forwarding user.
            target_conversation_ids: List of destination conversation IDs.

        Returns:
            List[MessageResponse]: Created forward messages.

        Purpose:
            Duplicates message text and attachments into target conversations with provenance attribution.

        Dependencies:
            MessageDB, MessageForwardDB, MessageAttachmentDB, chat_ws_manager.
        """
        target_conv_ids = set(target_conversation_ids or [])

        # If target_user_ids provided, resolve to 1-on-1 personal conversation IDs
        if target_user_ids:
            for uid in target_user_ids:
                try:
                    conv = ChatService.get_or_create_personal_conversation(db, current_user, uid)
                    target_conv_ids.add(conv.id)
                except Exception as e:
                    print(f"[ForwardMessage] Could not get/create personal conv for user {uid}: {e}")

        if not target_conv_ids:
            raise ValueError("No valid destination conversations specified.")

        # Resolve list of messages to forward
        raw_msg_ids = message_ids or ([message_id] if message_id is not None else [])
        if not raw_msg_ids:
            raise ValueError("No message selected for forwarding.")

        msgs_to_forward = []
        for mid in raw_msg_ids:
            orig_msg = db.query(MessageDB).filter(MessageDB.id == mid).first()
            if not orig_msg:
                continue
            if orig_msg.is_deleted or orig_msg.deleted_for_everyone:
                continue
            # Verify user has access to source conversation
            if not ChatService.can_access_conversation(db, current_user, orig_msg.conversation_id):
                continue
            msgs_to_forward.append(orig_msg)

        if not msgs_to_forward:
            raise ValueError("Original message not found or you do not have permission to access it.")

        now_str = ChatService.now_str()
        successful_destinations = set()
        failed_destinations = set()

        for conv_id in target_conv_ids:
            if not ChatService.can_access_conversation(db, current_user, conv_id):
                failed_destinations.add(conv_id)
                continue

            for orig_msg in msgs_to_forward:
                fwd_msg = MessageDB(
                    conversation_id=conv_id,
                    sender_id=current_user.id,
                    sender_name=current_user.full_name,
                    sender_role=current_user.role,
                    message_type=orig_msg.message_type,
                    content=orig_msg.content,
                    is_forwarded=1,
                    forwarded_from_message_id=orig_msg.id,
                    created_at=now_str,
                    updated_at=now_str
                )
                db.add(fwd_msg)
                db.commit()
                db.refresh(fwd_msg)

                db.add(MessageForwardDB(
                    original_message_id=orig_msg.id,
                    forwarded_message_id=fwd_msg.id,
                    sender_id=current_user.id,
                    created_at=now_str
                ))
                db.commit()

                # Re-use existing stored attachments safely
                orig_atts = db.query(MessageAttachmentDB).filter(MessageAttachmentDB.message_id == orig_msg.id).all()
                for a in orig_atts:
                    db.add(MessageAttachmentDB(
                        message_id=fwd_msg.id,
                        file_name=a.file_name,
                        file_path=a.file_path,
                        file_type=a.file_type,
                        file_size=a.file_size,
                        created_at=now_str
                    ))
                db.commit()

                # Update target conversation timestamp
                conv = db.query(ConversationDB).filter(ConversationDB.id == conv_id).first()
                if conv:
                    conv.updated_at = now_str
                    db.commit()

                # Broadcast live WS event
                all_members = db.query(ConversationMemberDB.user_id).filter(ConversationMemberDB.conversation_id == conv_id).all()
                member_uids = [m[0] for m in all_members]

                msg_res = ChatService.get_messages(db, current_user, conv_id, limit=1, before_id=fwd_msg.id + 1)[0]
                event_payload = {
                    "type": "NEW_MESSAGE",
                    "data": msg_res.model_dump()
                }
                safe_dispatch_coroutine(chat_ws_manager.broadcast_to_users(member_uids, event_payload))

                # Notifications
                for recipient_id in member_uids:
                    if recipient_id != current_user.id:
                        notif_title = f"Forwarded message from {current_user.full_name}"
                        if conv and conv.type != "PERSONAL":
                            notif_title = f"New message in {conv.title}"
                        NotificationService.create_notification(
                            db=db,
                            user_id=recipient_id,
                            title=notif_title,
                            message=(fwd_msg.content[:80] + "...") if fwd_msg.content and len(fwd_msg.content) > 80 else (fwd_msg.content or "Forwarded an attachment"),
                            notification_type="CHAT_MESSAGE",
                            reference_id=str(fwd_msg.id)
                        )

            successful_destinations.add(conv_id)

        if not successful_destinations:
            raise PermissionError("Could not forward to selected conversations (Access denied).")

        return {
            "status": "success",
            "forwarded_count": len(msgs_to_forward),
            "destination_count": len(successful_destinations),
            "failed_count": len(failed_destinations),
            "message": f"Message forwarded to {len(successful_destinations)} chat(s)."
        }

    @staticmethod
    def mark_conversation_read(db: Session, current_user, conversation_id: int):
        """
        Update the user's last-read timestamp for a conversation to clear unread counts.

        Args:
            db: Active SQLAlchemy database session.
            conversation_id: Target conversation ID.
            user_id: ID of the user reading messages.

        Returns:
            None.

        Purpose:
            Resets unread message badges and updates conversation delivery status.

        Dependencies:
            ConversationMemberDB.
        """
        last_msg = db.query(MessageDB).filter(
            MessageDB.conversation_id == conversation_id
        ).order_by(MessageDB.id.desc()).first()

        if last_msg:
            mem = db.query(ConversationMemberDB).filter(
                ConversationMemberDB.conversation_id == conversation_id,
                ConversationMemberDB.user_id == current_user.id
            ).first()
            if mem:
                mem.last_read_message_id = last_msg.id
                db.commit()

    @staticmethod
    def get_group_members(db: Session, current_user, group_id: int):
        """
        Retrieve participant list and role details for a course group conversation.

        Args:
            db: Active SQLAlchemy database session.
            group_id: ID of the group conversation.
            requesting_user_id: ID of the user requesting the member list.

        Returns:
            dict: Group metadata including instructor, members list, and online status.

        Purpose:
            Powers the group participant info panel and modal in the chat UI.

        Dependencies:
            ConversationDB, ConversationMemberDB, UserDB, ProfileDB, chat_ws_manager.
        """
        if not ChatService.can_access_conversation(db, current_user, group_id):
            raise PermissionError("Access denied to conversation members.")

        UserDB, ProfileDB, CourseDB, _ = _get_core_models()
        conv = db.query(ConversationDB).filter(ConversationDB.id == group_id).first()
        if not conv:
            raise ValueError("Group conversation not found.")

        member_records = db.query(ConversationMemberDB).filter(ConversationMemberDB.conversation_id == group_id).all()
        
        # Deduplicate records by user_id, resolving highest privilege role
        role_priority = {"instructor": 4, "admin": 3, "moderator": 2, "member": 1}
        seen_roles = {}
        for m in member_records:
            cur_role = (m.role or "member").lower()
            if m.user_id not in seen_roles:
                seen_roles[m.user_id] = m.role or "member"
            else:
                existing_role = seen_roles[m.user_id].lower()
                if role_priority.get(cur_role, 1) > role_priority.get(existing_role, 1):
                    seen_roles[m.user_id] = m.role or "member"

        unique_uids = list(seen_roles.keys())
        members = db.query(UserDB).filter(UserDB.id.in_(unique_uids)).all() if unique_uids else []
        
        instructor_info = None
        course_title = None
        if conv.course_id:
            c = db.query(CourseDB).filter(CourseDB.id == conv.course_id).first()
            if c:
                course_title = c.title
                if c.instructor_id:
                    inst_user = db.query(UserDB).filter(UserDB.id == c.instructor_id).first()
                    if inst_user:
                        instructor_info = {
                            "id": inst_user.id,
                            "full_name": inst_user.full_name,
                            "email": inst_user.email
                        }

        res_members = []
        for u in members:
            prof = db.query(ProfileDB).filter(ProfileDB.user_id == u.id).first()
            assigned_group_role = seen_roles.get(u.id, "member")
            # If the user is the course instructor, reflect that in group_role
            if conv.course_id and instructor_info and u.id == instructor_info["id"]:
                assigned_group_role = "instructor"

            res_members.append({
                "id": u.id,
                "full_name": u.full_name,
                "email": u.email,
                "role": u.role or "Student",
                "group_role": assigned_group_role,
                "profile_image": prof.profile_image if prof else None,
                "is_online": chat_ws_manager.is_user_online(u.id)
            })

        # Sort members: Instructor first, then Admins, then Students alphabetically
        def _sort_key(m):
            gr = (m.get("group_role") or "").lower()
            ur = (m.get("role") or "").lower()
            if "instructor" in gr or "instructor" in ur:
                tier = 0
            elif "admin" in gr or "admin" in ur:
                tier = 1
            else:
                tier = 2
            return (tier, (m.get("full_name") or "").lower())

        res_members.sort(key=_sort_key)

        return {
            "group_id": conv.id,
            "title": conv.title,
            "type": conv.type,
            "course_id": conv.course_id,
            "course_title": course_title,
            "instructor": instructor_info,
            "total_members": len(res_members),
            "members": res_members
        }


# ----------------------------------------------------------------------------
# Shared Media, Docs, Links & Contact Metadata
# ----------------------------------------------------------------------------
    @staticmethod
    def get_shared_content(db: Session, current_user, conversation_id: int, q: Optional[str] = None):
        """
        Retrieve media, documents, and shared links categorized from a conversation's history.

        Args:
            db: Active SQLAlchemy database session.
            conversation_id: Target conversation ID.
            user_id: ID of the requesting user.

        Returns:
            SharedContentResponse: Categorized media, documents, and extracted URL links.

        Purpose:
            Powers the 'Shared Media, Docs & Links' inspection sidebar.

        Dependencies:
            MessageDB, MessageAttachmentDB.
        """
        if not ChatService.can_access_conversation(db, current_user, conversation_id):
            raise PermissionError("Access denied to conversation shared content.")

        UserDB, ProfileDB, _, _ = _get_core_models()

        user_deleted_ids = set(
            row[0] for row in db.query(MessageUserDeletionDB.message_id).filter(
                MessageUserDeletionDB.user_id == current_user.id
            ).all()
        )

        msg_query = db.query(MessageDB).filter(
            MessageDB.conversation_id == conversation_id,
            MessageDB.is_deleted == 0,
            MessageDB.deleted_for_everyone == 0
        )
        if user_deleted_ids:
            msg_query = msg_query.filter(~MessageDB.id.in_(user_deleted_ids))

        messages = msg_query.all()
        msg_ids = [m.id for m in messages]
        msg_map = {m.id: m for m in messages}

        attachments = []
        if msg_ids:
            att_query = db.query(MessageAttachmentDB).filter(MessageAttachmentDB.message_id.in_(msg_ids))
            attachments = att_query.all()

        media_list = []
        docs_list = []
        links_list = []

        query_str = (q or "").strip().lower()
        media_exts = ('.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.webm')

        for att in attachments:
            parent_msg = msg_map.get(att.message_id)
            sender_id = parent_msg.sender_id if parent_msg else 0
            sender_name = parent_msg.sender_name if parent_msg else "User"
            created_at = att.created_at or (parent_msg.created_at if parent_msg else ChatService.now_str())

            file_ext = "." + att.file_name.split(".")[-1].lower() if "." in att.file_name else ""
            file_type_lower = (att.file_type or "").lower()

            is_media = file_ext in media_exts or file_type_lower.startswith(('image/', 'video/'))

            if query_str:
                match = (query_str in att.file_name.lower()) or (query_str in sender_name.lower())
                if not match:
                    continue

            item_data = {
                "id": att.id,
                "message_id": att.message_id,
                "file_name": att.file_name,
                "file_path": att.file_path,
                "download_url": f"/chat/files/{att.id}",
                "file_type": att.file_type or file_ext.lstrip('.'),
                "file_size": att.file_size or 0,
                "sender_id": sender_id,
                "sender_name": sender_name,
                "created_at": created_at
            }

            if is_media:
                media_list.append(item_data)
            else:
                docs_list.append(item_data)

        url_regex = re.compile(r'https?://[^\s<>"]+|www\.[^\s<>"]+', re.IGNORECASE)

        for m in messages:
            if not m.content:
                continue
            found_urls = url_regex.findall(m.content)
            for url in found_urls:
                clean_url = url if url.startswith(('http://', 'https://')) else f'https://{url}'
                sender_name = m.sender_name or "User"

                if query_str:
                    match = (query_str in clean_url.lower()) or (query_str in sender_name.lower())
                    if not match:
                        continue

                domain_parts = clean_url.split('/')
                domain_title = domain_parts[2] if len(domain_parts) > 2 else clean_url

                links_list.append({
                    "id": m.id,
                    "message_id": m.id,
                    "url": clean_url,
                    "title": domain_title,
                    "sender_id": m.sender_id,
                    "sender_name": sender_name,
                    "created_at": m.created_at
                })

        return {
            "conversation_id": conversation_id,
            "media_count": len(media_list),
            "docs_count": len(docs_list),
            "links_count": len(links_list),
            "media": media_list,
            "docs": docs_list,
            "links": links_list
        }

    @staticmethod
    def get_contact_info(db: Session, current_user, conversation_id: int):
        """
        Retrieve profile details, enrolled courses, and bio of a conversation partner.

        Args:
            db: Active SQLAlchemy database session.
            conversation_id: Target conversation ID.
            requesting_user_id: ID of the requesting user.

        Returns:
            ContactInfoResponse: Profile summary, role, email, avatar, and mutual course context.

        Purpose:
            Powers the contact information header and sidebar in direct conversations.

        Dependencies:
            ConversationDB, ConversationMemberDB, UserDB, ProfileDB.
        """
        if not ChatService.can_access_conversation(db, current_user, conversation_id):
            raise PermissionError("Access denied to contact info.")

        UserDB, ProfileDB, CourseDB, _ = _get_core_models()

        conv = db.query(ConversationDB).filter(ConversationDB.id == conversation_id).first()
        if not conv:
            raise ValueError("Conversation not found.")

        shared_content = ChatService.get_shared_content(db, current_user, conversation_id)

        member_records = db.query(ConversationMemberDB).filter(ConversationMemberDB.conversation_id == conversation_id).all()
        m_uids = [m.user_id for m in member_records]
        members_db = db.query(UserDB).filter(UserDB.id.in_(m_uids)).all() if m_uids else []

        member_summaries = []
        for u in members_db:
            prof = db.query(ProfileDB).filter(ProfileDB.user_id == u.id).first()
            member_summaries.append(UserSummary(
                id=u.id,
                full_name=u.full_name,
                email=u.email,
                role=u.role,
                profile_image=prof.profile_image if prof else None,
                is_online=chat_ws_manager.is_user_online(u.id)
            ))

        target_user = None
        target_prof = None
        if conv.type == "PERSONAL":
            other_mem = next((m for m in member_records if m.user_id != current_user.id), None)
            if other_mem:
                target_user = db.query(UserDB).filter(UserDB.id == other_mem.user_id).first()
                if target_user:
                    target_prof = db.query(ProfileDB).filter(ProfileDB.user_id == target_user.id).first()

        course_title = None
        if conv.course_id:
            c = db.query(CourseDB).filter(CourseDB.id == conv.course_id).first()
            if c:
                course_title = c.title

        title = conv.title or "Conversation"
        if conv.type == "PERSONAL" and target_user:
            title = target_user.full_name

        return {
            "conversation_id": conv.id,
            "type": conv.type,
            "title": title,
            "description": conv.description,
            "icon": conv.icon or ("fa-solid fa-users" if conv.type != "PERSONAL" else "fa-solid fa-user"),
            "course_id": conv.course_id,
            "course_title": course_title,
            "user_id": target_user.id if target_user else None,
            "full_name": target_user.full_name if target_user else None,
            "role": target_user.role if target_user else None,
            "email": target_user.email if target_user else None,
            "profile_image": target_prof.profile_image if target_prof else None,
            "is_online": chat_ws_manager.is_user_online(target_user.id) if target_user else False,
            "media_count": shared_content["media_count"],
            "docs_count": shared_content["docs_count"],
            "links_count": shared_content["links_count"],
            "members_count": len(member_summaries),
            "members": member_summaries,
            "created_at": conv.created_at
        }

    @staticmethod
    def clear_conversation_messages(db: Session, current_user, conversation_id: int):
        """
        Clear all message history in a conversation for the requesting user.

        Args:
            db: Active SQLAlchemy database session.
            conversation_id: Target conversation ID.
            user_id: ID of the requesting user.

        Returns:
            dict: Confirmation status.

        Purpose:
            Soft-clears the conversation view for a user without affecting other participants.

        Dependencies:
            MessageUserDeletionDB.
        """
        if not ChatService.can_access_conversation(db, current_user, conversation_id):
            raise PermissionError("Access denied.")

        now_str = ChatService.now_str()
        msgs = db.query(MessageDB).filter(
            MessageDB.conversation_id == conversation_id
        ).all()

        for msg in msgs:
            existing = db.query(MessageUserDeletionDB).filter(
                MessageUserDeletionDB.message_id == msg.id,
                MessageUserDeletionDB.user_id == current_user.id
            ).first()
            if not existing:
                db.add(MessageUserDeletionDB(
                    message_id=msg.id,
                    user_id=current_user.id,
                    deleted_at=now_str
                ))
        db.commit()

        return {"status": "success", "message": "Chat history cleared."}

