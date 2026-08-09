#!/bin/bash
set -euo pipefail

REPO="/Users/Meimei/Desktop/ZFE/zfe-repo"
SOURCE="$(cd "$(dirname "$0")" && pwd)"

echo "=== ZE CenterOS FORCE DEPLOY v1.3.9 ==="
echo "Source: $SOURCE"
echo "Repo:   $REPO"

if [ ! -d "$REPO/.git" ]; then
  echo "ERROR: $REPO is not the Git repo."
  exit 1
fi

# Full-source sync. Preserve Git and all local env files.
rsync -av --delete \
  --exclude=".git" \
  --exclude=".env" \
  --exclude=".env.*" \
  --exclude="node_modules" \
  --exclude=".next" \
  --exclude=".DS_Store" \
  "$SOURCE/" "$REPO/"

cd "$REPO"

echo
echo "=== VERIFY REQUIRED MARKERS ==="
grep -n "v1.3.9 · CO-TEACHER ENABLED" "app/(protected)/schedule/page.tsx"
grep -n "Quản lý GV + Co-teacher/TA" "app/(protected)/schedule/page.tsx"
grep -n "export async function updateSessionTeachingTeam" "app/actions.ts"
grep -n 'role: "Assistant"' "app/actions.ts"
grep -n "KHÔNG tạo buổi mới" "app/actions.ts"

echo
echo "=== PACKAGE VERSION ==="
node -p "require('./package.json').version"

echo
echo "=== GIT DIFF SUMMARY ==="
git status --short

git add .
if git diff --cached --quiet; then
  echo "No changes to commit. Repo already contains v1.3.9 source."
else
  git commit -m "Force deploy co-teacher same-session workflow v1.3.9"
fi

git push origin main

echo
echo "✅ PUSHED v1.3.9"
echo "After Vercel Ready, hard refresh and look for:"
echo "v1.3.9 · CO-TEACHER ENABLED"
