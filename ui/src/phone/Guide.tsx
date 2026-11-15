import { Button } from '@astryxdesign/core/Button'
import { useEffect, useRef } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { Banner } from '@astryxdesign/core/Banner'
import { CheckIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { money } from '../shared/api'
import { StoreMap } from '../shared/StoreMap'
import { useStoreLayout, useTourStatus } from '../shared/useRobot'
import { DepartmentTile } from './departments'
import type { PhoneSession } from './usePhoneSession'

/** A shelf-edge price tag with its light: lit, it glows green (two pulses, still if motion is reduced). */
function ShelfTag({ lit }: { lit: boolean }) {
  return (
    <span className={lit ? 'shelf-tag is-lit' : 'shelf-tag'} aria-hidden>
      <svg viewBox="0 0 48 32">
        <rect className="shelf-tag-edge" x="0" y="20" width="48" height="6" rx="1" />
        <rect className="shelf-tag-card" x="9" y="6" width="30" height="20" rx="3" />
        <rect className="shelf-tag-line" x="14" y="17" width="14" height="2.5" rx="1" />
        <rect className="shelf-tag-line" x="14" y="21" width="9" height="2.5" rx="1" />
        <circle className="shelf-tag-led" cx="32" cy="12" r="3.5" />
      </svg>
    </span>
  )
}

/** One short buzz on Android when the shelf light turns on (iOS has no vibration API); never on the stage's mirror. */
function useBuzzWhenLit(lit: boolean) {
  const was = useRef(lit)
  useEffect(() => {
    if (lit && !was.current && !document.documentElement.classList.contains('page-mirror')) {
      try {
        navigator.vibrate?.(150)
      } catch {
        // not supported
      }
    }
    was.current = lit
  }, [lit])
}

export function GuideScreen({ s }: { s: PhoneSession }) {
  const d = s.current?.data ?? {}
  const item = d.item
  const here = s.current?.screen === 'arrived'
  const index = d.index ?? 1
  const total = d.total ?? 1
  const { layout } = useStoreLayout()
  const { status } = useTourStatus(true, 600)
  const robotOnThisItem = status?.current_item?.sku === item?.sku ? status : null
  const distance = robotOnThisItem?.state === 'navigating' ? robotOnThisItem.distance_m : null
  const upNext = s.pickedItems.slice(index)
  // n8n learns about the light a moment after the robot service turns it on; show whichever is first.
  const lightOn =
    !!d.light_on ||
    (!!robotOnThisItem && !!item && robotOnThisItem.lights_on.includes(robotOnThisItem.current_item?.tag_code ?? ''))
  useBuzzWhenLit(lightOn && !here)

  if (!item) return null
  const heroClass = here ? 'guide-hero is-here' : lightOn ? 'guide-hero is-lit' : 'guide-hero'
  return (
    <VStack gap={4}>
      <VStack gap={2} data-anchor="guide-progress">
        <Text type="label">
          Item {index} of {total}
        </Text>
        <ProgressBar
          label={`Item ${index} of ${total}`}
          isLabelHidden
          value={index - (here ? 0 : 0.5)}
          max={total}
          variant={here || lightOn ? 'success' : 'accent'}
        />
      </VStack>

      <section className={heroClass} aria-live="polite" data-anchor="guide-hero">
        <VStack gap={3}>
          <VStack gap={1}>
            {here ? (
              <HStack gap={2} vAlign="center">
                <span className="arrived-check" aria-hidden>
                  <Icon icon={CheckIcon} color="inherit" />
                </span>
                <Text type="label" color="inherit">
                  You've arrived
                </Text>
              </HStack>
            ) : (
              <Text type="label" color="inherit">
                {lightOn ? 'The shelf light is on' : 'Follow the robot'}
              </Text>
            )}
            <Heading level={1} type="display-2" color="inherit">
              Aisle {item.aisle} · Bay {item.shelf}
            </Heading>
            {item.department && (
              <Text color="inherit" className="hero-sub">
                {item.department}
              </Text>
            )}
          </VStack>
          <HStack gap={3} vAlign="center" className="hero-light" role="status">
            <ShelfTag lit={lightOn || here} />
            <StackItem size="fill">
              <VStack gap={0}>
                <Text weight="semibold" color="inherit">
                  {lightOn || here ? `Look for the green light · Bay ${item.shelf}` : 'The shelf light turns on within 5 m'}
                </Text>
                {!here && distance != null && (
                  <Text color="inherit" hasTabularNumbers className="hero-distance">
                    {distance < 1 ? 'Almost there' : `${Math.round(distance)} m to go`}
                  </Text>
                )}
              </VStack>
            </StackItem>
          </HStack>
        </VStack>
      </section>

      <Card padding={4} data-anchor="guide-item">
        <HStack gap={3} vAlign="center">
          <DepartmentTile item={item} />
          <StackItem size="fill">
            <VStack gap={1}>
              <Text type="supporting">You're picking up</Text>
              <Text weight="semibold" maxLines={2}>
                {item.item_name}
              </Text>
              <Text type="supporting">{[item.brand, `SKU ${item.sku}`].filter(Boolean).join(' · ')}</Text>
            </VStack>
          </StackItem>
          <Text type="large" weight="bold" hasTabularNumbers>
            {money(item.price)}
          </Text>
        </HStack>
      </Card>

      {upNext.length > 0 && (
        <VStack gap={2} as="section" aria-label="Up next" data-anchor="guide-next">
          <Text type="label">Up next</Text>
          <ol className="up-next">
            {upNext.map((i, n) => (
              <li key={i.sku}>
                <Text type="supporting" hasTabularNumbers>
                  {index + n + 1}
                </Text>
                <Text maxLines={1}>{i.item_name}</Text>
                <Text type="supporting">
                  Aisle {i.aisle} · Bay {i.shelf}
                </Text>
              </li>
            ))}
          </ol>
        </VStack>
      )}

      <Card padding={2} data-anchor="guide-map">
        {layout ? (
          <StoreMap
            layout={layout}
            status={status}
            compact
            focusAisle={item.aisle}
            label={`Store map: the robot is heading to aisle ${item.aisle}, bay ${item.shelf}`}
          />
        ) : (
          <Skeleton height="12rem" />
        )}
      </Card>

      {s.notice && (
        <Banner
          status={s.notice.tone}
          title={s.notice.title}
          description={s.notice.text}
          isDismissable
          onDismiss={s.dismissNotice}
        />
      )}
    </VStack>
  )
}

export function GuideFooter({ s }: { s: PhoneSession }) {
  if (s.current?.screen !== 'arrived') {
    return (
      <HStack gap={2} vAlign="center" hAlign="center" className="guide-hint">
        <Icon icon={CheckCircleIcon} size="sm" color="secondary" />
        <Text type="supporting">"I am done" appears when you reach the shelf.</Text>
      </HStack>
    )
  }
  const last = (s.current.data.index ?? 1) >= (s.current.data.total ?? 1)
  return (
    <VStack gap={2}>
      <Text type="supporting" justify="center">
        {last ? 'Got it? That was the last item on your list.' : 'Got it? The robot will take you to the next item.'}
      </Text>
      <Button
        label="I am done"
        variant="primary"
        size="lg"
        width="100%"
        icon={<Icon icon={CheckIcon} />}
        isLoading={s.busy?.kind === 'next'}
        isDisabled={!!s.busy && s.busy.kind !== 'next'}
        onClick={() => void s.done()}
      />
    </VStack>
  )
}
