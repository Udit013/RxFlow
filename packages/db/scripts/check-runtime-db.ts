/**
 * Deploy gate: connect exactly as the running API does (driver adapter + DATABASE_URL, i.e.
 * Neon's pooled, TLS connection) and run a query. If this fails the build fails, so Render keeps
 * the previous release live instead of shipping an API that can't reach its database.
 */
import { prisma } from '../src/index.js'

const started = Date.now()
try {
  const [row] = await prisma.$queryRaw<{ ok: number; tenants: bigint }[]>`SELECT 1 AS ok, (SELECT count(*) FROM "Tenant") AS tenants`
  console.info(`==> runtime database connection OK (${Date.now() - started} ms, ${row?.tenants ?? 0} tenants)`)
} catch (err) {
  console.error('==> runtime database connection FAILED — aborting the deploy so the previous release stays live')
  console.error(err)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
