#!/bin/bash
# Double-click in Finder to stop the Aisle Guide demo (macOS). Same as ./stop.sh in Terminal.
cd "$(dirname "$0")" || exit 1
if bash ./stop.sh; then
  echo
  printf 'Press any key to close this window. '
else
  echo
  printf 'The demo could not be stopped: read the message above. Press any key to close this window. '
fi
read -r -n 1 _
echo
