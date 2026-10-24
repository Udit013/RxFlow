/**
 * Refresh tokens are signed with their own key (JWT_REFRESH_SECRET), so they can never pass as
 * access tokens and a leaked access-token key does not let anyone mint sessions.
 *
 * Tokens issued before the split were signed with JWT_SECRET. They stay valid until they expire
 * (7 days — after 2026-10-31 none remain) and are rotated onto the new key on first use, so the
 * switch logs nobody out. The legacy path accepts only refresh-shaped payloads.
 */
import { createSigner, createVerifier } from 'fast-jwt'

export interface RefreshPayload {
  userId: string
  sid?: string
  jti?: string
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000

export function createRefreshTokens(refreshSecret: string, legacySecret: string) {
  const sign = createSigner({ key: refreshSecret, algorithm: 'HS256', expiresIn: TTL_MS })
  const verify = createVerifier({ key: refreshSecret, algorithms: ['HS256'] })
  const verifyLegacy = createVerifier({ key: legacySecret, algorithms: ['HS256'] })

  return {
    sign: (payload: RefreshPayload): string => sign({ ...payload }),
    /** The payload of a valid refresh token, or null. Never throws. */
    verify(token: string): (RefreshPayload & { legacyKey: boolean }) | null {
      try {
        return { ...(verify(token) as RefreshPayload), legacyKey: false }
      } catch {
        /* not signed with the refresh key — maybe a pre-split token */
      }
      try {
        const p = verifyLegacy(token) as RefreshPayload & { tenantId?: string; role?: string }
        // An access token is signed with the same legacy key; it must never act as a refresh token.
        if (p.tenantId || p.role || !p.userId) return null
        return { userId: p.userId, sid: p.sid, jti: p.jti, legacyKey: true }
      } catch {
        return null
      }
    },
  }
}
