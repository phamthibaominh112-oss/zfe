# ZE CenterOS v1.5.2 — Assignment Class Selection Fix

Fixes browser validation error when creating an Assignment.

- Class is no longer HTML-required when a Session is selected.
- Backend infers `class_id` from the selected Session.
- If no Session is selected, a Class is required by server validation.
- Class dropdown is built from both active enrollments and visible sessions, so classes with sessions are not missing from the dropdown.
- No SQL migration required.
