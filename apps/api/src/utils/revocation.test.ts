import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { isRevoked, revokeUser, trackStream, _resetRevocations } from './revocation.js'
import { authenticate } from '../middleware/auth.js'

beforeEach(() => _resetRevocations())

describe('revocation registry', () => {
  it('rejects tokens issued at or before the revocation, accepts later ones', () => {
    revokeUser('u1', 1_000_000_500) // epoch second 1_000_000
    expect(isRevoked('u1', 999_999)).toBe(true)
    expect(isRevoked('u1', 1_000_000)).toBe(true) // same second: can't tell, fail closed
    expect(isRevoked('u1', 1_000_001)).toBe(false)
  })
  it('only affects the revoked user; a token with no iat is rejected', () => {
    revokeUser('u1')
    expect(isRevoked('u2', 1)).toBe(false)
    expect(isRevoked('u1', undefined)).toBe(true)
  })
  it('forgets revocations older than the access-token lifetime', () => {
    revokeUser('old', 1_000_000_000)
    revokeUser('new', 1_000_000_000 + 16 * 60 * 1000)
    expect(isRevoked('old', 1)).toBe(false) // pruned: nothing that old can still be valid
    expect(isRevoked('new', 1)).toBe(true)
  })
  it("closes the user's live-sync streams, and only theirs", () => {
    const mine = vi.fn(), other = vi.fn(), gone = vi.fn()
    trackStream('u1', mine)
    trackStream('u2', other)
    trackStream('u1', gone)()
    revokeUser('u1')
    expect(mine).toHaveBeenCalledTimes(1)
    expect(gone).not.toHaveBeenCalled() // already disconnected
    expect(other).not.toHaveBeenCalled()
  })
  it('a stream that throws on close does not stop the others closing', () => {
    const second = vi.fn()
    trackStream('u1', () => { throw new Error('socket gone') })
    trackStream('u1', second)
    expect(() => revokeUser('u1')).not.toThrow()
    expect(second).toHaveBeenCalled()
  })
})

describe('authenticate honours revocation', () => {
  let app: FastifyInstance
  beforeAll(async () => {
    app = Fastify()
    await app.register(jwt, { secret: 'x'.repeat(32) })
    app.get('/me', { preHandler: [authenticate] }, async (req) => ({ id: req.user.userId }))
    await app.ready()
  })
  afterAll(() => app.close())
  const token = (iatSec: number, role: 'PHARMACIST' | 'VIEWER' = 'PHARMACIST') =>
    app.jwt.sign({ userId: 'u1', tenantId: 't1', role, storeIds: [], iat: iatSec } as never)
  const get = (t: string) => app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${t}` } })
  const now = () => Math.floor(Date.now() / 1000)

  it('a deactivated or demoted user\'s still-valid token stops working at once', async () => {
    const before = token(now() - 5)
    expect((await get(before)).statusCode).toBe(200)
    revokeUser('u1')
    expect((await get(before)).statusCode).toBe(401)
  })
  it('a token issued after the revocation works again (re-login after a role change)', async () => {
    revokeUser('u1', Date.now() - 5_000)
    expect((await get(token(now()))).statusCode).toBe(200)
  })
})
