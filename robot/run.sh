#!/bin/bash
# Runs the robot side of the demo inside one Docker container (hd_robot).
#   ./run.sh build      build the image (once)
#   ./run.sh sim        simulated robot + store + Nav2 + RViz     (terminal 1)
#   ./run.sh service    the robot service on port 8000            (terminal 2)
#   ./run.sh mock       the robot service with NO robot: it pretends to drive
#                       (for testing n8n on its own; do not run with "service")
#   ./run.sh shell      a shell in the container, ROS ready
#   ./run.sh stop       stop everything and remove the container
set -e
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE=hd-robot
NAME=hd_robot
# The simulation talks only to itself: its own ROS domain, this PC only.
# (The real Dingo uses domain 0, so nothing here can reach it.)
ROS_ENV="source /opt/ros/humble/setup.bash && export ROS_DOMAIN_ID=42 ROS_LOCALHOST_ONLY=1 RMW_IMPLEMENTATION=rmw_fastrtps_cpp PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1"

gpu_flags() {
  if nvidia-smi &>/dev/null && docker info 2>/dev/null | grep -q 'Runtimes:.*nvidia'; then
    echo "--gpus all --env NVIDIA_VISIBLE_DEVICES=all --env NVIDIA_DRIVER_CAPABILITIES=all"
  elif [ -e /dev/dri ]; then
    echo "--device /dev/dri"
  fi
}

up() {
  docker ps --format '{{.Names}}' | grep -qx "$NAME" && return
  docker rm -f "$NAME" &>/dev/null || true
  xhost +local:docker >/dev/null 2>&1 || true
  # shellcheck disable=SC2046
  docker run -d --init --name "$NAME" --network host --ipc host \
    --env DISPLAY="$DISPLAY" --env QT_X11_NO_MITSHM=1 \
    --volume /tmp/.X11-unix:/tmp/.X11-unix:rw \
    --volume "$HERE/..":/hd:rw \
    $(gpu_flags) "$IMAGE" sleep infinity >/dev/null
  echo "Started container $NAME"
}

run() {
  up
  local tty=-i
  [ -t 0 ] && tty=-it
  docker exec $tty $ENV_FLAGS "$NAME" bash -c "$ROS_ENV && $*"
}

case "${1:-}" in
  build)   docker build -t "$IMAGE" "$HERE" ;;
  sim)     shift; run "ros2 launch /hd/robot/sim/sim.launch.py $*" ;;
  service) run "python3 /hd/robot/robot_service/service.py" ;;
  mock)    ENV_FLAGS="-e HD_MODE=mock" run "python3 /hd/robot/robot_service/service.py" ;;
  shell)   run "bash" ;;
  stop)    docker rm -f "$NAME" >/dev/null 2>&1 && echo "Stopped $NAME" || echo "$NAME was not running" ;;
  *)       sed -n '2,10p' "$0" ;;
esac
