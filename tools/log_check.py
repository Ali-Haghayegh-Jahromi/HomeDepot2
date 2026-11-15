#!/usr/bin/env python3
"""Reads every log of the demo, prints what happened in each visit, and checks it for bugs.

Sources, merged on one time line:
  - the event_log table in PostgreSQL (written by the n8n workflow)
  - logs/robot_service.jsonl (the robot service, plus the demo pages' reports sent to POST /log)

    python3 tools/log_check.py                     the latest 3 visits: time line + checks
    python3 tools/log_check.py --session k7m2x9qa4h
    python3 tools/log_check.py --last 10 --checks-only
    python3 tools/log_check.py --all --since 2h    every visit of the last 2 hours
    python3 tools/log_check.py --json              the same, as JSON (for other tools and agents)
    python3 tools/log_check.py --follow            keep watching; print new problems as they appear
    python3 tools/log_check.py -v                  also print every entry's full details

Exit code: 0 = no problems found, 1 = problems found, 2 = the logs could not be read.
Standard library only. PostgreSQL is read with `docker exec hd_postgres psql ...`.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROBOT_LOG = os.environ.get('HD_ROBOT_LOG', os.path.join(HERE, '..', 'logs', 'robot_service.jsonl'))
PG_CONTAINER = os.environ.get('HD_PG_CONTAINER', 'hd_postgres')
PG_USER = os.environ.get('HD_PG_USER', 'hd_app')
PG_DB = os.environ.get('HD_PG_DB', 'homedepot')

ARRIVAL_LIMIT_S = 180        # a /tour/start must lead to "arrived" within this time
DISAGREE_LIMIT_S = 30        # robot and phone may disagree this long
HOME_LIMIT_S = 180           # after a visit ends, the robot must be home within this time
AI_SLOW_MS = 15000
CUSTOMER_WAIT_MS = 25000     # a phone call must be answered within this time
TIMEOUT_MINUTES = 10         # the workflow's timeout (Config node)
MAX_STEPS = 6
UTC = timezone.utc


# =========================================================================
# Reading the logs
# =========================================================================
def parse_ts(text):
    try:
        text = str(text).replace('Z', '+00:00')
        # Python < 3.11 accepts only 3 or 6 fractional digits; PostgreSQL writes 1 to 6
        text = re.sub(r'(\.\d{1,6})', lambda m: m.group(1).ljust(7, '0'), text, count=1)
        ts = datetime.fromisoformat(text)
        return ts if ts.tzinfo else ts.replace(tzinfo=UTC)
    except (TypeError, ValueError):
        return None


def psql(sql):
    """Rows of a query that returns one JSON value per row."""
    command = ['docker', 'exec', PG_CONTAINER, 'psql', '-U', PG_USER, '-d', PG_DB, '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql]
    done = subprocess.run(command, capture_output=True, text=True, timeout=60)
    if done.returncode != 0:
        raise RuntimeError(f'psql failed: {done.stderr.strip()[:400]}')
    return [json.loads(line) for line in done.stdout.splitlines() if line.strip()]


def load_db(since):
    rows = psql("SELECT row_to_json(e) FROM event_log e WHERE ts >= '%s' ORDER BY ts, id" % since.isoformat())
    entries = []
    for r in rows:
        entries.append({'ts': parse_ts(r['ts']), 'source': r['source'], 'level': r['level'], 'session_id': r['session_id'],
                        'request_id': r['request_id'], 'endpoint': r['endpoint'], 'event': r['event'],
                        'details': r['details'] or {}, 'duration_ms': r['duration_ms'], 'execution_id': r['execution_id'],
                        'origin': f'db#{r["id"]}', 'order': r['id']})
    return entries


def load_sessions(since):
    rows = psql("SELECT row_to_json(s) FROM (SELECT session_id, status, screen, created_at, last_input_at, ended_at "
                "FROM sessions WHERE created_at >= '%s' OR status = 'active' ORDER BY created_at) s" % since.isoformat())
    for r in rows:
        for k in ('created_at', 'last_input_at', 'ended_at'):
            r[k] = parse_ts(r[k]) if r[k] else None
    return {r['session_id']: r for r in rows}


def load_robot(since):
    entries = []
    for path in (ROBOT_LOG + '.1', ROBOT_LOG):
        if not os.path.exists(path):
            continue
        name = 'jsonl.1' if path.endswith('.1') else 'jsonl'
        with open(path, encoding='utf-8', errors='replace') as f:
            for number, line in enumerate(f, 1):
                try:
                    e = json.loads(line)
                except ValueError:
                    continue
                ts = parse_ts(e.get('ts'))
                if not ts or ts < since:
                    continue
                entries.append({'ts': ts, 'source': e.get('source', 'robot'), 'level': e.get('level', 'info'),
                                'session_id': e.get('session_id'), 'request_id': None, 'endpoint': None,
                                'event': e.get('event'), 'details': e.get('details') or {},
                                'duration_ms': e.get('duration_ms'), 'execution_id': (e.get('details') or {}).get('n8n_execution'),
                                'origin': f'{name}:{number}', 'order': number})
    return entries


SOURCE_ORDER = {'n8n': 0, 'robot': 1, 'phone': 2, 'stage': 3, 'tool': 4}


def load_all(since):
    entries = load_db(since) + load_robot(since)
    entries.sort(key=lambda e: (e['ts'], SOURCE_ORDER.get(e['source'], 9), e['order']))
    return entries, load_sessions(since)


# =========================================================================
# Printing
# =========================================================================
def hhmmss(ts):
    return ts.astimezone().strftime('%H:%M:%S.%f')[:-3] if ts else '--:--:--.---'


def brief(value, n=90):
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    text = text.replace('\n', ' ')
    return text if len(text) <= n else text[:n - 1] + '…'


def describe(e):
    """One line saying what an entry means."""
    d, ev = e['details'], e['event']
    ms = f' {e["duration_ms"]} ms' if e.get('duration_ms') is not None else ''
    if ev == 'state_saved':
        if d.get('applied') is False and d.get('wanted_to_write'):
            return f'NOT SAVED ({d.get("refused_because")}): visit is {d.get("status_before")} on {d.get("screen_before")}' + \
                (f', orders not sent {",".join(d["orders"])}' if d.get('orders') else '')
        text = f'screen {d.get("screen_before")} -> {d.get("screen_after")}'
        if d.get('status_before') != d.get('status_after'):
            text += f', visit {d.get("status_before")} -> {d.get("status_after")}'
        if d.get('item_sku'):
            text += f', item {d["item_sku"]}' + (' light on' if d.get('light_on') else '')
        if d.get('orders'):
            text += f', orders {",".join(d["orders"])}'
        if d.get('retry_reply'):
            text += ', "please send it again"'
        if d.get('wait_ms') is not None and d['wait_ms'] > 1000:
            text += f', caller waited {d["wait_ms"] / 1000:.1f} s'
        inp = d.get('input') or {}
        said = inp.get('text') or inp.get('answer') or inp.get('skus') or inp.get('event')
        if said:
            text += f'  <- {brief(said, 60)}'
        return text
    if ev == 'session_start':
        return 'new visit' + (f', closed {d["closed_visits"]}' if d.get('closed_visits') else '')
    if ev == 'ai_skip':
        return f'{(d.get("node") or "").split(":")[0]} {d.get("model")} skipped: ' + \
            {'no_claude_key': 'no Claude key', 'voice_note': 'Claude cannot hear a voice note'}.get(d.get('reason'), str(d.get('reason')))
    if ev == 'ai_call':
        node = (d.get('node') or '').split(':')[0]
        text = f'{node} {d.get("model")}{ms} ' + (f'try {d["attempt"]} ' if (d.get('attempt') or 1) > 1 else '') + \
            ('ok' if d.get('ok') else 'FAILED') + (' (garbled question)' if d.get('garbled_question') else '')
        if d.get('failure'):
            text += f' [{d["failure"]}' + (f', rests {d["rest_s"]} s' if d.get('rest_s') else '') + ']'
        if d.get('skipped_resting'):
            text += f' (skipped resting: {", ".join(d["skipped_resting"])})'
        if d.get('http_error'):
            text += f' http_error={brief(d["http_error"], 80)}'
        if d.get('missing_fields'):
            text += f' missing={d["missing_fields"]}'
        if 'verdict' in d:
            text += f' relevant={d.get("relevant")}'
        if d.get('answer_type'):
            text += f' -> {d["answer_type"]}'
            if d['answer_type'] == 'items' or d.get('items_suggested'):
                text += f' items {d.get("items_kept")}/{d.get("items_suggested")}'
            if d.get('dropped_unknown_skus'):
                text += f' dropped_unknown={d["dropped_unknown_skus"]}'
            if d.get('question'):
                text += f' q="{brief(d["question"], 50)}" options={len(d.get("options") or [])}'
        if 'steps_raw' in d:
            text += f' steps {d.get("steps_kept")}/{d.get("steps_raw")} videos {d.get("videos_kept")}'
        if d.get('raw_answer'):
            text += f' raw="{brief(d["raw_answer"], 60)}"'
        return text
    if ev == 'robot_event':
        text = f'{d.get("robot_event")} {d.get("sku") or ""}'.strip()
        if d.get('distance_m') is not None:
            text += f' ({d["distance_m"]} m)'
        if d.get('ignored_because') == 'home_recorded':
            return text + ' (recorded)'
        return text + (f' applied: {d.get("effect")}' if d.get('applied') else f' ignored: {d.get("ignored_because")}'
                       + (f' (current item {d.get("current_sku")})' if d.get('current_sku') else ''))
    if ev == 'robot_order':
        what = d.get('sku') or d.get('tag_code') or d.get('reason') or ''
        return (f'#{d.get("seq")} {d.get("path")} {what} -> ' + (f'HTTP {d.get("http_status")}' if d.get('ok') else
                f'FAILED {d.get("http_status") or ""} {brief(d.get("error") or "", 70)}') +
                (f', robot {d["robot_state"]}' if d.get('robot_state') else '') + ms)
    if ev == 'call_refused':
        return f'{d.get("http_status")} {d.get("error")}' + (f' (screen {d["screen"]})' if d.get('screen') else '') + \
            f'  <- {brief(d.get("input") or {}, 60)}'
    if ev in ('guide_to_item', 'item_done'):
        return f'item {d.get("index")}/{d.get("total")} {d.get("sku")}' + (f' next {d["next_sku"]}' if d.get('next_sku') else '')
    if ev == 'items_chosen':
        return f'sent {d.get("skus_sent")} on trip {d.get("skus_on_trip")}' + (f' NOT FOUND {d["not_found"]}' if d.get('not_found') else '')
    if ev == 'timeout_close':
        return f'closed after {d.get("timeout_minutes")} min idle (screen {d.get("screen_before")}, last input {d.get("last_input_at")})'
    if ev == 'session_closed_by_new_visit':
        return f'closed by new visit {d.get("new_session_id")} (screen was {d.get("screen")})'
    # robot service
    if ev == 'http':
        b = d.get('body') if isinstance(d.get('body'), dict) else {}
        what = (b.get('stop') or {}).get('sku') or b.get('tag_code') or b.get('reason') or ''
        r = d.get('result') or {}
        tag = f' [n8n {d.get("n8n_execution")}#{d.get("n8n_order")}]' if d.get('n8n_execution') else ''
        return f'{d.get("method")} {d.get("path")} {what}{tag} -> {d.get("http_status")}' + (f', robot {r.get("state")}' if r else '') + \
            (f' {brief(d.get("errors"), 80)}' if d.get('errors') else '')
    if ev == 'state_change':
        return f'robot {d.get("from")} -> {d.get("to")} ({d.get("why")})' + (f' item {d["sku"]}' if d.get('sku') else '')
    if ev.startswith('nav_goal') or ev in ('near', 'arrived', 'home', 'arrival_superseded'):
        text = f'{d.get("kind")} {d.get("sku") or ""}'.strip()
        for k in ('attempt', 'attempts', 'distance_m', 'after_s'):
            if d.get(k) is not None:
                text += f' {k}={d[k]}'
        if d.get('pose'):
            p = d['pose']
            text += f' pose=({p["x"]},{p["y"]})'
        return text
    if ev == 'light':
        return f'{d.get("tag_code")} {"ON" if d.get("on") else "off"} (robot {d.get("robot_state")}' + \
            (f', {d["distance_m"]} m' if d.get('distance_m') is not None else '') + ')'
    if ev == 'event_sent':
        return f'-> n8n {d.get("robot_event")} {d.get("sku") or ""} ' + \
            (f'HTTP {d.get("http_status")}' if d.get('ok') else f'FAILED {brief(d.get("problems"), 80)}') + ms
    if ev == 'proxy':
        return f'{d.get("method")} {d.get("path")} -> {d.get("http_status")}' + \
            (f' {d["reply_screen"]}' if d.get('reply_screen') else '') + \
            (f' {d.get("reply_error") or ""} {brief(d.get("reply_message") or d.get("error") or "", 70)}' if d.get('http_status', 200) >= 400 or d.get('reply_error') else '') + ms
    if ev == 'screen_drawn':
        return f'phone draws {d.get("screen")}' + (f' item {d["sku"]}' if d.get('sku') else '') + \
            (' light on' if d.get('light_on') else '') + (' (local)' if d.get('local') else '')
    if ev == 'stage_screen':
        return f'stage sees {d.get("from")} -> {d.get("screen")}'
    return brief({k: v for k, v in d.items() if v is not None}, 120)


def entry_line(e, verbose=False):
    mark = {'warn': '!', 'error': '!!'}.get(e['level'], ' ')
    ctx = e['endpoint'] or ''
    if e['source'] == 'n8n' and e.get('execution_id'):
        ctx = f'{ctx} x{e["execution_id"]}'
    try:
        text = describe(e)
    except Exception:              # an entry of an unexpected shape: show it raw rather than fail
        text = brief(e['details'], 120)
    line = f'{hhmmss(e["ts"])} {mark:2} {e["source"]:6} {ctx[:24]:24} {str(e["event"])[:22]:22} {text}'
    if verbose:
        line += '\n' + ' ' * 16 + json.dumps(e['details'], ensure_ascii=False, default=str)
    return line


# =========================================================================
# The checks
# =========================================================================
class Problems:
    def __init__(self):
        self.items = []

    def add(self, check, session, message, evidence, level='error'):
        evidence = [e for e in evidence if e]
        self.items.append({'check': check, 'session_id': session, 'level': level, 'message': message,
                           'ts': min((e['ts'] for e in evidence), default=None), 'evidence': evidence})


def by(entries, source=None, event=None, session=None):
    return [e for e in entries if (source is None or e['source'] == source) and (event is None or e['event'] == event)
            and (session is None or e['session_id'] == session)]


def robot_timeline(entries):
    """[(ts, state, session_id, entry)] of the robot, from its state changes and restarts."""
    out = []
    for e in entries:
        if e['source'] != 'robot':
            continue
        if e['event'] == 'service_start':
            out.append((e['ts'], 'idle', None, e))
        elif e['event'] == 'state_change':
            out.append((e['ts'], e['details'].get('to'), e['session_id'], e))
    return out


def screen_timeline(entries, session):
    out = []
    for e in entries:
        if e['source'] == 'n8n' and e['session_id'] == session:
            if e['event'] == 'session_start':
                out.append((e['ts'], 'input', 'active', e))
            elif e['event'] == 'state_saved' and e['details'].get('screen_after') and e['details'].get('applied') is not False:
                out.append((e['ts'], e['details']['screen_after'], e['details'].get('status_after'), e))
            elif e['event'] == 'session_closed_by_new_visit':
                out.append((e['ts'], 'timed_out', 'ended', e))
    return out


def at(timeline, ts):
    """The last timeline point at or before ts."""
    found = None
    for point in timeline:
        if point[0] <= ts:
            found = point
        else:
            break
    return found


def run_checks(entries, sessions, scope, now):
    p = Problems()
    robot = [e for e in entries if e['source'] == 'robot']
    robot_states = robot_timeline(entries)
    have_robot_log = bool(robot)

    def robot_arrivals(session, sku):
        return [e for e in robot if e['event'] == 'arrived' and e['session_id'] == session and e['details'].get('sku') == sku]

    for s in scope:
        mine = [e for e in entries if e['session_id'] == s]
        n8n = [e for e in mine if e['source'] == 'n8n']
        rob = [e for e in mine if e['source'] == 'robot']
        pages = [e for e in mine if e['source'] in ('phone', 'stage', 'page', 'tool')]

        # ---- the phone showed "arrived" before the robot arrived
        saved = [e for e in by(n8n, event='state_saved') if e['details'].get('applied') is not False]
        for e in saved:
            d = e['details']
            if d.get('screen_after') == 'arrived' and d.get('screen_before') != 'arrived' and have_robot_log:
                sku = d.get('item_sku')
                if not [a for a in robot_arrivals(s, sku) if a['ts'] <= e['ts'] + timedelta(seconds=1)]:
                    cause = [x for x in by(n8n, event='robot_event') if x.get('execution_id') == e.get('execution_id')]
                    p.add('arrived_without_robot_arrival', s, f'phone screen became "arrived" for {sku}, but the robot log '
                          f'has no "arrived" for that item before it', [e] + cause)
        for e in by(pages, event='screen_drawn'):
            d = e['details']
            if d.get('screen') == 'arrived' and not d.get('local') and have_robot_log:
                if not [a for a in robot_arrivals(s, d.get('sku')) if a['ts'] <= e['ts'] + timedelta(seconds=1)]:
                    p.add('arrived_without_robot_arrival', s, f'the phone page drew "arrived" for {d.get("sku")} before the '
                          'robot arrived there', [e])

        # ---- shelf light on only after arrival (the "near" step was missed or late)
        for a in by(rob, event='arrived'):
            tag, sku = a['details'].get('tag_code'), a['details'].get('sku')
            starts = [x for x in rob if x['event'] == 'state_change' and x['details'].get('why') == 'tour/start'
                      and x['details'].get('sku') == sku and x['ts'] <= a['ts']]
            leg_start = starts[-1]['ts'] if starts else a['ts'] - timedelta(seconds=ARRIVAL_LIMIT_S)
            lights = [x for x in rob if x['event'] == 'light' and x['details'].get('tag_code') == tag and x['details'].get('on')]
            before = [x for x in lights if leg_start <= x['ts'] <= a['ts']]
            after = [x for x in lights if a['ts'] < x['ts'] <= a['ts'] + timedelta(seconds=60)]
            near = [x for x in rob if x['event'] == 'near' and x['details'].get('sku') == sku and leg_start <= x['ts'] <= a['ts']]
            if not before:
                p.add('light_only_after_arrival', s, f'shelf light {tag} ({sku}) was not on before the robot arrived'
                      + ('' if near else ' (no "near" in the robot log for this leg)')
                      + (', it came on only after arrival' if after else ', and not after it either'),
                      ([starts[-1]] if starts else []) + near + [a] + after[:1])
        for e in by(n8n, event='robot_event'):
            d = e['details']
            if d.get('robot_event') == 'arrived' and d.get('applied') and d.get('light_was_on') is False:
                p.add('near_missed', s, f'n8n got "arrived" for {d.get("sku")} while the light was still off on the phone '
                      '("near" never reached n8n)', [e])

        # ---- "I am done" accepted while the phone was not on "arrived"
        for e in saved:
            if e['endpoint'] == 'help/next' and e['details'].get('screen_before') != 'arrived':
                p.add('done_accepted_without_arrival', s, f'"I am done" was accepted on screen '
                      f'"{e["details"].get("screen_before")}"', [e])

        # ---- a /tour/start that never led to "arrived"
        starts = [e for e in rob if e['event'] == 'http' and e['details'].get('path') == '/tour/start'
                  and e['details'].get('http_status') == 200]
        if not have_robot_log:
            starts = [e for e in n8n if e['event'] == 'robot_order' and e['details'].get('path') == '/tour/start' and e['details'].get('ok')]
        for e in starts:
            sku = ((e['details'].get('body') or {}).get('stop') or {}).get('sku') or e['details'].get('sku')
            limit = e['ts'] + timedelta(seconds=ARRIVAL_LIMIT_S)
            arrived = [a for a in robot_arrivals(s, sku) if e['ts'] <= a['ts'] <= limit]
            later = [x for x in robot if x['event'] == 'state_change' and x['ts'] > e['ts'] and x['ts'] <= limit
                     and x['details'].get('why') in ('tour/start', 'tour/done') and x['details'].get('sku') != sku]
            if not arrived and not later and now > limit:
                p.add('tour_start_without_arrival', s, f'/tour/start for {sku} at {hhmmss(e["ts"])}: no "arrived" within '
                      f'{ARRIVAL_LIMIT_S} s', [e] + [x for x in rob if x['event'].startswith('nav_goal') and e['ts'] <= x['ts'] <= limit][:4])

        # ---- the robot and the phone disagree for too long
        screens = screen_timeline(entries, s)
        if screens and robot_states:
            points = sorted({t for t, *_ in screens} | {t for t, *_ in robot_states if t >= screens[0][0]})
            end = now
            if sessions.get(s, {}).get('ended_at'):
                end = min(now, sessions[s]['ended_at'] + timedelta(seconds=HOME_LIMIT_S))
            points = [t for t in points if t <= end] + [end]
            current = None
            for t0, t1 in zip(points, points[1:]):
                sc, rb = at(screens, t0), at(robot_states, t0)
                issue = None
                if sc and rb:
                    screen, status, state, rsession = sc[1], sc[2], rb[1], rb[2]
                    if status == 'active' and screen == 'guiding' and (state in ('idle', 'done', 'returning_home') or rsession != s):
                        issue = f'phone shows "guiding" but the robot is {state}' + ('' if rsession == s else f' for visit {rsession}')
                    elif status == 'active' and screen == 'guiding' and state == 'waiting_for_pick':
                        issue = 'the robot waits at the shelf but the phone still shows "guiding" (arrival not applied)'
                    elif status == 'active' and screen == 'arrived' and (state != 'waiting_for_pick' or rsession != s):
                        issue = f'phone shows "arrived" but the robot is {state}' + ('' if rsession == s else f' for visit {rsession}')
                    elif status in ('ended', 'timed_out') and rsession == s and state in ('navigating', 'waiting_for_pick', 'idle'):
                        issue = f'the visit is over ({screen}) but the robot is still {state} for it (never sent home?)'
                if issue and current and current[0] == issue:
                    current[2] = t1
                    continue
                if current and (current[2] - current[1]).total_seconds() > DISAGREE_LIMIT_S:
                    p.add('robot_phone_disagree', s, f'{current[0]} for {(current[2] - current[1]).total_seconds():.0f} s '
                          f'(from {hhmmss(current[1])})', current[3])
                current = [issue, t0, t1, [sc[3], rb[3]]] if issue else None
            if current and (current[2] - current[1]).total_seconds() > DISAGREE_LIMIT_S:
                p.add('robot_phone_disagree', s, f'{current[0]} for {(current[2] - current[1]).total_seconds():.0f} s '
                      f'(from {hhmmss(current[1])})' + (' and still now' if current[2] >= now - timedelta(seconds=1) else ''), current[3])

        # ---- the AI
        for e in by(n8n, event='ai_call'):
            d = e['details']
            node = d.get('node')
            if not d.get('ok'):
                why = d.get('http_error') or (f'garbled question: {d["garbled_question"]}' if d.get('garbled_question') else None) \
                    or (f'missing fields {d.get("missing_fields")}' if d.get('missing_fields') else
                                              'answer is not JSON' if not d.get('parsed') else 'unusable answer')
                # a later try of the same AI call in the same run (the workflow's "Try AI 1 again?" / "Time left for
                # another try?" branches) that worked: the customer was not affected
                recovered = [x for x in by(n8n, event='ai_call') if x['execution_id'] == e['execution_id']
                             and x['details'].get('node') == node and x['details'].get('ok')
                             and (x['details'].get('attempt') or 1) > (d.get('attempt') or 1)]
                if e['level'] == 'warn' and d.get('parsed'):     # the workflow filled the gap (e.g. a missing title)
                    p.add('ai_answer_incomplete', s, f'{node} ({d.get("model")}): {brief(why, 200)}; filled in by the workflow', [e], 'warn')
                elif recovered:
                    p.add('ai_try_failed_retried', s, f'{node} ({d.get("model")}) try {d.get("attempt") or 1} failed: '
                          f'{brief(why, 200)}; try {recovered[0]["details"].get("attempt")} worked', [e, recovered[0]], 'warn')
                else:
                    p.add('ai_call_failed', s, f'{node} ({d.get("model")}) failed: {brief(why, 200)}'
                          + (f'; raw answer: {brief(d["raw_answer"], 200)}' if d.get('raw_answer') else ''), [e])
            if (e.get('duration_ms') or 0) > AI_SLOW_MS:
                p.add('ai_call_slow', s, f'{node} took {e["duration_ms"] / 1000:.1f} s (limit {AI_SLOW_MS / 1000:.0f} s)', [e], 'warn')
            if d.get('answer_type') == 'items' and d.get('items_kept') == 0:
                p.add('ai_items_empty', s, f'{node} answered with items, but none were usable', [e])
            q = d.get('question') or ''
            sloppy = r'\*\*|__|`|^\s*([-*•]|\d+[.)])\s|\n\s*([-*•]|\d+[.)])\s|\boptions?\s*:|\(\s*[a-d]\s*\)'
            if d.get('answer_type') == 'question' and not d.get('options') and re.search(sloppy, q, re.I | re.M):
                shown = d.get('question_shown') or ''
                if 'question_shown' in d and not re.search(sloppy, shown, re.I | re.M):
                    p.add('ai_options_in_question_text', s, 'AI 2 put choices / markdown inside the question text; the workflow '
                          f'cleaned it up (shown: "{brief(shown, 100)}", options {d.get("options_shown")})', [e], 'warn')
                else:
                    p.add('ai_options_in_question_text', s, 'AI 2 put choices / markdown inside the question text while '
                          f'"options" is empty: {brief(q, 200)}', [e])
            budget = d.get('budget_known') or d.get('budget_stated_now')
            # the budget counts the first-choice ("main") items and the tools, not the alternatives
            counted = d.get('items_total_budgeted', d.get('items_total')) or 0
            if d.get('shown') == 'items' and budget and counted > float(budget) * 1.1:
                p.add('items_over_budget', s, f'AI 2\'s main items and tools cost ${counted} for a ${budget} budget'
                      + (f' (the whole list with alternatives: ${d["items_total"]})' if d.get('items_total') != counted else ''), [e], 'warn')
            # (budget_rule_applied: AI 2 picked items before the budget was known and n8n asked for it. That is the
            # normal path since AI 2 is told not to ask about the budget itself, so it is not reported.)
            if d.get('dropped_unknown_skus'):
                p.add('ai_unknown_skus_dropped', s, f'AI 2 suggested SKUs that are not in the catalogue (dropped): '
                      f'{d["dropped_unknown_skus"]}', [e], 'warn')
            if 'steps_raw' in d and (not d.get('steps_raw') or d['steps_raw'] > MAX_STEPS):
                p.add('repair_steps_bad', s, f'AI 3 gave {d.get("steps_raw")} repair steps (expected 1 to {MAX_STEPS}; '
                      f'{d.get("steps_kept")} kept)', [e])
        for e in by(n8n, event='ai_failed_reply'):
            d = e['details']
            p.add('ai_gave_up', s, f'{d.get("node")}: no model answered in time, the customer got '
                  + ('"please type it" (a voice note, and Claude cannot listen)' if d.get('shown') == 'voice_needs_text_message'
                     else '"please send it again"')
                  + (f'; tried {", ".join(d["models_tried"])}' if d.get('models_tried') else '')
                  + (f'; now resting: {", ".join(d["rested"])}' if d.get('rested') else ''), [e])
        for e in by(n8n, event='items_chosen'):
            left_out = (e['details'].get('not_found') or []) + (e['details'].get('not_on_list') or [])
            if left_out:
                p.add('chosen_sku_unknown', s, f'the phone sent SKUs that were not on the suggested list (left out): {left_out}', [e], 'warn')
        for e in by(n8n, event='state_saved'):
            d = e['details']
            if (d.get('wait_ms') or 0) > CUSTOMER_WAIT_MS and str(e['endpoint'] or '').startswith('help/'):
                p.add('customer_wait_long', s, f'{e["endpoint"]}: the caller waited {d["wait_ms"] / 1000:.1f} s for the answer '
                      f'(limit {CUSTOMER_WAIT_MS / 1000:.0f} s)', [e])
            if d.get('applied') is False and d.get('wanted_to_write') and d.get('orders') and d.get('refused_because') == 'visit_not_active':
                p.add('late_run_ignored', s, f'a {e["endpoint"]} run finished after the visit had closed: nothing saved, robot '
                      f'orders not sent ({",".join(d["orders"])})', [e], 'warn')

        # ---- robot events and robot orders
        for e in by(n8n, event='robot_event'):
            d = e['details']
            if not d.get('applied') and d.get('ignored_because') != 'home_recorded':
                p.add('robot_event_ignored', s, f'robot event "{d.get("robot_event")}" for {d.get("sku")} was ignored: '
                      f'{d.get("ignored_because")} (current item {d.get("current_sku")}, screen {d.get("screen_before")})', [e], 'warn')
        for e in by(n8n, event='call_refused'):
            if e['endpoint'] == 'robot/event':
                p.add('robot_event_refused', s, f'n8n refused a robot event: {e["details"].get("http_status")} '
                      f'{e["details"].get("error")}', [e])
        for e in by(n8n, event='robot_order'):
            if not e['details'].get('ok'):
                p.add('robot_order_failed', s, f'{e["details"].get("path")} failed: HTTP {e["details"].get("http_status")} '
                      f'{brief(e["details"].get("error") or "", 160)}', [e])
        for e in by(rob, event='http'):
            if (e['details'].get('http_status') or 200) >= 400:
                p.add('robot_order_failed', s, f'the robot service answered {e["details"].get("http_status")} to '
                      f'{e["details"].get("path")}: {brief(e["details"].get("errors"), 160)}', [e])
        for e in by(rob, event='pick_ignored'):
            p.add('tour_next_out_of_order', s, f'/tour/next arrived while the robot was {e["details"].get("state")} '
                  '(not waiting at a shelf): the orders reached the robot out of order or late', [e], 'warn')
        for e in by(rob, event='event_sent'):
            if not e['details'].get('ok'):
                p.add('robot_event_not_delivered', s, f'the robot could not tell n8n "{e["details"].get("robot_event")}": '
                      f'{brief(e["details"].get("problems"), 200)}', [e])
        for e in by(rob, event='pose_jump'):
            p.add('robot_localization_jump', s, f'the robot\'s position jumped {e["details"].get("jump_m")} m from '
                  f'{e["details"].get("before")} to {e["details"].get("after")} (localization reset)', [e])
        for e in by(rob, event='nav_goal_gave_up'):
            d = e['details']
            reached = d.get('reached', True)
            p.add('nav2_gave_up', s, f'Nav2 gave up on {d.get("kind")} {d.get("sku") or ""} {d.get("distance_m")} m from the goal; '
                  + ('counted as reached (close enough)' if reached else
                     'reported with reached=false (the phone says where the item is; the shelf light is on)'),
                  [e], 'warn' if reached else 'error')

        # ---- a visit that ended without the robot getting home
        info = sessions.get(s) or {}
        ended = info.get('ended_at')
        had_robot = [e for e in mine if (e['event'] == 'robot_order') or (e['source'] == 'robot' and e['event'] == 'http')]
        if info.get('status') in ('ended', 'timed_out') and ended and had_robot and now > ended + timedelta(seconds=HOME_LIMIT_S):
            home = [e for e in rob if e['event'] in ('home',) and ended - timedelta(seconds=5) <= e['ts'] <= ended + timedelta(seconds=HOME_LIMIT_S)]
            if not home:
                last = [e for e in mine if e['source'] == 'robot'][-3:]
                closer = [e for e in n8n if e['event'] in ('session_end', 'timeout_close', 'session_closed_by_new_visit')]
                p.add('visit_ended_robot_not_home', s, f'the visit ended ({info.get("screen")}) at {hhmmss(ended)} but the robot '
                      f'did not get home for it within {HOME_LIMIT_S} s', closer + last)
        if info.get('status') == 'active' and info.get('last_input_at') and \
                now - info['last_input_at'] > timedelta(minutes=TIMEOUT_MINUTES + 2):
            p.add('timeout_not_applied', s, f'the visit is still active {(now - info["last_input_at"]).total_seconds() / 60:.0f} '
                  f'min after the last input (timeout is {TIMEOUT_MINUTES} min)', [e for e in n8n][-1:])

        # ---- the pages and the logging itself
        for e in pages:
            if e['event'] == 'js_error':
                p.add('page_js_error', s, f'{e["source"]} page: {brief(e["details"].get("message"), 200)}', [e])
            elif e['event'] in ('fetch_failed', 'webhook_error') and (e['details'].get('http_status') or 500) >= 500:
                p.add('page_call_failed', s, f'{e["source"]} page: {e["details"].get("path")} '
                      f'{e["details"].get("http_status") or ""} {brief(e["details"].get("error") or e["details"].get("message"), 120)}', [e])
        for e in mine:
            if e['event'] == 'event_queue_backlog':
                p.add('robot_event_backlog', s, f'{e["details"].get("waiting")} robot events waited to be delivered to n8n', [e], 'warn')
            if e['event'] in ('log_error', 'worker_error'):
                p.add(e['event'], s, brief(e['details'], 200), [e])
            if e['event'] == 'proxy' and e['level'] == 'error':
                p.add('webhook_failed', s, f'{e["details"].get("path")} -> {e["details"].get("http_status")} '
                      f'{brief(e["details"].get("error") or e["details"].get("reply_message") or "", 120)}', [e])

    # ---- more than one active visit at a time
    ordered = sorted(sessions.values(), key=lambda r: r['created_at'])
    active = [r for r in ordered if r['status'] == 'active']
    if len(active) > 1:
        p.add('several_active_visits', None, f'{len(active)} visits are active right now: {[r["session_id"] for r in active]}',
              [], 'error')
    for a_n, a in enumerate(ordered):
        for b in ordered[a_n + 1:]:
            if a['session_id'] not in scope and b['session_id'] not in scope:
                continue
            if b['created_at'] > (a['ended_at'] or now) - timedelta(seconds=2):
                continue
            p.add('several_active_visits', b['session_id'], f'visit {b["session_id"]} started at {hhmmss(b["created_at"])} while '
                  f'visit {a["session_id"]} was still active (until {hhmmss(a["ended_at"]) if a["ended_at"] else "now"})',
                  by(entries, event='session_start', session=b['session_id']))

    # ---- problems without a visit (pages before a visit, robot errors) in the time window
    if scope:
        starts = [sessions[s]['created_at'] for s in scope if s in sessions and sessions[s].get('created_at')]
        first = min(starts) - timedelta(seconds=10) if starts else None
        for e in entries:
            if e['session_id'] or (first and e['ts'] < first):
                continue
            if e['event'] in ('js_error', 'worker_error', 'log_error'):
                p.add(e['event'], None, f'{e["source"]}: {brief(e["details"], 200)}', [e])
        last = max([sessions[s]['ended_at'] or now for s in scope if s in sessions] or [now]) + timedelta(seconds=HOME_LIMIT_S)
        for e in entries:   # the robot's localization jumped (e.g. AMCL reset to the map origin)
            if e['source'] == 'robot' and e['event'] == 'pose_jump' and (not first or first <= e['ts'] <= last) \
                    and (e['session_id'] is None or e['session_id'] not in scope):
                p.add('robot_localization_jump', e['session_id'], f'the robot\'s position jumped {e["details"].get("jump_m")} m '
                      f'from {e["details"].get("before")} to {e["details"].get("after")} (localization reset)', [e])
        for e in entries:   # robot events for visits n8n does not know (the robot is serving a visit that does not exist)
            if (first and e['ts'] < first) or e['session_id'] in sessions or e['session_id'] in scope:
                continue
            if e['event'] == 'call_refused' and e['endpoint'] == 'robot/event':
                p.add('robot_event_refused', e['session_id'], f'n8n refused a robot event for an unknown visit: '
                      f'{e["details"].get("http_status")} {e["details"].get("error")}', [e])
    p.items.sort(key=lambda v: (v['ts'] or now, v['check']))
    return p.items


# =========================================================================
# Main
# =========================================================================
def parse_since(text, now):
    if not text:
        return now - timedelta(days=7)
    m = re.fullmatch(r'(\d+)\s*([smhd])', text.strip())
    if m:
        return now - timedelta(**{{'s': 'seconds', 'm': 'minutes', 'h': 'hours', 'd': 'days'}[m.group(2)]: int(m.group(1))})
    ts = parse_ts(text)
    if not ts:
        raise SystemExit(f'--since: "{text}" is neither like 30m / 2h / 1d nor an ISO time')
    return ts


def choose_scope(args, entries, sessions):
    if args.session:
        return args.session
    known = sorted(sessions.values(), key=lambda r: r['created_at'])
    if args.all:
        logged = {e['session_id'] for e in entries if e['session_id']}
        return [r['session_id'] for r in known if r['session_id'] in logged]
    return [r['session_id'] for r in known][-args.last:]


def print_report(args, entries, sessions, scope, problems):
    if not args.checks_only:
        for s in scope:
            info = sessions.get(s, {})
            mine = [e for e in entries if e['session_id'] == s]
            print(f'\n=== visit {s}: {info.get("status", "?")}, screen {info.get("screen", "?")}, started '
                  f'{hhmmss(info.get("created_at"))}' + (f', ended {hhmmss(info["ended_at"])}' if info.get('ended_at') else '')
                  + f', {len(mine)} log entries')
            if not mine:
                print('    (no log entries: the visit is older than the event log, or --since is too short)')
            for e in mine:
                if args.quiet_pages and e['source'] in ('phone', 'stage') and e['level'] == 'info':
                    continue
                print(entry_line(e, args.verbose))
    print(f'\n=== checks: {len(scope)} visit(s), {len(entries)} log entries read')
    if not problems:
        print('no problems found')
    for v in problems:
        print(f'\n[{v["level"].upper()}] {v["check"]}' + (f'  visit {v["session_id"]}' if v['session_id'] else '') + f'\n    {v["message"]}')
        for e in v['evidence'][:8]:
            print(f'      {e["origin"]:>14}  ' + entry_line(e))


def as_json(e):
    return {**{k: v for k, v in e.items() if k not in ('ts', 'order')}, 'ts': e['ts'].isoformat()}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__.split('\n', 2)[2])
    ap.add_argument('--session', action='append', help='a session id (can be given several times)')
    ap.add_argument('--last', type=int, default=3, help='the latest N visits (default 3)')
    ap.add_argument('--all', action='store_true', help='every visit with log entries since --since')
    ap.add_argument('--since', help='how far back to read: 30m, 2h, 1d or an ISO time (default 7 days)')
    ap.add_argument('--checks-only', action='store_true', help='no time lines, only the problems')
    ap.add_argument('--quiet-pages', action='store_true', help='leave the pages\' info entries out of the time lines')
    ap.add_argument('--json', action='store_true', help='print JSON: {sessions, timeline, problems}')
    ap.add_argument('--follow', action='store_true', help='keep watching and print new problems and warnings')
    ap.add_argument('-v', '--verbose', action='store_true', help='print every entry\'s full details')
    args = ap.parse_args()

    now = datetime.now(UTC)
    since = parse_since(args.since, now)
    try:
        entries, sessions = load_all(since)
    except Exception as error:
        print(f'could not read the logs: {error}', file=sys.stderr)
        return 2

    if args.follow:
        return follow(args, since)

    scope = choose_scope(args, entries, sessions)
    problems = run_checks(entries, sessions, scope, now)
    if args.json:
        print(json.dumps({'sessions': {s: {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in sessions.get(s, {}).items()}
                                       for s in scope},
                          'timeline': [as_json(e) for e in entries if e['session_id'] in scope],
                          'problems': [{**v, 'ts': v['ts'].isoformat() if v['ts'] else None,
                                        'evidence': [as_json(e) for e in v['evidence']]} for v in problems]},
                         indent=1, ensure_ascii=False, default=str))
    else:
        print_report(args, entries, sessions, scope, problems)
    return 1 if problems else 0


def follow(args, since):
    """Re-reads the logs every few seconds; prints new warnings/errors and new problems (Ctrl-C to stop)."""
    seen_entries, seen_problems, first = set(), set(), True
    print('watching the logs (Ctrl-C to stop) ...', flush=True)
    while True:
        try:
            now = datetime.now(UTC)
            entries, sessions = load_all(max(since, now - timedelta(hours=6)))
            scope = args.session or [r['session_id'] for r in sorted(sessions.values(), key=lambda r: r['created_at'])][-max(args.last, 3):]
            problems = run_checks(entries, sessions, scope, now)
            for e in entries:
                if e['origin'] in seen_entries:
                    continue
                seen_entries.add(e['origin'])
                if not first and (e['level'] != 'info' or args.verbose):
                    print(entry_line(e), flush=True)
            for v in problems:
                key = v['check'] + '|' + '|'.join(e['origin'] for e in v['evidence']) + '|' + (v['message'] if not v['evidence'] else '')
                if key in seen_problems:
                    continue
                seen_problems.add(key)
                if not first or args.all:
                    print(f'\n[{v["level"].upper()}] {v["check"]}' + (f'  visit {v["session_id"]}' if v['session_id'] else '')
                          + f'\n    {v["message"]}', flush=True)
                    for e in v['evidence'][:6]:
                        print(f'      {e["origin"]:>14}  ' + entry_line(e), flush=True)
            first = False
            time.sleep(3)
        except KeyboardInterrupt:
            return 0
        except Exception as error:
            print(f'(could not read the logs: {error}; trying again)', file=sys.stderr, flush=True)
            time.sleep(5)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(0)
