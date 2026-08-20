# ZE CenterOS v2.0.0 — Learning Hub, Curriculum & Placement Automation

Student Learning Hub:
- ZEB -> ZEF -> ZEE -> ZEM journey
- Attendance / Homework / Midterm / Final
- Skill profile L/R/W/S
- strength / weakness signals
- historical progression
- conservative band trajectory estimate
- recommendations
- class/session syllabus, slide and materials

Academic Record:
Admin / Academic / CSKH / Teacher can enter attendance, homework, mid/final and recommendations.

Curriculum:
Admin / Academic upload course outline, create syllabus master, add each session, duplicate to class and customize class-level content.

Placement:
Full-test teacher is separate from Speaking assessor.
Google Form is embedded inside CenterOS.
Auto-grading path:
Google Form Quiz -> Apps Script -> CenterOS webhook -> placement score record.

Required:
- Migration 023
- Vercel env PLACEMENT_WEBHOOK_SECRET
- Apps Script template in docs/ZFE_PLACEMENT_GOOGLE_FORM_WEBHOOK.gs
