#!/usr/bin/env bash
# End-to-end smoke test against a running stack.
#   ./scripts/smoke.sh [API_BASE]
# Proves the core loop and, critically, that the trust boundary holds over
# real HTTP rather than only in unit tests.
set -uo pipefail

API="${1:-http://localhost:4000/api}"
ok=0; fail=0

green() { printf "  \033[32m✓\033[0m %s\n" "$1"; ok=$((ok+1)); }
red()   { printf "  \033[31m✗\033[0m %s\n" "$1"; fail=$((fail+1)); }

# Extract a JSON path. Kept as its own step: nesting command substitution
# inside a quoted argument is what broke the first version of this script.
pluck() { python3 -c "import sys,json
try:
    d=json.load(sys.stdin)
    for k in sys.argv[1:]:
        d = d[int(k)] if k.lstrip('-').isdigit() else d[k]
    print(d if d is not None else '')
except Exception:
    print('')" "$@"; }

post() {
  if [ -n "${3:-}" ]; then
    curl -s -X POST "$1" -H 'Content-Type: application/json' \
         -H "Authorization: Bearer $3" -d "$2"
  else
    curl -s -X POST "$1" -H 'Content-Type: application/json' -d "$2"
  fi
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "▸ Health"
curl -sf "$API/health" >/dev/null && green "API is up" || { red "API unreachable at $API"; exit 1; }

echo "▸ Auth"
# /auth/login is rate limited to 10/min as a brute-force brake. Running this
# script back to back will legitimately trip it, so say so plainly instead of
# reporting a cascade of downstream failures.
c=$(code -X POST "$API/auth/login" -H 'Content-Type: application/json' -d '{"email":"teacher@sessionhub.edu","password":"Password123!"}')
if [ "$c" = "429" ]; then
  printf "  \033[33m!\033[0m rate limit active (429) — wait 60s and re-run\n"
  exit 2
fi

R=$(post "$API/auth/login" '{"email":"teacher@sessionhub.edu","password":"Password123!"}')
T_TEACHER=$(printf '%s' "$R" | pluck accessToken)
[ -n "$T_TEACHER" ] && green "teacher signed in" || red "teacher sign-in failed: $R"

R=$(post "$API/auth/login" '{"email":"ada@sessionhub.edu","password":"Password123!"}')
T_STUDENT=$(printf '%s' "$R" | pluck accessToken)
[ -n "$T_STUDENT" ] && green "student signed in" || red "student sign-in failed: $R"

c=$(code -X POST "$API/auth/login" -H 'Content-Type: application/json' -d '{"email":"ada@sessionhub.edu","password":"wrong"}')
[ "$c" = "401" ] && green "wrong password rejected (401)" || red "wrong password gave $c"

echo "▸ Privilege escalation"
c=$(code -X POST "$API/auth/signup" -H 'Content-Type: application/json' -d '{"email":"evil@x.edu","name":"Evil","password":"Password123!","role":"ADMIN"}')
[ "$c" = "400" ] && green "cannot self-register as ADMIN (400)" || red "ADMIN signup gave $c"

c=$(code "$API/users/stats" -H "Authorization: Bearer $T_STUDENT")
[ "$c" = "403" ] && green "student blocked from admin route (403)" || red "admin route gave $c to a student"

c=$(code "$API/sessions")
[ "$c" = "401" ] && green "unauthenticated request rejected (401)" || red "unauthenticated gave $c"

echo "▸ Session lifecycle"
# Create a fresh session. Reusing the seeded one made the script depend on
# how long ago the database was seeded — the auto-close cron retires a LIVE
# session after 30 minutes without a teacher heartbeat.
CID=$(curl -s "$API/courses" -H "Authorization: Bearer $T_TEACHER" | pluck 0 id)
BODY_SESSION=$(printf '{"courseId":"%s"}' "$CID")
NEWS=$(post "$API/sessions" "$BODY_SESSION" "$T_TEACHER")
SID=$(printf '%s' "$NEWS" | pluck id)
RCODE=$(printf '%s' "$NEWS" | pluck roomCode)
[ -n "$SID" ] && green "teacher started a session (room $RCODE)" || { red "session create failed: $NEWS"; exit 1; }

BODY_JOIN=$(printf '{"roomCode":"%s"}' "$RCODE")
JOIN=$(post "$API/sessions/join" "$BODY_JOIN" "$T_STUDENT")
[ -n "$(printf '%s' "$JOIN" | pluck session id)" ] && green "student joined by room code" || red "join failed: $JOIN"

printf '%s' "$JOIN" | grep -q correctIndex \
  && red "ANSWER KEY LEAKED in the join payload" \
  || green "join payload carries no correctIndex"

# The session was just created, so author a question into it. This keeps the
# script self-contained: it never depends on seed freshness or on state left
# behind by a previous run.
read -r -d '' BODY_Q <<'JSON'
{"questions":[{"prompt":"[smoke] Which normal form removes transitive dependency?","type":"MCQ","options":["1NF","2NF","3NF","BCNF"],"correctIndex":2,"explanation":"3NF removes transitive dependencies on the primary key.","marks":2,"durationSeconds":120}]}
JSON
NEWQ=$(post "$API/sessions/$SID/questions" "$BODY_Q" "$T_TEACHER")
QID=$(printf '%s' "$NEWQ" | pluck 0 id)
[ -n "$QID" ] && green "teacher authored a question" || red "authoring failed: $NEWQ"

printf '%s' "$NEWQ" | grep -q correctIndex \
  && red "ANSWER KEY LEAKED in the authoring response" \
  || green "authoring response carries no correctIndex"

c=$(code "$API/sessions/$SID/questions" -H "Authorization: Bearer $T_STUDENT")
[ "$c" = "403" ] && green "student blocked from authoring endpoint (403)" || red "authoring endpoint gave $c"

echo "▸ Answering"
c=$(code -X POST "$API/questions/$QID/answer" -H 'Content-Type: application/json' -H "Authorization: Bearer $T_STUDENT" -d '{"answerIndex":2}')
[ "$c" = "400" ] && green "cannot answer a PENDING question (400)" || red "pending answer gave $c"

post "$API/questions/$QID/open" '{}' "$T_TEACHER" >/dev/null
green "teacher opened the question"

SNAP=$(curl -s "$API/sessions/$SID/snapshot" -H "Authorization: Bearer $T_STUDENT")
printf '%s' "$SNAP" | grep -q correctIndex \
  && red "ANSWER KEY LEAKED in the snapshot" \
  || green "snapshot carries no correctIndex"
[ -n "$(printf '%s' "$SNAP" | pluck activeQuestion remainingSeconds)" ] \
  && green "snapshot carries remaining time" || red "snapshot missing remainingSeconds"

A=$(post "$API/questions/$QID/answer" '{"answerIndex":2}' "$T_STUDENT")
printf '%s' "$A" | grep -q '"recorded":true' && green "answer accepted" || red "answer rejected: $A"
printf '%s' "$A" | grep -qE 'correctIndex|isCorrect' \
  && red "submit response leaked grading detail" \
  || green "submit response reveals no grading"

c=$(code -X POST "$API/questions/$QID/answer" -H 'Content-Type: application/json' -H "Authorization: Bearer $T_STUDENT" -d '{"answerIndex":0}')
[ "$c" = "409" ] && green "double submission rejected by the DB (409)" || red "second answer gave $c"

c=$(code "$API/questions/$QID/results" -H "Authorization: Bearer $T_STUDENT")
[ "$c" = "403" ] && green "student cannot read results while open (403)" || red "open results gave $c"

echo "▸ Close and reveal"
post "$API/questions/$QID/close" '{}' "$T_TEACHER" >/dev/null
R=$(curl -s "$API/questions/$QID/results" -H "Authorization: Bearer $T_STUDENT")
printf '%s' "$R" | grep -q correctIndex && green "key revealed after close" || red "key missing after close"

c=$(code -X POST "$API/questions/$QID/answer" -H 'Content-Type: application/json' -H "Authorization: Bearer $T_STUDENT" -d '{"answerIndex":1}')
{ [ "$c" = "400" ] || [ "$c" = "409" ]; } && green "cannot answer after close ($c)" || red "post-close answer gave $c"

post "$API/sessions/$SID/close" '{}' "$T_TEACHER" >/dev/null
green "session closed (no orphan left behind)"

echo
printf "  %d passed, %d failed\n" "$ok" "$fail"
[ "$fail" -eq 0 ] || exit 1
