#!/bin/bash
# Starts the whole demo on this PC:
#   PostgreSQL + n8n (Docker), the simulated robot + Nav2 + RViz, and the robot service.
#   ./start.sh            everything, with the 3D RViz window
#   ./start.sh norviz     without the RViz window
#   ./start.sh mock       no robot simulation at all: the robot service pretends to drive
# Stop everything with ./stop.sh
set -e
cd "$(dirname "${BASH_SOURCE[0]}")"
MODE=${1:-full}
mkdir -p logs

echo "1/3  PostgreSQL + n8n"
docker compose up -d
echo -n "     waiting for n8n "
for i in $(seq 1 60); do curl -sf localhost:5678/healthz >/dev/null && break; echo -n .; sleep 1; done; echo " ok"

docker image inspect hd-robot >/dev/null 2>&1 || { echo "     building the robot image (first time only)"; ./robot/run.sh build >/dev/null; }
./robot/run.sh stop >/dev/null 2>&1 || true

if [ "$MODE" = mock ]; then
  echo "2/3  (no robot simulation: mock mode)"
  echo "3/3  robot service (mock)"
  nohup ./robot/run.sh mock > logs/robot_service.log 2>&1 &
else
  echo "2/3  simulated robot + Nav2$([ "$MODE" = norviz ] || echo ' + RViz')"
  nohup ./robot/run.sh sim $([ "$MODE" = norviz ] && echo rviz:=false) > logs/sim.log 2>&1 &
  sleep 8
  echo "3/3  robot service"
  nohup ./robot/run.sh service > logs/robot_service.log 2>&1 &
fi
echo -n "     waiting for the robot "
for i in $(seq 1 90); do curl -sf localhost:8000/health 2>/dev/null | grep -q '"nav2_ready":true' && break; echo -n .; sleep 1; done; echo " ok"

echo
echo "Demo stage:  http://localhost:8000/demo/"
echo "n8n:         http://localhost:5678"
echo "Logs:        logs/sim.log, logs/robot_service.log, logs/robot_service.jsonl (python3 tools/log_check.py)"
