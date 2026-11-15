import { useEffect, useState } from 'react'
import { getJSON } from './api'
import { usePolling } from './hooks'
import type { StoreLayout, TourStatus } from './types'

/** The store's floor plan (GET /store/layout), loaded once. `null` until loaded or if it failed. */
export function useStoreLayout(): { layout: StoreLayout | null; failed: boolean; retry: () => void } {
  const [layout, setLayout] = useState<StoreLayout | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    getJSON<StoreLayout>('/store/layout')
      .then((l) => alive && (setLayout(l), setFailed(false)))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [attempt])
  return { layout, failed, retry: () => setAttempt((a) => a + 1) }
}

/** The robot's live status (GET /tour/status), polled while `enabled`. */
export function useTourStatus(
  enabled: boolean,
  everyMs = 500,
): { status: TourStatus | null; reachable: boolean | null } {
  const [status, setStatus] = useState<TourStatus | null>(null)
  const [reachable, setReachable] = useState<boolean | null>(null)
  usePolling(
    async () => {
      try {
        setStatus(await getJSON<TourStatus>('/tour/status', 4000))
        setReachable(true)
      } catch {
        setReachable(false)
      }
    },
    everyMs,
    enabled,
  )
  return { status, reachable }
}
