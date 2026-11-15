// The demo stage's live state: the visit started at the kiosk, what n8n says the phone shows,
// what the robot service reports, and a readable event log of the whole flow.
import { useCallback, useEffect, useRef, useState } from 'react'
import { getJSON, NetworkError, webhook } from '../shared/api'
import { usePolling } from '../shared/hooks'
import { report } from '../shared/log'
import { loadRuntime } from '../shared/runtime'
import type { Health, ScreenName, ScreenReply, StartReply, TourStatus } from '../shared/types'
import type { FlowKey } from './flow'

export type Actor = 'kiosk' | 'phone' | 'ai' | 'n8n' | 'robot' | 'light'

export interface LogEntry {
  id: number
  time: string
  actor: Actor
  text: string
  /** The API call involved, shown in a monospace chip. */
  call?: string
  /** The n8n decision nodes this step went through, as [node name, branch taken]. */
  decisions?: Decision[]
}

export type Decision = [node: string, branch: string]

const RELEVANT: Decision = ['Relevant to home repair?', 'yes']

/** n8n's budget rule question (Config: budget_question), as opposed to a follow-up the AI asked itself. */
const isBudgetRule = (s: ScreenReply) =>
  /^before i pick the items/i.test(s.message ?? '') || (s.data?.options ?? []).includes('No fixed budget')

/**
 * Which n8n decision nodes (their names on the canvas) led to this screen. Every screen change
 * has exactly one path through the workflow, so the path is read off the change itself.
 */
function decisionsFor(s: ScreenReply, prev: ScreenName | null): { text: string; decisions: Decision[] } | null {
  switch (s.screen) {
    case 'sorry':
      return { text: 'Not a home-repair request: the phone says sorry.', decisions: [['Relevant to home repair?', 'no']] }
    case 'question':
      return isBudgetRule(s)
        ? {
            text: 'Asks for the budget before showing any items.',
            decisions: [RELEVANT, ['Did the AI ask a question or pick items?', 'picked items'], ['Budget known?', 'no']],
          }
        : {
            text: 'Sends the AI’s follow-up question to the phone.',
            decisions: [RELEVANT, ['Did the AI ask a question or pick items?', 'asked a question']],
          }
    case 'items':
      return {
        text: `Shows ${s.data?.items?.length ?? 'the'} items from this store’s catalogue.`,
        decisions: [RELEVANT, ['Did the AI ask a question or pick items?', 'picked items'], ['Budget known?', 'yes']],
      }
    case 'guiding':
      return prev === 'arrived'
        ? { text: 'Light off, robot sent to the next item.', decisions: [['More items left?', 'yes']] }
        : {
            text: 'Robot sent to the first item. AI 3 writes the repair steps meanwhile.',
            decisions: [['Any items chosen?', 'yes']],
          }
    case 'arrived':
      return { text: 'The phone shows “I am done”.', decisions: [['Near or arrived?', 'arrived']] }
    case 'anything_else':
      return prev === 'items'
        ? { text: 'No items picked: asks if there is anything else.', decisions: [['Any items chosen?', 'no']] }
        : { text: 'All items collected: asks if there is anything else.', decisions: [['More items left?', 'no']] }
    case 'finished':
      return {
        text: 'Visit finished: repair steps and videos on the phone, robot sent home.',
        decisions: [['Anything else: yes or no?', 'no']],
      }
    case 'input':
      return prev === 'anything_else'
        ? { text: 'A new request in the same visit.', decisions: [['Anything else: yes or no?', 'yes']] }
        : null
    case 'timed_out':
      return { text: '10 minutes without input: visit closed, robot sent home.', decisions: [['Idle visits found?', 'yes']] }
    default:
      return null
  }
}

export type KioskState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'visit'; session: string; link: string }
  | { kind: 'error'; message: string }

export type Reach = 'unknown' | 'ok' | 'down'

const MAX_LOG = 80

const linkFor = (session: string) => `${window.location.origin}/demo/phone.html?s=${session}`
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']
const linkKey = (session: string) => 'aisle-guide:link:' + session

/**
 * The phone link for the QR code. n8n's link is kept when it names this computer's network
 * address (HD_LAN=yes / HD_HTTPS=yes: a real phone must be able to open it). A localhost link is
 * rewritten to this page's own address, so the dev server (port 5173) and a stage opened by its
 * network address work too.
 */
function phoneLink(link: string, session: string): string {
  try {
    const u = new URL(link)
    if (LOCAL_HOSTS.includes(u.hostname) && u.searchParams.get('s') === session && u.pathname.endsWith('/phone.html')) {
      return linkFor(session)
    }
    return link
  } catch {
    return linkFor(session)
  }
}

