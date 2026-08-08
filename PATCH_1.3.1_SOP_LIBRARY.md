# ZE CenterOS v1.3.1 — SOP & Training Library

## New internal knowledge library
- Adds `/sop`, accessible only to `admin`, `academic_manager`, and `customer_service`.
- Adds “SOP & Training” to those three role navigation menus only.
- Teacher and student navigation do not expose this section.
- Route-level role guard blocks direct URL access by Teacher/Student.

## Embedded handbook
- Embeds `ZE CenterOS Master Training Handbook v3.2` directly in the application bundle.
- No public/static handbook URL is exposed.
- Viewer supports fullscreen and Print / Save PDF.
- Includes End-to-End Learner Journey, Placement Test SOP & SLA, schedule policy, role workflows, KPI/payroll, cases and step-by-step instructions.

## No new SQL migration required
This release does not require running a new SQL file. The hotfix also carries the already-corrected v1.3.0 migration 009 source file so the repository remains consistent with the fixed SQL previously applied.
