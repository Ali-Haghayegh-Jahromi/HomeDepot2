#!/bin/bash
# Puts the workflow (rebuilt from n8n/build_workflow.py) and its credentials into the demo's n8n
# and switches it on. ./start.sh does this by itself whenever something changed; run this to force it.
# Python is not needed on this computer: the workflow is built inside the robot image.
#   ./n8n/setup.sh            (same as ./start.sh setup --no-browser)
# The AI (real Gemini or the stand-in) is chosen with ./start.sh key, not with a file name any more.
HERE=$(cd "$(dirname "$0")" && pwd)
if [ -n "${1:-}" ]; then
  echo "Note: ./n8n/setup.sh no longer takes a file name. For the stand-in AI run ./start.sh key and press Enter."
fi
exec "$HERE/../start.sh" setup --no-browser
