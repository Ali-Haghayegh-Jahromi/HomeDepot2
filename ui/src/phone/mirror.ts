// Live mirror of the customer's phone on the demo stage (robot service: /mirror/{session_id}).
//
// A real phone publishes a compact snapshot of what it shows (the screen from n8n plus its local
// state: chat bubbles, typed draft, ticked items, loading states, a small photo thumbnail, the
// scroll position) whenever it changes (debounced) and sends a heartbeat every few seconds. The
// stage draws the same phone components read-only from that snapshot (MirrorView.tsx).
// It is a display relay only: it never calls n8n, and a failure never touches the visit.
import { createContext, useContext, useEffect, useRef } from 'react'
import type { Item, ScreenReply } from '../shared/types'
import type { BusyKind, LoadState, Message, Notice, PhoneSession } from './usePhoneSession'

/** What the composer shows: the same shape on the phone (live) and on the stage (mirror). */
export interface ComposerView {
  text: string
  photo: string | null // preview image URL
  voiceSeconds: number | null
  budget: number | null
  budgetOpen: boolean
  budgetText: string
  problem: string | null
  recordingSince: number | null // ms timestamp in this browser's clock
}

/** The composer on the wire: times as "milliseconds ago", so the two clocks never need to agree. */
type ComposerWire = Omit<ComposerView, 'recordingSince'> & { recordingMs: number | null }

export interface MirrorState {
  v: 1
  load: LoadState
  current: ScreenReply | null
  talk: Message[]
  picked: string[]
  items: Item[]
  budget: number | null
  composing: boolean
  completed: number
  canFinishFromInput: boolean
  busy: { kind: BusyKind; ms: number } | null
  notice: { tone: Notice['tone']; title: string; text?: string; retry: boolean } | null
  composer: ComposerWire | null
  scroll: number // 0 (top) .. 1 (bottom) of the page's scroll area (fallback for `at`)
  /** Where the phone is scrolled, in a form that survives a different screen height (see scrollPlace). */
  at?: ScrollPlace
  expanded?: string[]
  swapNote?: string | null
}

/**
 * The phone's scroll position as "this block is at the top edge, scrolled this far into it", or
 * pinned to the top or the bottom. The mirror's page is not exactly as tall as the phone's, so a
 * 0..1 ratio lands somewhere else; a named block (data-anchor) lands on the same content.
 */
export interface ScrollPlace {
  edge: 'top' | 'bottom' | null
  anchor: string | null
  offset: number
}

// ------------------------------------------------------------------ context for the composer

interface MirrorContextValue {
  /** Set on the stage's mirror: the composer draws this instead of its own state. */
  view: ComposerView | null
  /** Set on a publishing phone: the composer reports what it shows. */
  report: ((v: ComposerView | null) => void) | null
}

export const MirrorContext = createContext<MirrorContextValue>({ view: null, report: null })
export const useMirrorComposer = () => useContext(MirrorContext)

// ------------------------------------------------------------------ who publishes

/**
 * "customer" for a phone that opened the QR link; "stage" for the phone page embedded in the demo
 * stage (it must not show up as the customer's phone). `?role=` overrides the guess.
 */
export function phoneRole(): 'customer' | 'stage' {
  const asked = new URLSearchParams(window.location.search).get('role')
  if (asked === 'customer' || asked === 'stage') return asked
  try {
    return window.top !== window.self ? 'stage' : 'customer'
  } catch {
    return 'stage'
  }
}

function clientId(): string {
  const key = 'aisle-guide:mirror-client'
  try {
    const old = sessionStorage.getItem(key)
    if (old) return old
    const id = 'c' + Math.random().toString(36).slice(2, 12)
    sessionStorage.setItem(key, id)
    return id
  } catch {
    return 'c' + Math.random().toString(36).slice(2, 12)
  }
}

// ------------------------------------------------------------------ photo thumbnails

const THUMB_EDGE = 360
const thumbs = new Map<string, Promise<string>>()