/** Puts the visit in the address (?s=...), keeping the other settings (e.g. view=studio). */
function setSessionParam(session: string | null) {
  const q = new URLSearchParams(window.location.search)
  if (session) q.set('s', session)
  else q.delete('s')
  const rest = q.toString()
  window.history.replaceState(null, '', window.location.pathname + (rest ? '?' + rest : ''))
}

/** After a reload of the stage (?s=...): the link shown before, else one to this page's address. */
function rememberedLink(session: string): string {
  try {
    return sessionStorage.getItem(linkKey(session)) ?? linkFor(session)
  } catch {
    return linkFor(session)
  }
}

export function useStage() {
  const [kiosk, setKiosk] = useState<KioskState>(() => {
    const rejoin = new URLSearchParams(window.location.search).get('s')
    return rejoin ? { kind: 'visit', session: rejoin, link: rememberedLink(rejoin) } : { kind: 'idle' }
  })
  const session = kiosk.kind === 'visit' ? kiosk.session : null

  // After a reload in another tab (e.g. the studio view opened with ?s=...): the QR code must still
  // carry the address phones use in LAN mode, which the robot container writes into runtime.json.
  useEffect(() => {
    if (kiosk.kind !== 'visit') return
    let remembered: string | null = null
    try {
      remembered = sessionStorage.getItem(linkKey(kiosk.session))
    } catch {
      // nothing remembered
    }
    if (remembered) return
    const id = kiosk.session
    void loadRuntime().then((rt) => {
      if (!rt.phone_base) return
      const link = `${rt.phone_base.replace(/\/$/, '')}/demo/phone.html?s=${id}`
      setKiosk((k) => (k.kind === 'visit' && k.session === id && k.link !== link ? { ...k, link } : k))
    })
  }, [kiosk])
  const [phone, setPhone] = useState<ScreenReply | null>(null)
  const [robot, setRobot] = useState<TourStatus | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [reach, setReach] = useState<{ n8n: Reach; robot: Reach }>({ n8n: 'unknown', robot: 'unknown' })
  const [flow, setFlow] = useState<FlowKey | null>(session ? 'start' : null)
  const [log, setLog] = useState<LogEntry[]>([])

  const nextId = useRef(0)
  const lastScreen = useRef<ScreenName | null>(null)
  const lastState = useRef<string | null>(null)
  const lastLight = useRef(false)
  const sessionRef = useRef(session)
  sessionRef.current = session

  const say = useCallback((actor: Actor, text: string, call?: string, decisions?: Decision[]) => {
    const time = new Date().toLocaleTimeString([], { hour12: false })
    setLog((l) => [{ id: ++nextId.current, time, actor, text, call, decisions }, ...l].slice(0, MAX_LOG))
  }, [])

  // ------------------------------------------------------------------ kiosk
  const pressHelp = useCallback(async () => {
    setKiosk({ kind: 'starting' })
    try {
      const res = await webhook<StartReply>('POST', 'help/start', {}, { timeoutMs: 20_000 })
      if (!res.ok || !res.data.session_id) {
        throw new Error(res.ok ? 'no session id in the reply' : res.error.message || res.error.error)
      }
      const id = res.data.session_id
      setReach((x) => ({ ...x, n8n: 'ok' }))
      const link = phoneLink(res.data.link, id)
      try {
        sessionStorage.setItem(linkKey(id), link)
      } catch {
        // the link is only remembered for a reload of this tab
      }
      setKiosk({ kind: 'visit', session: id, link })
      setSessionParam(id)
      setPhone(null)
      lastScreen.current = null
      setFlow('start')
      say('kiosk', `Help button pressed. Visit ${id} started and the QR code is on screen.`, 'POST /help/start')
    } catch (e) {
      if (e instanceof NetworkError) setReach((x) => ({ ...x, n8n: 'down' }))
      const message =
        e instanceof NetworkError
          ? "The workflow didn't answer. Is n8n running with the workflow active?"
          : String((e as Error).message)
      setKiosk({ kind: 'error', message })
      say('kiosk', 'Could not start a visit: ' + message, 'POST /help/start')
    }
  }, [say])

  const resetKiosk = useCallback(() => {
    setKiosk({ kind: 'idle' })
    setPhone(null)
    setFlow(null)
    lastScreen.current = null
    setSessionParam(null)
  }, [])

  // ------------------------------------------------------------------ the robot
  usePolling(async () => {
    try {
      const r = await getJSON<TourStatus>('/tour/status', 3000)
      setRobot(r)
      setReach((x) => (x.robot === 'ok' ? x : { ...x, robot: 'ok' }))
      const item = r.current_item
      const light = !!item && r.lights_on.includes(item.tag_code)
      if (r.state !== lastState.current) {
        if (lastState.current !== null) {
          if (r.state === 'navigating' && item)
            say(
              'robot',
              `Driving to aisle ${item.aisle}, bay ${item.shelf} (item ${r.index} of ${r.total}).`,
              'POST /tour/start',
            )
          if (r.state === 'waiting_for_pick')
            say('robot', 'Arrived at the shelf. The phone now shows “I am done”.', '/robot/event arrived')
          if (r.state === 'returning_home') say('robot', 'Visit over. Heading back to the dock.', 'POST /tour/done')
          if (r.state === 'done') {
            say('robot', 'Back on the dock beside the kiosk.', '/robot/event home')
            if (lastScreen.current === 'finished' || lastScreen.current === 'timed_out') setFlow('home')
          }
        }
        lastState.current = r.state
      }
      if (light && !lastLight.current) {
        say('n8n', `Robot within 5 m: shelf tag ${item?.tag_code} lit.`, 'POST /tag/on', [['Near or arrived?', 'near (5 m)']])
        if (lastScreen.current === 'guiding') setFlow('light')
      }
      if (!light && lastLight.current) say('light', 'Item picked up. The shelf light is off.', 'POST /tag/off')
      lastLight.current = light
    } catch {
      setReach((x) => ({ ...x, robot: 'down' }))
    }
  }, 400)

  // Back to the kiosk's start screen a few seconds after the robot docks at the end of a visit.
  useEffect(() => {
    if (flow !== 'home') return
    const t = window.setTimeout(() => {
      if (lastScreen.current === 'finished' || lastScreen.current === 'timed_out') resetKiosk()
    }, 8000)
    return () => window.clearTimeout(t)
  }, [flow, resetKiosk])

  // ------------------------------------------------------------------ health (robot service + Nav2)
  // n8n has no health webhook, and probing an unknown session would log a 404 in the console, so
  // its pill turns green with the first answered call of a visit (help/start or help/status).
  usePolling(async () => {
    try {
      setHealth(await getJSON<Health>('/health', 4000))
    } catch {
      setHealth(null)
    }
  }, 10_000)

  // ------------------------------------------------------------------ what the phone shows (per n8n)
  const ended = phone?.screen === 'finished' || phone?.screen === 'timed_out'
  usePolling(
    async () => {
      const id = sessionRef.current
      if (!id) return
      try {
        const res = await webhook<ScreenReply>('GET', 'help/status?session_id=' + encodeURIComponent(id), undefined, {
          timeoutMs: 8000,
          quiet: true,
        })
        if (id !== sessionRef.current) return
        setReach((x) => ({ ...x, n8n: 'ok' }))
        if (!res.ok) {
          // the visit is gone (./reset.sh between takes): back to the kiosk's start screen
          if (res.error.error === 'unknown_session') {
            say('kiosk', 'That visit no longer exists (the demo was reset). Ready for the next customer.')
            resetKiosk()
          }
          return
        }
        const s = res.data
        setPhone(s)
        if (s.screen === lastScreen.current) return
        const prev = lastScreen.current
        if (s.screen === 'input' && prev !== 'anything_else')
          say('phone', 'Phone opened. Waiting for the customer to describe the problem.', 'GET /help/status')
        const understood = (s.data?.understood ?? '').trim()
        if (understood && (s.screen === 'question' || s.screen === 'items'))
          say('ai', `Gemini understood: “${understood}”`, 'AI 2: understand the need')
        const step = decisionsFor(s, prev)
        if (step) say('n8n', step.text, undefined, step.decisions)
        report('stage_screen', { screen: s.screen, from: prev, status: s.status, sku: s.data?.item?.sku }, 'info', true)
        setFlow(s.screen === 'sorry' ? 'gate' : s.screen === 'timed_out' ? 'finished' : (s.screen as FlowKey))
        lastScreen.current = s.screen
      } catch {
        setReach((x) => ({ ...x, n8n: 'down' }))
      }
    },
    1000,
    !!session && !(ended && flow === 'home'),
  )

  // ------------------------------------------------------------------ the live mirror of a real phone
  const mirrorChanged = useCallback(
    (live: boolean) =>
      say(
        'phone',
        live
          ? "The customer's own phone is connected. The phone frame now mirrors it live."
          : "The customer's phone went quiet. The phone frame shows the stage's own phone page again.",
        live ? 'POST /mirror' : undefined,
      ),
    [say],
  )

  return { kiosk, session, phone, robot, health, reach, flow, log, pressHelp, resetKiosk, mirrorChanged }
}

export type Stage = ReturnType<typeof useStage>
