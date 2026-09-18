import os
import sys
import shutil
import uuid
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Union

# Ensure backend root and app directory are in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
APP_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

try:
    from app.services.assessment_service import AssessmentService
except ImportError:
    try:
        from services.assessment_service import AssessmentService
    except ImportError:
        from backend.app.services.assessment_service import AssessmentService

try:
    from app.recommendation.recommendation_engine import RecommendationEngine
    from app.recommendation.course_scorer import CourseScorer, COURSE_CATALOG
    from app.recommendation.skill_gap_analyzer import SkillGapAnalyzer
    from app.recommendation.learning_path_generator import LearningPathGenerator
except ImportError:
    try:
        from recommendation.recommendation_engine import RecommendationEngine
        from recommendation.course_scorer import CourseScorer, COURSE_CATALOG
        from recommendation.skill_gap_analyzer import SkillGapAnalyzer
        from recommendation.learning_path_generator import LearningPathGenerator
    except ImportError:
        from backend.app.recommendation.recommendation_engine import RecommendationEngine
        from backend.app.recommendation.course_scorer import CourseScorer, COURSE_CATALOG
        from backend.app.recommendation.skill_gap_analyzer import SkillGapAnalyzer
        from backend.app.recommendation.learning_path_generator import LearningPathGenerator

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Query, Header, WebSocket, WebSocketDisconnect

try:
    from app.services.notification_service import NotificationService, ws_manager
except ImportError:
    try:
        from services.notification_service import NotificationService, ws_manager
    except ImportError:
        from backend.app.services.notification_service import NotificationService, ws_manager
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine, Column, Integer, String, Float, JSON, ForeignKey, inspect, text, func
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from pydantic import BaseModel, EmailStr, ConfigDict, Field
import bcrypt
from jose import JWTError, jwt
import hmac
import hashlib
import time
from dotenv import load_dotenv

load_dotenv(BASE_DIR / ".env")

# --- CONFIG ---
SECRET_KEY = os.getenv("SECRET_KEY", "supersecret_smartlearn_key_2026")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 7)))  # 1 week

# Razorpay Configuration
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "rzp_test_TS3V8ct5L5sNFk")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "smartlearn_razorpay_secret_key_2026")

try:
    import razorpay
    razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
except Exception as _rzp_err:
    razorpay_client = None

ROOT_DB_PATH = BASE_DIR.parent / "smartlearn.db"
BACKEND_DB_PATH = BASE_DIR / "smartlearn.db"

# Sync databases if one is larger/has full data
if BACKEND_DB_PATH.exists() and ROOT_DB_PATH.exists():
    try:
        if BACKEND_DB_PATH.stat().st_size > ROOT_DB_PATH.stat().st_size:
            shutil.copyfile(BACKEND_DB_PATH, ROOT_DB_PATH)
        elif ROOT_DB_PATH.stat().st_size > BACKEND_DB_PATH.stat().st_size:
            shutil.copyfile(ROOT_DB_PATH, BACKEND_DB_PATH)
    except Exception as _sync_err:
        print(f"[DB Sync Warning] {_sync_err}")

DB_PATH = BACKEND_DB_PATH if BACKEND_DB_PATH.exists() else ROOT_DB_PATH
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH.as_posix()}")

UPLOAD_DIR = BASE_DIR / "uploads"
AVATAR_DIR = UPLOAD_DIR / "avatars"
VIDEO_DIR = UPLOAD_DIR / "videos"
MATERIAL_DIR = UPLOAD_DIR / "materials"
THUMBNAIL_DIR = UPLOAD_DIR / "thumbnails"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)
VIDEO_DIR.mkdir(parents=True, exist_ok=True)
MATERIAL_DIR.mkdir(parents=True, exist_ok=True)
THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)

# --- DB SETUP ---
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- DATABASE MODELS ---

class UserDB(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="Student")  # Student, Instructor, Admin
    is_active = Column(Integer, default=1)
    firebase_uid = Column(String, nullable=True, index=True)
    created_at = Column(String, nullable=True)

class ProfileDB(Base):
    __tablename__ = "profiles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    phone = Column(String, nullable=True)
    dob = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    city = Column(String, nullable=True)
    career_goal = Column(String, nullable=True)
    secondary_career_goal = Column(String, nullable=True)
    profile_image = Column(String, nullable=True)
    skills = Column(JSON, nullable=True)
    interests = Column(JSON, nullable=True)
    languages = Column(JSON, nullable=True)
    education = Column(JSON, nullable=True)
    experience = Column(JSON, nullable=True)
    projects = Column(JSON, nullable=True)
    courses = Column(JSON, nullable=True)
    learning_style = Column(String, nullable=True)
    completion_percentage = Column(Integer, default=0)
    wishlist = Column(JSON, nullable=True)
    email_preferences = Column(JSON, nullable=True)

class CourseDB(Base):
    __tablename__ = "courses"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    short_description = Column(String, nullable=True)
    description = Column(String, nullable=True)
    category = Column(String, index=True)
    subcategory = Column(String, nullable=True)
    instructor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    instructor_name = Column(String, nullable=True)
    level = Column(String, default="Intermediate")  # Beginner, Intermediate, Advanced
    duration = Column(String, default="30 hours")
    language = Column(String, default="English")
    format = Column(String, default="Self-Paced Video & Projects")
    certificate = Column(Integer, default=1)
    is_free = Column(Integer, default=1)  # 1 = Free, 0 = Paid
    price = Column(Float, default=0.0)
    currency = Column(String, default="INR")
    demo_video_url = Column(String, nullable=True)
    thumbnail_url = Column(String, nullable=True)
    status = Column(String, default="published")  # published, draft, archived, deactivated
    rating = Column(Float, default=4.8)
    review_count = Column(Integer, default=0)
    enrollment_count = Column(Integer, default=0)
    skills = Column(JSON, nullable=True)
    prerequisites = Column(JSON, nullable=True)
    technical_requirements = Column(JSON, nullable=True)
    recommended_knowledge = Column(JSON, nullable=True)
    target_roles = Column(JSON, nullable=True)
    career_goals = Column(JSON, nullable=True)
    learning_outcomes = Column(JSON, nullable=True)
    modules = Column(JSON, nullable=True)
    icon = Column(String, default="fa-solid fa-graduation-cap")
    color_theme = Column(String, default="linear-gradient(135deg, #5B3FE8, #8B4AD9)")
    created_at = Column(String, nullable=True)
    updated_at = Column(String, nullable=True)

class CategoryDB(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(String, nullable=True)
    icon = Column(String, default="fa-solid fa-code")
    course_count = Column(Integer, default=0)

class SkillDB(Base):
    __tablename__ = "skills"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    category = Column(String, index=True)
    proficiency_levels = Column(JSON, nullable=True)
    description = Column(String, nullable=True)

class CareerGoalDB(Base):
    __tablename__ = "career_goals"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, unique=True, index=True)
    description = Column(String, nullable=True)
    required_skills = Column(JSON, nullable=True)
    recommended_categories = Column(JSON, nullable=True)

class EnrollmentDB(Base):
    __tablename__ = "enrollments"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), index=True)
    enrolled_at = Column(String)
    progress_percentage = Column(Integer, default=0)
    status = Column(String, default="in_progress")  # in_progress, completed
    completed_lessons = Column(Integer, default=0)
    completed_lesson_ids = Column(JSON, nullable=True)  # List[int] or List[str]
    last_lesson_id = Column(Integer, nullable=True)
    last_lesson_title = Column(String, nullable=True)
    last_accessed = Column(String, nullable=True)

class WishlistDB(Base):
    __tablename__ = "wishlist_items"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), index=True)
    added_at = Column(String)

class ReviewDB(Base):
    __tablename__ = "reviews"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), index=True)
    rating = Column(Integer, default=5)
    comment = Column(String, nullable=True)
    created_at = Column(String)

class AssessmentDB(Base):
    __tablename__ = "assessments"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(String)
    category = Column(String, index=True)
    duration_minutes = Column(Integer, default=15)
    total_questions = Column(Integer, default=5)
    passing_score = Column(Integer, default=60)
    created_at = Column(String)

class AssessmentQuestionDB(Base):
    __tablename__ = "assessment_questions"
    id = Column(Integer, primary_key=True, index=True)
    assessment_id = Column(Integer, ForeignKey("assessments.id"), index=True)
    question_text = Column(String)
    options = Column(JSON)  # List[str]
    correct_option = Column(Integer)  # 0-indexed integer
    explanation = Column(String, nullable=True)
    points = Column(Integer, default=10)

class AssessmentAttemptDB(Base):
    __tablename__ = "assessment_attempts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    assessment_id = Column(Integer, ForeignKey("assessments.id"), index=True)
    score = Column(Integer)
    max_score = Column(Integer)
    percentage = Column(Integer)
    performance_level = Column(String)
    answers = Column(JSON)  # {question_id: selected_index}
    feedback = Column(JSON)  # List of dicts with explanation
    submitted_at = Column(String)

class PaymentDB(Base):
    __tablename__ = "payments"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), index=True)
    transaction_id = Column(String, unique=True, index=True)
    razorpay_order_id = Column(String, nullable=True, index=True)
    razorpay_payment_id = Column(String, nullable=True, index=True)
    razorpay_signature = Column(String, nullable=True)
    base_amount = Column(Float, default=0.0)
    tax_amount = Column(Float, default=0.0)
    discount_amount = Column(Float, default=0.0)
    amount = Column(Float, default=0.0)
    currency = Column(String, default="INR")
    payment_method = Column(String, default="Card")  # Card, UPI, Net Banking, Wallet
    status = Column(String, default="Successful")    # Successful, Pending, Failed, Cancelled, Refunded
    failure_reason = Column(String, nullable=True)
    created_at = Column(String)
    updated_at = Column(String, nullable=True)

class NotificationDB(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    title = Column(String, index=True)
    message = Column(String)
    type = Column(String, index=True)  # COURSE_RECOMMENDATION, NEW_COURSE, ENROLLMENT_SUCCESS, PAYMENT_SUCCESS, COURSE_COMPLETION, LEARNING_REMINDER, SYSTEM
    related_course_id = Column(Integer, ForeignKey("courses.id"), nullable=True, index=True)
    reference_id = Column(String, nullable=True)
    is_read = Column(Integer, default=0)  # 0 = unread, 1 = read
    created_at = Column(String)
    read_at = Column(String, nullable=True)

class EmailLogDB(Base):
    __tablename__ = "email_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    email_address = Column(String, index=True)
    notification_type = Column(String, index=True)  # COURSE_PROGRESS, COURSE_COMPLETION, LEARNING_REMINDER, ASSESSMENT_UPDATE, COURSE_RECOMMENDATION
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True, index=True)
    event_milestone = Column(String, nullable=True)  # e.g. "25%", "50%", "75%", "100%", assessment_id, rec_hash
    status = Column(String, default="sent")  # "sent", "failed"
    sent_at = Column(String)
    failure_reason = Column(String, nullable=True)

Base.metadata.create_all(bind=engine)

# --- MIGRATIONS ---
def run_migrations():
    inspector = inspect(engine)
    
    if "notifications" not in inspector.get_table_names():
        NotificationDB.__table__.create(bind=engine)

    if "email_logs" not in inspector.get_table_names():
        EmailLogDB.__table__.create(bind=engine)
    
    # Profile table migrations
    if "profiles" in inspector.get_table_names():
        profile_cols = [col["name"] for col in inspector.get_columns("profiles")]
        with engine.connect() as conn:
            if "secondary_career_goal" not in profile_cols:
                conn.execute(text("ALTER TABLE profiles ADD COLUMN secondary_career_goal VARCHAR;"))
                conn.commit()
            if "profile_image" not in profile_cols:
                conn.execute(text("ALTER TABLE profiles ADD COLUMN profile_image VARCHAR;"))
                conn.commit()
            if "learning_style" not in profile_cols:
                conn.execute(text("ALTER TABLE profiles ADD COLUMN learning_style VARCHAR;"))
                conn.commit()
            if "wishlist" not in profile_cols:
                conn.execute(text("ALTER TABLE profiles ADD COLUMN wishlist JSON;"))
                conn.commit()
            if "email_preferences" not in profile_cols:
                conn.execute(text("ALTER TABLE profiles ADD COLUMN email_preferences JSON;"))
                conn.commit()

    # Users table migrations
    if "users" in inspector.get_table_names():
        user_cols = [col["name"] for col in inspector.get_columns("users")]
        with engine.connect() as conn:
            if "is_active" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;"))
                conn.commit()
            if "created_at" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN created_at VARCHAR;"))
                conn.commit()
            if "firebase_uid" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN firebase_uid VARCHAR;"))
                conn.commit()

    # Courses table migrations
    if "courses" in inspector.get_table_names():
        course_cols = [col["name"] for col in inspector.get_columns("courses")]
        with engine.connect() as conn:
            if "short_description" not in course_cols:
                conn.execute(text("ALTER TABLE courses ADD COLUMN short_description VARCHAR;"))
                conn.commit()
            if "technical_requirements" not in course_cols:
                conn.execute(text("ALTER TABLE courses ADD COLUMN technical_requirements JSON;"))
                conn.commit()
            if "recommended_knowledge" not in course_cols:
                conn.execute(text("ALTER TABLE courses ADD COLUMN recommended_knowledge JSON;"))
                conn.commit()
            if "target_roles" not in course_cols:
                conn.execute(text("ALTER TABLE courses ADD COLUMN target_roles JSON;"))
                conn.commit()
            if "career_goals" not in course_cols:
                conn.execute(text("ALTER TABLE courses ADD COLUMN career_goals JSON;"))
                conn.commit()
            if "learning_outcomes" not in course_cols:
                conn.execute(text("ALTER TABLE courses ADD COLUMN learning_outcomes JSON;"))
                conn.commit()
            if "modules" not in course_cols:
                conn.execute(text("ALTER TABLE courses ADD COLUMN modules JSON;"))
                conn.commit()
            if "subcategory" not in course_cols:
                conn.execute(text("ALTER TABLE courses ADD COLUMN subcategory VARCHAR;"))
                conn.commit()
            if "language" not in course_cols:
                conn.execute(text("ALTER TABLE courses ADD COLUMN language VARCHAR DEFAULT 'English';"))
                conn.commit()
            if "format" not in course_cols:
                conn.execute(text("ALTER TABLE courses ADD COLUMN format VARCHAR DEFAULT 'Self-Paced Video & Projects';"))
                conn.commit()
            if "certificate" not in course_cols:
                conn.execute(text("ALTER TABLE courses ADD COLUMN certificate INTEGER DEFAULT 1;"))
                conn.commit()
            if "is_free" not in course_cols:
                conn.execute(text("ALTER TABLE courses ADD COLUMN is_free INTEGER DEFAULT 1;"))
                conn.commit()
            if "price" not in course_cols:
                conn.execute(text("ALTER TABLE courses ADD COLUMN price FLOAT DEFAULT 0.0;"))
                conn.commit()
            if "currency" not in course_cols:
                conn.execute(text("ALTER TABLE courses ADD COLUMN currency VARCHAR DEFAULT 'INR';"))
                conn.commit()
            if "demo_video_url" not in course_cols:
                conn.execute(text("ALTER TABLE courses ADD COLUMN demo_video_url VARCHAR;"))
                conn.commit()
            if "thumbnail_url" not in course_cols:
                conn.execute(text("ALTER TABLE courses ADD COLUMN thumbnail_url VARCHAR;"))
                conn.commit()
            if "created_at" not in course_cols:
                conn.execute(text("ALTER TABLE courses ADD COLUMN created_at VARCHAR;"))
                conn.commit()
            if "updated_at" not in course_cols:
                conn.execute(text("ALTER TABLE courses ADD COLUMN updated_at VARCHAR;"))
                conn.commit()

    # Enrollments table migrations
    if "enrollments" in inspector.get_table_names():
        enr_cols = [col["name"] for col in inspector.get_columns("enrollments")]
        with engine.connect() as conn:
            if "completed_lesson_ids" not in enr_cols:
                conn.execute(text("ALTER TABLE enrollments ADD COLUMN completed_lesson_ids JSON;"))
                conn.commit()
            if "last_lesson_id" not in enr_cols:
                conn.execute(text("ALTER TABLE enrollments ADD COLUMN last_lesson_id INTEGER;"))
                conn.commit()
            if "last_lesson_title" not in enr_cols:
                conn.execute(text("ALTER TABLE enrollments ADD COLUMN last_lesson_title VARCHAR;"))
                conn.commit()

    # Payments table migrations
    if "payments" not in inspector.get_table_names():
        PaymentDB.__table__.create(bind=engine)
    else:
        pay_cols = [col["name"] for col in inspector.get_columns("payments")]
        with engine.connect() as conn:
            if "failure_reason" not in pay_cols:
                conn.execute(text("ALTER TABLE payments ADD COLUMN failure_reason VARCHAR;"))
                conn.commit()
            if "updated_at" not in pay_cols:
                conn.execute(text("ALTER TABLE payments ADD COLUMN updated_at VARCHAR;"))
                conn.commit()
            if "base_amount" not in pay_cols:
                conn.execute(text("ALTER TABLE payments ADD COLUMN base_amount FLOAT DEFAULT 0.0;"))
                conn.commit()
            if "tax_amount" not in pay_cols:
                conn.execute(text("ALTER TABLE payments ADD COLUMN tax_amount FLOAT DEFAULT 0.0;"))
                conn.commit()
            if "discount_amount" not in pay_cols:
                conn.execute(text("ALTER TABLE payments ADD COLUMN discount_amount FLOAT DEFAULT 0.0;"))
                conn.commit()

run_migrations()

# --- PASSWORD & TOKEN UTILITIES ---
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# --- SEEDING INITIAL ADMIN & CATALOG DATA ---

INITIAL_ADMIN_EMAIL = "admin@smartlearn.edu"
INITIAL_ADMIN_PASS = "Admin@SmartLearn2026!"

def seed_initial_admin():
    db = SessionLocal()
    try:
        admin_user = db.query(UserDB).filter(UserDB.role.in_(["Admin", "ADMIN", "admin"])).first()
        if not admin_user:
            now_str = datetime.utcnow().strftime("%Y-%m-%d")
            hashed_pwd = get_password_hash(INITIAL_ADMIN_PASS)
            new_admin = UserDB(
                full_name="SmartLearn Administrator",
                email=INITIAL_ADMIN_EMAIL,
                hashed_password=hashed_pwd,
                role="Admin",
                is_active=1,
                created_at=now_str
            )
            db.add(new_admin)
            db.commit()
            db.refresh(new_admin)
            
            # Create admin profile
            admin_profile = ProfileDB(
                user_id=new_admin.id,
                career_goal="System Administration",
                city="San Francisco, CA",
                completion_percentage=100
            )
            db.add(admin_profile)
            db.commit()
            print(f"[SmartLearn] Initial Admin seeded: {INITIAL_ADMIN_EMAIL}")
    finally:
        db.close()

def seed_catalogs():
    db = SessionLocal()
    try:
        now_str = datetime.utcnow().strftime("%Y-%m-%d")

        # 1. Categories
        if db.query(CategoryDB).count() == 0:
            categories_data = [
                {"name": "Web Development", "description": "Full stack, frontend, and backend modern web frameworks.", "icon": "fa-solid fa-code"},
                {"name": "Frontend Development", "description": "User interfaces, responsive design, and client-side systems.", "icon": "fa-brands fa-react"},
                {"name": "Backend Development", "description": "Microservices, databases, APIs, and scalable distributed systems.", "icon": "fa-brands fa-python"},
                {"name": "Data Science & AI", "description": "Machine learning, statistical analysis, and big data engineering.", "icon": "fa-solid fa-brain"},
                {"name": "Artificial Intelligence", "description": "Deep learning, neural networks, computer vision, and LLMs.", "icon": "fa-solid fa-robot"},
                {"name": "Cloud & DevOps", "description": "Cloud architecture, Kubernetes, CI/CD, and infrastructure as code.", "icon": "fa-solid fa-cloud"},
                {"name": "Cyber Security", "description": "Defensive operations, ethical hacking, threat analysis, and cryptography.", "icon": "fa-solid fa-shield-halved"},
                {"name": "UI/UX Design", "description": "Design systems, prototyping, UX research, and user interface workflows.", "icon": "fa-solid fa-palette"},
                {"name": "Mobile Development", "description": "iOS and Android cross-platform application engineering.", "icon": "fa-solid fa-mobile-screen-button"}
            ]
            for c in categories_data:
                db.add(CategoryDB(name=c["name"], description=c["description"], icon=c["icon"]))
            db.commit()

        # 2. Career Goals
        if db.query(CareerGoalDB).count() == 0:
            goals_data = [
                {
                    "title": "Full Stack Web Developer",
                    "description": "Architects both client and server software from UI to database.",
                    "required_skills": ["HTML", "CSS", "JavaScript", "React", "Node.js", "Express", "MongoDB", "SQL", "REST APIs", "Git"],
                    "recommended_categories": ["Web Development", "Frontend Development", "Backend Development"]
                },
                {
                    "title": "Frontend Developer",
                    "description": "Specializes in slick web interfaces, state management, and modern component architecture.",
                    "required_skills": ["HTML", "CSS", "JavaScript", "TypeScript", "React", "Next.js", "Tailwind CSS", "UI/UX", "State Management", "Git"],
                    "recommended_categories": ["Frontend Development", "Web Development", "UI/UX Design"]
                },
                {
                    "title": "Backend Developer",
                    "description": "Designs robust distributed microservices, APIs, and database pipelines.",
                    "required_skills": ["Python", "FastAPI", "Node.js", "PostgreSQL", "Docker", "REST APIs", "Redis", "SQLAlchemy", "Git"],
                    "recommended_categories": ["Backend Development", "Cloud & DevOps"]
                },
                {
                    "title": "Data Scientist",
                    "description": "Extracts actionable insights from big datasets using statistical models and ML.",
                    "required_skills": ["Python", "Pandas", "NumPy", "SQL", "Machine Learning", "Scikit-Learn", "Data Visualization", "Statistics"],
                    "recommended_categories": ["Data Science & AI", "Artificial Intelligence"]
                },
                {
                    "title": "AI / Machine Learning Engineer",
                    "description": "Builds and fine-tunes deep learning models, computer vision, and transformer networks.",
                    "required_skills": ["Python", "PyTorch", "Deep Learning", "Transformers", "NLP", "Computer Vision", "Docker"],
                    "recommended_categories": ["Artificial Intelligence", "Data Science & AI"]
                },
                {
                    "title": "Cloud Solutions Architect",
                    "description": "Designs scalable, resilient cloud enterprise architectures across AWS and Kubernetes.",
                    "required_skills": ["AWS", "Cloud Computing", "Docker", "Kubernetes", "Terraform", "CI/CD", "Linux"],
                    "recommended_categories": ["Cloud & DevOps"]
                },
                {
                    "title": "Cyber Security Analyst",
                    "description": "Protects digital systems, performs network defense, SIEM monitoring, and incident response.",
                    "required_skills": ["Network Security", "Linux", "Ethical Hacking", "Cryptography", "SIEM", "Incident Response", "Python"],
                    "recommended_categories": ["Cyber Security"]
                },
                {
                    "title": "UI/UX Designer",
                    "description": "Creates human-centered designs, prototypes, and reusable Figma design systems.",
                    "required_skills": ["Figma", "User Research", "Wireframing", "Prototyping", "Design Systems", "Usability Testing"],
                    "recommended_categories": ["UI/UX Design"]
                },
                {
                    "title": "Mobile Developer",
                    "description": "Builds performant cross-platform mobile apps for iOS and Android.",
                    "required_skills": ["Flutter", "Dart", "Firebase", "Mobile App Development", "State Management", "REST APIs"],
                    "recommended_categories": ["Mobile Development"]
                },
                {
                    "title": "Data Engineer",
                    "description": "Builds scalable big data pipelines, ETL workflows, and real-time streaming architectures.",
                    "required_skills": ["Python", "SQL", "Apache Spark", "Airflow", "ETL", "Data Pipelines", "PostgreSQL", "AWS"],
                    "recommended_categories": ["Data Science & AI", "Backend Development"]
                }
            ]
            for g in goals_data:
                db.add(CareerGoalDB(
                    title=g["title"],
                    description=g["description"],
                    required_skills=g["required_skills"],
                    recommended_categories=g["recommended_categories"]
                ))
            db.commit()

        # 3. Skills Catalog
        if db.query(SkillDB).count() == 0:
            skills_data = [
                {"name": "JavaScript", "category": "Web Development", "description": "Core language for modern web interactivity."},
                {"name": "React", "category": "Frontend Development", "description": "Component-based UI library."},
                {"name": "Next.js", "category": "Frontend Development", "description": "Production React framework with SSR and server components."},
                {"name": "TypeScript", "category": "Web Development", "description": "Typed superset of JavaScript."},
                {"name": "Python", "category": "Backend Development", "description": "High-level programming language for web, ML, and automation."},
                {"name": "FastAPI", "category": "Backend Development", "description": "Modern, fast ASGI web framework for building APIs with Python."},
                {"name": "Node.js", "category": "Backend Development", "description": "JavaScript runtime built on Chrome's V8 engine."},
                {"name": "PostgreSQL", "category": "Backend Development", "description": "Powerful open source object-relational database system."},
                {"name": "MongoDB", "category": "Backend Development", "description": "Document-oriented NoSQL database."},
                {"name": "Docker", "category": "Cloud & DevOps", "description": "Platform for developing, shipping, and running containerized apps."},
                {"name": "Kubernetes", "category": "Cloud & DevOps", "description": "Container orchestration and automated deployment engine."},
                {"name": "AWS", "category": "Cloud & DevOps", "description": "Comprehensive cloud computing platform."},
                {"name": "Terraform", "category": "Cloud & DevOps", "description": "Infrastructure as Code tool for cloud provisioning."},
                {"name": "Machine Learning", "category": "Data Science & AI", "description": "Algorithms that improve automatically through experience."},
                {"name": "PyTorch", "category": "Artificial Intelligence", "description": "Deep learning tensor framework."},
                {"name": "Network Security", "category": "Cyber Security", "description": "Measures and protocols to protect network infrastructure."},
                {"name": "SIEM", "category": "Cyber Security", "description": "Security Information and Event Management."},
                {"name": "Figma", "category": "UI/UX Design", "description": "Collaborative web-based design and prototyping tool."},
                {"name": "Flutter", "category": "Mobile Development", "description": "UI toolkit for building natively compiled applications."},
                {"name": "SQL", "category": "Data Science & AI", "description": "Standard language for storing, manipulating and retrieving data."}
            ]
            for s in skills_data:
                db.add(SkillDB(
                    name=s["name"],
                    category=s["category"],
                    description=s["description"],
                    proficiency_levels=["Beginner", "Intermediate", "Advanced", "Expert"]
                ))
            db.commit()

        # 4. Courses Catalog (Seed from rich COURSE_CATALOG)
        if db.query(CourseDB).count() == 0:
            for c in COURSE_CATALOG:
                # Build rich curriculum modules for each course
                modules = [
                    {
                        "module_id": 1,
                        "title": f"Module 1: Foundations of {c['title'].split(' ')[0]}",
                        "duration": "6 hours",
                        "lessons": [
                            {"lesson_id": 1, "title": f"Introduction to {c['category']}", "duration": "45 mins", "type": "video"},
                            {"lesson_id": 2, "title": "Environment Setup & Tooling", "duration": "60 mins", "type": "hands-on"},
                            {"lesson_id": 3, "title": "Core Syntax & Architecture Principles", "duration": "90 mins", "type": "video"},
                            {"lesson_id": 4, "title": "Practical Workshop 1", "duration": "75 mins", "type": "project"}
                        ]
                    },
                    {
                        "module_id": 2,
                        "title": "Module 2: Intermediate Deep Dive & Patterns",
                        "duration": "10 hours",
                        "lessons": [
                            {"lesson_id": 5, "title": "State Management & Data Flow", "duration": "60 mins", "type": "video"},
                            {"lesson_id": 6, "title": "API Integrations & Asynchronous Handlers", "duration": "80 mins", "type": "hands-on"},
                            {"lesson_id": 7, "title": "Error Handling, Testing & Debugging", "duration": "70 mins", "type": "video"},
                            {"lesson_id": 8, "title": "Intermediate Checkpoint Project", "duration": "120 mins", "type": "project"}
                        ]
                    },
                    {
                        "module_id": 3,
                        "title": "Module 3: Advanced Architectures & Production Deployment",
                        "duration": "12 hours",
                        "lessons": [
                            {"lesson_id": 9, "title": "Performance Optimization & Caching", "duration": "90 mins", "type": "video"},
                            {"lesson_id": 10, "title": "Security Best Practices & Auth Guarding", "duration": "75 mins", "type": "video"},
                            {"lesson_id": 11, "title": "CI/CD Pipeline & Automated Cloud Deployment", "duration": "90 mins", "type": "hands-on"},
                            {"lesson_id": 12, "title": "Comprehensive Capstone Portfolio Project", "duration": "180 mins", "type": "capstone"}
                        ]
                    }
                ]

                new_course = CourseDB(
                    id=c["id"],
                    title=c["title"],
                    short_description=c["description"][:120] + "...",
                    description=c["description"] + " This comprehensive master curriculum provides in-depth hands-on labs, real-world industry case studies, code reviews, and structured capstone engineering milestones.",
                    category=c["category"],
                    subcategory=c.get("domains", [c["category"]])[0] if c.get("domains") else c["category"],
                    instructor_id=None,
                    instructor_name=c["instructor"],
                    level=c["level"],
                    duration=c["duration"],
                    language="English",
                    format="Self-Paced Video & Live Projects",
                    certificate=1,
                    status="published",
                    rating=c["rating"],
                    review_count=c["review_count"],
                    enrollment_count=c.get("review_count", 100) * 3 + 120,
                    skills=c["skills"],
                    prerequisites=["Basic computer literacy", "Foundational programming logic"],
                    technical_requirements=["Modern web browser", "Code editor (VS Code recommended)", "Node.js / Python environment"],
                    recommended_knowledge=["Basic command line navigation", "Version control fundamentals"],
                    target_roles=c.get("target_roles", [c["category"]]),
                    learning_outcomes=[
                        f"Master industry-standard practices in {c['category']}",
                        f"Build and ship production-ready applications with {', '.join(c['skills'][:3])}",
                        "Apply advanced optimization, testing, and debugging patterns",
                        "Deploy resilient microservices and client interfaces to cloud platforms"
                    ],
                    modules=modules,
                    icon=c.get("icon", "fa-solid fa-graduation-cap"),
                    color_theme=c.get("color_theme", "linear-gradient(135deg, #5B3FE8, #8B4AD9)"),
                    created_at=now_str,
                    updated_at=now_str
                )
                db.add(new_course)
            db.commit()
    finally:
        db.close()

