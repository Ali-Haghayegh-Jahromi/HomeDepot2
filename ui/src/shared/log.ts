// Problem reports to the robot service's structured log (POST /log, logs/robot_service.jsonl).
// Best-effort: it never throws and never changes the page; the endpoint may not exist yet.

export type LogLevel = 'info' | 'warn' | 'error'
type Source = 'phone' | 'stage'

let source: Source = 'phone'
let getSession: () => string | null = () => null
const lastSent = new Map<string, number>()
const REPEAT_WINDOW_MS = 15_000

export function configureLog(src: Source, session: () => string | null): void {
  source = src
  getSession = session
}

/** Sends one entry. The same entry is sent at most once every 15 s unless `always` is set. */
export function report(
  event: string,
  details: Record<string, unknown> = {},
  level: LogLevel = 'info',
  always = false,
): void {
  try {
    const key = event + JSON.stringify(details)
    const now = Date.now()
    if (!always && now - (lastSent.get(key) ?? 0) < REPEAT_WINDOW_MS) return
    lastSent.set(key, now)
    void fetch('/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ source, level, session_id: getSession(), event, details }),
    }).catch(() => undefined)
  } catch {
    // reporting must never break the page
  }
}

const clip = (s: unknown, n = 1500) => (s == null ? undefined : String(s).slice(0, n))

/** window.onerror and unhandled promise rejections go to the log. */
export function installGlobalErrorReports(): void {
  window.addEventListener('error', (e) => {
    report(
      'js_error',
      {
        message: String(e.message),
        file: e.filename,
        line: e.lineno,
        col: e.colno,
        stack: clip((e.error as Error | undefined)?.stack),
      },
      'error',
    )
  })
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as { message?: string; stack?: string } | undefined
    report(
      'js_error',
      {
        message: 'unhandled promise rejection: ' + String(reason?.message ?? reason),
        stack: clip(reason?.stack),
      },
      'error',
    )
  })
}
