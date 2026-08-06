# ZE CenterOS v1.2.4 — Teacher hourly-rate validation

- Fixes the browser step-validation bug caused by `min=1` with `step=1000`.
- Teacher hourly rate is now limited to **50,000–1,500,000 VND/hour**.
- Applies consistently on Admin Dashboard, Finance/Expenses, and Payroll pages.
- Adds matching server-side and PostgreSQL validation.
- Existing rate `0` remains available only as the “not configured” state; Admin cannot save `0` through the application.
