import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Code } from '@astryxdesign/core/Code'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { Link } from '@astryxdesign/core/Link'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { Spinner } from '@astryxdesign/core/Spinner'
import { StackItem } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import {
  ArrowPathIcon,
  DevicePhoneMobileIcon,
  ExclamationTriangleIcon,
  MapIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckIcon } from '@heroicons/react/24/solid'
import { BrandMark } from '../shared/BrandMark'
import { useElementSize } from '../shared/hooks'
import { StoreMap } from '../shared/StoreMap'
import type { StoreLayout, TourStatus } from '../shared/types'
import { useStoreLayout } from '../shared/useRobot'
import { ACTS, FLOW_ORDER, type FlowKey } from './flow'
import { QrCode } from './QrCode'
import { useStage, type Actor, type LogEntry, type Reach, type Stage } from './useStage'

// ---------------------------------------------------------------------------------------------- top bar

function Health({ label, state, detail }: { label: string; state: Reach; detail: string }) {
  return (
    <HStack gap={2} vAlign="center" className="health-pill">
      <StatusDot
        variant={state === 'ok' ? 'success' : state === 'down' ? 'error' : 'neutral'}
        label={`${label}: ${detail}`}
        tooltip={detail}
      />
      <Text type="label">{label}</Text>
    </HStack>
  )
}

function TopBar({ st }: { st: Stage }) {
  const mock = st.health?.mode === 'mock'
  const nav: Reach = !st.health
    ? st.reach.robot === 'down'
      ? 'down'
      : 'unknown'
    : st.health.nav2_ready || mock
      ? 'ok'
      : 'down'
  return (
    <header className="stage-top">
      <HStack gap={3} vAlign="center">
        <BrandMark size="lg" />
        <VStack gap={0}>
          <Heading level={1}>Aisle Guide</Heading>
          <Text type="supporting">Describe the repair. The AI finds the parts. A robot walks you to them.</Text>
        </VStack>
        <StackItem size="fill" />
        <HStack gap={4} vAlign="center" as="ul" className="plain-list" aria-label="Services">
          <li>
            <Health
              label="n8n workflow"
              state={st.reach.n8n}
              detail={
                st.reach.n8n === 'ok'
                  ? 'answering'
                  : st.reach.n8n === 'down'
                    ? 'not reachable'
                    : 'checked when a visit starts'
              }
            />
          </li>
          <li>
            <Health
              label="Robot service"
              state={st.reach.robot}
              detail={st.reach.robot === 'ok' ? 'answering' : st.reach.robot === 'down' ? 'not reachable' : 'checking'}
            />
          </li>
          <li>
            <Health
              label={mock ? 'Mock robot' : 'Nav2'}
              state={nav}
              detail={
                mock
                  ? 'simulated drive, no Nav2'
                  : nav === 'ok'
                    ? 'navigation ready'
                    : nav === 'down'
                      ? 'not ready'
                      : 'checking'
              }
            />
          </li>
        </HStack>
        <Button
          label="Studio view"
          variant="ghost"
          size="md"
          icon={<Icon icon={VideoCameraIcon} />}
          tooltip="A calm 1920 x 1080 layout for recording, with RViz's live top view"
          onClick={() => {
            const q = new URLSearchParams(window.location.search)
            q.set('view', 'studio')
            window.location.search = q.toString()
          }}
        />
      </HStack>
    </header>
  )
}

// ---------------------------------------------------------------------------------------------- story strip

