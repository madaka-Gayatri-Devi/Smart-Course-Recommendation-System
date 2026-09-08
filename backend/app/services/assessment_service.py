from sqlalchemy.orm import Session
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import HTTPException, status

def calculate_performance_level(percentage: int) -> str:
    if percentage >= 90:
        return "Mastery"
    elif percentage >= 75:
        return "Advanced"
    elif percentage >= 60:
        return "Intermediate"
    else:
        return "Needs Improvement"

def get_recommendation_note(performance_level: str, category: str) -> str:
    if performance_level == "Mastery":
        return f"Outstanding mastery in {category}! You are ready for advanced and specialization projects."
    elif performance_level == "Advanced":
        return f"Strong conceptual knowledge in {category}. Recommended to practice end-to-end building."
    elif performance_level == "Intermediate":
        return f"Good foundational understanding of {category}. We recommend focused skill-gap bridge courses."
    else:
        return f"Foundational review recommended in {category}. Follow the personalized learning path."

class AssessmentService:
    @staticmethod
    def get_all(db: Session, AssessmentModel):
        return db.query(AssessmentModel).all()

    @staticmethod
    def get_by_id(db: Session, AssessmentModel, QuestionModel, assessment_id: int):
        assessment = db.query(AssessmentModel).filter(AssessmentModel.id == assessment_id).first()
        if not assessment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")
        
        questions = db.query(QuestionModel).filter(QuestionModel.assessment_id == assessment_id).all()
        return assessment, questions

    @staticmethod
    def submit(db: Session, AssessmentModel, QuestionModel, AttemptModel, user_id: int, assessment_id: int, answers: Dict[str, int]):
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
