// The phone page's state: what n8n says the phone shows (the "screen" reply), the conversation so
// far, the item choice, and every customer action. It only talks to the webhooks of
// API_CONTRACT.md part A and draws whatever screen n8n answers with.
//
// Fixes over the old page:
//  - status polls carry a sequence number and an "action epoch": a poll that started before the
//    customer's tap, or that returns while an action is in flight, is dropped (no stale overwrite);
//  - error replies that name a screen (409 wrong_step / session_ended) show a calm note and resync;
//  - polling stops for good once the visit is finished or timed out;
//  - "composing a change" on the item list is local state that polls do not override.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NetworkError, webhook } from '../shared/api'
import { usePolling } from '../shared/hooks'
import { report } from '../shared/log'
import type { ErrorReply, Item, ScreenName, ScreenReply } from '../shared/types'

export interface Message {
  id: number
  who: 'me' | 'bot'
  text: string
  tone?: 'sorry'
  /** 'understood': the AI's one-sentence reading of the customer's photo or voice note. */
  kind?: 'understood'
  media?: 'photo' | 'voice'
  photo?: string // data URL preview (not kept across reloads)
  hadPhoto?: boolean
  voiceSeconds?: number
  budget?: number
  state?: 'sending' | 'failed'
}

export interface Draft {
  text: string
  photo: { data: string; mime: string; preview: string } | null
  voice: { data: string; mime: string; seconds: number } | null
  budget: number | null
}

export type BusyKind = 'request' | 'confirm' | 'next' | 'anything_else' | 'finish_early'

export interface Notice {
  tone: 'info' | 'warning' | 'error'
  title: string
  text?: string
  retry?: () => void
}

export type LoadState = 'loading' | 'ready' | 'no_session' | 'unknown_session' | 'offline'

const POLL_MS = 1500
const ENDED: ScreenName[] = ['finished', 'timed_out']

interface Persisted {
  talk: Message[]
  picked: string[]
  items: Item[]
  completed: number
  budget: number | null
  lastScreen: ScreenName | null
}

const storageKey = (s: string) => 'aisle-guide:' + s

function loadPersisted(session: string | null): Persisted | null {
  if (!session) return null
  try {
    const raw = sessionStorage.getItem(storageKey(session))
    return raw ? (JSON.parse(raw) as Persisted) : null
  } catch {
    return null
  }
}

/** The budget the customer typed in words, e.g. "about $80" or "budget is 120 dollars". */
export function budgetFromText(text: string): number | null {
  const m = text.match(/\$\s?(\d{1,5}(?:\.\d{1,2})?)/) ?? text.match(/(\d{1,5})\s?(?:dollars|bucks|usd)\b/i)
  return m?.[1] ? Number(m[1]) : null
}

const replyKey = (r: ScreenReply | null) =>
  r
    ? [
        r.screen,
        r.message,
        r.data?.item?.sku,
        r.data?.light_on,
        r.data?.index,
        (r.data?.items ?? []).map((i) => i.sku).join(','),
        r.data?.question,
        (r.data?.requests ?? []).length,
      ].join('|')
    : ''