export function StoryStrip({ flow }: { flow: FlowKey | null }) {
  const at = flow ? FLOW_ORDER.indexOf(flow) : -1
  return (
    <nav className="story" aria-label="Where the visit is in the flow">
      <ol className="story-acts">
        {ACTS.map((act, ai) => {
          const keys = act.steps.map((s) => FLOW_ORDER.indexOf(s.key))
          const first = keys[0] ?? 0
          const last = keys[keys.length - 1] ?? 0
          const state = at > last ? 'is-done' : at >= first ? 'is-now' : ''
          return (
            <li key={act.key} className={`story-act ${state}`}>
              <HStack gap={2} vAlign="center">
                <span className="story-num" aria-hidden>
                  {state === 'is-done' ? <Icon icon={CheckIcon} size="sm" color="inherit" /> : ai + 1}
                </span>
                <VStack gap={0} className="story-text">
                  <Text type="label" weight="bold">
                    {act.title}
                  </Text>
                  <Text type="supporting" maxLines={1}>
                    {act.caption}
                  </Text>
                </VStack>
              </HStack>
              <ol className="story-steps">
                {act.steps.map((s) => {
                  const i = FLOW_ORDER.indexOf(s.key)
                  const cls = i < at ? 'is-done' : i === at ? 'is-now' : ''
                  return (
                    <li key={s.key} className={cls} aria-current={i === at ? 'step' : undefined}>
                      {s.label}
                    </li>
                  )
                })}
              </ol>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// ---------------------------------------------------------------------------------------------- kiosk

function RobotDock({ robot, docked }: { robot: TourStatus | null; docked: boolean }) {
  const away = robot && !docked
  const text = !robot
    ? 'Waiting for the robot service'
    : docked
      ? 'Docked beside the kiosk'
      : robot.state === 'returning_home'
        ? 'Driving back to the dock'
        : 'Out guiding a customer'
  return (
    <HStack gap={3} vAlign="center" className={away ? 'dock-card is-away' : 'dock-card'}>
      <span className="dock-robot" aria-hidden>
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8" className="dock-robot-body" />
          <path d="M 21.5 12 L 16 8.6 L 16 15.4 Z" className="dock-robot-nose" />
        </svg>
      </span>
      <VStack gap={0}>
        <Text type="label">Guide robot</Text>
        <Text type="supporting">{text}</Text>
      </VStack>
    </HStack>
  )
}

export function Kiosk({ st, docked }: { st: Stage; docked: boolean }) {
  const k = st.kiosk
  return (
    <section className="panel panel-kiosk" aria-labelledby="kiosk-title">
      <PanelTitle n={1} id="kiosk-title" title="Store kiosk" />
      <VStack gap={3} className="panel-body">
        <div className="kiosk" data-state={k.kind}>
          {k.kind === 'idle' && (
            <VStack gap={4} hAlign="center" className="kiosk-screen">
              <Text type="label" className="kiosk-eyebrow">
                Repair help
              </Text>
              <Heading level={2} justify="center" color="inherit" textWrap="balance">
                Not sure what you need for your repair?
              </Heading>
              <Text as="p" justify="center" className="kiosk-muted">
                Tell us the problem. We'll find the right items and a robot will walk you to each one.
              </Text>
              <button type="button" className="help-button" onClick={() => void st.pressHelp()}>
                I'm here,
                <br />I need help
              </button>
            </VStack>
          )}
          {k.kind === 'starting' && (
            <VStack gap={3} hAlign="center" className="kiosk-screen" aria-live="polite">
              <Spinner size="lg" shade="onMedia" label="Starting your visit" />
              <Text className="kiosk-muted">Starting your visit…</Text>
            </VStack>
          )}
          {k.kind === 'visit' && (
            <VStack gap={3} hAlign="center" className="kiosk-screen">
              <Heading level={2} justify="center" color="inherit">
                Scan to start
              </Heading>
              <span className="qr-frame">
                <QrCode value={k.link} label="QR code that opens the visit on your phone" />
              </span>
              <Text type="supporting" justify="center" className="kiosk-muted">
                Point your phone camera at the code. Your robot guide is waiting beside this kiosk.
              </Text>
              <Link
                href={k.link}
                target="_blank"
                rel="noopener noreferrer"
                type="supporting"
                className="kiosk-link"
                maxLines={1}
              >
                {k.link.replace(/^https?:\/\//, '')}
              </Link>
            </VStack>
          )}
          {k.kind === 'error' && (
            <VStack gap={3} hAlign="center" className="kiosk-screen" role="alert">
              <Icon icon={ExclamationTriangleIcon} size="lg" color="inherit" />
              <Heading level={2} justify="center" color="inherit">
                Can't start a visit
              </Heading>
              <Text as="p" justify="center" className="kiosk-muted">
                {k.message}
              </Text>
              <button type="button" className="help-button is-small" onClick={() => void st.pressHelp()}>
                Try again
              </button>
            </VStack>
          )}
        </div>
        <RobotDock robot={st.robot} docked={docked} />
        {k.kind === 'visit' && (
          <Button
            label="Start a new visit"
            variant="ghost"
            size="md"
            icon={<Icon icon={ArrowPathIcon} />}
            onClick={() => void st.pressHelp()}
          />
        )}
      </VStack>
    </section>
  )
}

export function PanelTitle({ n, title, id, end }: { n: number; title: string; id: string; end?: ReactNode }) {
  return (
    <HStack gap={2} vAlign="center" className="panel-title">
      <span className="panel-num" aria-hidden>
        {n}
      </span>
      <Heading level={2} id={id}>
        {title}
      </Heading>
      {end && (
        <>
          <StackItem size="fill" />
          {end}
        </>
      )}
    </HStack>
  )
}

// ---------------------------------------------------------------------------------------------- phone

const SCREEN_W = 390

/**
 * Whether the mirror page (phone.html?view=mirror) says a real phone is live for this visit.
 * It posts {type: 'aisle-mirror', session, live} to this page about once a second.
 */
function useMirrorLive(session: string | null, frame: React.RefObject<HTMLIFrameElement | null>) {
  const [live, setLive] = useState(false)
  useEffect(() => {
    setLive(false)
    if (!session) return
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return
      const d = e.data as { type?: string; session?: string; live?: boolean } | null
      if (d?.type === 'aisle-mirror' && d.session === session) setLive(!!d.live)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [session, frame])
  return live
}

export function PhoneFrame({
  session,
  onLiveChange,
}: {
  session: string | null
  onLiveChange?: (live: boolean) => void
}) {
  const [ref, size] = useElementSize<HTMLDivElement>()
  const scale = size.width ? size.width / SCREEN_W : 0
  const mirrorFrame = useRef<HTMLIFrameElement>(null)
  const live = useMirrorLive(session, mirrorFrame)
  const reported = useRef(false)
  useEffect(() => {
    if (live === reported.current) return
    reported.current = live
    onLiveChange?.(live)
  }, [live, onLiveChange])
  const frameStyle =
    scale > 0 ? { width: SCREEN_W, height: size.height / scale, transform: `scale(${scale})` } : undefined
  return (
    <section className="panel panel-phone" aria-labelledby="phone-title">
      <PanelTitle n={2} id="phone-title" title="Customer's phone" />
      <div className="phone-stage">
        <div className={live ? 'phone-device is-mirror' : 'phone-device'}>
          {live && (
            <HStack gap={2} vAlign="center" className="mirror-badge" role="status">
              <StatusDot variant="success" label="Live" isPulsing />
              <Text type="label" weight="semibold" color="inherit">
                Live from the customer's phone
              </Text>
            </HStack>
          )}
          <div className="phone-screen">
            <div className="phone-status" aria-hidden>
              <Text type="label" weight="semibold" color="inherit">
                9:41
              </Text>
              <span className="phone-island" />
              <span className="phone-indicators">
                <Text type="supporting" weight="semibold" color="inherit">
                  5G
                </Text>
                <span className="phone-battery" />
              </span>
            </div>
            <div className="phone-viewport" ref={ref}>
              {session ? (
                scale > 0 && (
                  <>
                    {/* The stage's own phone page: a presenter can run the whole visit from here. */}
                    <iframe
                      key={'own-' + session}
                      title="The customer's phone page"
                      src={`phone.html?s=${encodeURIComponent(session)}&role=stage`}
                      allow="microphone; camera"
                      className="phone-iframe"
                      data-hidden={live || undefined}
                      inert={live}
                      style={frameStyle}
                    />
                    {/* The live mirror of a real phone that scanned the QR code (shown while it is live). */}
                    <iframe
                      key={'mirror-' + session}
                      ref={mirrorFrame}
                      title="Live mirror of the customer's own phone"
                      src={`phone.html?s=${encodeURIComponent(session)}&view=mirror`}
                      className="phone-iframe is-mirror"
                      data-hidden={!live || undefined}
                      tabIndex={-1}
                      style={frameStyle}
                    />
                  </>
                )
              ) : (
                <VStack gap={3} hAlign="center" vAlign="center" className="phone-idle">
                  <Icon icon={DevicePhoneMobileIcon} size="lg" color="secondary" />
                  <Text type="label" justify="center">
                    Waiting for a customer
                  </Text>
                  <Text type="supporting" justify="center">
                    Press the help button on the kiosk. The customer scans the QR code and their phone opens this page.
                  </Text>
                </VStack>
              )}
            </div>
            <span className="phone-home" aria-hidden />
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------- store

const ACTOR: Record<Actor, { label: string; variant: 'orange' | 'blue' | 'green' | 'neutral' | 'purple' | 'teal' }> = {
  kiosk: { label: 'Kiosk', variant: 'neutral' },
  phone: { label: 'Phone', variant: 'blue' },
  ai: { label: 'AI', variant: 'purple' },
  n8n: { label: 'n8n', variant: 'orange' },
  robot: { label: 'Robot', variant: 'green' },
  light: { label: 'Light', variant: 'teal' },
}

export function EventLog({ log }: { log: LogEntry[] }) {
  return (
    <section className="event-log" aria-labelledby="log-title">
      <HStack gap={2} vAlign="center" className="event-log-head">
        <Heading level={3} id="log-title">
          Live events
        </Heading>
        <Text type="supporting">newest first · n8n decisions as they happen</Text>
      </HStack>
      {log.length === 0 ? (
        <Text type="supporting" as="p" className="event-empty">
          Every call between the phone, n8n and the robot shows up here as it happens.
        </Text>
      ) : (
        <ol className="event-list" aria-live="polite">
          {log.map((e) => (
            <li key={e.id} className={e.decisions ? 'is-decision' : undefined}>
              <Text type="supporting" hasTabularNumbers>
                {e.time}
              </Text>
              <Badge label={ACTOR[e.actor].label} variant={ACTOR[e.actor].variant} />
              <VStack gap={1}>
                {e.decisions && (
                  <span className="decision-path" aria-label="n8n decisions">
                    {e.decisions.map(([node, branch]) => (
                      <span key={node} className="decision">
                        <span className="decision-node">{node}</span>
                        <span className="decision-branch">{branch}</span>
                      </span>
                    ))}
                  </span>
                )}
                <Text>
                  {e.text}
                  {e.call && (
                    <span className="event-call">
                      <Code color="secondary">{e.call}</Code>
                    </span>
                  )}
                </Text>
              </VStack>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export function headline(robot: TourStatus | null, docked: boolean): string {
  if (!robot) return 'Connecting to the robot…'
  const item = robot.current_item
  switch (robot.state) {
    case 'navigating':
      return item ? `Guiding to aisle ${item.aisle}, bay ${item.shelf}` : 'Driving'
    case 'waiting_for_pick':
      return item ? `At the shelf: aisle ${item.aisle}, bay ${item.shelf}` : 'Waiting at the shelf'
    case 'returning_home':
      return 'Returning to the dock'
    case 'done':
      return 'Back on the dock'
    default:
      return item
        ? 'Waiting with the customer'
        : docked
          ? 'Robot waiting at its dock'
          : 'Robot standing by in the store'
  }
}

const STATE_LABEL: Record<string, string> = {
  idle: 'Idle',
  navigating: 'Navigating',
  waiting_for_pick: 'Waiting for pick',
  returning_home: 'Returning home',
  done: 'Docked',
}

export function StoreHead({ st, docked }: { st: Stage; docked: boolean }) {
  const r = st.robot
  const item = r?.current_item ?? null
  const light = !!item && !!r?.lights_on.includes(item.tag_code)
  const moving = r?.state === 'navigating' || r?.state === 'returning_home'
  return (
    <HStack gap={3} vAlign="center" wrap="wrap" className="store-head">
      <StackItem size="fill">
        <VStack gap={0}>
          <Text type="large" weight="bold" aria-live="polite">
            {headline(r, docked)}
          </Text>
          <Text type="supporting" maxLines={2}>
            {item ? `${item.name} · item ${r?.index} of ${r?.total}` : 'Nav2 and the shelf lights, as they report it'}
          </Text>
        </VStack>
      </StackItem>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Badge
          label={STATE_LABEL[r?.state ?? 'idle'] ?? r?.state ?? 'Idle'}
          variant={moving ? 'orange' : r?.state === 'waiting_for_pick' ? 'green' : 'neutral'}
        />
        {r?.state === 'navigating' && r.distance_m != null && (
          <Badge label={`${r.distance_m.toFixed(1)} m to go`} variant="neutral" />
        )}
        <Badge
          label={light ? `Light on · ${item?.tag_code}` : 'Shelf light off'}
          variant={light ? 'success' : 'neutral'}
        />
      </HStack>
    </HStack>
  )
}

export function MapLegend() {
  return (
    <figcaption className="map-legend">
      <span className="legend-robot">Robot</span>
      <span className="legend-trail">Trail</span>
      <span className="legend-ring">5 m: light turns on</span>
      <span className="legend-light">Lit shelf tag</span>
    </figcaption>
  )
}

function StorePanel({
  st,
  docked,
  layout,
  layoutFailed,
  retryLayout,
}: {
  st: Stage
  docked: boolean
  layout: StoreLayout | null
  layoutFailed: boolean
  retryLayout: () => void
}) {
  const r = st.robot
  return (
    <section className="panel panel-store" aria-labelledby="store-title">
      <PanelTitle n={3} id="store-title" title="The store, live" />
      <VStack gap={3} className="panel-body store-body">
        <StoreHead st={st} docked={docked} />
        <figure className="map-frame">
          {layout ? (
            <StoreMap layout={layout} status={r} label={`Store map. ${headline(r, docked)}.`} />
          ) : layoutFailed ? (
            <EmptyState
              isCompact
              icon={<Icon icon={MapIcon} size="lg" />}
              title="The store map didn't load"
              description="The robot service did not send the floor plan."
              actions={<Button label="Try again" onClick={retryLayout} />}
            />
          ) : (
            <Skeleton height="100%" />
          )}
          <MapLegend />
        </figure>
        <EventLog log={st.log} />
      </VStack>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------- page

/** Whether the robot is on its dock beside the kiosk. */
export function isDocked(robot: TourStatus | null, layout: StoreLayout | null): boolean {
  const pose = robot?.pose
  const dock = layout?.dock ?? { x: 9.45, y: 2.2 }
  return (
    !!robot &&
    (robot.state === 'done' ||
      (robot.state === 'idle' && !robot.current_item && !!pose && Math.hypot(pose.x - dock.x, pose.y - dock.y) < 0.7))
  )
}

export function StageApp() {
  const st = useStage()
  const { layout, failed, retry } = useStoreLayout()
  const docked = isDocked(st.robot, layout)
  return (
    <div className="stage">
      <TopBar st={st} />
      <StoryStrip flow={st.flow} />
      <main className="stage-main">
        <Kiosk st={st} docked={docked} />
        <PhoneFrame session={st.session} onLiveChange={st.mirrorChanged} />
        <StorePanel st={st} docked={docked} layout={layout} layoutFailed={failed} retryLayout={retry} />
      </main>
    </div>
  )
}