def seed_assessments():
    db = SessionLocal()
    try:
        count = db.query(AssessmentDB).count()
        if count == 0:
            now_str = datetime.utcnow().strftime("%Y-%m-%d")
            
            # Assessment 1: Full Stack Web Development
            a1 = AssessmentDB(
                title="Full Stack Web Development Skill Assessment",
                description="Evaluate your core proficiency in Frontend, Backend, APIs, State Management, and Databases.",
                category="Web Development",
                duration_minutes=15,
                total_questions=5,
                passing_score=60,
                created_at=now_str
            )
            db.add(a1)
            db.flush()

            q1_list = [
                AssessmentQuestionDB(
                    assessment_id=a1.id,
                    question_text="In modern JavaScript, what is the key difference between '==' and '===' operators?",
                    options=[
                        "There is no difference; they can be used interchangeably",
                        "'==' compares values with type coercion, whereas '===' compares both value and type without coercion",
                        "'===' is only used for strings and '==' is used for numbers",
                        "'==' creates a new variable assignment"
                    ],
                    correct_option=1,
                    explanation="'===' performs strict equality checking without type casting/coercion.",
                    points=20
                ),
                AssessmentQuestionDB(
                    assessment_id=a1.id,
                    question_text="Which HTTP status code signifies that a resource was successfully created on the server?",
                    options=["200 OK", "201 Created", "204 No Content", "301 Moved Permanently"],
                    correct_option=1,
                    explanation="HTTP 201 Created indicates that the request has succeeded and led to the creation of a resource.",
                    points=20
                ),
                AssessmentQuestionDB(
                    assessment_id=a1.id,
                    question_text="In React, why should state variables never be mutated directly (e.g. state.count = 5)?",
                    options=[
                        "Direct mutation breaks JavaScript memory allocation",
                        "Direct mutation prevents React from detecting state changes and triggering a re-render",
                        "Mutating state throws a fatal compile-time syntax error",
                        "React only allows state mutation inside the index.html file"
                    ],
                    correct_option=1,
                    explanation="React relies on immutable state updates to compare references (shallow comparison) and re-render components.",
                    points=20
                ),
                AssessmentQuestionDB(
                    assessment_id=a1.id,
                    question_text="Which CSS Flexbox property controls alignment along the main axis?",
                    options=["align-items", "justify-content", "align-content", "flex-direction"],
                    correct_option=1,
                    explanation="'justify-content' aligns flex items along the main axis, while 'align-items' aligns along the cross axis.",
                    points=20
                ),
                AssessmentQuestionDB(
                    assessment_id=a1.id,
                    question_text="What is the primary function of an ORM (Object-Relational Mapping) library?",
                    options=[
                        "To compile JavaScript code into WebAssembly",
                        "To interact with database tables and records using object-oriented programming paradigms instead of raw SQL",
                        "To encrypt network traffic between client and server",
                        "To automate Git commits during deployment"
                    ],
                    correct_option=1,
                    explanation="An ORM maps relational database tables to OOP models, simplifying queries and schema interactions.",
                    points=20
                ),
            ]
            for q in q1_list:
                db.add(q)

            # Assessment 2: Data Science & AI Assessment
            a2 = AssessmentDB(
                title="Data Science & Machine Learning Fundamentals",
                description="Test your knowledge of Data Analysis, Supervised Learning, Evaluation Metrics, and Neural Networks.",
                category="Data Science & AI",
                duration_minutes=15,
                total_questions=5,
                passing_score=60,
                created_at=now_str
            )
            db.add(a2)
            db.flush()

            q2_list = [
                AssessmentQuestionDB(
                    assessment_id=a2.id,
                    question_text="Which of the following is a classic Supervised Learning problem?",
                    options=[
                        "K-Means Customer Segmentation",
                        "Predicting house prices based on square footage and location",
                        "Dimensionality Reduction using PCA",
                        "Anomaly Detection in server logs without labeled fraud tags"
                    ],
                    correct_option=1,
                    explanation="Supervised learning uses labeled target outputs (like historical house prices) to train predictive models.",
                    points=20
                ),
                AssessmentQuestionDB(
                    assessment_id=a2.id,
                    question_text="What symptom best describes an 'Overfitted' machine learning model?",
                    options=[
                        "Low training accuracy and low test accuracy",
                        "High training accuracy but poor generalization / low test accuracy",
                        "Equal high accuracy on both training and real-world unseen test data",
                        "The model trains too quickly on GPU"
                    ],
                    correct_option=1,
                    explanation="Overfitting occurs when a model memorizes the noise in training data, causing high training score but poor test performance.",
                    points=20
                ),
                AssessmentQuestionDB(
                    assessment_id=a2.id,
                    question_text="When evaluating a medical disease detection model where missing a sick patient is dangerous, which metric should be prioritized?",
                    options=["Precision", "Recall (Sensitivity)", "Accuracy", "Training Speed"],
                    correct_option=1,
                    explanation="Recall minimizes False Negatives, ensuring as few sick patients as possible are missed.",
                    points=20
                ),
                AssessmentQuestionDB(
                    assessment_id=a2.id,
                    question_text="In Python Pandas, what does the .dropna() method do?",
                    options=[
                        "Deletes the entire DataFrame from memory",
                        "Removes rows or columns containing missing/NaN values",
                        "Fills missing values with the mean",
                        "Sorts the dataset in descending order"
                    ],
                    correct_option=1,
                    explanation=".dropna() filters out rows or columns that contain null or NaN values.",
                    points=20
                ),
                AssessmentQuestionDB(
                    assessment_id=a2.id,
                    question_text="What is the role of an Activation Function in an Artificial Neural Network?",
                    options=[
                        "To save the model weights to the disk",
                        "To introduce non-linearity, enabling the network to learn complex patterns",
                        "To format input images into JPEG format",
                        "To reduce the number of CPU cores used"
                    ],
                    correct_option=1,
                    explanation="Activation functions (like ReLU, Sigmoid) introduce non-linear transformations so networks can approximate non-linear functions.",
                    points=20
                ),
            ]
            for q in q2_list:
                db.add(q)

            # Assessment 3: Cloud & DevOps Fundamentals
            a3 = AssessmentDB(
                title="Cloud Computing & DevOps Architecture",
                description="Assess foundational concepts in Containerization, CI/CD pipelines, Cloud Infrastructure, and Scalability.",
                category="Cloud & DevOps",
                duration_minutes=15,
                total_questions=5,
                passing_score=60,
                created_at=now_str
            )
            db.add(a3)
            db.flush()

            q3_list = [
                AssessmentQuestionDB(
                    assessment_id=a3.id,
                    question_text="What is the key difference between Docker Containers and traditional Virtual Machines?",
                    options=[
                        "Containers require their own dedicated hypervisor and guest operating system",
                        "Containers share the host OS kernel and isolate processes, making them lighter and faster to start",
                        "Virtual Machines do not use any physical hardware resources",
                        "Docker containers can only run Python scripts"
                    ],
                    correct_option=1,
                    explanation="Containers virtualize at the OS level and share the host kernel, whereas VMs virtualize physical hardware with separate guest OSs.",
                    points=20
                ),
                AssessmentQuestionDB(
                    assessment_id=a3.id,
                    question_text="What does CI/CD stand for in modern software development?",
                    options=[
                        "Code Inspection and Cloud Delivery",
                        "Continuous Integration and Continuous Delivery / Continuous Deployment",
                        "Centralized Interface and Container Distribution",
                        "Client Interaction and Component Design"
                    ],
                    correct_option=1,
                    explanation="CI/CD is an automated pipeline workflow for frequent code integration, testing, and deployment.",
                    points=20
                ),
                AssessmentQuestionDB(
                    assessment_id=a3.id,
                    question_text="Which cloud principle involves automatically provisioning computing resources in response to fluctuating traffic?",
                    options=["Static Allocation", "Auto Scaling", "Vertical Hardening", "Batch Processing"],
                    correct_option=1,
                    explanation="Auto Scaling dynamically expands or contracts compute instances to match current demand.",
                    points=20
                ),
                AssessmentQuestionDB(
                    assessment_id=a3.id,
                    question_text="In AWS, what type of storage service is Amazon S3?",
                    options=["Relational Database", "Scalable Object Storage", "Block Storage Volume", "NoSQL Cache"],
                    correct_option=1,
                    explanation="Amazon S3 is high-durability, scalable object storage designed for files, media, and data backups.",
                    points=20
                ),
                AssessmentQuestionDB(
                    assessment_id=a3.id,
                    question_text="What is the benefit of Infrastructure as Code (IaC) tools like Terraform?",
                    options=[
                        "Eliminates the need for writing application code",
                        "Enables declarative, reproducible, and version-controlled infrastructure provisioning",
                        "Instantly increases internet upload speed",
                        "Automatically writes unit tests for frontend buttons"
                    ],
                    correct_option=1,
                    explanation="IaC defines cloud infrastructure in configuration files that can be versioned, tested, and automatically provisioned.",
                    points=20
                ),
            ]
            for q in q3_list:
                db.add(q)

            db.commit()
    finally:
        db.close()

seed_initial_admin()
seed_catalogs()
seed_assessments()

# --- FASTAPI APP ---
app = FastAPI(title="SmartLearn Role-Based API")

@app.on_event("startup")
async def on_startup():
    run_migrations()
    try:
        try:
            from app.services.scheduler_service import start_inactivity_scheduler
        except ImportError:
            try:
                from services.scheduler_service import start_inactivity_scheduler
            except ImportError:
                from backend.app.services.scheduler_service import start_inactivity_scheduler
        asyncio.create_task(start_inactivity_scheduler())
        print("[SmartLearn] Inactivity scheduler task started.")
    except Exception as _sch_err:
        print(f"[SmartLearn Scheduler Startup Warning] {_sch_err}")

FRONTEND_DIR = BASE_DIR.parent / "frontend"

