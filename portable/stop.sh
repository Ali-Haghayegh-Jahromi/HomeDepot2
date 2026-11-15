#!/bin/bash
# Stops the Aisle Guide demo. Everything is kept (visits, n8n login, API key);
# ./start.sh starts it again in about a minute.
#   ./stop.sh          stop
#   ./stop.sh remove   also remove the containers and their network (data is still kept)
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$HERE; [ -f "$ROOT/docker/compose.yaml" ] || ROOT=$(dirname "$HERE")
. "$ROOT/docker/lib.sh"
hd_init "$ROOT"
[ -f "$ENV_FILE" ] || { say "The demo has never been started here (no .env): nothing to stop."; exit 0; }
docker info >/dev/null 2>&1 || { say "Docker is not running, so the demo is not running either."; exit 0; }
say "Stopping the demo..."
if [ "${1:-}" = remove ]; then dc_all down; else dc_all stop; fi
say "Stopped. Start it again with ./start.sh"
