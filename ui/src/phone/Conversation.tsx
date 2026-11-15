import { useEffect, useRef } from 'react'
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
  ChatBubbleLeftEllipsisIcon,
  CurrencyDollarIcon,
  ExclamationCircleIcon,
  MapPinIcon,
  MicrophoneIcon,
  ShoppingCartIcon,
} from '@heroicons/react/24/outline'
import { usePrefersReducedMotion, useElapsed } from '../shared/hooks'
import { clock } from './media'
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
  if (seconds < 3) return 'Checking your request…'
  if (seconds < 8)
    return hasVoice
      ? 'Listening to your voice note…'
      : hasPhoto
        ? 'Looking at your photo…'
        : 'Understanding the problem…'
  if (seconds < 16) return 'Finding the right items in this store…'
  return 'Comparing prices and aisles. Almost there…'
}

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

function Bubble({ m, onRetry, isBusy }: { m: Message; onRetry: (id: number) => void; isBusy: boolean }) {
  if (m.who === 'bot') {
    return (
      <ChatMessage sender="assistant">
        <ChatMessageBubble>
          {m.tone === 'sorry' ? (
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
              variant="ghost"
              size="sm"
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
          {m.photo && <img className="bubble-photo" src={m.photo} alt="The photo you sent" />}
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

/** First screen of a request: what this is, how it works, and a few real examples to tap. */
function Welcome({ s }: { s: PhoneSession }) {
  const again = s.completed > 0
  return (
    <VStack gap={5} className="welcome">
      <VStack gap={2}>
        <Text type="label" color="accent">
          {again ? 'Next request' : 'Welcome to the store'}
        </Text>
        <Heading level={1}>{again ? 'What else can we help with?' : 'What are you fixing today?'}</Heading>
        <Text as="p" color="secondary">
          {s.current?.message || 'Tell us what you need help with. Type it, add a photo, or record your voice.'}
        </Text>
      </VStack>
      {!again && (
        <ol className="how-it-works" aria-label="How it works">
          <li>
            <Icon icon={ChatBubbleLeftEllipsisIcon} color="accent" />
            <Text>Describe the problem in your own words, with a photo if it helps.</Text>
          </li>
          <li>
            <Icon icon={ShoppingCartIcon} color="accent" />
            <Text>We pick the right items from this store, within your budget.</Text>
          </li>
          <li>
            <Icon icon={MapPinIcon} color="accent" />
            <Text>Our robot walks you to each shelf, and the shelf tag lights up.</Text>
          </li>
        </ol>
      )}
      <VStack gap={2}>
        <Text type="supporting">Try one of these</Text>
        <VStack gap={2} hAlign="start">
          {SUGGESTIONS.map((t) => (
            <Button
              key={t}
              label={t}
              variant="secondary"
              size="lg"
              isDisabled={!!s.busy}
              onClick={() => void s.sendRequest({ text: t, photo: null, voice: null, budget: null })}
            />
          ))}
        </VStack>
      </VStack>
    </VStack>
  )
}

const BUDGET_PICKS = [25, 50, 100, 200]

/** The conversation for the input, question and sorry screens (and "ask for something different"). */
export function Conversation({ s }: { s: PhoneSession }) {
  const reduceMotion = usePrefersReducedMotion()
  const end = useRef<HTMLSpanElement>(null)
  const screen = s.current?.screen
  const data = s.current?.data ?? {}
  const pendingQuestion = (screen === 'question' || screen === 'sorry') && !s.busy && !s.composing
  const options = pendingQuestion ? (data.options ?? []) : []
  // Our own budget buttons only when the AI's suggested answers do not already offer amounts.
  const showBudgetPicks =
    pendingQuestion && asksAboutBudget(data.question) && s.budget == null && !options.some((o) => /\$|\d/.test(o))
  const last = s.talk[s.talk.length - 1]

  // Keep the newest message in view. Scrolls only the page's own scroll area (scrollIntoView
  // would also scroll the demo stage around the phone frame).
  useEffect(() => {
    if (s.talk.length === 0 && !s.busy) return
    let el = end.current?.parentElement ?? null
    while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement
    el?.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [s.talk.length, s.busy, screen, options.length, reduceMotion])

  const answer = (text: string) => void s.sendRequest({ text, photo: null, voice: null, budget: null })
  const sendBudget = (n: number) =>
    void s.sendRequest({ text: `My budget is about $${n}`, photo: null, voice: null, budget: n })

  return (
    <VStack gap={4}>
      {s.talk.length === 0 && !s.busy && !s.composing && <Welcome s={s} />}

      {s.talk.length > 0 && (
        <ChatMessageList align="top" gap={3}>
          {s.talk.map((m) => (
            <Bubble key={m.id} m={m} onRetry={(id) => void s.retryMessage(id)} isBusy={!!s.busy} />
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
        <VStack gap={1} className="compose-prompt">
          <Heading level={2}>What should we change?</Heading>
          <Text as="p" color="secondary">
            Tell us what's not right, like a lower budget, a different material, or something we missed. We'll make a
            new list.
          </Text>
        </VStack>
      )}

      {options.length > 0 && (
        <VStack gap={2} as="section" aria-label="Tap an answer">
          <Text type="supporting">Tap an answer, or type your own below</Text>
          <HStack gap={2} wrap="wrap">
            {options.map((o) => (
              <Button key={o} label={o} variant="secondary" size="lg" onClick={() => answer(o)} />
            ))}
          </HStack>
        </VStack>
      )}

      {showBudgetPicks && (
        <VStack gap={2} as="section" aria-label="Pick a budget" className="budget-picks">
          <HStack gap={2} vAlign="center">
            <Icon icon={CurrencyDollarIcon} color="success" />
            <Text type="label">Pick a budget for the whole job</Text>
          </HStack>
          <HStack gap={2} wrap="wrap">
            {BUDGET_PICKS.map((n) => (
              <Button key={n} label={`$${n}`} variant="secondary" size="lg" onClick={() => sendBudget(n)} />
            ))}
            <Button label="Other amount" variant="ghost" size="lg" onClick={s.openBudgetField} />
          </HStack>
        </VStack>
      )}

      {s.notice && (
        <Banner
          status={s.notice.tone}
          title={s.notice.title}
          description={s.notice.text}
          isDismissable
          onDismiss={s.dismissNotice}
          endContent={s.notice.retry ? <Button label="Try again" size="sm" onClick={s.notice.retry} /> : undefined}
        />
      )}
      <span ref={end} className="scroll-end" aria-hidden />
    </VStack>
  )
}
