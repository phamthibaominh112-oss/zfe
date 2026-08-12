# ZE CenterOS v1.5.1 — Observer Schedule Filter

Admin / Academic can now filter the weekly Center Schedule by Observer.

Options:
- All Observers
- Unassigned Observer
- Any active Academic/Admin Observer

Observer filtering can be combined with:
- Class filter
- Teacher filter
- Week navigation

Behavior:
- Selecting an Observer shows only sessions assigned to that Observer.
- `Unassigned Observer` shows sessions without a row in `session_observers`.
- Placement Speaking bookings are hidden while an Observer filter is active because they are not classroom observation sessions.
- Week navigation preserves the active Observer filter.
- Availability Add/Edit/Delete preserves the Observer filter as well.

No new SQL migration required.
Migration 014 remains required.
