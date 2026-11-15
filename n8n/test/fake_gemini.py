#!/usr/bin/env python3
"""A stand-in for the Gemini API and for Anthropic's Messages API (Claude), for testing the workflow without
API keys (and as an offline fallback). It answers the workflow's three AI calls with simple keyword rules; it
understands nothing. Gemini calls: POST /v1beta/models/<model>:generateContent. Claude calls: POST /v1/messages
(needs any x-api-key; "stream": true is answered as server-sent events, like the real API).

A few words in the customer's text trigger test behaviour (tools/edge_case_test.py):
  test-slow         8 s answer                     test-ai1-fails     relevancy call: HTTP 503 (every model)
  test-ai2-garbage  no JSON                        test-markdown      options inside the question
  test-fullwidth    a question with full-width punctuation (U+FF1F)
  test-quota-first  the first model of the chain (gemini-3.1-flash-lite) answers 429 (per-minute rate)
  test-gemini-quota every Gemini model answers 429 (daily free quota used up)
  test-gemini-busy  every Gemini model answers 503 (overloaded)
  test-claude-down  Claude answers 529 (overloaded)

    python3 n8n/test/fake_gemini.py          (port 8010)
    HD_GEMINI_URL=http://localhost:8010 python3 n8n/build_workflow.py   then ./n8n/setup.sh
"""
import base64
import json
import os
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

class Unavailable(Exception):
    """Answer like an overloaded Gemini (HTTP 503)."""


class ApiError(Exception):
    """Answer with this HTTP status and JSON body."""

    def __init__(self, status, body):
        super().__init__(status)
        self.status, self.body = status, body


FIRST_MODEL = 'gemini-3.1-flash-lite'


def gemini_quota(model, daily):
    quota = 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' if daily else 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier'
    return ApiError(429, {'error': {'code': 429, 'status': 'RESOURCE_EXHAUSTED', 'message':
        'You exceeded your current quota, please check your plan and billing details. * Quota exceeded for metric: '
        f'generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: {model}. '
        'Please retry in 21.5s. (stand-in test)', 'details': [
            {'@type': 'type.googleapis.com/google.rpc.QuotaFailure', 'violations': [{'quotaId': quota}]},
            {'@type': 'type.googleapis.com/google.rpc.RetryInfo', 'retryDelay': '21s'}]}})


def failures(body, model, provider):
    """The test hooks that make a provider fail (only words in the customer's message, or in the job text for AI 3)."""
    words = hook_text(body)
    if provider == 'gemini':
        if 'test-gemini-quota' in words:
            raise gemini_quota(model, daily=True)
        if 'test-quota-first' in words and model == FIRST_MODEL:
            raise gemini_quota(model, daily=False)
        if 'test-gemini-busy' in words:
            raise ApiError(503, {'error': {'code': 503, 'status': 'UNAVAILABLE',
                                           'message': 'This model is currently experiencing high demand. (stand-in test)'}})
    if provider == 'claude' and 'test-claude-down' in words:
        raise ApiError(529, {'type': 'error', 'error': {'type': 'overloaded_error', 'message': 'Overloaded (stand-in test)'}})


def hook_text(body):
    text = ' '.join(p.get('text', '') for c in body.get('contents', []) for p in c.get('parts', []))
    # a "voice recording" for the tests is just base64 text: test words in it count as said
    for p in (p for c in body.get('contents', []) for p in c.get('parts', [])):
        if str((p.get('inlineData') or {}).get('mimeType', '')).startswith('audio/'):
            try:
                said = base64.b64decode(p['inlineData']['data']).decode('utf-8', 'ignore').lower()
            except (ValueError, KeyError):
                said = ''
            if said.startswith('test-'):
                return said
    if 'CUSTOMER MESSAGE' in text:          # AI 1 and AI 2: only the new message
        return section(text, 'NEW CUSTOMER MESSAGE' if 'NEW CUSTOMER MESSAGE' in text else 'CUSTOMER MESSAGE').lower()
    return text.lower()                      # AI 3: the job and what the customer said


def from_anthropic(body):
    """An Anthropic Messages request in the shape reply_for reads (Gemini's)."""
    system = body.get('system') or ''
    if isinstance(system, list):
        system = ' '.join(b.get('text', '') for b in system if isinstance(b, dict))
    parts = []
    for m in body.get('messages', []):
        content = m.get('content')
        if isinstance(content, str):
            if m.get('role') == 'system':
                system += ' ' + content
            else:
                parts.append({'text': content})
            continue
        for block in content or []:
            if block.get('type') == 'text':
                parts.append({'text': block.get('text', '')})
            elif block.get('type') == 'image':
                parts.append({'inlineData': {'mimeType': block['source'].get('media_type'), 'data': '(image)'}})
    return {'systemInstruction': {'parts': [{'text': system}]}, 'contents': [{'role': 'user', 'parts': parts}]}


