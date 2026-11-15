import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { StackItem } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { Banner } from '@astryxdesign/core/Banner'
import { CheckIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { money } from '../shared/api'
import { StoreMap } from '../shared/StoreMap'
import { useStoreLayout, useTourStatus } from '../shared/useRobot'
import type { PhoneSession } from './usePhoneSession'

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

  if (!item) return null
  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            <Text type="label">
              Item {index} of {total}
            </Text>
          </StackItem>
          {distance != null && (
            <Text type="supporting" hasTabularNumbers>
              {distance < 1 ? 'Almost there' : `${Math.round(distance)} m to go`}
            </Text>
          )}
        </HStack>
        <ProgressBar
          label={`Item ${index} of ${total}`}
          isLabelHidden
          value={index - (here ? 0 : 0.5)}
          max={total}
          variant={here ? 'success' : 'accent'}
        />
      </VStack>

      <section className={here ? 'guide-hero is-here' : 'guide-hero'} aria-live="polite">
        <VStack gap={2}>
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
              Follow the robot
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
      </section>

      <HStack gap={3} vAlign="center" className={lightOn ? 'light-status is-on' : 'light-status'} role="status">
        <StatusDot
          variant={lightOn ? 'success' : 'neutral'}
          label={lightOn ? 'Shelf light on' : 'Shelf light off'}
          isPulsing={lightOn}
        />
        <VStack gap={0}>
          <Text type="label">{lightOn ? 'The shelf light is on' : 'The shelf light is off for now'}</Text>
          <Text type="supporting">
            {lightOn
              ? 'Look for the glowing green tag on the shelf.'
              : 'It turns on when you are within 5 m of the shelf.'}
          </Text>
        </VStack>
      </HStack>

      <Card padding={2}>
        {layout ? (
          <StoreMap
            layout={layout}
            status={status}
            compact
            label={`Store map: the robot is heading to aisle ${item.aisle}, bay ${item.shelf}`}
          />
        ) : (
          <Skeleton height="12rem" />
        )}
      </Card>

      <Card padding={4}>
        <HStack gap={3} vAlign="start">
          <StackItem size="fill">
            <VStack gap={1}>
              <Text type="supporting">You're picking up</Text>
              <Heading level={3}>{item.item_name}</Heading>
              <Text type="supporting">{[item.brand, `SKU ${item.sku}`].filter(Boolean).join(' · ')}</Text>
            </VStack>
          </StackItem>
          <Text type="large" weight="bold" hasTabularNumbers>
            {money(item.price)}
          </Text>
        </HStack>
      </Card>

      {upNext.length > 0 && (
        <VStack gap={2} as="section" aria-label="Up next">
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
