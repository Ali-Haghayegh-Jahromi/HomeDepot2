import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import {
  ArrowRightIcon,
  ArrowsRightLeftIcon,
  ChatBubbleLeftEllipsisIcon,
  CheckIcon,
  ChevronDownIcon,
  EyeIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { money } from '../shared/api'
import type { Item } from '../shared/types'
import { photoBefore } from './Conversation'
import { DepartmentTile } from './departments'
import { choicesOf, roleOf, type Choice } from './groups'
import type { PhoneSession } from './usePhoneSession'

/** What the AI saw, folded to one line above the list ("Seen: …"); the photo beside it. */
function Seen({ s }: { s: PhoneSession }) {
  const seen = [...s.talk].reverse().find((m) => m.kind === 'understood')
  if (!seen) return null
  const photo = seen.media === 'photo' ? photoBefore(s.talk, seen.id) : undefined
  return (
    <details className="seen-line" data-anchor="seen">
      <summary>
        {photo ? (
          <img className="seen-thumb" src={photo} alt="" />
        ) : (
          <Icon icon={EyeIcon} size="sm" color="accent" />
        )}
        <Text type="supporting" maxLines={1}>
          <strong>{seen.media === 'voice' ? 'Heard: ' : 'Seen: '}</strong>
          {seen.text}
        </Text>
        <Icon icon={ChevronDownIcon} size="sm" color="secondary" />
      </summary>
      <Text as="p" type="supporting">
        {seen.text}
      </Text>
    </details>
  )
}

const ordinal = (n: number) => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th')

/** The catalogue's quality tier, said as what it means for the customer. */
const TIER: Record<string, { label: string; variant: 'blue' | 'green' | 'yellow' }> = {
  good: { label: 'Budget pick', variant: 'blue' },
  better: { label: 'Best value', variant: 'green' },
  best: { label: 'Pro grade', variant: 'yellow' },
}

/**
 * One item as a compact row (under 140 px on a phone): the whole row is the button that puts it on
 * the route or takes it off. An alternative says "Choose instead": picking it swaps out its main item.
 */
function ItemRow({
  item,
  order,
  onToggle,
  isDisabled,
  isAlternative,
}: {
  item: Item
  order: number
  onToggle: () => void
  isDisabled: boolean
  isAlternative?: boolean
}) {
  const picked = order > 0
  const tier = TIER[String(item.quality_tier ?? '').toLowerCase()]
  return (
    <button
      type="button"
      className={picked ? 'item-row is-picked' : 'item-row'}
      aria-pressed={picked}
      disabled={isDisabled}
      onClick={onToggle}
      data-anchor={'i-' + item.sku}
    >
      <DepartmentTile item={item} />
      <Text weight="semibold" as="span" className="item-row-name clamp-2">
        {item.item_name}
      </Text>
      <Text weight="bold" hasTabularNumbers as="span" className="item-row-price">
        {money(item.price)}
      </Text>
      {item.reason && (
        <Text type="supporting" as="span" className="item-row-reason clamp-1">
          {item.reason}
        </Text>
      )}
      <span className="item-row-meta">
        <Badge label={`Aisle ${item.aisle} · Bay ${item.shelf}`} variant="neutral" />
        {tier && <Badge label={tier.label} variant={tier.variant} />}
      </span>
      <span className={picked ? 'pick-mark is-on' : 'pick-mark'}>
        <Icon icon={picked ? CheckIcon : isAlternative ? ArrowsRightLeftIcon : PlusIcon} size="sm" color="inherit" />
        {picked ? `${ordinal(order)} stop` : isAlternative ? 'Choose instead' : 'Add'}
      </span>
    </button>
  )
}

function ChoiceRows({ c, s }: { c: Choice; s: PhoneSession }) {
  const order = (i: Item) => s.picked.indexOf(i.sku) + 1
  const open = s.expanded.includes(c.main.sku)
  const n = c.alternatives.length
  const altPicked = c.alternatives.some((a) => s.picked.includes(a.sku))
  return (
    <li className="choice">
      <ItemRow item={c.main} order={order(c.main)} onToggle={() => s.togglePick(c.main.sku)} isDisabled={!!s.busy} />
      {n > 0 && (
        <VStack gap={2} className="choice-alts">
          <button
            type="button"
            className="alt-toggle"
            aria-expanded={open}
            onClick={() => s.toggleExpanded(c.main.sku)}
            data-anchor={'a-' + c.main.sku}
          >
            <Icon icon={ArrowsRightLeftIcon} size="sm" color="secondary" />
            <Text type="supporting" as="span">
              {altPicked ? 'Swapped in instead' : n === 1 ? '1 alternative' : `${n} alternatives`}
              {!open && ` · ${c.alternatives.map((a) => money(a.price)).join(', ')}`}
            </Text>
            <span className={open ? 'alt-chevron is-open' : 'alt-chevron'} aria-hidden>
              <Icon icon={ChevronDownIcon} size="sm" color="secondary" />
            </span>
          </button>
          {open && (
            <ul className="plain-list choice-alt-list" aria-label={`Instead of ${c.main.item_name}`}>
              {c.alternatives.map((a) => (
                <li key={a.sku}>
                  <ItemRow
                    item={a}
                    order={order(a)}
                    onToggle={() => s.togglePick(a.sku)}
                    isDisabled={!!s.busy}
                    isAlternative
                  />
                </li>
              ))}
            </ul>
          )}
        </VStack>
      )}
    </li>
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
  const choices = choicesOf(items)
  const fix = choices.filter((c) => roleOf(c.main) !== 'tool')
  const tools = choices.filter((c) => roleOf(c.main) === 'tool')
  return (
    <VStack gap={4}>
      <Seen s={s} />
      <VStack gap={1} data-anchor="items-head">
        <Heading level={1}>Here's what you need</Heading>
        {s.current?.message && (
          <Text as="p" color="secondary">
            {s.current.message}
          </Text>
        )}
      </VStack>
      {fix.length > 0 && (
        <VStack gap={2} as="ul" className="plain-list" aria-label="For the repair">
          {fix.map((c) => (
            <ChoiceRows key={c.main.sku} c={c} s={s} />
          ))}
        </VStack>
      )}
      {tools.length > 0 && (
        <VStack gap={2} as="section" aria-labelledby="tools-title" data-anchor="tools">
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Text type="label" id="tools-title">
              Tools for the job
            </Text>
            <Text type="supporting">skip any you already have</Text>
          </HStack>
          <VStack gap={2} as="ul" className="plain-list">
            {tools.map((c) => (
              <ChoiceRows key={c.main.sku} c={c} s={s} />
            ))}
          </VStack>
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
      <HStack gap={2} wrap="wrap" as="section" aria-label="Other options" data-anchor="items-other">
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
            <Text type="label">{n ? `${n} item${n > 1 ? 's' : ''} on your route` : 'Tap an item to add it'}</Text>
            <Text type="supporting" aria-live="polite">
              {s.busy?.kind === 'confirm'
                ? 'Writing your repair steps and calling the robot…'
                : s.swapNote
                  ? s.swapNote
                  : !n
                    ? s.budget != null
                      ? `Budget ${money(s.budget)} · nothing added yet`
                      : 'Add what you need, in pick-up order'
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
        variant={n ? 'primary' : 'secondary'}
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
