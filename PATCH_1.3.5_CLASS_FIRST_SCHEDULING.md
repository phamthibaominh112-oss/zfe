# ZE CenterOS v1.3.5 — Class-first Scheduling & Drag/Drop Roster

## Operating model correction
ZE / ZB / ZK / other operational codes are treated as CLASS codes. Scheduling is now class-first rather than student-first.

## New module: Xếp lớp & GV
Admin and Academic can:
- View waiting/unassigned students.
- Drag a student into a class roster.
- Drag a student from one class to another to transfer the active enrollment.
- Drag a student back to the waiting pool to remove the active class placement while retaining history.
- Capacity is enforced from `classes.capacity`.
- Set one Main teacher and one optional TA for each class.
- Jump directly to weekly scheduling for the selected class.

## Weekly schedule
- Added class filter before teacher filter.
- `?class=<class_id>` scopes the weekly calendar to that class.
- Session creation defaults to the selected class.
- Teacher matching now selects a CLASS, not a single student.
- For multi-student classes, ZE CenterOS calculates the intersection of all active roster students' availability for the selected week.
- Teacher availability is matched against that common class availability.
- Delivery mode is considered when matching.

## Enrollment history
Drag/drop uses the existing `enrollments` table. Transfers archive the previous active enrollment rather than deleting it.

## Database
No new SQL migration required for v1.3.5. Existing enrollment and class/team structures are reused.
