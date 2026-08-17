# ZE CenterOS v1.8.2 — Finance Historical Baseline + Live Overlay

## Root cause fixed
v1.8.0 incorrectly replaced the entire Finance Dashboard v4 `const D` historical
dataset with only the current CenterOS finance tables. Since CenterOS is still
partially populated, the dashboard appeared mostly empty.

## Correct model
Finance Dashboard v4 is now HYBRID:

1. Historical workbook / Finance v4 `D` = opening historical truth.
2. CenterOS = live overlay.
3. Matching CenterOS payment on same student/date supersedes baseline cash row.
4. Completely new CenterOS payments/expenses append to the ledger.
5. Revenue allocation from CenterOS is added only for learners not represented
   in the historical baseline, preventing double-counting.
6. Existing historical learners keep their baseline revenue schedule while
   CenterOS updates their current cash, balance and renewal alerts.

## Result
Historical monthly revenue, cashflow, deferred revenue, ledger, profit baseline
and alerts remain visible, while new CenterOS records continue updating the dashboard.

No SQL migration is required for this patch.
