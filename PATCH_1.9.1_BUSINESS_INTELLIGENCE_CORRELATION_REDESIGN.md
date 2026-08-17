# ZE CenterOS v1.9.1 — Business Intelligence Correlation Redesign

## Why
v1.9.0 contained the right metrics but presented them as many independent cards/tabs.
Users had to mentally connect new learners -> revenue -> expense -> profit -> retention.

## New Executive model
The main Business Intelligence page now follows one business story:

Growth -> Revenue -> Cost -> Profit -> Retention -> Action

The Executive page answers:
1. Are we on target?
2. Are we on pace for this point in the month?
3. What is driving the gap?
4. What should the team do next?

## Simplified navigation
Only four views:
- Tổng quan
- Tài chính chi tiết
- Học viên & Retention
- Thiết lập (Admin)

Finance tables and learner detail are drill-down views rather than layers on the Executive screen.

## Correlated indicators
Executive now derives:
- Revenue / new learner / profit target progress
- expected pace based on % of month elapsed
- expense ratio
- profit margin
- cash conversion
- active learner rate
- outstanding tuition
- high/medium learner risk
- unallocated revenue
- top business drivers
- prioritized action queue
- six-month Revenue / Profit / New Learner comparison in one matrix

No new SQL migration is required beyond migration 022 from v1.9.0.
