# Smart Course Recommendation System (SmartLearn)

## 📌 Purpose
SmartLearn provides personalized course recommendations based on student skills, interests, career goals, skill assessments, and learning needs.

---

## 🛠️ Technologies
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Python, FastAPI, Uvicorn, SQLAlchemy, Pydantic, Python-JOSE (JWT), Passlib (bcrypt)
- **Database**: SQLite (managed with SQLAlchemy ORM)

---

## ✨ Core Features
- **Student Registration & Login**: Secure authentication with JWT tokens and hashed passwords
- **Student Profile**: Comprehensive profile management for education, experience, and interests
- **Skills Management**: Skill tracking and proficiency selection
- **Interests Mapping**: Domain and category interest selection
- **Career Goals**: Goal definition and target role alignment
- **Skill Assessment**: Interactive diagnostic tests and assessments
- **Course Management**: Course directory, details, syllabus, and level filtering
- **Personalized Recommendations**: Smart matching based on user profile, skills, and goals
- **Skill Gap Analysis**: Identification of missing prerequisite skills for target careers
- **Learning Paths**: Structured step-by-step roadmap to achieve career goals
- **Course Enrollment**: Enroll in courses and manage learning queues
- **Progress Tracking**: Track module completion and milestone progress
- **Wishlist**: Bookmark courses for later exploration
- **Reviews & Ratings**: Course feedback and peer reviews
- **Notifications**: Real-time updates on assignments, recommendations, and milestones
- **Admin Management**: Administrative tools for course and user management

---

## 🚀 Getting Started

### Prerequisites
- Python 3.9+
- Modern Web Browser

### Installation
Clone the repository and install backend dependencies:
```bash
git clone https://github.com/madaka-Gayatri-Devi/Smart-Course-Recommendation-System.git
cd Smart-Course-Recommendation-System
pip install -r backend/requirements.txt
```

### Quick Start (Runs both Frontend & Backend)
Simply run from the project root:
```bash
python main.py
```
*(On Windows, you can also just double-click `start.bat`)*

This starts:
- **Frontend**: http://localhost:5500/login.html
- **Backend API**: http://localhost:8080 (Health check at `/health`)

---

### Starting Services Separately (Optional)

1. **Start Backend**:
```bash
cd backend
python -m uvicorn app.main:app --reload --port 8080
```

2. **Start Frontend**:
Open `frontend/login.html` directly or serve via Live Server / local static HTTP server on port 5500.

3. **Verify API**:
Navigate to `http://127.0.0.1:8080/health` which returns:
```json
{
    "status": "ok"
}
```
