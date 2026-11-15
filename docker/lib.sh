# shellcheck shell=bash
# Shared code of start.sh, stop.sh, status.sh, reset.sh and tools.sh.
# Written for macOS's bash 3.2 and BSD tools as well as Linux: no GNU-only flags,
# no `sed -i`, no `readlink -f`, no `timeout`, no associative arrays.
#
# Settings come from .env (made from docker/env.template on the first start).
# For a second, separate copy of the stack (testing), point HD_ENV_FILE at another file
# that sets HD_PROJECT, HD_NAME_PREFIX, other ports and HD_LOGS_DIR.

hd_init() {
  ROOT=$1
  ENV_FILE=${HD_ENV_FILE:-$ROOT/.env}
  OS=$(uname -s)
  # Double-clicked .command files may not load the shell profile: add Docker Desktop's usual places
  if [ "$OS" = Darwin ]; then
    PATH=$PATH:/usr/local/bin:/opt/homebrew/bin:$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin
    export PATH
  fi
  if [ -t 1 ]; then B=$(printf '\033[1m'); G=$(printf '\033[32m'); Y=$(printf '\033[33m'); R=$(printf '\033[31m'); N=$(printf '\033[0m')
  else B=; G=; Y=; R=; N=; fi
  [ -f "$ENV_FILE" ] && hd_load_env
}

say()  { printf '%s\n' "$*"; }
step() { printf '\n%s%s%s\n' "$B" "$*" "$N"; }
good() { printf '  %s[ OK ]%s %s\n' "$G" "$N" "$*"; }
note() { printf '  %s[WAIT]%s %s\n' "$Y" "$N" "$*"; }
info() { printf '  [INFO] %s\n' "$*"; }
bad()  { printf '  %s[FAIL]%s %s\n' "$R" "$N" "$*"; }
fix()  { printf '         %s\n' "$*"; }
die()  { printf '\n%s%s%s\n' "$R" "$*" "$N" >&2; exit 1; }
is_mac() { [ "$OS" = Darwin ]; }

# ------------------------------------------------------------------ .env
env_get() {   # the value of KEY in .env ('' if missing); ignores " # comments" and quotes
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 \
    | sed -e 's/[[:space:]][[:space:]]*#.*$//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
          -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

env_set() {   # sets KEY=VALUE in .env (replaces the line, or adds it at the end)
  HD_K=$1 HD_V=$2 awk 'BEGIN { k = ENVIRON["HD_K"]; v = ENVIRON["HD_V"] }
    index($0, k "=") == 1 { if (!done) print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }' "$ENV_FILE" > "$ENV_FILE.tmp" \
    && cat "$ENV_FILE.tmp" > "$ENV_FILE" && rm -f "$ENV_FILE.tmp"
}

env_default() {   # sets KEY to VALUE only if it is missing or empty
  [ -n "$(env_get "$1")" ] || env_set "$1" "$2"
}

random_text() {   # random letters and digits
  dd if=/dev/urandom bs=512 count=1 2>/dev/null | LC_ALL=C tr -dc 'A-Za-z0-9' | cut -c "1-$1"
}

detect_tz() {
  tz=
  [ -f /etc/timezone ] && tz=$(head -n 1 /etc/timezone)
  [ -z "$tz" ] && [ -L /etc/localtime ] && tz=$(readlink /etc/localtime | sed 's|.*zoneinfo/||')
  printf '%s\n' "${tz:-UTC}"
}

how_to_open_env() {   # how to open .env in a text editor, in plain words
  say "  Open the settings file .env in this folder (it is hidden; this opens it anyway):"
  if is_mac; then say "    open -e .env"
  else say "    gedit .env        (or: nano .env, then Ctrl+O, Enter, Ctrl+X to save and close)"; fi
}

hd_make_env() {   # creates .env from the template, or adds what an older .env is missing
  if [ ! -f "$ENV_FILE" ]; then
    cp "$ROOT/docker/env.template" "$ENV_FILE"
    ENV_IS_NEW=yes
  fi
  chmod 600 "$ENV_FILE" 2>/dev/null
  hd_load_env
  # A .env without database passwords while this computer already has the demo's database (from another copy
  # of the folder, or an older version): new random passwords would not match that database, and every visit
  # would fail. Stop and say what to do instead.
  if [ -z "$(env_get POSTGRES_PASSWORD)" ] && docker volume inspect "${PROJECT}_hd_pgdata" >/dev/null 2>&1; then
    [ "${ENV_IS_NEW:-}" = yes ] && rm -f "$ENV_FILE"
    if is_mac; then hidden="in Finder press Command+Shift+. (dot) to show hidden files"
    else hidden="in the Files app press Ctrl+H to show hidden files"; fi
    die "This computer already has the demo's data from another copy of the demo folder
(an older version, or the same demo downloaded twice). This folder has no settings
file for that data yet, so the demo would not be able to open its own database.

Do one of these:
  1. Keep the old data (the n8n login, the API key, earlier visits): copy the file .env
     from the folder you started the demo from before into this folder, then run
     ./start.sh again. .env is a hidden file: $hidden.
     Or in a terminal:   cp /path/to/the/old/folder/.env .
  2. Start over from scratch (deletes the old data: visits, the n8n login, saved keys):
       ./reset.sh --everything
     then run ./start.sh again."
  fi
  # the keys an older .env (from before this setup) does not have
  for key in HD_LAN HD_HTTPS HD_PUBLIC_HOST HD_RVIZ HD_RVIZ_VIEW HD_DEMO_PORT HD_N8N_PORT HD_RVIZ_PORT HD_HTTPS_PORT N8N_OWNER_EMAIL N8N_OWNER_PASSWORD; do
    grep -q "^$key=" "$ENV_FILE" || NEED_UPGRADE=yes
  done
  if [ "${NEED_UPGRADE:-}" = yes ]; then
    printf '\n# --- added by start.sh (see docker/env.template for what each one means) ---\n' >> "$ENV_FILE"
  fi
  env_default HD_LAN no
  env_default HD_HTTPS no
  grep -q '^HD_PUBLIC_HOST=' "$ENV_FILE" || env_set HD_PUBLIC_HOST ''
  env_default HD_RVIZ yes
  env_default HD_RVIZ_VIEW top
  env_default HD_DEMO_PORT 8000
  env_default HD_N8N_PORT 5678
  env_default HD_RVIZ_PORT 6080
  env_default HD_HTTPS_PORT 8443
  env_default N8N_OWNER_EMAIL demo@aisleguide.local
  env_default N8N_OWNER_PASSWORD "Demo$(random_text 12)7"
  env_default POSTGRES_USER hd_app
  env_default POSTGRES_PASSWORD "$(random_text 24)"
  env_default POSTGRES_DB homedepot
  env_default HD_LLM_READER_PASSWORD "$(random_text 24)"
  env_default TZ "$(detect_tz)"
  grep -q '^ANTHROPIC_API_KEY=' "$ENV_FILE" || env_set ANTHROPIC_API_KEY ''
  hd_load_env
}

hd_load_env() {
  PROJECT=$(env_get HD_PROJECT); PROJECT=${PROJECT:-homedepot}
  DEMO_PORT=$(env_get HD_DEMO_PORT); DEMO_PORT=${DEMO_PORT:-8000}
  N8N_PORT=$(env_get HD_N8N_PORT); N8N_PORT=${N8N_PORT:-5678}
  RVIZ_PORT=$(env_get HD_RVIZ_PORT); RVIZ_PORT=${RVIZ_PORT:-6080}
  HTTPS_PORT=$(env_get HD_HTTPS_PORT); HTTPS_PORT=${HTTPS_PORT:-8443}
  IMAGE=$(env_get HD_IMAGE); IMAGE=${IMAGE:-hd-demo-robot:latest}
  AI=$(env_get HD_AI)
  case "$(env_get HD_RVIZ)" in no|false|0|off) RVIZ=no ;; *) RVIZ=yes ;; esac
  [ "$(env_get HD_MODE)" = mock ] && RVIZ=no   # no simulation, so nothing for RViz to show
  case "$(env_get HD_LAN)" in yes|true|1|on) LAN=yes ;; *) LAN=no ;; esac
  case "$(env_get HD_HTTPS)" in yes|true|1|on) HTTPS=yes; LAN=yes ;; *) HTTPS=no ;; esac   # https is for phones
  case "$(env_get HD_DEV)${HD_DEV:-}" in *yes*|*1*) DEV=yes ;; *) DEV=no ;; esac
  if [ "$LAN" = yes ]; then
    HD_DEMO_BIND=0.0.0.0
    HD_PUBLIC_ADDR=$(lan_address)
  else
    HD_DEMO_BIND=127.0.0.1
    HD_PUBLIC_ADDR=localhost
  fi
  # the compose file reads these (not .env): the port binding, the address in the certificate,
  # and the phone link's start (the stage uses it for the QR code after a reload)
  if [ "$LAN" = yes ]; then HD_PHONE_BASE=$(phone_base); else HD_PHONE_BASE=; fi
  export HD_DEMO_BIND HD_PUBLIC_ADDR HD_PHONE_BASE
}

