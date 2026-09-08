from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from app.schemas.assessment import (
    AssessmentPublic, AssessmentSubmission, AssessmentResultResponse, AssessmentHistoryItem
)
from app.services.assessment_service import AssessmentService

router = APIRouter(prefix="/assessments", tags=["assessments"])

# Router delegating to AssessmentService
