from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict, Any

class QuestionOption(BaseModel):
    id: int
    text: str

class QuestionPublic(BaseModel):
    id: int
    assessment_id: int
    question_text: str
    options: List[str]
    points: int = 10
    model_config = ConfigDict(from_attributes=True)

class AssessmentPublic(BaseModel):
    id: int
    title: str
    description: str
    category: str
    total_questions: int
    duration_minutes: int
    passing_score: int
    questions: Optional[List[QuestionPublic]] = []
    model_config = ConfigDict(from_attributes=True)

class AssessmentSubmission(BaseModel):
    answers: Dict[str, int] # {question_id_str: selected_option_index}

class QuestionFeedback(BaseModel):
    question_id: int
    question_text: str
    selected_option: Optional[int]
    correct_option: int
    is_correct: bool
    explanation: str
    points_earned: int
    total_points: int

class AssessmentResultResponse(BaseModel):
    attempt_id: int
    assessment_id: int
    assessment_title: str
    score: int
    max_score: int
    percentage: int
    total_questions: int
    correct_count: int
    incorrect_count: int
    performance_level: str
    feedback: List[Dict[str, Any]]
    submitted_at: str
    recommendation_note: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class AssessmentHistoryItem(BaseModel):
    id: int
    assessment_id: int
    assessment_title: str
    category: str
    score: int
    max_score: int
    percentage: int
    performance_level: str
    submitted_at: str
    model_config = ConfigDict(from_attributes=True)
