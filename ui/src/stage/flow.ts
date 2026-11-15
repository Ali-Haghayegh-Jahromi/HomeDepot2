// The story the stage tells, in the phone's own four steps: Describe → Choose → Find → Wrap up.

export type FlowKey =
  | 'start'
  | 'input'
  | 'gate'
  | 'question'
  | 'items'
  | 'guiding'
  | 'light'
  | 'arrived'
  | 'anything_else'
  | 'finished'
  | 'home'

export interface Act {
  key: string
  title: string
  caption: string
  steps: { key: FlowKey; label: string }[]
}

export const ACTS: Act[] = [
  {
    key: 'describe',
    title: 'Describe',
    caption: 'A photo or a few words; n8n checks it is a repair',
    steps: [
      { key: 'start', label: 'Kiosk' },
      { key: 'input', label: 'Photo' },
      { key: 'gate', label: 'Relevancy' },
      { key: 'question', label: 'Follow-up' },
    ],
  },
  {
    key: 'choose',
    title: 'Choose',
    caption: 'The AI picks parts this store stocks',
    steps: [{ key: 'items', label: 'Item list' }],
  },
  {
    key: 'find',
    title: 'Find',
    caption: 'The robot walks them to each shelf',
    steps: [
      { key: 'guiding', label: 'Guiding' },
      { key: 'light', label: 'Light on' },
      { key: 'arrived', label: 'Arrived' },
    ],
  },
  {
    key: 'wrap',
    title: 'Wrap up',
    caption: 'Repair steps, then back to the dock',
    steps: [
      { key: 'anything_else', label: 'Anything else?' },
      { key: 'finished', label: 'Repair steps' },
      { key: 'home', label: 'Robot home' },
    ],
  },
]

export const FLOW_ORDER: FlowKey[] = ACTS.flatMap((a) => a.steps.map((s) => s.key))
