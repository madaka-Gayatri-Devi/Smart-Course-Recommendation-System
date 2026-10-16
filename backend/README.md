# SmartLearn Backend API & AI Chatbot Documentation

## 📌 Overview
The SmartLearn backend is built with **FastAPI**, **SQLAlchemy ORM**, **SQLite**, and **Pydantic**. It provides RESTful APIs for course recommendations, skill gap analysis, assessments, user profiles, authentication, notifications, and an **AI-powered Learning Coach chatbot** with multimodal text and voice capabilities.

---

## 🏗️ Architecture & Core Components

### 1. Authentication & Security
- **JWT (JSON Web Tokens)**: Tokens are signed with HMAC-SHA256 (`HS256`) and an expiration period (`ACCESS_TOKEN_EXPIRE_MINUTES`).
- **Password Hashing**: Secure bcrypt hashing with salted passwords via `passlib`/`bcrypt`.
- **Role-Based Access Control (RBAC)**:
  - `get_current_user`: Validates token presence in query parameter (`?token=...`) or `Authorization: Bearer <token>` header, decodes the subject (`sub`), and retrieves the user record.
  - `get_current_student`: Enforces that the user has the `Student` role.
  - `get_current_instructor`: Enforces `Instructor` or `Admin` privileges.
  - `get_current_admin`: Enforces `Admin` privileges for platform management.

### 2. Database Models & Schema
- `UserDB`: User entity (ID, full name, email, hashed password, role, active status, 2FA flag).
- `ProfileDB`: Student profile (headline, bio, education, experience, career goal, skills, interests).
- `CourseDB`: Course catalog (title, description, category, level, instructor ID, status, price, rating).
- `EnrollmentDB`: Course enrollments (user ID, course ID, status, progress percentage).
- `AIChatbotConversationDB`: AI chatbot conversation sessions (ID, user ID, title, role, timestamps).
- `AIChatbotMessageDB`: AI chatbot turn-by-turn messages (ID, conversation ID, user ID, sender, content, timestamp).

### 3. AI Chatbot Assistant (`app/services/ai_chatbot_service.py` & `app/routers/chatbot.py`)
The AI chatbot adapts dynamically to each user's authenticated role:
- **Student Coach**: Contextualized with the student's target career goals, current skills, enrolled courses with completion percentages, and top recommended courses.
- **Instructor Assistant**: Contextualized with the instructor's authored catalog, student enrollment counts, and average ratings. Helps draft syllabus modules, quiz questions, and assignments.
- **Admin Operations Assistant**: Contextualized with platform statistics (total users, students, instructors, courses, completion rates, and platform revenue). Enforces hard guardrails preventing database mutations.

---

## 🤖 AI Provider Configuration & Resilient Fallback

The backend supports multiple AI providers with a multi-tier fallback architecture:

```
Request ──► [Preferred Provider: AI_PROVIDER] ──► [Groq (Qwen/Llama)] ──► [Google Gemini] ──► [OpenAI] ──► [Anthropic]
```

### Environment Variables (`backend/.env`):
```env
# Preferred AI Provider: groq, gemini, openai, anthropic
AI_PROVIDER=groq

# Groq Cloud API (High-speed inference)
GROQ_API_KEY="your_groq_api_key_here"
GROQ_MODEL="qwen/qwen3.8-27b"

# Google Gemini API
GEMINI_API_KEY="your_gemini_api_key_here"
GEMINI_MODEL="gemini-1.5-flash"

# OpenAI API
OPENAI_API_KEY="your_openai_api_key_here"
OPENAI_MODEL="gpt-4o-mini"

# Anthropic Claude API
ANTHROPIC_API_KEY="your_anthropic_api_key_here"
ANTHROPIC_MODEL="claude-3-5-sonnet-20241022"
```

### Security & Sanitization
All error messages returned to clients or logged to files pass through `_sanitize_error_message()`, which strips and masks raw API keys, bearer tokens, and credentials (e.g. `gsk_***`, `sk-***`, `AIza***`).

---

## 📡 Chatbot API Endpoints

| Method | Endpoint | Description | Role / Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/chatbot/health` | Health & masked status of configured AI providers | Public / Diagnostic |
| `POST` | `/chatbot/message` | Submit message (typed text or speech-to-text transcript) | Authenticated (JWT) |
| `GET` | `/chatbot/conversations` | List conversation sessions for current user | Authenticated (JWT) |
| `POST` | `/chatbot/conversations` | Create a new conversation session | Authenticated (JWT) |
| `GET` | `/chatbot/conversations/{id}` | Get full conversation transcript | Authenticated Owner (403 guard) |
| `DELETE` | `/chatbot/conversations/{id}` | Delete conversation and messages | Authenticated Owner (403 guard) |

---

## 🎙️ Voice & Multimodal Integration

The frontend chatbot interface integrates the **Browser Web Speech API**:
- **Speech-to-Text (`SpeechRecognition`)**: Converts spoken voice input into text and deposits it in the input area, allowing the user to review and edit before sending.
- **Text-to-Speech (`SpeechSynthesis`)**: Provides a speaker button beside assistant responses to read answers aloud, with playback stop controls.
- **Resource Management**: Automatically halts microphone recording and speech synthesis when the chatbot window is closed or navigated away from.

---

## 🧪 Testing

Run backend tests using Python:
```bash
# Test chatbot AI provider response generation
python -c "import sys; sys.path.append('backend'); from app.services.ai_chatbot_service import AIChatbotService; print(AIChatbotService.generate_ai_response([], 'System Context', 'Hello!'))"

# Test health check endpoint
curl -s http://127.0.0.1:8080/chatbot/health
```
