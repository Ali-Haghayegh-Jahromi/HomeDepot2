import { useLayoutEffect, useRef } from 'react'
import { ChatMessage, ChatMessageBubble, ChatMessageList } from '@astryxdesign/core/Chat'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { VStack } from '@astryxdesign/core/VStack'
import {
  ArrowPathIcon,
  CameraIcon,
  CurrencyDollarIcon,
  ExclamationCircleIcon,
  EyeIcon,
  MicrophoneIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline'
import { StackItem } from '@astryxdesign/core/Stack'
import { usePrefersReducedMotion, useElapsed } from '../shared/hooks'
import { clock, openPhotoPicker } from './media'
import { scrollArea } from './mirror'
import type { Message, PhoneSession } from './usePhoneSession'

const SUGGESTIONS = [
  'One of the boards on my deck is cracked',
  'My toilet keeps running after it flushes',
  "There's a fist-sized hole in my drywall",
  'My kitchen faucet drips all night',
]

export const asksAboutBudget = (q: string | undefined) => !!q && /budget|spend|price range|how much/i.test(q)

/** Honest progress while the AI works (2-20 s): what is most likely happening right now. */
function thinkingStep(seconds: number, hasPhoto: boolean, hasVoice: boolean): string {
  if (seconds < 2) return hasPhoto ? 'Sending your photo…' : hasVoice ? 'Sending your voice note…' : 'Checking your request…'
  if (seconds < 9)
    return hasVoice
      ? 'Listening to your voice note…'
      : hasPhoto
        ? 'Looking at your photo…'
        : 'Understanding the problem…'
  if (seconds < 16) return 'Checking what this store has in stock…'
  return 'Comparing prices and aisles. Almost there…'
}

/** The AI's reading of the customer's photo or voice note: "Here's what I see: …", with the photo. */
export function Understood({ m, photo }: { m: Pick<Message, 'text' | 'media'>; photo?: string }) {
  const text = (
    <VStack gap={1} className="understood">
      <HStack gap={1} vAlign="center">
        <Icon icon={m.media === 'voice' ? MicrophoneIcon : EyeIcon} size="sm" color="accent" />
        <Text type="label" color="accent">
          {m.media === 'voice' ? "Here's what I heard" : "Here's what I see"}
        </Text>
      </HStack>
      <Text as="p">{m.text}</Text>
    </VStack>
  )
  if (m.media !== 'photo' || !photo) return text
  return (
    <HStack gap={3} vAlign="start">
      <img className="seen-photo" src={photo} alt="The photo you sent" />
      <StackItem size="fill">{text}</StackItem>
    </HStack>
  )
}

/** The newest photo the customer sent before message `id` (for "Here's what I see"). */
export const photoBefore = (talk: Message[], id: number) =>
  [...talk].reverse().find((t) => t.id < id && t.who === 'me' && t.photo)?.photo

function Thinking({ since, last }: { since: number; last: Message | undefined }) {
  const seconds = useElapsed(since)
  const step = thinkingStep(seconds, !!(last?.photo || last?.hadPhoto), !!last?.voiceSeconds)
  return (
    <ChatMessage sender="assistant">
      <ChatMessageBubble variant="ghost">
        <VStack gap={2} className="thinking" aria-live="polite">
          <HStack gap={2} vAlign="center">
            <Spinner size="sm" aria-label={step} />
            <Text type="label" color="secondary">
              {step}
            </Text>
          </HStack>
          <Skeleton width="14rem" height="0.75rem" radius="rounded" index={0} />
          <Skeleton width="10rem" height="0.75rem" radius="rounded" index={1} />
        </VStack>
      </ChatMessageBubble>
    </ChatMessage>
  )
}

function Bubble({
  m,
  onRetry,
  isBusy,
  photo,
}: {
  m: Message
  onRetry: (id: number) => void
  isBusy: boolean
  photo?: string
}) {
  if (m.who === 'bot') {
    return (
      <ChatMessage sender="assistant" data-anchor={'m-' + m.id}>
        <ChatMessageBubble>
          {m.kind === 'understood' ? (
            <Understood m={m} photo={photo} />
          ) : m.tone === 'sorry' ? (
            <HStack gap={2} vAlign="start" className="bubble-sorry">
              <Icon icon={ExclamationCircleIcon} color="warning" size="sm" />
              <Text as="p">{m.text}</Text>
            </HStack>
          ) : (
            <Text as="p">{m.text}</Text>
          )}
        </ChatMessageBubble>
      </ChatMessage>
    )
  }
  return (
    <ChatMessage
      sender="user"
      data-anchor={'m-' + m.id}
      metadata={
        m.state === 'sending' ? (
          <Text type="supporting">Sending…</Text>
        ) : m.state === 'failed' ? (
          <HStack gap={1} vAlign="center">
            <Text type="supporting" color="secondary">
              Not sent.
            </Text>
            <Button
              label="Try again"
              variant="secondary"
              size="lg"
              icon={<Icon icon={ArrowPathIcon} />}
              isDisabled={isBusy}
              onClick={() => onRetry(m.id)}
            />
          </HStack>
        ) : undefined
      }
    >
      <ChatMessageBubble>
        <VStack gap={2}>
          {m.photo && (
            <span className={m.state === 'sending' ? 'bubble-photo-wrap is-scanning' : 'bubble-photo-wrap'}>
              <img className="bubble-photo" src={m.photo} alt="The photo you sent" />
            </span>
          )}
          {!m.photo && m.hadPhoto && (
            <HStack gap={1} vAlign="center">
              <Icon icon={CameraIcon} size="sm" color="inherit" />
              <Text color="inherit">Photo</Text>
            </HStack>
          )}
          {m.text && (
            <Text as="p" color="inherit">
              {m.text}
            </Text>
          )}
          {(m.voiceSeconds || m.budget) && (
            <HStack gap={1} wrap="wrap">
              {m.voiceSeconds ? (
                <Token
                  size="sm"
                  icon={<Icon icon={MicrophoneIcon} size="sm" />}
                  label={`Voice note · ${clock(m.voiceSeconds)}`}
                />
              ) : null}
              {m.budget ? (
                <Token size="sm" icon={<Icon icon={CurrencyDollarIcon} size="sm" />} label={`Budget $${m.budget}`} />
              ) : null}
            </HStack>
          )}
        </VStack>
      </ChatMessageBubble>
    </ChatMessage>
  )
}

/** First screen of a request: the photo is the headline way in; examples sit above the message box. */
function Welcome({ s }: { s: PhoneSession }) {
  const again = s.completed > 0
  return (
    <VStack gap={5} className="welcome" data-anchor="welcome">
      <VStack gap={2}>
        <Heading level={1}>{again ? 'What else are you fixing?' : 'What are you fixing today?'}</Heading>
        <Text as="p" color="secondary">
          Snap a photo of what's broken and tell me what happened. I'll find the parts in this store and walk you to
          them.
        </Text>
      </VStack>
      <VStack gap={2} hAlign="center">
        <Button
          label="Take a photo of the problem"
          variant="secondary"
          size="lg"
          width="100%"
          icon={<Icon icon={CameraIcon} />}
          isDisabled={!!s.busy}
          onClick={() => openPhotoPicker('camera')}
        />
        <Button
          label="or choose one from your photos"
          variant="ghost"
          size="lg"
          icon={<Icon icon={PhotoIcon} />}
          isDisabled={!!s.busy}
          onClick={() => openPhotoPicker('library')}
        />
      </VStack>
    </VStack>
  )
}

const BUDGET_PICKS = [25, 50, 100, 200]

/**
 * Tap-to-answer chips, in the footer just above the message box, so they show on the phone and on
 * the stage's mirror whatever the scroll: the AI's suggested answers, budget amounts, or examples.
 */
export function QuickReplies({ s }: { s: PhoneSession }) {
  const screen = s.current?.screen
  const data = s.current?.data ?? {}
  if (s.busy || s.composing) return null
  const answer = (text: string) => void s.sendRequest({ text, photo: null, voice: null, budget: null })
  if (screen === 'question') {
    const options = data.options ?? []
    const budgetPicks = asksAboutBudget(data.question) && s.budget == null && !options.some((o) => /\$|\d/.test(o))
    if (!options.length && !budgetPicks) return null
    return (
      <HStack gap={2} wrap="wrap" as="section" aria-label="Tap an answer" className="quick-replies">
        {options.map((o) => (
          <Button key={o} label={o} variant="secondary" size="lg" onClick={() => answer(o)} />
        ))}
        {budgetPicks && (
          <>
            {BUDGET_PICKS.map((n) => (
              <Button
                key={n}
                label={`$${n}`}
                variant="secondary"
                size="lg"
                onClick={() =>
                  void s.sendRequest({ text: `My budget is about $${n}`, photo: null, voice: null, budget: n })
                }
              />
            ))}
            <Button label="Other amount" variant="ghost" size="lg" onClick={s.openBudgetField} />
          </>
        )}
      </HStack>
    )
  }
  // examples: on the first screen, and after a "sorry" as a way back in
  if ((screen === 'input' && s.talk.length === 0) || screen === 'sorry') {
    return (
      <section aria-label="Examples you can send" className="example-row" data-overflow-ok>
        <HStack gap={2} className="example-track">
          {SUGGESTIONS.map((t) => (
            <Button key={t} label={t} variant="secondary" size="lg" onClick={() => answer(t)} />
          ))}
        </HStack>
      </section>
    )
  }
  return null
}

/** Scrolls the page's own scroll area (scrollIntoView would also scroll the stage around the phone frame). */
function scrollAreaTo(el: HTMLElement | null, where: 'end' | 'start', smooth: boolean) {
  const area = scrollArea()
  if (!area) return
  const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto'
  if (where === 'end' || !el) {
    area.scrollTo({ top: area.scrollHeight, behavior })
    return
  }
  const top = el.getBoundingClientRect().top - area.getBoundingClientRect().top + area.scrollTop
  area.scrollTo({ top: Math.max(0, top - 8), behavior })
}

/** The conversation for the input, question and sorry screens (and "ask for something different"). */
export function Conversation({ s }: { s: PhoneSession }) {
  const reduceMotion = usePrefersReducedMotion()
  const screen = s.current?.screen
  const data = s.current?.data ?? {}
  const last = s.talk[s.talk.length - 1]
  const seen = useRef(-1) // how many messages were already scrolled to

  // A new answer from the AI lands with its start at the top (the photo it saw, then what it
  // says); the customer's own message, and "thinking", keep the newest line in view at the end.
  useLayoutEffect(() => {
    const before = seen.current
    seen.current = s.talk.length
    if (s.talk.length === 0 && !s.busy) return
    const fresh = before < 0 ? [] : s.talk.slice(before)
    const firstBot = fresh.find((m) => m.who === 'bot')
    const run = () => {
      if (firstBot && !s.busy) {
        scrollAreaTo(document.querySelector<HTMLElement>(`[data-anchor="m-${firstBot.id}"]`), 'start', !reduceMotion)
      } else if (!firstBot) {
        scrollAreaTo(null, 'end', !reduceMotion && before >= 0)
      }
    }
    run()
    // once more after photos have decoded and grown the conversation
    const later = window.setTimeout(run, 400)
    return () => window.clearTimeout(later)
  }, [s.talk.length, s.busy, screen, reduceMotion])

  return (
    <VStack gap={4}>
      {s.talk.length === 0 && !s.busy && !s.composing && <Welcome s={s} />}

      {s.talk.length > 0 && (
        <ChatMessageList align="top" gap={3}>
          {s.talk.map((m) => (
            <Bubble
              key={m.id}
              m={m}
              onRetry={(id) => void s.retryMessage(id)}
              isBusy={!!s.busy}
              photo={m.kind === 'understood' ? photoBefore(s.talk, m.id) : undefined}
            />
          ))}
          {screen === 'sorry' && data.question && !s.busy && (
            <ChatMessage sender="assistant">
              <ChatMessageBubble>
                <Text as="p">{data.question}</Text>
              </ChatMessageBubble>
            </ChatMessage>
          )}
          {s.busy?.kind === 'request' && <Thinking since={s.busy.since} last={last} />}
        </ChatMessageList>
      )}
      {s.talk.length === 0 && s.busy?.kind === 'request' && (
        <ChatMessageList align="top">
          <Thinking since={s.busy.since} last={last} />
        </ChatMessageList>
      )}

      {s.composing && !s.busy && (
        <VStack gap={1} className="compose-prompt" data-anchor="compose">
          <Heading level={2}>What should we change?</Heading>
          <Text as="p" color="secondary">
            Tell us what's not right, like a lower budget, a different material, or something we missed. We'll make a
            new list.
          </Text>
        </VStack>
      )}

      {s.notice && (
        <Banner
          status={s.notice.tone}
          title={s.notice.title}
          description={s.notice.text}
          isDismissable
          onDismiss={s.dismissNotice}
          endContent={s.notice.retry ? <Button label="Try again" size="lg" onClick={s.notice.retry} /> : undefined}
        />
      )}
    </VStack>
  )
}
