# ZE CenterOS v1.5.3 — Session-first Batch Attendance

## New flow
Academic / Teacher / Admin:

1. Open Academic.
2. Click a Session for today.
3. The active roster for that class appears immediately.
4. Every student defaults to Present, or shows the attendance status already saved.
5. Change only exceptions:
   - Present
   - Late (+ minutes)
   - Excused absence
   - Unexcused absence
6. Click one button to save attendance for the whole roster.

## Why
The previous quick attendance still submitted one student at a time.
This version sends one batch upsert for the entire class.

## Data
No new SQL migration required.
Uses the existing `attendance` table and unique key:
`session_id + student_id`.

Existing manual attendance tools remain available for special corrections.