# The address of the demo pages for a phone: https://<address>:8443 with HD_HTTPS=yes,
# http://<address>:8000 with HD_LAN=yes, else http://localhost:8000 (this computer only).
phone_base() {
  if [ "$HTTPS" = yes ]; then printf 'https://%s:%s\n' "$HD_PUBLIC_ADDR" "$HTTPS_PORT"
  else printf 'http://%s:%s\n' "$HD_PUBLIC_ADDR" "$DEMO_PORT"; fi
}

# ------------------------------------------------------------------ Docker
dc() {   # docker compose for this project (COMPOSE_PROFILES decides whether fake-ai is included)
  # HD_COMPOSE_EXTRA: one more compose file on top (for testing), e.g. a patched file mounted in
  if [ -n "${HD_COMPOSE_EXTRA:-}" ]; then set -- -f "$HD_COMPOSE_EXTRA" "$@"; fi
  if [ "$DEV" = yes ]; then set -- -f "$ROOT/docker/compose.dev.yaml" "$@"; fi
  docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f "$ROOT/docker/compose.yaml" "$@"
}
dc_all() { COMPOSE_PROFILES=offline dc "$@"; }   # every service, the stand-in AI too

hd_check_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    if is_mac; then
      die "Docker Desktop is not installed.
  1. Download it from https://www.docker.com/products/docker-desktop/
     (pick 'Apple Silicon' or 'Intel chip': Apple menu > About This Mac shows which one you have).
  2. Open Docker from Applications once and accept its terms.
  3. Start the demo again."
    fi
    die "Docker is not installed. Install it with these commands (they ask for your password):
  curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh
  sudo usermod -aG docker \$USER
then log out and back in (or restart the computer), and start the demo again.
(More: QUICKSTART.md, section 1.)"
  fi
  if ! docker info >/dev/null 2>&1; then
    if is_mac; then
      if [ -d /Applications/Docker.app ] || [ -d "$HOME/Applications/Docker.app" ]; then
        printf 'Docker Desktop is not running yet: starting it '
        open -a Docker >/dev/null 2>&1
        i=0
        while ! docker info >/dev/null 2>&1; do
          i=$((i + 1)); [ $i -gt 90 ] && break
          printf '.'; sleep 2
        done
        echo
      fi
      docker info >/dev/null 2>&1 || die "Docker Desktop is not running.
  Open Docker from Applications, wait until the whale icon in the menu bar stops moving,
  then start the demo again."
    else
      if docker info 2>&1 | grep -qi 'permission denied'; then
        die "This user may not use Docker yet. Run:
  sudo usermod -aG docker \$USER
then log out and back in (or restart the computer), and start the demo again."
      fi
      die "Docker is installed but not running. Start it with:
  sudo systemctl start docker
