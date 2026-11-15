#!/bin/bash
# Adds the n8n credential "HD Gemini stand-in (no key)" that the stand-in workflow's native AI node
# (AI 3, Basic LLM Chain + Google Gemini Chat Model) uses: same type as the real Gemini credential, but its
# "host" points to the stand-in AI (n8n/test/fake_gemini.py) and its key is a dummy. The real key is not touched.
#   ./n8n/test/add_standin_credential.sh                       host http://localhost:8010, container hd_n8n
#   ./n8n/test/add_standin_credential.sh http://fake-ai:8010 hdtest_n8n
# Run it once per n8n (it is safe to run again), before ./n8n/setup.sh test/workflow_fake_ai.json.
set -e
URL=${1:-${HD_GEMINI_URL:-http://localhost:8010}}
N=${2:-hd_n8n}
TMP=$(mktemp)
printf '[{"id":"hdGeminiStandIn01","name":"HD Gemini stand-in (no key)","type":"googlePalmApi","data":{"host":"%s","apiKey":"stand-in-no-key"}}]' "$URL" > "$TMP"
docker cp "$TMP" $N:/tmp/hd_standin_credential.json >/dev/null
rm -f "$TMP"
docker exec $N n8n import:credentials --input=/tmp/hd_standin_credential.json | tail -1
docker exec -u root $N rm -f /tmp/hd_standin_credential.json
