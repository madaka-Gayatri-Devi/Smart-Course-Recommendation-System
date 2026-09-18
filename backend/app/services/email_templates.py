"""
SmartLearn Email Templates Generator
Provides responsive HTML and plain text email templates for learning notifications.
"""

from typing import List, Dict, Any, Optional

def get_base_html_template(subject: str, content_html: str, action_button: Optional[Dict[str, str]] = None) -> str:
    button_html = ""
    if action_button:
        btn_url = action_button.get("url", "#")
        btn_text = action_button.get("text", "Continue Learning")
        button_html = f"""
        <div style="margin-top: 25px; margin-bottom: 25px; text-align: center;">
            <a href="{btn_url}" style="background-color: #5B3FE8; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(91, 63, 232, 0.3);">
                {btn_text}
            </a>
        </div>
        """

    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{subject}</title>
    <style>
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f4f5f9;
            margin: 0;
            padding: 0;
            color: #333333;
        }}
        .email-container {{
            max-width: 600px;
            margin: 30px auto;
            background: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        }}
        .header {{
            background: linear-gradient(135deg, #5B3FE8 0%, #8B4AD9 100%);
            padding: 24px 30px;
            text-align: center;
        }}
        .header h1 {{
            color: #ffffff;
            margin: 0;
            font-size: 24px;
            font-weight: 700;
            letter-spacing: 0.5px;
        }}
        .header p {{
            color: #e0d8ff;
            margin: 4px 0 0 0;
            font-size: 14px;
        }}
        .body-content {{
            padding: 30px;
            line-height: 1.6;
            font-size: 15px;
            color: #4a4a4a;
        }}
        .badge {{
            display: inline-block;
            background-color: #ede9fe;
            color: #5B3FE8;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
        }}
        .card-box {{
            background-color: #f8fafc;
            border-left: 4px solid #5B3FE8;
            padding: 16px 20px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }}
        .footer {{
            background-color: #f8fafc;
            padding: 20px 30px;
            text-align: center;
            font-size: 12px;
            color: #888888;
            border-top: 1px solid #edf2f7;
        }}
        .footer a {{
            color: #5B3FE8;
            text-decoration: none;
        }}
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1>🎓 SmartLearn</h1>
            <p>Personalized Learning Platform</p>
        </div>
        <div class="body-content">
            {content_html}
            {button_html}
        </div>
        <div class="footer">
            <p>© 2026 SmartLearn Inc. All rights reserved.</p>
            <p>You received this email because of your SmartLearn account activity. Manage notification preferences in your profile.</p>
        </div>
    </div>
</body>
</html>
"""

def generate_progress_milestone_email(student_name: str, course_name: str, progress_percentage: int, completed_lessons: int, total_lessons: int, app_url: str = "http://127.0.0.1:8080") -> Dict[str, str]:
    subject = f"You're {progress_percentage}% through your {course_name}!"
    content = f"""
        <p>Hi <strong>{student_name}</strong>,</p>
        <p>Great job! You have completed <strong>{progress_percentage}%</strong> of <strong>{course_name}</strong>.</p>
        
        <div class="card-box">
            <p style="margin:0 0 8px 0; font-weight:600; color:#2d3748;">Progress Summary:</p>
            <p style="margin:0 0 4px 0;"><strong>Course:</strong> {course_name}</p>
            <p style="margin:0 0 4px 0;"><strong>Completed Lessons:</strong> {completed_lessons} of {total_lessons}</p>
            <p style="margin:0;"><strong>Current Status:</strong> <span class="badge">{progress_percentage}% Milestone Reached</span></p>
        </div>

        <p>Keep up the momentum and complete the remaining lessons to earn your certificate!</p>
    """
    action = {"text": "Continue Learning", "url": f"{app_url}/student/my-courses.html"}
    html = get_base_html_template(subject, content, action)
    
    text = (
        f"Hi {student_name},\n\n"
        f"You're {progress_percentage}% through {course_name}!\n"
        f"Completed: {completed_lessons} of {total_lessons} lessons.\n\n"
        f"Keep going! Visit: {app_url}/student/my-courses.html\n"
    )
    return {"subject": subject, "html": html, "text": text}

def generate_course_completion_email(student_name: str, course_name: str, completion_date: str, next_recommendation: Optional[str] = None, app_url: str = "http://127.0.0.1:8080") -> Dict[str, str]:
    subject = f"Congratulations! You completed {course_name}"
    
    rec_html = ""
    if next_recommendation:
        rec_html = f"""
        <div class="card-box" style="border-left-color: #10b981;">
            <p style="margin:0 0 6px 0; font-weight:600; color:#065f46;">Recommended Next Step:</p>
            <p style="margin:0;">Based on your achievement, we recommend exploring <strong>{next_recommendation}</strong> to further elevate your career skills.</p>
        </div>
        """

    content = f"""
        <p>Hi <strong>{student_name}</strong>,</p>
        <p>🎉 <strong>Congratulations!</strong> You have successfully completed <strong>{course_name}</strong> on {completion_date}.</p>
        
        <div class="card-box">
            <p style="margin:0 0 6px 0; font-weight:600;">Completion Details:</p>
            <p style="margin:0 0 4px 0;"><strong>Course:</strong> {course_name}</p>
            <p style="margin:0 0 4px 0;"><strong>Completion Date:</strong> {completion_date}</p>
            <p style="margin:0;"><strong>Status:</strong> <span class="badge" style="background-color:#d1fae5; color:#047857;">100% Completed</span></p>
        </div>

        {rec_html}

        <p>Your official SmartLearn Certificate is ready to view and download in your dashboard!</p>
    """
    action = {"text": "View Your Certificate", "url": f"{app_url}/student/my-courses.html"}
    html = get_base_html_template(subject, content, action)
    
    text = (
        f"Hi {student_name},\n\n"
        f"Congratulations! You completed {course_name} on {completion_date}.\n"
        f"Your certificate is ready on SmartLearn: {app_url}/student/my-courses.html\n"
    )
    return {"subject": subject, "html": html, "text": text}

def generate_inactivity_reminder_email(student_name: str, course_name: str, last_lesson_title: Optional[str], progress_percentage: int, suggested_next_lesson: Optional[str] = None, app_url: str = "http://127.0.0.1:8080") -> Dict[str, str]:
    subject = f"Continue your learning journey with {course_name}"
    
    last_lesson_str = last_lesson_title if last_lesson_title else "Lesson 1"
    next_lesson_str = suggested_next_lesson if suggested_next_lesson else "the next lesson"

    content = f"""
        <p>Hi <strong>{student_name}</strong>,</p>
        <p>We noticed you haven't checked in on your course for a little while. Consistency is key to mastering new skills!</p>
        
        <div class="card-box">
            <p style="margin:0 0 6px 0; font-weight:600;">Where You Left Off:</p>
            <p style="margin:0 0 4px 0;"><strong>Course:</strong> {course_name}</p>
            <p style="margin:0 0 4px 0;"><strong>Last Completed Lesson:</strong> {last_lesson_str}</p>
            <p style="margin:0 0 4px 0;"><strong>Current Progress:</strong> {progress_percentage}%</p>
            <p style="margin:0;"><strong>Suggested Next Lesson:</strong> {next_lesson_str}</p>
        </div>

        <p>Take just 15 minutes today to pick up where you left off and keep building your momentum.</p>
    """
    action = {"text": "Resume Course", "url": f"{app_url}/student/my-courses.html"}
    html = get_base_html_template(subject, content, action)
    
    text = (
        f"Hi {student_name},\n\n"
        f"Continue your learning journey in {course_name}!\n"
        f"You are at {progress_percentage}% completion. Last lesson: {last_lesson_str}.\n"
        f"Resume here: {app_url}/student/my-courses.html\n"
    )
    return {"subject": subject, "html": html, "text": text}

def generate_assessment_improvement_email(student_name: str, assessment_name: str, score_percentage: int, strong_skills: List[str], weak_skills: List[str], recommended_courses: List[Dict[str, Any]], app_url: str = "http://127.0.0.1:8080") -> Dict[str, str]:
    subject = f"Your SmartLearn skill improvement update for {assessment_name}"
    
    strong_items = "".join([f"<li>✅ {s}</li>" for s in strong_skills]) if strong_skills else "<li>No specific strong skills identified yet</li>"
    weak_items = "".join([f"<li>⚠️ {s}</li>" for s in weak_skills]) if weak_skills else "<li>None! Outstanding score.</li>"
    
    rec_items = ""
    if recommended_courses:
        for c in recommended_courses[:3]:
            c_title = c.get("title", "Course")
            rec_items += f"<li style='margin-bottom:6px;'><strong>{c_title}</strong></li>"
    else:
        rec_items = "<li>Explore our catalog for advanced topics</li>"

    content = f"""
        <p>Hi <strong>{student_name}</strong>,</p>
        <p>Here is your personalized skill assessment report for <strong>{assessment_name}</strong>.</p>
        
        <div class="card-box">
            <p style="margin:0 0 6px 0; font-size:18px; font-weight:700; color:#5B3FE8;">Assessment Score: {score_percentage}%</p>
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:15px; margin-bottom:20px;">
            <div style="flex:1; min-width:240px; background-color:#f0fdf4; border:1px solid #bbf7d0; padding:15px; border-radius:8px;">
                <h4 style="margin:0 0 8px 0; color:#166534;">Strong Skills</h4>
                <ul style="margin:0; padding-left:20px; font-size:14px; color:#14532d;">
                    {strong_items}
                </ul>
            </div>
            
            <div style="flex:1; min-width:240px; background-color:#fff7ed; border:1px solid #fed7aa; padding:15px; border-radius:8px;">
                <h4 style="margin:0 0 8px 0; color:#9a3412;">Needs Improvement</h4>
                <ul style="margin:0; padding-left:20px; font-size:14px; color:#7c2d12;">
                    {weak_items}
                </ul>
            </div>
        </div>

        <div class="card-box" style="border-left-color: #3b82f6;">
            <h4 style="margin:0 0 8px 0; color:#1d4ed8;">Recommended Courses to Bridge Skill Gaps:</h4>
            <ul style="margin:0; padding-left:20px; font-size:14px;">
                {rec_items}
            </ul>
        </div>

        <p>Focusing on these targeted areas will accelerate your technical proficiency.</p>
    """
    action = {"text": "View Recommendations", "url": f"{app_url}/student/recommendations.html"}
    html = get_base_html_template(subject, content, action)
    
    text = (
        f"Hi {student_name},\n\n"
        f"Assessment Result for {assessment_name}: {score_percentage}%\n"
        f"Strong: {', '.join(strong_skills)}\n"
        f"Needs Improvement: {', '.join(weak_skills)}\n\n"
        f"Recommended courses available on SmartLearn: {app_url}/student/recommendations.html\n"
    )
    return {"subject": subject, "html": html, "text": text}

def generate_recommendation_update_email(student_name: str, career_goal: str, recommended_courses: List[Dict[str, Any]], app_url: str = "http://127.0.0.1:8080") -> Dict[str, str]:
    subject = f"New courses recommended for your career goal as {career_goal}"
    
    course_cards = ""
    for c in recommended_courses[:3]:
        c_title = c.get("title", "Course")
        c_match = c.get("match_percentage", 85)
        c_reason = c.get("reason", "Matches your profile & goals")
        course_cards += f"""
        <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:12px 16px; border-radius:8px; margin-bottom:12px;">
            <div style="font-weight:600; color:#1e293b; font-size:15px;">{c_title}</div>
            <div style="font-size:13px; color:#5B3FE8; margin:2px 0;">🎯 {c_match}% Match for {career_goal}</div>
            <div style="font-size:13px; color:#64748b;">{c_reason}</div>
        </div>
        """

    content = f"""
        <p>Hi <strong>{student_name}</strong>,</p>
        <p>Based on your career goal (<strong>{career_goal}</strong>) and skill profile, our recommendation engine identified high-impact courses for you:</p>
        
        {course_cards}

        <p>Enrolling in these targeted courses will help you achieve your learning objectives faster.</p>
    """
    action = {"text": "Explore Recommended Courses", "url": f"{app_url}/student/recommendations.html"}
    html = get_base_html_template(subject, content, action)
    
    text = (
        f"Hi {student_name},\n\n"
        f"New courses recommended for your career goal as {career_goal}:\n"
        + "\n".join([f"- {c.get('title')} ({c.get('match_percentage', 85)}% Match)" for c in recommended_courses[:3]])
        + f"\n\nCheck recommendations: {app_url}/student/recommendations.html\n"
    )
    return {"subject": subject, "html": html, "text": text}
