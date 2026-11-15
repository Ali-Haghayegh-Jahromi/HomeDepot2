#!/usr/bin/env python3
"""A stand-in for the Gemini API, for testing the workflow without an API key
(and as an offline fallback). It answers the workflow's three AI calls with
simple keyword rules; it understands nothing. A few words in the customer's text trigger
test behaviour (tools/edge_case_test.py): "test-slow" (8 s answer), "test-ai1-fails" (relevancy
call answers HTTP 503), "test-ai2-garbage" (no JSON), "test-markdown" (options inside the question).

    python3 n8n/test/fake_gemini.py          (port 8010)
    HD_GEMINI_URL=http://localhost:8010 python3 n8n/build_workflow.py   then ./n8n/setup.sh
"""
import json
import os
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

class Unavailable(Exception):
    """Answer like an overloaded Gemini (HTTP 503)."""


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
    if 'test-markdown' in new:
        return {'type': 'question', 'understood': 'deck', 'question': 'What is the deck made of?\n- **Wood**\n- **Composite**',
                'options': []}
    # the current request only: what was said since the last "new request" marker, if the customer is continuing it
    so_far = section(text, 'CONVERSATION SO FAR IN THIS VISIT', 'STATE').split('---')[-1]
    talk = ((so_far if 'is continuing the request' in text else '') + ' ' + new).lower()
    job = next((j for j in JOBS if any(word in talk for word in j[0])), None)
    title = job[1] if job else 'Home repair'
    understood = ('The customer sent a photo or recording about: ' if has_media else 'The customer said: ') + new.split('\n')[0][:80]
    money = re.search(r'\$\s?(\d+)', talk) or re.search(r'(\d+)\s?(dollars|bucks)', talk)
    known = re.search(r'Budget for this job: \$(\d+(\.\d+)?)', text)
    budget = float(known.group(1)) if known else float(money.group(1)) if money else None
    if not job:
        return {'type': 'question', 'understood': understood, 'request_title': title, 'budget': budget,
                'question': 'What would you like to fix or build?', 'options': ['A deck board', 'A running toilet', 'A hole in a wall']}
    if budget is None:
        return {'type': 'question', 'understood': understood, 'request_title': title, 'budget': None,
                'question': 'Roughly what is your budget for this job?', 'options': ['Under $30', 'About $60', '$150 or more']}
    catalogue = [line.split(' | ') for line in section(text, 'CATALOGUE', 'CONVERSATION SO FAR').split('\n') if line.count(' | ') >= 7]
    tiers = ['good', 'better', 'best'] if budget < 60 else ['better', 'good', 'best'] if budget < 150 else ['best', 'better', 'good']
    items = []
    for kind in job[2]:
        matches = sorted((row for row in catalogue if row[4] == kind), key=lambda row: tiers.index(row[3]))
        for n, row in enumerate(matches[:2 if kind == job[2][0] else 1]):
            items.append({'sku': row[0], 'reason': f'{"Best fit" if n == 0 else "Alternative"} for your {title.lower()}: {row[3]} quality {kind}.'})
    return {'type': 'items', 'understood': understood, 'request_title': title, 'budget': budget, 'items': items}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if os.environ.get('HD_FAKE_AI_DUMP'):      # debugging: append every request to this file
            with open(os.environ['HD_FAKE_AI_DUMP'], 'a') as f:
                f.write(json.dumps({'path': self.path.split('?')[0], 'body': body}) + '\n')
        try:
            answer = reply_for(body)
        except Unavailable:
            data = b'{"error": {"code": 503, "message": "The model is overloaded (stand-in test)", "status": "UNAVAILABLE"}}'
            self.send_response(503)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        print(self.path.split('?')[0].split('/')[-1], '->', json.dumps(answer)[:150], flush=True)
        text = answer if isinstance(answer, str) else json.dumps(answer)
        data = json.dumps({'candidates': [{'content': {'role': 'model', 'parts': [{'text': text}]}}]}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    print('Fake Gemini on http://localhost:8010 (keyword rules, no AI)', flush=True)
    ThreadingHTTPServer((os.environ.get('HD_FAKE_AI_HOST', '127.0.0.1'), 8010), Handler).serve_forever()
