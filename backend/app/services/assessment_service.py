from sqlalchemy.orm import Session
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import HTTPException, status

# ============================================================================
# PERFORMANCE TIER CALCULATION & RECOMMENDATION HELPERS
# ============================================================================
def calculate_performance_level(percentage: int) -> str:
    """
    Determine qualitative performance tier based on assessment percentage score.

    Args:
        percentage: Calculated integer percentage (0-100).

    Returns:
        str: Performance category ('Mastery', 'Advanced', 'Intermediate', 'Needs Improvement').
    """
    if percentage >= 90:
        return "Mastery"
    elif percentage >= 75:
        return "Advanced"
    elif percentage >= 60:
        return "Intermediate"
    else:
        return "Needs Improvement"

def get_recommendation_note(performance_level: str, category: str) -> str:
    """
    Generate tailored learning advice and next steps based on performance tier and category.

    Args:
        performance_level: Qualitative performance tier string.
        category: Subject or skill domain of the assessment.

    Returns:
        str: Actionable study advice or next learning step recommendation.
    """
    if performance_level == "Mastery":
        return f"Outstanding mastery in {category}! You are ready for advanced and specialization projects."
    elif performance_level == "Advanced":
        return f"Strong conceptual knowledge in {category}. Recommended to practice end-to-end building."
    elif performance_level == "Intermediate":
        return f"Good foundational understanding of {category}. We recommend focused skill-gap bridge courses."
    else:
        return f"Foundational review recommended in {category}. Follow the personalized learning path."

# ============================================================================
# ASSESSMENT SERVICE & SUBMISSION GRADING ENGINE
# ============================================================================
class AssessmentService:
    @staticmethod
    def get_all(db: Session, AssessmentModel):
        """
        Retrieve all available assessments from the database.

        Args:
            db: Active SQLAlchemy database session.
            AssessmentModel: Assessment database model class.

        Returns:
            List[AssessmentModel]: List of all assessment records.
        """
        return db.query(AssessmentModel).all()

    @staticmethod
    def get_by_id(db: Session, AssessmentModel, QuestionModel, assessment_id: int):
        """
        Retrieve a specific assessment and its associated questions.

        Args:
            db: Active SQLAlchemy database session.
            AssessmentModel: Assessment ORM model.
            QuestionModel: Question ORM model.
            assessment_id: Target assessment ID.

        Returns:
            Tuple[AssessmentModel, List[QuestionModel]]: Assessment metadata and question set.

        Error handling:
            Raises HTTPException(404) if assessment is not found.
        """
        assessment = db.query(AssessmentModel).filter(AssessmentModel.id == assessment_id).first()
        if not assessment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")
        
        questions = db.query(QuestionModel).filter(QuestionModel.assessment_id == assessment_id).all()
        return assessment, questions

    @staticmethod
    def submit(db: Session, AssessmentModel, QuestionModel, AttemptModel, user_id: int, assessment_id: int, answers: Dict[str, int]):
        """
        Evaluate user answers, calculate score and tier, record attempt, and return diagnostic feedback.

        Args:
            db: Active SQLAlchemy database session.
            AssessmentModel: Assessment ORM model.
            QuestionModel: Question ORM model.
            AttemptModel: Attempt ORM model.
            user_id: ID of the submitting student.
            assessment_id: ID of the assessment being taken.
            answers: Dictionary mapping question IDs to selected option indices.

        Returns:
            dict: Detailed diagnostic report with question feedback, score, tier, and recommendation note.

        Purpose:
            Scores student answers, saves persistent attempt record, and produces learning insights.

        Error handling:
            Raises HTTPException(404) if assessment missing, or HTTPException(400) if no questions.
        """
        assessment = db.query(AssessmentModel).filter(AssessmentModel.id == assessment_id).first()
        if not assessment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")

        questions = db.query(QuestionModel).filter(QuestionModel.assessment_id == assessment_id).all()
        if not questions:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assessment has no questions")

        total_score = 0
        max_score = 0
        correct_count = 0
        feedback_list = []

        for q in questions:
            max_score += q.points
            # User submitted answer (could be string or int key)
            user_choice = answers.get(str(q.id))
            if user_choice is None:
                user_choice = answers.get(int(q.id))

            is_correct = (user_choice is not None and int(user_choice) == int(q.correct_option))
            points_earned = q.points if is_correct else 0
            if is_correct:
                correct_count += 1
                total_score += points_earned

            feedback_list.append({
                "question_id": q.id,
                "question_text": q.question_text,
                "options": q.options,
                "selected_option": user_choice,
                "correct_option": q.correct_option,
                "is_correct": is_correct,
                "explanation": q.explanation or "",
                "points_earned": points_earned,
                "total_points": q.points
            })

        percentage = round((total_score / max_score) * 100) if max_score > 0 else 0
        performance_level = calculate_performance_level(percentage)
        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

        attempt = AttemptModel(
            user_id=user_id,
            assessment_id=assessment_id,
            score=total_score,
            max_score=max_score,
            percentage=percentage,
            performance_level=performance_level,
            answers=answers,
            feedback=feedback_list,
            submitted_at=now_str
        )
        db.add(attempt)
        db.commit()
        db.refresh(attempt)

        recommendation_note = get_recommendation_note(performance_level, assessment.category)

        return {
            "attempt_id": attempt.id,
            "assessment_id": assessment.id,
            "assessment_title": assessment.title,
            "category": assessment.category,
            "score": total_score,
            "max_score": max_score,
            "percentage": percentage,
            "total_questions": len(questions),
            "correct_count": correct_count,
            "incorrect_count": len(questions) - correct_count,
            "performance_level": performance_level,
            "feedback": feedback_list,
            "submitted_at": now_str,
            "recommendation_note": recommendation_note
        }

    @staticmethod
    def get_user_history(db: Session, AttemptModel, AssessmentModel, user_id: int):
        """
        Retrieve the chronological assessment attempt history for a specific student.

        Args:
            db: Active SQLAlchemy database session.
            AttemptModel: Attempt ORM model.
            AssessmentModel: Assessment ORM model.
            user_id: Database ID of the student.

        Returns:
            List[dict]: Historical attempt summaries with scores, dates, and categories.
        """
        attempts = db.query(AttemptModel).filter(AttemptModel.user_id == user_id).order_by(AttemptModel.id.desc()).all()
        history = []
        for att in attempts:
            assessment = db.query(AssessmentModel).filter(AssessmentModel.id == att.assessment_id).first()
            history.append({
                "id": att.id,
                "assessment_id": att.assessment_id,
                "assessment_title": assessment.title if assessment else "Assessment",
                "category": assessment.category if assessment else "General",
                "score": att.score,
                "max_score": att.max_score,
                "percentage": att.percentage,
                "performance_level": att.performance_level,
                "submitted_at": att.submitted_at
            })
        return history
