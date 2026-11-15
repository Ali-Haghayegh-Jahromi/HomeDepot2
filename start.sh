#!/bin/bash
# Starts the whole Aisle Guide demo (needs only Docker) and opens it in the browser.
#   ./start.sh               start (the first time also sets everything up: 10-20 minutes)
#   ./start.sh key           enter or change the Gemini API key (or switch to the stand-in AI)
#   ./start.sh setup         put the workflow into n8n again (after changing n8n/build_workflow.py)
#   ./start.sh status        is everything running? (same as ./status.sh)
#   ./start.sh lan           let phones on the same Wi-Fi open the demo (QR code with this computer's address)
#   ./start.sh https         the same over https, so the phone's voice notes work too (self-signed certificate)
#   ./start.sh local         back to this computer only
#   ./start.sh --no-browser  start without opening the browser
# (lan / https / local are saved in .env: HD_LAN and HD_HTTPS.)
# Stop with ./stop.sh. Settings: the .env file (made on the first start).
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$HERE; [ -f "$ROOT/docker/compose.yaml" ] || ROOT=$(dirname "$HERE")
. "$ROOT/docker/lib.sh"
hd_init "$ROOT"
cd "$ROOT" || exit 1

BROWSER=yes; ASK_KEY=no; FORCE=no; NETWORK=
for arg in "$@"; do
  case "$arg" in
    status) hd_check_docker; hd_status; exit $? ;;
    key) ASK_KEY=yes ;;
    setup) FORCE=yes ;;
    lan|https|local) NETWORK=$arg ;;
    --no-browser) BROWSER=no ;;
    -h|--help|help) sed -n '2,12p' "$0"; exit 0 ;;
    *) die "Unknown option: $arg (try ./start.sh --help)" ;;
  esac
done
[ -n "${HD_NO_BROWSER:-}" ] && BROWSER=no

say "${B}Aisle Guide demo${N}"
step "1/6  Checking Docker"
hd_check_docker
good "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null) is running"
mem=$(docker info --format '{{.MemTotal}}' 2>/dev/null)
if [ -n "$mem" ] && [ "$mem" -lt 3500000000 ] 2>/dev/null; then
  say "  Note: Docker may use only $((mem / 1000000000)) GB of memory; 4 GB or more is better."
  is_mac && say "  (Docker Desktop > Settings > Resources > Memory)"
fi

step "2/6  Settings (.env)"
hd_make_env
[ "${ENV_IS_NEW:-}" = yes ] && good "created .env with new demo passwords" || good ".env is ready"
case "$NETWORK" in
  lan) env_set HD_LAN yes; env_set HD_HTTPS no ;;
  https) env_set HD_LAN yes; env_set HD_HTTPS yes ;;
  local) env_set HD_LAN no; env_set HD_HTTPS no ;;
esac
hd_load_env
if [ "$HTTPS" = yes ]; then good "Phones on the same Wi-Fi: on, with https (QR code: $(phone_base))"
elif [ "$LAN" = yes ]; then good "Phones on the same Wi-Fi: on (QR code: $(phone_base))"
else good "This computer only (for phones on the same Wi-Fi: ./start.sh lan)"; fi
# The AI: asked once. A key typed here goes into .env; Enter = use the key already saved in n8n
# (from an earlier setup), else the stand-in AI.
if [ "$ASK_KEY" = yes ] || [ -z "$AI" ]; then
  if [ -t 0 ]; then
    ask_gemini_key
  else
    GEMINI_INPUT=
  fi
  if [ -n "$GEMINI_INPUT" ]; then
    env_set GEMINI_API_KEY "$GEMINI_INPUT"; env_set HD_AI gemini
  elif [ "$ASK_KEY" = yes ]; then
    env_set HD_AI offline   # a key in .env stays there: HD_AI=gemini in .env switches back to it
  else
    AI_AUTO=yes   # decided once n8n runs: a saved key -> gemini, none -> offline
  fi
  GEMINI_INPUT=
  hd_load_env
fi
[ "$AI" = gemini ] && good "AI: Google Gemini" || { [ "$AI" = offline ] && good "AI: stand-in (offline mode)"; }

step "3/6  Getting the programs (the first time downloads about 2 GB and builds the robot: 10-20 minutes)"
for image in $(dc config --images postgres n8n 2>/dev/null); do
  docker image inspect "$image" >/dev/null 2>&1 || MISSING=yes
done
if [ "${MISSING:-}" = yes ]; then
  dc pull postgres n8n || die "Could not download the programs. Check the internet connection and run ./start.sh again."
