# ZE CenterOS v1.3.2 — SOP Viewer recursion/layout fix

## Fixed
- Removed server-rendered `iframe srcDoc` for the large handbook.
- The handbook is now written into an isolated `about:blank` iframe after client mount.
- Prevents the ZE CenterOS application shell from appearing recursively inside SOP & Training.
- Embedded-screen mode hides the handbook's own top header and converts its left table of contents into a compact horizontal sticky navigation bar.
- The normal handbook print CSS is preserved for Print / Save PDF.
- Fullscreen state now stays synchronized when Escape is used.

## Database
No SQL migration is required.
