#!/usr/bin/env python3
"""Plays the awkward cases of a visit against the running system and checks each one.
Needs the stand-in AI (python3 n8n/test/fake_gemini.py; ./n8n/setup.sh test/workflow_fake_ai.json):
it uses the stand-in's test words (test-slow, test-ai1-fails, test-ai2-garbage, test-markdown).

  1. the relevancy AI fails while a follow-up question waits -> same question, "please send it again"
  2. the main AI answers with no JSON -> same screen, "please send it again"
  3. options written into the question text with markdown -> clean question + tap-to-answer options
  4. a negative budget -> 400
  5. /help/confirm with SKUs that were not suggested -> 400, or left out with a note
  6. "near" and "arrived" handled at the same time -> the phone ends on "arrived" with the light on
  7. "I am done" tapped twice at once -> applied once
  8. the kiosk button while a visit is open -> old visit gets its summary, robot sent home
  9. a slow AI answer for a visit that was closed meanwhile -> nothing written
 10. "anything else? yes" then "no" from the input page -> finished
 11. the 10-minute timeout (faked) -> closed, robot home

    python3 tools/edge_case_test.py            (about 3 minutes; the robot drives)
"""
import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

N8N = os.environ.get('HD_N8N_URL', 'http://localhost:5678').rstrip('/') + '/webhook'
ROBOT = os.environ.get('HD_ROBOT_URL', 'http://localhost:8000').rstrip('/')
FAILED = []