and start the demo again."
    fi
  fi
  docker compose version >/dev/null 2>&1 || die "Docker Compose is missing.
  Ubuntu: sudo apt install docker-compose-plugin        Mac: update Docker Desktop."
}

hd_check_tools() {   # the few programs the scripts need besides Docker (a Mac has them all)
  missing=
  for tool in curl awk sed grep cksum; do
    command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"
  done
  [ -z "$missing" ] && return 0
  if is_mac; then
    die "This computer is missing a program the demo needs:$missing
  Install Apple's command line tools (run: xcode-select --install), then start the demo again."
  fi
  die "This computer is missing a program the demo needs:$missing
  Install it (it asks for your password):
    sudo apt install$missing
  then start the demo again."
}

port_taken_by_other() {   # true if something that is not this demo listens on the port
  # ports published by this demo's own containers are fine (they are the demo)
  if docker ps --filter "label=com.docker.compose.project=$PROJECT" --format '{{.Ports}}' 2>/dev/null \
       | tr ',' '\n' | grep -q ":$1->"; then
    return 1
  fi
  curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$1/" 2>/dev/null
  case $? in
    7) return 1 ;;      # nothing listens there: free
    127) return 1 ;;    # no curl (hd_check_tools says so first): cannot tell, so do not claim it is busy
    *) return 0 ;;
  esac
}

hd_check_ports() {   # lists every port of the demo that another program uses, with the lines for .env; stops then
  busy=; lines=; taken=" $DEMO_PORT $N8N_PORT $RVIZ_PORT $HTTPS_PORT "
  for spec in "$DEMO_PORT:HD_DEMO_PORT:the demo pages" "$N8N_PORT:HD_N8N_PORT:n8n" \
              "$RVIZ_PORT:HD_RVIZ_PORT:the robot view, RViz" "$HTTPS_PORT:HD_HTTPS_PORT:https for phones"; do
    port=${spec%%:*}; rest=${spec#*:}; name=${rest%%:*}; what=${rest#*:}
    port_taken_by_other "$port" || continue
    # suggest the next port that is free and not used by another part of the demo
    new=$((port + 1))
    while [ $new -lt $((port + 100)) ]; do
      case "$taken" in *" $new "*) ;; *) port_taken_by_other "$new" || break ;; esac
      new=$((new + 1))
    done
    taken="$taken$new "
    busy="$busy
    $port  ($what)"
    lines="$lines
    $name=$new"
  done
  [ -z "$busy" ] && return 0
  say ""
  say "${R}These ports are already used by another program on this computer:${N}$busy"
  say ""
  say "Either close that program (an older copy of this demo? stop it in its own folder with ./stop.sh),"
  say "or let the demo use other ports:"
  how_to_open_env
  say "  and change these lines (or add them at the end of the file):$lines"
  say "  Save the file, then run ./start.sh again."
  case "$lines" in *HD_DEMO_PORT=*)
    say "  (The demo's address then changes too: ./start.sh prints it when it is ready.)" ;;
  esac
  exit 1
}

source_fingerprint() {   # changes whenever a file that goes into the robot image changes
  ( cd "$ROOT" && find docker/robot.Dockerfile docker/robot store robot/sim robot/robot_service tools \
      n8n/test/fake_gemini.py demo ui \
      \( -name node_modules -o -name dist -o -name __pycache__ -o -name '.*' \) -prune -o -type f -exec cksum {} + 2>/dev/null \
    | LC_ALL=C sort | cksum | awk '{print $1}' )
}

# ------------------------------------------------------------------ network address for phones
lan_address() {
  host=$(env_get HD_PUBLIC_HOST)
  if [ -n "$host" ]; then printf '%s\n' "$host"; return; fi
  if is_mac; then
    iface=$(route -n get default 2>/dev/null | awk '/interface:/ {print $2}')
    for i in $iface en0 en1; do
      host=$(ipconfig getifaddr "$i" 2>/dev/null) && [ -n "$host" ] && break
    done
  else
    host=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") {print $(i + 1); exit}}')
    [ -n "$host" ] || host=$(hostname -I 2>/dev/null | awk '{print $1}')
  fi
  printf '%s\n' "${host:-localhost}"
}

# ------------------------------------------------------------------ n8n
json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

wait_http() {   # wait_http URL SECONDS [grep pattern]: true once the URL answers (and matches)
  i=0
  while [ $i -lt "$2" ]; do
    if [ -n "${3:-}" ]; then
      curl -s --max-time 3 "$1" 2>/dev/null | grep -q "$3" && return 0
    else
      curl -sf -o /dev/null --max-time 3 "$1" 2>/dev/null && return 0
    fi
    i=$((i + 2)); printf '.'; sleep 2
  done
  return 1
}

n8n_owner() {   # creates the n8n owner account on a new n8n; sets N8N_LOGIN_OK yes|no
  base=http://localhost:$N8N_PORT
  email=$(env_get N8N_OWNER_EMAIL); pw=$(env_get N8N_OWNER_PASSWORD)
  body=$(printf '{"email":"%s","firstName":"Demo","lastName":"Presenter","password":"%s"}' "$(json_escape "$email")" "$(json_escape "$pw")")
  # n8n answers /healthz before its REST API is ready (meanwhile it answers "starting up"): wait for the settings
  tries=0
  while [ $tries -lt 60 ] && ! curl -s --max-time 3 "$base/rest/settings" | grep -q '"showSetupOnFirstLoad"'; do
    tries=$((tries + 1)); sleep 1
  done
  tries=0
  while [ $tries -lt 15 ] && curl -s "$base/rest/settings" | grep -q '"showSetupOnFirstLoad":true'; do
    tries=$((tries + 1))
    code=$(printf '%s' "$body" | curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
      --data-binary @- "$base/rest/owner/setup")
    if [ "$code" = 200 ]; then good "n8n login created: $email"; break; fi
    sleep 2   # n8n answers /healthz a moment before it accepts the owner setup
  done
  login=$(printf '{"emailOrLdapLoginId":"%s","password":"%s"}' "$(json_escape "$email")" "$(json_escape "$pw")")
  # the login counts only if n8n answers with the account (a "starting up" page also answers 200)
  if printf '%s' "$login" | curl -s -X POST -H 'Content-Type: application/json' --data-binary @- "$base/rest/login" \
       | grep -qi "\"email\":\"$(json_escape "$email")\""; then N8N_LOGIN_OK=yes; else N8N_LOGIN_OK=no; fi
  if [ "$N8N_LOGIN_OK" = no ] && curl -s "$base/rest/settings" | grep -q '"showSetupOnFirstLoad":true'; then
    bad "n8n has no login yet: open http://localhost:$N8N_PORT and create one (or run ./start.sh again)"
  fi
}