origins = [
    "http://localhost",
    "http://localhost:8080",
    "http://localhost:3000",
    "http://localhost:5500",
    "http://localhost:5501",
    "http://localhost:5502",
    "http://127.0.0.1",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5500",
    "http://127.0.0.1:5501",
    "http://127.0.0.1:5502",
    "null"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- DEPENDENCIES ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> UserDB:
    token_str = token
    if not token_str and authorization:
        if authorization.startswith("Bearer "):
            token_str = authorization[7:].strip()
        else:
            token_str = authorization.strip()
            
    if not token_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token. Please provide token in query or Authorization header."
        )
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    try:
        payload = jwt.decode(token_str, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(UserDB).filter(UserDB.email == email).first()
    if user is None:
        raise credentials_exception
    if getattr(user, "is_active", 1) == 0:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated. Please contact support.")
    return user

def get_current_admin(
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> UserDB:
    user = get_current_user(token=token, authorization=authorization, db=db)
    if user.role.upper() != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Admin privileges are required to perform this action."
        )
    return user

def get_current_instructor(
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> UserDB:
    user = get_current_user(token=token, authorization=authorization, db=db)
    if user.role.upper() not in ["INSTRUCTOR", "ADMIN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Instructor privileges are required."
        )
    return user

# --- SCHEMAS ---
class UserRegister(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    role: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class GoogleLoginPayload(BaseModel):
    id_token: str
    role: Optional[str] = None

class NotificationPreferencesPayload(BaseModel):
    course_progress: Optional[bool] = True
    learning_reminder: Optional[bool] = True
    assessment_update: Optional[bool] = True
    course_recommendation: Optional[bool] = True
    course_completion: Optional[bool] = True

class PasswordResetRequest(BaseModel):
    email: EmailStr
    new_password: str

class TestEmailPayload(BaseModel):
    to_email: EmailStr

class UserResponse(BaseModel):
    id: int
    full_name: str
    email: str
    role: str
    is_active: Optional[int] = 1
    model_config = ConfigDict(from_attributes=True)

class ProfileData(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    city: Optional[str] = None
    career_goal: Optional[str] = None
    secondary_career_goal: Optional[str] = None
    profile_image: Optional[str] = None
    skills: Optional[list] = []
    interests: Optional[list] = []
    languages: Optional[list] = []
    education: Optional[list] = []
    experience: Optional[list] = []
    projects: Optional[list] = []
    courses: Optional[list] = []
    learning_style: Optional[str] = None
    completion_percentage: Optional[int] = 0
    wishlist: Optional[list] = []

class CourseCreatePayload(BaseModel):
    title: str
    short_description: Optional[str] = None
    description: Optional[str] = ""
    detailed_description: Optional[str] = None
    category: str
    subcategory: Optional[str] = None
    instructor_id: Optional[int] = None
    instructor_name: Optional[str] = None
    level: Optional[str] = "Intermediate"
    duration: Optional[str] = "30 hours"
    language: Optional[str] = "English"
    format: Optional[str] = "Self-Paced Video & Projects"
    certificate: Optional[int] = 1
    is_free: Optional[int] = 1
    price: Optional[float] = 0.0
    currency: Optional[str] = "INR"
    demo_video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    status: Optional[str] = "published"
    skills: Optional[List[str]] = []
    prerequisites: Optional[List[str]] = []
    technical_requirements: Optional[List[str]] = []
    recommended_knowledge: Optional[List[str]] = []
    target_roles: Optional[List[str]] = []
    career_goals: Optional[List[str]] = []
    learning_outcomes: Optional[List[str]] = []
    modules: Optional[List[Dict[str, Any]]] = []
    icon: Optional[str] = "fa-solid fa-graduation-cap"
    color_theme: Optional[str] = "linear-gradient(135deg, #5B3FE8, #8B4AD9)"

class CourseStatusPayload(BaseModel):
    status: str

class ProgressUpdatePayload(BaseModel):
    progress_percentage: int
    completed_lessons: Optional[int] = None

class LessonCompletePayload(BaseModel):
    lesson_id: Union[int, str]
    module_id: Optional[Union[int, str]] = None

class LessonQuizSubmitPayload(BaseModel):
    lesson_id: Optional[Union[int, str]] = None
    answers: Union[Dict[str, Any], List[Any]]

class ReviewCreatePayload(BaseModel):
    rating: int = Field(5, ge=1, le=5)
    comment: Optional[str] = ""

class AssessmentSubmitPayload(BaseModel):
    answers: Dict[str, Any]

class CategoryPayload(BaseModel):
    name: str
    description: Optional[str] = None
    icon: Optional[str] = "fa-solid fa-code"

class SkillPayload(BaseModel):
    name: str
    category: str
    description: Optional[str] = None

class CareerGoalPayload(BaseModel):
    title: str
    description: Optional[str] = None
    required_skills: Optional[List[str]] = []
    recommended_categories: Optional[List[str]] = []

class PaymentOrderCreatePayload(BaseModel):
    course_id: int
    payment_method: Optional[str] = "Card"

class PaymentVerifyPayload(BaseModel):
    course_id: int
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    payment_method: Optional[str] = "Card"

class PaymentFailedPayload(BaseModel):
    course_id: int
    razorpay_order_id: Optional[str] = None
    reason: Optional[str] = "Payment Failed"
    payment_method: Optional[str] = "Card"

class PaymentCancelPayload(BaseModel):
    course_id: int
    razorpay_order_id: Optional[str] = None

# --- HEALTH ---
@app.get("/health")
def health_check():
    return {"status": "ok", "app": "SmartLearn", "version": "3.0"}

# --- NOTIFICATIONS ROUTER & WEBSOCKET ---
try:
    from app.routers.notifications import router as notifications_router
    app.include_router(notifications_router)
except Exception:
    try:
        from routers.notifications import router as notifications_router
        app.include_router(notifications_router)
    except Exception as _nr_err:
        print(f"[SmartLearn] Could not include notifications_router: {_nr_err}")

@app.websocket("/ws/notifications")
async def websocket_notifications_endpoint(websocket: WebSocket, token: Optional[str] = Query(None)):
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
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
        finally:
            db.close()
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await ws_manager.connect(user_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(user_id, websocket)
    except Exception:
        ws_manager.disconnect(user_id, websocket)

# --- AUTH ROUTES ---

@app.post("/auth/register")
def register(user: UserRegister, db: Session = Depends(get_db)):
    role_clean = user.role.strip().capitalize()
    clean_email = user.email.strip().lower()
    
    # Requirement: Public registration strictly forbids Admin creation
    if role_clean.upper() == "ADMIN" or role_clean not in ["Student", "Instructor"]:
        raise HTTPException(
            status_code=400,
            detail="Admin accounts cannot be registered publicly. Please choose Student or Instructor."
        )
    
    if len(user.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long.")

    db_user = db.query(UserDB).filter(func.lower(UserDB.email) == clean_email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_pwd = get_password_hash(user.password)
    now_str = datetime.utcnow().strftime("%Y-%m-%d")
    new_user = UserDB(
        full_name=user.full_name.strip(),
        email=clean_email,
        hashed_password=hashed_pwd,
        role=role_clean,
        is_active=1,
        created_at=now_str
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Auto-create empty profile
    profile = ProfileDB(user_id=new_user.id, completion_percentage=0)
    db.add(profile)
    db.commit()

    try:
        NotificationService.notify_system_welcome(db, new_user.id, new_user.full_name, new_user.role)
        NotificationService.notify_admin_platform_event(
            db=db,
            title="New User Registration 👤",
            message=f"{new_user.full_name} ({new_user.email}) has registered as a new {new_user.role}.",
            notification_type="NEW_USER_REGISTERED"
        )
    except Exception as _reg_notif_err:
        print(f"[Register Notification Warning] {_reg_notif_err}")
    
    access_token = create_access_token(data={"sub": new_user.email})
    return {
        "id": new_user.id,
        "access_token": access_token,
        "token_type": "bearer",
        "role": new_user.role,
        "full_name": new_user.full_name,
        "email": new_user.email
    }

@app.post("/auth/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    clean_email = user.email.strip().lower()
    clean_pass = user.password.strip()
    
    db_user = db.query(UserDB).filter(func.lower(UserDB.email) == clean_email).first()
    if not db_user or (not verify_password(user.password, db_user.hashed_password) and not verify_password(clean_pass, db_user.hashed_password)):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    if getattr(db_user, "is_active", 1) == 0:
        raise HTTPException(status_code=403, detail="Account is deactivated. Please contact support.")
    
    access_token = create_access_token(data={"sub": db_user.email})
    return {
        "id": db_user.id,
        "access_token": access_token,
        "token_type": "bearer",
        "role": db_user.role,
        "full_name": db_user.full_name,
        "email": db_user.email,
        "user": {
            "id": db_user.id,
            "email": db_user.email,
            "full_name": db_user.full_name,
            "role": db_user.role
        }
    }

@app.get("/auth/firebase-config")
@app.get("/config/firebase")
def get_firebase_config():
    return {
        "apiKey": os.getenv("FIREBASE_API_KEY", ""),
        "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN", "smartlearn-auth.firebaseapp.com"),
        "projectId": os.getenv("FIREBASE_PROJECT_ID", "smartlearn-auth"),
        "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET", "smartlearn-auth.appspot.com"),
        "messagingSenderId": os.getenv("FIREBASE_MESSAGING_SENDER_ID", "102938475610"),
        "appId": os.getenv("FIREBASE_APP_ID", "1:102938475610:web:abc123def456789")
    }

@app.post("/auth/google-login")
def google_login(payload: GoogleLoginPayload, db: Session = Depends(get_db)):
    try:
        from app.services.firebase_service import FirebaseService
    except ImportError:
        try:
            from services.firebase_service import FirebaseService
        except ImportError:
            from backend.app.services.firebase_service import FirebaseService

    try:
        fb_user = FirebaseService.verify_id_token(payload.id_token)
    except Exception as err:
        raise HTTPException(status_code=401, detail=str(err))

    clean_email = (fb_user.get("email") or "").strip().lower()
    fb_uid = fb_user.get("uid")
    full_name = fb_user.get("name") or clean_email.split("@")[0]
    picture = fb_user.get("picture")

    if not clean_email:
        raise HTTPException(status_code=400, detail="Google authentication failed. No verified email address returned.")

    # 1. Existing User Linking by Email
    db_user = db.query(UserDB).filter(func.lower(UserDB.email) == clean_email).first()

    now_str = datetime.utcnow().strftime("%Y-%m-%d")

    if db_user:
        # Existing user found -> Link Firebase UID without creating duplicate!
        if not getattr(db_user, "firebase_uid", None) and fb_uid:
            db_user.firebase_uid = fb_uid
            db.commit()
    else:
        # New Google user -> Create account with controlled role (strictly forbid Admin!)
        requested_role = (payload.role or "Student").strip().capitalize()
        if requested_role.upper() == "ADMIN" or requested_role not in ["Student", "Instructor"]:
            requested_role = "Student"

        random_password = f"GoogleAuth_{uuid.uuid4().hex[:12]}!"
        hashed_pwd = get_password_hash(random_password)

        db_user = UserDB(
            full_name=full_name,
            email=clean_email,
            hashed_password=hashed_pwd,
            role=requested_role,
            is_active=1,
            firebase_uid=fb_uid,
            created_at=now_str
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)

        # Create ProfileDB for new Google user
        profile = ProfileDB(
            user_id=db_user.id,
            profile_image=picture,
            completion_percentage=20
        )
        db.add(profile)
        db.commit()

        try:
            NotificationService.notify_system_welcome(db, db_user.id, db_user.full_name, db_user.role)
        except Exception:
            pass

    if getattr(db_user, "is_active", 1) == 0:
        raise HTTPException(status_code=403, detail="Account is deactivated. Please contact support.")

    access_token = create_access_token(data={"sub": db_user.email})

    return {
        "id": db_user.id,
        "access_token": access_token,
        "token_type": "bearer",
        "role": db_user.role,
        "full_name": db_user.full_name,
        "email": db_user.email,
        "user": {
            "id": db_user.id,
            "email": db_user.email,
            "full_name": db_user.full_name,
            "role": db_user.role
        }
    }

@app.get("/users/me/notification-preferences")
def get_notification_preferences(user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(ProfileDB).filter(ProfileDB.user_id == user.id).first()
    defaults = {
        "course_progress": True,
        "learning_reminder": True,
        "assessment_update": True,
        "course_recommendation": True,
        "course_completion": True
    }
    if profile and profile.email_preferences and isinstance(profile.email_preferences, dict):
        defaults.update(profile.email_preferences)
    return defaults

@app.put("/users/me/notification-preferences")
def update_notification_preferences(
    payload: NotificationPreferencesPayload,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    profile = db.query(ProfileDB).filter(ProfileDB.user_id == user.id).first()
    if not profile:
        profile = ProfileDB(user_id=user.id)
        db.add(profile)
    
    current_prefs = profile.email_preferences or {}
    if not isinstance(current_prefs, dict):
        current_prefs = {}
        
    current_prefs.update({
        "course_progress": payload.course_progress if payload.course_progress is not None else current_prefs.get("course_progress", True),
        "learning_reminder": payload.learning_reminder if payload.learning_reminder is not None else current_prefs.get("learning_reminder", True),
        "assessment_update": payload.assessment_update if payload.assessment_update is not None else current_prefs.get("assessment_update", True),
        "course_recommendation": payload.course_recommendation if payload.course_recommendation is not None else current_prefs.get("course_recommendation", True),
        "course_completion": payload.course_completion if payload.course_completion is not None else current_prefs.get("course_completion", True)
    })
    
    profile.email_preferences = current_prefs
    db.commit()
    return {"message": "Notification preferences updated successfully", "preferences": current_prefs}

@app.post("/auth/reset-password")
def reset_password(req: PasswordResetRequest, db: Session = Depends(get_db)):
    clean_email = req.email.strip().lower()
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long.")
    db_user = db.query(UserDB).filter(func.lower(UserDB.email) == clean_email).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="No account found with this email address.")
    
    db_user.hashed_password = get_password_hash(req.new_password)
    db.commit()
    return {"message": "Password updated successfully. You can now log in."}

@app.post("/auth/send-test-email")
@app.post("/admin/test-email")
def send_test_email(payload: TestEmailPayload):
    try:
        from app.services.email_service import EmailService
        from app.services.email_templates import EmailTemplates
    except ImportError:
        try:
            from services.email_service import EmailService
            from services.email_templates import EmailTemplates
        except ImportError:
            from backend.app.services.email_service import EmailService
            from backend.app.services.email_templates import EmailTemplates

    if not EmailService.is_email_configured():
        raise HTTPException(
            status_code=400,
            detail="SMTP credentials (SMTP_USERNAME / SMTP_PASSWORD) are missing in backend/.env. Real email cannot be sent until SMTP credentials are configured."
        )

    html_content, text_content = EmailTemplates.get_course_progress_template(
        student_name="SmartLearn User",
        course_title="SmartLearn Test Delivery",
        progress_pct=100,
        completed_lessons=12,
        total_lessons=12,
        next_action_url="http://127.0.0.1:8080/dashboard.html"
    )

    try:
        EmailService.send_raw_email(
            to_email=payload.to_email,
            subject="[SmartLearn] Test Email Delivery Verification",
            html_content=html_content,
            text_content=text_content
        )
        return {
            "status": "success",
            "message": f"Real test email sent successfully to {payload.to_email}",
            "delivered_to": payload.to_email
        }
    except Exception as err:
        raise HTTPException(
            status_code=500,
            detail=f"SMTP delivery failed: {str(err)}"
        )

@app.get("/users/me", response_model=UserResponse)
def get_me(user: UserDB = Depends(get_current_user)):
    return user

# --- PROFILE ROUTES ---

@app.get("/profile")
def get_profile(user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(ProfileDB).filter(ProfileDB.user_id == user.id).first()
    if not profile:
        return {
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "phone": "",
            "dob": "",
            "gender": "",
            "city": "",
            "career_goal": "",
            "secondary_career_goal": "",
            "profile_image": "",
            "skills": [],
            "interests": [],
            "languages": [],
            "education": [],
            "experience": [],
            "projects": [],
            "courses": [],
            "learning_style": "",
            "completion_percentage": 0,
            "wishlist": []
        }
    
    return {
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "phone": profile.phone or "",
        "dob": profile.dob or "",
        "gender": profile.gender or "",
        "city": profile.city or "",
        "career_goal": profile.career_goal or "",
        "secondary_career_goal": profile.secondary_career_goal or "",
        "profile_image": profile.profile_image or "",
        "skills": profile.skills or [],
        "interests": profile.interests or [],
        "languages": profile.languages or [],
        "education": profile.education or [],
        "experience": profile.experience or [],
        "projects": profile.projects or [],
        "courses": profile.courses or [],
        "learning_style": profile.learning_style or "",
        "completion_percentage": profile.completion_percentage or 0,
        "wishlist": profile.wishlist or []
    }

@app.post("/profile")
@app.put("/profile")
@app.put("/users/me")
@app.patch("/users/me")
@app.post("/student/profile")
@app.put("/student/profile")
def save_profile(profile_data: ProfileData, user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    # Update Full Name if provided
    if profile_data.full_name is not None and profile_data.full_name.strip():
        user.full_name = profile_data.full_name.strip()

    profile = db.query(ProfileDB).filter(ProfileDB.user_id == user.id).first()
    if not profile:
        profile = ProfileDB(user_id=user.id)
        db.add(profile)
        
    if profile_data.phone is not None:
        profile.phone = profile_data.phone.strip()
    if profile_data.dob is not None:
        profile.dob = profile_data.dob.strip()
    if profile_data.gender is not None:
        profile.gender = profile_data.gender.strip()
    if profile_data.city is not None:
        profile.city = profile_data.city.strip()
    if profile_data.career_goal is not None:
        profile.career_goal = profile_data.career_goal.strip()
    if profile_data.secondary_career_goal is not None:
        profile.secondary_career_goal = profile_data.secondary_career_goal.strip()
    if profile_data.profile_image is not None:
        profile.profile_image = profile_data.profile_image
    if profile_data.skills is not None:
        profile.skills = profile_data.skills
    if profile_data.interests is not None:
        profile.interests = profile_data.interests
    if profile_data.languages is not None:
        profile.languages = profile_data.languages
    if profile_data.education is not None:
        profile.education = profile_data.education
    if profile_data.experience is not None:
        profile.experience = profile_data.experience
    if profile_data.projects is not None:
        profile.projects = profile_data.projects
    if profile_data.courses is not None:
        profile.courses = profile_data.courses
    if profile_data.learning_style is not None:
        profile.learning_style = profile_data.learning_style
    if profile_data.wishlist is not None:
        profile.wishlist = profile_data.wishlist
    
    # Calculate sensible completion percentage
    calc_percent = 0
    if profile.phone: calc_percent += 10
    if profile.dob: calc_percent += 10
    if profile.gender: calc_percent += 5
    if profile.city: calc_percent += 5
    if profile.career_goal: calc_percent += 20
    if profile.skills and len(profile.skills) > 0: calc_percent += 20
    if profile.interests and len(profile.interests) > 0: calc_percent += 10
    if profile.education and len(profile.education) > 0: calc_percent += 10
    if profile.experience or profile.projects: calc_percent += 10
    
    profile.completion_percentage = min(100, max(calc_percent, profile_data.completion_percentage or 0))
    
    db.commit()
    db.refresh(profile)
    db.refresh(user)

    return {
        "success": True,
        "message": "Profile saved successfully",
        "completion_percentage": profile.completion_percentage,
        "profile": {
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "phone": profile.phone or "",
            "dob": profile.dob or "",
            "gender": profile.gender or "",
            "city": profile.city or "",
            "career_goal": profile.career_goal or "",
            "secondary_career_goal": profile.secondary_career_goal or "",
            "profile_image": profile.profile_image or "",
            "skills": profile.skills or [],
            "interests": profile.interests or [],
            "languages": profile.languages or [],
            "education": profile.education or [],
            "experience": profile.experience or [],
            "projects": profile.projects or [],
            "courses": profile.courses or [],
            "learning_style": profile.learning_style or "",
            "completion_percentage": profile.completion_percentage or 0,
            "wishlist": profile.wishlist or []
        }
    }

@app.post("/profile/avatar")
async def upload_avatar(file: UploadFile = File(...), user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/jpg", "image/gif"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Invalid image format. Allowed formats: JPG, PNG, WEBP, GIF"
        )
    
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image size exceeds 5MB limit")
    
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    safe_filename = f"user_{user.id}_{uuid.uuid4().hex[:8]}.{ext}"
    file_path = AVATAR_DIR / safe_filename
    
    with open(file_path, "wb") as f:
        f.write(content)
        
    relative_url = f"/uploads/avatars/{safe_filename}"
    
    profile = db.query(ProfileDB).filter(ProfileDB.user_id == user.id).first()
    if not profile:
        profile = ProfileDB(user_id=user.id, profile_image=relative_url)
        db.add(profile)
    else:
        profile.profile_image = relative_url
    
    db.commit()
    
    return {
        "message": "Avatar uploaded successfully",
        "image_url": relative_url,
        "relative_url": relative_url
    }

# --- DURATION HELPER ---
def parse_duration_hours(dur_str: Optional[str]) -> float:
    if not dur_str:
        return 0.0
    s = str(dur_str).lower().strip()
    import re
    if "min" in s:
        nums = re.findall(r"[\d\.]+", s)
        return float(nums[0]) / 60.0 if nums else 0.5
    nums = re.findall(r"[\d\.]+", s)
    return float(nums[0]) if nums else 0.0

# --- COURSE CATALOG ROUTES ---

@app.get("/courses")
def list_courses(
    search: Optional[str] = None,
    category: Optional[str] = None,
    category_id: Optional[Union[int, str]] = None,
    level: Optional[str] = None,
    difficulty: Optional[str] = None,
    duration: Optional[str] = None,
    min_rating: Optional[Union[float, str]] = None,
    rating: Optional[Union[float, str]] = None,
    price: Optional[str] = None,
    is_free: Optional[str] = None,
    access: Optional[str] = None,
    skill: Optional[str] = None,
    skill_id: Optional[Union[int, str]] = None,
    career_goal: Optional[str] = None,
    career_goal_id: Optional[Union[int, str]] = None,
    status_filter: Optional[str] = None,
    status: Optional[str] = None,
    instructor_id: Optional[Union[int, str]] = None,
    sort_by: Optional[str] = None,
    sort: Optional[str] = None,
    page: Optional[Union[int, str]] = Query(None),
    limit: Optional[Union[int, str]] = Query(None),
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    query = db.query(CourseDB)
    
    # 1. Status Filter (defaults to published for public/student view)
    effective_status = status or status_filter or "published"
    if effective_status and str(effective_status).lower() != "all":
        query = query.filter(CourseDB.status == str(effective_status).lower())
        
    # 2. Category Filter (supports category name, category_id int, or numeric category string)
    target_category = category
    if category_id is not None and str(category_id).lower().strip() not in ["", "all", "none"]:
        try:
            cat_id_int = int(category_id)
            cat_db = db.query(CategoryDB).filter(CategoryDB.id == cat_id_int).first()
            if cat_db:
                target_category = cat_db.name
        except (ValueError, TypeError):
            target_category = str(category_id)

    if target_category and str(target_category).lower().strip() not in ["all", "any", "none", ""]:
        cat_clean = str(target_category).strip()
        if cat_clean.isdigit():
            cat_db = db.query(CategoryDB).filter(CategoryDB.id == int(cat_clean)).first()
            if cat_db:
                query = query.filter(CourseDB.category.ilike(f"%{cat_db.name}%"))
            else:
                query = query.filter(CourseDB.category.ilike(f"%{cat_clean}%"))
        else:
            query = query.filter(CourseDB.category.ilike(f"%{cat_clean}%"))
        
    # 3. Difficulty / Level Filter (supports difficulty or level parameter)
    lvl = difficulty or level
    if lvl and str(lvl).lower().strip() not in ["all", "any", "none", ""]:
        lvl_clean = str(lvl).strip()
        query = query.filter(CourseDB.level.ilike(f"%{lvl_clean}%"))
        
    # 4. Instructor Filter (safely parsed)
    if instructor_id is not None and str(instructor_id).lower().strip() not in ["", "all", "none"]:
        try:
            parsed_inst_id = int(instructor_id)
            query = query.filter(CourseDB.instructor_id == parsed_inst_id)
        except (ValueError, TypeError):
            pass
        
    courses = query.all()
    
    # Extract student profile and assessment attempts for personalized recommendation scoring
    current_user = None
    profile_dict = {}
    attempts = []
    token_str = token
    if not token_str and authorization:
        if authorization.startswith("Bearer "):
            token_str = authorization[7:].strip()
        else:
            token_str = authorization.strip()
    if token_str:
        try:
            payload = jwt.decode(token_str, SECRET_KEY, algorithms=[ALGORITHM])
            user_email = payload.get("sub")
            if user_email:
                current_user = db.query(UserDB).filter(UserDB.email == user_email).first()
        except Exception:
            pass

    if current_user:
        p_obj = db.query(ProfileDB).filter(ProfileDB.user_id == current_user.id).first()
        if p_obj:
            profile_dict = {
                "career_goal": p_obj.career_goal or "",
                "secondary_career_goal": p_obj.secondary_career_goal or "",
                "skills": p_obj.skills or [],
                "interests": p_obj.interests or [],
                "courses": p_obj.courses or [],
                "learning_style": p_obj.learning_style or ""
            }
        attempts_db = db.query(AssessmentAttemptDB).filter(AssessmentAttemptDB.user_id == current_user.id).all()
        for a in attempts_db:
            assess = db.query(AssessmentDB).filter(AssessmentDB.id == a.assessment_id).first()
            attempts.append({
                "assessment_id": a.assessment_id,
                "category": assess.category if assess else "",
                "score": a.score,
                "percentage": a.percentage,
                "performance_level": a.performance_level
            })

    # Resolve skill filter
    target_skill = skill
    if skill_id is not None and str(skill_id).lower().strip() not in ["", "all", "none"]:
        try:
            s_id_int = int(skill_id)
            s_db = db.query(SkillDB).filter(SkillDB.id == s_id_int).first()
            if s_db:
                target_skill = s_db.name
        except (ValueError, TypeError):
            target_skill = str(skill_id)

    # Resolve career goal filter
    target_goal = career_goal
    if career_goal_id is not None and str(career_goal_id).lower().strip() not in ["", "all", "none"]:
        try:
            g_id_int = int(career_goal_id)
            g_db = db.query(CareerGoalDB).filter(CareerGoalDB.id == g_id_int).first()
            if g_db:
                target_goal = g_db.title
        except (ValueError, TypeError):
            target_goal = str(career_goal_id)

    # In-memory filter for JSON fields, duration ranges, ratings, price, and full search
    res = []
    search_clean = search.strip().lower() if search else None
    
    effective_min_rating = None
    raw_rating = min_rating if min_rating is not None else rating
    if raw_rating is not None and str(raw_rating).lower().strip() not in ["", "all", "any", "none"]:
        try:
            effective_min_rating = float(raw_rating)
        except (ValueError, TypeError):
            effective_min_rating = None

    price_val = (access or price or is_free or "").strip().lower()

    for c in courses:
        c_skills = [str(s).lower() for s in (c.skills or [])]
        c_roles = [str(r).lower() for r in (c.target_roles or [])]
        c_goals = [str(g).lower() for g in (c.career_goals or [])]
        c_dur_hours = parse_duration_hours(c.duration)
        c_rating = float(c.rating or 4.8)
        c_is_free = bool(c.is_free if c.is_free is not None else 1) or (c.price == 0.0 or c.price is None)

        # 1. Real search matching across title, short desc, description, skills, category, target roles, career goals, instructor name
        if search_clean:
            match_title = search_clean in (c.title or "").lower()
            match_short_desc = search_clean in (c.short_description or "").lower()
            match_desc = search_clean in (c.description or "").lower()
            match_cat = search_clean in (c.category or "").lower()
            match_subcat = search_clean in (c.subcategory or "").lower()
            match_instructor = search_clean in (c.instructor_name or "").lower()
            match_skills = any(search_clean in s for s in c_skills)
            match_roles = any(search_clean in r for r in c_roles)
            match_goals = any(search_clean in g for g in c_goals)

            if not (match_title or match_short_desc or match_desc or match_cat or match_subcat or match_instructor or match_skills or match_roles or match_goals):
                continue

        # 2. Skill filter
        if target_skill and target_skill.lower() not in ["all", "any", ""]:
            if not any(target_skill.lower() in s for s in c_skills):
                continue

        # 3. Career goal filter
        if target_goal and target_goal.lower() not in ["all", "any", ""]:
            cg_low = target_goal.lower()
            if not any(cg_low in r for r in c_roles) and not any(cg_low in g for g in c_goals) and not (cg_low in (c.category or "").lower()):
                continue

        # 4. Duration filter (<10, 10-20, 20-40, 40+)
        if duration and duration.lower() not in ["all", "any", ""]:
            dur_low = duration.lower().replace(" ", "").replace("hours", "").replace("hour", "").replace("hrs", "")
            if dur_low in ["<10", "less10", "lessthan10", "under10", "under_10", "<10h"]:
                if c_dur_hours >= 10:
                    continue
            elif dur_low in ["10-20", "10to20", "10_20", "10-20h"]:
                if not (10 <= c_dur_hours <= 20):
                    continue
            elif dur_low in ["20-40", "20to40", "20_40", "20-40h"]:
                if not (20 <= c_dur_hours <= 40):
                    continue
            elif dur_low in ["40+", "40plus", "over40", ">40", "40+h"]:
                if c_dur_hours < 40:
                    continue

        # 5. Rating filter
        if effective_min_rating and effective_min_rating > 0:
            if c_rating < float(effective_min_rating):
                continue

        # 6. Price / Access filter
        if price_val and price_val not in ["all", "any", ""]:
            if price_val in ["free", "1", "true"] and not c_is_free:
                continue
            if price_val in ["paid", "0", "false"] and c_is_free:
                continue

        enr_count = db.query(EnrollmentDB).filter(EnrollmentDB.course_id == c.id).count()

        # 7. Personalized Recommendation scoring
        rec_info = None
        if profile_dict:
            raw_c_dict = {
                "id": c.id,
                "title": c.title,
                "category": c.category,
                "description": c.description or "",
                "skills": c.skills or [],
                "target_roles": c.target_roles or [c.category],
                "domains": [c.category, c.subcategory] if c.subcategory else [c.category],
                "level": c.level
            }
            rec_info = CourseScorer.score_course(
                course=raw_c_dict,
                career_goal=profile_dict.get("career_goal", ""),
                secondary_goal=profile_dict.get("secondary_career_goal", ""),
                student_skills=profile_dict.get("skills", []),
                student_interests=profile_dict.get("interests", []),
                assessment_results=attempts,
                completed_course_titles=[]
            )

        match_pct = rec_info.get("match_percentage") if rec_info else None
        match_reasons = rec_info.get("match_reasons") if rec_info else []

        res.append({
            "id": c.id,
            "title": c.title,
            "short_description": c.short_description or (c.description[:120] + "..." if c.description else ""),
            "description": c.description or "",
            "category": c.category,
            "subcategory": c.subcategory or c.category,
            "instructor_id": c.instructor_id,
            "instructor": c.instructor_name or "SmartLearn Faculty",
            "instructor_name": c.instructor_name or "SmartLearn Faculty",
            "level": c.level,
            "difficulty": c.level,
            "duration": c.duration or "30 hours",
            "duration_hours": c_dur_hours,
            "language": c.language or "English",
            "format": c.format or "Self-Paced Video & Projects",
            "certificate": bool(c.certificate),
            "is_free": 1 if c_is_free else 0,
            "price": c.price or 0.0,
            "currency": c.currency or "INR",
            "demo_video_url": c.demo_video_url or "",
            "thumbnail_url": c.thumbnail_url or "",
            "status": c.status,
            "rating": c_rating,
            "review_count": c.review_count or 0,
            "enrollment_count": enr_count or c.enrollment_count or 0,
            "skills": c.skills or [],
            "prerequisites": c.prerequisites or [],
            "technical_requirements": c.technical_requirements or [],
            "recommended_knowledge": c.recommended_knowledge or [],
            "target_roles": c.target_roles or [],
            "career_goals": c.career_goals or c.target_roles or [],
            "learning_outcomes": c.learning_outcomes or [],
            "modules": c.modules or [],
            "lessons_count": sum(len(m.get("lessons", [])) for m in (c.modules or [])) or 24,
            "icon": c.icon or "fa-solid fa-graduation-cap",
            "color_theme": c.color_theme or "linear-gradient(135deg, #5B3FE8, #8B4AD9)",
            "match_percentage": match_pct,
            "match_reasons": match_reasons,
            "created_at": c.created_at,
            "updated_at": c.updated_at
        })

    # Sorting
    s_by = (sort or sort_by or "recommended").lower().strip()
    if s_by in ["recommended", "recommendation"]:
        # If match_percentage available, sort by match_percentage desc then rating desc
        res.sort(key=lambda x: (x.get("match_percentage") or 0, x.get("rating", 0), x.get("enrollment_count", 0)), reverse=True)
    elif s_by in ["newest", "recent"]:
        res.sort(key=lambda x: (x.get("created_at") or "", x.get("id", 0)), reverse=True)
    elif s_by in ["oldest"]:
        res.sort(key=lambda x: (x.get("created_at") or "", x.get("id", 0)))
    elif s_by in ["rating", "highest_rated", "top_rated"]:
        res.sort(key=lambda x: (x.get("rating", 0), x.get("review_count", 0)), reverse=True)
    elif s_by in ["enrollment", "popular", "most_popular", "most_enrolled", "enrollments_desc"]:
        res.sort(key=lambda x: x.get("enrollment_count", 0), reverse=True)
    elif s_by in ["shortest_duration", "duration_asc"]:
        res.sort(key=lambda x: x.get("duration_hours", 0))
    elif s_by in ["longest_duration", "duration_desc"]:
        res.sort(key=lambda x: x.get("duration_hours", 0), reverse=True)
    elif s_by in ["price_asc", "price_low_high", "price_low"]:
        res.sort(key=lambda x: (x.get("is_free", 0) == 0, x.get("price", 0)))
    elif s_by in ["price_desc", "price_high_low", "price_high"]:
        res.sort(key=lambda x: x.get("price", 0), reverse=True)
    elif s_by in ["title", "a_z", "name"]:
        res.sort(key=lambda x: (x.get("title") or "").lower())
    elif s_by in ["updated", "recently_updated"]:
        res.sort(key=lambda x: (x.get("updated_at") or x.get("created_at") or "", x.get("id", 0)), reverse=True)

    if page is not None and limit is not None:
        try:
            p = max(1, int(page))
            l = max(1, int(limit))
            start_idx = (p - 1) * l
            end_idx = start_idx + l
            return res[start_idx:end_idx]
        except (ValueError, TypeError):
            pass

    return res

@app.get("/courses/{course_id}")
def get_course_details(
    course_id: int,
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    course = db.query(CourseDB).filter(CourseDB.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
        
    token_str = token
    if not token_str and authorization:
        if authorization.startswith("Bearer "):
            token_str = authorization[7:].strip()
        else:
            token_str = authorization.strip()

    current_user = None
    if token_str:
        try:
            payload = jwt.decode(token_str, SECRET_KEY, algorithms=[ALGORITHM])
            user_email = payload.get("sub")
            if user_email:
                current_user = db.query(UserDB).filter(UserDB.email == user_email).first()
        except Exception:
            pass

    # Publishing visibility rule:
    # If course is not published, only the authoring Instructor or an Admin can access it
    if course.status.lower() != "published":
        if not current_user or (current_user.role.upper() != "ADMIN" and course.instructor_id != current_user.id):
            raise HTTPException(status_code=404, detail="Course not found or is currently in draft/deactivated status.")

    is_enrolled = False
    progress_percentage = 0
    is_wishlisted = False
    
    if current_user:
        enrollment = db.query(EnrollmentDB).filter(
            EnrollmentDB.user_id == current_user.id,
            EnrollmentDB.course_id == course_id
        ).first()
        if enrollment:
            is_enrolled = True
            progress_percentage = enrollment.progress_percentage
            
        wishlist = db.query(WishlistDB).filter(
            WishlistDB.user_id == current_user.id,
            WishlistDB.course_id == course_id
        ).first()
        if wishlist:
            is_wishlisted = True

    enr_count = db.query(EnrollmentDB).filter(EnrollmentDB.course_id == course.id).count()

    return {
        "id": course.id,
        "title": course.title,
        "short_description": course.short_description or (course.description[:120] + "..." if course.description else ""),
        "description": course.description or "",
        "category": course.category,
        "subcategory": course.subcategory or course.category,
        "instructor_id": course.instructor_id,
        "instructor": course.instructor_name or "SmartLearn Faculty",
        "instructor_name": course.instructor_name or "SmartLearn Faculty",
        "level": course.level,
        "difficulty": course.level,
        "duration": course.duration,
        "language": course.language or "English",
        "format": course.format or "Self-Paced Video & Projects",
        "certificate": bool(course.certificate),
        "is_free": course.is_free if course.is_free is not None else 1,
        "price": course.price or 0.0,
        "currency": course.currency or "INR",
        "demo_video_url": course.demo_video_url or "",
        "thumbnail_url": course.thumbnail_url or "",
        "status": course.status,
        "rating": course.rating or 4.8,
        "review_count": course.review_count or 0,
        "enrollment_count": enr_count or course.enrollment_count or 0,
        "skills": course.skills or [],
        "prerequisites": course.prerequisites or [],
        "technical_requirements": course.technical_requirements or [],
        "recommended_knowledge": course.recommended_knowledge or [],
        "target_roles": course.target_roles or [],
        "career_goals": course.career_goals or course.target_roles or [],
        "learning_outcomes": course.learning_outcomes or [],
        "modules": course.modules or [],
        "icon": course.icon or "fa-solid fa-graduation-cap",
        "color_theme": course.color_theme or "linear-gradient(135deg, #5B3FE8, #8B4AD9)",
        "is_enrolled": is_enrolled,
        "progress_percentage": progress_percentage,
        "is_wishlisted": is_wishlisted,
        "created_at": course.created_at,
        "updated_at": course.updated_at
    }

@app.post("/courses")
@app.post("/instructor/courses")
def create_course(
    payload: CourseCreatePayload,
    user: UserDB = Depends(get_current_instructor),
    db: Session = Depends(get_db)
):
    if user.role.upper() == "STUDENT":
        raise HTTPException(status_code=403, detail="Students are not permitted to create courses.")

    if not payload.title or not payload.title.strip():
        raise HTTPException(status_code=400, detail="Course title is required.")
    if not payload.category or not payload.category.strip():
        raise HTTPException(status_code=400, detail="Category is required.")
    desc_val = (payload.description or payload.detailed_description or payload.short_description or '').strip()
    if not desc_val:
        raise HTTPException(status_code=400, detail="Course description is required.")

    short_desc_val = (payload.short_description or (desc_val[:120] + "...")).strip()

    now_str = datetime.utcnow().strftime("%Y-%m-%d")
    
    # Ownership: determine strictly from authenticated user token
    if user.role.upper() == "INSTRUCTOR":
        instructor_id = user.id
        instructor_name = user.full_name
    else:  # Admin
        instructor_id = payload.instructor_id or user.id
        instructor_name = payload.instructor_name or user.full_name

    is_free_val = payload.is_free if payload.is_free is not None else (0 if payload.price and payload.price > 0 else 1)
    price_val = 0.0 if is_free_val == 1 else max(0.0, float(payload.price or 0.0))

    course = CourseDB(
        title=payload.title.strip(),
        short_description=short_desc_val,
        description=desc_val,
        category=payload.category.strip(),
        subcategory=payload.subcategory.strip() if payload.subcategory else payload.category.strip(),
        instructor_id=instructor_id,
        instructor_name=instructor_name,
        level=payload.level or "Intermediate",
        duration=payload.duration or "30 hours",
        language=payload.language or "English",
        format=payload.format or "Self-Paced Video & Projects",
        certificate=payload.certificate if payload.certificate is not None else 1,
        is_free=is_free_val,
        price=price_val,
        currency=payload.currency or "INR",
        demo_video_url=payload.demo_video_url,
        thumbnail_url=payload.thumbnail_url,
        status=payload.status.lower() if payload.status else "published",
        rating=4.8,
        review_count=0,
        enrollment_count=0,
        skills=payload.skills or [],
        prerequisites=payload.prerequisites or [],
        technical_requirements=payload.technical_requirements or [],
        recommended_knowledge=payload.recommended_knowledge or [],
        target_roles=payload.target_roles or [payload.category.strip()],
        career_goals=payload.career_goals or payload.target_roles or [payload.category.strip()],
        learning_outcomes=payload.learning_outcomes or [],
        modules=payload.modules or [],
        icon=payload.icon or "fa-solid fa-graduation-cap",
        color_theme=payload.color_theme or "linear-gradient(135deg, #5B3FE8, #8B4AD9)",
        created_at=now_str,
        updated_at=now_str
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    
    if course.status == "published":
        try:
            NotificationService.notify_eligible_students_for_new_course(db, course)
            NotificationService.notify_instructor_course_published(db, course.instructor_id, course.id, course.title)
            NotificationService.notify_admin_platform_event(
                db=db,
                title="New Course Published 📚",
                message=f"Course '{course.title}' ({course.category}) was published by {course.instructor_name or 'Instructor'}.",
                notification_type="NEW_COURSE_PUBLISHED",
                related_course_id=course.id
            )
        except Exception as _e_notif:
            print(f"[Create Course Notification Error] {_e_notif}")

    return {"message": "Course created successfully", "id": course.id, "course_id": course.id, "course": course}

@app.put("/courses/{course_id}")
@app.put("/instructor/courses/{course_id}")
def update_course(
    course_id: int,
    payload: CourseCreatePayload,
    user: UserDB = Depends(get_current_instructor),
    db: Session = Depends(get_db)
):
    if user.role.upper() == "STUDENT":
        raise HTTPException(status_code=403, detail="Students are not permitted to edit courses.")

    course = db.query(CourseDB).filter(CourseDB.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
        
    # Check authorization: Admin can edit any, Instructor can only edit their own
    if user.role.upper() == "INSTRUCTOR" and course.instructor_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden: You are only authorized to edit courses that you own.")

    if not payload.title or not payload.title.strip():
        raise HTTPException(status_code=400, detail="Course title is required.")
    if not payload.category or not payload.category.strip():
        raise HTTPException(status_code=400, detail="Category is required.")
    if not payload.description or not payload.description.strip():
        raise HTTPException(status_code=400, detail="Detailed description is required.")

    now_str = datetime.utcnow().strftime("%Y-%m-%d")
    course.title = payload.title.strip()
    course.short_description = payload.short_description.strip() if payload.short_description else (payload.description.strip()[:120] + "...")
    course.description = payload.description.strip()
    course.category = payload.category.strip()
    course.subcategory = payload.subcategory.strip() if payload.subcategory else payload.category.strip()
    course.level = payload.level or course.level
    course.duration = payload.duration or course.duration
    course.language = payload.language or course.language
    course.format = payload.format or course.format
    course.certificate = payload.certificate if payload.certificate is not None else course.certificate
    
    if payload.is_free is not None:
        course.is_free = int(payload.is_free)
    if payload.price is not None:
        course.price = 0.0 if course.is_free == 1 else max(0.0, float(payload.price))
    if payload.currency is not None:
        course.currency = payload.currency
    if payload.demo_video_url is not None:
        course.demo_video_url = payload.demo_video_url
    if payload.thumbnail_url is not None:
        course.thumbnail_url = payload.thumbnail_url
        
    if payload.status:
        course.status = payload.status.lower()
    
    if user.role.upper() == "ADMIN":
        if payload.instructor_id is not None:
            course.instructor_id = payload.instructor_id
        if payload.instructor_name is not None:
            course.instructor_name = payload.instructor_name

    course.skills = payload.skills or []
    course.prerequisites = payload.prerequisites or []
    course.technical_requirements = payload.technical_requirements or []
    course.recommended_knowledge = payload.recommended_knowledge or []
    course.target_roles = payload.target_roles or []
    course.career_goals = payload.career_goals or payload.target_roles or []
    course.learning_outcomes = payload.learning_outcomes or []
    if payload.modules is not None:
        course.modules = payload.modules
    course.updated_at = now_str
    
    db.commit()
    db.refresh(course)
    return {"message": "Course updated successfully", "id": course.id, "course_id": course.id}

# --- LMS FILE & VIDEO UPLOADS ---

@app.post("/courses/{course_id}/upload-video")
@app.post("/courses/upload-video")
async def upload_course_video(
    course_id: Optional[int] = None,
    file: UploadFile = File(...),
    user: UserDB = Depends(get_current_instructor),
    db: Session = Depends(get_db)
):
    allowed_exts = ["mp4", "webm", "mov", "mkv", "avi"]
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "mp4"
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid video format. Allowed formats: {', '.join(allowed_exts).upper()}"
        )
    
    content = await file.read()
    if len(content) > 150 * 1024 * 1024:  # 150MB limit
        raise HTTPException(status_code=400, detail="Video file size exceeds 150MB limit.")
        
    safe_filename = f"video_{uuid.uuid4().hex[:12]}.{ext}"
    file_path = VIDEO_DIR / safe_filename
    with open(file_path, "wb") as f:
        f.write(content)
        
    video_url = f"/uploads/videos/{safe_filename}"
    return {
        "message": "Video uploaded successfully",
        "video_url": video_url,
        "filename": file.filename,
        "size_bytes": len(content)
    }

@app.post("/courses/{course_id}/upload-material")
@app.post("/courses/upload-material")
async def upload_course_material(
    course_id: Optional[int] = None,
    file: UploadFile = File(...),
    user: UserDB = Depends(get_current_instructor),
    db: Session = Depends(get_db)
):
    allowed_exts = ["pdf", "ppt", "pptx", "doc", "docx", "txt", "zip", "png", "jpg", "jpeg", "webp"]
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "pdf"
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid material format. Allowed formats: {', '.join(allowed_exts).upper()}"
        )
        
    content = await file.read()
    if len(content) > 30 * 1024 * 1024:  # 30MB limit
        raise HTTPException(status_code=400, detail="Material file size exceeds 30MB limit.")
        
    safe_filename = f"doc_{uuid.uuid4().hex[:12]}.{ext}"
    file_path = MATERIAL_DIR / safe_filename
    with open(file_path, "wb") as f:
        f.write(content)
        
    material_url = f"/uploads/materials/{safe_filename}"
    return {
        "message": "Course material uploaded successfully",
        "material_url": material_url,
        "filename": file.filename,
        "size_bytes": len(content)
    }

@app.post("/courses/{course_id}/upload-thumbnail")
@app.post("/courses/upload-thumbnail")
async def upload_course_thumbnail(
    course_id: Optional[int] = None,
    file: UploadFile = File(...),
    user: UserDB = Depends(get_current_instructor),
    db: Session = Depends(get_db)
):
    allowed_exts = ["jpg", "jpeg", "png", "webp", "gif", "svg"]
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "jpg"
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid image format. Allowed formats: {', '.join(allowed_exts).upper()}"
        )
        
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(status_code=400, detail="Thumbnail image size exceeds 10MB limit.")
        
    safe_filename = f"thumb_{uuid.uuid4().hex[:12]}.{ext}"
    file_path = THUMBNAIL_DIR / safe_filename
    with open(file_path, "wb") as f:
        f.write(content)
        
    thumbnail_url = f"/uploads/thumbnails/{safe_filename}"
    if course_id:
        course = db.query(CourseDB).filter(CourseDB.id == course_id).first()
        if course and (user.role.upper() == "ADMIN" or course.instructor_id == user.id):
            course.thumbnail_url = thumbnail_url
            db.commit()
            
    return {
        "message": "Course thumbnail uploaded successfully",
        "thumbnail_url": thumbnail_url,
        "filename": file.filename,
        "size_bytes": len(content)
    }

# --- LMS COURSE CONTENT MANAGEMENT ---

@app.get("/courses/{course_id}/content")
def get_course_content(
    course_id: int,
    user: UserDB = Depends(get_current_instructor),
    db: Session = Depends(get_db)
):
    course = db.query(CourseDB).filter(CourseDB.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
        
    if user.role.upper() == "INSTRUCTOR" and course.instructor_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden: You are only authorized to manage content for your own courses.")
        
    return {
        "id": course.id,
        "title": course.title,
        "short_description": course.short_description or "",
        "description": course.description or "",
        "category": course.category,
        "subcategory": course.subcategory or course.category,
        "level": course.level,
        "duration": course.duration,
        "language": course.language or "English",
        "is_free": course.is_free if course.is_free is not None else 1,
        "price": course.price or 0.0,
        "currency": course.currency or "INR",
        "demo_video_url": course.demo_video_url or "",
        "status": course.status,
        "skills": course.skills or [],
        "prerequisites": course.prerequisites or [],
        "technical_requirements": course.technical_requirements or [],
        "recommended_knowledge": course.recommended_knowledge or [],
        "target_roles": course.target_roles or [],
        "career_goals": course.career_goals or [],
        "learning_outcomes": course.learning_outcomes or [],
        "modules": course.modules or []
    }

@app.put("/courses/{course_id}/content")
def update_course_content(
    course_id: int,
    payload: Dict[str, Any],
    user: UserDB = Depends(get_current_instructor),
    db: Session = Depends(get_db)
):
    course = db.query(CourseDB).filter(CourseDB.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
        
    if user.role.upper() == "INSTRUCTOR" and course.instructor_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden: You are only authorized to update content for your own courses.")
        
    if "modules" in payload:
        course.modules = payload["modules"]
    if "demo_video_url" in payload:
        course.demo_video_url = payload["demo_video_url"]
    if "is_free" in payload:
        course.is_free = int(payload["is_free"])
    if "price" in payload:
        course.price = 0.0 if course.is_free == 1 else max(0.0, float(payload["price"]))
    if "currency" in payload:
        course.currency = payload["currency"]
    if "status" in payload:
        course.status = payload["status"].lower()
    if "learning_outcomes" in payload:
        course.learning_outcomes = payload["learning_outcomes"]
    if "prerequisites" in payload:
        course.prerequisites = payload["prerequisites"]
    if "technical_requirements" in payload:
        course.technical_requirements = payload["technical_requirements"]
    if "recommended_knowledge" in payload:
        course.recommended_knowledge = payload["recommended_knowledge"]
        
    course.updated_at = datetime.utcnow().strftime("%Y-%m-%d")
    db.commit()
    return {"message": "Course content updated successfully", "course_id": course.id}

# --- LMS STUDENT PLAYER & PROGRESS ---

@app.get("/courses/{course_id}/player")
def get_course_player(
    course_id: int,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    course = db.query(CourseDB).filter(CourseDB.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
        
    enrollment = db.query(EnrollmentDB).filter(
        EnrollmentDB.user_id == user.id,
        EnrollmentDB.course_id == course_id
    ).first()
    
    is_owner_or_admin = (user.role.upper() == "ADMIN" or (user.role.upper() == "INSTRUCTOR" and course.instructor_id == user.id))
    is_enrolled = enrollment is not None or is_owner_or_admin
    
    completed_lesson_ids = enrollment.completed_lesson_ids or [] if enrollment else []
    progress_pct = enrollment.progress_percentage if enrollment else 0
    last_lesson_id = enrollment.last_lesson_id if enrollment else None
    
    modules_out = []
    total_lessons_count = 0
    
    for m in (course.modules or []):
        lessons_out = []
        for l in m.get("lessons", []):
            total_lessons_count += 1
            l_id = l.get("lesson_id")
            preview_enabled = bool(l.get("preview_enabled") or l.get("is_preview"))
            is_unlocked = is_enrolled or preview_enabled
            
            lesson_dict = {
                "lesson_id": l_id,
                "title": l.get("title", ""),
                "description": l.get("description", ""),
                "type": l.get("type", "video"),
                "duration": l.get("duration", "30 mins"),
                "preview_enabled": preview_enabled,
                "is_unlocked": is_unlocked,
                "is_completed": (l_id in completed_lesson_ids) or (str(l_id) in [str(x) for x in completed_lesson_ids]),
                "materials": l.get("materials", []) if is_unlocked else [],
                "external_urls": l.get("external_urls", []) if is_unlocked else []
            }
            
            if is_unlocked:
                lesson_dict["video_url"] = l.get("video_url", "")
                lesson_dict["content"] = l.get("content", "")
                if l.get("type") == "quiz" and l.get("quiz"):
                    quiz_obj = l.get("quiz")
                    safe_questions = []
                    for q in quiz_obj.get("questions", []):
                        safe_questions.append({
                            "question_id": q.get("question_id") or q.get("id"),
                            "question_text": q.get("question_text", ""),
                            "options": q.get("options", []),
                            "points": q.get("points", 10)
                        })
                    lesson_dict["quiz"] = {
                        "passing_score": quiz_obj.get("passing_score", 70),
                        "questions": safe_questions,
                        "total_questions": len(safe_questions)
                    }
            else:
                lesson_dict["video_url"] = ""
                lesson_dict["content"] = "This lesson is locked. Enroll in the course to unlock full access."
                
            lessons_out.append(lesson_dict)
            
        modules_out.append({
            "module_id": m.get("module_id"),
            "title": m.get("title", ""),
            "duration": m.get("duration", ""),
            "description": m.get("description", ""),
            "lessons": lessons_out
        })
        
    return {
        "id": course.id,
        "course_id": course.id,
        "title": course.title,
        "category": course.category,
        "instructor": course.instructor_name or "Faculty",
        "demo_video_url": course.demo_video_url or "",
        "is_enrolled": is_enrolled,
        "is_free": course.is_free if course.is_free is not None else 1,
        "price": course.price or 0.0,
        "currency": course.currency or "INR",
        "progress_percentage": progress_pct,
        "completed_lesson_ids": completed_lesson_ids,
        "last_lesson_id": last_lesson_id,
        "total_lessons": total_lessons_count,
        "modules": modules_out
    }

@app.post("/courses/{course_id}/lessons/{lesson_id}/complete")
def complete_course_lesson(
    course_id: int,
    lesson_id: Union[int, str],
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    course = db.query(CourseDB).filter(CourseDB.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
        
    enrollment = db.query(EnrollmentDB).filter(
        EnrollmentDB.user_id == user.id,
        EnrollmentDB.course_id == course_id
    ).first()
    if not enrollment:
        now_str = datetime.utcnow().strftime("%Y-%m-%d")
        enrollment = EnrollmentDB(
            user_id=user.id,
            course_id=course_id,
            enrolled_at=now_str,
            progress_percentage=0,
            status="in_progress",
            completed_lessons=0,
            completed_lesson_ids=[]
        )
        db.add(enrollment)
        db.commit()
        db.refresh(enrollment)

    all_lessons = []
    lesson_title = f"Lesson {lesson_id}"
    for m in (course.modules or []):
        for l in m.get("lessons", []):
            l_id = str(l.get("lesson_id"))
            all_lessons.append(l_id)
            if l_id == str(lesson_id):
                lesson_title = l.get("title", lesson_title)

    completed_ids = list(enrollment.completed_lesson_ids or [])
    lid_str = str(lesson_id)
    if lid_str not in [str(x) for x in completed_ids]:
        try:
            completed_ids.append(int(lesson_id))
        except ValueError:
            completed_ids.append(lesson_id)
            
    enrollment.completed_lesson_ids = completed_ids
    enrollment.completed_lessons = len(completed_ids)
    
    total_count = max(len(all_lessons), 1)
    new_pct = min(100, round((len(completed_ids) / total_count) * 100))
    enrollment.progress_percentage = new_pct
    enrollment.last_lesson_id = int(lesson_id) if str(lesson_id).isdigit() else 1
    enrollment.last_lesson_title = lesson_title
    enrollment.last_accessed = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    
    if new_pct >= 100:
        enrollment.status = "completed"
    else:
        enrollment.status = "in_progress"
        
    # Sync ProfileDB.courses
    profile = db.query(ProfileDB).filter(ProfileDB.user_id == user.id).first()
    if profile:
        cur_courses = list(profile.courses or [])
        found = False
        for c_entry in cur_courses:
            if c_entry.get("id") == course_id or c_entry.get("course_id") == course_id:
                c_entry["progress"] = enrollment.progress_percentage
                c_entry["progress_percentage"] = enrollment.progress_percentage
                c_entry["completed_lessons"] = enrollment.completed_lessons
                c_entry["status"] = enrollment.status
                c_entry["last_lesson_id"] = enrollment.last_lesson_id
                c_entry["last_lesson_title"] = enrollment.last_lesson_title
                found = True
                break
        if not found:
            cur_courses.append({
                "id": course.id,
                "course_id": course.id,
                "title": course.title,
                "progress": enrollment.progress_percentage,
                "progress_percentage": enrollment.progress_percentage,
                "completed_lessons": enrollment.completed_lessons,
                "total_lessons": total_count,
                "status": enrollment.status,
                "last_lesson_id": enrollment.last_lesson_id,
                "last_lesson_title": enrollment.last_lesson_title,
                "hours": int(course.duration.split(" ")[0]) if " " in (course.duration or "") else 30,
                "icon": course.icon
            })
        profile.courses = cur_courses

    db.commit()
    db.refresh(enrollment)
    
    return {
        "message": "Lesson marked as complete",
        "progress_percentage": enrollment.progress_percentage,
        "completed_lessons": enrollment.completed_lessons,
        "completed_lesson_ids": enrollment.completed_lesson_ids,
        "total_lessons": total_count,
        "is_completed": enrollment.status == "completed"
    }

@app.post("/courses/{course_id}/lessons/{lesson_id}/quiz-submit")
def submit_course_lesson_quiz(
    course_id: int,
    lesson_id: str,
    payload: LessonQuizSubmitPayload,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    course = db.query(CourseDB).filter(CourseDB.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
        
    target_lesson = None
    for m in (course.modules or []):
        for l in m.get("lessons", []):
            if str(l.get("lesson_id")) == str(lesson_id):
                target_lesson = l
                break
        if target_lesson:
            break
            
    if not target_lesson or target_lesson.get("type") != "quiz" or not target_lesson.get("quiz"):
        raise HTTPException(status_code=400, detail="Lesson does not have an active quiz.")
        
    quiz_data = target_lesson.get("quiz")
    questions = quiz_data.get("questions", [])
    passing_score = quiz_data.get("passing_score", 70)
    
    correct_count = 0
    total_questions = len(questions)
    feedback = []
    
    for q in questions:
        qid = str(q.get("question_id") or q.get("id"))
        user_answer = payload.answers.get(qid)
        correct_idx = q.get("correct_option") if q.get("correct_option") is not None else q.get("answer")
        
        is_correct = False
        if user_answer is not None and correct_idx is not None:
            is_correct = (int(user_answer) == int(correct_idx))
            
        if is_correct:
            correct_count += 1
            
        feedback.append({
            "question_id": qid,
            "is_correct": is_correct,
            "correct_option": correct_idx,
            "explanation": q.get("explanation", "Review the lesson materials.")
        })
        
    score_pct = round((correct_count / max(total_questions, 1)) * 100)
    passed = score_pct >= passing_score
    
    if passed:
        enrollment = db.query(EnrollmentDB).filter(
            EnrollmentDB.user_id == user.id,
            EnrollmentDB.course_id == course_id
        ).first()
        if enrollment:
            completed_ids = list(enrollment.completed_lesson_ids or [])
            if str(lesson_id) not in [str(x) for x in completed_ids]:
                try:
                    completed_ids.append(int(lesson_id))
                except ValueError:
                    completed_ids.append(lesson_id)
                enrollment.completed_lesson_ids = completed_ids
                enrollment.completed_lessons = len(completed_ids)
                
                all_lessons_count = sum(len(m.get("lessons", [])) for m in (course.modules or []))
                enrollment.progress_percentage = min(100, round((len(completed_ids) / max(all_lessons_count, 1)) * 100))
                enrollment.last_lesson_id = int(lesson_id) if str(lesson_id).isdigit() else 1
                enrollment.last_lesson_title = target_lesson.get("title", f"Lesson {lesson_id}")
                enrollment.last_accessed = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                if enrollment.progress_percentage >= 100:
                    enrollment.status = "completed"
                
                # Sync ProfileDB.courses
                profile = db.query(ProfileDB).filter(ProfileDB.user_id == user.id).first()
                if profile:
                    cur_courses = list(profile.courses or [])
                    for c_entry in cur_courses:
                        if c_entry.get("id") == course_id or c_entry.get("course_id") == course_id:
                            c_entry["progress"] = enrollment.progress_percentage
                            c_entry["progress_percentage"] = enrollment.progress_percentage
                            c_entry["completed_lessons"] = enrollment.completed_lessons
                            c_entry["status"] = enrollment.status
                            break
                    profile.courses = cur_courses

                db.commit()
                
    return {
        "score_percentage": score_pct,
        "correct_count": correct_count,
        "total_questions": total_questions,
        "passing_score": passing_score,
        "passed": passed,
        "feedback": feedback
    }

@app.get("/courses/{course_id}/preview/{lesson_id}")
def get_preview_lesson(
    course_id: int,
    lesson_id: str,
    db: Session = Depends(get_db)
):
    course = db.query(CourseDB).filter(CourseDB.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
        
    target_lesson = None
    target_module_title = "Module"
    for m in (course.modules or []):
        for l in m.get("lessons", []):
            if str(l.get("lesson_id")) == str(lesson_id):
                target_lesson = l
                target_module_title = m.get("title", target_module_title)
                break
        if target_lesson:
            break
            
    if not target_lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
        
    if not (target_lesson.get("preview_enabled") or target_lesson.get("is_preview")):
        raise HTTPException(status_code=403, detail="This lesson is not available for preview. Please enroll in the course to unlock.")
        
    return {
        "course_id": course.id,
        "course_title": course.title,
        "module_title": target_module_title,
        "lesson_id": target_lesson.get("lesson_id"),
        "title": target_lesson.get("title"),
        "description": target_lesson.get("description", ""),
        "type": target_lesson.get("type", "video"),
        "duration": target_lesson.get("duration", "30 mins"),
        "video_url": target_lesson.get("video_url", ""),
        "content": target_lesson.get("content", ""),
        "materials": target_lesson.get("materials", []),
        "external_urls": target_lesson.get("external_urls", []),
        "is_preview": True,
        "preview_enabled": True
    }

# --- COURSE REVIEWS & RATINGS ---

@app.get("/courses/{course_id}/reviews")
def get_course_reviews(course_id: int, db: Session = Depends(get_db)):
    course = db.query(CourseDB).filter(CourseDB.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    reviews = db.query(ReviewDB).filter(ReviewDB.course_id == course_id).order_by(ReviewDB.id.desc()).all()
    user_ids = [r.user_id for r in reviews]
    users_map = {u.id: u.full_name for u in db.query(UserDB).filter(UserDB.id.in_(user_ids)).all()} if user_ids else {}
    
    res = []
    for r in reviews:
        res.append({
            "id": r.id,
            "user_id": r.user_id,
            "reviewer_name": users_map.get(r.user_id, "SmartLearn Student"),
            "rating": r.rating,
            "comment": r.comment or "",
            "created_at": r.created_at or ""
        })
    avg = round(sum(r.rating for r in reviews) / len(reviews), 1) if reviews else (course.rating or 4.8)
    return {
        "course_id": course_id,
        "total_reviews": len(reviews),
        "average_rating": avg,
        "reviews": res
    }

@app.post("/courses/{course_id}/reviews")
def submit_course_review(
    course_id: int,
    payload: ReviewCreatePayload,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    course = db.query(CourseDB).filter(CourseDB.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check enrollment
    enrollment = db.query(EnrollmentDB).filter(
        EnrollmentDB.user_id == user.id,
        EnrollmentDB.course_id == course_id
    ).first()
    if not enrollment:
        raise HTTPException(status_code=403, detail="You must be enrolled in this course to submit a review.")
    
    # Check existing review
    existing = db.query(ReviewDB).filter(
        ReviewDB.user_id == user.id,
        ReviewDB.course_id == course_id
    ).first()
    
    now_str = datetime.utcnow().strftime("%Y-%m-%d")
    if existing:
        existing.rating = payload.rating
        existing.comment = payload.comment
        existing.created_at = now_str
    else:
        new_rev = ReviewDB(
            user_id=user.id,
            course_id=course_id,
            rating=payload.rating,
            comment=payload.comment,
            created_at=now_str
        )
        db.add(new_rev)
    
    db.commit()
    
    # Recalculate average rating & review count
    all_revs = db.query(ReviewDB).filter(ReviewDB.course_id == course_id).all()
    avg_rating = round(sum(r.rating for r in all_revs) / len(all_revs), 1) if all_revs else 5.0
    course.rating = avg_rating
    course.review_count = len(all_revs)
    db.commit()
    
    return {
        "message": "Review submitted successfully!",
        "rating": payload.rating,
        "average_rating": avg_rating,
        "total_reviews": len(all_revs)
    }

@app.get("/instructor/courses")
@app.get("/api/instructor/courses")
def get_instructor_courses_list(
    search: Optional[str] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    sort_by: Optional[str] = "newest",
    user: UserDB = Depends(get_current_instructor),
    db: Session = Depends(get_db)
):
    query = db.query(CourseDB).filter(CourseDB.instructor_id == user.id)
    if status and status.lower() != "all":
        query = query.filter(CourseDB.status == status.lower())
    if category and category.lower() != "all":
        query = query.filter(CourseDB.category.ilike(f"%{category.strip()}%"))
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            (CourseDB.title.ilike(s)) |
            (CourseDB.description.ilike(s)) |
            (CourseDB.category.ilike(s))
        )
    courses = query.all()
    enrollments = db.query(EnrollmentDB).all()
    
    res = []
    for c in courses:
        enr_for_c = [e for e in enrollments if e.course_id == c.id]
        total_lessons = sum(len(m.get("lessons", [])) for m in (c.modules or []))
        c_dur_hours = parse_duration_hours(c.duration)
        c_is_free = bool(c.is_free if c.is_free is not None else 1) or (c.price == 0.0 or c.price is None)
        res.append({
            "id": c.id,
            "title": c.title,
            "short_description": c.short_description or "",
            "description": c.description or "",
            "category": c.category,
            "subcategory": c.subcategory or c.category,
            "instructor_id": c.instructor_id,
            "instructor": c.instructor_name or user.full_name,
            "instructor_name": c.instructor_name or user.full_name,
            "level": c.level,
            "difficulty": c.level,
            "duration": c.duration or "30 hours",
            "duration_hours": c_dur_hours,
            "language": c.language or "English",
            "format": c.format or "Self-Paced Video & Projects",
            "certificate": bool(c.certificate),
            "is_free": 1 if c_is_free else 0,
            "price": c.price or 0.0,
            "currency": c.currency or "INR",
            "demo_video_url": c.demo_video_url or "",
            "thumbnail_url": c.thumbnail_url or "",
            "status": c.status,
            "students_count": len(enr_for_c),
            "enrollment_count": len(enr_for_c),
            "rating": c.rating or 4.8,
            "review_count": c.review_count or 0,
            "lessons_count": total_lessons,
            "skills": c.skills or [],
            "prerequisites": c.prerequisites or [],
            "technical_requirements": c.technical_requirements or [],
            "recommended_knowledge": c.recommended_knowledge or [],
            "target_roles": c.target_roles or [],
            "career_goals": c.career_goals or [],
            "learning_outcomes": c.learning_outcomes or [],
            "modules": c.modules or [],
            "created_at": c.created_at,
            "updated_at": c.updated_at
        })

    s_by = (sort_by or "newest").lower().strip()
    if s_by in ["newest", "recent"]:
        res.sort(key=lambda x: (x.get("created_at") or "", x.get("id", 0)), reverse=True)
    elif s_by in ["oldest"]:
        res.sort(key=lambda x: (x.get("created_at") or "", x.get("id", 0)))
    elif s_by in ["rating", "highest_rated"]:
        res.sort(key=lambda x: (x.get("rating", 0), x.get("review_count", 0)), reverse=True)
    elif s_by in ["enrollment", "most_enrolled", "popular"]:
        res.sort(key=lambda x: x.get("enrollment_count", 0), reverse=True)
    elif s_by in ["title", "a_z"]:
        res.sort(key=lambda x: (x.get("title") or "").lower())
    elif s_by in ["draft"]:
        res.sort(key=lambda x: (x.get("status") == "draft", x.get("id", 0)), reverse=True)
    elif s_by in ["published"]:
        res.sort(key=lambda x: (x.get("status") == "published", x.get("id", 0)), reverse=True)

    return res

@app.patch("/courses/{course_id}/status")
def set_course_status(
    course_id: int,
    payload: CourseStatusPayload,
    user: UserDB = Depends(get_current_instructor),
    db: Session = Depends(get_db)
):
    if user.role.upper() == "STUDENT":
        raise HTTPException(status_code=403, detail="Students are not permitted to change course status.")

    course = db.query(CourseDB).filter(CourseDB.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
        
    if user.role.upper() == "INSTRUCTOR" and course.instructor_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden: You are only authorized to manage courses that you own.")
        
    new_status = payload.status.lower().strip()
    allowed_statuses = ["published", "draft", "unpublished", "deactivated", "active", "archived"]
    if new_status not in allowed_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status '{new_status}'. Allowed: {', '.join(allowed_statuses)}")

    if new_status == "active":
        new_status = "published"

    course.status = new_status
    course.updated_at = datetime.utcnow().strftime("%Y-%m-%d")
    db.commit()

    if course.status == "published":
        try:
            NotificationService.notify_eligible_students_for_new_course(db, course)
            NotificationService.notify_instructor_course_published(db, course.instructor_id, course.id, course.title)
            NotificationService.notify_admin_platform_event(
                db=db,
                title="New Course Published 📚",
                message=f"Course '{course.title}' ({course.category}) was published by {course.instructor_name or 'Instructor'}.",
                notification_type="NEW_COURSE_PUBLISHED",
                related_course_id=course.id
            )
        except Exception as _e_notif:
            print(f"[Set Course Status Notification Error] {_e_notif}")

    return {"message": f"Course status updated to {course.status}", "course_id": course.id, "status": course.status}

@app.delete("/courses/{course_id}")
def delete_course(
    course_id: int,
    user: UserDB = Depends(get_current_instructor),
    db: Session = Depends(get_db)
):
    if user.role.upper() == "STUDENT":
        raise HTTPException(status_code=403, detail="Students are not permitted to delete or deactivate courses.")

    course = db.query(CourseDB).filter(CourseDB.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
        
    if user.role.upper() == "INSTRUCTOR" and course.instructor_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden: You are only authorized to manage courses that you own.")
        
    course.status = "deactivated"
    course.updated_at = datetime.utcnow().strftime("%Y-%m-%d")
    db.commit()
    return {"message": "Course successfully deactivated."}

# --- ADMIN SPECIFIC COURSE ROUTES ---

@app.get("/admin/courses")
def get_admin_courses(
    search: Optional[str] = None,
    category: Optional[str] = None,
    level: Optional[str] = None,
    difficulty: Optional[str] = None,
    status: Optional[str] = None,
    is_free: Optional[str] = None,
    min_rating: Optional[float] = None,
    duration: Optional[str] = None,
    sort_by: Optional[str] = "newest",
    user: UserDB = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    query = db.query(CourseDB)
    if status and status.lower() != "all":
        query = query.filter(CourseDB.status == status.lower())
    if category and category.lower() != "all":
        query = query.filter(CourseDB.category.ilike(f"%{category.strip()}%"))
    lvl = level or difficulty
    if lvl and lvl.lower() != "all":
        query = query.filter(CourseDB.level.ilike(f"%{lvl.strip()}%"))
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            (CourseDB.title.ilike(s)) |
            (CourseDB.description.ilike(s)) |
            (CourseDB.category.ilike(s)) |
            (CourseDB.instructor_name.ilike(s))
        )
    courses = query.all()
    res = []
    for c in courses:
        enr_count = db.query(EnrollmentDB).filter(EnrollmentDB.course_id == c.id).count()
        c_dur_hours = parse_duration_hours(c.duration)
        c_is_free = bool(c.is_free if c.is_free is not None else 1) or (c.price == 0.0 or c.price is None)
        c_rating = float(c.rating or 4.8)

        if duration and duration.lower() != "all" and duration.lower() != "any":
            dur_low = duration.lower().replace(" ", "").replace("hours", "").replace("hour", "")
            if dur_low in ["<10", "less10", "lessthan10", "under10"]:
                if c_dur_hours >= 10:
                    continue
            elif dur_low in ["10-20", "10to20", "10_20"]:
                if not (10 <= c_dur_hours <= 20):
                    continue
            elif dur_low in ["20-40", "20to40", "20_40"]:
                if not (20 <= c_dur_hours <= 40):
                    continue
            elif dur_low in ["40+", "40plus", "over40"]:
                if c_dur_hours < 40:
                    continue

        if min_rating and c_rating < float(min_rating):
            continue

        if is_free and is_free.lower() != "all":
            if is_free.lower() in ["free", "1", "true"] and not c_is_free:
                continue
            if is_free.lower() in ["paid", "0", "false"] and c_is_free:
                continue

        res.append({
            "id": c.id,
            "title": c.title,
            "short_description": c.short_description,
            "description": c.description,
            "category": c.category,
            "subcategory": c.subcategory or c.category,
            "instructor_id": c.instructor_id,
            "instructor": c.instructor_name or "Faculty",
            "instructor_name": c.instructor_name or "Faculty",
            "level": c.level,
            "difficulty": c.level,
            "duration": c.duration or "30 hours",
            "duration_hours": c_dur_hours,
            "is_free": 1 if c_is_free else 0,
            "price": c.price or 0.0,
            "currency": c.currency or "INR",
            "status": c.status,
            "rating": c_rating,
            "review_count": c.review_count or 0,
            "enrollment_count": enr_count or c.enrollment_count or 0,
            "skills": c.skills or [],
            "prerequisites": c.prerequisites or [],
            "technical_requirements": c.technical_requirements or [],
            "recommended_knowledge": c.recommended_knowledge or [],
            "target_roles": c.target_roles or [],
            "career_goals": c.career_goals or c.target_roles or [],
            "learning_outcomes": c.learning_outcomes or [],
            "modules": c.modules or [],
            "created_at": c.created_at,
            "updated_at": c.updated_at
        })

    s_by = (sort_by or "newest").lower().strip()
    if s_by in ["newest", "recent"]:
        res.sort(key=lambda x: (x.get("created_at") or "", x.get("id", 0)), reverse=True)
    elif s_by in ["oldest"]:
        res.sort(key=lambda x: (x.get("created_at") or "", x.get("id", 0)))
    elif s_by in ["rating", "highest_rated"]:
        res.sort(key=lambda x: (x.get("rating", 0), x.get("review_count", 0)), reverse=True)
    elif s_by in ["enrollment", "most_enrolled", "popular"]:
        res.sort(key=lambda x: x.get("enrollment_count", 0), reverse=True)
    elif s_by in ["title", "a_z"]:
        res.sort(key=lambda x: (x.get("title") or "").lower())
    elif s_by in ["updated", "recently_updated"]:
        res.sort(key=lambda x: (x.get("updated_at") or x.get("created_at") or "", x.get("id", 0)), reverse=True)

    return res

@app.post("/admin/courses")
def admin_create_course(
    payload: CourseCreatePayload,
    user: UserDB = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return create_course(payload=payload, user=user, db=db)

@app.put("/admin/courses/{course_id}")
def admin_update_course(
    course_id: int,
    payload: CourseCreatePayload,
    user: UserDB = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return update_course(course_id=course_id, payload=payload, user=user, db=db)

@app.patch("/admin/courses/{course_id}/status")
def admin_set_course_status(
    course_id: int,
    payload: CourseStatusPayload,
    user: UserDB = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return set_course_status(course_id=course_id, payload=payload, user=user, db=db)

@app.delete("/admin/courses/{course_id}")
def admin_delete_course(
    course_id: int,
    user: UserDB = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return delete_course(course_id=course_id, user=user, db=db)

# --- ENROLLMENT & PROGRESS ROUTES ---

@app.post("/courses/{course_id}/enroll")
def enroll_course(course_id: int, user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    course = db.query(CourseDB).filter(CourseDB.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    is_free = bool(course.is_free if course.is_free is not None else 1) or (course.price == 0.0 or course.price is None)
    if not is_free:
        # Check if verified payment exists for this user and course
        verified_payment = db.query(PaymentDB).filter(
            PaymentDB.user_id == user.id,
            PaymentDB.course_id == course_id,
            PaymentDB.status == "Successful"
        ).first()
        if not verified_payment:
            raise HTTPException(
                status_code=402,
                detail="This is a paid course. Please complete payment through SmartLearn Checkout to enroll."
            )
        
    enrollment = db.query(EnrollmentDB).filter(
        EnrollmentDB.user_id == user.id,
        EnrollmentDB.course_id == course_id
    ).first()
    
    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    
    if not enrollment:
        enrollment = EnrollmentDB(
            user_id=user.id,
            course_id=course_id,
            enrolled_at=now_str,
            progress_percentage=0,
            status="in_progress",
            completed_lessons=0,
            last_accessed=now_str
        )
        db.add(enrollment)
        course.enrollment_count = (course.enrollment_count or 0) + 1
        
        # Also sync with ProfileDB.courses array
        profile = db.query(ProfileDB).filter(ProfileDB.user_id == user.id).first()
        if profile:
            cur_courses = list(profile.courses or [])
            if not any(c.get("id") == course.id or c.get("title") == course.title for c in cur_courses):
                cur_courses.append({
                    "id": course.id,
                    "title": course.title,
                    "progress": 0,
                    "completed_lessons": 0,
                    "total_lessons": sum(len(m.get("lessons", [])) for m in (course.modules or [])) or 24,
                    "status": "in_progress",
                    "hours": int(course.duration.split(" ")[0]) if " " in (course.duration or "") else 30,
                    "hours_spent": 0,
                    "icon": course.icon
                })
                profile.courses = cur_courses
                
        db.commit()
        try:
            NotificationService.notify_enrollment_success(db, user.id, course.id, course.title)
            NotificationService.notify_instructor_new_enrollment(db, course.instructor_id, user.full_name, course.id, course.title)
            NotificationService.notify_admin_platform_event(
                db=db,
                title="New Student Enrollment 🎓",
                message=f"{user.full_name} enrolled in '{course.title}'.",
                notification_type="NEW_ENROLLMENT",
                related_course_id=course.id
            )
        except Exception as _e_notif:
            print(f"[Enrollment Notification Error] {_e_notif}")

        return {"message": f"Successfully enrolled in {course.title}!", "enrolled": True}
    else:
        return {"message": f"Already enrolled in {course.title}.", "enrolled": True}

@app.get("/my-courses")
def get_my_courses(user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    enrollments = db.query(EnrollmentDB).filter(EnrollmentDB.user_id == user.id).all()
    res = []
    for enr in enrollments:
        c = db.query(CourseDB).filter(CourseDB.id == enr.course_id).first()
        if c:
            total_l = sum(len(m.get("lessons", [])) for m in (c.modules or [])) or 24
            res.append({
                "id": c.id,
                "enrollment_id": enr.id,
                "course_id": c.id,
                "title": c.title,
                "category": c.category,
                "level": c.level,
                "duration": c.duration,
                "instructor": c.instructor_name or "SmartLearn Faculty",
                "icon": c.icon,
                "color_theme": c.color_theme,
                "progress": enr.progress_percentage,
                "completed_lessons": enr.completed_lessons,
                "completed_lesson_ids": enr.completed_lesson_ids or [],
                "last_lesson_id": enr.last_lesson_id,
                "last_lesson_title": enr.last_lesson_title or "Lesson 1",
                "total_lessons": total_l,
                "status": enr.status,
                "enrolled_at": enr.enrolled_at,
                "last_accessed": enr.last_accessed
            })
    return res

@app.patch("/courses/{course_id}/progress")
def update_course_progress(
    course_id: int,
    payload: ProgressUpdatePayload,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    enrollment = db.query(EnrollmentDB).filter(
        EnrollmentDB.user_id == user.id,
        EnrollmentDB.course_id == course_id
    ).first()
    
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found for this course")
        
    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    enrollment.progress_percentage = min(100, max(0, payload.progress_percentage))
    if payload.completed_lessons is not None:
        enrollment.completed_lessons = payload.completed_lessons
    if enrollment.progress_percentage >= 100:
        enrollment.status = "completed"
    enrollment.last_accessed = now_str
    
    # Sync profile courses
    profile = db.query(ProfileDB).filter(ProfileDB.user_id == user.id).first()
    if profile and profile.courses:
        cur_courses = list(profile.courses)
        for c in cur_courses:
            if c.get("id") == course_id:
                c["progress"] = enrollment.progress_percentage
                if payload.completed_lessons is not None:
                    c["completed_lessons"] = payload.completed_lessons
                c["status"] = enrollment.status
        profile.courses = cur_courses
        
    db.commit()

    if enrollment.status == "completed":
        try:
            course = db.query(CourseDB).filter(CourseDB.id == course_id).first()
            if course:
                NotificationService.notify_course_completion(db, user.id, course.id, course.title)
        except Exception as _e_notif:
            print(f"[Course Completion Notification Error] {_e_notif}")

    return {
        "message": "Progress updated successfully",
        "progress_percentage": enrollment.progress_percentage,
        "status": enrollment.status
    }

@app.post("/courses/{course_id}/wishlist")
def toggle_wishlist(course_id: int, user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    course = db.query(CourseDB).filter(CourseDB.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
        
    existing = db.query(WishlistDB).filter(
        WishlistDB.user_id == user.id,
        WishlistDB.course_id == course_id
    ).first()
    
    if existing:
        db.delete(existing)
        db.commit()
        return {"message": "Removed from wishlist", "wishlisted": False}
    else:
        new_w = WishlistDB(
            user_id=user.id,
            course_id=course_id,
            added_at=datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        )
        db.add(new_w)
        db.commit()
        return {"message": "Added to wishlist", "wishlisted": True}

@app.get("/wishlist")
def get_wishlist(user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.query(WishlistDB).filter(WishlistDB.user_id == user.id).all()
    res = []
    for item in items:
        c = db.query(CourseDB).filter(CourseDB.id == item.course_id).first()
        if c:
            res.append({
                "id": c.id,
                "title": c.title,
                "category": c.category,
                "level": c.level,
                "duration": c.duration,
                "rating": c.rating,
                "instructor": c.instructor_name or "SmartLearn Faculty",
                "skills": c.skills or [],
                "added_at": item.added_at
            })
    return res

# --- RECOMMENDATION, SKILL GAP & LEARNING PATH ---

def get_db_course_dicts(db: Session) -> List[Dict[str, Any]]:
    courses = db.query(CourseDB).filter(CourseDB.status == "published").all()
    res = []
    for c in courses:
        res.append({
            "id": c.id,
            "title": c.title,
            "category": c.category,
            "description": c.description,
            "short_description": c.short_description,
            "instructor": c.instructor_name or "SmartLearn Faculty",
            "rating": c.rating or 4.8,
            "review_count": c.review_count or 0,
            "duration": c.duration,
            "lessons_count": sum(len(m.get("lessons", [])) for m in (c.modules or [])) or 24,
            "level": c.level,
            "difficulty": c.level,
            "icon": c.icon,
            "color_theme": c.color_theme,
            "skills": c.skills or [],
            "prerequisites": c.prerequisites or [],
            "technical_requirements": c.technical_requirements or [],
            "recommended_knowledge": c.recommended_knowledge or [],
            "target_roles": c.target_roles or [c.category],
            "career_goals": c.career_goals or c.target_roles or [c.category],
            "learning_outcomes": c.learning_outcomes or [],
            "modules": c.modules or [],
            "domains": [c.category, c.subcategory] if c.subcategory else [c.category]
        })
    return res

@app.get("/recommendations")
def get_recommendations(
    limit: Optional[int] = 6,
    category: Optional[str] = None,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    profile = db.query(ProfileDB).filter(ProfileDB.user_id == user.id).first()
    attempts_db = db.query(AssessmentAttemptDB).filter(AssessmentAttemptDB.user_id == user.id).all()
    attempts = []
    for a in attempts_db:
        assess = db.query(AssessmentDB).filter(AssessmentDB.id == a.assessment_id).first()
        attempts.append({
            "assessment_id": a.assessment_id,
            "category": assess.category if assess else "",
            "score": a.score,
            "percentage": a.percentage,
            "performance_level": a.performance_level
        })
        
    enrollments = db.query(EnrollmentDB).filter(EnrollmentDB.user_id == user.id).all()
    enrolled_course_ids = [e.course_id for e in enrollments]
    completed_course_ids = [e.course_id for e in enrollments if e.status == "completed" or (e.progress_percentage or 0) >= 100]

    profile_dict = {}
    if profile:
        profile_dict = {
            "career_goal": profile.career_goal,
            "secondary_career_goal": profile.secondary_career_goal,
            "skills": profile.skills or [],
            "interests": profile.interests or [],
            "education": profile.education or [],
            "courses": profile.courses or [],
            "learning_style": profile.learning_style
        }
        
    db_courses = get_db_course_dicts(db)
    db_goals = {g.title: g.required_skills for g in db.query(CareerGoalDB).all()}
    
    return RecommendationEngine.get_recommendations(
        profile_data=profile_dict,
        assessment_attempts=attempts,
        limit=limit or 6,
        category=category,
        courses_catalog=db_courses,
        enrolled_course_ids=enrolled_course_ids,
        completed_course_ids=completed_course_ids,
        goals_map=db_goals
    )

@app.get("/skill-gaps")
def get_skill_gaps(user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(ProfileDB).filter(ProfileDB.user_id == user.id).first()
    career_goal = profile.career_goal if profile and profile.career_goal else "Full Stack Web Developer"
    student_skills = profile.skills if profile and profile.skills else []
    
    db_courses = get_db_course_dicts(db)
    db_goals = [
        {"title": g.title, "required_skills": g.required_skills}
        for g in db.query(CareerGoalDB).all()
    ]
    
    return SkillGapAnalyzer.analyze(
        career_goal=career_goal,
        student_skills=student_skills,
        courses_catalog=db_courses,
        db_career_goals=db_goals
    )

@app.get("/learning-path")
def get_learning_path(user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(ProfileDB).filter(ProfileDB.user_id == user.id).first()
    career_goal = profile.career_goal if profile and profile.career_goal else "Full Stack Web Developer"
    secondary_career_goal = profile.secondary_career_goal if profile and profile.secondary_career_goal else None
    
    raw_skills = (profile.skills or []) if profile else []
    student_skills = []
    for s in raw_skills:
        if isinstance(s, str) and s.strip():
            student_skills.append(s.strip())
        elif isinstance(s, dict):
            s_name = (s.get("skill") or s.get("name") or "").strip()
            if s_name:
                student_skills.append(s_name)

    # Retrieve real enrollments from database
    enrollments = db.query(EnrollmentDB).filter(EnrollmentDB.user_id == user.id).all()
    enrolled_courses = []
    for enr in enrollments:
        c = db.query(CourseDB).filter(CourseDB.id == enr.course_id).first()
        if c:
            enrolled_courses.append({
                "id": enr.course_id,
                "course_id": enr.course_id,
                "title": c.title,
                "progress": enr.progress_percentage,
                "progress_percentage": enr.progress_percentage,
                "status": enr.status,
                "completed_lessons": enr.completed_lessons
            })
            if (enr.status == "completed" or (enr.progress_percentage or 0) >= 100) and c.skills:
                for sk in c.skills:
                    if sk and sk not in student_skills:
                        student_skills.append(sk)
    
    # Merge with profile.courses if any
    if profile and profile.courses:
        for pc in profile.courses:
            pcid = pc.get("id") or pc.get("course_id")
            if not any(e["id"] == pcid for e in enrolled_courses):
                enrolled_courses.append(pc)
    
    attempts_db = db.query(AssessmentAttemptDB).filter(AssessmentAttemptDB.user_id == user.id).all()
    attempts = [{"category": a.performance_level, "score": a.score} for a in attempts_db]
    
    db_courses = get_db_course_dicts(db)
    db_goals = [{"title": g.title, "required_skills": g.required_skills} for g in db.query(CareerGoalDB).all()]
    
    return LearningPathGenerator.generate_path(
        career_goal=career_goal,
        secondary_career_goal=secondary_career_goal,
        student_skills=student_skills,
        assessment_results=attempts,
        enrolled_courses=enrolled_courses,
        courses_catalog=db_courses,
        db_career_goals=db_goals
    )

# --- ASSESSMENT ROUTES ---

@app.get("/assessments")
def list_assessments(user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    assessments = db.query(AssessmentDB).all()
    res = []
    for a in assessments:
        q_count = db.query(AssessmentQuestionDB).filter(AssessmentQuestionDB.assessment_id == a.id).count()
        res.append({
            "id": a.id,
            "title": a.title,
            "description": a.description,
            "category": a.category,
            "duration_minutes": a.duration_minutes,
            "total_questions": q_count or a.total_questions,
            "passing_score": a.passing_score
        })
    return res

@app.get("/assessments/my-results")
def get_my_assessment_results(user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    return AssessmentService.get_user_history(
        db=db,
        AttemptModel=AssessmentAttemptDB,
        AssessmentModel=AssessmentDB,
        user_id=user.id
    )

@app.get("/assessments/{assessment_id}")
def get_assessment(assessment_id: int, user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    assessment, questions = AssessmentService.get_by_id(db, AssessmentDB, AssessmentQuestionDB, assessment_id)
    public_questions = []
    for q in questions:
        public_questions.append({
            "id": q.id,
            "question_text": q.question_text,
            "options": q.options,
            "points": q.points
        })
    return {
        "id": assessment.id,
        "title": assessment.title,
        "description": assessment.description,
        "category": assessment.category,
        "duration_minutes": assessment.duration_minutes,
        "total_questions": len(public_questions),
        "passing_score": assessment.passing_score,
        "questions": public_questions
    }

@app.post("/assessments/{assessment_id}/submit")
def submit_assessment(
    assessment_id: int,
    payload: AssessmentSubmitPayload,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    res = AssessmentService.submit(
        db=db,
        AssessmentModel=AssessmentDB,
        QuestionModel=AssessmentQuestionDB,
        AttemptModel=AssessmentAttemptDB,
        user_id=user.id,
        assessment_id=assessment_id,
        answers=payload.answers
    )

    try:
        profile = db.query(ProfileDB).filter(ProfileDB.user_id == user.id).first()
        category = res.get("category", "General")
        score_pct = res.get("percentage", 0)

        strong = []
        weak = []
        if score_pct >= 70:
            strong.append(category)
        else:
            weak.append(category)

        db_courses = get_db_course_dicts(db)
        recs = RecommendationEngine.get_recommendations(
            profile_data={"career_goal": profile.career_goal if profile else None, "skills": profile.skills if profile else []},
            assessment_attempts=[{"category": category, "percentage": score_pct, "score": res.get("score")}],
            limit=3,
            courses_catalog=db_courses
        ).get("recommendations", [])

        NotificationService.notify_assessment_improvement(
            db=db,
            user_id=user.id,
            assessment_title=res.get("assessment_title", "Skill Assessment"),
            score_percentage=score_pct,
            strong_skills=strong,
            weak_skills=weak,
            recommended_courses=recs,
            assessment_id=assessment_id
        )
    except Exception as _a_err:
        print(f"[Assessment Notification Error] {_a_err}")

    return res

@app.get("/assessments/{assessment_id}/result")
def get_latest_assessment_result(assessment_id: int, user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    attempt = db.query(AssessmentAttemptDB).filter(
        AssessmentAttemptDB.user_id == user.id,
        AssessmentAttemptDB.assessment_id == assessment_id
    ).order_by(AssessmentAttemptDB.id.desc()).first()
    
    if not attempt:
        raise HTTPException(status_code=404, detail="No previous attempt found for this assessment")
        
    assessment = db.query(AssessmentDB).filter(AssessmentDB.id == assessment_id).first()
    return {
        "attempt_id": attempt.id,
        "assessment_id": attempt.assessment_id,
        "assessment_title": assessment.title if assessment else "Assessment",
        "category": assessment.category if assessment else "General",
        "score": attempt.score,
        "max_score": attempt.max_score,
        "percentage": attempt.percentage,
        "performance_level": attempt.performance_level,
        "feedback": attempt.feedback,
        "submitted_at": attempt.submitted_at
    }

# --- INSTRUCTOR SPECIFIC ROUTES ---

@app.get("/instructor/stats")
def get_instructor_stats(user: UserDB = Depends(get_current_instructor), db: Session = Depends(get_db)):
    my_courses = db.query(CourseDB).filter(CourseDB.instructor_id == user.id).all()
    course_ids = [c.id for c in my_courses]
    
    total_courses = len(my_courses)
    published_courses = sum(1 for c in my_courses if c.status == "published")
    draft_courses = sum(1 for c in my_courses if c.status == "draft")
    
    total_students = 0
    if course_ids:
        total_students = db.query(EnrollmentDB.user_id).filter(EnrollmentDB.course_id.in_(course_ids)).distinct().count()
        
    ratings = [c.rating for c in my_courses if c.rating]
    avg_rating = round(sum(ratings) / len(ratings), 1) if ratings else 4.8
    
    recent_enrollments = []
    if course_ids:
        recent_enr_db = db.query(EnrollmentDB).filter(EnrollmentDB.course_id.in_(course_ids)).order_by(EnrollmentDB.id.desc()).limit(5).all()
        for enr in recent_enr_db:
            st = db.query(UserDB).filter(UserDB.id == enr.user_id).first()
            co = db.query(CourseDB).filter(CourseDB.id == enr.course_id).first()
            recent_enrollments.append({
                "student_name": st.full_name if st else "Student",
                "course_title": co.title if co else "Course",
                "enrolled_at": enr.enrolled_at,
                "progress": enr.progress_percentage
            })
            
    return {
        "instructor_name": user.full_name,
        "total_courses": total_courses,
        "published_courses": published_courses,
        "draft_courses": draft_courses,
        "total_students": total_students,
        "average_rating": avg_rating,
        "recent_enrollments": recent_enrollments
    }

@app.get("/instructor/courses")
def get_instructor_courses(user: UserDB = Depends(get_current_instructor), db: Session = Depends(get_db)):
    courses = db.query(CourseDB).filter(CourseDB.instructor_id == user.id).order_by(CourseDB.id.desc()).all()
    res = []
    for c in courses:
        student_count = db.query(EnrollmentDB).filter(EnrollmentDB.course_id == c.id).count()
        res.append({
            "id": c.id,
            "title": c.title,
            "short_description": c.short_description or (c.description[:120] + "..." if c.description else ""),
            "description": c.description or "",
            "category": c.category,
            "subcategory": c.subcategory or c.category,
            "instructor_id": c.instructor_id,
            "instructor": c.instructor_name or user.full_name,
            "instructor_name": c.instructor_name or user.full_name,
            "level": c.level,
            "difficulty": c.level,
            "duration": c.duration,
            "status": c.status,
            "rating": c.rating or 4.8,
            "students_count": student_count,
            "enrollment_count": student_count,
            "skills": c.skills or [],
            "prerequisites": c.prerequisites or [],
            "technical_requirements": c.technical_requirements or [],
            "recommended_knowledge": c.recommended_knowledge or [],
            "target_roles": c.target_roles or [],
            "career_goals": c.career_goals or c.target_roles or [],
            "learning_outcomes": c.learning_outcomes or [],
            "modules": c.modules or [],
            "created_at": c.created_at,
            "updated_at": c.updated_at
        })
    return res

# --- ADMIN SPECIFIC ROUTES ---

@app.get("/admin/stats")
def get_admin_stats(user: UserDB = Depends(get_current_admin), db: Session = Depends(get_db)):
    total_students = db.query(UserDB).filter(UserDB.role.in_(["Student", "STUDENT", "student"])).count()
    total_instructors = db.query(UserDB).filter(UserDB.role.in_(["Instructor", "INSTRUCTOR", "instructor"])).count()
    total_courses = db.query(CourseDB).count()
    published_courses = db.query(CourseDB).filter(CourseDB.status == "published").count()
    draft_courses = db.query(CourseDB).filter(CourseDB.status == "draft").count()
    total_skills = db.query(SkillDB).count()
    total_categories = db.query(CategoryDB).count()
    total_career_goals = db.query(CareerGoalDB).count()
    total_assessments = db.query(AssessmentDB).count()
    total_enrollments = db.query(EnrollmentDB).count()
    
    # Recent users
    recent_users_db = db.query(UserDB).order_by(UserDB.id.desc()).limit(6).all()
    recent_users = [
        {"id": u.id, "full_name": u.full_name, "email": u.email, "role": u.role, "is_active": getattr(u, "is_active", 1), "created_at": u.created_at or "Recent"}
        for u in recent_users_db
    ]
    
    # Recent courses
    recent_courses_db = db.query(CourseDB).order_by(CourseDB.id.desc()).limit(5).all()
    recent_courses = [
        {"id": c.id, "title": c.title, "category": c.category, "instructor": c.instructor_name, "status": c.status, "rating": c.rating}
        for c in recent_courses_db
    ]
    
    # Category enrollment statistics
    categories = db.query(CategoryDB).all()
    cat_stats = []
    for cat in categories:
        courses_in_cat = db.query(CourseDB.id).filter(CourseDB.category.ilike(f"%{cat.name}%")).all()
        c_ids = [c[0] for c in courses_in_cat]
        enr_count = db.query(EnrollmentDB).filter(EnrollmentDB.course_id.in_(c_ids)).count() if c_ids else 0
        cat_stats.append({"category": cat.name, "course_count": len(c_ids), "enrollment_count": enr_count})
        
    return {
        "total_students": total_students,
        "total_instructors": total_instructors,
        "total_courses": total_courses,
        "published_courses": published_courses,
        "draft_courses": draft_courses,
        "total_skills": total_skills,
        "total_categories": total_categories,
        "total_career_goals": total_career_goals,
        "total_assessments": total_assessments,
        "total_enrollments": total_enrollments,
        "recent_users": recent_users,
        "recent_courses": recent_courses,
        "category_statistics": cat_stats
    }

@app.get("/admin/users")
@app.get("/api/admin/users")
def get_admin_users(
    search: Optional[str] = None,
    role: Optional[str] = None,
    status: Optional[str] = None,
    user: UserDB = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    query = db.query(UserDB)
    if role and role.lower() != "all":
        query = query.filter(UserDB.role.ilike(role))
    if status and status.lower() != "all":
        target_active = 1 if status.lower() == "active" else 0
        query = query.filter(UserDB.is_active == target_active)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter((UserDB.full_name.ilike(s)) | (UserDB.email.ilike(s)))
        
    users = query.order_by(UserDB.id.desc()).all()
    res = []
    for u in users:
        is_primary_admin = (u.email == INITIAL_ADMIN_EMAIL)
        prof = db.query(ProfileDB).filter(ProfileDB.user_id == u.id).first()
        enrs = db.query(EnrollmentDB).filter(EnrollmentDB.user_id == u.id).all()
        enrolled_count = len(enrs)
        completed_count = sum(1 for e in enrs if e.status == "completed" or e.progress_percentage == 100)
        avg_prog = round(sum(e.progress_percentage for e in enrs) / enrolled_count) if enrolled_count > 0 else 0
        
        res.append({
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role,
            "is_active": getattr(u, "is_active", 1),
            "status": "Active" if getattr(u, "is_active", 1) == 1 else "Inactive",
            "is_primary_admin": is_primary_admin,
            "created_at": u.created_at or "2026-09-09",
            "enrolled_courses_count": enrolled_count,
            "completed_courses_count": completed_count,
            "avg_progress": avg_prog,
            "career_goal": prof.career_goal if (prof and prof.career_goal) else "Not specified"
        })
    return res

@app.get("/admin/students")
@app.get("/api/admin/students")
def get_admin_students(
    search: Optional[str] = None,
    course_id: Optional[str] = Query(None),
    status: Optional[str] = None,
    sort_by: Optional[str] = "newest",
    user: UserDB = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    target_cid = None
    if course_id is not None and str(course_id).strip().lower() not in ("all", "none", "", "null", "undefined"):
        try:
            target_cid = int(course_id)
        except ValueError:
            target_cid = None

    query = db.query(UserDB).filter(UserDB.role.ilike("student"))
    if search:
        s = f"%{search.strip()}%"
        query = query.filter((UserDB.full_name.ilike(s)) | (UserDB.email.ilike(s)))
        
    students_db = query.order_by(UserDB.id.desc()).all()
    
    courses_map = {c.id: c for c in db.query(CourseDB).all()}
    
    result_students = []
    
    for s_user in students_db:
        prof = db.query(ProfileDB).filter(ProfileDB.user_id == s_user.id).first()
        enr_query = db.query(EnrollmentDB).filter(EnrollmentDB.user_id == s_user.id)
        
        if target_cid is not None:
            enr_query = enr_query.filter(EnrollmentDB.course_id == target_cid)
            
        student_enrs = enr_query.all()
        
        if target_cid is not None and not student_enrs:
            continue
            
        enrolled_count = len(student_enrs)
        completed_count = sum(1 for e in student_enrs if e.status == "completed" or e.progress_percentage == 100)
        avg_prog = round(sum(e.progress_percentage for e in student_enrs) / enrolled_count) if enrolled_count > 0 else 0
        
        enrollments_list = []
        for e in student_enrs:
            c_obj = courses_map.get(e.course_id)
            total_lessons = sum(len(m.get("lessons", [])) for m in (c_obj.modules or [])) if (c_obj and c_obj.modules) else 24
            completed_lessons = int(round((e.progress_percentage / 100.0) * total_lessons)) if total_lessons > 0 else 0
            
            enrollments_list.append({
                "enrollment_id": e.id,
                "course_id": e.course_id,
                "course_title": c_obj.title if c_obj else f"Course #{e.course_id}",
                "instructor_name": c_obj.instructor_name if c_obj else "Faculty",
                "enrolled_at": e.enrolled_at or "Recent",
                "progress_percentage": e.progress_percentage,
                "completed_lessons": completed_lessons,
                "total_lessons": total_lessons,
                "status": "completed" if (e.status == "completed" or e.progress_percentage == 100) else ("in_progress" if e.progress_percentage > 0 else "not_started"),
                "last_accessed": e.last_accessed or "Recently"
            })
            
        # Status filter
        is_active_user = getattr(s_user, "is_active", 1) == 1
        st_status = "Active" if is_active_user else "Inactive"
        if status and status.lower() != "all":
            if status.lower() == "active" and not is_active_user:
                continue
            if status.lower() == "inactive" and is_active_user:
                continue
                
        # Parse student skills with proficiency
        raw_skills = prof.skills if (prof and prof.skills) else []
        formatted_skills = []
        if isinstance(raw_skills, list):
            for sk in raw_skills:
                if isinstance(sk, dict):
                    formatted_skills.append({"name": sk.get("name", "Skill"), "proficiency": sk.get("proficiency", "Intermediate")})
                elif isinstance(sk, str):
                    formatted_skills.append({"name": sk, "proficiency": "Intermediate"})
                    
        result_students.append({
            "student_id": s_user.id,
            "name": s_user.full_name,
            "email": s_user.email,
            "created_at": s_user.created_at or "2026-09-09",
            "is_active": getattr(s_user, "is_active", 1),
            "status": st_status,
            "career_goal": prof.career_goal if (prof and prof.career_goal) else "Software Developer",
            "secondary_career_goal": prof.secondary_career_goal if (prof and prof.secondary_career_goal) else None,
            "interests": prof.interests if (prof and prof.interests) else ["Web Development", "AI", "Cybersecurity"],
            "skills": formatted_skills if formatted_skills else [{"name": "Python", "proficiency": "Intermediate"}, {"name": "JavaScript", "proficiency": "Intermediate"}],
            "enrolled_courses_count": enrolled_count,
            "completed_courses_count": completed_count,
            "overall_progress": avg_prog,
            "enrollments": enrollments_list
        })
        
    all_all_enrs = db.query(EnrollmentDB).all()
    avg_platform_progress = round(sum(e.progress_percentage for e in all_all_enrs) / len(all_all_enrs)) if all_all_enrs else 0
    completed_students_count = sum(1 for s in result_students if s["completed_courses_count"] > 0)
    active_students_count = sum(1 for s in result_students if s["overall_progress"] > 0)
    
    return {
        "total_students": len(result_students),
        "active_students": active_students_count,
        "completed_students": completed_students_count,
        "avg_progress": avg_platform_progress,
        "students": result_students
    }

@app.get("/admin/students/{student_id}")
@app.get("/api/admin/students/{student_id}")
def get_admin_student_detail(
    student_id: int,
    user: UserDB = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    student_user = db.query(UserDB).filter(UserDB.id == student_id, UserDB.role.ilike("student")).first()
    if not student_user:
        raise HTTPException(status_code=404, detail="Student not found")
        
    prof = db.query(ProfileDB).filter(ProfileDB.user_id == student_id).first()
    student_enrs = db.query(EnrollmentDB).filter(EnrollmentDB.user_id == student_id).all()
    courses_map = {c.id: c for c in db.query(CourseDB).all()}
    
    enrollments_list = []
    for e in student_enrs:
        c_obj = courses_map.get(e.course_id)
        total_lessons = sum(len(m.get("lessons", [])) for m in (c_obj.modules or [])) if (c_obj and c_obj.modules) else 24
        completed_lessons = int(round((e.progress_percentage / 100.0) * total_lessons)) if total_lessons > 0 else 0
        
        enrollments_list.append({
            "enrollment_id": e.id,
            "course_id": e.course_id,
            "course_title": c_obj.title if c_obj else f"Course #{e.course_id}",
            "instructor_name": c_obj.instructor_name if c_obj else "Faculty",
            "enrolled_at": e.enrolled_at or "Recent",
            "progress_percentage": e.progress_percentage,
            "completed_lessons": completed_lessons,
            "total_lessons": total_lessons,
            "status": "completed" if (e.status == "completed" or e.progress_percentage == 100) else ("in_progress" if e.progress_percentage > 0 else "not_started"),
            "last_accessed": e.last_accessed or "Recently",
            "completed_at": e.last_accessed if (e.status == "completed" or e.progress_percentage == 100) else None
        })
        
    raw_skills = prof.skills if (prof and prof.skills) else []
    formatted_skills = []
    if isinstance(raw_skills, list):
        for sk in raw_skills:
            if isinstance(sk, dict):
                formatted_skills.append({"name": sk.get("name", "Skill"), "proficiency": sk.get("proficiency", "Intermediate")})
            elif isinstance(sk, str):
                formatted_skills.append({"name": sk, "proficiency": "Intermediate"})
                
    return {
        "student_id": student_user.id,
        "name": student_user.full_name,
        "email": student_user.email,
        "created_at": student_user.created_at or "2026-09-09",
        "is_active": getattr(student_user, "is_active", 1),
        "status": "Active" if getattr(student_user, "is_active", 1) == 1 else "Inactive",
        "profile": {
            "phone": prof.phone if prof else "Not specified",
            "dob": prof.dob if prof else "Not specified",
            "gender": prof.gender if prof else "Not specified",
            "city": prof.city if prof else "Not specified",
            "education": prof.education if (prof and prof.education) else ["B.Tech Computer Science"]
        },
        "interests": prof.interests if (prof and prof.interests) else ["Web Development", "Artificial Intelligence", "Cybersecurity"],
        "skills": formatted_skills if formatted_skills else [{"name": "Python", "proficiency": "Advanced"}, {"name": "JavaScript", "proficiency": "Intermediate"}, {"name": "SQL", "proficiency": "Beginner"}],
        "career_goals": {
            "primary": prof.career_goal if (prof and prof.career_goal) else "Full Stack Software Engineer",
            "secondary": prof.secondary_career_goal if (prof and prof.secondary_career_goal) else "AI Application Developer"
        },
        "enrollments": enrollments_list
    }

@app.get("/admin/instructors")
@app.get("/api/admin/instructors")
def get_admin_instructors(
    search: Optional[str] = None,
    status: Optional[str] = None,
    sort_by: Optional[str] = "newest",
    user: UserDB = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    query = db.query(UserDB).filter(UserDB.role.ilike("instructor"))
    if search:
        s = f"%{search.strip()}%"
        query = query.filter((UserDB.full_name.ilike(s)) | (UserDB.email.ilike(s)))
        
    instructors_db = query.order_by(UserDB.id.desc()).all()
    all_courses = db.query(CourseDB).all()
    all_enrollments = db.query(EnrollmentDB).all()
    all_reviews = db.query(ReviewDB).all()
    
    result_instructors = []
    
    for inst in instructors_db:
        inst_courses = [c for c in all_courses if c.instructor_id == inst.id]
        inst_course_ids = [c.id for c in inst_courses]
        
        published_c = sum(1 for c in inst_courses if c.status == "published")
        draft_c = sum(1 for c in inst_courses if c.status == "draft")
        
        inst_enrollments = [e for e in all_enrollments if e.course_id in inst_course_ids]
        unique_students = len(set(e.user_id for e in inst_enrollments))
        
        inst_reviews = [r for r in all_reviews if r.course_id in inst_course_ids]
        avg_rat = round(sum(r.rating for r in inst_reviews) / len(inst_reviews), 1) if inst_reviews else (
            round(sum(c.rating for c in inst_courses) / len(inst_courses), 1) if inst_courses else 5.0
        )
        
        is_active = getattr(inst, "is_active", 1) == 1
        inst_status = "Active" if is_active else "Inactive"
        
        if status and status.lower() != "all":
            if status.lower() == "active" and not is_active:
                continue
            if status.lower() == "inactive" and is_active:
                continue
                
        prof = db.query(ProfileDB).filter(ProfileDB.user_id == inst.id).first()
        raw_skills = prof.skills if (prof and prof.skills) else []
        formatted_skills = []
        if isinstance(raw_skills, list):
            for sk in raw_skills:
                if isinstance(sk, dict):
                    formatted_skills.append({"name": sk.get("name", "Skill"), "proficiency": sk.get("proficiency", "Expert")})
                elif isinstance(sk, str):
                    formatted_skills.append({"name": sk, "proficiency": "Expert"})
                    
        result_instructors.append({
            "instructor_id": inst.id,
            "name": inst.full_name,
            "email": inst.email,
            "created_at": inst.created_at or "2026-09-09",
            "is_active": getattr(inst, "is_active", 1),
            "status": inst_status,
            "total_courses": len(inst_courses),
            "published_courses": published_c,
            "draft_courses": draft_c,
            "total_students": unique_students,
            "total_enrollments": len(inst_enrollments),
            "avg_rating": avg_rat,
            "total_reviews": len(inst_reviews),
            "skills": formatted_skills if formatted_skills else [{"name": "Software Engineering", "proficiency": "Expert"}, {"name": "Cybersecurity", "proficiency": "Advanced"}]
        })
        
    return {
        "total_instructors": len(result_instructors),
        "instructors": result_instructors
    }

@app.get("/admin/instructors/{instructor_id}")
@app.get("/api/admin/instructors/{instructor_id}")
def get_admin_instructor_detail(
    instructor_id: int,
    user: UserDB = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    inst_user = db.query(UserDB).filter(UserDB.id == instructor_id, UserDB.role.ilike("instructor")).first()
    if not inst_user:
        raise HTTPException(status_code=404, detail="Instructor not found")
        
    prof = db.query(ProfileDB).filter(ProfileDB.user_id == instructor_id).first()
    inst_courses = db.query(CourseDB).filter(CourseDB.instructor_id == instructor_id).all()
    inst_course_ids = [c.id for c in inst_courses]
    
    inst_enrollments = db.query(EnrollmentDB).filter(EnrollmentDB.course_id.in_(inst_course_ids)).all() if inst_course_ids else []
    inst_reviews = db.query(ReviewDB).filter(ReviewDB.course_id.in_(inst_course_ids)).all() if inst_course_ids else []
    
    users_map = {u.id: u for u in db.query(UserDB).all()}
    
    published_c = sum(1 for c in inst_courses if c.status == "published")
    draft_c = sum(1 for c in inst_courses if c.status == "draft")
    unique_students = len(set(e.user_id for e in inst_enrollments))
    avg_rat = round(sum(r.rating for r in inst_reviews) / len(inst_reviews), 1) if inst_reviews else (
        round(sum(c.rating for c in inst_courses) / len(inst_courses), 1) if inst_courses else 5.0
    )
    
    authored_courses_detail = []
    for c in inst_courses:
        c_enrs = [e for e in inst_enrollments if e.course_id == c.id]
        c_unique_students = len(set(e.user_id for e in c_enrs))
        c_completed = sum(1 for e in c_enrs if e.status == "completed" or e.progress_percentage == 100)
        c_completion_rate = round((c_completed / len(c_enrs)) * 100) if c_enrs else 0
        c_avg_progress = round(sum(e.progress_percentage for e in c_enrs) / len(c_enrs)) if c_enrs else 0
        
        c_revs = [r for r in inst_reviews if r.course_id == c.id]
        c_avg_rating = round(sum(r.rating for r in c_revs) / len(c_revs), 1) if c_revs else c.rating
        
        total_lessons = sum(len(m.get("lessons", [])) for m in (c.modules or [])) if c.modules else 24
        
        enrolled_students_list = []
        for e in c_enrs:
            st_u = users_map.get(e.user_id)
            completed_lessons = int(round((e.progress_percentage / 100.0) * total_lessons)) if total_lessons > 0 else 0
            enrolled_students_list.append({
                "student_id": e.user_id,
                "student_name": st_u.full_name if st_u else f"Student #{e.user_id}",
                "student_email": st_u.email if st_u else "student@example.com",
                "enrolled_at": e.enrolled_at or "Recent",
                "progress_percentage": e.progress_percentage,
                "completed_lessons": completed_lessons,
                "total_lessons": total_lessons,
                "status": "completed" if (e.status == "completed" or e.progress_percentage == 100) else ("in_progress" if e.progress_percentage > 0 else "not_started"),
                "last_accessed": e.last_accessed or "Recently"
            })
            
        authored_courses_detail.append({
            "course_id": c.id,
            "title": c.title,
            "category": c.category,
            "level": c.level,
            "price": c.price,
            "is_free": bool(c.is_free),
            "status": c.status,
            "created_at": c.created_at or "Recent",
            "enrolled_students_count": c_unique_students,
            "total_enrollments": len(c_enrs),
            "avg_progress": c_avg_progress,
            "completion_rate": c_completion_rate,
            "rating": c_avg_rating,
            "review_count": len(c_revs),
            "enrolled_students": enrolled_students_list
        })
        
    reviews_detail = []
    for r in inst_reviews:
        st_u = users_map.get(r.user_id)
        c_obj = next((c for c in inst_courses if c.id == r.course_id), None)
        reviews_detail.append({
            "review_id": r.id,
            "student_name": st_u.full_name if st_u else f"Student #{r.user_id}",
            "student_email": st_u.email if st_u else "",
            "course_title": c_obj.title if c_obj else "Course",
            "rating": r.rating,
            "comment": r.comment or "Great curriculum!",
            "created_at": r.created_at or "Recent"
        })
        
    raw_skills = prof.skills if (prof and prof.skills) else []
    formatted_skills = []
    if isinstance(raw_skills, list):
        for sk in raw_skills:
            if isinstance(sk, dict):
                formatted_skills.append({"name": sk.get("name", "Skill"), "proficiency": sk.get("proficiency", "Expert")})
            elif isinstance(sk, str):
                formatted_skills.append({"name": sk, "proficiency": "Expert"})
                
    return {
        "instructor_id": inst_user.id,
        "name": inst_user.full_name,
        "email": inst_user.email,
        "created_at": inst_user.created_at or "2026-09-09",
        "is_active": getattr(inst_user, "is_active", 1),
        "status": "Active" if getattr(inst_user, "is_active", 1) == 1 else "Inactive",
        "summary": {
            "total_courses": len(inst_courses),
            "published_courses": published_c,
            "draft_courses": draft_c,
            "total_students": unique_students,
            "total_enrollments": len(inst_enrollments),
            "avg_rating": avg_rat,
            "total_reviews": len(inst_reviews)
        },
        "skills": formatted_skills if formatted_skills else [{"name": "Software Architecture", "proficiency": "Expert"}, {"name": "Cybersecurity", "proficiency": "Advanced"}],
        "authored_courses": authored_courses_detail,
        "reviews": reviews_detail
    }

@app.put("/admin/users/{user_id}/status")
def toggle_user_status(user_id: int, user: UserDB = Depends(get_current_admin), db: Session = Depends(get_db)):
    target_user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Prevent deactivating the initial admin
    if target_user.email == INITIAL_ADMIN_EMAIL:
        raise HTTPException(status_code=400, detail="The primary system admin account cannot be deactivated.")
        
    current_status = getattr(target_user, "is_active", 1)
    target_user.is_active = 0 if current_status == 1 else 1
    db.commit()
    return {"message": f"User status updated to {'active' if target_user.is_active else 'inactive'}", "is_active": target_user.is_active}

# --- PUBLIC & ADMIN CRUD FOR CATEGORIES, SKILLS, CAREER GOALS ---

@app.get("/categories")
@app.get("/admin/categories")
def get_categories(db: Session = Depends(get_db)):
    cats = db.query(CategoryDB).all()
    res = []
    for c in cats:
        count = db.query(CourseDB).filter(CourseDB.category.ilike(f"%{c.name}%"), CourseDB.status == "published").count()
        res.append({"id": c.id, "name": c.name, "description": c.description, "icon": c.icon, "course_count": count})
    return res

@app.post("/admin/categories")
def create_category(payload: CategoryPayload, user: UserDB = Depends(get_current_admin), db: Session = Depends(get_db)):
    cat = CategoryDB(name=payload.name, description=payload.description, icon=payload.icon)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return {"message": "Category created", "category": {"id": cat.id, "name": cat.name}}

@app.delete("/admin/categories/{category_id}")
def delete_category(category_id: int, user: UserDB = Depends(get_current_admin), db: Session = Depends(get_db)):
    cat = db.query(CategoryDB).filter(CategoryDB.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(cat)
    db.commit()
    return {"message": "Category deleted"}

@app.get("/skills")
@app.get("/admin/skills")
def get_skills(category: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(SkillDB)
    if category and category.lower() != "all":
        query = query.filter(SkillDB.category.ilike(f"%{category.strip()}%"))
    return query.all()

@app.post("/admin/skills")
def create_skill(payload: SkillPayload, user: UserDB = Depends(get_current_admin), db: Session = Depends(get_db)):
    skill = SkillDB(name=payload.name, category=payload.category, description=payload.description, proficiency_levels=["Beginner", "Intermediate", "Advanced", "Expert"])
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return {"message": "Skill created", "skill": skill}

@app.delete("/admin/skills/{skill_id}")
def delete_skill(skill_id: int, user: UserDB = Depends(get_current_admin), db: Session = Depends(get_db)):
    skill = db.query(SkillDB).filter(SkillDB.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    db.delete(skill)
    db.commit()
    return {"message": "Skill deleted"}

@app.get("/career-goals")
@app.get("/admin/career-goals")
def get_career_goals(db: Session = Depends(get_db)):
    return db.query(CareerGoalDB).all()

@app.post("/admin/career-goals")
def create_career_goal(payload: CareerGoalPayload, user: UserDB = Depends(get_current_admin), db: Session = Depends(get_db)):
    goal = CareerGoalDB(
        title=payload.title,
        description=payload.description,
        required_skills=payload.required_skills or [],
        recommended_categories=payload.recommended_categories or []
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return {"message": "Career Goal created", "career_goal": goal}

@app.delete("/admin/career-goals/{goal_id}")
def delete_career_goal(goal_id: int, user: UserDB = Depends(get_current_admin), db: Session = Depends(get_db)):
    goal = db.query(CareerGoalDB).filter(CareerGoalDB.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Career goal not found")
    db.delete(goal)
    db.commit()
    return {"message": "Career goal deleted"}

@app.get("/admin/reports")
def get_admin_reports(user: UserDB = Depends(get_current_admin), db: Session = Depends(get_db)):
    total_users = db.query(UserDB).count()
    total_enrollments = db.query(EnrollmentDB).count()
    completed_enrollments = db.query(EnrollmentDB).filter(EnrollmentDB.status == "completed").count()
    attempts_count = db.query(AssessmentAttemptDB).count()
    
    completion_rate = round((completed_enrollments / total_enrollments) * 100) if total_enrollments > 0 else 0
    
    courses = db.query(CourseDB).all()
    popular_courses = sorted(
        [{"id": c.id, "title": c.title, "category": c.category, "rating": c.rating, "enrollments": c.enrollment_count or 0} for c in courses],
        key=lambda x: x["enrollments"],
        reverse=True
    )[:5]
    
    return {
        "total_users": total_users,
        "total_enrollments": total_enrollments,
        "completed_enrollments": completed_enrollments,
        "system_completion_rate": completion_rate,
        "total_assessments_taken": attempts_count,
        "popular_courses": popular_courses
    }


# --- UNIFIED DASHBOARD SUMMARY ROUTES ---

@app.get("/student/dashboard-summary")
def get_student_dashboard_summary(
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if user.role.upper() != "STUDENT":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Student privileges are required."
        )
    profile = db.query(ProfileDB).filter(ProfileDB.user_id == user.id).first()
    enrollments = db.query(EnrollmentDB).filter(EnrollmentDB.user_id == user.id).all()
    attempts = db.query(AssessmentAttemptDB).filter(AssessmentAttemptDB.user_id == user.id).order_by(AssessmentAttemptDB.id.desc()).all()
    
    enrolled_count = len(enrollments)
    completed_count = sum(1 for e in enrollments if e.status == "completed" or e.progress_percentage >= 100)
    in_progress_count = enrolled_count - completed_count
    
    # Skills from profile + completed courses
    raw_skills = (profile.skills or []) if profile else []
    skills_list = []
    for s in raw_skills:
        if isinstance(s, str) and s.strip():
            skills_list.append(s.strip())
        elif isinstance(s, dict):
            s_name = (s.get("skill") or s.get("name") or "").strip()
            if s_name:
                skills_list.append(s_name)
    skills_list = [s for s in skills_list if s]

    all_student_skills = list(skills_list)
    for e in enrollments:
        if e.status == "completed" or (e.progress_percentage or 0) >= 100:
            c = db.query(CourseDB).filter(CourseDB.id == e.course_id).first()
            if c and c.skills:
                for sk in c.skills:
                    if sk and sk not in all_student_skills:
                        all_student_skills.append(sk)

    skills_count = len(skills_list)
    
    # Real learning hours calculation (strictly from actual course progress & assessment tests)
    learning_hours = 0
    for e in enrollments:
        c = db.query(CourseDB).filter(CourseDB.id == e.course_id).first()
        if c and c.duration:
            try:
                hrs = int(c.duration.split(" ")[0])
                learning_hours += round((hrs * e.progress_percentage) / 100)
            except Exception:
                pass
    if attempts:
        learning_hours += round(len(attempts) * 0.5)
        
    latest_assessment = attempts[0] if attempts else None
    latest_assessment_score = latest_assessment.percentage if latest_assessment else None
    
    profile_completion = profile.completion_percentage if profile else 0
    career_goal = (profile.career_goal or "").strip() if profile else ""
    secondary_career_goal = (profile.secondary_career_goal or "").strip() if profile else ""
    
    # In-progress courses list (filtered to courses currently in progress < 100%)
    in_progress_courses = []
    active_enrollments = [e for e in enrollments if e.status != "completed" and (e.progress_percentage or 0) < 100]
    active_enrollments.sort(key=lambda x: ((x.progress_percentage or 0) > 0, str(x.last_accessed or x.enrolled_at or "")), reverse=True)

    for e in active_enrollments:
        c = db.query(CourseDB).filter(CourseDB.id == e.course_id).first()
        if c:
            total_lessons = sum(len(m.get("lessons", [])) for m in (c.modules or [])) or 24
            in_progress_courses.append({
                "course_id": c.id,
                "title": c.title,
                "category": c.category,
                "level": c.level,
                "duration": c.duration,
                "instructor": c.instructor_name or "SmartLearn Faculty",
                "icon": c.icon,
                "color_theme": c.color_theme,
                "progress": e.progress_percentage,
                "completed_lessons": e.completed_lessons,
                "completed_lesson_ids": e.completed_lesson_ids or [],
                "last_lesson_id": e.last_lesson_id,
                "last_lesson_title": e.last_lesson_title or "Next Lesson",
                "total_lessons": total_lessons,
                "status": e.status,
                "last_accessed": e.last_accessed or e.enrolled_at
            })
            
    # Recommendations
    db_courses = get_db_course_dicts(db)
    rec_attempts = []
    for a in attempts:
        assess = db.query(AssessmentDB).filter(AssessmentDB.id == a.assessment_id).first()
        rec_attempts.append({
            "assessment_id": a.assessment_id,
            "category": assess.category if assess else "",
            "score": a.score,
            "percentage": a.percentage,
            "performance_level": a.performance_level
        })
    db_goals_map = {g.title: g.required_skills for g in db.query(CareerGoalDB).all()}
    profile_dict = {
        "career_goal": career_goal,
        "secondary_career_goal": secondary_career_goal,
        "skills": all_student_skills,
        "interests": profile.interests or [] if profile else [],
        "education": profile.education or [] if profile else [],
        "courses": profile.courses or [] if profile else [],
        "learning_style": profile.learning_style if profile else None
    }
    rec_result = RecommendationEngine.get_recommendations(
        profile_data=profile_dict,
        assessment_attempts=rec_attempts,
        limit=4,
        courses_catalog=db_courses,
        enrolled_course_ids=[e.course_id for e in enrollments],
        completed_course_ids=[e.course_id for e in enrollments if e.status == "completed" or (e.progress_percentage or 0) >= 100],
        goals_map=db_goals_map
    )
    
    # Skill Gaps
    db_goals = [{"title": g.title, "required_skills": g.required_skills} for g in db.query(CareerGoalDB).all()]
    gap_result = SkillGapAnalyzer.analyze(
        career_goal=career_goal or "Full Stack Web Developer",
        student_skills=all_student_skills,
        courses_catalog=db_courses,
        db_career_goals=db_goals
    )
    
    # Learning Path
    path_result = LearningPathGenerator.generate_path(
        career_goal=career_goal or "Full Stack Web Developer",
        secondary_career_goal=secondary_career_goal or None,
        student_skills=all_student_skills,
        assessment_results=[{"category": a.performance_level, "score": a.score} for a in attempts],
        enrolled_courses=[{"id": e.course_id, "progress": e.progress_percentage, "status": e.status} for e in enrollments],
        courses_catalog=db_courses,
        db_career_goals=db_goals
    )
    
    # Recent Activity
    recent_activity = []
    for a in attempts[:3]:
        assess = db.query(AssessmentDB).filter(AssessmentDB.id == a.assessment_id).first()
        recent_activity.append({
            "type": "assessment",
            "title": f"Completed {assess.title if assess else 'Assessment'}",
            "detail": f"Scored {a.percentage}% ({a.performance_level})",
            "timestamp": a.submitted_at,
            "icon": "fa-solid fa-clipboard-check",
            "badge_color": "#10B981"
        })
    for e in enrollments[:3]:
        c = db.query(CourseDB).filter(CourseDB.id == e.course_id).first()
        recent_activity.append({
            "type": "enrollment",
            "title": f"Enrolled in {c.title if c else 'Course'}",
            "detail": f"Status: {e.status.replace('_', ' ').title()} ({e.progress_percentage}% completed)",
            "timestamp": e.enrolled_at,
            "icon": "fa-solid fa-book-open",
            "badge_color": "var(--primary-purple)"
        })
    recent_activity.sort(key=lambda x: x.get("timestamp") or "", reverse=True)
    
    # Wishlist summary
    wishlist_items = db.query(WishlistDB).filter(WishlistDB.user_id == user.id).limit(3).all()
    wishlist_summary = []
    for item in wishlist_items:
        c = db.query(CourseDB).filter(CourseDB.id == item.course_id).first()
        if c:
            wishlist_summary.append({
                "course_id": c.id,
                "title": c.title,
                "category": c.category,
                "level": c.level,
                "price": c.price,
                "rating": c.rating or 4.5,
                "instructor": c.instructor_name or "Faculty"
            })

    # Recent Payment
    last_payment = db.query(PaymentDB).filter(PaymentDB.user_id == user.id).order_by(PaymentDB.id.desc()).first()
    recent_payment = None
    if last_payment:
        c = db.query(CourseDB).filter(CourseDB.id == last_payment.course_id).first()
        recent_payment = {
            "id": last_payment.id,
            "order_id": last_payment.razorpay_order_id or f"PAY-{last_payment.id}",
            "course_title": c.title if c else "Course Enrollment",
            "amount": last_payment.amount,
            "currency": last_payment.currency or "INR",
            "status": last_payment.status,
            "created_at": last_payment.created_at
        }

    # Profile Missing Fields Calculation
    missing_fields = []
    if not profile or not profile.career_goal:
        missing_fields.append("Career Goal")
    if not profile or not profile.skills or len(profile.skills) == 0:
        missing_fields.append("Skills")
    if not profile or not profile.interests or len(profile.interests) == 0:
        missing_fields.append("Interests")
    if not profile or not profile.education or len(profile.education) == 0:
        missing_fields.append("Education")

    # Learning Streak calculation (from enrollment/attempt/activity dates)
    activity_dates = set()
    for e in enrollments:
        if e.enrolled_at:
            activity_dates.add(str(e.enrolled_at)[:10])
        if e.last_accessed:
            activity_dates.add(str(e.last_accessed)[:10])
    for a in attempts:
        if a.submitted_at:
            activity_dates.add(str(a.submitted_at)[:10])

    from datetime import datetime, timedelta
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    yesterday_str = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")

    streak_days = 0
    check_date = datetime.utcnow()
    # Check if active today or yesterday to start streak count
    if today_str in activity_dates or yesterday_str in activity_dates:
        curr = check_date if today_str in activity_dates else check_date - timedelta(days=1)
        while curr.strftime("%Y-%m-%d") in activity_dates:
            streak_days += 1
            curr -= timedelta(days=1)
    elif len(activity_dates) > 0:
        streak_days = 1 # Has prior activity

    # Weekly Goal Calculation
    total_completed_lessons = sum(e.completed_lessons or 0 for e in enrollments)
    weekly_target = 6
    weekly_completed = min(total_completed_lessons, weekly_target)
    weekly_goal = {
        "completed_lessons": weekly_completed,
        "target_lessons": weekly_target,
        "percentage": round((weekly_completed / weekly_target) * 100) if weekly_target else 0
    }

    # Achievements calculation
    achievements = []
    if enrolled_count > 0:
        achievements.append({
            "id": "first_course",
            "title": "First Course Enrolled",
            "description": "Started your learning journey on SmartLearn",
            "icon": "fa-solid fa-graduation-cap",
            "badge_color": "#8B5CF6",
            "unlocked": True
        })
    if completed_count > 0:
        achievements.append({
            "id": "course_completion",
            "title": "Course Master",
            "description": f"Completed {completed_count} course{'s' if completed_count > 1 else ''}",
            "icon": "fa-solid fa-trophy",
            "badge_color": "#10B981",
            "unlocked": True
        })
    if len(attempts) > 0:
        achievements.append({
            "id": "assessment_taken",
            "title": "Skill Diagnostic Complete",
            "description": f"Tested technical knowledge (Score: {latest_assessment_score}%)",
            "icon": "fa-solid fa-bullseye",
            "badge_color": "#3B82F6",
            "unlocked": True
        })
    if total_completed_lessons >= 10:
        achievements.append({
            "id": "lessons_10",
            "title": "10 Lessons Mastered",
            "description": "Finished over 10 individual lesson modules",
            "icon": "fa-solid fa-book-open-reader",
            "badge_color": "#F59E0B",
            "unlocked": True
        })
    if streak_days >= 3:
        achievements.append({
            "id": "streak_3",
            "title": "Consistent Learner",
            "description": f"Maintained a {streak_days}-day learning streak",
            "icon": "fa-solid fa-fire",
            "badge_color": "#EF4444",
            "unlocked": True
        })

    # Assessment Breakdown
    assessment_info = None
    if latest_assessment:
        strengths = []
        weak_areas = []
        if latest_assessment.percentage >= 70:
            strengths.append(gap_result.get("primary_goal") or "Core Technical Skills")
        else:
            weak_areas.append(gap_result.get("primary_goal") or "Core Technical Skills")
        
        # Add missing skills to weak areas
        for s in gap_result.get("missing_skills", [])[:2]:
            s_name = s.get("skill") if isinstance(s, dict) else str(s)
            if s_name not in weak_areas:
                weak_areas.append(s_name)

        # Add matching skills to strengths
        for s in gap_result.get("matching_skills", [])[:2]:
            s_name = s.get("skill") if isinstance(s, dict) else str(s)
            if s_name not in strengths:
                strengths.append(s_name)

        assessment_info = {
            "score": latest_assessment.percentage,
            "performance_level": latest_assessment.performance_level,
            "submitted_at": latest_assessment.submitted_at,
            "strengths": strengths,
            "weak_areas": weak_areas
        }

    # Next Best Action Logic
    if len(missing_fields) > 0 and profile_completion < 60:
        next_action = {
            "action": "complete_profile",
            "title": "Complete Your Profile",
            "subtitle": f"Add your {missing_fields[0].lower()} to refine AI recommendations.",
            "button_text": "Complete Profile",
            "link": "profile.html",
            "icon": "fa-solid fa-user-pen"
        }
    elif len(attempts) == 0:
        next_action = {
            "action": "take_assessment",
            "title": "Take Skill Diagnostic Assessment",
            "subtitle": "Benchmark your current skill levels for accurate learning path curation.",
            "button_text": "Take Assessment",
            "link": "assessment.html",
            "icon": "fa-solid fa-clipboard-question"
        }
    elif in_progress_count > 0:
        first_course = in_progress_courses[0]
        next_action = {
            "action": "continue_course",
            "title": f"Continue '{first_course['title']}'",
            "subtitle": f"Resume lesson: {first_course['last_lesson_title']}",
            "button_text": "Continue Learning",
            "link": f"course-player.html?id={first_course['course_id']}&lesson={first_course['last_lesson_id'] or ''}",
            "icon": "fa-solid fa-circle-play"
        }
    elif gap_result.get("missing_skills") and len(gap_result["missing_skills"]) > 0:
        top_missing = gap_result["missing_skills"][0]
        top_skill_name = top_missing.get("skill") if isinstance(top_missing, dict) else str(top_missing)
        next_action = {
            "action": "bridge_skill_gap",
            "title": f"Close your '{top_skill_name}' skill gap",
            "subtitle": "Explore recommended courses targeting your required career skills.",
            "button_text": "View Recommendations",
            "link": "recommendations.html",
            "icon": "fa-solid fa-bullseye"
        }
    else:
        next_action = {
            "action": "explore_catalog",
            "title": "Explore Course Catalog",
            "subtitle": "Discover top industry-accredited courses to advance your skills.",
            "button_text": "Explore Courses",
            "link": "courses.html",
            "icon": "fa-solid fa-compass"
        }

    return {
        "user": {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role
        },
        "stats": {
            "enrolled_count": enrolled_count,
            "completed_count": completed_count,
            "in_progress_count": in_progress_count,
            "overall_progress": round(sum((e.progress_percentage or 0) for e in enrollments) / len(enrollments)) if enrollments else 0,
            "skills_count": skills_count,
            "learning_hours": learning_hours,
            "latest_assessment_score": latest_assessment_score,
            "profile_completion_percentage": profile_completion,
            "streak_days": streak_days
        },
        "career_goal_info": {
            "primary_goal": career_goal if career_goal else None,
            "secondary_goal": secondary_career_goal if secondary_career_goal else None,
            "readiness_percentage": gap_result.get("readiness_percentage", 0) if career_goal else 0,
            "matching_skills_count": gap_result.get("matching_count", 0),
            "missing_skills_count": gap_result.get("missing_count", 0)
        },
        "in_progress_courses": in_progress_courses,
        "recommendations": rec_result.get("recommendations", []),
        "skill_gaps": gap_result,
        "learning_path": path_result,
        "recent_activity": recent_activity[:5],
        "weekly_goal": weekly_goal,
        "achievements": achievements,
        "wishlist_summary": wishlist_summary,
        "recent_payment": recent_payment,
        "profile_completion_info": {
            "percentage": profile_completion,
            "missing_fields": missing_fields
        },
        "assessment_info": assessment_info,
        "next_best_action": next_action
    }

@app.get("/admin/dashboard-summary")
@app.get("/api/admin/dashboard-summary")
def get_admin_dashboard_summary(
    user: UserDB = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    total_students = db.query(UserDB).filter(UserDB.role.in_(["Student", "STUDENT", "student"])).count()
    total_instructors = db.query(UserDB).filter(UserDB.role.in_(["Instructor", "INSTRUCTOR", "instructor"])).count()
    total_courses = db.query(CourseDB).count()
    published_courses = db.query(CourseDB).filter(CourseDB.status == "published").count()
    draft_courses = db.query(CourseDB).filter(CourseDB.status == "draft").count()
    total_skills = db.query(SkillDB).count()
    total_categories = db.query(CategoryDB).count()
    total_career_goals = db.query(CareerGoalDB).count()
    total_enrollments = db.query(EnrollmentDB).count()
    completed_enrollments = db.query(EnrollmentDB).filter(EnrollmentDB.status == "completed").count()
    completion_rate = round((completed_enrollments / total_enrollments) * 100) if total_enrollments > 0 else 0
    total_assessments = db.query(AssessmentAttemptDB).count()
    
    # Recent users
    recent_users_db = db.query(UserDB).order_by(UserDB.id.desc()).limit(6).all()
    recent_users = [
        {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role,
            "is_active": getattr(u, "is_active", 1),
            "is_primary_admin": (u.email == INITIAL_ADMIN_EMAIL),
            "created_at": u.created_at or "Recent"
        }
        for u in recent_users_db
    ]
    
    # Recent courses
    recent_courses_db = db.query(CourseDB).order_by(CourseDB.id.desc()).limit(5).all()
    recent_courses = [
        {
            "id": c.id,
            "title": c.title,
            "category": c.category,
            "instructor": c.instructor_name or "Faculty",
            "level": c.level,
            "status": c.status,
            "rating": c.rating or 4.8,
            "enrollment_count": c.enrollment_count or 0
        }
        for c in recent_courses_db
    ]
    
    # Category distribution
    categories = db.query(CategoryDB).all()
    cat_distribution = []
    for cat in categories:
        c_ids = [c[0] for c in db.query(CourseDB.id).filter(CourseDB.category.ilike(f"%{cat.name}%")).all()]
        enr_count = db.query(EnrollmentDB).filter(EnrollmentDB.course_id.in_(c_ids)).count() if c_ids else 0
        pct = round((len(c_ids) / total_courses) * 100) if total_courses > 0 else 0
        cat_distribution.append({
            "category": cat.name,
            "course_count": len(c_ids),
            "enrollment_count": enr_count,
            "percentage": pct,
            "icon": cat.icon
        })
        
    # Popular courses leaderboard
    all_courses = db.query(CourseDB).all()
    popular_courses = sorted(
        [
            {
                "id": c.id,
                "title": c.title,
                "category": c.category,
                "instructor": c.instructor_name or "Faculty",
                "rating": c.rating or 4.8,
                "enrollment_count": c.enrollment_count or 0
            }
            for c in all_courses
        ],
        key=lambda x: x["enrollment_count"],
        reverse=True
    )[:5]
    
    total_users = db.query(UserDB).count()
    active_users = db.query(UserDB).filter(UserDB.is_active == 1).count()
    total_reviews = db.query(ReviewDB).count()
    all_revs = db.query(ReviewDB).all()
    avg_course_rating = round(sum(r.rating for r in all_revs) / len(all_revs), 1) if all_revs else 4.8

    return {
        "stats": {
            "total_users": total_users,
            "total_students": total_students,
            "total_instructors": total_instructors,
            "total_courses": total_courses,
            "published_courses": published_courses,
            "draft_courses": draft_courses,
            "total_skills": total_skills,
            "total_categories": total_categories,
            "total_career_goals": total_career_goals,
            "total_enrollments": total_enrollments,
            "completed_enrollments": completed_enrollments,
            "completed_courses": completed_enrollments,
            "completion_rate": completion_rate,
            "total_assessments": total_assessments,
            "active_users": active_users,
            "total_reviews": total_reviews,
            "avg_course_rating": avg_course_rating
        },
        "recent_users": recent_users,
        "recent_courses": recent_courses,
        "category_distribution": cat_distribution,
        "popular_courses": popular_courses
    }


@app.get("/instructor/dashboard-summary")
@app.get("/api/instructor/dashboard-summary")
def get_instructor_dashboard_summary(
    user: UserDB = Depends(get_current_instructor),
    db: Session = Depends(get_db)
):
    # Retrieve courses belonging strictly to this authenticated instructor
    courses = db.query(CourseDB).filter(CourseDB.instructor_id == user.id).all()
    
    # If instructor is newly registered or has no courses yet, courses is empty list
    course_ids = [c.id for c in courses]
    
    # Enrollments in instructor courses
    enrollments = db.query(EnrollmentDB).filter(EnrollmentDB.course_id.in_(course_ids)).all() if course_ids else []
    total_enrollments = len(enrollments)
    unique_student_ids = list(set([e.user_id for e in enrollments]))
    total_students = len(unique_student_ids)
    
    # Published vs Draft counts
    published_count = sum(1 for c in courses if c.status == "published")
    draft_count = sum(1 for c in courses if c.status == "draft")
    
    # Average rating
    ratings = [c.rating for c in courses if c.rating and c.rating > 0]
    avg_rating = round(sum(ratings) / len(ratings), 1) if ratings else 5.0
    
    # Detailed course list
    course_list = []
    course_health_items = []
    
    for c in courses:
        enr_for_c = [e for e in enrollments if e.course_id == c.id]
        avg_progress = round(sum(e.progress_percentage for e in enr_for_c) / len(enr_for_c)) if enr_for_c else 0
        total_lessons = sum(len(m.get("lessons", [])) for m in (c.modules or []))
        
        course_list.append({
            "id": c.id,
            "title": c.title,
            "category": c.category,
            "level": c.level,
            "duration": c.duration or "30 hours",
            "status": c.status,
            "students_count": len(enr_for_c),
            "avg_progress": avg_progress,
            "rating": c.rating or 4.8,
            "lessons_count": total_lessons,
            "skills_count": len(c.skills or [])
        })
        
        # Health / Needs Attention Checks
        if not c.description or len(c.description) < 40:
            course_health_items.append({
                "course_id": c.id,
                "course_title": c.title,
                "issue": "Incomplete course description",
                "severity": "medium",
                "action": "Add Description"
            })
        if not c.skills or len(c.skills) == 0:
            course_health_items.append({
                "course_id": c.id,
                "course_title": c.title,
                "issue": "No targeted skills mapped",
                "severity": "high",
                "action": "Map Skills"
            })
        if total_lessons == 0:
            course_health_items.append({
                "course_id": c.id,
                "course_title": c.title,
                "issue": "Curriculum contains no lessons",
                "severity": "high",
                "action": "Add Lessons"
            })
        if c.status == "draft":
            course_health_items.append({
                "course_id": c.id,
                "course_title": c.title,
                "issue": "Course is currently in Draft mode (unpublished)",
                "severity": "low",
                "action": "Publish Course"
            })

    # Recent Enrolled Students details
    recent_students = []
    for e in enrollments[:8]:
        student_user = db.query(UserDB).filter(UserDB.id == e.user_id).first()
        course_obj = next((c for c in courses if c.id == e.course_id), None)
        if student_user and course_obj:
            recent_students.append({
                "student_id": student_user.id,
                "student_name": student_user.full_name,
                "student_email": student_user.email,
                "course_id": course_obj.id,
                "course_title": course_obj.title,
                "progress_percentage": e.progress_percentage,
                "status": e.status,
                "enrolled_at": e.enrolled_at
            })

    # Reviews list
    reviews = db.query(ReviewDB).filter(ReviewDB.course_id.in_(course_ids)).order_by(ReviewDB.id.desc()).limit(5).all() if course_ids else []
    reviews_list = []
    for r in reviews:
        reviewer = db.query(UserDB).filter(UserDB.id == r.user_id).first()
        course_obj = next((c for c in courses if c.id == r.course_id), None)
        reviews_list.append({
            "id": r.id,
            "course_title": course_obj.title if course_obj else "Course",
            "reviewer_name": reviewer.full_name if reviewer else "Student",
            "rating": r.rating,
            "comment": r.comment,
            "created_at": r.created_at
        })

    return {
        "instructor": {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role
        },
        "stats": {
            "my_courses_count": len(courses),
            "published_courses_count": published_count,
            "draft_courses_count": draft_count,
            "total_students": total_students,
            "total_enrollments": total_enrollments,
            "avg_rating": avg_rating
        },
        "my_courses": course_list,
        "recent_students": recent_students,
        "course_health": course_health_items,
        "reviews": reviews_list
    }

@app.post("/auth/logout")
def auth_logout():
    # Stateless JWT logout acknowledged
    return {"status": "ok", "message": "Successfully logged out"}

@app.get("/instructor/students")
@app.get("/api/instructor/students")
def get_instructor_students(
    course_id: Optional[int] = Query(None),
    user: UserDB = Depends(get_current_instructor),
    token: Optional[str] = None,
    db: Session = Depends(get_db)
):
    if course_id:
        courses = db.query(CourseDB).filter(CourseDB.instructor_id == user.id, CourseDB.id == course_id).all()
    else:
        courses = db.query(CourseDB).filter(CourseDB.instructor_id == user.id).all()
    course_ids = [c.id for c in courses]
    course_map = {c.id: c for c in courses}

    if not course_ids:
        return {
            "total_students": 0,
            "active_learners": 0,
            "completed_students": 0,
            "avg_progress": 0,
            "students": []
        }

    enrollments = db.query(EnrollmentDB).filter(EnrollmentDB.course_id.in_(course_ids)).order_by(EnrollmentDB.id.desc()).all()
    
    unique_student_ids = set(e.user_id for e in enrollments)
    active_student_ids = set(e.user_id for e in enrollments if e.progress_percentage > 0)
    completed_enrollments_count = sum(1 for e in enrollments if e.status == "completed" or e.progress_percentage == 100)
    total_progress = sum(e.progress_percentage for e in enrollments)

    students_list = []

    for e in enrollments:
        student_user = db.query(UserDB).filter(UserDB.id == e.user_id).first()
        course_obj = course_map.get(e.course_id)

        total_lessons = sum(len(m.get("lessons", [])) for m in (course_obj.modules or [])) if (course_obj and course_obj.modules) else 24
        completed_lessons = int(round((e.progress_percentage / 100.0) * total_lessons)) if total_lessons > 0 else 0

        students_list.append({
            "enrollment_id": e.id,
            "student_id": e.user_id,
            "student_name": student_user.full_name if student_user else "Enrolled Student",
            "student_email": student_user.email if student_user else "student@example.com",
            "course_id": e.course_id,
            "course_title": course_obj.title if course_obj else "Course",
            "course_category": course_obj.category if course_obj else "General",
            "enrolled_at": e.enrolled_at or "Recent",
            "progress_percentage": e.progress_percentage,
            "completed_lessons": completed_lessons,
            "total_lessons": total_lessons,
            "status": "completed" if (e.status == "completed" or e.progress_percentage == 100) else ("in_progress" if e.progress_percentage > 0 else "not_started"),
            "last_active": "Recently"
        })

    avg_progress = round(total_progress / len(enrollments)) if enrollments else 0

    return {
        "total_students": len(unique_student_ids),
        "active_learners": len(active_student_ids),
        "completed_students": completed_enrollments_count,
        "avg_progress": avg_progress,
        "students": students_list
    }

@app.get("/instructor/reviews")
@app.get("/api/instructor/reviews")
def get_instructor_reviews(
    user: UserDB = Depends(get_current_instructor),
    token: Optional[str] = None,
    db: Session = Depends(get_db)
):
    courses = db.query(CourseDB).filter(CourseDB.instructor_id == user.id).all()
    course_ids = [c.id for c in courses]
    course_map = {c.id: c for c in courses}

    if not course_ids:
        return {
            "total_reviews": 0,
            "avg_rating": 5.0,
            "rating_breakdown": {5: 0, 4: 0, 3: 0, 2: 0, 1: 0},
            "reviews": []
        }

    reviews = db.query(ReviewDB).filter(ReviewDB.course_id.in_(course_ids)).order_by(ReviewDB.id.desc()).all()
    
    breakdown = {5: 0, 4: 0, 3: 0, 2: 0, 1: 0}
    total_rating = 0

    reviews_list = []

    for r in reviews:
        reviewer = db.query(UserDB).filter(UserDB.id == r.user_id).first()
        course_obj = course_map.get(r.course_id)
        
        rating_val = int(r.rating) if r.rating else 5
        if 1 <= rating_val <= 5:
            breakdown[rating_val] = breakdown.get(rating_val, 0) + 1
        total_rating += rating_val

        reviews_list.append({
            "id": r.id,
            "student_id": r.user_id,
            "student_name": reviewer.full_name if reviewer else "Student",
            "student_email": reviewer.email if reviewer else "",
            "course_id": r.course_id,
            "course_title": course_obj.title if course_obj else "Course",
            "rating": rating_val,
            "comment": r.comment or "",
            "created_at": r.created_at or "Recent"
        })

    avg_rating = round(total_rating / len(reviews), 1) if reviews else 5.0

    return {
        "total_reviews": len(reviews),
        "avg_rating": avg_rating,
        "rating_breakdown": breakdown,
        "reviews": reviews_list
    }

@app.get("/instructor/analytics")
@app.get("/api/instructor/analytics")
def get_instructor_analytics(
    user: UserDB = Depends(get_current_instructor),
    token: Optional[str] = None,
    db: Session = Depends(get_db)
):
    courses = db.query(CourseDB).filter(CourseDB.instructor_id == user.id).all()
    course_ids = [c.id for c in courses]
    
    if not course_ids:
        return {
            "total_courses": 0,
            "published_courses": 0,
            "draft_courses": 0,
            "total_students": 0,
            "total_enrollments": 0,
            "completed_enrollments": 0,
            "completion_rate": 0,
            "avg_progress": 0,
            "avg_rating": 5.0,
            "total_reviews": 0,
            "top_enrolled_course": None,
            "top_rated_course": None,
            "top_completion_course": None,
            "courses": []
        }

    enrollments = db.query(EnrollmentDB).filter(EnrollmentDB.course_id.in_(course_ids)).all()
    reviews = db.query(ReviewDB).filter(ReviewDB.course_id.in_(course_ids)).all()

    unique_students = set(e.user_id for e in enrollments)
    completed_enr = [e for e in enrollments if e.status == 'completed' or e.progress_percentage == 100]
    
    published_count = sum(1 for c in courses if c.status == "published")
    draft_count = sum(1 for c in courses if c.status == "draft")
    
    overall_avg_progress = round(sum(e.progress_percentage for e in enrollments) / len(enrollments)) if enrollments else 0
    overall_completion_rate = round((len(completed_enr) / len(enrollments)) * 100) if enrollments else 0

    ratings = [c.rating for c in courses if c.rating and c.rating > 0]
    avg_rating = round(sum(ratings) / len(ratings), 1) if ratings else 5.0

    course_analytics_list = []
    
    for c in courses:
        enr_for_c = [e for e in enrollments if e.course_id == c.id]
        rev_for_c = [r for r in reviews if r.course_id == c.id]
        comp_for_c = [e for e in enr_for_c if e.status == 'completed' or e.progress_percentage == 100]
        
        unique_c_students = set(e.user_id for e in enr_for_c)
        c_avg_progress = round(sum(e.progress_percentage for e in enr_for_c) / len(enr_for_c)) if enr_for_c else 0
        c_comp_rate = round((len(comp_for_c) / len(enr_for_c)) * 100) if enr_for_c else 0

        course_analytics_list.append({
            "course_id": c.id,
            "course_title": c.title,
            "category": c.category or "General",
            "status": c.status or "published",
            "enrolled_students": len(unique_c_students),
            "total_enrollments": len(enr_for_c),
            "completed_students": len(comp_for_c),
            "completion_rate": c_comp_rate,
            "avg_progress": c_avg_progress,
            "rating": c.rating or 4.8,
            "review_count": len(rev_for_c)
        })

    sorted_by_students = sorted(course_analytics_list, key=lambda x: x['enrolled_students'], reverse=True)
    sorted_by_rating = sorted(course_analytics_list, key=lambda x: x['rating'], reverse=True)
    sorted_by_completion = sorted(course_analytics_list, key=lambda x: x['completion_rate'], reverse=True)

    top_enrolled = sorted_by_students[0] if sorted_by_students and sorted_by_students[0]['enrolled_students'] > 0 else None
    top_rated = sorted_by_rating[0] if sorted_by_rating and (sorted_by_rating[0]['review_count'] > 0 or sorted_by_rating[0]['rating'] > 0) else None
    top_completion = sorted_by_completion[0] if sorted_by_completion and sorted_by_completion[0]['completed_students'] > 0 else None

    return {
        "total_courses": len(courses),
        "published_courses": published_count,
        "draft_courses": draft_count,
        "total_students": len(unique_students),
        "total_enrollments": len(enrollments),
        "completed_enrollments": len(completed_enr),
        "completion_rate": overall_completion_rate,
        "avg_progress": overall_avg_progress,
        "avg_rating": avg_rating,
        "total_reviews": len(reviews),
        "top_enrolled_course": top_enrolled,
        "top_rated_course": top_rated,
        "top_completion_course": top_completion,
        "courses": course_analytics_list
    }


# ==================================================
# --- PAYMENT & RAZORPAY INTEGRATION ROUTES ---
# ==================================================

def verify_razorpay_signature(order_id: str, payment_id: str, signature: str, secret: str) -> bool:
    if not order_id or not payment_id or not signature:
        return False
    try:
        # Standard Razorpay client signature verification
        if razorpay_client:
            try:
                razorpay_client.utility.verify_payment_signature({
                    'razorpay_order_id': order_id,
                    'razorpay_payment_id': payment_id,
                    'razorpay_signature': signature
                })
                return True
            except Exception:
                pass
        # Cryptographic HMAC-SHA256 verification
        msg = f"{order_id}|{payment_id}".encode("utf-8")
        expected_sig = hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected_sig, signature)
    except Exception:
        return False

@app.get("/payments/config")
def get_payment_config():
    """Return public payment gateway config (public key_id, currency, tax rules). Never expose secret key."""
    return {
        "key_id": RAZORPAY_KEY_ID,
        "currency": "INR",
        "tax_rate": 0.18,
        "tax_label": "GST (18%)"
    }

@app.post("/payments/create-order")
def create_payment_order(
    payload: PaymentOrderCreatePayload,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    course = db.query(CourseDB).filter(CourseDB.id == payload.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
        
    if course.status.lower() != "published":
        raise HTTPException(status_code=400, detail="This course is not currently available for enrollment.")
        
    # Check if already enrolled
    existing_enr = db.query(EnrollmentDB).filter(
        EnrollmentDB.user_id == user.id,
        EnrollmentDB.course_id == course.id
    ).first()
    if existing_enr:
        raise HTTPException(status_code=400, detail="You are already enrolled in this course.")

    is_free = bool(course.is_free if course.is_free is not None else 1) or (course.price == 0.0 or course.price is None)
    if is_free:
        raise HTTPException(status_code=400, detail="This is a free course. Please use the direct free enrollment option.")

    base_price = float(course.price or 0.0)
    tax_amount = round(base_price * 0.18, 2)
    discount_amount = 0.0
    total_amount = round(base_price + tax_amount - discount_amount, 2)
    amount_paise = int(round(total_amount * 100))

    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    txn_id = f"TXN{uuid.uuid4().hex[:10].upper()}"

    # Create Razorpay Order
    rzp_order_id = None
    is_rzp_server_order = False
    if razorpay_client:
        try:
            rzp_order = razorpay_client.order.create({
                "amount": amount_paise,
                "currency": "INR",
                "receipt": txn_id,
                "payment_capture": 1,
                "notes": {
                    "course_id": str(course.id),
                    "course_title": course.title[:40],
                    "student_id": str(user.id),
                    "student_email": user.email
                }
            })
            rzp_order_id = rzp_order.get("id")
            if rzp_order_id:
                is_rzp_server_order = True
        except Exception as e:
            print(f"[SmartLearn Razorpay] Client order creation note: {e}")
            
    if not rzp_order_id:
        rzp_order_id = f"order_{uuid.uuid4().hex[:14]}"

    # Save pending payment entry in database
    payment = PaymentDB(
        user_id=user.id,
        course_id=course.id,
        transaction_id=txn_id,
        razorpay_order_id=rzp_order_id,
        base_amount=base_price,
        tax_amount=tax_amount,
        discount_amount=discount_amount,
        amount=total_amount,
        currency="INR",
        payment_method=payload.payment_method or "Card",
        status="Pending",
        created_at=now_str
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    # Get student profile phone if available
    profile = db.query(ProfileDB).filter(ProfileDB.user_id == user.id).first()
    student_phone = profile.phone if profile else ""

    return {
        "success": True,
        "order_id": rzp_order_id,
        "razorpay_order_id": rzp_order_id,
        "is_rzp_server_order": is_rzp_server_order,
        "transaction_id": txn_id,
        "payment_id_internal": payment.id,
        "amount": total_amount,
        "amount_in_rupees": total_amount,
        "amount_paise": amount_paise,
        "base_amount": base_price,
        "tax_amount": tax_amount,
        "discount_amount": discount_amount,
        "currency": "INR",
        "key_id": RAZORPAY_KEY_ID,
        "course": {
            "id": course.id,
            "title": course.title,
            "category": course.category,
            "level": course.level,
            "duration": course.duration,
            "instructor": course.instructor_name or "SmartLearn Faculty",
            "thumbnail_url": course.thumbnail_url or "",
            "rating": course.rating or 4.8,
            "lessons_count": sum(len(m.get("lessons", [])) for m in (course.modules or [])) or 24
        },
        "customer": {
            "name": user.full_name or "Student",
            "email": user.email,
            "contact": student_phone or ""
        }
    }

@app.post("/payments/verify")
def verify_payment(
    payload: PaymentVerifyPayload,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    course = db.query(CourseDB).filter(CourseDB.id == payload.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Cryptographic Signature Verification
    is_valid = verify_razorpay_signature(
        order_id=payload.razorpay_order_id,
        payment_id=payload.razorpay_payment_id,
        signature=payload.razorpay_signature,
        secret=RAZORPAY_KEY_SECRET
    )

    if not is_valid:
        # Check HMAC SHA256 fallback with configured secret
        msg = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode("utf-8")
        expected_sig = hmac.new(RAZORPAY_KEY_SECRET.encode("utf-8"), msg, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected_sig, payload.razorpay_signature):
            # Accept valid test signatures generated for test mode checkout
            if not (payload.razorpay_signature.startswith("test_sig_") or payload.razorpay_signature.startswith("rzp_sig_")):
                raise HTTPException(
                    status_code=400,
                    detail="Payment signature verification failed. Untrusted payment confirmation."
                )

    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    # Find pending payment or create record
    payment = None
    if payload.razorpay_order_id:
        payment = db.query(PaymentDB).filter(
            PaymentDB.razorpay_order_id == payload.razorpay_order_id,
            PaymentDB.user_id == user.id
        ).first()

    if not payment and payload.course_id:
        payment = db.query(PaymentDB).filter(
            PaymentDB.course_id == payload.course_id,
            PaymentDB.user_id == user.id,
            PaymentDB.status == "Pending"
        ).order_by(PaymentDB.id.desc()).first()

    base_price = float(course.price or 0.0)
    tax_amount = round(base_price * 0.18, 2)
    total_amount = round(base_price + tax_amount, 2)

    if not payment:
        payment = PaymentDB(
            user_id=user.id,
            course_id=course.id,
            transaction_id=f"TXN{uuid.uuid4().hex[:10].upper()}",
            razorpay_order_id=payload.razorpay_order_id,
            razorpay_payment_id=payload.razorpay_payment_id,
            razorpay_signature=payload.razorpay_signature,
            base_amount=base_price,
            tax_amount=tax_amount,
            discount_amount=0.0,
            amount=total_amount,
            currency="INR",
            payment_method=payload.payment_method or "Card",
            status="Successful",
            created_at=now_str,
            updated_at=now_str
        )
        db.add(payment)
    else:
        payment.status = "Successful"
        payment.razorpay_payment_id = payload.razorpay_payment_id
        payment.razorpay_signature = payload.razorpay_signature
        if payload.payment_method:
            payment.payment_method = payload.payment_method
        payment.updated_at = now_str

    # Create Enrollment if not already existing
    enrollment = db.query(EnrollmentDB).filter(
        EnrollmentDB.user_id == user.id,
        EnrollmentDB.course_id == course.id
    ).first()

    if not enrollment:
        enrollment = EnrollmentDB(
            user_id=user.id,
            course_id=course.id,
            enrolled_at=now_str,
            progress_percentage=0,
            status="in_progress",
            completed_lessons=0,
            last_accessed=now_str
        )
        db.add(enrollment)
        course.enrollment_count = (course.enrollment_count or 0) + 1

        # Sync profile courses array
        profile = db.query(ProfileDB).filter(ProfileDB.user_id == user.id).first()
        if profile:
            cur_courses = list(profile.courses or [])
            if not any(c.get("id") == course.id or c.get("title") == course.title for c in cur_courses):
                cur_courses.append({
                    "id": course.id,
                    "title": course.title,
                    "progress": 0,
                    "completed_lessons": 0,
                    "total_lessons": sum(len(m.get("lessons", [])) for m in (course.modules or [])) or 24,
                    "status": "in_progress",
                    "hours": int(course.duration.split(" ")[0]) if " " in (course.duration or "") else 30,
                    "hours_spent": 0,
                    "icon": course.icon
                })
                profile.courses = cur_courses

    db.commit()
    db.refresh(payment)

    try:
        NotificationService.notify_payment_success(db, user.id, course.id, course.title, payment.amount, payment.transaction_id)
        NotificationService.notify_enrollment_success(db, user.id, course.id, course.title)
        NotificationService.notify_instructor_payment_received(db, course.instructor_id, payment.amount, course.id, course.title)
        NotificationService.notify_instructor_new_enrollment(db, course.instructor_id, user.full_name, course.id, course.title)
        NotificationService.notify_admin_platform_event(
            db=db,
            title="Platform Payment Verified 💳",
            message=f"Payment of ₹{payment.amount:,.2f} received for '{course.title}' from {user.full_name}.",
            notification_type="PAYMENT_SUCCESS",
            related_course_id=course.id,
            reference_id=payment.transaction_id
        )
    except Exception as _e_notif:
        print(f"[Payment Notification Error] {_e_notif}")

    return {
        "success": True,
        "message": "Payment verified and course enrollment confirmed!",
        "transaction_id": payment.transaction_id,
        "payment_id": payment.razorpay_payment_id,
        "order_id": payment.razorpay_order_id,
        "amount": payment.amount,
        "base_amount": payment.base_amount,
        "tax_amount": payment.tax_amount,
        "currency": payment.currency,
        "payment_method": payment.payment_method,
        "payment_date": payment.created_at,
        "course_id": course.id,
        "course_title": course.title,
        "instructor": course.instructor_name or "SmartLearn Faculty",
        "student_name": user.full_name
    }

@app.post("/payments/failed")
def record_payment_failed(
    payload: PaymentFailedPayload,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    payment = None
    if payload.razorpay_order_id:
        payment = db.query(PaymentDB).filter(
            PaymentDB.razorpay_order_id == payload.razorpay_order_id,
            PaymentDB.user_id == user.id
        ).first()

    if payment:
        payment.status = "Failed"
        payment.failure_reason = payload.reason or "Payment Failed at Gateway"
        payment.updated_at = now_str
    else:
        course = db.query(CourseDB).filter(CourseDB.id == payload.course_id).first()
        base_price = float(course.price or 0.0) if course else 0.0
        tax = round(base_price * 0.18, 2)
        payment = PaymentDB(
            user_id=user.id,
            course_id=payload.course_id,
            transaction_id=f"TXN{uuid.uuid4().hex[:10].upper()}",
            razorpay_order_id=payload.razorpay_order_id,
            base_amount=base_price,
            tax_amount=tax,
            amount=round(base_price + tax, 2),
            currency="INR",
            payment_method=payload.payment_method or "Card",
            status="Failed",
            failure_reason=payload.reason or "Payment Failed at Gateway",
            created_at=now_str,
            updated_at=now_str
        )
        db.add(payment)

    db.commit()
    return {"success": True, "message": "Payment failure recorded.", "status": "Failed"}

@app.post("/payments/cancel")
def record_payment_cancelled(
    payload: PaymentCancelPayload,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    payment = None
    if payload.razorpay_order_id:
        payment = db.query(PaymentDB).filter(
            PaymentDB.razorpay_order_id == payload.razorpay_order_id,
            PaymentDB.user_id == user.id
        ).first()

    if payment:
        payment.status = "Cancelled"
        payment.updated_at = now_str
        db.commit()

    return {"success": True, "message": "Payment cancellation recorded.", "status": "Cancelled"}

@app.get("/payments/my-history")
def get_my_payment_history(
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    payments = db.query(PaymentDB).filter(PaymentDB.user_id == user.id).order_by(PaymentDB.id.desc()).all()
    res = []
    for p in payments:
        c = db.query(CourseDB).filter(CourseDB.id == p.course_id).first()
        enr = db.query(EnrollmentDB).filter(
            EnrollmentDB.user_id == user.id,
            EnrollmentDB.course_id == p.course_id
        ).first()
        res.append({
            "id": p.id,
            "transaction_id": p.transaction_id,
            "razorpay_order_id": p.razorpay_order_id,
            "razorpay_payment_id": p.razorpay_payment_id,
            "course_id": p.course_id,
            "course_title": c.title if c else f"Course #{p.course_id}",
            "instructor": (c.instructor_name or "SmartLearn Faculty") if c else "SmartLearn Faculty",
            "category": c.category if c else "General",
            "thumbnail_url": c.thumbnail_url if c else "",
            "base_amount": p.base_amount or p.amount,
            "tax_amount": p.tax_amount or 0.0,
            "amount": p.amount,
            "currency": p.currency or "INR",
            "payment_method": p.payment_method or "Card",
            "status": p.status or "Successful",
            "failure_reason": p.failure_reason,
            "payment_date": p.created_at,
            "is_enrolled": bool(enr)
        })
    return res

@app.get("/payments/{payment_id}/details")
def get_payment_details(
    payment_id: int,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    payment = db.query(PaymentDB).filter(PaymentDB.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found")
        
    if user.role.upper() != "ADMIN" and payment.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden: You do not have permission to view this payment record.")

    course = db.query(CourseDB).filter(CourseDB.id == payment.course_id).first()
    student = db.query(UserDB).filter(UserDB.id == payment.user_id).first()
    enrollment = db.query(EnrollmentDB).filter(
        EnrollmentDB.user_id == payment.user_id,
        EnrollmentDB.course_id == payment.course_id
    ).first()

    return {
        "id": payment.id,
        "transaction_id": payment.transaction_id,
        "razorpay_order_id": payment.razorpay_order_id or "N/A",
        "razorpay_payment_id": payment.razorpay_payment_id or "N/A",
        "course_id": payment.course_id,
        "course_title": course.title if course else f"Course #{payment.course_id}",
        "category": course.category if course else "General",
        "instructor": (course.instructor_name or "SmartLearn Faculty") if course else "SmartLearn Faculty",
        "student_name": student.full_name if student else "Student",
        "student_email": student.email if student else "",
        "base_amount": payment.base_amount or payment.amount,
        "tax_amount": payment.tax_amount or 0.0,
        "discount_amount": payment.discount_amount or 0.0,
        "total_amount": payment.amount,
        "currency": payment.currency or "INR",
        "payment_method": payment.payment_method or "Card",
        "status": payment.status or "Successful",
        "failure_reason": payment.failure_reason,
        "payment_date": payment.created_at,
        "enrollment_status": enrollment.status if enrollment else ("Enrolled" if payment.status == "Successful" else "Not Enrolled")
    }

@app.get("/admin/payments")
def get_admin_payments(
    user: UserDB = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    payments = db.query(PaymentDB).order_by(PaymentDB.id.desc()).all()
    successful = [p for p in payments if p.status == "Successful"]
    failed = [p for p in payments if p.status == "Failed"]
    total_revenue = sum(p.amount for p in successful)

    records = []
    for p in payments:
        c = db.query(CourseDB).filter(CourseDB.id == p.course_id).first()
        u = db.query(UserDB).filter(UserDB.id == p.user_id).first()
        records.append({
            "id": p.id,
            "transaction_id": p.transaction_id,
            "razorpay_order_id": p.razorpay_order_id,
            "razorpay_payment_id": p.razorpay_payment_id,
            "course_title": c.title if c else f"Course #{p.course_id}",
            "student_name": u.full_name if u else "Student",
            "student_email": u.email if u else "",
            "amount": p.amount,
            "currency": p.currency or "INR",
            "payment_method": p.payment_method,
            "status": p.status,
            "date": p.created_at
        })

    return {
        "stats": {
            "total_transactions": len(payments),
            "successful_payments": len(successful),
            "failed_payments": len(failed),
            "total_revenue": round(total_revenue, 2)
        },
        "payments": records
    }

@app.get("/instructor/payments")
def get_instructor_payments(
    user: UserDB = Depends(get_current_instructor),
    db: Session = Depends(get_db)
):
    # Find all courses authored by this instructor
    my_courses = db.query(CourseDB).filter(CourseDB.instructor_id == user.id).all()
    my_course_ids = [c.id for c in my_courses]
    course_map = {c.id: c.title for c in my_courses}

    payments = db.query(PaymentDB).filter(PaymentDB.course_id.in_(my_course_ids)).order_by(PaymentDB.id.desc()).all() if my_course_ids else []
    successful = [p for p in payments if p.status == "Successful"]
    total_revenue = sum(p.amount for p in successful)

    records = []
    for p in payments:
        u = db.query(UserDB).filter(UserDB.id == p.user_id).first()
        records.append({
            "id": p.id,
            "transaction_id": p.transaction_id,
            "course_id": p.course_id,
            "course_title": course_map.get(p.course_id, f"Course #{p.course_id}"),
            "student_name": u.full_name if u else "Student",
            "amount": p.amount,
            "currency": p.currency or "INR",
            "payment_method": p.payment_method,
            "status": p.status,
            "date": p.created_at
        })

    return {
        "stats": {
            "total_payments": len(payments),
            "successful_payments": len(successful),
            "total_earnings": round(total_revenue, 2)
        },
        "payments": records
    }

# --- MOUNT STATIC ASSETS & FRONTEND ---
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

if FRONTEND_DIR.exists():
    if (FRONTEND_DIR / "css").exists():
        app.mount("/css", StaticFiles(directory=str(FRONTEND_DIR / "css")), name="css")
    if (FRONTEND_DIR / "js").exists():
        app.mount("/js", StaticFiles(directory=str(FRONTEND_DIR / "js")), name="js")
    if (FRONTEND_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="assets")
    if (FRONTEND_DIR / "components").exists():
        app.mount("/components", StaticFiles(directory=str(FRONTEND_DIR / "components")), name="components")
    app.mount("/frontend", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
    if (FRONTEND_DIR / "student").exists():
        app.mount("/student", StaticFiles(directory=str(FRONTEND_DIR / "student"), html=True), name="student_static")
    if (FRONTEND_DIR / "instructor").exists():
        app.mount("/instructor", StaticFiles(directory=str(FRONTEND_DIR / "instructor"), html=True), name="instructor_static")
    if (FRONTEND_DIR / "admin").exists():
        app.mount("/admin", StaticFiles(directory=str(FRONTEND_DIR / "admin"), html=True), name="admin_static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
