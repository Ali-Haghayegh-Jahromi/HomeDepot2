// The studio view (/demo/?view=studio): one calm 1920 x 1080 picture for recording the demo.
// Kiosk, the customer's phone (mirrored live when a real phone scanned the QR code), RViz's live
// top view of the store (the noVNC page of the robot container, port HD_RVIZ_PORT on the same
// host) or the web store map, the robot's status and the live event log, under the story strip.
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { ArrowPathIcon, CubeTransparentIcon, MapIcon } from '@heroicons/react/24/outline'
import { BrandMark } from '../shared/BrandMark'
import { useRuntime, type Runtime } from '../shared/runtime'
import { StoreMap } from '../shared/StoreMap'
import { useStoreLayout } from '../shared/useRobot'
import {
  EventLog,
  headline,
  isDocked,
  Kiosk,
  MapLegend,
  NewVisit,
  PanelTitle,
  PhoneFrame,
  StoreHead,
  StoryStrip,
} from './StageApp'
import { useStage } from './useStage'

type Reachable = 'checking' | 'yes' | 'no' | 'off'

/** RViz in the browser: the noVNC page of the robot container, on the host this page came from. */
function rvizUrl(rt: Runtime): string {
  const asked = new URLSearchParams(window.location.search).get('rviz')
  if (asked) return /^\d+$/.test(asked) ? `http://${window.location.hostname}:${asked}/?view_only=1` : asked
  return `http://${window.location.hostname}:${rt.rviz_port}/?view_only=1`
}

/** Whether the noVNC page answers (a no-cors request: it resolves if the port is open at all). */
function useReachable(url: string | null, enabled: boolean): [Reachable, () => void] {
  const [state, setState] = useState<Reachable>('checking')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!enabled) {
      setState('off')
      return
    }
    if (!url) return
    let alive = true
    let timer = 0
    const check = async () => {
      try {
        await fetch(url, { mode: 'no-cors', cache: 'no-store' })
        if (alive) setState('yes')
      } catch {
        if (!alive) return
        setState('no')
        timer = window.setTimeout(() => void check(), 8000) // RViz may still be starting
      }
    }
    setState('checking')
    void check()
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [url, enabled, attempt])
  return [state, useCallback(() => setAttempt((a) => a + 1), [])]
}

function RvizView({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="rviz-view">
      {!loaded && (
        <VStack gap={3} hAlign="center" vAlign="center" className="rviz-loading">
          <Spinner size="lg" shade="onMedia" label="Connecting to RViz" />
          <Text className="kiosk-muted">Connecting to RViz…</Text>
        </VStack>
      )}
      <iframe
        title="RViz: the robot's live top view of the store"
        src={url}
        className="rviz-iframe"
        tabIndex={-1}
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}

export function StudioApp() {
  const st = useStage()
  const { layout, failed, retry } = useStoreLayout()
  const rt = useRuntime()
  const url = rt ? rvizUrl(rt) : null
  const [reach, recheck] = useReachable(url, rt?.rviz ?? true)
  const [choice, setChoice] = useState<'rviz' | 'map'>('rviz')
  const docked = isDocked(st.robot, layout)
  const showRviz = choice === 'rviz' && reach === 'yes' && !!url

  useEffect(() => {
    document.documentElement.classList.add('page-studio')
    return () => document.documentElement.classList.remove('page-studio')
  }, [])

  const map = layout ? (
    <figure className="studio-map">
      <StoreMap layout={layout} status={st.robot} label={`Store map. ${headline(st.robot, docked)}.`} />
      <MapLegend />
    </figure>
  ) : failed ? (
    <EmptyState
      isCompact
      icon={<Icon icon={MapIcon} size="lg" />}
      title="The store map didn't load"
      description="The robot service did not send the floor plan."
      actions={<Button label="Try again" onClick={retry} />}
    />
  ) : (
    <Skeleton height="100%" />
  )

  return (
    <div className="studio">
      <header className="studio-top">
        <HStack gap={3} vAlign="center" className="studio-brand">
          <BrandMark size="lg" />
          <VStack gap={0}>
            <Heading level={1}>Aisle Guide</Heading>
            <Text type="supporting" className="studio-tagline">
              Describe the repair. The AI finds the parts. A robot walks you to them.
            </Text>
          </VStack>
        </HStack>
        <StoryStrip flow={st.flow} />
        {st.kiosk.kind === 'visit' && <NewVisit st={st} isCompact />}
      </header>
      <main className="studio-main">
        <div className={st.connected ? 'studio-grid is-connected' : 'studio-grid'}>
          <Kiosk st={st} docked={docked} isStudio />
          <PhoneFrame session={st.session} onLiveChange={st.mirrorChanged} />
          <section className="panel studio-robot" aria-labelledby="robot-title">
            <PanelTitle
              n={3}
              id="robot-title"
              title="The robot, live"
              end={
                <SegmentedControl
                  label="Show the store as"
                  size="sm"
                  value={choice}
                  onChange={(v) => setChoice(v === 'map' ? 'map' : 'rviz')}
                >
                  <SegmentedControlItem
                    value="rviz"
                    label="RViz"
                    icon={<Icon icon={CubeTransparentIcon} size="sm" />}
                  />
                  <SegmentedControlItem value="map" label="Map" icon={<Icon icon={MapIcon} size="sm" />} />
                </SegmentedControl>
              }
            />
            <div className="studio-robot-body">
              <section className="studio-status" aria-label="The guide robot">
                <StoreHead st={st} docked={docked} />
              </section>
              <div className={showRviz ? 'studio-screen is-rviz' : 'studio-screen'}>
                {showRviz ? (
                  <RvizView url={url} />
                ) : choice === 'rviz' && reach !== 'yes' ? (
                  <div className="studio-fallback">
                    {map}
                    <HStack gap={2} vAlign="center" className="studio-note" role="status">
                      {reach === 'checking' ? (
                        <Text type="supporting">Looking for RViz…</Text>
                      ) : (
                        <>
                          <Text type="supporting">
                            {reach === 'off'
                              ? 'RViz is switched off (HD_RVIZ=no), so this is the live web map.'
                              : "RViz isn't reachable from this browser, so this is the live web map."}
                          </Text>
                          {reach === 'no' && (
                            <Button
                              label="Try again"
                              variant="ghost"
                              size="sm"
                              icon={<Icon icon={ArrowPathIcon} />}
                              onClick={recheck}
                            />
                          )}
                        </>
                      )}
                    </HStack>
                  </div>
                ) : (
                  map
                )}
              </div>
              <EventLog log={st.log} />
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
