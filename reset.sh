#!/bin/bash
# Back to a clean demo: deletes all visits (sessions, requests, messages, the event log), the log
# files and n8n's list of past runs of the demo's workflows (so its Executions list shows only the
# next take), and sends the robot back to its dock. Keeps the store items, the API key, the n8n
# login and the workflows.
#   ./reset.sh               asks first (answer y or yes)
#   ./reset.sh -y            no question
#   ./reset.sh --everything  start over from scratch: deletes ALL the demo's data on this computer (the
#                            database, the n8n login and its saved keys, the https certificate) and its
#                            containers; the next ./start.sh sets everything up again. Always asks: you
#                            type the word delete. The .env file in this folder and the robot image stay.
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$HERE; [ -f "$ROOT/docker/compose.yaml" ] || ROOT=$(dirname "$HERE")
. "$ROOT/docker/lib.sh"
hd_init "$ROOT"

if [ "${1:-}" = --everything ]; then
  hd_check_docker
  # works without a .env here (for example right after start.sh said this computer has data from another copy)
  PROJECT=$(env_get HD_PROJECT); PROJECT=${PROJECT:-homedepot}
  label="label=com.docker.compose.project=$PROJECT"
  containers=$(docker ps -aq --filter "$label")
  volumes=$(docker volume ls -q --filter "$label")
  for v in hd_pgdata hd_n8ndata hd_tls; do   # volumes made by hand or by an old setup may have no label
    docker volume inspect "${PROJECT}_$v" >/dev/null 2>&1 && case " $(echo $volumes) " in
      *" ${PROJECT}_$v "*) ;; *) volumes="$volumes ${PROJECT}_$v" ;; esac
  done
  networks=$(docker network ls -q --filter "$label")
  if [ -z "$containers$volumes$networks" ]; then say "There is no demo data on this computer: nothing to delete."; exit 0; fi
  say "${B}This deletes ALL of the demo's data on this computer${N} (Docker project '$PROJECT'):"
  say "  - every visit and log, the store database, the n8n login and the API keys saved in n8n,"
  say "    the phones' https certificate; it cannot be undone"
  say "  - the demo's containers (the demo stops)"
  say "It keeps: the demo folders and their .env files, and the downloaded programs (so the next start is quick)."
  [ -t 0 ] || die "Run ./reset.sh --everything in a terminal: it asks you to confirm."
  printf 'Type the word delete to continue (anything else cancels): '
  read -r answer
  case "$answer" in delete|DELETE|Delete) ;; *) say "Nothing changed."; exit 0 ;; esac
  for id in $containers; do docker rm -f "$id" >/dev/null 2>&1; done
  for v in $volumes; do docker volume rm "$v" >/dev/null || bad "Could not delete $v"; done
  for id in $networks; do docker network rm "$id" >/dev/null 2>&1; done
  good "Deleted. Start the demo again with ./start.sh (it sets everything up anew)."
  if [ -f "$ENV_FILE" ] && [ -n "$(env_get N8N_OWNER_PASSWORD)" ]; then
    say "  The new n8n login will be the one in this folder's .env."
  fi
  exit 0
fi

[ -f "$ENV_FILE" ] || die "The demo has not been set up here yet: run ./start.sh"
hd_check_docker
[ -n "$(dc ps -q postgres 2>/dev/null)" ] || die "The demo is not running: start it with ./start.sh, then reset."

if [ "${1:-}" != -y ]; then
  say "This deletes every visit, all logs and n8n's past runs of the demo (the store items, API key and n8n login stay)."
  printf 'Continue? Type y (or yes) and press Enter: '
  read -r answer
  case "$answer" in y|Y|yes|Yes|YES) ;; *) say "Nothing changed."; exit 0 ;; esac
fi

say "Deleting visits..."
dc exec -T postgres sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "TRUNCATE messages, requests, sessions, event_log RESTART IDENTITY CASCADE"' \
  || die "Could not delete the visits (see the message above)."
say "Deleting n8n's past runs of the demo..."
n8n_clear_executions || info "Could not clear n8n's list of past runs (n8n not logged in?): the visits are deleted anyway."
say "Deleting logs and restarting the robot at its dock..."
dc stop robot >/dev/null 2>&1
dc run --rm --no-deps -T --entrypoint sh robot -c 'rm -f /hd/logs/*.log /hd/logs/*.jsonl /hd/logs/*.jsonl.1' >/dev/null 2>&1
dc start robot >/dev/null 2>&1
printf '  '
if wait_http "http://localhost:$DEMO_PORT/health" 300 '"nav2_ready":true'; then echo; good "Clean demo ready: http://localhost:$DEMO_PORT/demo/"
else echo; bad "The robot is still starting"; fix "Check with ./status.sh in a minute."; fi