export function usePhoneSession() {
  const session = useMemo(() => new URLSearchParams(window.location.search).get('s'), [])
  const [saved] = useState(() => loadPersisted(session))

  const [current, setCurrent] = useState<ScreenReply | null>(null)
  const [load, setLoad] = useState<LoadState>(session ? 'loading' : 'no_session')
  const [talk, setTalk] = useState<Message[]>(
    saved?.talk.map((m) => (m.state === 'sending' ? { ...m, state: undefined } : m)) ?? [],
  )
  const [picked, setPicked] = useState<string[]>(saved?.picked ?? [])
  const [items, setItems] = useState<Item[]>(saved?.items ?? [])
  const [completed, setCompleted] = useState(saved?.completed ?? 0)
  const [budget, setBudget] = useState<number | null>(saved?.budget ?? null)
  const [busy, setBusy] = useState<{ kind: BusyKind; since: number } | null>(null)
  const [composing, setComposing] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [canFinishFromInput, setCanFinishFromInput] = useState(true)
  const [budgetFocus, setBudgetFocus] = useState(0)

  const lastScreen = useRef<ScreenName | null>(saved?.lastScreen ?? null)
  const lastBotText = useRef<string | null>(
    saved?.talk.filter((m) => m.who === 'bot' && !m.kind).pop()?.text ?? null,
  )
  const talkRef = useRef(talk)
  talkRef.current = talk
  const currentRef = useRef<ScreenReply | null>(null)
  const epoch = useRef(0) // bumps when an action starts and when it ends
  const busyRef = useRef(false)
  const pollSeq = useRef(0)
  const appliedSeq = useRef(0)
  const nextId = useRef(saved?.talk.reduce((m, t) => Math.max(m, t.id), 0) ?? 0)
  const retryBodies = useRef(new Map<number, Record<string, unknown>>())

  // Keep the conversation and choices across reloads of the page (same tab).
  useEffect(() => {
    if (!session) return
    try {
      const data: Persisted = {
        talk: talk.map(({ photo, ...m }) => ({ ...m, hadPhoto: m.hadPhoto || !!photo })),
        picked,
        items,
        completed,
        budget,
        lastScreen: lastScreen.current,
      }
      sessionStorage.setItem(storageKey(session), JSON.stringify(data))
    } catch {
      // storage full or blocked: the page still works
    }
  }, [session, talk, picked, items, completed, budget, current])

  const say = useCallback((m: Omit<Message, 'id'>) => {
    const id = ++nextId.current
    setTalk((t) => [...t, { ...m, id }])
    return id
  }, [])

  /** Draws a screen reply. `mine` = the answer to the customer's own action. */
  const apply = useCallback(
    (reply: ScreenReply, mine: boolean) => {
      const prev = lastScreen.current
      const changed = replyKey(reply) !== replyKey(currentRef.current)
      if (!changed && !mine) return
      const screenChanged = prev !== reply.screen
      if (mine || screenChanged) {
        if (reply.screen === 'sorry') say({ who: 'bot', text: reply.message, tone: 'sorry' })
        if (reply.screen === 'input' && prev === 'anything_else') {
          setTalk([])
          setPicked([])
        }
        if (reply.screen === 'anything_else' && screenChanged) setCompleted((c) => c + 1)
      }
      // What the AI saw in the photo (or heard in the voice note) that the customer just sent.
      const understood = (reply.data?.understood ?? '').trim()
      if (mine && understood && (reply.screen === 'question' || reply.screen === 'items')) {
        const lastMe = [...talkRef.current].reverse().find((m) => m.who === 'me')
        const media = lastMe?.photo || lastMe?.hadPhoto ? 'photo' : lastMe?.voiceSeconds ? 'voice' : null
        if (media) say({ who: 'bot', kind: 'understood', media, text: understood })
      }
      // A question is said once, whether it came as the answer to the customer or with a poll.
      const question = reply.data?.question || reply.message
      if (reply.screen === 'question' && (mine || question !== lastBotText.current)) {
        say({ who: 'bot', text: question })
        lastBotText.current = question
      }
      if (reply.screen === 'items') {
        const skus = (reply.data?.items ?? []).map((i) => i.sku).join(',')
        setItems((old) => {
          if (old.map((i) => i.sku).join(',') !== skus) setPicked([])
          return reply.data?.items ?? []
        })
      }
      if (reply.screen !== 'items') setComposing(false)
      if (screenChanged) {
        report(
          'screen_drawn',
          {
            screen: reply.screen,
            from: prev,
            sku: reply.data?.item?.sku,
            index: reply.data?.index,
            total: reply.data?.total,
            light_on: reply.data?.light_on,
            items: reply.data?.items?.map((i) => i.sku),
          },
          'info',
          true,
        )
      }
      lastScreen.current = reply.screen
      currentRef.current = reply
      setCurrent(reply)
      setLoad('ready')
    },
    [say],
  )

  /** Fetches the current screen from n8n. Stale answers (older poll, or an action started since) are dropped. */
  const refresh = useCallback(
    async ({ quiet = true }: { quiet?: boolean } = {}) => {
      if (!session) return
      const seq = ++pollSeq.current
      const startEpoch = epoch.current
      try {
        const res = await webhook<ScreenReply>(
          'GET',
          'help/status?session_id=' + encodeURIComponent(session),
          undefined,
          {
            timeoutMs: 10_000,
            quiet,
          },
        )
        if (seq < appliedSeq.current || startEpoch !== epoch.current || busyRef.current) return
        appliedSeq.current = seq
        if (!res.ok) {
          if (res.error.error === 'unknown_session') setLoad('unknown_session')
          return
        }
        apply(res.data, false)
      } catch {
        if (!currentRef.current) setLoad('offline')
      }
    },
    [session, apply],
  )

  const ended = !!current && ENDED.includes(current.screen)
  usePolling(() => refresh(), POLL_MS, !!session && load !== 'unknown_session' && !ended)

  /** An error reply from a customer action: a calm note, then the real state from /help/status. */
  const handleError = useCallback(
    async (err: ErrorReply, kind: BusyKind) => {
      if (err.error === 'unknown_session') {
        setLoad('unknown_session')
        return
      }
      if (kind === 'finish_early' && err.error === 'wrong_step') {
        // The server does not take "no" on this screen (yet): hide the option, nothing scary.
        setCanFinishFromInput(false)
        await refresh()
        return
      }
      if (err.error === 'session_ended') {
        setNotice({ tone: 'info', title: 'This visit has ended', text: err.message })
        const before = currentRef.current
        await refresh()
        if (currentRef.current === before || !ENDED.includes(currentRef.current?.screen ?? 'input')) {
          apply(
            {
              session_id: session ?? '',
              screen: 'timed_out',
              message: err.message || 'This visit has ended.',
              data: { requests: currentRef.current?.data?.requests ?? [] },
            },
            true,
          )
        }
        return
      }
      if (err.error === 'wrong_step' || err.screen) {
        setNotice({
          tone: 'info',
          title: 'Your visit has moved on',
          text: "That step was already done, so we've brought you to where you are now.",
        })
        await refresh()
        return
      }
      if (err.error === 'empty_request') {
        setNotice({
          tone: 'warning',
          title: 'Tell us a little more',
          text: 'Type a few words, add a photo, or record a voice note.',
        })
        return
      }
      setNotice({ tone: 'error', title: "That didn't go through", text: err.message || 'Please try again.' })
    },
    [apply, refresh, session],
  )

  /** Runs one customer action: one at a time, polls paused, the reply drawn as soon as it lands. */
  const act = useCallback(
    async (kind: BusyKind, path: string, body: Record<string, unknown>, onNetworkError?: () => void) => {
      if (busyRef.current || !session) return false
      busyRef.current = true
      epoch.current++
      setBusy({ kind, since: Date.now() })
      setNotice(null)
      try {
        const res = await webhook<ScreenReply>('POST', path, { session_id: session, ...body })
        if (res.ok) {
          apply(res.data, true)
          // A request should get a question, a sorry or an item list back; the input screen again
          // means the service did not take it in, so say so instead of showing nothing.
          if (kind === 'request' && res.data.screen === 'input') {
            report('unexpected_reply', { path, screen: res.data.screen }, 'warn')
            setNotice({
              tone: 'warning',
              title: "We didn't catch that",
              text: 'The store service did not answer your request. Please send it again in a moment.',
            })
          }
          return true
        }
        busyRef.current = false
        await handleError(res.error, kind)
        return false
      } catch (e) {
        if (onNetworkError) onNetworkError()
        else
          setNotice({
            tone: 'error',
            title: "We couldn't reach the store's service",
            text:
              e instanceof NetworkError && e.message === 'timed out'
                ? 'It took too long to answer.'
                : 'Check your connection and try again.',
            retry: () => void act(kind, path, body),
          })
        return false
      } finally {
        busyRef.current = false
        epoch.current++
        setBusy(null)
      }
    },
    [apply, handleError, session],
  )

  // ---------------------------------------------------------------- customer actions

  const sendRequest = useCallback(
    async (draft: Draft): Promise<boolean> => {
      const text = draft.text.trim()
      const typedBudget = draft.budget ?? (text ? budgetFromText(text) : null)
      const words =
        text || (draft.budget != null && !draft.photo && !draft.voice ? `My budget is $${draft.budget}` : '')
      if (!words && !draft.photo && !draft.voice) return false
      if (typedBudget != null) setBudget(typedBudget)
      const body: Record<string, unknown> = {
        ...(words && { text: words }),
        ...(draft.photo && { image_base64: draft.photo.data, image_mime: draft.photo.mime }),
        ...(draft.voice && { audio_base64: draft.voice.data, audio_mime: draft.voice.mime }),
        ...(draft.budget != null && { budget: draft.budget }),
      }
      const id = say({
        who: 'me',
        text: words,
        photo: draft.photo?.preview,
        voiceSeconds: draft.voice?.seconds,
        budget: draft.budget ?? undefined,
        state: 'sending',
      })
      retryBodies.current.set(id, body)
      const markFailed = () => setTalk((t) => t.map((m) => (m.id === id ? { ...m, state: 'failed' } : m)))
      setComposing(false)
      const ok = await act('request', 'help/request', body, markFailed)
      setTalk((t) => t.map((m) => (m.id === id && m.state === 'sending' ? { ...m, state: undefined } : m)))
      if (ok) retryBodies.current.delete(id)
      return ok
    },
    [act, say],
  )

  const retryMessage = useCallback(
    async (id: number) => {
      const body = retryBodies.current.get(id)
      if (!body) return
      setTalk((t) => t.map((m) => (m.id === id ? { ...m, state: 'sending' } : m)))
      const ok = await act('request', 'help/request', body, () =>
        setTalk((t) => t.map((m) => (m.id === id ? { ...m, state: 'failed' } : m))),
      )
      if (ok) {
        retryBodies.current.delete(id)
        setTalk((t) => t.map((m) => (m.id === id ? { ...m, state: undefined } : m)))
      }
    },
    [act],
  )

  const togglePick = useCallback((sku: string) => {
    setPicked((p) => (p.includes(sku) ? p.filter((s) => s !== sku) : [...p, sku]))
  }, [])

  const confirm = useCallback(() => act('confirm', 'help/confirm', { skus: picked }), [act, picked])
  const done = useCallback(() => act('next', 'help/next', {}), [act])
  const anythingElse = useCallback(
    (answer: 'yes' | 'no') => act('anything_else', 'help/anything-else', { answer }),
    [act],
  )
  const finishFromInput = useCallback(() => act('finish_early', 'help/anything-else', { answer: 'no' }), [act])

  const retryLoad = useCallback(() => {
    setLoad('loading')
    void refresh({ quiet: false })
  }, [refresh])

  const pickedItems = useMemo(
    () => picked.map((s) => items.find((i) => i.sku === s)).filter((i): i is Item => !!i),
    [picked, items],
  )

  return {
    session,
    load,
    current,
    talk,
    busy,
    notice,
    dismissNotice: () => setNotice(null),
    picked,
    pickedItems,
    items,
    budget,
    setBudget,
    composing,
    setComposing,
    budgetFocus,
    openBudgetField: () => setBudgetFocus((n) => n + 1),
    completed,
    canFinishFromInput: canFinishFromInput && completed > 0,
    sendRequest,
    retryMessage,
    togglePick,
    confirm,
    done,
    anythingElse,
    finishFromInput,
    retryLoad,
  }
}

export type PhoneSession = ReturnType<typeof usePhoneSession>
