import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  // File storage
  STORAGE_PROVIDER: z.enum(['local', 's3', 'cloudinary']).default('local'),
  STORAGE_BASE_URL: z.string().default('http://localhost:3001/uploads'),
  // AI/OCR
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_VISION_API_KEY: z.string().optional(),
  // Search
  MEILISEARCH_HOST: z.string().default('http://localhost:7700'),
  MEILISEARCH_KEY: z.string().default(''),
  // Redis (optional, for caching)
  REDIS_URL: z.string().optional(),
  // WhatsApp (optional)
  WHATSAPP_API_KEY: z.string().optional(),
  // GST e-invoicing
  EINVOICE_API_URL: z.string().optional(),
  EINVOICE_API_KEY: z.string().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  console.error(parsed.error.format())
  process.exit(1)
}

export const env = parsed.data
