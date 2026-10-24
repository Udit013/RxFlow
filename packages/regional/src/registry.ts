import type { CountryCode, RegionProfile, ResolvedRegion, TenantRegionSettings } from './types.js'
import { IN } from './profiles/in.js'
import { US } from './profiles/us.js'
import { GB } from './profiles/gb.js'
import { AE } from './profiles/ae.js'
import { CA } from './profiles/ca.js'
import { INTL } from './profiles/intl.js'
import { isValidTimeZone } from './time.js'

/** Every bundled profile. To support a new country, add a file under profiles/ and list it here. */
export const REGION_PROFILES: Record<string, RegionProfile> = { IN, US, GB, AE, CA, INTL }

/** Existing tenants (created before localisation) are Indian. */
export const DEFAULT_COUNTRY: CountryCode = 'IN'

export function getRegionProfile(code: CountryCode | null | undefined): RegionProfile {
  return REGION_PROFILES[(code ?? DEFAULT_COUNTRY).toUpperCase()] ?? INTL
}

export function listRegionProfiles(): RegionProfile[] {
  // Dedicated profiles alphabetically, the generic one last.
  return Object.values(REGION_PROFILES)
    .filter((p) => p.code !== 'INTL')
    .sort((a, b) => a.name.localeCompare(b.name))
    .concat(INTL)
}

export function isValidCurrency(code: string | null | undefined): boolean {
  if (!code || !/^[A-Z]{3}$/.test(code)) return false
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code })
    return true
  } catch {
    return false
  }
}

export function isValidLocale(locale: string | null | undefined): boolean {
  if (!locale) return false
  try {
    return Intl.NumberFormat.supportedLocalesOf([locale]).length > 0
  } catch {
    return false
  }
}

/**
 * A tenant's effective regional settings: its country's profile with the tenant's own currency,
 * locale, timezone and fiscal-year start layered on top (invalid overrides fall back safely).
 */
export function resolveRegion(settings: TenantRegionSettings | null | undefined): ResolvedRegion {
  const country = (settings?.country ?? DEFAULT_COUNTRY).toUpperCase()
  const base = getRegionProfile(country)
  const fy = settings?.fiscalYearStartMonth
  return {
    ...base,
    country,
    currency: isValidCurrency(settings?.currency) ? settings!.currency! : base.currency,
    locale: isValidLocale(settings?.locale) ? settings!.locale! : base.locale,
    timezone: isValidTimeZone(settings?.timezone) ? settings!.timezone! : base.timezone,
    fiscalYearStartMonth: fy && fy >= 1 && fy <= 12 ? fy : base.fiscalYearStartMonth,
  }
}

/** Defaults to store on a new tenant for a country. */
export function regionDefaults(country: CountryCode) {
  const p = getRegionProfile(country)
  return {
    country: REGION_PROFILES[country.toUpperCase()] ? country.toUpperCase() : 'INTL',
    currency: p.currency,
    locale: p.locale,
    timezone: p.timezone,
    fiscalYearStartMonth: p.fiscalYearStartMonth,
  }
}
