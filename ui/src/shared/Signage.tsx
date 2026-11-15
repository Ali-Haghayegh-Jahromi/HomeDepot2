import type { ReactNode } from 'react'

/**
 * Store signage, the visual language of the aisle: prices printed like a shelf-edge tag (big dollars,
 * small raised cents) and the orange aisle marker. Both read as plain text to screen readers.
 */

/** "$11.97" as a shelf tag prints it: $11 with a raised 97. */
export function Price({ value, size = 'md', className }: { value: number; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const [dollars, cents] = value.toFixed(2).split('.')
  const whole = Number(dollars).toLocaleString('en-US')
  return (
    <span className={['price', `price-${size}`, className].filter(Boolean).join(' ')} aria-label={`$${whole}.${cents}`}>
      <span className="price-sign" aria-hidden>
        $
      </span>
      <span className="price-whole" aria-hidden>
        {whole}
      </span>
      <span className="price-cents" aria-hidden>
        {cents}
      </span>
    </span>
  )
}

/** The aisle marker as a chip: "AISLE 3 | BAY 4" on the store's orange. */
export function AisleChip({ aisle, bay, tone = 'accent' }: { aisle: ReactNode; bay: ReactNode; tone?: 'accent' | 'quiet' }) {
  return (
    <span className={tone === 'quiet' ? 'aisle-chip is-quiet' : 'aisle-chip'} aria-label={`Aisle ${aisle}, bay ${bay}`}>
      <span aria-hidden>
        <span className="aisle-chip-word">Aisle</span> {aisle}
      </span>
      <span className="aisle-chip-bay" aria-hidden>
        <span className="aisle-chip-word">Bay</span> {bay}
      </span>
    </span>
  )
}

/** The big overhead aisle sign on the guide screen: the number to look up for, then the bay. */
export function AisleSign({ aisle, bay }: { aisle: ReactNode; bay: ReactNode }) {
  return (
    <span className="aisle-sign" aria-hidden>
      <span className="aisle-sign-block">
        <span className="aisle-sign-word">Aisle</span>
        <span className="aisle-sign-num">{aisle}</span>
      </span>
      <span className="aisle-sign-block is-bay">
        <span className="aisle-sign-word">Bay</span>
        <span className="aisle-sign-num">{bay}</span>
      </span>
    </span>
  )
}
