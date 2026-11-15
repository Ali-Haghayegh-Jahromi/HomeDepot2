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
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'
import type { ReactNode } from 'react'
import { money } from '../shared/api'
import { AisleChip, Price } from '../shared/Signage'
import { itemSpecLine, itemTitle } from '../shared/names'
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

/** The key of the tools' fold in the session's expanded list (mirrored to the stage with it). */
const TOOLS_KEY = 'tools'

const ordinal = (n: number) => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th')

/** The catalogue's quality tier, said as what it means for the customer. */
const TIER: Record<string, { label: string; variant: 'blue' | 'green' | 'yellow' }> = {
  good: { label: 'Budget pick', variant: 'blue' },
  better: { label: 'Best value', variant: 'green' },
  best: { label: 'Pro grade', variant: 'yellow' },
}

const tierOf = (i: Item) => String(i.quality_tier ?? '').toLowerCase()

/**
 * The tier that goes without saying: the list's most common one. A badge only marks an item that
 * differs from it (e.g. "Pro grade" on the composite board), never "Budget pick" on every row.
 */
function usualTier(items: Item[]): string | null {
  const counts = new Map<string, number>()
  for (const i of items) counts.set(tierOf(i), (counts.get(tierOf(i)) ?? 0) + 1)
  if (counts.size < 2) return tierOf(items[0] ?? ({} as Item))
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0]
}

/** The repair parts (main items, not alternatives or tools), as the phone sums them. */
const partsOf = (items: Item[]) => choicesOf(items).filter((c) => roleOf(c.main) !== 'tool').map((c) => c.main)

/** One line under the heading: the parts' price against the budget, composed here from the list. */
function budgetLine(items: Item[], budget: number | null): ReactNode {
  const parts = partsOf(items)
  const sum = parts.reduce((t, i) => t + i.price, 0)
  if (!parts.length) return 'Tap items in the order you want to pick them up.'
  const label = parts.length === 1 ? 'Part' : 'Parts'
  if (budget == null)
    return (
      <>
        {label} <strong>{money(sum)}</strong> · tap items in the order you want to pick them up.
      </>
    )
  if (sum <= budget)
    return (
      <>
        {label} <strong>{money(sum)}</strong>, {sum <= budget * 0.6 ? 'well inside' : 'inside'} your{' '}
        {money(budget, true)} budget.
      </>
    )
  return (
    <>
      {label} <strong>{money(sum)}</strong>, {money(sum - budget)} over your {money(budget, true)} budget.
    </>
  )
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
  usual,
}: {
  item: Item
  order: number
  onToggle: () => void
  isDisabled: boolean
  isAlternative?: boolean
  /** The list's usual tier: no badge for it. */
  usual: string | null
}) {
  const picked = order > 0
  const tier = tierOf(item) !== usual ? TIER[tierOf(item)] : undefined
  const spec = itemSpecLine(item)
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
        {itemTitle(item)}
      </Text>
      {spec && (
        <Text type="supporting" as="span" className="item-row-spec clamp-1">
          {spec}
        </Text>
      )}
      <Price value={item.price} className="item-row-price" />
      {item.reason && (
        <Text type="supporting" as="span" className="item-row-reason clamp-2">
          {item.reason}
        </Text>
      )}
      {/* where it is and the pick control share their own row, so the price column never moves */}
      <span className="item-row-foot">
        <span className="item-row-meta">
          <AisleChip aisle={item.aisle} bay={item.shelf} tone={picked ? 'accent' : 'quiet'} />
          {tier && <Badge label={tier.label} variant={tier.variant} />}
        </span>
        <span className={picked ? 'pick-mark is-on' : 'pick-mark'}>
          <Icon icon={picked ? CheckIcon : isAlternative ? ArrowsRightLeftIcon : PlusIcon} size="sm" color="inherit" />
          {picked ? `${ordinal(order)} stop` : isAlternative ? 'Choose instead' : 'Add'}
        </span>
      </span>
    </button>
  )
}

