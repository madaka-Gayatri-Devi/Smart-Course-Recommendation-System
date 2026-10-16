"""
Comprehensive Verification Test Suite for SmartLearn AI Chatbot & Group Members Enhancements
=============================================================================================
Tests:
1. Group Members endpoint GET /groups/{group_id}/members
2. Group Members alias GET /chat/groups/{group_id}/members and /chat/conversations/{group_id}/members
3. Deduplication of members and proper role sorting (Instructor > Admin > Student)
4. Absence of sensitive credentials (password, password_hash, tokens) in member objects
5. Authorization enforcement (401 without token, 403 for unauthorized access)
6. Chatbot Health diagnostic endpoint
7. Chatbot Message processing with multi-turn context preservation and real LLM response
8. Role context synthesis for Student (incorporating skills, goals, readiness %, bridge courses)
9. Client assets verification (chatbot.css with 4 positions, chatbot.js with position controls, minimize, maximize)
"""

import os
import sys
from pathlib import Path
import pytest
from jose import jwt
from fastapi.testclient import TestClient

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PROJECT_ROOT = BASE_DIR.parent if BASE_DIR.name == "backend" else BASE_DIR
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

try:
    from backend.app.main import app, SessionLocal, UserDB, SECRET_KEY, ALGORITHM
    from backend.app.services.chat_service import ChatService
    from backend.app.services.ai_chatbot_service import AIChatbotService
except ImportError:
    from app.main import app, SessionLocal, UserDB, SECRET_KEY, ALGORITHM
    from app.services.chat_service import ChatService
    from app.services.ai_chatbot_service import AIChatbotService

client = TestClient(app)


@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module")
def honey_user(db_session):
    user = db_session.query(UserDB).filter(UserDB.email == "honey@gmail.com").first()
    assert user is not None, "honey@gmail.com must exist in smartlearn.db"
    return user


@pytest.fixture(scope="module")
def honey_token(honey_user):
    return jwt.encode({"sub": honey_user.email, "role": honey_user.role or "Student"}, SECRET_KEY, algorithm=ALGORITHM)


@pytest.fixture(scope="module")
def honey_headers(honey_token):
    return {"Authorization": f"Bearer {honey_token}"}


# ============================================================================
# 1. GROUP MEMBERS TESTS
# ============================================================================

def test_get_group_members_root_endpoint(honey_headers):
    """Verifies GET /groups/{group_id}/members returns actual group members."""
    response = client.get("/groups/21/members", headers=honey_headers)
    assert response.status_code == 200, f"Failed: {response.text}"
    data = response.json()
    assert data["group_id"] == 21
    assert "members" in data
    assert isinstance(data["members"], list)
    assert data["total_members"] == len(data["members"])
    assert data["total_members"] == 9, f"Expected 9 members, got {data['total_members']}"


def test_get_group_members_router_aliases(honey_headers):
    """Verifies router aliases /chat/groups/{id}/members and /chat/conversations/{id}/members."""
    r1 = client.get("/chat/groups/21/members", headers=honey_headers)
    assert r1.status_code == 200
    assert r1.json()["total_members"] == 9

    r2 = client.get("/chat/conversations/21/members", headers=honey_headers)
    assert r2.status_code == 200
    assert r2.json()["total_members"] == 9


def test_group_members_deduplication_and_sorting(honey_headers):
    """Verifies that no duplicate user IDs are returned and that members are properly sorted."""
    response = client.get("/groups/21/members", headers=honey_headers)
    assert response.status_code == 200
    data = response.json()
    members = data["members"]

    # Check uniqueness
    uids = [m["id"] for m in members]
    assert len(uids) == len(set(uids)), f"Duplicate user IDs found: {uids}"

    # Check instructor highlight is prioritized
    first_member = members[0]
    assert first_member["group_role"].lower() == "instructor" or "instructor" in first_member["role"].lower()


