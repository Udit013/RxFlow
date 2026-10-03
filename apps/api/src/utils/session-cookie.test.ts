import { describe, it, expect } from 'vitest'
import bcrypt from 'bcryptjs'
import { hashRefreshToken, refreshTokenMatches } from './session-cookie.js'

// Two tokens that share their first 72 bytes — exactly the shape of two JWTs for one user.
const prefix = 'x'.repeat(80)
const t1 = `${prefix}.signature-one`
const t2 = `${prefix}.signature-two`

describe('refresh token hashing', () => {
  it('distinguishes tokens that share a 72-byte prefix (bcrypt cannot)', async () => {
    expect(await bcrypt.compare(t2, await bcrypt.hash(t1, 4))).toBe(true) // the old flaw
    expect(await refreshTokenMatches(t2, hashRefreshToken(t1))).toBe(false)
    expect(await refreshTokenMatches(t1, hashRefreshToken(t1))).toBe(true)
  })

  it('still accepts a legacy bcrypt hash once', async () => {
    expect(await refreshTokenMatches(t1, await bcrypt.hash(t1, 4))).toBe(true)
  })
})
