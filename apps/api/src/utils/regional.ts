/**
 * The API's bridge to @rxflow/regional: the tenant's resolved region (cached), and validators
 * shared by every route that accepts phones, payment methods or tax IDs.
 */
import { z, ZodError } from 'zod'
import { prisma } from '@rxflow/db'
import {
  resolveRegion, isPlausiblePhone, validateTaxId, PAYMENT_METHOD_CODES,
  type ResolvedRegion, type PaymentMethodCode,
} from '@rxflow/regional'

// Region settings change rarely (an admin edits Settings), but are read on most requests that
// touch money, dates or the catalog — cache per tenant for a minute; edits invalidate at once.
const TTL_MS = 60_000
const cache = new Map<string, { region: ResolvedRegion; expires: number }>()

export async function getTenantRegion(tenantId: string): Promise<ResolvedRegion> {
  const hit = cache.get(tenantId)
  if (hit && hit.expires > Date.now()) return hit.region
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { country: true, currency: true, locale: true, timezone: true, fiscalYearStartMonth: true },
  })
  const region = resolveRegion(tenant ?? {})
  cache.set(tenantId, { region, expires: Date.now() + TTL_MS })
  return region
}

export function invalidateTenantRegion(tenantId: string) {
  cache.delete(tenantId)
}

/** Country-neutral phone field (6–15 digits; +, spaces, dashes, brackets allowed). */
export const phoneSchema = z.string().trim().refine(isPlausiblePhone, 'Enter a valid phone number (6–15 digits)')

export const paymentMethodSchema = z.enum(PAYMENT_METHOD_CODES as [PaymentMethodCode, ...PaymentMethodCode[]])

/**
 * Validate a tax registration number (GSTIN / VAT no. / EIN / TRN …) against the tenant's
 * country. Throws a ZodError so the response matches every other field error (422 + details).
 */
export function assertTaxId(region: ResolvedRegion, value: string | null | undefined, field = 'gstin') {
  const message = validateTaxId(region, value)
  if (message) throw new ZodError([{ code: 'custom', path: [field], message }])
}
