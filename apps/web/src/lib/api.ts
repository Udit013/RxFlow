import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

/**
 * Session model
 * - Access token (15 min): held in memory only — never written to storage.
 * - Refresh token (7 days, rotating): an httpOnly cookie set by the API. Auth calls go through
 *   this app's own origin (`/api/v1/auth/*`, proxied by next.config rewrites) so the cookie is
 *   first-party and invisible to JavaScript.
 * - On a full page load the access token is gone; `ensureSession()` mints a new one from the cookie.
 */
let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}
export function setAccessToken(token: string | null) {
  accessToken = token
}

const LEGACY_ACCESS_KEY = 'rxflow_access_token'
const LEGACY_REFRESH_KEY = 'rxflow_refresh_token'
const USER_KEY = 'rxflow_user'

/**
 * Start waking the API as early as possible. On the free hosting plan a sleeping API takes
 * ~30-60s to come back; firing a cheap /health request the moment the app loads overlaps that
 * wake-up with the user typing their password (or with session restore) instead of making
 * them wait for it afterwards. Fire-and-forget, `no-cors` (the response isn't needed), once.
 */
let warmed = false
export function warmUpApi() {
  if (warmed || typeof window === 'undefined') return
  warmed = true
  try {
    const health = new URL('/health', API_BASE).toString()
    fetch(health, { mode: 'no-cors', cache: 'no-store', keepalive: true }).catch(() => {})
  } catch { /* malformed API_BASE — nothing to warm */ }
}

/** Same-origin client for the cookie-bearing auth endpoints. */
export const authApi = axios.create({
  baseURL: '/api/v1/auth',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
  timeout: 60000, // generous: the free-tier API can take ~50s to wake from idle
})

/** Everything else talks to the API directly with a Bearer token. */
export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

// ── Refresh (single-flight, cross-tab safe) ─────────────────────────────────────

let inflight: Promise<string> | null = null

async function doRefresh(): Promise<string> {
  // One-time migration: sessions created before the cookie switch still hold their refresh
  // token in localStorage. Exchange it once (the API answers with the cookie), then delete it.
  let legacy: string | null = null
  try {
    legacy = localStorage.getItem(LEGACY_REFRESH_KEY)
    localStorage.removeItem(LEGACY_REFRESH_KEY)
    localStorage.removeItem(LEGACY_ACCESS_KEY)
  } catch { /* storage unavailable */ }

  const res = await authApi.post('/refresh', legacy ? { refreshToken: legacy } : {})
  const token: string = res.data.data.accessToken
  setAccessToken(token)
  return token
}

/**
 * Get a fresh access token from the refresh cookie. Concurrent callers share one request, and
 * tabs are serialised with the Web Locks API — refresh tokens rotate, so two tabs refreshing
 * with the same cookie at once would make the second one fail and sign the user out.
 */
export function refreshAccessToken(): Promise<string> {
  if (!inflight) {
    const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined
    const run: Promise<string> = locks
      ? (locks.request('rxflow-session-refresh', () => doRefresh()) as unknown as Promise<string>) // lib typing nests the promise; it resolves to the token
      : doRefresh()
    inflight = run.finally(() => {
      inflight = null
    })
  }
  return inflight
}

/** Make sure we hold an access token (after a page load). Resolves false when signed out. */
export async function ensureSession(): Promise<boolean> {
  if (accessToken) return true
  try {
    await refreshAccessToken()
    return true
  } catch {
    return false
  }
}

export function clearLocalSession() {
  setAccessToken(null)
  try {
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(LEGACY_ACCESS_KEY)
    localStorage.removeItem(LEGACY_REFRESH_KEY)
  } catch { /* storage unavailable */ }
}

// ── 401 → refresh once → retry ──────────────────────────────────────────────────

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    if (error.response?.status !== 401 || !original || original._retry) return Promise.reject(error)

    original._retry = true
    try {
      const token = await refreshAccessToken()
      original.headers.Authorization = `Bearer ${token}`
      return api(original)
    } catch (refreshError) {
      clearLocalSession()
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
      return Promise.reject(refreshError)
    }
  }
)

export default api
