#!/bin/bash
# Double-click in Finder to stop the Aisle Guide demo (macOS). Same as ./stop.sh in Terminal.
cd "$(dirname "$0")" || exit 1
./stop.sh
echo
printf 'Press Enter to close this window. '
read -r _