/** A small JPEG of a photo (at most 360 px on its long edge), cached per photo. */
function thumbnail(src: string): Promise<string> {
  let t = thumbs.get(src)
  if (!t) {
    t = (async () => {
      const img = new Image()
      img.src = src
      await img.decode()
      const scale = Math.min(1, THUMB_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', 0.72)
    })().catch(() => '')
    thumbs.set(src, t)
    if (thumbs.size > 24) thumbs.delete(thumbs.keys().next().value as string)
  }
  return t
}

// ------------------------------------------------------------------ scroll position

/** The page's own scroll area (the Layout content), as the conversation's auto-scroll finds it. */
export function scrollArea(): HTMLElement | null {
  let el = document.querySelector<HTMLElement>('.phone-main')?.parentElement ?? null
  while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement
  return el
}

/** Where the scroll area is now (the phone side). */
export function scrollPlace(el: HTMLElement): ScrollPlace {
  if (el.scrollTop <= 2) return { edge: 'top', anchor: null, offset: 0 }
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) return { edge: 'bottom', anchor: null, offset: 0 }
  const top = el.getBoundingClientRect().top
  let best: { id: string; y: number } | null = null
  for (const a of el.querySelectorAll<HTMLElement>('[data-anchor]')) {
    const y = a.getBoundingClientRect().top - top
    // the last block that starts at or above the top edge (blocks are in reading order)
    if (y <= 1 && (!best || y >= best.y)) best = { id: a.dataset.anchor ?? '', y }
  }
  return best ? { edge: null, anchor: best.id, offset: Math.round(-best.y) } : { edge: null, anchor: null, offset: 0 }
}

/** Scrolls the mirror's area to the phone's place; false when the named block is not there. */
export function applyScrollPlace(el: HTMLElement, at: ScrollPlace): boolean {
  const max = Math.max(0, el.scrollHeight - el.clientHeight)
  if (at.edge === 'top') el.scrollTo({ top: 0, behavior: 'auto' })
  else if (at.edge === 'bottom') el.scrollTo({ top: max, behavior: 'auto' })
  else {
    const a = at.anchor ? el.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(at.anchor)}"]`) : null
    if (!a) return false
    const y = a.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
    el.scrollTo({ top: Math.min(max, Math.max(0, y + at.offset)), behavior: 'auto' })
  }
  return true
}

// ------------------------------------------------------------------ publishing (the real phone)

/** This page load: the service takes a new load's first snapshot whatever its version. */
const LOAD_ID = 'p' + Math.random().toString(36).slice(2, 12)

const DEBOUNCE_MS = 150
const HEARTBEAT_MS = 3000
const MAX_BYTES = 480_000 // the service takes up to 512 kB

async function snapshot(
  s: PhoneSession,
  composer: ComposerView | null,
  scroll: number,
  at: ScrollPlace | undefined,
): Promise<MirrorState> {
  const now = Date.now()
  const talk = await Promise.all(
    s.talk.map(async (m) => (m.photo ? { ...m, photo: (await thumbnail(m.photo)) || undefined, hadPhoto: true } : m)),
  )
  return {
    v: 1,
    load: s.load,
    current: s.current,
    talk,
    picked: s.picked,
    items: s.items,
    budget: s.budget,
    composing: s.composing,
    completed: s.completed,
    canFinishFromInput: s.canFinishFromInput,
    busy: s.busy ? { kind: s.busy.kind, ms: now - s.busy.since } : null,
    notice: s.notice
      ? { tone: s.notice.tone, title: s.notice.title, text: s.notice.text, retry: !!s.notice.retry }
      : null,
    composer: composer
      ? {
          ...composer,
          photo: composer.photo ? (await thumbnail(composer.photo)) || null : null,
          recordingMs: composer.recordingSince == null ? null : now - composer.recordingSince,
        }
      : null,
    scroll,
    at,
    expanded: s.expanded,
    swapNote: s.swapNote,
  }
}

/**
 * Publishes this phone's screen for the stage's mirror (only on a real phone, role "customer").
 * Best-effort: every failure is silent, and nothing here can change what the phone does.
 */
