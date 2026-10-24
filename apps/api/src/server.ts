import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'

import { authRoutes } from './routes/auth.js'
import { medicineRoutes } from './routes/medicines.js'
import { inventoryRoutes } from './routes/inventory.js'
import { orderRoutes } from './routes/orders.js'
import { invoiceRoutes } from './routes/invoices.js'
import { supplierRoutes } from './routes/suppliers.js'
import { customerRoutes } from './routes/customers.js'
import { dashboardRoutes } from './routes/dashboard.js'
import { medicineIntelligenceRoutes } from './routes/medicine-intelligence.js'
import { salesRepRoutes } from './routes/sales-reps.js'
import { reportRoutes } from './routes/reports.js'
import { purchaseRoutes } from './routes/purchases.js'
import { searchRoutes } from './routes/search.js'
import { stockTakeRoutes } from './routes/stock-takes.js'
import { tenantRoutes } from './routes/tenant.js'
import { eventRoutes } from './routes/events.js'
import { auditLogRoutes } from './routes/audit-logs.js'
import { backupRoutes } from './routes/backup.js'
import { stockTransferRoutes } from './routes/stock-transfers.js'
import { accountRoutes } from './routes/accounts.js'
import { hrRoutes } from './routes/hr.js'
import { categoryRoutes } from './routes/categories.js'
import { errorHandler } from './middleware/error-handler.js'
import { env } from './utils/env.js'

const app = Fastify({
  // Behind Render's load balancer (and the web app's auth proxy): derive the client IP from
  // X-Forwarded-For so rate limits apply per client rather than to one shared proxy address.
  trustProxy: true,
  logger: {
    // The SSE endpoint takes its JWT as `?token=` (EventSource can't send headers).
    // Redact it so live access tokens never land in request logs.
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: req.url.replace(/([?&]token=)[^&]*/i, '$1[REDACTED]'),
          remoteAddress: req.ip,
        }
      },
    },
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
})

// ── Plugins ───────────────────────────────────────────────────────────────────

await app.register(helmet, { contentSecurityPolicy: false })

// CORS — support comma-separated exact origins AND a wildcard '*' for LAN deployments.
// Trailing slashes are normalized away on BOTH sides, since browsers send the Origin
// header without one (e.g. https://app.vercel.app) but env vars often include it.
const stripSlash = (s: string) => s.trim().replace(/\/+$/, '')
const corsOrigins = env.CORS_ORIGIN.split(',').map(stripSlash).filter(Boolean)
const allowAllOrigins = corsOrigins.includes('*')
await app.register(cors, {
  origin: allowAllOrigins
    ? true
    : (origin, cb) => {
        // Non-browser / same-origin requests have no Origin header — allow them.
        if (!origin) return cb(null, true)
        cb(null, corsOrigins.includes(stripSlash(origin)))
      },
  credentials: true,
  // @fastify/cors 10+ only allows the CORS-safelisted GET/HEAD/POST by default, which made
  // browsers block every edit and delete. List every method the API uses.
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
})

await app.register(rateLimit, {
  max: 200,
  timeWindow: '1 minute',
})

await app.register(jwt, {
  secret: env.JWT_SECRET,
  sign: { expiresIn: '15m' },
})

await app.register(swagger, {
  openapi: {
    info: {
      title: 'RxFlow API',
      description: 'Connected Pharma Distribution Network',
      version: '1.0.0',
    },
    servers: [{ url: `http://localhost:${env.PORT}` }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  },
})

await app.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: { docExpansion: 'list', deepLinking: false },
})

// ── Error Handler ─────────────────────────────────────────────────────────────
// Must be set BEFORE the route plugins are registered: each plugin captures the error handler
// of its parent at registration time, so setting it afterwards left every route on Fastify's
// default handler (Zod errors → 500, business errors → bare "Bad Request").
app.setErrorHandler(errorHandler)

// ── Routes ────────────────────────────────────────────────────────────────────

const API_PREFIX = '/api/v1'

await app.register(authRoutes, { prefix: `${API_PREFIX}/auth` })
await app.register(dashboardRoutes, { prefix: `${API_PREFIX}/dashboard` })
await app.register(medicineRoutes, { prefix: `${API_PREFIX}/medicines` })
await app.register(medicineIntelligenceRoutes, { prefix: `${API_PREFIX}/medicine-intelligence` })
await app.register(inventoryRoutes, { prefix: `${API_PREFIX}/inventory` })
await app.register(orderRoutes, { prefix: `${API_PREFIX}/orders` })
await app.register(invoiceRoutes, { prefix: `${API_PREFIX}/invoices` })
await app.register(supplierRoutes, { prefix: `${API_PREFIX}/suppliers` })
await app.register(customerRoutes, { prefix: `${API_PREFIX}/customers` })
await app.register(salesRepRoutes, { prefix: `${API_PREFIX}/sales-reps` })
await app.register(reportRoutes, { prefix: `${API_PREFIX}/reports` })
await app.register(purchaseRoutes, { prefix: `${API_PREFIX}/purchases` })
await app.register(searchRoutes, { prefix: `${API_PREFIX}/search` })
await app.register(stockTakeRoutes, { prefix: `${API_PREFIX}/stock-takes` })
await app.register(tenantRoutes, { prefix: `${API_PREFIX}/tenant` })
await app.register(eventRoutes, { prefix: `${API_PREFIX}/events` })
await app.register(auditLogRoutes, { prefix: `${API_PREFIX}/audit-logs` })
await app.register(backupRoutes, { prefix: `${API_PREFIX}/backup` })
await app.register(stockTransferRoutes, { prefix: `${API_PREFIX}/stock-transfers` })
await app.register(accountRoutes, { prefix: `${API_PREFIX}/accounts` })
await app.register(hrRoutes, { prefix: `${API_PREFIX}/hr` })
await app.register(categoryRoutes, { prefix: `${API_PREFIX}/categories` })

// ── Health Check ──────────────────────────────────────────────────────────────

app.get('/health', async (_request, reply) => {
  // The web app pings this cross-origin on every page load to wake a sleeping instance.
  // Helmet's default `Cross-Origin-Resource-Policy: same-origin` made browsers log a blocked-
  // response error for that ping; it is public and harmless, so allow cross-origin reads here.
  reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
  return { status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() }
})


// ── Start ─────────────────────────────────────────────────────────────────────

const start = async () => {
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
    app.log.info(`🚀 RxFlow API running on port ${env.PORT}`)
    app.log.info(`📚 Docs available at http://localhost:${env.PORT}/docs`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
