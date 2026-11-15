// The stage's live mirror of the customer's phone: phone.html?s=<session>&view=mirror.
// It subscribes to the robot service's /mirror/<session>/stream (Server-Sent Events; polling if
// that fails) and draws the phone components read-only from the latest snapshot. It tells the
// stage around it (window.parent) whether a real phone is live, so the stage can switch to it.
// It never calls n8n and never acts: every action of the read-only session does nothing.
import { useEffect, useMemo, useRef, useState } from 'react'
import { PhoneApp } from './PhoneApp'
import { applyScrollPlace, composerFromWire, MirrorContext, mirrorSession, scrollArea, type MirrorState } from './mirror'

/** A phone that has not been heard from for this long is no longer shown. */
export const SILENT_MS = 10_000

interface Payload {
  live: boolean
  client_id?: string
  version?: number
  state?: MirrorState
  age_s?: number | null
}

interface Shown {
  st: MirrorState
  client: string
  version: number
  receivedAt: number
}

export function MirrorRoot() {
  const session = useMemo(() => new URLSearchParams(window.location.search).get('s') ?? '', [])
  const [shown, setShown] = useState<Shown | null>(null)
  const [live, setLive] = useState(false)
  const lastSeen = useRef(0)
  const shownRef = useRef<Shown | null>(null)
  shownRef.current = shown

  // ---------------------------------------------------------------- receiving
  useEffect(() => {
    if (!session) return
    const url = '/mirror/' + encodeURIComponent(session)
    const take = (p: Payload) => {
      if (!p.live || !p.state || !p.client_id || p.version == null) return
      const at = Date.now() - Math.max(0, (p.age_s ?? 0) * 1000)
      lastSeen.current = Math.max(lastSeen.current, at)
      const old = shownRef.current
      if (old && old.client === p.client_id && old.version >= p.version) return
      setShown({ st: p.state, client: p.client_id, version: p.version, receivedAt: at })
    }
    let poll = 0
    let stopped = false
    const startPolling = () => {
      if (poll || stopped) return
      const run = async () => {
        let next = 1000
        try {
          const res = await fetch(url, { cache: 'no-store' })
          if (res.ok) take((await res.json()) as Payload)
          // a robot service without the mirror (mirror.py not switched on yet): ask rarely
          else if (res.status === 404) next = 30_000
        } catch {
          // the robot service is restarting: try again
        }
        if (!stopped) poll = window.setTimeout(run, next)
      }
      poll = window.setTimeout(run, 0)
    }
    let es: EventSource | null = null
    if (typeof EventSource === 'undefined') startPolling()
    else {
      es = new EventSource(url + '/stream')
      es.addEventListener('snapshot', (e) => take(JSON.parse((e as MessageEvent<string>).data) as Payload))
      es.addEventListener('ping', (e) => {
        const p = JSON.parse((e as MessageEvent<string>).data) as { client_id: string; version: number }
        const cur = shownRef.current
        if (cur && cur.client === p.client_id) lastSeen.current = Date.now()
      })
      es.addEventListener('gone', () => setShown(null))
      // EventSource reconnects by itself; only a stream that gave up for good falls back to polling.
      es.onerror = () => {
        if (es?.readyState === EventSource.CLOSED) startPolling()
      }
    }
    return () => {
      stopped = true
      es?.close()
      window.clearTimeout(poll)
    }
  }, [session])

  // ---------------------------------------------------------------- live or not, told to the stage
  useEffect(() => {
    const tick = () => {
      const now = !!shownRef.current && Date.now() - lastSeen.current < SILENT_MS
      setLive(now)
      try {
        window.parent?.postMessage({ type: 'aisle-mirror', session, live: now }, window.location.origin)
      } catch {
        // not embedded
      }
    }
    tick()
    const t = window.setInterval(tick, 1000)
    return () => window.clearInterval(t)
  }, [session, shown])

  // ---------------------------------------------------------------- the phone's scroll position
  useEffect(() => {
    if (!shown) return
    const apply = () => {
      const el = scrollArea()
      if (!el) return
      // the same block at the top edge as on the phone (or pinned to the top / bottom)
      if (!(shown.st.at && applyScrollPlace(el, shown.st.at))) {
        const max = el.scrollHeight - el.clientHeight
        el.scrollTo({ top: Math.round(shown.st.scroll * Math.max(0, max)), behavior: 'auto' })
      }
      // scrolled: what the top edge cuts fades out under the header instead of being sliced (the
      // mirror's screen is not exactly as tall as the phone's, so it cuts elsewhere)
      el.classList.add('mirror-scroll')
      el.classList.toggle('is-scrolled', el.scrollTop > 4)
    }
    const raf = window.requestAnimationFrame(apply)
    const later = window.setTimeout(apply, 350) // after a smooth auto-scroll and images
    const last = window.setTimeout(apply, 900)
    return () => {
      window.cancelAnimationFrame(raf)
      window.clearTimeout(later)
      window.clearTimeout(last)
    }
  }, [shown])

  // read-only: no focus, no taps (it only shows the customer's phone)
  useEffect(() => {
    const root = document.getElementById('root')
    if (root) root.inert = true
  }, [])

  const s = useMemo(() => (shown ? mirrorSession(shown.st, shown.receivedAt, session) : null), [shown, session])
  const ctx = useMemo(
    () => ({ view: shown ? composerFromWire(shown.st.composer, shown.receivedAt) : null, report: null }),
    [shown],
  )
  if (!s) return null
  return (
    <MirrorContext.Provider value={ctx}>
      <div className="mirror-root" data-live={live || undefined}>
        <PhoneApp s={s} />
      </div>
    </MirrorContext.Provider>
  )
}

/** The welcome screen with no visit behind it, for the stage's idle phone (phone.html?view=preview). */
export function PreviewRoot() {
  const s = useMemo(
    () =>
      mirrorSession(
        {
          v: 1,
          load: 'ready',
          current: { session_id: '', screen: 'input', message: '', data: {} },
          talk: [],
          picked: [],
          items: [],
          budget: null,
          composing: false,
          completed: 0,
          canFinishFromInput: false,
          busy: null,
          notice: null,
          composer: null,
          scroll: 0,
        },
        Date.now(),
        '',
      ),
    [],
  )
  useEffect(() => {
    const root = document.getElementById('root')
    if (root) root.inert = true
  }, [])
  const ctx = useMemo(() => ({ view: null, report: null }), [])
  return (
    <MirrorContext.Provider value={ctx}>
      <div className="mirror-root">
        <PhoneApp s={s} />
      </div>
    </MirrorContext.Provider>
  )
}
