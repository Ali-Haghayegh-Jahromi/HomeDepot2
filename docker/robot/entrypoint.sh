#!/bin/bash
# Starts the robot side inside the container (docker/compose.yaml, service "robot"):
#   1. RViz's screen: Xvfb (a 1920x1080 screen in memory) + x11vnc + noVNC on :6080   (HD_RVIZ=yes)
#   2. the simulated robot + store + Nav2                                            (HD_MODE=ros)
#   3. RViz on that screen, full screen, with the chosen view                         (HD_RVIZ_VIEW)
#   4. the robot service on :8000 (also serves the demo pages at /demo)
#   5. https on :8443 for phones (self-signed certificate, made once)                  (HD_HTTPS=yes)
# If the simulation or the service stops, the container stops and Docker starts it again
# (RViz and the https relay restart by themselves).
# Settings (environment): HD_RVIZ yes|no, HD_RVIZ_VIEW top|3d, HD_MODE ros|mock, HD_N8N_URL,
#   HD_HTTPS yes|no, HD_PUBLIC_HOST (the address phones use: goes into the certificate),
#   HD_RVIZ_PUBLIC_PORT (RViz's port on the computer, for the stage's studio view),
#   HD_PHONE_BASE (the start of the phone link in LAN mode, for the stage), ROS_DOMAIN_ID (42)
source /opt/ros/humble/setup.bash
set -u
export ROS_DOMAIN_ID=${ROS_DOMAIN_ID:-42} ROS_LOCALHOST_ONLY=1 RMW_IMPLEMENTATION=rmw_fastrtps_cpp
MODE=${HD_MODE:-ros}
yes_no() { case "${1:-}" in yes|true|1|on) echo true ;; *) echo false ;; esac; }
RVIZ=$(yes_no "${HD_RVIZ:-yes}")
HTTPS=$(yes_no "${HD_HTTPS:-no}")
[ "$MODE" = mock ] && RVIZ=false
case "${HD_RVIZ_VIEW:-top}" in 3d|3D) VIEW=3d; RVIZ_CFG=/opt/hd/record-3d.rviz ;; *) VIEW=top; RVIZ_CFG=/opt/hd/record.rviz ;; esac
LOGS=/hd/logs
mkdir -p "$LOGS"
# The log files belong to whoever owns the logs folder on the computer (not to root), so the demo folder
# can be deleted or moved without sudo: handed to that owner now and every 20 s (for files made later,
# e.g. a new or rotated log). Nothing to do when the folder is root's (or on a Mac, where Docker Desktop
# maps the owner by itself).
LOG_OWNER=$(stat -c '%u:%g' "$LOGS" 2>/dev/null)
if [ -n "$LOG_OWNER" ] && [ "$LOG_OWNER" != "0:0" ]; then
  ( while true; do chown -R "$LOG_OWNER" "$LOGS" 2>/dev/null; sleep 20; done ) &
fi

trap 'trap - TERM INT; kill 0 2>/dev/null; exit 0' TERM INT

# What the demo pages need to know about this start (the studio view's RViz port, ...).
for dir in /hd/demo /hd/ui/dist; do
  [ -d "$dir" ] && printf '{"rviz": %s, "rviz_port": %s, "rviz_view": "%s", "phone_base": "%s"}\n' \
    "$RVIZ" "${HD_RVIZ_PUBLIC_PORT:-6080}" "$VIEW" "${HD_PHONE_BASE:-}" > "$dir/runtime.json" 2>/dev/null
done

if [ "$RVIZ" = true ]; then
  # software rendering (Mesa llvmpipe); LP_NUM_THREADS caps how many CPU cores RViz may use
  export DISPLAY=:0 QT_X11_NO_MITSHM=1 LIBGL_ALWAYS_SOFTWARE=1 LP_NUM_THREADS=${HD_RVIZ_THREADS:-2}
  rm -f /tmp/.X0-lock /tmp/.X11-unix/X0
  # 1920x1080: a 16:9 picture for recording; the RViz configs fill exactly this screen
  Xvfb :0 -screen 0 1920x1080x24 -nolisten tcp -noreset >/dev/null 2>&1 &
  for _ in $(seq 1 50); do [ -e /tmp/.X11-unix/X0 ] && break; sleep 0.1; done
  x11vnc -display :0 -rfbport 5900 -localhost -nopw -forever -shared -quiet -noxdamage >/dev/null 2>&1 &
  websockify --web /usr/share/novnc 6080 localhost:5900 >/dev/null 2>&1 &
  echo "RViz in the browser: port 6080 ($VIEW view)"
