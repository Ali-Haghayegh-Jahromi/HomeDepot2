import { MapPinIcon } from '@heroicons/react/24/solid'
import { Icon } from '@astryxdesign/core/Icon'

/** The Aisle Guide mark: a map pin on the store's orange. */
export function BrandMark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className={size === 'lg' ? 'brand-mark is-lg' : 'brand-mark'} aria-hidden>
      <Icon icon={MapPinIcon} color="inherit" size={size === 'lg' ? 'lg' : 'md'} />
    </span>
  )
}
