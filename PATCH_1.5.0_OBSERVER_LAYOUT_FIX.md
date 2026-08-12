# ZE CenterOS v1.5.0 — Observer Layout Fix

Fixes the Observer assignment UI inside narrow weekly schedule cards.

Problem:
- Observer form used reusable form controls that were designed for wider panels.
- Select / textarea / Save button overflowed and were visually clipped inside a calendar day column.

Fix:
- Observer form now uses a dedicated compact card layout.
- Select, textarea and button are strictly `width: 100%` with `min-width: 0`.
- Observer labels and helper text wrap safely.
- The calendar session card cannot expand the weekly grid horizontally.
- Observer business logic and database model are unchanged.

Database:
- No new SQL migration for v1.5.0.
- Migration 014 from v1.4.9 is still required.
