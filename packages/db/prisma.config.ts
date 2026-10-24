// Prisma CLI configuration (generate, db push, db execute). The running app does not read
// this file — it connects through the driver adapter in src/index.ts.
import { defineConfig } from 'prisma/config'

// Prisma 7 no longer loads .env itself. Node's loader keeps variables that are already set,
// so Render/CI environment values always win over a local .env file.
try {
  process.loadEnvFile()
} catch {
  /* no .env here — rely on the real environment */
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { seed: 'tsx prisma/seed.ts' },
  datasource: {
    // Schema changes need Neon's DIRECT (non-pooled) connection; PgBouncer can't run DDL.
    // Optional so `prisma generate` works without any database configured (CI).
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
})