def call(method, url, body=None, timeout=60):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(url, data=data, method=method, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as reply:
            return {'http': reply.status, **json.loads(reply.read() or '{}')}
    except urllib.error.HTTPError as error:
        text = error.read()
        try:
            return {'http': error.code, **json.loads(text or '{}')}
        except ValueError:
            return {'http': error.code, 'raw': text[:200]}


def post(path, body):
    return call('POST', f'{N8N}/{path}', body)


def status(session):
    return call('GET', f'{N8N}/help/status?session_id={session}')


def sql(query):
    out = subprocess.run(['docker', 'exec', 'hd_postgres', 'psql', '-U', 'hd_app', '-d', 'homedepot', '-At', '-c', query],
                         capture_output=True, text=True, timeout=30)
    return out.stdout.strip()


def check(name, ok, detail=''):
    print(f'  [{"ok" if ok else "FAIL"}] {name}' + (f'  ({detail})' if detail and not ok else ''))
    if not ok:
        FAILED.append(name)


def together(*calls):
    """Runs the calls at the same moment; returns their results in order."""
    results = [None] * len(calls)

    def run(n, fn):
        results[n] = fn()
    threads = [threading.Thread(target=run, args=(n, fn)) for n, fn in enumerate(calls)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return results


def wait_screen(session, screen, seconds=150):
    for _ in range(seconds * 2):
        s = status(session)
        if s.get('screen') == screen:
            return s
        time.sleep(0.5)
    return status(session)


def wait_robot(state, seconds=150):
    for _ in range(seconds):
        r = call('GET', f'{ROBOT}/tour/status')
        if r.get('state') == state:
            return r
        time.sleep(1)
    return call('GET', f'{ROBOT}/tour/status')


def new_visit():
    return post('help/start', {})['session_id']


def to_items(session, text='One of the boards on my deck is cracked', budget=80):
    reply = post('help/request', {'session_id': session, 'text': text, 'budget': budget})
    for answer in ('Wood', 'Not sure', 'Not sure'):
        if reply.get('screen') != 'question':
            break
        reply = post('help/request', {'session_id': session, 'text': answer})
    return reply


def main():
    print('robot service:', call('GET', f'{ROBOT}/health'))

    print('\n1-4. AI failures, sloppy questions, bad budget')
    s1 = new_visit()
    q = post('help/request', {'session_id': s1, 'text': 'my toilet keeps running'})
    check('a budget question first', q.get('screen') == 'question', q)
    r = post('help/request', {'session_id': s1, 'text': 'test-ai1-fails about $40'})
    check('AI 1 fails: same question stays', r.get('screen') == 'question' and r['data'].get('question') == q['data'].get('question'), r)
    check('AI 1 fails: retry message', r['data'].get('retry') is True and 'again' in r.get('message', ''), r)
    st = status(s1)
    check('AI 1 fails: nothing changed for the visit', st.get('screen') == 'question' and st.get('message') == q.get('message'), st)
    r = post('help/request', {'session_id': s1, 'text': 'test-ai2-garbage about $40'})
    check('AI 2 garbage: same question, retry message', r.get('screen') == 'question' and r['data'].get('retry') is True, r)
    r = post('help/request', {'session_id': s1, 'text': 'test-markdown about $40'})
    check('markdown question cleaned', r.get('screen') == 'question' and r['data'].get('question') == 'What is the deck made of?'
          and r['data'].get('options') == ['Wood', 'Composite'], r)
    r = post('help/request', {'session_id': s1, 'text': 'a running toilet', 'budget': -5})
    check('negative budget refused', r.get('http') == 400, r)

    print('\n5-7. item choice, near/arrived at once, double "I am done"')
    items = to_items(s1, 'My toilet keeps running, I need to fix it', 40)
    check('item list', items.get('screen') == 'items', items)
    skus = [i['sku'] for i in items['data']['items']]
    r = post('help/confirm', {'session_id': s1, 'skus': ['000-000', '999-999']})
    check('only unknown SKUs: refused', r.get('http') == 400, r)
    r = post('help/confirm', {'session_id': s1, 'skus': [skus[0], '000-000']})
    check('one unknown SKU: left out with a note', r.get('screen') == 'guiding' and r['data']['total'] == 1
          and 'left out' in r.get('message', ''), r)
    check('no "reason" on the guiding screen', 'reason' not in r['data']['item'], r['data']['item'])
    item = r['data']['item']
    tag = sql(f"select tag_code from store_items where sku = '{item['sku']}'")
    ev = lambda e: lambda: post('robot/event', {'session_id': s1, 'event': e, 'sku': item['sku'], 'tag_code': tag})
    together(ev('arrived'), ev('near'))
    together(ev('near'), ev('arrived'), ev('near'))
    st = status(s1)
    check('near + arrived at once: phone on "arrived", light on', st.get('screen') == 'arrived' and st['data'].get('light_on'), st)
    wait_robot('waiting_for_pick')
    time.sleep(1.5)
    st = status(s1)
    check('after the real arrival: still "arrived"', st.get('screen') == 'arrived', st)
    a, b = together(lambda: post('help/next', {'session_id': s1}), lambda: post('help/next', {'session_id': s1}))
    applied = sql(f"select count(*) from event_log where session_id = '{s1}' and endpoint = 'help/next' "
                  "and event = 'state_saved' and (details->>'applied')::boolean")
    check('double "I am done": applied once', applied == '1', f'{applied} applied; replies {a.get("screen")}/{a.get("http")}, {b.get("screen")}/{b.get("http")}')
    check('both taps answered sensibly', {a.get('screen'), b.get('screen')} <= {'anything_else', None}
          and 'anything_else' in (a.get('screen'), b.get('screen')), (a, b))

    print('\n8. kiosk button while the visit is open')
    s2 = new_visit()
    st = status(s1)
    check('old visit closed with its summary', st.get('status') == 'ended' and st.get('screen') == 'timed_out'
          and len(st['data'].get('requests', [])) == 1, st)
    robot = wait_robot('done', 90)
    check('robot sent home for the old visit', robot.get('state') == 'done' and robot.get('session_id') == s1, robot)

    print('\n9. a slow AI answer for a visit closed meanwhile')
    result = {}
    t = threading.Thread(target=lambda: result.update(post('help/request', {'session_id': s2, 'text': 'test-slow my deck board is cracked', 'budget': 80})))
    t.start()
    time.sleep(3)
    s3 = new_visit()
    t.join()
    check('the late answer shows the closed visit', result.get('screen') == 'timed_out', result)
    late = sql(f"select details->>'refused_because' from event_log where session_id = '{s2}' and event = 'state_saved' "
               "and endpoint = 'help/request' order by id desc limit 1")
    check('the late run wrote nothing', late == 'visit_not_active', late)
    check('no request saved for the closed visit', sql(f"select count(*) from requests where session_id = '{s2}'") == '0')

    print('\n10. "anything else? yes", then "no" from the input page')
    items = to_items(s3, 'There is a doorknob-size hole in my drywall', 40)
    r = post('help/confirm', {'session_id': s3, 'skus': [items['data']['items'][0]['sku']]})
    check('guiding', r.get('screen') == 'guiding', r)
    r = post('help/anything-else', {'session_id': s3, 'answer': 'no'})
    check('"no" refused while guiding', r.get('http') == 409, r)
    wait_screen(s3, 'arrived')
    post('help/next', {'session_id': s3})
    r = post('help/anything-else', {'session_id': s3, 'answer': 'yes'})
    check('"yes" -> input', r.get('screen') == 'input', r)
    r = post('help/anything-else', {'session_id': s3, 'answer': 'no'})
    check('"no" from the input page -> finished', r.get('screen') == 'finished' and len(r['data']['requests']) == 1, r)
    robot = wait_robot('done', 120)
    check('robot home', robot.get('state') == 'done', robot)

    print('\n11. the 10-minute timeout (faked)')
    s4 = new_visit()
    post('help/request', {'session_id': s4, 'text': 'my toilet keeps running'})
    sql(f"update sessions set last_input_at = now() - interval '11 minutes' where session_id = '{s4}'")
    st = None
    for _ in range(75):
        st = status(s4)
        if st.get('status') != 'active':
            break
        time.sleep(1)
    check('timed out within a minute', st.get('status') == 'timed_out' and st.get('screen') == 'timed_out', st)

    print('\nsessions:', s1, s2, s3, s4)
    print('ALL EDGE CASES PASSED' if not FAILED else f'FAILED: {FAILED}')
    return 1 if FAILED else 0


if __name__ == '__main__':
    sys.exit(main())
