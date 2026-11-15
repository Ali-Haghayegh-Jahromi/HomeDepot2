// The formats of API_CONTRACT.md that the front end reads.

export type ScreenName =
  'input' | 'sorry' | 'question' | 'items' | 'guiding' | 'arrived' | 'anything_else' | 'finished' | 'timed_out'

export type QualityTier = 'good' | 'better' | 'best'

export interface Item {
  sku: string
  item_name: string
  brand?: string
  price: number
  item_url?: string
  description?: string
  specs?: string
  quality_tier?: QualityTier | string
  department?: string
  aisle: number
  shelf: number
  reason?: string
  /** What the item is for in this repair (added by the AI; absent in older replies). */
  role?: ItemRole | string
}

export type ItemRole = 'main' | 'alternative' | 'tool'

export interface Video {
  title: string
  url: string
}

export interface Summary {
  request: string
  items: string[]
  repair_steps: string[]
  videos: Video[]
}

export interface ScreenData {
  /** One sentence on what the AI understood from the customer's last message (photo, voice, text). */
  understood?: string
  question?: string
  options?: string[]
  items?: Item[]
  item?: Item
  index?: number
  total?: number
  light_on?: boolean
  requests?: Summary[]
}

export interface ScreenReply {
  session_id: string
  screen: ScreenName
  message: string
  data: ScreenData
  status?: 'active' | 'ended' | 'timed_out'
}

export interface ErrorReply {
  error: string
  message?: string
  screen?: ScreenName
}

export interface StartReply {
  session_id: string
  link: string
  qr_image_url?: string
  screen: 'input'
  message: string
}

export interface Pose {
  x: number
  y: number
  yaw: number
}

export interface TourStop {
  sku: string
  name: string
  aisle: number
  shelf: number
  x: number
  y: number
  yaw: number
  tag_code: string
  light_x: number
  light_y: number
  light_z?: number
}

export type RobotState = 'idle' | 'navigating' | 'waiting_for_pick' | 'returning_home' | 'done'

export interface TourStatus {
  state: RobotState
  session_id: string | null
  index: number
  total: number
  current_item: TourStop | null
  distance_m: number | null
  pose: Pose | null
  lights_on: string[]
}

export interface StoreLayout {
  width: number
  depth: number
  racks: [number, number, number, number][]
  obstacles: { x0: number; y0: number; x1: number; y1: number; label: string }[]
  aisles: { number: number; x: number; name: string }[]
  rack_y: number[]
  dock: { x: number; y: number }
  entrance: [number, number]
  near_m: number
}

export interface Health {
  ok: boolean
  mode: 'ros' | 'mock' | string
  nav2_ready: boolean
}