n8n_clear_executions() {   # deletes the past runs of the demo's four workflows (n8n's Executions list); true if all went
  base=http://localhost:$N8N_PORT
  jar=$(mktemp 2>/dev/null) || jar="${TMPDIR:-/tmp}/hd_n8n_cookie.$$"
  email=$(env_get N8N_OWNER_EMAIL); pw=$(env_get N8N_OWNER_PASSWORD)
  login=$(printf '{"emailOrLdapLoginId":"%s","password":"%s"}' "$(json_escape "$email")" "$(json_escape "$pw")")
  code=$(printf '%s' "$login" | curl -s -c "$jar" -o /dev/null -w '%{http_code}' --max-time 20 -X POST \
    -H 'Content-Type: application/json' --data-binary @- "$base/rest/login")
  if [ "$code" != 200 ]; then rm -f "$jar"; return 1; fi
  before=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
  ok=yes
  for wf in hdGuideRobot00001 hdAskAiModel0001 hdPhoneStatus001 hdIdleCheck00001; do
    code=$(curl -s -b "$jar" -o /dev/null -w '%{http_code}' --max-time 600 -X POST -H 'Content-Type: application/json' \
      --data-binary "{\"filters\":{\"workflowId\":\"$wf\"},\"deleteBefore\":\"$before\"}" "$base/rest/executions/delete")
    [ "$code" = 200 ] || ok=no
  done
  rm -f "$jar"
  [ "$ok" = yes ]
}

gemini_key_state() {   # what n8n has saved as the Gemini key: real | placeholder | missing (never prints the key)
  key_state hdGeminiApiKey001
}

claude_key_state() {   # the same for the optional Anthropic (Claude) key
  key_state hdAnthropicKey001
}

key_state() {   # key_state CREDENTIAL_ID
  # n8n answers its health check a moment before its CLI works: ask again until the answer is clear
  for _ in 1 2 3 4 5 6; do
    state=$(key_state_once "$1")
    case "$state" in real|placeholder|missing) printf '%s\n' "$state"; return 0 ;; esac
    sleep 2
  done
  printf 'unknown\n'
}

key_state_once() {   # the key itself never leaves the container: only real / placeholder / missing is printed
  dc exec -T -e HD_CRED="$1" n8n sh -c '
    n8n export:credentials --id="$HD_CRED" --decrypted --output=/tmp/hd_c.json >/dev/null 2>&1
    if [ ! -s /tmp/hd_c.json ] || ! grep -q "$HD_CRED" /tmp/hd_c.json; then echo missing
    elif grep -q PASTE-YOUR /tmp/hd_c.json || grep -Eq "\"apiKey\": *\"\"" /tmp/hd_c.json; then echo placeholder
    else echo real; fi
    rm -f /tmp/hd_c.json' 2>/dev/null | tail -n 1
}

ask_gemini_key() {   # asks for the key (hidden); sets GEMINI_INPUT ('' = skip)
  GEMINI_INPUT=
  say ""
  say "${B}The demo's AI is Google Gemini.${N} It needs an API key (free for a demo):"
  say "  1. Open https://aistudio.google.com/apikey and sign in with a Google account."
  say "  2. Press 'Create API key' and copy it."
  say "  3. Paste it below and press Enter (you will not see it while you paste)."
  say "Or just press Enter to skip: the demo then uses a simple stand-in AI that needs no key and"
  say "no internet, but understands only a few jobs (decks, toilets, wall holes, faucets, painting)."
  tries=0
  while [ $tries -lt 3 ]; do
    tries=$((tries + 1))
    printf 'Gemini API key: '
    trap 'stty echo 2>/dev/null; echo; exit 130' INT
    stty -echo 2>/dev/null
    IFS= read -r input
    stty echo 2>/dev/null
    trap - INT
    echo
    input=$(printf '%s' "$input" | tr -d '[:space:]')
    [ -z "$input" ] && return 0
    if ! printf '%s' "$input" | grep -Eq '^[A-Za-z0-9._-]{20,}$'; then
      say "  That does not look like an API key (letters, digits, '.', '-' and '_', at least 20 characters). Try again, or press Enter to skip."
      continue
    fi
    if [ -z "${HD_SKIP_KEY_CHECK:-}" ]; then
      code=$(printf 'x-goog-api-key: %s\n' "$input" | curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H @- \
        https://generativelanguage.googleapis.com/v1beta/models 2>/dev/null)
      case "$code" in
        200) say "  Key checked with Google: it works." ;;
        000) say "  (Could not reach Google to check the key: no internet? Keeping it.)" ;;
        *)   say "  Google did not accept this key (HTTP $code). Check it and try again, or press Enter to skip."
             continue ;;
      esac
    fi
    GEMINI_INPUT=$input
    return 0
  done
  say "  Skipping the key for now: the stand-in AI is used. Change it any time with ./start.sh key"
}

