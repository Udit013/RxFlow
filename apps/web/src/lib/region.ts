/**
 * The signed-in pharmacy's regional settings on the client. Read from the stored profile
 * (`rxflow_user.tenant`, refreshed at sign-in and from /auth/me) and resolved against the
 * country profiles in @rxflow/regional. Tenants without regional fields (sessions from before
 * localisation) resolve to India, matching how they behaved before.
 */
import { useEffect, useState } from 'react'
import { resolveRegion, type ResolvedRegion, type TenantRegionSettings } from '@rxflow/regional'

const USER_KEY = 'rxflow_user'
let cachedRaw: string | null | undefined
let cachedRegion: ResolvedRegion = resolveRegion({})

function readTenantSettings(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(USER_KEY)
  } catch {
    return null
  }
}

/** Current region; cheap to call on every render (memoised on the stored profile). */
export function getActiveRegion(): ResolvedRegion {
  const raw = readTenantSettings()
  if (raw === cachedRaw) return cachedRegion
  cachedRaw = raw
  let settings: TenantRegionSettings = {}
  try {
    settings = raw ? ((JSON.parse(raw) as { tenant?: TenantRegionSettings }).tenant ?? {}) : {}
  } catch { /* corrupted profile — fall back to defaults */ }
  cachedRegion = resolveRegion(settings)
  return cachedRegion
}

/** Notify region-aware components that the stored profile changed (e.g. after saving Settings). */
export function notifyRegionChanged() {
  cachedRaw = undefined
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('rxflow:region'))
}

/** React hook: the active region, re-rendering when Settings change it. */
export function useRegion(): ResolvedRegion {
  const [region, setRegion] = useState<ResolvedRegion>(() => getActiveRegion())
  useEffect(() => {
    const update = () => setRegion(getActiveRegion())
    update()
    window.addEventListener('rxflow:region', update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener('rxflow:region', update)
      window.removeEventListener('storage', update)
    }
  }, [])
  return region
}