function ChoiceRows({ c, s, usual }: { c: Choice; s: PhoneSession; usual: string | null }) {
  const order = (i: Item) => s.picked.indexOf(i.sku) + 1
  const open = s.expanded.includes(c.main.sku)
  const n = c.alternatives.length
  const altPicked = c.alternatives.some((a) => s.picked.includes(a.sku))
  return (
    <li className="choice">
      <ItemRow
        item={c.main}
        order={order(c.main)}
        onToggle={() => s.togglePick(c.main.sku)}
        isDisabled={!!s.busy}
        usual={usual}
      />
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
            <ul className="plain-list choice-alt-list" aria-label={`Instead of the ${itemTitle(c.main).toLowerCase()}`}>
              {c.alternatives.map((a) => (
                <li key={a.sku}>
                  <ItemRow
                    item={a}
                    order={order(a)}
                    onToggle={() => s.togglePick(a.sku)}
                    isDisabled={!!s.busy}
                    isAlternative
                    usual={usual}
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
  const usual = usualTier(items)
  // the tools fold away (most customers own a hammer); a tool already on the route keeps them open
  const toolSkus = tools.flatMap((c) => [c.main.sku, ...c.alternatives.map((a) => a.sku)])
  const toolsPicked = s.picked.filter((sku) => toolSkus.includes(sku)).length
  const toolsOpen = s.expanded.includes(TOOLS_KEY)
  const toolsSum = tools.reduce((t, c) => t + c.main.price, 0)
  return (
    <VStack gap={4}>
      <Seen s={s} />
      <VStack gap={1} data-anchor="items-head" className="items-head">
        <Heading level={1}>Here's what you need</Heading>
        <Text as="p" color="secondary">
          {budgetLine(items, s.budget)}
        </Text>
      </VStack>
      {fix.length > 0 && (
        <VStack gap={2} as="ul" className="plain-list" aria-label="For the repair">
          {fix.map((c) => (
            <ChoiceRows key={c.main.sku} c={c} s={s} usual={usual} />
          ))}
        </VStack>
      )}
      {tools.length > 0 && (
        <VStack gap={2} as="section" aria-label="Tools you might need" data-anchor="tools">
          <button
            type="button"
            className="tools-toggle"
            aria-expanded={toolsOpen}
            onClick={() => s.toggleExpanded(TOOLS_KEY)}
          >
            <Icon icon={WrenchScrewdriverIcon} size="sm" color="secondary" />
            <span className="tools-toggle-text">
              <Text type="label" as="span">
                Tools you might need · {tools.length}
              </Text>
              <Text type="supporting" as="span">
                {toolsPicked ? `${toolsPicked} on your route` : 'skip any you own'}
              </Text>
            </span>
            <span className={toolsOpen ? 'alt-chevron is-open' : 'alt-chevron'} aria-hidden>
              <Icon icon={ChevronDownIcon} size="sm" color="secondary" />
            </span>
          </button>
          {toolsOpen && (
            <>
              <Text type="supporting" as="p" hasTabularNumbers className="tools-note">
                {money(toolsSum)} if you bought all {tools.length}. Most people own a few already.
              </Text>
              <VStack gap={2} as="ul" className="plain-list">
                {tools.map((c) => (
                  <ChoiceRows key={c.main.sku} c={c} s={s} usual={usual} />
                ))}
              </VStack>
            </>
          )}
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
                      ? `Budget ${money(s.budget, true)} · nothing added yet`
                      : 'Add what you need, in pick-up order'
                    : s.budget != null
                      ? over
                        ? `${money(total - s.budget)} over your ${money(s.budget, true)} budget`
                        : `${money(s.budget - total)} left of your ${money(s.budget, true)} budget`
                      : 'Prices before tax'}
            </Text>
          </VStack>
        </StackItem>
        <Price value={total} size="lg" />
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
