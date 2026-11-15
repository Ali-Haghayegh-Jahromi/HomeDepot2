#!/usr/bin/env python3
"""Sends a photo (and/or a voice recording) to the running demo the way the phone does, and prints what the AI
understood, what it asked and which items it picked (with their role), and how long each answer took.

    python3 tools/photo_test.py PHOTO.jpg ["short text"]           a photo + optional text; answers the
                                                                    follow-up questions with --answers
    python3 tools/photo_test.py --audio VOICE.wav ["text"]          a voice recording (WAV, OGG, WebM, MP4)
    python3 tools/photo_test.py --all                               every photo in tools/photos (drawn by
                                                                    tools/make_test_photos.py) and test_photos/

Options: --first (stop after the first reply: fewer AI calls), --answers "About $60|Not sure" (the replies
to follow-up questions, in order; default: a budget,
then "Not sure"), --n8n http://localhost:5678 (or HD_N8N_URL), --max-side 1024 (photos are scaled down
like the phone does; needs Pillow, otherwise sent as they are).
Each run is a real visit (kiosk button first): with the real AI it uses the Gemini quota, about 2-4 calls
per photo.
"""
import argparse
import base64
import glob
import io
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def call(base, method, path, body=None):
    request = urllib.request.Request(f'{base}/webhook/{path}', data=None if body is None else json.dumps(body).encode(),
                                     method=method, headers={'Content-Type': 'application/json'})
    t0 = time.time()
    try:
        with urllib.request.urlopen(request, timeout=90) as reply:
            out = json.loads(reply.read() or b'{}')
    except urllib.error.HTTPError as error:
        out = {'http_error': error.code, 'raw': error.read().decode()[:400]}
    out['_seconds'] = round(time.time() - t0, 1)
    return out


def photo_b64(path, max_side):
    data = open(path, 'rb').read()
    mime = mimetypes.guess_type(path)[0] or 'image/jpeg'
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(data)).convert('RGB')
        if max(img.size) > max_side:
            img.thumbnail((max_side, max_side))
        buf = io.BytesIO()
        img.save(buf, 'JPEG', quality=85)
        data, mime = buf.getvalue(), 'image/jpeg'
    except ImportError:
        pass
    return base64.b64encode(data).decode(), mime


def show(label, r):
    d = r.get('data') or {}
    print(f'  {label}: [{r.get("_seconds")} s] screen={r.get("screen")}' + ('  RETRY' if d.get('retry') else '')
          + (f'  ERROR {r.get("http_error")} {r.get("raw")}' if r.get('http_error') else ''))
    if d.get('understood'):
        print(f'    understood: {d["understood"]}')
    if r.get('screen') == 'question':
        print(f'    asks: {d.get("question")}   options: {d.get("options")}')
    elif r.get('screen') == 'items':
        for i in d.get('items', []):
            print(f'    - {i.get("role", "?"):11} ${i["price"]:>7.2f}  {i["item_name"]}')
            if i.get('reason'):
                print(f'      {"":11} why: {i["reason"]}')
        main = sum(i['price'] for i in d.get('items', []) if i.get('role') != 'alternative')
        print(f'    main items + tools: ${main:.2f}')
    elif r.get('message'):
        print(f'    message: {r["message"]}')


def run(base, photo=None, audio=None, text='', answers=(), max_side=1024):
    start = call(base, 'POST', 'help/start', {})
    session = start['session_id']
    body = {'session_id': session}
    if text:
        body['text'] = text
    if photo:
        body['image_base64'], body['image_mime'] = photo_b64(photo, max_side)
    if audio:
        body['audio_base64'] = base64.b64encode(open(audio, 'rb').read()).decode()
        body['audio_mime'] = mimetypes.guess_type(audio)[0] or 'audio/wav'
    print(f'\n== {os.path.basename(photo or audio)}' + (f' + "{text}"' if text else '') + f'   (visit {session})')
    r = call(base, 'POST', 'help/request', body)
    show('photo' if photo else 'voice', r)
    replies = list(answers) or ['About $60', 'Not sure', 'Not sure']
    while r.get('screen') == 'question' and replies and replies[0] != '-':
        answer = replies.pop(0)
        r = call(base, 'POST', 'help/request', {'session_id': session, 'text': answer})
        show(f'answer "{answer}"', r)
    return r


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('photo', nargs='?')
    p.add_argument('text', nargs='?', default='')
    p.add_argument('--audio')
    p.add_argument('--all', action='store_true')
    p.add_argument('--answers', default='')
    p.add_argument('--first', action='store_true', help='stop after the first reply (saves AI calls)')
    p.add_argument('--n8n', default=os.environ.get('HD_N8N_URL', 'http://localhost:5678'))
    p.add_argument('--max-side', type=int, default=1024)
    a = p.parse_args()
    answers = ['-'] if a.first else [x for x in a.answers.split('|') if x]
    if a.all:
        photos = sorted(glob.glob(os.path.join(HERE, 'photos', '*.jpg'))) + sorted(glob.glob(os.path.join(ROOT, 'test_photos', '*.jpg')))
        if not photos:
            sys.exit('No photos: run python3 tools/make_test_photos.py first')
        for photo in photos:
            run(a.n8n, photo=photo, text=a.text, answers=answers, max_side=a.max_side)
        return
    if not a.photo and not a.audio:
        sys.exit(__doc__)
    run(a.n8n, photo=a.photo, audio=a.audio, text=a.text, answers=answers, max_side=a.max_side)


if __name__ == '__main__':
    main()