OFF_TOPIC = ('pizza', 'joke', 'poem', 'weather', 'homework', 'president', 'ignore your instructions')
# what the customer talks about -> kinds of item to suggest, most needed first
JOBS = [
    (('deck',), 'Replace a damaged deck board', ['deck board', 'deck screws', 'driver bits', 'cordless drill']),
    (('toilet',), 'Fix a running toilet', ['toilet repair', 'wrench']),
    (('hole', 'drywall', 'wall'), 'Patch a hole in a wall', ['drywall patch', 'spackle', 'putty knife', 'sandpaper', 'primer']),
    (('leak', 'faucet', 'drip', 'sink'), 'Fix a leaking faucet', ['faucet repair', 'supply line', 'thread seal tape', 'wrench']),
    (('paint',), 'Paint a room', ['interior paint', 'paint roller', 'paint brush', 'painters tape', 'drop cloth']),
    (('shelf', 'hang', 'picture', 'tv'), 'Hang something on a wall', ['wall anchors', 'stud finder', 'cordless drill', 'drill bits']),
]


def section(text, start, end=None):
    part = text.split(start, 1)[1] if start in text else ''
    return part.split(end, 1)[0] if end and end in part else part


def reply_for(body):
    system = ' '.join(p.get('text', '') for p in (body.get('systemInstruction') or {}).get('parts', []))
    # every turn's text (n8n's LangChain nodes may send the instructions as a first user turn instead)
    parts = [p for c in body.get('contents', []) for p in c.get('parts', [])]
    text = ' '.join(p.get('text', '') for p in parts)
    if not system:
        system = text
    has_media = any('inlineData' in p for p in parts)

    if 'gatekeeper' in system:
        message = section(text, 'CUSTOMER MESSAGE').lower()
        if 'test-ai1-fails' in message:
            raise Unavailable()
        return {'relevant': not any(word in message for word in OFF_TOPIC)}

    if 'repair instructions' in system:
        job = section(text, 'JOB:', '\n').strip()
        items = re.findall(r'^- (.+?) \(', text, re.M)
        steps = ['Clear the area and put on safety glasses.'] + [f'Get the {i} ready.' for i in items[:3]] + \
                ['Do the repair, checking your work as you go.', 'Clean up and test the result.']
        answer = {'steps': steps[:6], 'video_queries': [f'how to {job.lower()}', f'{job.lower()} for beginners']}
        # n8n's Structured Output Parser asks for the answer inside {"output": ...}, in a ```json block
        if '"properties":{"output"' in text:
            return '```json\n' + json.dumps({'output': answer}) + '\n```'
        return answer

    new = section(text, 'NEW CUSTOMER MESSAGE').strip()
    # test hooks (tools/edge_case_test.py): a slow answer, an unusable answer, a sloppy question
    if 'test-slow' in new:
        time.sleep(8)
    if 'test-ai2-garbage' in new:
        return 'Sure! I can help with that. What is it made of?'
    if 'test-fullwidth' in new:      # seen live: a question ending in a full-width question mark
        return {'type': 'question', 'understood': 'A deck board.', 'request_title': 'Deck repair', 'budget': None,
                'question': 'Is the deck made of wood or composite\uff1f', 'options': ['Wood\uff0c treated', 'Composite'], 'items': []}
    if 'test-markdown' in new:
        return {'type': 'question', 'understood': 'deck', 'question': 'What is the deck made of?\n- **Wood**\n- **Composite**',
                'options': []}
    # the current request only: what was said since the last "new request" marker, if the customer is continuing it
    so_far = section(text, 'CONVERSATION SO FAR IN THIS VISIT', 'STATE').split('---')[-1]
    talk = ((so_far if 'is continuing the request' in text else '') + ' ' + new).lower()
    job = next((j for j in JOBS if any(word in talk for word in j[0])), None)
    title = job[1] if job else 'Home repair'
    said = new.split('\n')[0].strip('. ')[:80]
    understood = (f'I can see what looks like this job: {title.lower()}.' if job else 'I can see a photo, but not what needs fixing.') \
        if has_media else f'You said: {said}.'

    # the budget: what the customer says now comes first (the conversation so far also holds the options of the
    # budget question, "Under $30", which must not win over the answer), then the budget already saved, then
    # anything said earlier in this request
    def money_in(words):
        return re.search(r'\$\s?(\d+)', words) or re.search(r'(\d+)\s?(dollars|bucks)', words)
    said_now = money_in(new.lower())
    known = re.search(r'Budget for this job: \$(\d+(\.\d+)?)', text)
    earlier = money_in(talk)
    budget = float(said_now.group(1)) if said_now else float(known.group(1)) if known \
        else float(earlier.group(1)) if earlier else None
    if not job:
        return {'type': 'question', 'understood': understood, 'request_title': title, 'budget': budget,
                'question': 'What would you like to fix or build?', 'options': ['A deck board', 'A running toilet', 'A hole in a wall'],
                'items': []}
    if budget is None:
        return {'type': 'question', 'understood': understood, 'request_title': title, 'budget': None,
                'question': 'Roughly what is your budget for this job?', 'options': ['Under $30', 'About $60', '$150 or more'],
                'items': []}
    catalogue = [line.split(' | ') for line in section(text, 'CATALOGUE', 'CONVERSATION SO FAR').split('\n') if line.count(' | ') >= 7]
    tiers = ['good', 'better', 'best'] if budget < 60 else ['better', 'good', 'best'] if budget < 150 else ['best', 'better', 'good']
    items = []
    for kind in job[2]:
        matches = sorted((row for row in catalogue if row[4] == kind), key=lambda row: tiers.index(row[3]))
        for n, row in enumerate(matches[:2 if kind == job[2][0] else 1]):
            role = 'tool' if 'tool' in row[5].lower() else 'alternative' if n else 'main'
            items.append({'sku': row[0], 'role': role,
                          'reason': f'{"Best fit" if n == 0 else "Alternative"} for your {title.lower()}: {row[3]} quality {kind}.'})
    return {'type': 'items', 'understood': understood, 'request_title': title, 'budget': budget, 'question': '', 'options': [],
            'items': items}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        path = self.path.split('?')[0]
        if os.environ.get('HD_FAKE_AI_DUMP'):      # debugging: append every request to this file
            with open(os.environ['HD_FAKE_AI_DUMP'], 'a') as f:
                f.write(json.dumps({'path': path, 'body': body}) + '\n')
        if path.endswith('/v1/messages'):
            return self.anthropic(body)
        model = path.rsplit('/', 1)[-1].split(':')[0]
        try:
            failures(body, model, 'gemini')
            answer = reply_for(body)
        except Unavailable:
            return self.send_json(503, {'error': {'code': 503, 'message': 'The model is overloaded (stand-in test)', 'status': 'UNAVAILABLE'}})
        except ApiError as error:
            return self.send_json(error.status, error.body)
        print(model, '->', json.dumps(answer)[:150], flush=True)
        text = answer if isinstance(answer, str) else json.dumps(answer)
        self.send_json(200, {'candidates': [{'content': {'role': 'model', 'parts': [{'text': text}]}, 'finishReason': 'STOP'}],
                             'usageMetadata': {'promptTokenCount': 100, 'candidatesTokenCount': 20}})

    def anthropic(self, body):
        """Anthropic's Messages API: same rules, Claude's answer shape (and its error shape)."""
        model = body.get('model', 'claude')
        if not (self.headers.get('x-api-key') or '').strip():
            return self.send_json(401, {'type': 'error', 'error': {'type': 'authentication_error', 'message': 'invalid x-api-key'}})
        if not body.get('max_tokens') or not body.get('messages'):
            return self.send_json(400, {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'max_tokens and messages are required'}})
        converted = from_anthropic(body)
        try:
            failures(converted, model, 'claude')
            answer = reply_for(converted)
        except (Unavailable, ApiError):
            return self.send_json(529, {'type': 'error', 'error': {'type': 'overloaded_error', 'message': 'Overloaded (stand-in test)'}})
        text = answer if isinstance(answer, str) else json.dumps(answer)
        print('claude', model, '->', text[:150], flush=True)
        message = {'id': 'msg_standin', 'type': 'message', 'role': 'assistant', 'model': model,
                   'content': [{'type': 'text', 'text': text}], 'stop_reason': 'end_turn', 'stop_sequence': None,
                   'usage': {'input_tokens': 100, 'output_tokens': 20}}
        if not body.get('stream'):
            return self.send_json(200, message)
        events = [('message_start', {'type': 'message_start', 'message': {**message, 'content': [], 'stop_reason': None,
                                                                           'usage': {'input_tokens': 100, 'output_tokens': 1}}}),
                  ('content_block_start', {'type': 'content_block_start', 'index': 0, 'content_block': {'type': 'text', 'text': ''}}),
                  ('content_block_delta', {'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'text_delta', 'text': text}}),
                  ('content_block_stop', {'type': 'content_block_stop', 'index': 0}),
                  ('message_delta', {'type': 'message_delta', 'delta': {'stop_reason': 'end_turn', 'stop_sequence': None},
                                     'usage': {'output_tokens': 20}}),
                  ('message_stop', {'type': 'message_stop'})]
        data = ''.join(f'event: {name}\ndata: {json.dumps(payload)}\n\n' for name, payload in events).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):          # the key checks of ./start.sh (models list)
        self.send_json(200, {'data': [], 'models': []})

    def send_json(self, status, payload):
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    print('Stand-in AI (Gemini + Claude formats) on http://localhost:8010 (keyword rules, no AI)', flush=True)
    ThreadingHTTPServer((os.environ.get('HD_FAKE_AI_HOST', '127.0.0.1'), 8010), Handler).serve_forever()