export function useMirrorPublisher(s: PhoneSession, composer: ComposerView | null): void {
  const enabled = !!s.session && phoneRole() === 'customer'
  const latest = useRef<{ s: PhoneSession; composer: ComposerView | null; scroll: number; at?: ScrollPlace }>({
    s,
    composer,
    scroll: 0,
  })
  latest.current = { ...latest.current, s, composer }
  // Versions start from the clock, so a reloaded page (same client id: it lives in sessionStorage,
  // and iOS often reloads the tab after the camera) always counts up from above its last run.
  const version = useRef(Date.now())
  const timer = useRef(0)
  const client = useRef('')

  const pausedUntil = useRef(0)

  const sendRef = useRef<(full: boolean) => Promise<void>>(async () => undefined)
  sendRef.current = async (full: boolean) => {
    const session = latest.current.s.session
    if (!session || Date.now() < pausedUntil.current) return
    if (!client.current) client.current = clientId()
    try {
      let body: string
      if (full) {
        const v = ++version.current // taken before the await, so later changes always get higher numbers
        const area = scrollArea()
        if (area) latest.current.at = scrollPlace(area) // where it is right now, not at the last scroll event
        const state = await snapshot(latest.current.s, latest.current.composer, latest.current.scroll, latest.current.at)
        body = JSON.stringify({ client_id: client.current, role: 'customer', version: v, load_id: LOAD_ID, state })
        if (body.length > MAX_BYTES) {
          // too big with the photos: send it without them (the bubbles then say "Photo")
          const lean = {
            ...state,
            talk: state.talk.map(({ photo: _photo, ...m }) => m),
            composer: state.composer && { ...state.composer, photo: null },
          }
          body = JSON.stringify({ client_id: client.current, role: 'customer', version: v, load_id: LOAD_ID, state: lean })
          if (body.length > MAX_BYTES) return
        }
      } else {
        body = JSON.stringify({ client_id: client.current, role: 'customer', version: version.current, load_id: LOAD_ID })
      }
      const res = await fetch('/mirror/' + encodeURIComponent(session), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      // a robot service without the mirror (mirror.py not switched on yet): try again in a minute
      if (res.status === 404) pausedUntil.current = Date.now() + 60_000
      if (!full && res.ok) {
        const reply = (await res.json().catch(() => ({}))) as { need_state?: boolean }
        if (reply.need_state) await sendRef.current(true)
      }
    } catch {
      // the mirror is optional: never bother the customer with it
    }
  }

  const schedule = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void sendRef.current(true), DEBOUNCE_MS)
  }

  // Every change of what the phone shows: a new snapshot (debounced).
  useEffect(() => {
    if (enabled) schedule()
  }, [
    enabled,
    s.load,
    s.current,
    s.talk,
    s.picked,
    s.items,
    s.budget,
    s.composing,
    s.completed,
    s.canFinishFromInput,
    s.busy,
    s.notice,
    s.expanded,
    s.swapNote,
    composer,
  ])

  // Heartbeat, the scroll position, and a fresh snapshot when the phone comes back from sleep.
  useEffect(() => {
    if (!enabled) return
    const beat = window.setInterval(() => {
      if (document.visibilityState === 'visible') void sendRef.current(false)
    }, HEARTBEAT_MS)
    const onScroll = () => {
      const el = scrollArea()
      if (!el) return
      const max = el.scrollHeight - el.clientHeight
      const ratio = max > 0 ? Math.round((el.scrollTop / max) * 1000) / 1000 : 0
      const at = scrollPlace(el)
      const old = latest.current.at
      if (
        ratio !== latest.current.scroll ||
        !old ||
        old.edge !== at.edge ||
        old.anchor !== at.anchor ||
        old.offset !== at.offset
      ) {
        latest.current.scroll = ratio
        latest.current.at = at
        schedule()
      }
    }
    const onVisible = () => document.visibilityState === 'visible' && schedule()
    document.addEventListener('scroll', onScroll, true)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(beat)
      window.clearTimeout(timer.current)
      document.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled])
}

// ------------------------------------------------------------------ drawing a snapshot (the stage)

const noop = () => undefined
const no = async () => false

/** A read-only PhoneSession from a snapshot: the phone components draw it; every action does nothing. */
export function mirrorSession(st: MirrorState, receivedAt: number, session: string): PhoneSession {
  return {
    session,
    load: st.load,
    current: st.current,
    talk: st.talk,
    busy: st.busy ? { kind: st.busy.kind, since: receivedAt - st.busy.ms } : null,
    notice: st.notice
      ? {
          tone: st.notice.tone,
          title: st.notice.title,
          text: st.notice.text,
          retry: st.notice.retry ? noop : undefined,
        }
      : null,
    dismissNotice: noop,
    picked: st.picked,
    pickedItems: st.picked.map((sku) => st.items.find((i) => i.sku === sku)).filter((i): i is Item => !!i),
    items: st.items,
    budget: st.budget,
    setBudget: noop,
    composing: st.composing,
    setComposing: noop,
    budgetFocus: 0,
    openBudgetField: noop,
    completed: st.completed,
    canFinishFromInput: st.canFinishFromInput,
    sendRequest: no,
    retryMessage: async () => undefined,
    togglePick: noop,
    expanded: st.expanded ?? [],
    toggleExpanded: noop,
    swapNote: st.swapNote ?? null,
    confirm: no,
    done: no,
    anythingElse: no,
    finishFromInput: no,
    retryLoad: noop,
  }
}

export function composerFromWire(c: ComposerWire | null, receivedAt: number): ComposerView | null {
  if (!c) return null
  const { recordingMs, ...rest } = c
  return { ...rest, recordingSince: recordingMs == null ? null : receivedAt - recordingMs }
}
