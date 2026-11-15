// The story the stage tells: problem → AI → robot → wrap-up, one step at a time.

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
    key: 'problem',
    title: 'The problem',
    caption: 'A customer needs help with a repair',
    steps: [
      { key: 'start', label: 'Kiosk' },
      { key: 'input', label: 'Describe' },
    ],
  },
  {
    key: 'ai',
    title: 'The AI',
    caption: 'Gemini understands and picks the items',
    steps: [
      { key: 'gate', label: 'Relevancy' },
      { key: 'question', label: 'Follow-up' },
      { key: 'items', label: 'Item list' },
    ],
  },
  {
    key: 'robot',
    title: 'The robot',
    caption: 'It walks the customer to each shelf',
    steps: [
      { key: 'guiding', label: 'Guiding' },
      { key: 'light', label: 'Light on' },
      { key: 'arrived', label: 'Arrived' },
    ],
  },
  {
    key: 'wrap',
    title: 'Wrap-up',
    caption: 'Repair steps, then back to the dock',
    steps: [
      { key: 'anything_else', label: 'Anything else?' },
      { key: 'finished', label: 'Repair steps' },
      { key: 'home', label: 'Robot home' },
    ],
  },
]

export const FLOW_ORDER: FlowKey[] = ACTS.flatMap((a) => a.steps.map((s) => s.key))
