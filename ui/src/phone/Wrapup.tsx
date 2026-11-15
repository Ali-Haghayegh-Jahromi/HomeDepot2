import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { Link } from '@astryxdesign/core/Link'
import { List, ListItem } from '@astryxdesign/core/List'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { CheckIcon, ClockIcon, PlayIcon, PlusIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline'
import { StackItem } from '@astryxdesign/core/Stack'
import { money } from '../shared/api'
import type { Item, Summary } from '../shared/types'
import type { PhoneSession } from './usePhoneSession'

export function AnythingElse({ s }: { s: PhoneSession }) {
  return (
    <VStack gap={5} className="center-screen">
      <span className="done-mark" aria-hidden>
        <Icon icon={CheckIcon} color="inherit" size="lg" />
      </span>
      <VStack gap={2}>
        <Text type="label" color="accent" justify="center">
          {s.pickedItems.length ? 'All items collected' : 'Your list is done'}
        </Text>
        <Heading level={1} justify="center">
          {s.current?.message || 'Is there anything else I can help you with?'}
        </Heading>
        <Text as="p" color="secondary" justify="center">
          The robot is waiting right here with you.
        </Text>
      </VStack>
      {s.pickedItems.length > 0 && (
        <Card padding={4}>
          <VStack gap={2} as="ul" className="plain-list" aria-label="In your cart">
            {s.pickedItems.map((i) => (
              <HStack key={i.sku} as="li" gap={2} vAlign="center">
                <Icon icon={CheckIcon} size="sm" color="success" />
                <StackItem size="fill">
                  <Text maxLines={1}>{i.item_name}</Text>
                </StackItem>
                <Text hasTabularNumbers>{money(i.price)}</Text>
              </HStack>
            ))}
          </VStack>
        </Card>
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

export function AnythingElseFooter({ s }: { s: PhoneSession }) {
  const busy = s.busy?.kind === 'anything_else'
  return (
    <VStack gap={2}>
      <Button
        label="Yes, one more thing"
        variant="primary"
        size="lg"
        width="100%"
        icon={<Icon icon={PlusIcon} />}
        isDisabled={!!s.busy}
        onClick={() => void s.anythingElse('yes')}
      />
      <Button
        label="No, I'm done for today"
        variant="secondary"
        size="lg"
        width="100%"
        isDisabled={!!s.busy && !busy}
        isLoading={busy}
        onClick={() => void s.anythingElse('no')}
      />
    </VStack>
  )
}

/** A YouTube search link is said as one ("Search YouTube: …"), a real video as a video. */
const isSearch = (url: string) => /youtube\.com\/results/i.test(url)
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

function RequestSummary({ r, n, many, known }: { r: Summary; n: number; many: boolean; known: Item[] }) {
  const priced = r.items.map((name) => ({ name, item: known.find((i) => i.item_name === name) }))
  const allPriced = priced.length > 0 && priced.every((p) => p.item)
  const total = priced.reduce((sum, p) => sum + (p.item?.price ?? 0), 0)
  return (
    <Card padding={4}>
      <VStack gap={4} as="article" aria-label={r.request}>
        <VStack gap={2}>
          {many && (
            <Text type="label" color="accent">
              Request {n}
            </Text>
          )}
          <Heading level={2}>{r.request}</Heading>
          {r.items.length > 0 && (
            <VStack gap={2}>
              <VStack gap={1} as="ul" className="plain-list" aria-label="What you picked up">
                {priced.map(({ name, item }) => (
                  <HStack key={name} as="li" gap={2} vAlign="start">
                    <Icon icon={CheckIcon} size="sm" color="success" />
                    <StackItem size="fill">
                      <Text type="supporting">{name}</Text>
                    </StackItem>
                    {item && (
                      <Text type="supporting" hasTabularNumbers>
                        {money(item.price)}
                      </Text>
                    )}
                  </HStack>
                ))}
              </VStack>
              <Text type="label" hasTabularNumbers>
                {r.items.length} item{r.items.length > 1 ? 's' : ''}
                {allPriced ? ` · ${money(total)}` : ''} · pay at any register
              </Text>
            </VStack>
          )}
        </VStack>

        {r.repair_steps.length > 0 && (
          <VStack gap={2}>
            <HStack gap={2} vAlign="center">
              <Icon icon={WrenchScrewdriverIcon} size="sm" color="accent" />
              <Heading level={3}>Repair steps</Heading>
            </HStack>
            <ol className="repair-steps">
              {r.repair_steps.map((step, i) => (
                <li key={i}>
                  <Text as="p">{step}</Text>
                </li>
              ))}
            </ol>
          </VStack>
        )}

        {r.videos.length > 0 && (
          <VStack gap={2}>
            <Divider />
            <Heading level={3}>
              {r.videos.every((v) => isSearch(v.url)) ? 'Find a how-to video' : 'How-to videos'}
            </Heading>
            <List edge="flush" density="spacious" aria-label="How-to videos">
              {r.videos.map((v) => (
                <ListItem
                  key={v.url}
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  label={isSearch(v.url) ? `Search YouTube: ${v.title}` : capital(v.title)}
                  description={isSearch(v.url) ? 'Opens YouTube search results' : 'YouTube · opens in a new tab'}
                  startContent={
                    <span className="video-play" aria-hidden>
                      <Icon icon={PlayIcon} size="sm" color="inherit" />
                    </span>
                  }
                />
              ))}
            </List>
          </VStack>
        )}
      </VStack>
    </Card>
  )
}

export function Finished({ s }: { s: PhoneSession }) {
  const finished = s.current?.screen === 'finished'
  const requests = s.current?.data.requests ?? []
  return (
    <VStack gap={5}>
      <VStack gap={2} hAlign="center" className="finished-hero">
        <span className={finished ? 'done-mark' : 'done-mark is-ended'} aria-hidden>
          <Icon icon={finished ? CheckIcon : ClockIcon} color="inherit" size="lg" />
        </span>
        <Heading level={1} justify="center">
          {finished ? "You're all set!" : 'Your visit has ended'}
        </Heading>
        <Text as="p" color="secondary" justify="center">
          {s.current?.message ||
            (finished
              ? 'Here are your repair steps and how-to videos.'
              : 'We closed this visit after 10 minutes without activity.')}
        </Text>
      </VStack>

      {s.notice && (
        <Banner
          status="info"
          title={s.notice.title}
          description={s.notice.text}
          isDismissable
          onDismiss={s.dismissNotice}
        />
      )}

      {requests.length ? (
        <VStack gap={4}>
          {requests.map((r, i) => (
            <RequestSummary key={i} r={r} n={i + 1} many={requests.length > 1} known={s.items} />
          ))}
        </VStack>
      ) : (
        <EmptyState
          isCompact
          title="No repair steps for this visit"
          description="We only write repair steps once you have picked your items."
        />
      )}

      <VStack gap={1} hAlign="center" className="finished-link">
        <Text type="supporting" justify="center">
          {finished
            ? 'Pay at any register. The robot is heading back to its dock by the kiosk.'
            : 'Need more help? Press the help button on the kiosk to start a new visit.'}
        </Text>
        <Link
          href="https://www.homedepot.com/c/diy_projects_and_ideas"
          target="_blank"
          rel="noopener noreferrer"
          isExternalLink
          type="supporting"
        >
          More DIY projects and guides
        </Link>
        {s.session && (
          <Text type="supporting" color="secondary" hasTabularNumbers>
            Visit code {s.session.slice(0, 4).toUpperCase()} · show it to a store associate if you need help
          </Text>
        )}
      </VStack>
    </VStack>
  )
}
