import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Center } from '@astryxdesign/core/Center'
import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { Layout, LayoutContent, LayoutFooter, LayoutHeader } from '@astryxdesign/core/Layout'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { ArrowLeftIcon, ArrowPathIcon, ClockIcon, QrCodeIcon, WifiIcon } from '@heroicons/react/24/outline'
import type { ScreenName } from '../shared/types'
import { BrandMark } from '../shared/BrandMark'
import { Composer } from './Composer'
import { Conversation, QuickReplies } from './Conversation'
import { GuideFooter, GuideScreen } from './Guide'
import { ItemsFooter, ItemsList } from './Items'
import { MirrorContext, useMirrorPublisher, type ComposerView } from './mirror'
import { usePhoneSession, type PhoneSession } from './usePhoneSession'
import { AnythingElse, AnythingElseFooter, Finished } from './Wrapup'

const JOURNEY = ['Describe', 'Choose', 'Find', 'Wrap up'] as const
/** Where the visit is: 0-3 = that step now; 4 = all four done (the visit is over). */
const stepOf = (screen: ScreenName | undefined, composing: boolean): number => {
  if (!screen || composing) return 0
  if (screen === 'items') return 1
  if (screen === 'guiding' || screen === 'arrived') return 2
  if (screen === 'anything_else') return 3
  if (screen === 'finished' || screen === 'timed_out') return 4
  return 0
}

/** A thin four-part bar along the header's bottom edge (it is the header's divider). */
function Journey({ step }: { step: number }) {
  return (
    <ol className="journey" aria-hidden>
      {JOURNEY.map((label, i) => (
        <li key={label} className={i < step ? 'is-done' : i === step ? 'is-now' : undefined} />
      ))}
    </ol>
  )
}

function Header({ s }: { s: PhoneSession }) {
  const showJourney = s.load === 'ready'
  const step = stepOf(s.current?.screen, s.composing)
  const where =
    step >= 4 ? 'Visit complete' : `Step ${step + 1} of 4 · ${JOURNEY[Math.min(step, 3)]}`
  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="center" className="phone-head">
        <BrandMark size="sm" />
        <VStack gap={0}>
          <Text type="label" weight="bold" className="brand-word">
            Aisle Guide
          </Text>
          <Text type="supporting" aria-live="polite">
            {showJourney ? where : 'Your in-store repair helper'}
          </Text>
        </VStack>
      </HStack>
      {showJourney && <Journey step={step} />}
    </VStack>
  )
}

function LoadingScreen() {
  return (
    <VStack gap={4} aria-busy="true" aria-label="Loading your visit">
      <Skeleton height="1rem" width="40%" radius="rounded" />
      <Skeleton height="2rem" width="85%" radius="rounded" index={1} />
      <Skeleton height="1rem" width="70%" radius="rounded" index={2} />
      <Skeleton height="7rem" index={3} />
      <Skeleton height="3rem" width="75%" index={4} />
    </VStack>
  )
}

const Centered = ({ children }: { children: ReactNode }) => (
  <Center minHeight="60dvh" axis="vertical">
    {children}
  </Center>
)

function Body({ s }: { s: PhoneSession }) {
  if (s.load === 'no_session')
    return (
      <Centered>
        <EmptyState
          icon={<Icon icon={QrCodeIcon} size="lg" />}
          title="Scan the QR code on the kiosk"
          description="Press “I'm here, I need help” on the store kiosk, then scan the code with your phone camera to start."
        />
      </Centered>
    )
  if (s.load === 'unknown_session')
    return (
      <Centered>
        <EmptyState
          icon={<Icon icon={ClockIcon} size="lg" />}
          title="This visit link is no longer active"
          description="Each visit has its own link. Press the help button on the kiosk to start a new one."
        />
      </Centered>
    )
  if (s.load === 'offline')
    return (
      <Centered>
        <EmptyState
          icon={<Icon icon={WifiIcon} size="lg" />}
          title="We can't reach the store's service"
          description="Check that your phone is on the store Wi-Fi, then try again."
          actions={
            <Button
              label="Try again"
              variant="primary"
              size="lg"
              icon={<Icon icon={ArrowPathIcon} />}
              onClick={s.retryLoad}
            />
          }
        />
      </Centered>
    )
  if (s.load === 'loading' || !s.current) return <LoadingScreen />
  if (s.composing) return <Conversation s={s} />
  switch (s.current.screen) {
    case 'items':
      return <ItemsList s={s} />
    case 'guiding':
    case 'arrived':
      return <GuideScreen s={s} />
    case 'anything_else':
      return <AnythingElse s={s} />
    case 'finished':
    case 'timed_out':
      return <Finished s={s} />
    default:
      return <Conversation s={s} />
  }
}

