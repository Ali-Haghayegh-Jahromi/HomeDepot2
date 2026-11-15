#!/bin/bash
# Is the Aisle Guide demo running? Shows each part in plain words, and what to do if one is not OK.
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$HERE; [ -f "$ROOT/docker/compose.yaml" ] || ROOT=$(dirname "$HERE")
. "$ROOT/docker/lib.sh"
hd_init "$ROOT"
[ -f "$ENV_FILE" ] || { say "The demo has not been set up here yet: run ./start.sh"; exit 1; }
hd_status
