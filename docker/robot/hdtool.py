"""Runs the repo's Python tools inside the robot container, so the host needs no Python
(./tools.sh calls this). The tools themselves are unchanged; only their addresses are
pointed at the Docker Compose network:

    python3 /opt/hd/hdtool.py flow  ["what the customer says"]   tools/full_flow_test.py
    python3 /opt/hd/hdtool.py check [log_check options]          tools/log_check.py

Environment: HD_N8N_URL (http://n8n:5678); for "check" also PGHOST, PGUSER, PGDATABASE, PGPASSWORD.
"""
import importlib.util
import json
import os
import re
import subprocess
import sys


def load(path):
    spec = importlib.util.spec_from_file_location(os.path.basename(path)[:-3], path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def psql(sql):
    """Same as log_check.psql, but over the network to the postgres service instead of docker exec."""
    command = ['psql', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql]
    done = subprocess.run(command, capture_output=True, text=True, timeout=60)
    if done.returncode != 0:
        raise RuntimeError(f'psql failed: {done.stderr.strip()[:400]}')
    return [json.loads(line) for line in done.stdout.splitlines() if line.strip()]


def tolerant_parse_ts(original):
    """log_check.parse_ts uses datetime.fromisoformat, which before Python 3.11 (ROS Humble has 3.10)
    rejects PostgreSQL's times with 1-5 decimals ('...:01.12345+00:00'): pad them to 6 first."""
    def parse_ts(text):
        if isinstance(text, str):
            text = re.sub(r'(\.\d{1,6})(?=[+-]\d\d:?\d\d$|Z$|$)', lambda m: m.group(1).ljust(7, '0'), text.strip())
            text = re.sub(r'([+-]\d\d)$', r'\1:00', text)
        return original(text)
    return parse_ts


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ('flow', 'check'):
        sys.exit(__doc__)
    tool, args = sys.argv[1], sys.argv[2:]
    if tool == 'flow':
        flow = load('/hd/tools/full_flow_test.py')
        flow.N8N = os.environ.get('HD_N8N_URL', 'http://n8n:5678') + '/webhook'
        flow.ROBOT = 'http://localhost:8000'
        sys.argv = ['full_flow_test.py'] + args
        flow.main()
        return 0
    check = load('/hd/tools/log_check.py')
    check.psql = psql
    check.parse_ts = tolerant_parse_ts(check.parse_ts)
    sys.argv = ['log_check.py'] + args
    try:
        return check.main()
    except KeyboardInterrupt:
        return 0


if __name__ == '__main__':
    sys.exit(main())
