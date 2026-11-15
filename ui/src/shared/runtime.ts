// Settings of the running demo that the pages need (written by the robot container at start:
// docker/robot/entrypoint.sh writes runtime.json next to the pages; public/runtime.json is the
// default for `npm run dev`).
import { useEffect, useState } from 'react'

export interface Runtime {
  /** RViz runs (HD_RVIZ=yes). */
  rviz: boolean
  /** The port of RViz in the browser (noVNC) on this computer (HD_RVIZ_PORT). */
  rviz_port: number
  /** top (the recording top view) or 3d (HD_RVIZ_VIEW). */
  rviz_view: string
  /** The start of the phone link in LAN mode, e.g. http://192.168.1.20:8000 ('' = this computer only). */
  phone_base: string
}

const DEFAULTS: Runtime = { rviz: true, rviz_port: 6080, rviz_view: 'top', phone_base: '' }

let cached: Promise<Runtime> | null = null

export function loadRuntime(): Promise<Runtime> {
  cached ??= fetch('runtime.json', { cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<Partial<Runtime>>) : {}))
    .then((r) => ({ ...DEFAULTS, ...r }))
    .catch(() => DEFAULTS)
  return cached
}

/** The runtime settings; null until loaded. */
export function useRuntime(): Runtime | null {
  const [rt, setRt] = useState<Runtime | null>(null)
  useEffect(() => {
    let alive = true
    void loadRuntime().then((r) => alive && setRt(r))
    return () => {
      alive = false
    }
  }, [])
  return rt
}
