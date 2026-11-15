// The demo stage's live state: the visit started at the kiosk, what n8n says the phone shows,
// what the robot service reports, and a readable event log of the whole flow.
import { useCallback, useEffect, useRef, useState } from 'react'
import { getJSON, NetworkError, webhook } from '../shared/api'
import { usePolling } from '../shared/hooks'
import { report } from '../shared/log'
import { loadRuntime } from '../shared/runtime'
import type { Health, ScreenName, ScreenReply, StartReply, TourStatus, Trace } from '../shared/types'
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
  /** n8n's execution id of the run behind this entry (from the reply's trace): "Open in n8n". */
  execution?: string
  /** The decisions were read off the phone's screen (a workflow without `trace`), not reported by n8n. */
  inferred?: boolean
}

/** The n8n editor's page for one execution (n8n listens on this computer only). */
export const executionUrl = (id: string) => `http://localhost:5678/workflow/hdGuideRobot00001/executions/${id}`

export type Decision = [node: string, branch: string]

const RELEVANT: Decision = ['Relevant to home repair?', 'yes']

/** n8n's budget rule question (Config: budget_question), as opposed to a follow-up the AI asked itself. */
const isBudgetRule = (s: ScreenReply) =>
  /^before i pick the items/i.test(s.message ?? '') || (s.data?.options ?? []).includes('No fixed budget')

/**
 * What a screen change means, in words, and (only for a workflow that does not report its `trace`)
 * the decision nodes that must have led to it, read off the change itself. These inferred chips
 * name only nodes the screen proves; n8n's own trace replaces them whenever it is there.
 */
