#!/bin/bash
# Double-click in Finder to start the Aisle Guide demo (macOS). Same as ./start.sh in Terminal.
# The first time, macOS may refuse to open it: see QUICKSTART.md ("The Mac says it cannot open the file").
cd "$(dirname "$0")" || exit 1
./start.sh
echo
printf 'You can close this window; the demo keeps running. Press Enter to close it. '
read -r _
