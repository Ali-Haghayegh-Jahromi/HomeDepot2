import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(reducedMotionQuery)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(reducedMotionQuery).matches,
  )
}

/**
 * Runs `task` now and then again `delayMs` after each run finishes (never two at once),
 * while `enabled` is true. The latest `task` is always used.
 */
export function usePolling(task: () => Promise<void> | void, delayMs: number, enabled = true): void {
  const latest = useRef(task)
  latest.current = task
  useEffect(() => {
    if (!enabled) return
    let stopped = false
    let timer = 0
    const run = async () => {
      try {
        await latest.current()
      } catch {
        // the task reports its own problems
      }
      if (!stopped) timer = window.setTimeout(run, delayMs)
    }
    void run()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [delayMs, enabled])
}

/** Size of an element, kept up to date with a ResizeObserver. */
export function useElementSize<T extends HTMLElement>(): [RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size]
}

/** Seconds since `since` (ms timestamp), ticking every second; 0 when `since` is null. */
export function useElapsed(since: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (since == null) return
    setNow(Date.now())
    const t = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(t)
  }, [since])
  return since == null ? 0 : Math.max(0, Math.floor((now - since) / 1000))
}
