"""Live mirror of the customer's phone, for the demo stage (a display relay only).

The phone page (phone.html, on a real phone) publishes a compact snapshot of what it shows: the
screen from n8n plus its local state (chat bubbles, typed draft, ticked items, loading states,
a small photo thumbnail, scroll position). The demo stage subscribes and draws the same phone
components read-only, so the audience sees the customer's phone on the big screen.

It makes no decisions and never calls n8n: if it fails, the visit goes on unchanged.
Everything is in memory: only the latest snapshot per visit is kept, at most MAX_BYTES each,
and a visit's mirror is dropped TTL_S after its phone was last heard from.

    POST /mirror/{session_id}          {client_id, role, version, state?}   (no state = heartbeat)
    GET  /mirror/{session_id}          the latest snapshot: {live, client_id, version, state, age_s}
    GET  /mirror/{session_id}/stream   Server-Sent Events: "snapshot" (full) and "ping" (heartbeat)

Only role "customer" is kept (the stage's own embedded phone page says role "stage" and is
ignored). Several phones on one visit: the latest one to publish a full snapshot is shown; an
older version from the same phone (arriving out of order) is dropped.

To switch it on, two lines in service.py after `app = FastAPI(...)`:
    from mirror import router as mirror_router
    app.include_router(mirror_router)
"""
import asyncio
import json
import re
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

MAX_BYTES = 512 * 1024      # one snapshot, photo thumbnail included
TTL_S = 30 * 60             # forget a visit's mirror 30 minutes after its phone was last heard from
MAX_SESSIONS = 64           # visits kept at once (the oldest go first)
MAX_SUBSCRIBERS = 16        # open streams per visit
KEEPALIVE_S = 15            # an SSE comment this often keeps proxies and browsers from closing the stream

_ID = re.compile(r'^[A-Za-z0-9_-]{1,64}$')

router = APIRouter(prefix='/mirror', tags=['mirror'])


class _Mirror:
    """One visit: its latest snapshot and the streams listening to it. Used from the event loop only."""

    def __init__(self):
        self.client_id = None
        self.version = -1
        self.state = None
        self.seen = 0.0          # time.monotonic() of the last snapshot or heartbeat
        self.subscribers = set()

    def payload(self):
        return {'live': self.state is not None, 'client_id': self.client_id, 'version': self.version,
                'state': self.state, 'age_s': round(time.monotonic() - self.seen, 2) if self.seen else None}

    def publish(self, event, data):
        line = f'event: {event}\ndata: {json.dumps(data, separators=(",", ":"))}\n\n'
        for q in list(self.subscribers):
            if q.full():          # a slow viewer only needs the newest frame
                try:
                    q.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            q.put_nowait(line)


_mirrors = {}


def _prune():
    now = time.monotonic()
    for sid in [s for s, m in _mirrors.items() if not m.subscribers and (not m.seen or now - m.seen > TTL_S)]:
        del _mirrors[sid]
    for m in _mirrors.values():   # still watched, but the phone is long gone: drop its snapshot
        if m.state is not None and now - m.seen > TTL_S:
            m.client_id, m.version, m.state = None, -1, None
    if len(_mirrors) > MAX_SESSIONS:
        for sid, _ in sorted(_mirrors.items(), key=lambda kv: kv[1].seen)[:len(_mirrors) - MAX_SESSIONS]:
            m = _mirrors.pop(sid)
            m.publish('gone', {})


def _bad(status, error, message):
    return JSONResponse({'error': error, 'message': message}, status_code=status)


@router.post('/{session_id}')
async def publish(session_id: str, request: Request):
    """A phone's snapshot (with `state`) or heartbeat (without)."""
    if not _ID.match(session_id):
        return _bad(400, 'bad_session_id', 'session_id: letters, digits, - and _ only')
    body = await request.body()
    if len(body) > MAX_BYTES:
        return _bad(413, 'too_large', f'a snapshot may be at most {MAX_BYTES // 1024} kB')
    try:
        msg = json.loads(body or b'{}')
    except ValueError:
        return _bad(400, 'not_json', 'the body is not JSON')
    if not isinstance(msg, dict):
        return _bad(400, 'not_an_object', 'the body must be a JSON object')
    client = msg.get('client_id')
    version = msg.get('version')
    state = msg.get('state')
    if not isinstance(client, str) or not _ID.match(client) or not isinstance(version, int):
        return _bad(400, 'bad_fields', 'client_id (text) and version (number) are required')
    if msg.get('role', 'customer') != 'customer':
        return {'ok': True, 'ignored': 'role'}
    if state is not None and not isinstance(state, dict):
        return _bad(400, 'bad_state', 'state must be a JSON object')

    m = _mirrors.get(session_id)
    if state is None:   # heartbeat
        if m is None or m.state is None:
            return {'ok': True, 'need_state': True}
        if m.client_id != client:
            return {'ok': True, 'ignored': 'not_the_shown_phone'}
        if version < m.version:
            return {'ok': True, 'ignored': 'stale'}
        if version > m.version:   # the phone has changed something we did not get
            return {'ok': True, 'need_state': True}
        m.seen = time.monotonic()
        m.publish('ping', {'client_id': client, 'version': version})
        return {'ok': True}

    if m is None:
        _prune()
        m = _mirrors[session_id] = _Mirror()
    if m.client_id == client and version <= m.version:
        return {'ok': True, 'ignored': 'stale'}
    m.client_id, m.version, m.state, m.seen = client, version, state, time.monotonic()
    m.publish('snapshot', m.payload())
    return {'ok': True}


@router.get('/{session_id}')
async def latest(session_id: str):
    """The latest snapshot ({live: false} when no phone has published for this visit)."""
    m = _mirrors.get(session_id) if _ID.match(session_id) else None
    if m is None or m.state is None:
        return {'live': False}
    return m.payload()


@router.get('/{session_id}/stream')
async def stream(session_id: str, request: Request):
    """Server-Sent Events: the latest snapshot now, then every new snapshot and heartbeat."""
    if not _ID.match(session_id):
        return _bad(400, 'bad_session_id', 'session_id: letters, digits, - and _ only')
    m = _mirrors.get(session_id)
    if m is None:
        _prune()
        m = _mirrors[session_id] = _Mirror()
    if len(m.subscribers) >= MAX_SUBSCRIBERS:
        return _bad(429, 'too_many_viewers', f'at most {MAX_SUBSCRIBERS} viewers per visit')
    q = asyncio.Queue(maxsize=8)
    m.subscribers.add(q)

    async def events():
        try:
            yield 'retry: 1500\n\n'
            if m.state is not None:
                yield f'event: snapshot\ndata: {json.dumps(m.payload(), separators=(",", ":"))}\n\n'
            while True:
                try:
                    line = await asyncio.wait_for(q.get(), timeout=KEEPALIVE_S)
                except asyncio.TimeoutError:
                    if await request.is_disconnected():
                        break
                    line = ': keepalive\n\n'
                yield line
        finally:
            m.subscribers.discard(q)

    return StreamingResponse(events(), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})