ask_claude_key() {   # asks for the optional Anthropic key (hidden); sets CLAUDE_INPUT ('' = skip)
  CLAUDE_INPUT=
  say ""
  say "${B}Optional: Claude (Anthropic) as a backup AI.${N} If Google's free Gemini quota runs out or Gemini is"
  say "busy, the demo can switch to Claude instead of asking the customer to try again. It needs an Anthropic"
  say "API key (paid per use; a demo costs cents):"
  say "  1. Open https://console.anthropic.com/settings/keys, sign in, press 'Create Key' and copy it."
  say "  2. Paste it below and press Enter (you will not see it while you paste)."
  say "This is optional and only used together with Gemini (never with the stand-in AI)."
  say "Or just press Enter to skip (Gemini only). Add it any time later with ./start.sh claude-key"
  tries=0
  while [ $tries -lt 3 ]; do
    tries=$((tries + 1))
    printf 'Anthropic API key (Enter = skip): '
    trap 'stty echo 2>/dev/null; echo; exit 130' INT
    stty -echo 2>/dev/null
    IFS= read -r input
    stty echo 2>/dev/null
    trap - INT
    echo
    input=$(printf '%s' "$input" | tr -d '[:space:]')
    [ -z "$input" ] && return 0
    if ! printf '%s' "$input" | grep -Eq '^sk-ant-[A-Za-z0-9_-]{20,}$'; then
      say "  That does not look like an Anthropic API key (it starts with sk-ant-). Try again, or press Enter to skip."
      continue
    fi
    if [ -z "${HD_SKIP_KEY_CHECK:-}" ]; then
      code=$(printf 'x-api-key: %s\nanthropic-version: 2023-06-01\n' "$input" | curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H @- \
        https://api.anthropic.com/v1/models 2>/dev/null)
      case "$code" in
        200) say "  Key checked with Anthropic: it works." ;;
        000) say "  (Could not reach Anthropic to check the key: no internet? Keeping it.)" ;;
        *)   say "  Anthropic did not accept this key (HTTP $code). Check it and try again, or press Enter to skip."
             continue ;;
      esac
    fi
    CLAUDE_INPUT=$input
    return 0
  done
  say "  Skipping the Claude key for now. Add it any time with ./start.sh claude-key"
}

