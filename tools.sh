#!/bin/bash
# Developer tools for the running demo. Python runs inside the robot container, so the
# computer itself needs only Docker.
#   ./tools.sh test ["what the customer says"]   play a whole visit and check every step (tools/full_flow_test.py)
#   ./tools.sh check [options]                   read all logs, one time line per visit, find bugs (tools/log_check.py;
#                                                options: --session ID, --last N, --checks-only, --json, --follow, ...)
#   ./tools.sh logs [robot|n8n|postgres|fake-ai] follow a part's output (Ctrl+C to stop)
#   ./tools.sh psql                              a database prompt
#   ./tools.sh shell                             a shell in the robot container, ROS ready (ros2 topic list, ...)
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$HERE; [ -f "$ROOT/docker/compose.yaml" ] || ROOT=$(dirname "$HERE")
. "$ROOT/docker/lib.sh"
hd_init "$ROOT"
[ -f "$ENV_FILE" ] || die "The demo has not been set up here yet: run ./start.sh"
TTY=; [ -t 0 ] && [ -t 1 ] || TTY=-T

cmd=${1:-}; [ $# -gt 0 ] && shift
case "$cmd" in
  test)
    dc exec $TTY robot python3 /opt/hd/hdtool.py flow "$@" ;;
  check)
    PGHOST=postgres PGUSER=$(env_get POSTGRES_USER) PGDATABASE=$(env_get POSTGRES_DB) PGPASSWORD=$(env_get POSTGRES_PASSWORD) \
      dc exec $TTY -e PGHOST -e PGUSER -e PGDATABASE -e PGPASSWORD robot python3 /opt/hd/hdtool.py check "$@" ;;
  logs)
    dc_all logs -f --tail 100 "$@" ;;
  psql)
    dc exec $TTY postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' ;;
  shell)
    dc exec $TTY robot bash -c 'source /opt/ros/humble/setup.bash; export ROS_DOMAIN_ID=42 ROS_LOCALHOST_ONLY=1; exec bash' ;;
  *)
    awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0" ;;
esac
