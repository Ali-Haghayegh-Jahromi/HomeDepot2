import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { Link } from '@astryxdesign/core/Link'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import {
  ArrowRightIcon,
  ChatBubbleLeftEllipsisIcon,
  CheckIcon,
  MapPinIcon,
  PlusIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { money } from '../shared/api'
import type { Item } from '../shared/types'
import type { PhoneSession } from './usePhoneSession'

const ordinal = (n: number) => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th')

const TIER: Record<string, { label: string; variant: 'neutral' | 'blue' | 'orange' }> = {
  good: { label: 'Good', variant: 'neutral' },
  better: { label: 'Better', variant: 'blue' },
  best: { label: 'Best', variant: 'orange' },
}

function ItemCard({
  item,
  order,
  onToggle,
  isDisabled,
}: {
  item: Item
  order: number
  onToggle: () => void
  isDisabled: boolean
}) {
  const picked = order > 0
  const tier = TIER[String(item.quality_tier ?? '').toLowerCase()]
  return (
    <article className={picked ? 'item-card is-picked' : 'item-card'} aria-label={item.item_name}>
      <Card padding={4}>
        <VStack gap={3}>
          <HStack gap={3} vAlign="start">
            <span className="order-badge" aria-hidden>
              {picked ? order : ''}
            </span>
            <StackItem size="fill">
              <VStack gap={1}>
                <Heading level={3}>{item.item_name}</Heading>
                <HStack gap={2} vAlign="center" wrap="wrap">
                  {item.brand && <Text type="supporting">{item.brand}</Text>}
                  {tier && <Badge label={tier.label} variant={tier.variant} />}
                </HStack>
              </VStack>
            </StackItem>
            <Text type="large" weight="bold" hasTabularNumbers>
              {money(item.price)}
            </Text>
          </HStack>

          {item.reason && (
            <HStack gap={2} vAlign="start" className="item-reason">
              <Icon icon={SparklesIcon} size="sm" color="accent" />
              <Text as="p">{item.reason}</Text>
            </HStack>
          )}

          <VStack gap={1}>
            <HStack gap={1} vAlign="center">
              <Icon icon={MapPinIcon} size="sm" color="secondary" />
              <Text type="label">
                Aisle {item.aisle} · Bay {item.shelf}
              </Text>
              {item.department && <Text type="supporting">· {item.department}</Text>}
            </HStack>
            {item.specs && <Text type="supporting">{item.specs}</Text>}
          </VStack>

          <HStack gap={2} vAlign="center">
            <StackItem size="fill">
              {item.item_url && (
                <Link href={item.item_url} target="_blank" rel="noopener noreferrer" isExternalLink type="supporting">
                  Product details
                </Link>
              )}
            </StackItem>
            <Button
              label={picked ? `${ordinal(order)} stop` : 'Add to route'}
              variant={picked ? 'primary' : 'secondary'}
              size="lg"
              icon={<Icon icon={picked ? CheckIcon : PlusIcon} />}
              tooltip={picked ? 'Tap to remove from your route' : undefined}
              isDisabled={isDisabled}
              onClick={onToggle}
            />
          </HStack>
        </VStack>
      </Card>
    </article>
  )
}

export function ItemsList({ s }: { s: PhoneSession }) {
  const items = s.current?.data.items ?? []
  if (!items.length) {
    return (
      <EmptyState
        icon={<Icon icon={ChatBubbleLeftEllipsisIcon} size="lg" />}
        title="We couldn't find a good match"
        description="Nothing in this store fits that request yet. Tell us a bit more and we'll look again."
        actions={
          <Button label="Describe it differently" variant="primary" size="lg" onClick={() => s.setComposing(true)} />
        }
      />
    )
  }
  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <Text type="label" color="accent">
          {items.length} items for your repair
        </Text>
        <Heading level={1}>Here's what you need</Heading>
        {s.current?.message && (
          <Text as="p" color="secondary">
            {s.current.message}
          </Text>
        )}
      </VStack>
      <Text type="supporting">
        {s.current?.message
          ? 'The robot walks you to them in the order you add them.'
          : 'Add items in the order you want to pick them up. The robot walks you there in that order.'}
      </Text>
      <VStack gap={3} as="ul" className="plain-list" aria-label="Suggested items">
        {items.map((i) => (
          <li key={i.sku}>
            <ItemCard
              item={i}
              order={s.picked.indexOf(i.sku) + 1}
              onToggle={() => s.togglePick(i.sku)}
              isDisabled={!!s.busy}
            />
          </li>
        ))}
      </VStack>
      {s.notice && (
        <Banner
          status={s.notice.tone}
          title={s.notice.title}
          description={s.notice.text}
          isDismissable
          onDismiss={s.dismissNotice}
        />
      )}
      <VStack gap={2} hAlign="start" as="section" aria-label="Other options">
        <Text type="supporting">Not quite right?</Text>
        <HStack gap={2} wrap="wrap">
          <Button
            label="Ask for something different"
            variant="secondary"
            size="lg"
            icon={<Icon icon={ChatBubbleLeftEllipsisIcon} />}
            isDisabled={!!s.busy}
            onClick={() => s.setComposing(true)}
          />
          {s.picked.length === 0 && (
            <Button
              label="I don't need any of these"
              variant="ghost"
              size="lg"
              isDisabled={!!s.busy}
              isLoading={s.busy?.kind === 'confirm'}
              onClick={() => void s.confirm()}
            />
          )}
        </HStack>
      </VStack>
    </VStack>
  )
}

export function ItemsFooter({ s }: { s: PhoneSession }) {
  const total = s.pickedItems.reduce((sum, i) => sum + i.price, 0)
  const n = s.pickedItems.length
  const over = s.budget != null && total > s.budget
  return (
    <VStack gap={3}>
      <HStack gap={3} vAlign="center">
        <StackItem size="fill">
          <VStack gap={0}>
            <Text type="label">{n ? `${n} item${n > 1 ? 's' : ''} on your route` : 'No items added yet'}</Text>
            <Text type="supporting" aria-live="polite">
              {s.busy?.kind === 'confirm'
                ? 'Writing your repair steps and calling the robot…'
                : s.budget != null
                  ? over
                    ? `${money(total - s.budget)} over your ${money(s.budget)} budget`
                    : `${money(s.budget - total)} left of your ${money(s.budget)} budget`
                  : 'Prices before tax'}
            </Text>
          </VStack>
        </StackItem>
        <Text type="large" weight="bold" hasTabularNumbers>
          {money(total)}
        </Text>
      </HStack>
      {s.budget != null && (
        <ProgressBar
          label="Spent of your budget"
          isLabelHidden
          value={Math.min(total, s.budget)}
          max={s.budget}
          variant={over ? 'warning' : 'success'}
        />
      )}
      <Button
        label={n ? `Guide me to ${n} item${n > 1 ? 's' : ''}` : 'Add an item to start'}
        variant="primary"
        size="lg"
        width="100%"
        icon={<Icon icon={ArrowRightIcon} />}
        isDisabled={!n || (!!s.busy && s.busy.kind !== 'confirm')}
        isLoading={s.busy?.kind === 'confirm'}
        onClick={() => void s.confirm()}
      />
    </VStack>
  )
}
