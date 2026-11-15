// Short item names for titles ("Decking board"), with the brand and sizes on a second line.
// Catalogue names lead with the brand and the sizes ("WeatherShield 5/4 in. x 6 in. x 8 ft.
// Pressure-Treated Decking Board"), so a one- or two-line title is cut before the noun.
// Like the robot service's short_name (RViz's label), but up to three words when they fit.
import type { Item } from './types'

/** Units, joiners and size words that never make a name. */
const NOISE = /^(x|in\.?|ft\.?|yd\.?|lb\.?|lbs\.?|oz\.?|gal\.?|qt\.?|pt\.?|-|&|and|equivalent|schedule)$/i
/** Everything from " with ..." / " for ..." on is an extra, not the item. */
const EXTRAS = /\s(with|for)\s.*$/i
/** Plain capitalised words are lower-cased in a name; acronyms and brand-like words (PVC, LED+, DryDex) stay. */
const PLAIN = /^[A-Z][a-z'/-]*$/

const MAX_CHARS = 22

export function shortItemName(name: string, brand?: string): string {
  let n = name.replace(/\([^)]*\)/g, ' ').split(',')[0]!.replace(EXTRAS, '').trim()
  if (brand && n.toLowerCase().startsWith(brand.toLowerCase() + ' ')) n = n.slice(brand.length + 1)
  const words = n.split(/\s+/).filter((w) => w && !/\d/.test(w) && !NOISE.test(w))
  for (const k of [3, 2, 1]) {
    const picked = words.slice(-k)
    const text = picked.join(' ')
    if (text && (text.length <= MAX_CHARS || k === 1)) {
      const out = picked.map((w, i) => (i > 0 && PLAIN.test(w) ? w.toLowerCase() : w)).join(' ')
      return out.charAt(0).toUpperCase() + out.slice(1)
    }
  }
  return name
}

/** The title for an item row, card or summary line. */
export const itemTitle = (item: Pick<Item, 'item_name' | 'brand'>) => shortItemName(item.item_name, item.brand)

/**
 * The second line under a short title: the brand and the sizes from the full name
 * ("WeatherShield · 5/4 in. x 6 in. x 8 ft."), so nothing of the catalogue name is lost.
 */
export function itemSpecLine(item: Pick<Item, 'item_name' | 'brand'>): string {
  const brand = item.brand && item.brand !== 'Generic' ? item.brand : ''
  const packs = [...item.item_name.matchAll(/\(([^)]*\d[^)]*)\)/g)].map((m) => m[1]!)
  let rest = item.item_name.replace(/\([^)]*\)/g, ' ').trim()
  if (brand && rest.toLowerCase().startsWith(brand.toLowerCase() + ' ')) rest = rest.slice(brand.length + 1)
  // the sizes: the words up to the last one with a digit (before any comma), e.g. "5/4 in. x 6 in. x 8 ft."
  const words = rest.split(',')[0]!.split(/\s+/)
  let last = -1
  words.forEach((w, i) => {
    if (/\d/.test(w)) last = i
  })
  // a unit right after the last number belongs to it ("8 ft.")
  while (last >= 0 && last + 1 < words.length && NOISE.test(words[last + 1]!) && words[last + 1] !== '-') last++
  const sizes = last >= 0 ? words.slice(0, last + 1).join(' ') : ''
  return [brand, sizes, ...packs].filter(Boolean).join(' · ')
}
