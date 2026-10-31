/**
 * Immediate revocation of a user's already-issued access tokens and live-sync streams.
 *
 * Access tokens are stateless 15-minute JWTs, so deleting a user's sessions only stops them from
 * REFRESHING. To cut them off at once, revoking a user records the time here and `authenticate`
 * rejects any token issued at or before it. Process-local, like the SSE pub/sub (the API is a
 * single instance); entries expire after the token lifetime, since nothing older can still be
 * valid. A restart forgets them, but every refresh session was already deleted in the database,
 * so a revoked token can then live at most until its own 15-minute expiry.
 */
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000

const revokedAt = new Map<string, number>() // userId → epoch seconds
const closers = new Map<string, Set<() => void>>() // userId → open live-sync streams

/** Reject all tokens issued up to now for `userId` and close their live-sync streams. */
export function revokeUser(userId: string, nowMs = Date.now()): void {
  revokedAt.set(userId, Math.floor(nowMs / 1000))
  for (const [id, sec] of revokedAt) if (sec * 1000 < nowMs - ACCESS_TOKEN_TTL_MS) revokedAt.delete(id)
  for (const close of closers.get(userId) ?? []) {
    try { close() } catch { /* stream already gone */ }
  }
  closers.delete(userId)
}

/** True when a token issued at `iat` (JWT seconds) predates a revocation of this user. */
export function isRevoked(userId: string, iat: number | undefined): boolean {
  const sec = revokedAt.get(userId)
  if (sec === undefined) return false
  return iat === undefined || iat <= sec
}

/** Register a live-sync stream so a later revocation can close it. Returns an unregister fn. */
export function trackStream(userId: string, close: () => void): () => void {
  if (!closers.has(userId)) closers.set(userId, new Set())
  closers.get(userId)!.add(close)
  return () => {
    const set = closers.get(userId)
    if (set) {
      set.delete(close)
      if (set.size === 0) closers.delete(userId)
    }
  }
}

/** Test helper. */
export function _resetRevocations(): void {
  revokedAt.clear()
  closers.clear()
}
