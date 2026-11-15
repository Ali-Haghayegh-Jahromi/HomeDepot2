#!/bin/bash
# Back to a clean demo: deletes all visits (sessions, requests, messages, the event log) and the
# log files, and sends the robot back to its dock. Keeps the store items, the API key, the n8n login
# and the workflow. (n8n's own list of past executions is kept too.)
#   ./reset.sh        asks first
#   ./reset.sh -y     no question
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$HERE; [ -f "$ROOT/docker/compose.yaml" ] || ROOT=$(dirname "$HERE")
. "$ROOT/docker/lib.sh"
hd_init "$ROOT"
[ -f "$ENV_FILE" ] || die "The demo has not been set up here yet: run ./start.sh"
hd_check_docker
[ -n "$(dc ps -q postgres 2>/dev/null)" ] || die "The demo is not running: start it with ./start.sh, then reset."

if [ "${1:-}" != -y ]; then
  say "This deletes every visit and all logs of the demo (the store items, API key and n8n login stay)."
  printf 'Type yes to continue: '
  read -r answer
  [ "$answer" = yes ] || { say "Nothing changed."; exit 0; }
fi

say "Deleting visits..."
dc exec -T postgres sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "TRUNCATE messages, requests, sessions, event_log RESTART IDENTITY CASCADE"' \
  || die "Could not delete the visits (see the message above)."
say "Deleting logs and restarting the robot at its dock..."
dc stop robot >/dev/null 2>&1
dc run --rm --no-deps -T --entrypoint sh robot -c 'rm -f /hd/logs/*.log /hd/logs/*.jsonl /hd/logs/*.jsonl.1' >/dev/null 2>&1
dc start robot >/dev/null 2>&1
printf '  '
if wait_http "http://localhost:$DEMO_PORT/health" 300 '"nav2_ready":true'; then echo; good "Clean demo ready: http://localhost:$DEMO_PORT/demo/"
else echo; bad "The robot is still starting"; fix "Check with ./status.sh in a minute."; fi
