import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { authenticate, requireRole } from './auth.js'

// Regression: refresh tokens ({ userId } only) are signed with the same key as access tokens.
// They must NOT authenticate API calls — with no tenantId, Prisma would drop the tenant filter.
describe('authenticate', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = Fastify()
    await app.register(jwt, { secret: 'x'.repeat(32) })
    app.get('/whoami', { preHandler: [authenticate] }, async (req) => ({ tenantId: req.user.tenantId }))
    app.get('/admin', { preHandler: [requireRole('TENANT_ADMIN')] }, async () => ({ ok: true }))
    app.post('/api/v1/orders', { preHandler: [authenticate] }, async () => ({ ok: true }))
    await app.ready()
  })
  afterAll(() => app.close())

  const call = (url: string, token?: string) =>
    app.inject({ method: 'GET', url, headers: token ? { authorization: `Bearer ${token}` } : {} })

  it('rejects a missing token', async () => {
    expect((await call('/whoami')).statusCode).toBe(401)
  })

  it('rejects a refresh-shaped token (no tenant/role)', async () => {
    const refresh = app.jwt.sign({ userId: 'u1' })
    const res = await call('/whoami', refresh)
    expect(res.statusCode).toBe(401)
  })

  it('accepts a full access token', async () => {
    const access = app.jwt.sign({ userId: 'u1', tenantId: 't1', role: 'PHARMACIST', storeIds: [] })
    const res = await call('/whoami', access)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ tenantId: 't1' })
  })

  it('enforces the role matrix on protected routes', async () => {
    const viewer = app.jwt.sign({ userId: 'u3', tenantId: 't1', role: 'VIEWER', storeIds: [] })
    const pharmacist = app.jwt.sign({ userId: 'u1', tenantId: 't1', role: 'PHARMACIST', storeIds: [] })
    const post = (token: string) =>
      app.inject({ method: 'POST', url: '/api/v1/orders', headers: { authorization: `Bearer ${token}` } })
    expect((await post(viewer)).statusCode).toBe(403)
    expect((await post(pharmacist)).statusCode).toBe(200)
  })

  it('requireRole stops the handler for the wrong role and for bad tokens', async () => {
    const pharmacist = app.jwt.sign({ userId: 'u1', tenantId: 't1', role: 'PHARMACIST', storeIds: [] })
    const admin = app.jwt.sign({ userId: 'u2', tenantId: 't1', role: 'TENANT_ADMIN', storeIds: [] })
    expect((await call('/admin', pharmacist)).statusCode).toBe(403)
    expect((await call('/admin')).statusCode).toBe(401)
    expect((await call('/admin', admin)).statusCode).toBe(200)
  })
})