function decisionsFor(s: ScreenReply, prev: ScreenName | null): { text: string; decisions: Decision[] } | null {
  switch (s.screen) {
    case 'sorry':
      return { text: 'Not a home-repair request: the phone says sorry.', decisions: [['Relevant to home repair?', 'no']] }
    case 'question':
      return isBudgetRule(s)
        ? {
            text: 'Asks for the budget before showing any items.',
            decisions: [RELEVANT, ['Budget known?', 'no']],
          }
        : {
            text: 'Sends the AI’s follow-up question to the phone.',
            decisions: [RELEVANT],
          }
    case 'items':
      return {
        text: `Shows ${s.data?.items?.length ?? 'the'} items from this store’s catalogue.`,
        decisions: [RELEVANT, ['Budget known?', 'yes']],
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

/** What a run that did not change the phone's screen did (the robot's "near", a refused call...). */
function quietRun(t: Trace): string {
  const answer = (q: string) => t.decisions.find((d) => d.question === q)?.answer
  const near = answer('Near or arrived?')
  if (near && near.startsWith('near'))
    return answer('Phone still guiding to it?') === 'no'
      ? 'Robot within 5 m, but the customer has moved on: nothing to light.'
      : 'Robot within 5 m: n8n turns the shelf light on.'
  if (answer('Which call is this?') === 'kiosk button') return 'New visit saved; the kiosk shows its QR code.'
  return ''
}

export type KioskState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'visit'; session: string; link: string }
  | { kind: 'error'; message: string }

export type Reach = 'unknown' | 'ok' | 'down'

const MAX_LOG = 80

/** How long the studio shows "Visit complete" after the robot docks, before the kiosk resets. */
export const COMPLETE_HOLD_MS = 30_000

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

  const say = useCallback(
    (actor: Actor, text: string, call?: string, decisions?: Decision[], extra?: Pick<LogEntry, 'execution' | 'inferred'>) => {
      const time = new Date().toLocaleTimeString([], { hour12: false })
      setLog((l) => [{ id: ++nextId.current, time, actor, text, call, decisions, ...extra }, ...l].slice(0, MAX_LOG))
    },
    [],
  )

  // n8n's own account of each run (reply.trace): logged once per execution id
  const lastExecution = useRef<string | null>(null)
  const traceSeen = useRef(false) // this workflow reports traces: never infer decisions
  const waiting = useRef<{ text: string; at: number } | null>(null) // a screen change whose trace is due
  const logTrace = useCallback(
    (t: Trace, text: string) => {
      lastExecution.current = t.execution_id
      say(
        'n8n',
        text || quietRun(t),
        undefined,
        t.decisions.map((d) => [d.question, d.answer] as Decision),
        { execution: t.execution_id },
      )
    },
    [say],
  )
  const [phoneLive, setPhoneLive] = useState(false)

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
      setLog([]) // each visit (each recording take) starts with a clean event log
      setPhone(null)
      setPhoneLive(false)
      lastScreen.current = null
      waiting.current = null
      const startTrace = (res.data as StartReply & { trace?: Trace }).trace
      if (startTrace) traceSeen.current = true
      lastExecution.current = startTrace?.execution_id ?? null
      setFlow('start')
      say('kiosk', 'Help button pressed. A new visit started: waiting for the customer to scan its QR code.', 'POST /help/start')
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
            say('robot', 'Arrived at the shelf and told n8n.', '/robot/event arrived')
          if (r.state === 'returning_home') say('robot', 'Visit over. Heading back to the dock.', 'POST /tour/done')
          // only after a drive home: a robot that was already docked says nothing (no duplicate)
          if (r.state === 'done' && lastState.current === 'returning_home') {
            say('robot', 'Back on the dock beside the kiosk.', '/robot/event home')
          }
        }
        if (r.state === 'done' && (lastScreen.current === 'finished' || lastScreen.current === 'timed_out')) {
          setFlow((f) => (f === 'finished' ? 'home' : f))
        }
        lastState.current = r.state
      }
      if (light && !lastLight.current) {
        // with traces, n8n's own run ("Near or arrived? → near") follows as its own entry
        if (traceSeen.current) say('light', `Robot within 5 m: shelf tag ${item?.tag_code} lit.`, 'POST /tag/on')
        else
          say('n8n', `Robot within 5 m: shelf tag ${item?.tag_code} lit.`, 'POST /tag/on', [['Near or arrived?', 'near (5 m)']], {
            inferred: true,
          })
        if (lastScreen.current === 'guiding') setFlow('light')
      }
      if (!light && lastLight.current) say('light', 'Item picked up. The shelf light is off.', 'POST /tag/off')
      lastLight.current = light
    } catch {
      setReach((x) => ({ ...x, robot: 'down' }))
    }
  }, 400)

  // "Visit complete": once the robot docks at the end of a visit, the studio holds the finished
  // picture (every step done, the kiosk thanking the customer) for the closing line of the video,
  // then goes back to the kiosk's start screen. A kiosk press meanwhile starts the next visit at once.
  useEffect(() => {
    if (flow !== 'home') return
    const t = window.setTimeout(() => {
      if (lastScreen.current === 'finished' || lastScreen.current === 'timed_out') resetKiosk()
    }, COMPLETE_HOLD_MS)
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
            setLog([])
            say('kiosk', 'That visit no longer exists (the demo was reset). Ready for the next customer.')
            resetKiosk()
          }
          return
        }
        const s = res.data
        setPhone(s)
        const trace = s.trace && s.trace.execution_id ? s.trace : null
        if (trace) traceSeen.current = true
        const freshTrace = !!trace && trace.execution_id !== lastExecution.current
        if (s.screen === lastScreen.current) {
          // a run that did not change the screen (e.g. the robot's "near"), or the trace of a change
          if (freshTrace && trace) {
            logTrace(trace, waiting.current?.text ?? '')
            waiting.current = null
          } else if (waiting.current && Date.now() - waiting.current.at > 3000) {
            say('n8n', waiting.current.text)
            waiting.current = null
          }
          return
        }
        const prev = lastScreen.current
        const understood = (s.data?.understood ?? '').trim()
        if (understood && (s.screen === 'question' || s.screen === 'items'))
          say('ai', `The AI understood: “${understood}”`, 'AI 2: understand the need')
        const step = decisionsFor(s, prev)
        if (freshTrace && trace) {
          logTrace(trace, step?.text ?? '')
          waiting.current = null
        } else if (traceSeen.current) {
          if (step) waiting.current = { text: step.text, at: Date.now() } // its trace comes with the next poll
        } else if (step) say('n8n', step.text, undefined, step.decisions, { inferred: true })
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
    (live: boolean) => {
      setPhoneLive(live)
      say(
        'phone',
        live
          ? "The customer's own phone is connected. The phone frame now mirrors it live."
          : "The customer's phone went quiet. The phone frame shows the stage's own phone page again.",
        live ? 'POST /mirror' : undefined,
      )
    },
    [say],
  )

  // n8n's own health (the robot service asks n8n's /healthz): a grey dot reads as "broken" on camera
  usePolling(async () => {
    try {
      const h = await getJSON<{ ok: boolean }>('/n8n/health', 4000)
      setReach((x) => ({ ...x, n8n: h.ok ? 'ok' : 'down' }))
    } catch {
      // an older robot service without /n8n/health: the first answered call decides, as before
    }
  }, 10_000)

  /** The customer is past the QR code: their phone is live on the mirror, or the visit has moved on. */
  const connected = kiosk.kind === 'visit' && (phoneLive || (!!phone && phone.screen !== 'input'))
  /** The visit is over (repair steps on the phone, or timed out): the robot drives home, then "complete". */
  const visitEnded = kiosk.kind === 'visit' && ended
  const complete = visitEnded && flow === 'home'

  return {
    kiosk,
    session,
    phone,
    robot,
    health,
    reach,
    flow,
    log,
    pressHelp,
    resetKiosk,
    mirrorChanged,
    connected,
    visitEnded,
    complete,
  }
}

export type Stage = ReturnType<typeof useStage>
