// Same-origin calls only: /webhook/... (passed on to n8n), /tour/status, /store/layout, /health.
import { report } from './log'
import type { ErrorReply } from './types'

export type WebhookResult<T> =
  { ok: true; data: T; httpStatus: number } | { ok: false; error: ErrorReply; httpStatus: number }

/** Thrown when the service cannot be reached at all (network down, timeout, reply not JSON). */
export class NetworkError extends Error {}

const isErrorReply = (x: unknown): x is ErrorReply =>
  typeof x === 'object' && x !== null && typeof (x as ErrorReply).error === 'string'

async function fetchJSON(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ status: number; body: unknown }> {
  const abort = new AbortController()
  const timer = window.setTimeout(() => abort.abort(), timeoutMs)
  try {
    const reply = await fetch(url, { ...init, signal: abort.signal })
    let body: unknown
    try {
      body = await reply.json()
    } catch {
      throw new NetworkError(`the reply from ${url.split('?')[0]} is not JSON (HTTP ${reply.status})`)
    }
    return { status: reply.status, body }
  } catch (e) {
    if (e instanceof NetworkError) throw e
    throw new NetworkError(abort.signal.aborted ? 'timed out' : String((e as Error)?.message ?? e))
  } finally {
    window.clearTimeout(timer)
  }
}

/**
 * Calls one n8n webhook. Error replies (4xx with {error}) come back as `ok: false`; only an
 * unreachable service throws. Every failure is reported to the log.
 */
export async function webhook<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  { timeoutMs = 90_000, quiet = false }: { timeoutMs?: number; quiet?: boolean } = {},
): Promise<WebhookResult<T>> {
  const where = { method, path: path.split('?')[0] }
  let res: { status: number; body: unknown }
  try {
    res = await fetchJSON(
      '/webhook/' + path,
      {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      timeoutMs,
    )
  } catch (e) {
    report('fetch_failed', { ...where, error: String((e as Error).message) }, quiet ? 'warn' : 'error')
    throw e
  }
  if (res.status >= 400 || isErrorReply(res.body)) {
    const error: ErrorReply = isErrorReply(res.body)
      ? res.body
      : { error: 'http_' + res.status, message: 'The service answered with an error.' }
    report(
      'webhook_error',
      { ...where, http_status: res.status, error: error.error, message: error.message, screen: error.screen },
      res.status >= 500 ? 'error' : 'warn',
    )
    return { ok: false, error, httpStatus: res.status }
  }
  return { ok: true, data: res.body as T, httpStatus: res.status }
}

/** GET on the robot service (/tour/status, /store/layout, /health). Throws NetworkError. */
export async function getJSON<T>(path: string, timeoutMs = 8_000): Promise<T> {
  try {
    const res = await fetchJSON(path, { method: 'GET' }, timeoutMs)
    if (res.status >= 400) throw new NetworkError(`HTTP ${res.status}`)
    return res.body as T
  } catch (e) {
    report('fetch_failed', { method: 'GET', path, error: String((e as Error).message) }, 'warn')
    throw e
  }
}

/** "$18.94"; with `round`, a whole amount drops its cents ("$50", as the customer said it). */
export const money = (n: number, round = false) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    ...(round && Number.isInteger(n) ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
  }).format(n)
