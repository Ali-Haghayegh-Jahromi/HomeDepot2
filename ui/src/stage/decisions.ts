// Which of n8n's decision nodes the studio's Live events show as chips.
//
// A real run goes through 10 to 17 decision nodes (API_CONTRACT.md, "The decision trace"). Most of
// them are guards and plumbing (Which call is this?, Is this a known visit?, Did the save apply?...).
// The event shows the business decisions a viewer can follow in two seconds as chips, and folds the
// rest into one "✓ N checks passed" chip whose tooltip lists them.
//
// The names are the If / Switch node names on the n8n canvas (n8n/build_workflow.py), exactly.

import type { Decision } from './useStage'

/** Always a chip: the decisions the demo narrates. */
export const BUSINESS_DECISIONS: readonly string[] = [
  'Relevant to home repair?',
  'Did AI 2 ask a question or pick items?',
  'Budget known?',
  'Main items within the budget?',
  'Room for the tools too?',
  'Any items chosen?',
  'Near or arrived?',
  'More items left?',
  'Anything else: yes or no?',
  'Idle visits found?',
]

/** A guard is a chip only when it took this (unusual) branch; otherwise it counts as a passed check. */
export const GUARDS_SHOWN_WHEN: Readonly<Record<string, string>> = {
  'Is the visit still open?': 'no',
  'Is this a known visit?': 'no',
  'Does the call fit the current step?': 'no',
  'Is the input complete and valid?': 'no',
  'Did AI 1 answer?': 'no',
  'Did AI 2 answer?': 'no',
  'A voice note no model could hear?': 'yes',
  'Phone still guiding to it?': 'no',
  'Is this event for the item being fetched?': 'no',
  'Did the save apply?': 'no',
}

/** At most this many chips per event (with the "checks passed" chip), so 3 or more events fit. */
export const MAX_CHIPS = 5

export function splitDecisions(decisions: Decision[]): { shown: Decision[]; checks: Decision[] } {
  const shown: Decision[] = []
  const checks: Decision[] = []
  for (const d of decisions) {
    const [node, branch] = d
    const unusual = GUARDS_SHOWN_WHEN[node]
    if (BUSINESS_DECISIONS.includes(node) || (unusual !== undefined && branch === unusual)) shown.push(d)
    else checks.push(d)
  }
  return { shown, checks }
}