fi
good "database and n8n"
HD_SOURCE_FP=$(source_fingerprint); export HD_SOURCE_FP
built=$(docker image inspect -f '{{ index .Config.Labels "hd.source" }}' "$IMAGE" 2>/dev/null)
if [ "$built" != "$HD_SOURCE_FP" ]; then
  if [ -z "$built" ]; then say "  building the robot (first time: this is the long part; progress below)"
  else say "  the demo's files changed: updating the robot (usually under a minute)"; fi
  started=$(date +%s)
  if ! dc build robot; then
    if [ -n "$built" ]; then say "  Could not update the robot image (no internet?): using the previous one."
    else die "Could not build the robot. Check the internet connection and run ./start.sh again."; fi
  else
    good "robot built in $(( $(date +%s) - started )) s"
  fi
else
  good "robot (up to date)"
fi

step "4/6  Starting"
mkdir -p "$ROOT/logs"
if [ -z "$(dc ps -q robot 2>/dev/null)" ]; then
  for pair in "$DEMO_PORT:HD_DEMO_PORT" "$N8N_PORT:HD_N8N_PORT" "$RVIZ_PORT:HD_RVIZ_PORT" "$HTTPS_PORT:HD_HTTPS_PORT"; do
    port=${pair%%:*}; name=${pair#*:}
    if port_taken_by_other "$port"; then
      die "Port $port is already used by another program on this computer.
  Close that program (an earlier version of this demo? stop it first), or pick another port:
  in .env set $name=$((port + 1)), then run ./start.sh again."
    fi
  done
fi
services="postgres n8n robot"
if [ "$AI" = offline ]; then services="$services fake-ai"; fi
if ! COMPOSE_PROFILES=offline dc up -d --no-build --pull never $services; then
  die "The demo could not start. See the messages above; ./status.sh shows what is wrong."
fi
if [ "$AI" = gemini ]; then dc_all rm -sf fake-ai >/dev/null 2>&1; fi
printf '  waiting for n8n '
wait_http "http://localhost:$N8N_PORT/healthz" 180 && { echo; good "n8n is up"; } || die "n8n did not start. Run ./status.sh (details: ./tools.sh logs n8n)"

step "5/6  Setting up n8n"
n8n_owner
if [ "${AI_AUTO:-}" = yes ]; then
  if [ "$(gemini_key_state)" = real ]; then env_set HD_AI gemini; good "AI: Google Gemini (using the key already saved in n8n)"
  else env_set HD_AI offline; good "AI: stand-in (offline mode). Add a Gemini key any time: ./start.sh key"; fi
  hd_load_env
  if [ "$AI" = offline ]; then COMPOSE_PROFILES=offline dc up -d --no-build --pull never fake-ai >/dev/null 2>&1; fi
fi
n8n_setup || die "Setting up n8n failed. Try ./start.sh setup; details: ./tools.sh logs n8n"

step "6/6  Waiting for the robot (navigation needs up to a minute)"
printf '  '
if wait_http "http://localhost:$DEMO_PORT/health" 300 '"nav2_ready":true'; then echo; good "robot is ready"
else echo; bad "the robot is not ready yet"; fix "It may just be slow: check with ./status.sh in a minute."; fi
if [ "$RVIZ" = yes ]; then
  wait_http "http://localhost:$RVIZ_PORT/vnc.html" 30 >/dev/null && good "3D view (RViz) is ready"
fi

STAGE="http://localhost:$DEMO_PORT/demo/"
say ""
say "${G}${B}The demo is running.${N}"
say "  Demo stage (kiosk + phone + store map):  ${B}$STAGE${N}"
say "  Studio view, for recording (1920x1080): ${STAGE}?view=studio"
[ "$RVIZ" = yes ] && say "  Robot view (RViz):                       http://localhost:$RVIZ_PORT"
say "  n8n, to show the workflow:               http://localhost:$N8N_PORT"
if [ "${N8N_LOGIN_OK:-no}" = yes ]; then
  say "      login: $(env_get N8N_OWNER_EMAIL)   password: $(env_get N8N_OWNER_PASSWORD)"
else
  say "      login: the n8n account created earlier on this computer"
fi
if [ "$LAN" = yes ]; then
  say "  Phones on the same Wi-Fi scan the QR code: $(phone_base)/demo/phone.html?s=..."
  if [ "$HTTPS" = yes ]; then
    say "      The first time, each phone warns that the connection is not private (a self-signed"
    say "      certificate): tap Show Details / Advanced, then visit the website / Proceed. See QUICKSTART.md."
  fi
  firewall_check
fi
if [ "$AI" = offline ]; then say "  AI: the stand-in (no key). For the real AI: ./start.sh key"; else say "  AI: Google Gemini"; fi
say "Stop it with ./stop.sh (or double-click 'Stop Demo.command' on a Mac). Problems? ./status.sh"
[ "$BROWSER" = yes ] && open_browser "$STAGE"
exit 0
