// The item list as choices: each main item (or tool) with the alternatives the AI listed right
// after it. A group is one choice: picking an alternative swaps out the main item and vice versa,
// so the route never holds a board and its "instead of" board together.
import type { Item } from '../shared/types'

export const roleOf = (i: Item) => (i.role === 'tool' || i.role === 'alternative' ? i.role : 'main')

export interface Choice {
  main: Item
  alternatives: Item[]
}

/** The AI lists each main item followed by its alternatives, tools last; untagged items count as the fix. */
export function choicesOf(items: Item[]): Choice[] {
  const out: Choice[] = []
  for (const item of items) {
    const last = out[out.length - 1]
    if (roleOf(item) === 'alternative' && last) last.alternatives.push(item)
    else out.push({ main: item, alternatives: [] })
  }
  return out
}

/** The SKUs that are one choice with `sku` (itself included). */
export function choiceOf(items: Item[], sku: string): string[] {
  const c = choicesOf(items).find((g) => g.main.sku === sku || g.alternatives.some((a) => a.sku === sku))
  return c ? [c.main.sku, ...c.alternatives.map((a) => a.sku)] : [sku]
}

/**
 * The route after tapping `sku`: off if it was on; else on, taking the place (and the stop number)
 * of whatever else of its choice was on. Returns the SKU it replaced, if any.
 */
export function pickIn(items: Item[], picked: string[], sku: string): { picked: string[]; replaced: string | null } {
  if (picked.includes(sku)) return { picked: picked.filter((s) => s !== sku), replaced: null }
  const same = choiceOf(items, sku)
  const at = picked.findIndex((s) => s !== sku && same.includes(s))
  if (at < 0) return { picked: [...picked, sku], replaced: null }
  const next = [...picked]
  const replaced = next[at] ?? null
  next[at] = sku
  return { picked: next.filter((s, i) => i === at || !same.includes(s)), replaced }
}

/** A short, plain name for an item ("Composite deck board") from its catalogue name. */
export function shortName(item: Item): string {
  const words = item.item_name
    .replace(/\([^)]*\)/g, ' ')
    .split(',')[0]!
    .split(/\s+/)
    .filter((w) => w && !/\d/.test(w) && !/^(x|in\.|ft\.|lb\.|oz\.|gal\.)$/i.test(w))
  const brand = (item.brand ?? '').toLowerCase()
  const rest = words.filter((w) => w.toLowerCase() !== brand)
  const tail = rest.slice(-3).join(' ')
  return tail ? tail.charAt(0).toUpperCase() + tail.slice(1).toLowerCase() : item.item_name
}
