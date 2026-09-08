import os
import sys
import shutil
import uuid
from pathlib import Path

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
except ImportError:
    try:
        from recommendation.recommendation_engine import RecommendationEngine
    except ImportError:
        from backend.app.recommendation.recommendation_engine import RecommendationEngine

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine, Column, Integer, String, JSON, ForeignKey, inspect, text
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from pydantic import BaseModel, EmailStr, ConfigDict
import bcrypt
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Union

# --- CONFIG ---
SECRET_KEY = "supersecret_smartlearn_key"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 1 week

DB_PATH = BASE_DIR / "smartlearn.db"
DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

UPLOAD_DIR = BASE_DIR / "uploads"
AVATAR_DIR = UPLOAD_DIR / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)

# --- DB SETUP ---
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class UserDB(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String)

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
    options = Column(JSON) # List[str]
    correct_option = Column(Integer) # 0-indexed integer
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
    answers = Column(JSON) # {question_id: selected_index}
    feedback = Column(JSON) # List of dicts with explanation
    submitted_at = Column(String)

Base.metadata.create_all(bind=engine)

# Safe SQLite Schema Migration (Column additions)
def run_migrations():
    inspector = inspect(engine)
    columns = [col["name"] for col in inspector.get_columns("profiles")]
    with engine.connect() as conn:
        if "secondary_career_goal" not in columns:
            conn.execute(text("ALTER TABLE profiles ADD COLUMN secondary_career_goal VARCHAR;"))
            conn.commit()
        if "profile_image" not in columns:
            conn.execute(text("ALTER TABLE profiles ADD COLUMN profile_image VARCHAR;"))
            conn.commit()
        if "learning_style" not in columns:
            conn.execute(text("ALTER TABLE profiles ADD COLUMN learning_style VARCHAR;"))
            conn.commit()

run_migrations()

# --- SEED SAMPLE ASSESSMENTS ---
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

seed_assessments()

