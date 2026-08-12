# ZE CenterOS v1.4.5 — Assignment File Exchange

## Teacher -> Student
When creating an Assignment, Admin / Academic / Teacher can optionally upload:
- PDF
- DOCX
- PPTX
- XLSX
- PNG / JPG
- ZIP

Maximum: 20MB.

The file is stored privately in Supabase Storage bucket:
`assignment-materials`.

Students enrolled in the class can generate a temporary signed download URL from their portal.

## Student -> Teacher
Students can:
1. Download the teacher's assignment file.
2. Read the instructions and deadline.
3. Upload their completed work.
4. Resubmit if Teacher marks `Revision required`.

Submission bucket:
`assignment-files`.

Submission formats are expanded to the same classroom file types, maximum 20MB.

## Teacher grading
Academic / Teacher portal continues to show:
- submitted student file
- open/download button
- score
- feedback
- Graded / Revision required

## Database
Run migration:
`supabase/migrations/012_assignment_file_exchange.sql`
