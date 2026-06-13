#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000/api}"
STUDENT_ID="${STUDENT_ID:-stu_001}"

printf '\n[1/7] health\n'
curl -sS "$BASE_URL/students/business/health" | python -m json.tool

printf '\n[2/7] create persisted exploration session\n'
EXPLORE_RESPONSE=$(curl -sS -X POST "$BASE_URL/students/$STUDENT_ID/exploration-sessions" \
  -H 'Content-Type: application/json' \
  -d '{
    "major": "计算机科学与技术",
    "grade": "大一",
    "education_level": "本科",
    "foundation_level": "beginner",
    "interests": ["AI 应用", "Web 开发"],
    "weekly_hours": 6
  }')
printf '%s' "$EXPLORE_RESPONSE" | python -m json.tool
SESSION_ID=$(printf '%s' "$EXPLORE_RESPONSE" | python -c 'import json,sys; print(json.load(sys.stdin)["session"]["session_id"])')

printf '\n[3/7] read profile\n'
curl -sS "$BASE_URL/students/$STUDENT_ID/profile" | python -m json.tool

printf '\n[4/7] read profile history\n'
curl -sS "$BASE_URL/students/$STUDENT_ID/profile/history" | python -m json.tool

printf '\n[5/7] read persisted exploration session: %s\n' "$SESSION_ID"
curl -sS "$BASE_URL/students/$STUDENT_ID/exploration-sessions/$SESSION_ID" | python -m json.tool

printf '\n[6/7] read learning path\n'
PATH_RESPONSE=$(curl -sS "$BASE_URL/students/$STUDENT_ID/learning-path")
printf '%s' "$PATH_RESPONSE" | python -m json.tool
STEP_ID=$(printf '%s' "$PATH_RESPONSE" | python -c 'import json,sys; data=json.load(sys.stdin); print(data["steps"][0]["step_id"] if data.get("steps") else "")')

if [[ -n "$STEP_ID" ]]; then
  printf '\n[6.5/7] patch first learning path step: %s\n' "$STEP_ID"
  curl -sS -X PATCH "$BASE_URL/students/$STUDENT_ID/learning-path/steps/$STEP_ID" \
    -H 'Content-Type: application/json' \
    -d '{
      "status": "in_progress",
      "evidence": "smoke test marked this step as in progress",
      "mastery_after": 30,
      "updated_reason": "smoke test path update"
    }' | python -m json.tool
fi

printf '\n[7/7] create student growth report\n'
REPORT_RESPONSE=$(curl -sS -X POST "$BASE_URL/students/$STUDENT_ID/reports" \
  -H 'Content-Type: application/json' \
  -d '{"student_id":"'"$STUDENT_ID"'","report_type":"student_growth"}')
printf '%s' "$REPORT_RESPONSE" | python -m json.tool
REPORT_ID=$(printf '%s' "$REPORT_RESPONSE" | python -c 'import json,sys; print(json.load(sys.stdin)["id"])')

printf '\n[7.5/7] read report: %s\n' "$REPORT_ID"
curl -sS "$BASE_URL/students/$STUDENT_ID/reports/$REPORT_ID" | python -m json.tool

printf '\nstudent business API smoke test completed.\n'
