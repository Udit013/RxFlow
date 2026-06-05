import type { FastifyInstance } from 'fastify'
import { subscribe, openSseStream } from '../utils/events.js'

export async function eventRoutes(app: FastifyInstance) {
  // GET /api/v1/events?token=...
  // SSE doesn't support custom headers in the browser EventSource, so we accept token via query.
  app.get('/', async (request, reply) => {
    const token = (request.query as { token?: string }).token
    if (!token) {
      return reply.status(401).send({ success: false, error: 'Token required' })
    }
    let decoded: any
    try {
      decoded = app.jwt.verify(token)
    } catch {
      return reply.status(401).send({ success: false, error: 'Invalid token' })
    }
    const tenantId = decoded.tenantId
    if (!tenantId) return reply.status(401).send({ success: false, error: 'No tenant in token' })

    const raw = openSseStream(reply)

    const unsub = subscribe(tenantId, (data) => {
      try { raw.write(data) } catch { /* connection closed */ }
    })

    // Heartbeat every 25s to keep proxies + browsers from dropping the stream
    const heartbeat = setInterval(() => {
      try { raw.write(`: heartbeat\n\n`) } catch { /* ignore */ }
    }, 25_000)

    request.raw.on('close', () => {
      clearInterval(heartbeat)
      unsub()
    })

    // Don't reply.send() — connection stays open
    return reply
  })
}
