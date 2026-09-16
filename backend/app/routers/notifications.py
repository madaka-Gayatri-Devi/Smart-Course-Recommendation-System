from fastapi import APIRouter, Depends, HTTPException, status, Query, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

try:
    from app.schemas.notification import NotificationResponse, UnreadCountResponse
    from app.services.notification_service import NotificationService
except ImportError:
    try:
        from schemas.notification import NotificationResponse, UnreadCountResponse
        from services.notification_service import NotificationService
    except ImportError:
        from backend.app.schemas.notification import NotificationResponse, UnreadCountResponse
        from backend.app.services.notification_service import NotificationService

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _get_main_deps():
    try:
        from app.main import get_db, get_current_user, get_db_course_dicts, UserDB, NotificationDB, CareerGoalDB, SessionLocal
    except ImportError:
        try:
            from main import get_db, get_current_user, get_db_course_dicts, UserDB, NotificationDB, CareerGoalDB, SessionLocal
        except ImportError:
            from backend.app.main import get_db, get_current_user, get_db_course_dicts, UserDB, NotificationDB, CareerGoalDB, SessionLocal
    return get_db, get_current_user, get_db_course_dicts, UserDB, NotificationDB, CareerGoalDB, SessionLocal

def get_db_session():
    _, _, _, _, _, _, SessionLocal = _get_main_deps()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("", response_model=List[NotificationResponse])
def get_user_notifications(
    limit: Optional[int] = 20,
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db_session),
):
    _, get_current_user_fn, get_db_course_dicts_fn, UserDB, NotificationDB, CareerGoalDB, _ = _get_main_deps()
    # Manual auth call to support depends
    current_user = get_current_user_fn(token=token, authorization=authorization, db=db)

    role_lower = (current_user.role or "student").lower()

    if role_lower == "student":
        try:
            db_courses = get_db_course_dicts_fn(db)
            db_goals = {g.title: g.required_skills for g in db.query(CareerGoalDB).all()}
            NotificationService.generate_personalized_recommendation_notifications(
                db=db,
                user_id=current_user.id,
                db_courses=db_courses,
                db_goals=db_goals
            )
        except Exception as err:
            print(f"[Notifications Router Warning] Error checking recommendations: {err}")
    elif role_lower == "admin":
        try:
            NotificationService.ensure_admin_notifications(db, current_user.id, current_user.full_name)
        except Exception as err:
            print(f"[Notifications Router Warning] Error ensuring admin notifications: {err}")
    elif role_lower == "instructor":
        try:
            NotificationService.ensure_instructor_notifications(db, current_user.id, current_user.full_name)
        except Exception as err:
            print(f"[Notifications Router Warning] Error ensuring instructor notifications: {err}")

    try:
        NotificationService.notify_system_welcome(db, current_user.id, current_user.full_name, current_user.role)
    except Exception:
        pass

    notifications = db.query(NotificationDB).filter(
        NotificationDB.user_id == current_user.id
    ).order_by(NotificationDB.id.desc()).limit(limit or 20).all()

    return notifications


@router.get("/unread-count", response_model=UnreadCountResponse)
def get_unread_notification_count(
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db_session),
):
    _, get_current_user_fn, _, _, NotificationDB, _, _ = _get_main_deps()
    current_user = get_current_user_fn(token=token, authorization=authorization, db=db)

    unread_count = db.query(NotificationDB).filter(
        NotificationDB.user_id == current_user.id,
        NotificationDB.is_read == 0
    ).count()

    return {"unread_count": unread_count}


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
@router.put("/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_as_read(
    notification_id: int,
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db_session),
):
    _, get_current_user_fn, _, _, NotificationDB, _, _ = _get_main_deps()
    current_user = get_current_user_fn(token=token, authorization=authorization, db=db)

    notification = db.query(NotificationDB).filter(NotificationDB.id == notification_id).first()

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found.")

    if notification.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You do not own this notification."
        )

    if notification.is_read == 0:
        notification.is_read = 1
        notification.read_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        db.commit()
        db.refresh(notification)

    return notification


@router.patch("/read-all")
@router.put("/read-all")
def mark_all_notifications_as_read(
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db_session),
):
    _, get_current_user_fn, _, _, NotificationDB, _, _ = _get_main_deps()
    current_user = get_current_user_fn(token=token, authorization=authorization, db=db)

    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    unread_notifications = db.query(NotificationDB).filter(
        NotificationDB.user_id == current_user.id,
        NotificationDB.is_read == 0
    ).all()

    for notif in unread_notifications:
        notif.is_read = 1
        notif.read_at = now_str

    db.commit()

    return {"message": "All notifications marked as read.", "updated_count": len(unread_notifications)}


@router.delete("/{notification_id}")
def delete_notification(
    notification_id: int,
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db_session),
):
    _, get_current_user_fn, _, _, NotificationDB, _, _ = _get_main_deps()
    current_user = get_current_user_fn(token=token, authorization=authorization, db=db)

    notification = db.query(NotificationDB).filter(NotificationDB.id == notification_id).first()

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found.")

    if notification.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You do not own this notification."
        )

    db.delete(notification)
    db.commit()

    return {"message": "Notification deleted successfully."}
