from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, JSON, ForeignKey
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from pydantic import BaseModel, EmailStr, ConfigDict
import bcrypt
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional, List

from pathlib import Path

# --- CONFIG ---
SECRET_KEY = "supersecret_smartlearn_key"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 1 week

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "smartlearn.db"
DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

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
    skills = Column(JSON, nullable=True)
    interests = Column(JSON, nullable=True)
    languages = Column(JSON, nullable=True)
    education = Column(JSON, nullable=True)
    experience = Column(JSON, nullable=True)
    projects = Column(JSON, nullable=True)
    courses = Column(JSON, nullable=True)
    completion_percentage = Column(Integer, default=0)

Base.metadata.create_all(bind=engine)

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
    skills: Optional[list] = []
    interests: Optional[list] = []
    languages: Optional[list] = []
    education: Optional[list] = []
    experience: Optional[list] = []
    projects: Optional[list] = []
    courses: Optional[list] = []
    completion_percentage: Optional[int] = 0

# --- APP ---
app = FastAPI(title="SmartLearn API")

# Update CORS settings to be more secure while supporting common local dev origins
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
    "null"  # For file:// protocol if they open HTML directly
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

# --- ROUTES ---

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

@app.get("/profile")
def get_profile(token: str, db: Session = Depends(get_db)):
    user = get_current_user(token, db)
    profile = db.query(ProfileDB).filter(ProfileDB.user_id == user.id).first()
    if not profile:
        return {}
    return {
        "phone": profile.phone,
        "dob": profile.dob,
        "gender": profile.gender,
        "city": profile.city,
        "career_goal": profile.career_goal,
        "skills": profile.skills,
        "interests": profile.interests,
        "languages": profile.languages,
        "education": profile.education,
        "experience": profile.experience,
        "projects": profile.projects,
        "courses": profile.courses,
        "completion_percentage": profile.completion_percentage
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
    profile.skills = profile_data.skills
    profile.interests = profile_data.interests
    profile.languages = profile_data.languages
    profile.education = profile_data.education
    profile.experience = profile_data.experience
    profile.projects = profile_data.projects
    profile.courses = profile_data.courses
    profile.completion_percentage = profile_data.completion_percentage
    
    db.commit()
    return {"message": "Profile saved successfully"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)