else
  # a page that says RViz is switched off, instead of an error
  python3 -m http.server 6080 --directory /opt/hd/rviz-off >/dev/null 2>&1 &
fi

if [ "$MODE" != mock ]; then
  echo "Starting the simulated robot + Nav2"
  ros2 launch /hd/robot/sim/sim.launch.py rviz:=false > >(tee "$LOGS/sim.log") 2>&1 &
  sleep 8
fi

if [ "$RVIZ" = true ]; then
  # RViz with the recording view, switched to full screen (F11: no menu, toolbar, status bar or
  # dock buttons). There is no window manager on the virtual screen, so xdotool places the window
  # itself: 9 px (Qt's margin around RViz's 3D view) past each edge, so the 3D view is exactly
  # the 1920x1080 screen. Restarted if it stops; it never stops the container.
  (
    # RViz joins once navigation is up (or after 2 minutes), so its many subscriptions do not
    # crowd Nav2's start and the robot service's first look at it (ROS 2 discovery).
    for _ in $(seq 1 60); do
      curl -s --max-time 2 http://127.0.0.1:8000/health 2>/dev/null | grep -q '"nav2_ready": *true' && break
      sleep 2
    done
    while true; do
      rviz2 -d "$RVIZ_CFG" >> "$LOGS/rviz.log" 2>&1 &
      pid=$!
      win=
      for _ in $(seq 1 120); do
        kill -0 "$pid" 2>/dev/null || break
        win=$(xdotool search --onlyvisible --name 'RViz' 2>/dev/null | head -n 1)
        [ -n "$win" ] && break
        sleep 0.5
      done
      if [ -n "$win" ]; then
        sleep 2
        xdotool windowfocus --sync "$win" key F11 >/dev/null 2>&1
        sleep 1
        xdotool windowmove "$win" -9 -9 windowsize "$win" 1938 1098 >/dev/null 2>&1
      fi
      wait "$pid"
      sleep 3
    done
  ) &
fi

if [ "$HTTPS" = true ]; then
  # A self-signed certificate for the address phones use, made once and kept in the hd_tls volume
  # (a phone that accepted it once does not ask again), new only when that address changes.
  TLS=/hd/tls
  HOST=${HD_PUBLIC_HOST:-localhost}
  mkdir -p "$TLS"
  if [ ! -s "$TLS/cert.pem" ] || [ "$(cat "$TLS/host" 2>/dev/null)" != "$HOST" ]; then
    if printf '%s' "$HOST" | grep -Eq '^[0-9]+(\.[0-9]+){3}$'; then SAN="IP:$HOST"; else SAN="DNS:$HOST"; fi
    SAN="$SAN,DNS:localhost,IP:127.0.0.1"
    openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 397 \
      -keyout "$TLS/key.pem" -out "$TLS/cert.pem" -subj "/O=Aisle Guide demo/CN=$HOST" \
      -addext "subjectAltName=$SAN" -addext "extendedKeyUsage=serverAuth" \
      -addext "keyUsage=critical,digitalSignature,keyEncipherment" >/dev/null 2>&1 \
      && printf '%s\n' "$HOST" > "$TLS/host" && chmod 600 "$TLS/key.pem"
    echo "Made a self-signed certificate for $HOST"
  fi
  (
    while true; do
      python3 /opt/hd/tls_proxy.py --cert "$TLS/cert.pem" --key "$TLS/key.pem" --listen 8443 --to 8000
      sleep 2
    done
  ) &
  echo "HTTPS for phones: port 8443 ($HOST)"
fi

echo "Starting the robot service (mode $MODE)"
python3 /hd/robot/robot_service/service.py > >(tee "$LOGS/robot_service.log") 2>&1 &

# any part that ends (the restart loops of RViz and https never do) stops the container
wait -n
echo "A part of the robot side stopped; the container stops so Docker can restart it." >&2
kill 0 2>/dev/null
exit 1