function Footer({ s }: { s: PhoneSession }) {
  if (s.load !== 'ready' || !s.current) return null
  const screen = s.current.screen
  const conversation = s.composing || screen === 'input' || screen === 'question' || screen === 'sorry'
  if (conversation) {
    return (
      <VStack gap={2}>
        {s.composing && (
          <HStack>
            <Button
              label="Back to the list"
              variant="ghost"
              size="lg"
              icon={<Icon icon={ArrowLeftIcon} />}
              isDisabled={!!s.busy}
              onClick={() => s.setComposing(false)}
            />
          </HStack>
        )}
        {(screen === 'input' || screen === 'sorry') && !s.composing && s.canFinishFromInput && !s.busy && (
          <Button
            label="No, I'm done for today"
            variant="secondary"
            size="lg"
            width="100%"
            onClick={() => void s.finishFromInput()}
          />
        )}
        <QuickReplies s={s} />
        <Composer
          isBusy={!!s.busy}
          onSend={s.sendRequest}
          budgetFocus={s.budgetFocus}
          placeholder={
            s.composing
              ? 'e.g. Something cheaper, or composite'
              : screen === 'question'
                ? 'Or type your answer…'
                : 'Describe the problem…'
          }
          focusKey={s.composing ? 'composing' : undefined}
        />
      </VStack>
    )
  }
  if (screen === 'items') return <ItemsFooter s={s} />
  if (screen === 'guiding' || screen === 'arrived') return <GuideFooter s={s} />
  if (screen === 'anything_else') return <AnythingElseFooter s={s} />
  return null
}

/** A new screen starts at the top (the conversation keeps its own scroll at the newest message). */
function useScrollTopOnScreenChange(key: string) {
  useEffect(() => {
    let el = document.querySelector<HTMLElement>('.phone-main')?.parentElement ?? null
    while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement
    el?.scrollTo({ top: 0 })
  }, [key])
}

export function PhoneApp({ s }: { s: PhoneSession }) {
  const screen = s.current?.screen
  useScrollTopOnScreenChange(
    `${screen}|${s.composing}|${screen === 'guiding' || screen === 'arrived' ? s.current?.data.item?.sku : ''}`,
  )
  const footer = <Footer s={s} />
  const hasFooter = s.load === 'ready' && !!s.current && !['finished', 'timed_out'].includes(s.current.screen)
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider={s.load !== 'ready'} padding={3} paddingBlockEnd={s.load === 'ready' ? 0 : 3} label="Aisle Guide">
          <Header s={s} />
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={4} label="Your visit">
          <main className="phone-main">
            <Body s={s} />
          </main>
        </LayoutContent>
      }
      footer={
        hasFooter ? (
          <LayoutFooter hasDivider padding={3} label="Actions">
            {footer}
          </LayoutFooter>
        ) : undefined
      }
    />
  )
}

export function PhoneRoot() {
  const s = usePhoneSession()
  // A real phone publishes what it shows for the stage's live mirror (mirror.ts); best-effort.
  const [composer, setComposer] = useState<ComposerView | null>(null)
  useMirrorPublisher(s, composer)
  const mirror = useMemo(() => ({ view: null, report: setComposer, shown: composer }), [composer])
  return (
    <MirrorContext.Provider value={mirror}>
      <PhoneApp s={s} />
    </MirrorContext.Provider>
  )
}
