import { MapPinIcon } from '@heroicons/react/24/solid'
import { Icon } from '@astryxdesign/core/Icon'

/** The Aisle Guide mark: a map pin on the store's orange. */
export function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={size === 'md' ? 'brand-mark' : `brand-mark is-${size}`} aria-hidden>
      <Icon icon={MapPinIcon} color="inherit" size={size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : 'md'} />
    </span>
  )
}
