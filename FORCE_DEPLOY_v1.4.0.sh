#!/bin/bash
set -euo pipefail
REPO="/Users/Meimei/Desktop/ZFE/zfe-repo"
SOURCE="$(cd "$(dirname "$0")" && pwd)"

echo "=== ZE CenterOS FORCE DEPLOY v1.4.0 ==="
rsync -av --delete \
  --exclude=".git" \
  --exclude=".env" \
  --exclude=".env.*" \
  --exclude="node_modules" \
  --exclude=".next" \
  --exclude=".DS_Store" \
  "$SOURCE/" "$REPO/"

cd "$REPO"
echo "=== VERIFY v1.4.0 ==="
grep -n "v1.4.0 · DIRECT SESSION ASSIGNMENT + TA" "app/(protected)/schedule/page.tsx"
grep -n "Placement Test" "lib/roles.ts"
grep -n "createPlacementTest" "app/actions.ts"
grep -n "teacherSessions" "app/(protected)/dashboard/page.tsx"
grep -n "ta_hourly_rate" "app/(protected)/payroll/page.tsx"
grep -n "011_teacher_visibility_placement_and_split_payroll" "PATCH_1.4.0_TEACHER_VISIBILITY_PLACEMENT_SPLIT_PAYROLL.md"
node -p "require('./package.json').version"
node scripts/verify-package.mjs
node scripts/check-source-syntax.mjs

git add .
if git diff --cached --quiet; then
  echo "No changes to commit."
else
  git commit -m "Fix teacher schedules add Placement and split TA payroll v1.4.0"
fi
git push origin main

echo "✅ PUSHED v1.4.0"
