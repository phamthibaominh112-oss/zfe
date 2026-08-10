# ZE CenterOS v1.4.0

## 1. Teacher schedule visibility fixed
Teacher schedule is now session-first, not class-first.

A teacher sees a session only when that teacher is directly present in `session_teachers` for that session.
This prevents a session assigned to another teacher from appearing on Mr. Phong's account just because Mr. Phong is the class-level teacher.

RLS is also updated so a teacher assigned directly at session level can view that class/session even if they are not a class-level teacher.
This fixes test/founder accounts such as `baominh@gmail.com` when they are assigned directly to a session.

## 2. Placement Test module
New `/placement` module for Admin / Academic / CSKH / placement assessors.

Flow:
1. CSKH records/uses student profile and availability.
2. Book Placement block:
   - 90 minutes = student is new to IELTS / shorter assessment.
   - 180 minutes = student is familiar with IELTS / full test.
3. Book a separate 15-minute Speaking slot with a Placement Assessor at least 12 hours in advance.
4. Raw scores are recorded.
5. Speaking assessor records Speaking score/notes.
6. Academic validates Entry Level and recommendation.
7. CSKH records result communication + follow-up.
8. UI tracks the 12-hour result/follow-up SLA.

The migration marks the current founder test accounts as Placement Assessors when their teacher email is:
- `giaovien@gmail.com`
- `baominh@gmail.com`

## 3. Teaching hours and TA hours are separate
Teacher compensation settings now have:
- Teaching hourly rate
- TA hourly rate

Payroll now calculates separately:
- Teaching hours
- TA hours
- Teaching amount
- TA amount
- Total payroll

`Assistant` session assignments are TA hours. Other teaching roles are Teaching hours.

## 4. Teacher check-in/out for TA
`teacher_session_compliance` now includes `Assistant`.
A TA can see and check in/out the same session independently from the Main Teacher.
TA sessions do not create a second session.

Teaching homework KPI excludes Assistant sessions from the Teaching/homework denominator.

## 5. Academic/CSKH future work shifts
Workforce now has week navigation.
Employees can view all registered shifts in the selected week, including future shifts.
Check-in/out buttons are still only shown/allowed according to the real date/time rules.

## Database
Run:
`supabase/migrations/011_teacher_visibility_placement_and_split_payroll.sql`

Then deploy the v1.4.0 source.
