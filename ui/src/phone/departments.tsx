// A small picture for each item: its store department as an icon on a tile (the catalogue has no
// product photos). A few item words win over the department (safety glasses sit in Paint Supplies).
import type { ComponentType, SVGProps } from 'react'
import { Icon } from '@astryxdesign/core/Icon'
import {
  BoltIcon,
  Cog6ToothIcon,
  HomeIcon,
  HomeModernIcon,
  KeyIcon,
  LightBulbIcon,
  PaintBrushIcon,
  PowerIcon,
  ShieldCheckIcon,
  Square3Stack3DIcon,
  SwatchIcon,
  WrenchIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'
import type { Item } from '../shared/types'

type HeroIcon = ComponentType<SVGProps<SVGSVGElement>>

const BY_WORD: [RegExp, HeroIcon][] = [
  [/glasses|goggles|gloves|mask|respirator|ear ?plugs/i, ShieldCheckIcon],
  [/screw|nail|bolt|anchor|washer/i, Cog6ToothIcon],
  [/saw|drill|driver|sander|grinder/i, BoltIcon],
]

const BY_DEPARTMENT: [RegExp, HeroIcon][] = [
  [/lumber|decking/i, Square3Stack3DIcon],
  [/building/i, HomeModernIcon],
  [/fastener/i, Cog6ToothIcon],
  [/hand tool/i, WrenchScrewdriverIcon],
  [/power tool/i, BoltIcon],
  [/hardware/i, KeyIcon],
  [/electrical/i, PowerIcon],
  [/lighting/i, LightBulbIcon],
  [/plumbing/i, WrenchIcon],
  [/kitchen|bath/i, HomeIcon],
  [/supplies|adhesive|safety/i, SwatchIcon],
  [/paint/i, PaintBrushIcon],
]

export function iconFor(item: Pick<Item, 'item_name' | 'department'>): HeroIcon {
  for (const [re, icon] of BY_WORD) if (re.test(item.item_name)) return icon
  for (const [re, icon] of BY_DEPARTMENT) if (re.test(item.department ?? '')) return icon
  return WrenchScrewdriverIcon
}

export function DepartmentTile({ item }: { item: Pick<Item, 'item_name' | 'department'> }) {
  return (
    <span className="dept-tile" aria-hidden title={item.department}>
      <Icon icon={iconFor(item)} size="lg" color="inherit" />
    </span>
  )
}
