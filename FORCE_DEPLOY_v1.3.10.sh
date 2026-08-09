#!/bin/bash
set -euo pipefail

REPO="/Users/Meimei/Desktop/ZFE/zfe-repo"
SOURCE="$(cd "$(dirname "$0")" && pwd)"

echo "=== ZE CenterOS FORCE DEPLOY v1.3.10 ==="

rsync -av --delete \
  --exclude=".git" \
  --exclude=".env" \
  --exclude=".env.*" \
  --exclude="node_modules" \
  --exclude=".next" \
  --exclude=".DS_Store" \
  "$SOURCE/" "$REPO/"

cd "$REPO"

echo "=== VERIFY BUILD FIX + CO-TEACHER ==="
grep -n "sessionDisplayLabel" "app/(protected)/academic/page.tsx" | head
grep -n "sessionDisplayLabel" "app/(protected)/dashboard/page.tsx" | head
grep -n "v1.3.10 · CO-TEACHER ENABLED · BUILD FIX" "app/(protected)/schedule/page.tsx"
grep -n "Quản lý GV + Co-teacher/TA" "app/(protected)/schedule/page.tsx"
grep -n "updateSessionTeachingTeam" "app/actions.ts"
grep -n 'role: "Assistant"' "app/actions.ts"

echo "VERSION: $(node -p "require('./package.json').version")"

git add .
if git diff --cached --quiet; then
  echo "No changes to commit."
else
  git commit -m "Fix Vercel build and deploy co-teacher workflow v1.3.10"
fi
git push origin main

echo "✅ PUSHED v1.3.10"
