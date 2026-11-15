#!/usr/bin/env python3
"""Plays a whole customer visit against the running system, as the kiosk and
the phone would, and prints every step:

    kiosk button -> an unrelated message (refused) -> a real request -> follow-up
    answers -> item list -> choose items -> robot guides to each item (light on,
    "I am done") -> "anything else?" no -> repair steps and videos -> robot home.

Needs: the running demo (./start.sh). From the host: python3 tools/full_flow_test.py;
without Python on the host: ./tools.sh test.

    python3 tools/full_flow_test.py ["what the customer says"]
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

N8N = os.environ.get('HD_N8N_URL', 'http://localhost:5678').rstrip('/') + '/webhook'
ROBOT = os.environ.get('HD_ROBOT_URL', 'http://localhost:8000').rstrip('/')


def call(method, url, body=None):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(url, data=data, method=method, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=120) as reply:
            status, text = reply.status, reply.read()
    except urllib.error.HTTPError as error:
        status, text = error.code, error.read()
    except (urllib.error.URLError, OSError) as error:   # nothing answers (the demo is not running?)
        sys.exit(f'\nFAILED: {method} {url} did not answer: {error}')
    try:
        reply = json.loads(text or '{}')
    except ValueError:   # not JSON (an HTML error page, "Error in workflow", ...): say what came back
        print(f'   HTTP {status} from {method} {url}, not JSON: {text[:200]!r}')
        reply = {'raw': text[:200].decode('utf-8', 'replace')}
    if not isinstance(reply, dict):
        reply = {'data': reply}
    if status >= 400:
        reply = {'http_error': status, **reply}
    return reply


def show(step, reply):
    print(f'\n== {step}\n   screen: {reply.get("screen")}   message: {reply.get("message")}')
    for key, value in (reply.get('data') or {}).items():
        print(f'   {key}: {json.dumps(value)[:300]}')
    if 'error' in reply:
        print('   ERROR:', reply)
    return reply


def wait_for(session, screen, seconds=180):
    """Poll /help/status like the phone does, until the given screen shows."""
    seen_light = False
    for _ in range(seconds):
        status = call('GET', f'{N8N}/help/status?session_id={session}')
        robot = call('GET', f'{ROBOT}/tour/status')
        light = (status.get('data') or {}).get('light_on')
        if light and not seen_light:
            seen_light = True
            print(f'   * shelf-tag light ON (robot {robot.get("distance_m")} m away; lights on: {robot.get("lights_on")})')
        if status.get('screen') == screen:
            return status
        print(f'   ... phone: {status.get("screen")}, robot: {robot.get("state")}, {robot.get("distance_m")} m to go', end='\r')
        time.sleep(1)
    sys.exit(f'\nFAILED: the phone never reached the "{screen}" screen')


def main():
    need = sys.argv[1] if len(sys.argv) > 1 else 'One of the boards on my deck is cracked and I want to replace it'
    health = call('GET', f'{ROBOT}/health')
    print('robot service:', health)

    start = call('POST', f'{N8N}/help/start', {})
    session = start['session_id']
    print(f'\n== kiosk button\n   session {session}\n   link {start["link"]}\n   QR   {start["qr_image_url"]}')

    reply = show('unrelated message', call('POST', f'{N8N}/help/request', {'session_id': session, 'text': 'Tell me a joke about pizza'}))
    assert reply['screen'] == 'sorry', reply

    reply = show(f'customer: "{need}"', call('POST', f'{N8N}/help/request', {'session_id': session, 'text': need}))
    answers = iter(['My budget is about $80', 'It is indoors, and I would like something simple', 'I do not have any tools', 'Yes'])
    while reply['screen'] == 'question':
        answer = next(answers, 'Not sure, please just recommend something')
        reply = show(f'customer answers: "{answer}"', call('POST', f'{N8N}/help/request', {'session_id': session, 'text': answer}))
    assert reply['screen'] == 'items', reply
    items = reply['data']['items']
    for item in items:
        print(f'     {item["sku"]}  ${item["price"]:>7.2f}  aisle {item["aisle"]:>2} bay {item["shelf"]:>2}  {item["item_name"]}')

    chosen = [item['sku'] for item in items[:2]]
    reply = show(f'customer chooses {chosen}', call('POST', f'{N8N}/help/confirm', {'session_id': session, 'skus': chosen}))
    refused = call('POST', f'{N8N}/help/next', {'session_id': session})
    assert refused.get('error') == 'wrong_step', refused          # "I am done" is not allowed before arrival
    print('   ("I am done" before arrival is refused: OK)')

    while reply['screen'] == 'guiding':
        item = reply['data']['item']
        print(f'\n== robot heading to item {reply["data"]["index"]}/{reply["data"]["total"]}: {item["item_name"]}')
        arrived = wait_for(session, 'arrived')
        assert arrived['data']['light_on'], arrived
        print(f'\n   arrived: {arrived["message"]}')
        reply = show('customer taps "I am done"', call('POST', f'{N8N}/help/next', {'session_id': session}))
    assert reply['screen'] == 'anything_else', reply

    reply = show('customer answers "no"', call('POST', f'{N8N}/help/anything-else', {'session_id': session, 'answer': 'no'}))
    assert reply['screen'] == 'finished', reply
    for summary in reply['data']['requests']:
        print(f'\n   {summary["request"]}: {", ".join(summary["items"])}')
        for n, step in enumerate(summary['repair_steps'], 1):
            print(f'     {n}. {step}')
        for video in summary['videos']:
            print(f'     video: {video["url"]}')

    print('\n== robot returning to its dock')
    for _ in range(180):
        robot = call('GET', f'{ROBOT}/tour/status')
        if robot['state'] == 'done':
            break
        print(f'   ... robot: {robot["state"]} at {robot["pose"]}', end='\r')
        time.sleep(1)
    print(f'\n   robot state: {robot["state"]}, pose {robot["pose"]}')
    assert robot['state'] == 'done', robot
    print('\nALL STEPS PASSED')


if __name__ == '__main__':
    main()