# --- DEPENDENCIES ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password):
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# --- SCHEMAS ---
class UserRegister(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    role: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    full_name: str
    email: str
    role: str
    model_config = ConfigDict(from_attributes=True)

class ProfileData(BaseModel):
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

class AssessmentSubmitPayload(BaseModel):
    answers: Dict[str, Any]

# --- APP ---
app = FastAPI(title="SmartLearn API")

# Static files for avatars and uploads
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

FRONTEND_DIR = BASE_DIR.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/frontend", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

# CORS setup
origins = [
    "http://localhost",
    "http://localhost:8080",
    "http://localhost:3000",
    "http://localhost:5500",
    "http://localhost:5501",
    "http://127.0.0.1",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5500",
    "http://127.0.0.1:5501",
    "null"  # For file:// protocol
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}

def get_current_user(token: str, db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(UserDB).filter(UserDB.email == email).first()
    if user is None:
        raise credentials_exception
    return user

# --- AUTH ROUTES ---

@app.post("/auth/register")
def register(user: UserRegister, db: Session = Depends(get_db)):
    db_user = db.query(UserDB).filter(UserDB.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_pwd = get_password_hash(user.password)
    new_user = UserDB(full_name=user.full_name, email=user.email, hashed_password=hashed_pwd, role=user.role)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token = create_access_token(data={"sub": new_user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/auth/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(UserDB).filter(UserDB.email == user.email).first()
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    access_token = create_access_token(data={"sub": db_user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me", response_model=UserResponse)
def get_me(token: str, db: Session = Depends(get_db)):
    return get_current_user(token, db)

# --- PROFILE ROUTES ---

@app.get("/profile")
def get_profile(token: str, db: Session = Depends(get_db)):
    user = get_current_user(token, db)
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
            "completion_percentage": 0
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
        "completion_percentage": profile.completion_percentage or 0
    }

@app.post("/profile")
def save_profile(profile_data: ProfileData, token: str, db: Session = Depends(get_db)):
    user = get_current_user(token, db)
    profile = db.query(ProfileDB).filter(ProfileDB.user_id == user.id).first()
    
    if not profile:
        profile = ProfileDB(user_id=user.id)
        db.add(profile)
        
    profile.phone = profile_data.phone
    profile.dob = profile_data.dob
    profile.gender = profile_data.gender
    profile.city = profile_data.city
    profile.career_goal = profile_data.career_goal
    profile.secondary_career_goal = profile_data.secondary_career_goal
    if profile_data.profile_image:
        profile.profile_image = profile_data.profile_image
    profile.skills = profile_data.skills
    profile.interests = profile_data.interests
    profile.languages = profile_data.languages
    profile.education = profile_data.education
    profile.experience = profile_data.experience
    profile.projects = profile_data.projects
    profile.courses = profile_data.courses
    profile.learning_style = profile_data.learning_style
    
    # Calculate sensible completion percentage if not explicitly 100
    calc_percent = 0
    if profile.phone: calc_percent += 10
    if profile.dob: calc_percent += 10
    if profile.career_goal: calc_percent += 20
    if profile.skills and len(profile.skills) > 0: calc_percent += 20
    if profile.interests and len(profile.interests) > 0: calc_percent += 15
    if profile.education and len(profile.education) > 0: calc_percent += 15
    if profile.experience or profile.projects: calc_percent += 10
    
    profile.completion_percentage = max(calc_percent, profile_data.completion_percentage or 0)
    
    db.commit()
    db.refresh(profile)
    return {
        "message": "Profile saved successfully",
        "completion_percentage": profile.completion_percentage
    }

@app.post("/profile/avatar")
async def upload_avatar(token: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    user = get_current_user(token, db)
    
    # Validate content type
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/jpg", "image/gif"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Invalid image format. Allowed formats: JPG, PNG, WEBP, GIF"
        )
    
    # Read file content and check size (5MB max)
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="Image size exceeds 5MB limit"
        )
    
    # Generate unique filename
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    safe_filename = f"user_{user.id}_{uuid.uuid4().hex[:8]}.{ext}"
    file_path = AVATAR_DIR / safe_filename
    
    with open(file_path, "wb") as f:
        f.write(content)
        
    relative_url = f"/uploads/avatars/{safe_filename}"
    
    # Update profile record
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

# --- ASSESSMENT ROUTES ---

@app.get("/assessments")
def list_assessments(token: str, db: Session = Depends(get_db)):
    get_current_user(token, db)
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
def get_my_assessment_results(token: str, db: Session = Depends(get_db)):
    user = get_current_user(token, db)
    return AssessmentService.get_user_history(
        db=db,
        AttemptModel=AssessmentAttemptDB,
        AssessmentModel=AssessmentDB,
        user_id=user.id
    )

@app.get("/assessments/{assessment_id}")
def get_assessment(assessment_id: int, token: str, db: Session = Depends(get_db)):
    get_current_user(token, db)
    assessment, questions = AssessmentService.get_by_id(db, AssessmentDB, AssessmentQuestionDB, assessment_id)
    
    # Return questions without correct answers
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
def submit_assessment(assessment_id: int, payload: AssessmentSubmitPayload, token: str, db: Session = Depends(get_db)):
    user = get_current_user(token, db)
    return AssessmentService.submit(
        db=db,
        AssessmentModel=AssessmentDB,
        QuestionModel=AssessmentQuestionDB,
        AttemptModel=AssessmentAttemptDB,
        user_id=user.id,
        assessment_id=assessment_id,
        answers=payload.answers
    )

@app.get("/assessments/{assessment_id}/result")
def get_latest_assessment_result(assessment_id: int, token: str, db: Session = Depends(get_db)):
    user = get_current_user(token, db)
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

# --- RECOMMENDATION ROUTES ---

@app.get("/recommendations")
def get_recommendations(
    token: str,
    limit: Optional[int] = 6,
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    user = get_current_user(token, db)
    profile = db.query(ProfileDB).filter(ProfileDB.user_id == user.id).first()
    
    # Fetch assessment attempts
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
        
    profile_dict = {}
    if profile:
        profile_dict = {
            "career_goal": profile.career_goal,
            "secondary_career_goal": profile.secondary_career_goal,
            "skills": profile.skills or [],
            "interests": profile.interests or [],
            "courses": profile.courses or [],
            "learning_style": profile.learning_style
        }
        
    return RecommendationEngine.get_recommendations(
        profile_data=profile_dict,
        assessment_attempts=attempts,
        limit=limit or 6,
        category=category
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
