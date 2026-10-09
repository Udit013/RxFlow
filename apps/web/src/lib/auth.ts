import { api, authApi, setAccessToken, getAccessToken, clearLocalSession } from './api'
import { notifyRegionChanged } from './region'

export interface LoginCredentials { email: string; password: string }
export interface AuthUser {
  id: string; name: string; email: string; role: string
  tenantId: string
  tenant: {
    id: string; name: string; slug: string; type: string; plan: string
    gstin?: string | null; drugLicenseNumber?: string | null
    phone?: string | null; email?: string | null
    addressLine1?: string | null; city?: string | null; state?: string | null; pincode?: string | null
    allowNegativeStock?: boolean
    // Regional settings (see @rxflow/regional); absent on profiles stored before localisation
    country?: string; currency?: string; locale?: string; timezone?: string; fiscalYearStartMonth?: number
  }
  stores: { id: string; name: string; code: string; isPrimary: boolean }[]
}

export function buildTenantHeader(tenant: AuthUser['tenant']) {
  return {
    name: tenant.name,
    address: [tenant.addressLine1, tenant.city, tenant.state, tenant.pincode].filter(Boolean).join(', '),
    phone: tenant.phone ?? undefined,
    email: tenant.email ?? undefined,
    gstin: tenant.gstin ?? undefined,
    drugLicense: tenant.drugLicenseNumber ?? undefined,
  }
}

const USER_KEY = 'rxflow_user'

function storeUser(user: AuthUser) {
  try { localStorage.setItem(USER_KEY, JSON.stringify(user)) } catch { /* storage unavailable */ }
  notifyRegionChanged()
}

/** Login-type responses: keep the access token in memory, the (non-secret) profile in storage. */
function startSession(data: { accessToken: string; user: AuthUser }): AuthUser {
  setAccessToken(data.accessToken)
  storeUser(data.user)
  return data.user
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthUser> {
    const res = await authApi.post('/login', credentials)
    return startSession(res.data.data)
  },

  async register(payload: {
    pharmacyName: string; tenantType?: string; name: string; email: string; password: string; phone: string; country?: string
  }): Promise<AuthUser> {
    const res = await authApi.post('/register', payload)
    return startSession(res.data.data)
  },

  async logout(): Promise<void> {
    try { await authApi.post('/logout', {}) } catch { /* best effort — clear local session regardless */ }
    clearLocalSession()
  },

  async deleteAccount(confirmName: string): Promise<void> {
    await api.delete('/tenant', { data: { confirmName } })
    try { await authApi.post('/logout', {}) } catch { /* account is gone; just drop the cookie */ }
    clearLocalSession()
  },

  async forgotPassword(email: string): Promise<void> {
    await authApi.post('/forgot-password', { email })
  },

  async resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
    await authApi.post('/reset-password', { email, otp, newPassword })
  },

  async requestLoginOtp(identifier: string): Promise<{ sent: boolean; maskedEmail: string | null }> {
    const res = await authApi.post('/otp/request', { identifier })
    return res.data.data
  },

  async loginWithOtp(identifier: string, otp: string): Promise<AuthUser> {
    const res = await authApi.post('/otp/verify', { identifier, otp })
    return startSession(res.data.data)
  },

  getStoredUser(): AuthUser | null {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem(USER_KEY)
    if (!stored) return null
    try {
      return JSON.parse(stored) as AuthUser
    } catch {
      // Corrupted entry (manual edit, partial write) — treat as signed out rather than crash.
      localStorage.removeItem(USER_KEY)
      return null
    }
  },

  getToken(): string | null {
    return getAccessToken()
  },

  /** A signed-in profile exists locally (the cookie decides whether the session is still valid). */
  hasSession(): boolean {
    return !!this.getStoredUser()
  },

  /**
   * Pull the latest tenant settings (incl. regional settings) into the stored profile without
   * dropping fields only the login response carries. Keeps currency/tax/labels in sync after an
   * admin edits Settings on another device.
   */
  async refreshProfile(): Promise<void> {
    const stored = this.getStoredUser()
    if (!stored) return
    try {
      const res = await api.get('/auth/me')
      const me = res.data.data as Partial<AuthUser>
      storeUser({ ...stored, name: me.name ?? stored.name, role: me.role ?? stored.role, tenant: { ...stored.tenant, ...(me.tenant ?? {}) } })
    } catch { /* offline — keep the stored profile */ }
  },

  async fetchCurrentUser(): Promise<AuthUser> {
    const res = await api.get('/auth/me')
    const user = res.data.data
    storeUser(user)
    return user
  },
}
