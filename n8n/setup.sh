#!/bin/bash
# Puts the workflow and its credentials into the local n8n (container hd_n8n) and switches it on.
# Safe to run again: it replaces the workflow, and never overwrites a Gemini key you already saved.
#   ./n8n/setup.sh                 the workflow in n8n/homedepot_guide_robot.json
#   ./n8n/setup.sh other.json      another workflow file in the n8n folder
set -e
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE/.."
set -a; . ./.env; set +a
FILE=${1:-homedepot_guide_robot.json}
N=hd_n8n

docker ps --format '{{.Names}}' | grep -qx $N || { echo "n8n is not running: docker compose up -d"; exit 1; }

# 1. Credentials. The two database ones are filled in from .env. The Gemini one is created
#    with a placeholder only if it does not exist yet; you paste your key in the n8n website.
HAVE_GEMINI=no
docker exec $N n8n export:credentials --all --output=/tmp/hd_existing.json >/dev/null 2>&1 \
  && docker exec $N grep -q hdGeminiApiKey001 /tmp/hd_existing.json && HAVE_GEMINI=yes
python3 - > /tmp/hd_credentials.json <<PY
import json
pg = lambda id, name, user, password: {"id": id, "name": name, "type": "postgres", "data": {
    "host": "localhost", "port": 5432, "database": "$POSTGRES_DB", "user": user, "password": password, "ssl": "disable"}}
creds = [pg("hdPostgresApp0001", "HD Postgres (workflow tables)", "$POSTGRES_USER", "$POSTGRES_PASSWORD"),
         pg("hdPostgresRead001", "HD Postgres (AI read-only: store_items)", "hd_llm_reader", "$HD_LLM_READER_PASSWORD")]
if "$HAVE_GEMINI" != "yes":
    creds.append({"id": "hdGeminiApiKey001", "name": "HD Google Gemini API key", "type": "googlePalmApi",
                  "data": {"host": "https://generativelanguage.googleapis.com", "apiKey": "PASTE-YOUR-GEMINI-API-KEY-HERE"}})
print(json.dumps(creds))
PY
docker cp /tmp/hd_credentials.json $N:/tmp/hd_credentials.json >/dev/null
rm -f /tmp/hd_credentials.json
docker exec $N n8n import:credentials --input=/tmp/hd_credentials.json | tail -1
docker exec -u root $N rm -f /tmp/hd_credentials.json /tmp/hd_existing.json

# 2. The workflow
docker cp "$HERE/$FILE" $N:/tmp/hd_workflow.json >/dev/null
docker exec $N n8n import:workflow --input=/tmp/hd_workflow.json | tail -1

# 3. Switch it on (n8n calls this "publish"), then restart n8n so the webhooks go live
docker exec $N n8n publish:workflow --id=hdGuideRobot00001 2>&1 | tail -1
docker restart $N >/dev/null
echo -n "Waiting for n8n "
for i in $(seq 1 40); do curl -sf localhost:5678/healthz >/dev/null && break; echo -n .; sleep 1; done
echo " ready: http://localhost:5678"
[ "$HAVE_GEMINI" = yes ] || echo "Next: in n8n open Credentials -> 'HD Google Gemini API key' and paste your key."