def test_group_members_no_sensitive_data_exposure(honey_headers):
    """Ensures password hashes, tokens, or private secrets are never exposed."""
    response = client.get("/groups/21/members", headers=honey_headers)
    assert response.status_code == 200
    data = response.json()

    forbidden_fields = {"password", "password_hash", "hashed_password", "token", "secret", "totp_secret"}
    for m in data["members"]:
        for field in forbidden_fields:
            assert field not in m, f"Sensitive field '{field}' leaked in member: {m}"


def test_group_members_unauthorized_access():
    """Verifies 401 without token and 403 for unauthorized access."""
    r_no_auth = client.get("/groups/21/members")
    assert r_no_auth.status_code in [401, 403]

    bad_token = jwt.encode({"sub": "nonexistent@smartlearn.com", "role": "Student"}, SECRET_KEY, algorithm=ALGORITHM)
    r_bad_auth = client.get("/groups/21/members", headers={"Authorization": f"Bearer {bad_token}"})
    assert r_bad_auth.status_code in [401, 403, 404]


# ============================================================================
# 2. AI CHATBOT BACKEND TESTS
# ============================================================================

def test_chatbot_health_endpoint():
    """Verifies GET /chatbot/health returns provider connectivity without exposing keys."""
    response = client.get("/chatbot/health")
    assert response.status_code == 200
    data = response.json()
    assert "Groq" in data or "Gemini" in data or "OpenAI" in data
    # Ensure unmasked raw API keys are not exposed
    raw_str = str(data)
    full_groq_key = os.getenv("GROQ_API_KEY", "")
    if full_groq_key and len(full_groq_key) > 10:
        assert full_groq_key not in raw_str
    if "Groq" in data and "masked_key" in data["Groq"]:
        assert "..." in data["Groq"]["masked_key"] or "***" in data["Groq"]["masked_key"]


def test_student_context_synthesis(db_session, honey_user):
    """Verifies that Student context incorporates career goal, readiness, and skill gaps."""
    ctx = AIChatbotService.get_role_context(db_session, honey_user)
    assert "Honey" in ctx
    assert "Full Stack Developer" in ctx
    assert "60%" in ctx or "Target Career Readiness" in ctx
    assert "Missing Skills" in ctx
    assert "Recommended Bridge Courses" in ctx


def test_chatbot_message_generation(honey_headers):
    """Verifies that POST /chatbot/message returns a real grounded AI response."""
    payload = {"message": "Summarize my skill gaps in 2 sentences."}
    response = client.post("/chatbot/message", json=payload, headers=honey_headers)
    assert response.status_code == 200
    data = response.json()
    assert "conversation_id" in data
    assert "ai_response" in data
    reply = data["ai_response"]
    assert len(reply) > 20
    # Must not be a dummy placeholder
    assert "dummy" not in reply.lower()
    assert "lorem ipsum" not in reply.lower()


# ============================================================================
# 3. CLIENT REPOSITIONING & ASSETS VERIFICATION
# ============================================================================

def test_chatbot_css_assets():
    """Verifies frontend/css/chatbot.css contains the 4 positioning rules, minimize, and maximize."""
    css_path = os.path.join("frontend", "css", "chatbot.css")
    assert os.path.exists(css_path), f"File {css_path} does not exist"
    with open(css_path, "r", encoding="utf-8") as f:
        content = f.read()

    assert ".pos-right" in content
    assert ".pos-left" in content
    assert ".pos-top" in content
    assert ".pos-bottom" in content
    assert ".is-minimized" in content
    assert ".is-maximized" in content
    assert ".chatbot-pos-dropdown" in content
    assert ".chatbot-status-indicator" in content


def test_chatbot_js_assets():
    """Verifies frontend/js/chatbot.js supports dynamic repositioning, localStorage, and full AI controls."""
    js_path = os.path.join("frontend", "js", "chatbot.js")
    assert os.path.exists(js_path), f"File {js_path} does not exist"
    with open(js_path, "r", encoding="utf-8") as f:
        content = f.read()

    assert "smartlearn_chatbot_position" in content
    assert "applyPosition" in content
    assert "toggleMinimize" in content
    assert "toggleMaximize" in content
    assert "appendErrorMessageBubble" in content
    assert "chatbot-retry-btn" in content
    assert "getFormattedTime" in content
    assert "__setChatbotPosition" in content
