#!/bin/bash
# Double-click in Finder to start the Aisle Guide demo (macOS). Same as ./start.sh in Terminal.
# The first time, macOS may refuse to open it: see QUICKSTART.md ("The Mac says it cannot open the file").
cd "$(dirname "$0")" || exit 1
# "bash ./start.sh": works even if the file lost its "may be run" mark (some unzip programs drop it)
if bash ./start.sh; then
  echo
  printf 'The demo is running. You can close this window; the demo keeps running. Press any key to close it. '
else
  echo
  printf 'The demo did not start: read the message above. Press any key to close this window. '
fi
read -r -n 1 _
echo
