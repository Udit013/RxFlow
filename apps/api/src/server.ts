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
  logger: {
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
})

// ── Plugins ───────────────────────────────────────────────────────────────────

await app.register(helmet, { contentSecurityPolicy: false })

// CORS — support comma-separated exact origins AND a wildcard '*' for LAN deployments.
// For LAN use: set CORS_ORIGIN=* in apps/api/.env. The server still listens on 0.0.0.0
// so devices on the same network can reach it via the host's LAN IP.
const corsOrigins = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
await app.register(cors, {
  origin: corsOrigins.includes('*') ? true : corsOrigins,
  credentials: true,
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

app.get('/health', async () => ({
  status: 'ok',
  version: '1.0.0',
  timestamp: new Date().toISOString(),
}))

// ── Error Handler ─────────────────────────────────────────────────────────────

app.setErrorHandler(errorHandler)

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
