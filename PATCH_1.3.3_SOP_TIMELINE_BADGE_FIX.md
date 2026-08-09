# ZE CenterOS v1.3.3 — SOP Timeline Badge Display Fix

Fixes clipped timeline labels inside the embedded SOP viewer.

## Fixed
- `T-24`, `T-12`, `T-0`, `0–180'`, `+2h`, `+6h`, `+10h`, `≤12h` now auto-size.
- Timeline no longer uses a fixed 34px square for long labels.
- Timeline content uses `minmax(0,1fr)` and safe text wrapping.
- Very narrow viewer widths stack the time badge above the content.
- Print layout keeps time badges readable.
- Embedded handbook updated to v3.3.

No database migration required.
