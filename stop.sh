#!/bin/bash
# Stops the demo: the robot container, n8n and PostgreSQL (data is kept).
cd "$(dirname "${BASH_SOURCE[0]}")"
./robot/run.sh stop
docker compose stop
