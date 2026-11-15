#!/usr/bin/env python3
"""Plays the awkward cases of a visit against the running system and checks each one.
Needs the stand-in AI (python3 n8n/test/fake_gemini.py; ./n8n/setup.sh test/workflow_fake_ai.json):
it uses the stand-in's test words (test-slow, test-ai1-fails, test-ai2-garbage, test-markdown).

  1. the relevancy AI fails while a follow-up question waits -> same question, "please send it again"
  2. the main AI answers with no JSON -> same screen, "please send it again"
  3. options written into the question text with markdown -> clean question + tap-to-answer options;
     full-width punctuation ("？") -> plain ASCII, not rejected
  4. a negative budget -> 400
  5. /help/confirm with SKUs that were not suggested -> 400, or left out with a note
  6. "near" and "arrived" handled at the same time -> the phone ends on "arrived" with the light on
  7. "I am done" tapped twice at once -> applied once
  8. the kiosk button while a visit is open -> old visit gets its summary, robot sent home
  9. a slow AI answer for a visit that was closed meanwhile -> nothing written
 10. "anything else? yes" then "no" from the input page -> finished
 11. the 10-minute timeout (faked) -> closed, robot home
 12. the first Gemini model is out of quota -> the next model answers; the first one rests and is skipped later
 13. every Gemini model is out of quota -> Claude answers (AI 1, AI 2 with a photo, and AI 3's repair steps);
     without a Claude key (HD_EXPECT_CLAUDE=no) -> "please send it again"
 14. every Gemini model busy and Claude down -> "please send it again" within the time limit, every try logged
 15. a voice note alone while every Gemini model is out of quota -> "please type it"
 16. photo-first: "understood" on the question and items screens, a valid "role" on every item, budget counted
     on main items and tools only

    python3 tools/edge_case_test.py            (about 4 minutes; the robot drives)

For a second copy of the stack (other ports and container names), set HD_N8N_URL, HD_ROBOT_URL and
HD_PG_CONTAINER (default hd_postgres). Cases 12-16 need the stand-in AI built with a Claude key set
(any dummy ANTHROPIC_API_KEY in .env: in offline mode Claude's calls go to the stand-in too); set
HD_EXPECT_CLAUDE=no to check the no-key behaviour instead.
"""
import base64
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
PG = os.environ.get('HD_PG_CONTAINER', 'hd_postgres')
FIRST_MODEL = 'gemini-3.1-flash-lite'      # the first model of Config.gemini_models (the stand-in's test-quota-first)
EXPECT_CLAUDE = os.environ.get('HD_EXPECT_CLAUDE', 'yes').lower() not in ('no', '0', 'false')
FAILED = []
PHOTO = base64.b64encode(b'\xff\xd8\xff\xe0 stand-in photo bytes (the stand-in AI does not decode them)').decode()


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
    out = subprocess.run(['docker', 'exec', PG, 'psql', '-U', 'hd_app', '-d', 'homedepot', '-At', '-c', query],
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


def ai_calls(session, since_id=0):
    """The session's ai_call / ai_skip log entries after event_log id since_id: [(node, provider, model, ok, failure, ...)]."""
    rows = sql(f"select json_build_object('id', id, 'event', event, 'd', details, 'ms', duration_ms) from event_log "
               f"where session_id = '{session}' and event in ('ai_call', 'ai_skip', 'ai_failed_reply') and id > {since_id} order by id")
    return [json.loads(line) for line in rows.splitlines() if line.strip()]


def last_log_id():
    return int(sql('select coalesce(max(id), 0) from event_log') or 0)


def model_chain_cases():
    print('\n12. the first Gemini model is out of quota')
    sql('delete from ai_model_status')
    s5 = new_visit()
    mark = last_log_id()
    t0 = time.time()
    r = post('help/request', {'session_id': s5, 'text': 'test-quota-first my toilet keeps running'})
    calls = ai_calls(s5, mark)
    first = [c for c in calls if c['event'] == 'ai_call' and c['d'].get('model') == FIRST_MODEL]
    check('answered by the next model', r.get('screen') == 'question' and not r['data'].get('retry'), r)
    check('the first model failed with quota', bool(first) and first[0]['d'].get('failure') == 'quota', calls)
    check('the next Gemini model answered', any(c['event'] == 'ai_call' and c['d'].get('ok') and c['d'].get('provider') == 'gemini'
                                                 and c['d'].get('model') != FIRST_MODEL for c in calls), calls)
    resting = sql(f"select reason from ai_model_status where model = '{FIRST_MODEL}' and resting_until > now()")
    check('the first model rests (ai_model_status)', resting == 'quota', resting)
    mark = last_log_id()
    r = post('help/request', {'session_id': s5, 'text': 'about $40'})
    calls = ai_calls(s5, mark)
    check('a later call skips the resting model', r.get('screen') == 'items'
          and not any(c['d'].get('model') == FIRST_MODEL for c in calls if c['event'] == 'ai_call'), calls)
    check('items carry "understood" and a valid role', bool(r.get('data', {}).get('understood'))
          and all(i.get('role') in ('main', 'alternative', 'tool') for i in r['data'].get('items', [])), r.get('data'))
    sql('delete from ai_model_status')

    print('\n13. every Gemini model is out of quota' + (' -> Claude' if EXPECT_CLAUDE else ' and no Claude key'))
    s6 = new_visit()
    mark = last_log_id()
    t0 = time.time()
    r = post('help/request', {'session_id': s6, 'text': 'test-gemini-quota one of my deck boards is cracked',
                              'image_base64': PHOTO, 'image_mime': 'image/jpeg', 'budget': 80})
    took = time.time() - t0
    calls = ai_calls(s6, mark)
    gem_fail = {c['d'].get('model') for c in calls if c['event'] == 'ai_call' and c['d'].get('provider') == 'gemini'
                and c['d'].get('failure') == 'quota_day'}
    check('every Gemini model tried and failed with the daily quota', len(gem_fail) >= 5, sorted(gem_fail))
    check('answered within 25 s', took < 25, f'{took:.1f} s')
    if EXPECT_CLAUDE:
        claude_ok = [c['d'].get('node') for c in calls if c['event'] == 'ai_call' and c['d'].get('provider') == 'claude' and c['d'].get('ok')]
        check('Claude answered AI 1 and AI 2', 'AI 1: relevancy check' in claude_ok and 'AI 2: understand the need' in claude_ok, calls)
        check('the customer got items (photo + budget)', r.get('screen') == 'items' and not r['data'].get('retry'), r)
        check('"understood" says what the photo shows', 'I can see' in (r.get('data', {}).get('understood') or ''), r.get('data'))
        rest = sql("select count(*) from ai_model_status where provider = 'gemini' and reason = 'quota_day' and resting_until > now() + interval '30 minutes'")
        check('every Gemini model rests for a long while', int(rest or 0) >= 5, rest)
        mark = last_log_id()
        t1 = time.time()
        r2 = post('help/request', {'session_id': s6, 'text': 'can I see cheaper ones?'})
        calls = ai_calls(s6, mark)
        check('the next call goes to Claude at once (resting models skipped)', r2.get('screen') in ('items', 'question')
              and [c['d'].get('provider') for c in calls if c['event'] == 'ai_call'][:1] == ['claude'] and time.time() - t1 < 10, calls)
        items = (r2 if r2.get('screen') == 'items' else r)['data']['items']
        r3 = post('help/confirm', {'session_id': s6, 'skus': [items[0]['sku']]})
        check('item chosen', r3.get('screen') == 'guiding', r3)
        steps = ''
        for _ in range(150):
            steps = sql(f"select coalesce(jsonb_array_length(repair_steps), 0) from requests where session_id = '{s6}'")
            if steps not in ('', '0'):
                break
            time.sleep(1)
        ai3 = [c['d'] for c in ai_calls(s6) if c['event'] == 'ai_call' and c['d'].get('node') == 'AI 3: repair steps and videos']
        check('AI 3: repair steps written by Claude', steps not in ('', '0') and bool(ai3) and ai3[-1].get('provider') == 'claude', (steps, ai3))
    else:
        check('no Claude key: "please send it again"', r.get('data', {}).get('retry') is True and 'again' in r.get('message', ''), r)
        check('Claude skipped (no key) in the log', any(c['event'] == 'ai_skip' and c['d'].get('reason') == 'no_claude_key' for c in calls), calls)
    sql('delete from ai_model_status')

    print('\n14. every Gemini model busy and Claude down')
    s7 = new_visit()
    q = post('help/request', {'session_id': s7, 'text': 'my toilet keeps running'})
    mark = last_log_id()
    t0 = time.time()
    r = post('help/request', {'session_id': s7, 'text': 'test-gemini-busy test-claude-down about $40'})
    took = time.time() - t0
    calls = ai_calls(s7, mark)
    check('"please send it again", same question kept', r.get('screen') == 'question' and r['data'].get('retry') is True
          and r['data'].get('question') == q.get('data', {}).get('question'), r)
    check('answered within 25 s', took < 25, f'{took:.1f} s')
    failed = [c for c in calls if c['event'] == 'ai_failed_reply']
    check('the log says why (every model tried, ai_failed_reply)', len(failed) == 1
          and len([c for c in calls if c['event'] == 'ai_call' and c['d'].get('failure') in ('busy', 'quota', 'quota_day')]) >= 5, calls)
    sql('delete from ai_model_status')

    print('\n15. a voice note alone while every Gemini model is out of quota')
    s8 = new_visit()
    r = post('help/request', {'session_id': s8, 'audio_base64': PHOTO, 'audio_mime': 'audio/webm',
                              'text': ''})
    check('a voice note works normally (Gemini)', r.get('screen') in ('question', 'items', 'sorry') and not r.get('data', {}).get('retry'), r)
    # the hook word must reach the stand-in, so it rides in the session's earlier text: here, mark every Gemini model resting
    sql("insert into ai_model_status (model, provider, resting_until, reason) select m, 'gemini', now() + interval '1 hour', 'quota_day' "
        "from unnest(array['gemini-flash-lite-latest','gemini-3.1-flash-lite','gemini-3-flash-preview','gemini-3.5-flash-lite',"
        "'gemini-3.5-flash','gemini-3.6-flash']) m on conflict (model) do update set resting_until = excluded.resting_until")
    s9 = new_visit()
    mark = last_log_id()
    r = post('help/request', {'session_id': s9, 'audio_base64': base64.b64encode(b'test-gemini-quota').decode(), 'audio_mime': 'audio/webm'})
    calls = ai_calls(s9, mark)
    if EXPECT_CLAUDE:
        check('"please type it" (Claude cannot hear voice notes)', r.get('data', {}).get('retry') is True
              and 'type' in r.get('message', '').lower(), r)
        check('Claude skipped for the voice note in the log', any(c['event'] == 'ai_skip' and c['d'].get('reason') == 'voice_note' for c in calls), calls)
    else:
        check('"please send it again" (no Claude key)', r.get('data', {}).get('retry') is True, r)
    sql('delete from ai_model_status')

    print('\n16. photo-first')
    s10 = new_visit()
    r = post('help/request', {'session_id': s10, 'text': 'deck', 'image_base64': PHOTO, 'image_mime': 'image/jpeg'})
    check('a photo + one word: a question with "understood"', r.get('screen') == 'question' and 'I can see' in (r['data'].get('understood') or ''), r)
    r = post('help/request', {'session_id': s10, 'text': 'About $60'})
    items = r.get('data', {}).get('items', [])
    check('items with roles: main first, tools last', r.get('screen') == 'items' and items and items[0]['role'] == 'main'
          and [i['role'] for i in items if i['role'] == 'tool'] == [i['role'] for i in items[len(items) - len([1 for i in items if i['role'] == 'tool']):]], items)
    entry = [c['d'] for c in ai_calls(s10) if c['event'] == 'ai_call' and c['d'].get('shown') == 'items']
    budgeted = round(sum(i['price'] for i in items if i['role'] != 'alternative'), 2)
    check('the log counts main items + tools against the budget', bool(entry) and entry[-1].get('items_total_budgeted') == budgeted,
          (entry[-1] if entry else None, budgeted))
    left_out = entry[-1].get('left_out_for_budget') if entry else None
    check('over the budget: the costliest tools left out, and the message says so', budgeted <= 60 and (not left_out
          or ('left out' in r.get('message', '') and not any(i['sku'] in left_out for i in items))), (budgeted, left_out, r.get('message')))


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
    r = post('help/request', {'session_id': s1, 'text': 'test-fullwidth about $40'})
    check('full-width "？" in a question: shown with a plain "?"', r.get('screen') == 'question' and not r['data'].get('retry')
          and r['data'].get('question') == 'Is the deck made of wood or composite?' and r['data'].get('options') == ['Wood, treated', 'Composite'], r)
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

    model_chain_cases()

    print('\nsessions:', s1, s2, s3, s4)
    print('ALL EDGE CASES PASSED' if not FAILED else f'FAILED: {FAILED}')
    return 1 if FAILED else 0


if __name__ == '__main__':
    sys.exit(main())
