import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack } from '@astryxdesign/core/HStack'
import { VStack } from '@astryxdesign/core/VStack'
import { StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import {
  CameraIcon,
  CurrencyDollarIcon,
  MicrophoneIcon,
  PaperAirplaneIcon,
  PhotoIcon,
  StopIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useElapsed } from '../shared/hooks'
import { report } from '../shared/log'
import type { Draft } from './usePhoneSession'
import { clock, PHOTO_PICKER_EVENT, preparePhoto, startRecording, type Recording } from './media'
import { useMirrorComposer, type ComposerView } from './mirror'

interface Props {
  isBusy: boolean
  onSend: (draft: Draft) => Promise<boolean>
  placeholder: string
  /** Bumped to open (and focus) the budget field from outside, e.g. "Other amount". */
  budgetFocus?: number
  focusKey?: string | number
}

const MAX_RECORDING_S = 60
const MAX_ROWS = 5
const EMPTY: Draft = { text: '', photo: null, voice: null, budget: null }

/** Something attached to the message, with a 44 px "remove" button. */
function Attachment({ children, label, onRemove }: { children: ReactNode; label: string; onRemove: () => void }) {
  return (
    <HStack gap={1} vAlign="center" className="attachment">
      {children}
      <IconButton label={label} icon={<Icon icon={XMarkIcon} />} variant="ghost" size="lg" onClick={onRemove} />
    </HStack>
  )
}

/** One row high, growing with the text up to five rows (TextArea has no auto-grow of its own). */
function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const cs = getComputedStyle(el)
    const line = parseFloat(cs.lineHeight) || 24
    const pad = parseFloat(cs.paddingBlockStart) + parseFloat(cs.paddingBlockEnd)
    el.style.height = `${Math.min(el.scrollHeight, line * MAX_ROWS + pad)}px`
  }, [ref, value])
}