n8n_setup() {   # credentials + workflow into n8n, switched on; only when something changed (or FORCE=yes)
  key=$(env_get GEMINI_API_KEY)
  claude_key=$(env_get ANTHROPIC_API_KEY)
  if [ "$AI" = offline ]; then gemini_url=http://fake-ai:8010; else gemini_url=https://generativelanguage.googleapis.com; fi
  # is a Claude key saved (in .env, or earlier in n8n)? The workflow's "Claude key set?" nodes read this.
  if [ -n "$claude_key" ] || [ "$(claude_key_state)" = real ]; then claude_set=yes; else claude_set=no; fi
  provider=$(env_get HD_AI_PROVIDER); gemini_models=$(env_get HD_GEMINI_MODELS)
  phone_link="$(phone_base)/demo/phone.html?s="
  pg_user=$(env_get POSTGRES_USER); pg_pw=$(env_get POSTGRES_PASSWORD); pg_db=$(env_get POSTGRES_DB)
  reader_pw=$(env_get HD_LLM_READER_PASSWORD)
  secrets_sum=$(printf '%s|%s|%s|%s|%s|%s' "$pg_user" "$pg_pw" "$pg_db" "$reader_pw" "$key" "$claude_key" | cksum | awk '{print $1}')
  wf_sum=$(cksum < "$ROOT/n8n/build_workflow.py" | awk '{print $1}')
  fingerprint="v3|$wf_sum|$secrets_sum|$AI|$gemini_url|$phone_link|$claude_set|$provider|$gemini_models"
  saved=$(dc exec -T n8n cat /home/node/.n8n/hd_setup_fingerprint 2>/dev/null)
  if [ "${FORCE:-no}" != yes ] && [ "$saved" = "$fingerprint" ]; then
    good "n8n workflow is up to date"
    return 0
  fi

  printf '  importing the workflow and its credentials into n8n '
  # 0. the model chain's memory (table ai_model_status; safe to run again). A changed setup starts with no model
  #    marked broken (wrong name) or locked out (wrong key); quota and busy rests are kept.
  { cat "$ROOT/database/init/07_ai_model_status.sql"
    echo "DELETE FROM ai_model_status WHERE reason IN ('model', 'key');"; } \
    | dc exec -T postgres sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1 \
    || { echo; bad "could not create the AI model table in the database"; return 1; }
  printf '.'
  # 1. credentials: the database ones from .env; the Gemini key from .env, else keep the saved one
  pg() { printf '{"id":"%s","name":"%s","type":"postgres","data":{"host":"postgres","port":5432,"database":"%s","user":"%s","password":"%s","ssl":"disable"}}' \
           "$1" "$2" "$(json_escape "$pg_db")" "$(json_escape "$3")" "$(json_escape "$4")"; }
  creds="[$(pg hdPostgresApp0001 'HD Postgres (workflow tables)' "$pg_user" "$pg_pw"),$(pg hdPostgresRead001 'HD Postgres (AI read-only: store_items)' hd_llm_reader "$reader_pw")"
  gemini=
  if [ -n "$key" ]; then
    gemini=$key
  elif [ "$(gemini_key_state)" = missing ]; then
    gemini=PASTE-YOUR-GEMINI-API-KEY-HERE
  fi
  if [ -n "$gemini" ]; then
    creds="$creds,{\"id\":\"hdGeminiApiKey001\",\"name\":\"HD Google Gemini API key\",\"type\":\"googlePalmApi\",\"data\":{\"host\":\"https://generativelanguage.googleapis.com\",\"apiKey\":\"$(json_escape "$gemini")\"}}"
  fi
  # the stand-in AI's credential (dummy key): n8n's native Gemini chat node uses it in offline mode
  creds="$creds,{\"id\":\"hdGeminiStandIn01\",\"name\":\"HD Gemini stand-in (no key)\",\"type\":\"googlePalmApi\",\"data\":{\"host\":\"http://fake-ai:8010\",\"apiKey\":\"stand-in-no-key\"}}"
  # Claude (optional): the key from .env, else keep the one saved in n8n, else an empty credential to fill in
  claude_cred=
  if [ -n "$claude_key" ]; then claude_cred=$claude_key
  elif [ "$(claude_key_state)" = missing ]; then claude_cred=' '; fi
  if [ -n "$claude_cred" ]; then
    claude_cred=$(printf '%s' "$claude_cred" | tr -d '[:space:]')
    creds="$creds,{\"id\":\"hdAnthropicKey001\",\"name\":\"HD Anthropic API key (optional)\",\"type\":\"anthropicApi\",\"data\":{\"apiKey\":\"$(json_escape "$claude_cred")\",\"url\":\"https://api.anthropic.com\"}}"
  fi
  creds="$creds,{\"id\":\"hdClaudeStandIn01\",\"name\":\"HD Claude stand-in (no key)\",\"type\":\"anthropicApi\",\"data\":{\"apiKey\":\"stand-in-no-key\",\"url\":\"http://fake-ai:8010\"}}"
  creds="$creds]"
  printf '%s' "$creds" | dc exec -T n8n sh -c 'umask 077; cat > /tmp/hd_credentials.json' || return 1
  printf '.'
  dc exec -T n8n n8n import:credentials --input=/tmp/hd_credentials.json >/dev/null 2>&1
  status=$?
  dc exec -T n8n rm -f /tmp/hd_credentials.json
  [ $status -eq 0 ] || { echo; bad "n8n could not import the credentials"; return 1; }
  printf '.'

  # 2. the four workflows, built for this network (needs only Docker: Python runs in the robot image): the main
  #    one, the sub-workflow "Ask an AI model (Gemini → Claude fallback)", "Phone screen (status poll)" and
  #    "Timeout check (every minute)", as one list (n8n imports a list in one go)
  errors=$(mktemp "${TMPDIR:-/tmp}/hd_build.XXXXXX")
  docker run --rm --network none -v "$ROOT/n8n:/src:ro" \
      -e HD_ROBOT_URL=http://robot:8000 -e HD_PHONE_LINK="$phone_link" -e HD_GEMINI_URL="$gemini_url" \
      -e HD_CLAUDE_KEY_SET="$claude_set" -e HD_AI_PROVIDER="$provider" -e HD_GEMINI_MODELS="$gemini_models" \
      -e HD_WORKFLOW_FILE=/tmp/workflow.json -e HD_WORKFLOW_BUNDLE=/tmp/workflows.json --entrypoint /bin/sh "$IMAGE" \
      -c 'python3 /src/build_workflow.py >/dev/null && cat /tmp/workflows.json' 2>"$errors" \
    | dc exec -T n8n sh -c 'cat > /tmp/hd_workflow.json'
  if ! dc exec -T n8n sh -c 'test -s /tmp/hd_workflow.json'; then
    echo; bad "could not build the workflow (n8n/build_workflow.py):"; tail -n 5 "$errors" | sed 's/^/         /'
    rm -f "$errors"; return 1
  fi
  rm -f "$errors"
  printf '.'
  dc exec -T n8n n8n import:workflow --input=/tmp/hd_workflow.json >/dev/null 2>&1 \
    || { echo; bad "n8n could not import the workflows"; return 1; }
  printf '.'
  # 3. switch them on ("publish"), remember what was imported, restart so the webhooks go live
  #    (the main workflow before the status poll, which takes over its old GET help/status webhook; the n8n CLI
  #    sometimes fails while the running n8n holds the database, so each one gets three tries)
  for wf_id in hdAskAiModel0001 hdGuideRobot00001 hdPhoneStatus001 hdIdleCheck00001; do
    tries=0
    until out=$(dc exec -T n8n n8n publish:workflow --id=$wf_id 2>&1); do
      tries=$((tries + 1))
      if [ $tries -ge 3 ]; then
        echo; bad "n8n could not switch the workflow $wf_id on:"; printf '%s\n' "$out" | tail -n 3 | sed 's/^/         /'
        return 1
      fi
      sleep 2
    done
    printf '.'
  done
  dc exec -T n8n sh -c 'rm -f /tmp/hd_workflow.json; cat > /home/node/.n8n/hd_setup_fingerprint' <<EOF
$fingerprint
EOF
  dc restart n8n >/dev/null 2>&1
  wait_http "http://localhost:$N8N_PORT/healthz" 120 || { echo; bad "n8n did not come back after the restart"; return 1; }
  echo
  if [ "$claude_set" = yes ]; then claude_note="Claude fallback on"; else claude_note="no Claude key"; fi
  good "workflow imported and switched on (AI: $AI, ${claude_note}; phone link: ${phone_link}...)"
}

