from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Union, Dict, Any

class SkillItem(BaseModel):
    skill: str
    level: Optional[str] = "Beginner"

class ProfileData(BaseModel):
    phone: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    city: Optional[str] = None
    career_goal: Optional[str] = None
    secondary_career_goal: Optional[str] = None
    profile_image: Optional[str] = None
    skills: Optional[List[Union[Dict[str, Any], str, SkillItem]]] = []
    interests: Optional[List[str]] = []
    languages: Optional[List[str]] = []
    education: Optional[List[Dict[str, Any]]] = []
    experience: Optional[List[Dict[str, Any]]] = []
    projects: Optional[List[Dict[str, Any]]] = []
    courses: Optional[List[Dict[str, Any]]] = []
    learning_style: Optional[str] = None
    learning_pace: Optional[str] = None
    completion_percentage: Optional[int] = 0