export function Composer({ isBusy, onSend, placeholder, budgetFocus = 0, focusKey }: Props) {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [budgetText, setBudgetText] = useState('')
  const budgetValue = budgetText && Number(budgetText) > 0 ? Math.round(Number(budgetText)) : null
  const [problem, setProblem] = useState<string | null>(null)
  const [recordingSince, setRecordingSince] = useState<number | null>(null)
  const recording = useRef<Recording | null>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const libraryInput = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  // "Take a photo of the problem" on the welcome screen opens this composer's camera or library.
  useEffect(() => {
    const open = (e: Event) => {
      const source = (e as CustomEvent<'camera' | 'library'>).detail
      const input = source === 'camera' ? cameraInput.current : libraryInput.current
      input?.click()
    }
    window.addEventListener(PHOTO_PICKER_EVENT, open)
    return () => window.removeEventListener(PHOTO_PICKER_EVENT, open)
  }, [])

  // What the composer shows: its own state, or (on the stage's mirror) the customer's phone's.
  const mirror = useMirrorComposer()
  const own: ComposerView = {
    text: draft.text,
    photo: draft.photo?.preview ?? null,
    voiceSeconds: draft.voice?.seconds ?? null,
    budget: draft.budget,
    budgetOpen,
    budgetText,
    problem,
    recordingSince,
  }
  const v = mirror.view ?? own
  const reportView = mirror.report
  useEffect(() => {
    reportView?.(own)
    // `own` is rebuilt on every render from exactly these values
  }, [reportView, own.text, own.photo, own.voiceSeconds, own.budget, budgetOpen, budgetText, problem, recordingSince])
  useEffect(() => () => reportView?.(null), [reportView])
  const elapsed = useElapsed(v.recordingSince)
  useAutoGrow(textRef, v.text)

  useEffect(() => {
    if (budgetFocus > 0) setBudgetOpen(true)
  }, [budgetFocus])

  // Put the cursor in the budget field whenever it opens.
  useEffect(() => {
    if (!budgetOpen) return
    const t = window.setTimeout(() => document.querySelector<HTMLInputElement>('.composer-budget input')?.focus(), 30)
    return () => window.clearTimeout(t)
  }, [budgetOpen, budgetFocus])

  // Focus the text box when the composer is opened for a change of request.
  useEffect(() => {
    if (focusKey === undefined) return
    window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus(), 50)
  }, [focusKey])

  const stopRecording = async () => {
    const r = recording.current
    recording.current = null
    setRecordingSince(null)
    if (!r) return
    const voice = await r.stop()
    if (voice) setDraft((d) => ({ ...d, voice }))
  }

  useEffect(() => {
    if (recordingSince != null && elapsed >= MAX_RECORDING_S) void stopRecording()
  }, [elapsed, recordingSince])
  const shownBudgetValue = v.budgetText && Number(v.budgetText) > 0 ? Math.round(Number(v.budgetText)) : null

  useEffect(() => () => recording.current?.cancel(), [])

  const record = async () => {
    setProblem(null)
    try {
      recording.current = await startRecording()
      setRecordingSince(Date.now())
    } catch (e) {
      const name = (e as Error)?.name
      const message = (e as Error)?.message
      report('microphone_unavailable', { error: String(message ?? e), name }, 'warn')
      setProblem(
        message === 'insecure'
          ? 'Voice notes need the secure (https) link from the kiosk. Type or add a photo instead.'
          : message === 'unsupported'
            ? "Voice notes aren't supported in this browser. Type or add a photo instead."
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? "We couldn't find a microphone on this phone. Type or add a photo instead."
              : name === 'NotReadableError' || name === 'AbortError'
                ? 'The microphone is busy in another app. Close it and try again, or type instead.'
                : 'We need permission to use the microphone. Allow it in your browser settings, or type instead.',
      )
    }
  }

  const addPhoto = async (file: File | undefined) => {
    if (!file) return
    setProblem(null)
    try {
      const photo = await preparePhoto(file)
      setDraft((d) => ({ ...d, photo }))
    } catch {
      setProblem("We couldn't read that photo. Try another one.")
    }
  }

  const commitBudget = () => {
    if (budgetValue != null) setDraft((d) => ({ ...d, budget: budgetValue }))
    setBudgetText('')
    setBudgetOpen(false)
  }

  const effective: Draft = {
    ...draft,
    budget: draft.budget ?? (budgetOpen ? budgetValue : null),
  }
  const canSend =
    !isBusy &&
    recordingSince == null &&
    !!(effective.text.trim() || effective.photo || effective.voice || effective.budget)
  // the same, from what is shown (equal to the above on the phone itself)
  const shownBudget = v.budget ?? (v.budgetOpen ? shownBudgetValue : null)
  const canSendShown =
    !isBusy && v.recordingSince == null && !!(v.text.trim() || v.photo || v.voiceSeconds || shownBudget)

  const send = async () => {
    if (!canSend) return
    const sent = effective
    setDraft(EMPTY)
    setBudgetOpen(false)
    setBudgetText('')
    const ok = await onSend(sent)
    if (!ok) setDraft((d) => (d.text || d.photo || d.voice ? d : sent))
  }

  // Enter sends, Shift+Enter starts a new line.
  const sendRef = useRef(send)
  sendRef.current = send
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key === 'Enter' && !e.shiftKey && t?.tagName === 'TEXTAREA' && t.closest('.composer')) {
        e.preventDefault()
        void sendRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const sendLabel = !v.text.trim() && shownBudget && !v.photo && !v.voiceSeconds ? 'Send budget' : 'Send'

  return (
    <VStack gap={2} className="composer">
      {(v.photo || v.voiceSeconds || v.budget != null) && (
        <HStack gap={2} vAlign="center" wrap="wrap" aria-label="Attached to your message">
          {v.photo && (
            <Attachment label="Remove photo" onRemove={() => setDraft((d) => ({ ...d, photo: null }))}>
              <img className="attachment-photo" src={v.photo} alt="Your photo" />
              {!v.text.trim() && (
                <VStack gap={0}>
                  <Text type="label">Photo added</Text>
                  <Text type="supporting">Add a few words, or just send it.</Text>
                </VStack>
              )}
            </Attachment>
          )}
          {!!v.voiceSeconds && (
            <Attachment label="Remove voice note" onRemove={() => setDraft((d) => ({ ...d, voice: null }))}>
              <Token
                size="lg"
                color="orange"
                icon={<Icon icon={MicrophoneIcon} size="sm" />}
                label={`Voice note · ${clock(v.voiceSeconds)}`}
              />
            </Attachment>
          )}
          {v.budget != null && (
            <Attachment label="Remove budget" onRemove={() => setDraft((d) => ({ ...d, budget: null }))}>
              <Token
                size="lg"
                color="green"
                icon={<Icon icon={CurrencyDollarIcon} size="sm" />}
                label={`Budget $${v.budget}`}
              />
            </Attachment>
          )}
        </HStack>
      )}

      {v.budgetOpen && (
        <HStack gap={2} vAlign="end" className="composer-budget">
          <StackItem size="fill">
            <TextInput
              label="Your budget for the whole job"
              value={v.budgetText}
              onChange={(v) => setBudgetText(v.replace(/[^0-9.]/g, '').slice(0, 7))}
              inputMode="decimal"
              enterKeyHint="send"
              startIcon={CurrencyDollarIcon}
              placeholder="e.g. 80"
              size="lg"
              onEnter={() => (effective.text.trim() ? commitBudget() : void send())}
            />
          </StackItem>
          <Button label="Add" size="lg" onClick={commitBudget} isDisabled={!shownBudgetValue} />
        </HStack>
      )}

      {v.problem && (
        <Text type="supporting" color="secondary" as="p">
          {v.problem}
        </Text>
      )}

      {v.recordingSince != null ? (
        <VStack gap={3} className="composer-recording" role="status">
          <HStack gap={3} vAlign="center">
            <StatusDot variant="error" label="Recording" isPulsing />
            <StackItem size="fill">
              <VStack gap={0}>
                <Text type="label" hasTabularNumbers>
                  Recording… {clock(elapsed)}
                </Text>
                <Text type="supporting">Describe the problem, then tap Stop.</Text>
              </VStack>
            </StackItem>
          </HStack>
          <HStack gap={2}>
            <Button
              label="Cancel"
              variant="ghost"
              size="lg"
              onClick={() => {
                recording.current?.cancel()
                recording.current = null
                setRecordingSince(null)
              }}
            />
            <StackItem size="fill">
              <Button
                label="Stop"
                variant="primary"
                size="lg"
                width="100%"
                icon={<Icon icon={StopIcon} />}
                onClick={() => void stopRecording()}
              />
            </StackItem>
          </HStack>
        </VStack>
      ) : (
        <VStack gap={2}>
          <TextArea
            label="Your message"
            isLabelHidden
            value={v.text}
            onChange={(text) => setDraft((d) => ({ ...d, text }))}
            ref={textRef}
            placeholder={placeholder}
            rows={1}
            size="lg"
            enterKeyHint="send"
            isDisabled={isBusy}
            controlClassName="composer-text"
          />
          <HStack gap={1} vAlign="center">
            <IconButton
              label="Take a photo"
              tooltip="Take a photo"
              icon={<Icon icon={CameraIcon} />}
              variant="ghost"
              size="lg"
              isDisabled={isBusy}
              onClick={() => cameraInput.current?.click()}
            />
            <IconButton
              label="Choose a photo"
              tooltip="Choose a photo"
              icon={<Icon icon={PhotoIcon} />}
              variant="ghost"
              size="lg"
              isDisabled={isBusy}
              onClick={() => libraryInput.current?.click()}
            />
            <IconButton
              label="Record a voice note"
              tooltip="Record a voice note"
              icon={<Icon icon={MicrophoneIcon} />}
              variant="ghost"
              size="lg"
              isDisabled={isBusy}
              onClick={() => void record()}
            />
            <Button
              label="Budget"
              variant={v.budgetOpen || v.budget != null ? 'secondary' : 'ghost'}
              size="lg"
              icon={<Icon icon={CurrencyDollarIcon} />}
              isDisabled={isBusy}
              onClick={() => setBudgetOpen((o) => !o)}
            />
            <StackItem size="fill" />
            <Button
              label={sendLabel}
              variant={canSendShown || isBusy ? 'primary' : 'secondary'}
              size="lg"
              icon={<Icon icon={PaperAirplaneIcon} />}
              isDisabled={!canSendShown}
              isLoading={isBusy}
              onClick={() => void send()}
            />
          </HStack>
          {/* "capture" opens the camera straight away on a phone; the other one opens the photo library */}
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              void addPhoto(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <input
            ref={libraryInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void addPhoto(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </VStack>
      )}
    </VStack>
  )
}