open_browser() {
  if is_mac; then open "$1" >/dev/null 2>&1
  elif command -v xdg-open >/dev/null 2>&1 && { [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; }; then
    xdg-open "$1" >/dev/null 2>&1 &
  fi
}

webhook_ok() {   # true if n8n's webhooks answer: the phone's status poll, for a visit that does not exist
  # (it creates nothing; n8n's status workflow answers 404 "unknown_session", which needs its database login too)
  curl -s --max-time 5 "http://localhost:$N8N_PORT/webhook/help/status?session_id=none" 2>/dev/null | grep -q unknown_session
}

wait_webhooks() {   # wait_webhooks SECONDS: until n8n's webhooks answer (they go live a moment after /healthz)
  i=0
  while [ $i -lt "$1" ]; do
    webhook_ok && return 0
    i=$((i + 2)); printf '.'; sleep 2
  done
  return 1
}

db_login_ok() {   # db_login_ok USER PASSWORD: true if the database accepts this login over the network, like n8n's
  # (inside the postgres container a local login needs no password, so this logs in by the service name)
  printf '%s\n' "$2" | dc exec -T postgres sh -c 'IFS= read -r PGPASSWORD; export PGPASSWORD
    psql -h postgres -U "$1" -d "$POSTGRES_DB" -tAc "SELECT 1" >/dev/null 2>&1' sh "$1" >/dev/null 2>&1
}

# ------------------------------------------------------------------ status
hd_status() {   # plain-language health of each part, with the fix; returns 1 if something is wrong
  problems=0
  step "Aisle Guide demo: status"
  if ! docker info >/dev/null 2>&1; then
    bad "Docker is not running."
    if is_mac; then fix "Fix: open Docker Desktop from Applications, wait for the whale icon, then ./start.sh"
    else fix "Fix: sudo systemctl start docker, then ./start.sh"; fi
    return 1
  fi
  good "Docker is running"
  running=$(dc_all ps --format '{{.Service}} {{.State}} {{.Health}}' 2>/dev/null)
  state_of() { printf '%s\n' "$running" | awk -v s="$1" '$1 == s {print $2 " " $3}'; }

  case "$(state_of postgres)" in
    "running healthy")
      if db_login_ok "$(env_get POSTGRES_USER)" "$(env_get POSTGRES_PASSWORD)" \
         && db_login_ok hd_llm_reader "$(env_get HD_LLM_READER_PASSWORD)"; then
        good "Database (PostgreSQL): the passwords in .env work"
      else
        bad "The database does not accept the passwords in .env"
        fix "This folder's .env does not belong to the demo data on this computer (a second copy of the"
        fix "demo folder?). Copy .env from the folder you first started the demo from into this one, then"
        fix "./start.sh. Or start over from scratch (deletes the old data): ./reset.sh --everything"
        problems=1
      fi ;;
    running*) note "Database is starting"; fix "Wait a few seconds and check again: ./status.sh" ;;
    *) bad "Database is not running"; fix "Fix: ./start.sh"; problems=1 ;;
  esac

  if curl -sf -o /dev/null --max-time 3 "http://localhost:$N8N_PORT/healthz"; then
    good "n8n (the workflow engine): http://localhost:$N8N_PORT"
    wf=$(dc exec -T n8n n8n list:workflow --active=true 2>/dev/null)
    if printf '%s' "$wf" | grep -q hdGuideRobot00001 && printf '%s' "$wf" | grep -q hdPhoneStatus001 \
       && printf '%s' "$wf" | grep -q hdIdleCheck00001; then
      good "Workflow 'Home Depot guide robot' (+ status poll and timeout check) is switched on"
      if webhook_ok; then good "n8n answers the phone (a test call to its webhook worked)"
      else
        bad "n8n does not answer the phone's calls (a test call to the webhook /help/status failed)"
        fix "If n8n has just started, wait half a minute and check again. Otherwise: ./start.sh setup"
        fix "(details: ./tools.sh logs n8n)"
        problems=1
      fi
    else bad "The workflows are not switched on"; fix "Fix: ./start.sh setup"; problems=1; fi
    if [ "$AI" = offline ]; then
      if [ "$(state_of fake-ai)" = "running " ]; then good "AI: stand-in (offline mode)"
      else bad "The stand-in AI is not running"; fix "Fix: ./start.sh"; problems=1; fi
    elif [ "$AI" = auto ] || [ -z "$AI" ]; then
      bad "The AI is not set up yet (the last ./start.sh stopped before it)"; fix "Fix: ./start.sh"; problems=1
    else
      case "$(gemini_key_state)" in
        real) good "AI: Google Gemini (an API key is saved)" ;;
        *) bad "AI: no Gemini API key is saved, so the AI steps will fail"; fix "Fix: ./start.sh key"; problems=1 ;;
      esac
    fi
    if [ "$AI" != offline ]; then
      case "$(claude_key_state)" in
        real) good "Backup AI: Claude (an Anthropic key is saved)$( [ "$(env_get HD_AI_PROVIDER)" = claude ] && echo '; Claude goes first (HD_AI_PROVIDER=claude)')" ;;
        *) info "Backup AI Claude: not set up (optional). When every Gemini model is out of quota, customers"
           fix "are asked to try again. To add one: ./start.sh claude-key" ;;
      esac
    fi
    ai_models_status
  elif [ -n "$(state_of n8n)" ]; then
    note "n8n is starting"; fix "Wait half a minute and check again: ./status.sh"
  else
    bad "n8n is not running"; fix "Fix: ./start.sh"; problems=1
  fi

  health=$(curl -s --max-time 3 "http://localhost:$DEMO_PORT/health" 2>/dev/null)
  if printf '%s' "$health" | grep -q '"nav2_ready":true'; then
    good "Robot (simulation + navigation) is ready"
    good "Demo stage: http://localhost:$DEMO_PORT/demo/"
  elif [ -n "$health" ]; then
    note "Robot is up, navigation is still starting (can take a minute)"
    fix "Check again in a minute: ./status.sh. If it stays like this: ./stop.sh then ./start.sh"
  elif [ -n "$(state_of robot)" ]; then
    note "Robot is starting"; fix "Check again in a minute: ./status.sh"
  else
    bad "Robot is not running"; fix "Fix: ./start.sh   (details: ./tools.sh logs robot)"; problems=1
  fi

  if [ "$RVIZ" = yes ]; then
    if curl -sf -o /dev/null --max-time 3 "http://localhost:$RVIZ_PORT/vnc.html"; then good "Robot view (RViz): http://localhost:$RVIZ_PORT"
    elif [ -n "$(state_of robot)" ]; then note "Robot view (RViz) is starting"
    fi
  else
    good "Robot view (RViz) is switched off (HD_RVIZ=no in .env)"
  fi
  if [ "$LAN" = yes ]; then
    if curl -sf -o /dev/null --max-time 3 "http://$HD_PUBLIC_ADDR:$DEMO_PORT/health"; then
      good "Phones on the same Wi-Fi: http://$HD_PUBLIC_ADDR:$DEMO_PORT/demo/ (the QR code uses $(phone_base))"
    else
      bad "The demo does not answer on this computer's network address ($HD_PUBLIC_ADDR:$DEMO_PORT)"
      fix "Is that address right? Set HD_PUBLIC_HOST in .env if this computer has several networks, then ./start.sh"
      problems=1
    fi
    if [ "$HTTPS" = yes ]; then
      if curl -skf -o /dev/null --max-time 3 "https://$HD_PUBLIC_ADDR:$HTTPS_PORT/health"; then
        good "HTTPS for phones (voice notes): https://$HD_PUBLIC_ADDR:$HTTPS_PORT/demo/ (self-signed: accept it once on each phone)"
      else
        note "HTTPS for phones is starting (https://$HD_PUBLIC_ADDR:$HTTPS_PORT)"
      fi
    fi
    firewall_check
  fi
  return $problems
}

