import { describe, it, expect } from 'vitest'
import { createSigner } from 'fast-jwt'
import { createRefreshTokens } from './refresh-token.js'

const ACCESS = 'access-secret-access-secret-access-secret-1'
const REFRESH = 'refresh-secret-refresh-secret-refresh-sec-2'
const tokens = createRefreshTokens(REFRESH, ACCESS)

describe('refresh tokens', () => {
  it('round-trips with the refresh key', () => {
    const t = tokens.sign({ userId: 'u1', sid: 's1', jti: 'j1' })
    expect(tokens.verify(t)).toMatchObject({ userId: 'u1', sid: 's1', jti: 'j1', legacyKey: false })
  })

  it('is not valid under the access-token key', () => {
    const t = tokens.sign({ userId: 'u1', sid: 's1' })
    expect(() => createRefreshTokens(ACCESS, 'x'.repeat(40)).verify(t)).not.toThrow()
    expect(createRefreshTokens(ACCESS, 'x'.repeat(40)).verify(t)).toBeNull()
  })

  it('still accepts refresh tokens issued with the old shared key', () => {
    const legacy = createSigner({ key: ACCESS, algorithm: 'HS256', expiresIn: 60_000 })({ userId: 'u1', sid: 's1' })
    expect(tokens.verify(legacy)).toMatchObject({ userId: 'u1', sid: 's1', legacyKey: true })
  })

  it('never accepts an access token as a refresh token', () => {
    const access = createSigner({ key: ACCESS, algorithm: 'HS256', expiresIn: 60_000 })({ userId: 'u1', tenantId: 't1', role: 'TENANT_ADMIN' })
    expect(tokens.verify(access)).toBeNull()
  })

  it('rejects expired, tampered and garbage tokens', () => {
    const expired = createSigner({ key: REFRESH, algorithm: 'HS256', expiresIn: 1 })({ userId: 'u1' })
    const t = tokens.sign({ userId: 'u1' })
    expect(tokens.verify(t.slice(0, -2) + 'xx')).toBeNull()
    expect(tokens.verify('not-a-token')).toBeNull()
    return new Promise<void>((done) => setTimeout(() => { expect(tokens.verify(expired)).toBeNull(); done() }, 20))
  })
})
