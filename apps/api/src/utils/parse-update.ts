/**
 * Validate a PATCH/PUT body without inventing values.
 *
 * zod 4's `.partial()` still applies `.default()`s, so `customerSchema.partial().parse({ name })`
 * returns `{ name, creditLimit: 0, tags: [] }` — an edit of one field would silently reset
 * every defaulted field on the record. Parse with the full rules (types, transforms), then keep
 * only the keys the client actually sent.
 */
import type { z } from 'zod'

export function parseUpdate<T extends z.ZodObject>(schema: T, raw: unknown): Partial<z.output<T>> {
  const parsed = schema.partial().parse(raw) as Record<string, unknown>
  const sent = raw && typeof raw === 'object' ? new Set(Object.keys(raw as object)) : new Set<string>()
  return Object.fromEntries(Object.entries(parsed).filter(([key]) => sent.has(key))) as Partial<z.output<T>>
}