ai_models_status() {   # the model chain's memory: which AI models rest right now (out of quota / busy), and why
  rows=$(printf '%s\n' "SELECT model, reason, to_char(resting_until, 'HH24:MI'), coalesce(http_code, '')
    FROM ai_model_status WHERE resting_until > now() ORDER BY resting_until;" \
    | dc exec -T postgres sh -c 'psql -At -F "|" -U "$POSTGRES_USER" -d "$POSTGRES_DB"' 2>/dev/null)
  if [ -z "$rows" ]; then good "AI models: none is resting (no recent 'out of quota' or 'busy')"; return 0; fi
  note "AI models resting (skipped until the time shown; the next model of the chain answers instead):"
  printf '%s\n' "$rows" | while IFS='|' read -r m why until code; do
    case "$why" in
      quota_day) what="daily free quota used up" ;; quota) what="too many requests per minute" ;;
      busy) what="overloaded (busy)" ;; timeout) what="too slow" ;; model) what="model name not accepted" ;;
      key) what="API key refused" ;; *) what=$why ;;
    esac
    fix "$m: $what${code:+ (HTTP $code)}, until $until"
  done
}

# ------------------------------------------------------------------ firewall (LAN mode)
lan_subnet() {   # the network of this computer's address, e.g. 192.168.2.0/24 (empty if unknown)
  addr=$HD_PUBLIC_ADDR
  if is_mac; then
    iface=$(route -n get default 2>/dev/null | awk '/interface:/ {print $2}')
    mask=$(ifconfig "$iface" 2>/dev/null | awk '/inet / {print $4; exit}')   # 0xffffff00
    case "$mask" in 0x*) bits=0; m=$((mask)); while [ $m -gt 0 ]; do bits=$((bits + (m & 1))); m=$((m >> 1)); done ;; *) bits= ;; esac
  else
    bits=$(ip -4 -o addr show 2>/dev/null | awk -v a="$addr" '{split($4, p, "/"); if (p[1] == a) {print p[2]; exit}}')
  fi
  case "$addr" in *.*.*.*) ;; *) return 0 ;; esac
  [ -n "$bits" ] || return 0
  printf '%s\n' "$addr/$bits" | awk -F'[./]' '{
    ip = (($1 * 256 + $2) * 256 + $3) * 256 + $4; bits = $5
    size = 2 ^ (32 - bits); net = ip - (ip % size)
    printf "%d.%d.%d.%d/%d\n", int(net / 16777216) % 256, int(net / 65536) % 256, int(net / 256) % 256, net % 256, bits }'
}

firewall_check() {   # says whether a firewall on this computer may keep phones out, and the fix (never changes it)
  ports=$DEMO_PORT; [ "$HTTPS" = yes ] && ports="$DEMO_PORT $HTTPS_PORT"
  from=$(lan_subnet); [ -n "$from" ] || from="<your Wi-Fi network, e.g. 192.168.1.0/24>"
  if is_mac; then
    state=$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null)
    case "$state" in
      *enabled*|*"State = 1"*|*"State = 2"*)
        note "The Mac's firewall is on: it may keep phones out"
        fix "If a phone cannot open the page: System Settings > Network > Firewall > Options...,"
        fix "find Docker (com.docker.backend) and set it to 'Allow incoming connections' (or click"
        fix "Allow when macOS asks whether Docker may accept incoming network connections)."
        if /usr/libexec/ApplicationFirewall/socketfilterfw --getblockall 2>/dev/null | grep -qi enabled; then
          fix "'Block all incoming connections' is on: switch it off there first."
        fi ;;
      *) good "The Mac's firewall is off: phones can connect" ;;
    esac
    return 0
  fi
  ufw_on=no
  if command -v systemctl >/dev/null 2>&1 && [ "$(systemctl is-active ufw 2>/dev/null)" = active ] \
     && grep -qi '^ENABLED=yes' /etc/ufw/ufw.conf 2>/dev/null; then
    ufw_on=yes
  fi
  if [ "$ufw_on" = yes ]; then
    note "The firewall (ufw) is on: it may keep phones out"
    fix "Docker's published ports usually get past ufw. If a phone still cannot open the page,"
    fix "run this yourself (it opens the port to your Wi-Fi network only):"
    for p in $ports; do fix "  sudo ufw allow from $from to any port $p proto tcp"; done
    for p in 8000 $( [ "$HTTPS" = yes ] && echo 8443 ); do fix "  sudo ufw route allow proto tcp from $from to any port $p"; done
    fix "Undo later with: sudo ufw status numbered, then sudo ufw delete <number>"
  elif command -v systemctl >/dev/null 2>&1 && [ "$(systemctl is-active firewalld 2>/dev/null)" = active ]; then
    note "The firewall (firewalld) is on: it may keep phones out"
    fix "If a phone cannot open the page, run this yourself:"
    for p in $ports; do fix "  sudo firewall-cmd --add-port=$p/tcp"; done
  else
    good "No firewall found that blocks phones"
  fi
  fix "Still no luck? Some Wi-Fi networks (guest networks, phone hotspots with 'client isolation')"
  fix "do not let devices reach each other: use another Wi-Fi or this computer's own hotspot."
}
