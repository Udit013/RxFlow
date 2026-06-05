import { api } from './api'

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

const TOKEN_KEY = 'rxflow_access_token'
const REFRESH_KEY = 'rxflow_refresh_token'
const USER_KEY = 'rxflow_user'

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthUser> {
    const res = await api.post('/auth/login', credentials)
    const { accessToken, refreshToken, user } = res.data.data
    localStorage.setItem(TOKEN_KEY, accessToken)
    localStorage.setItem(REFRESH_KEY, refreshToken)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    return user
  },

  async logout(): Promise<void> {
    try { await api.post('/auth/logout') } catch {}
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
  },

  getStoredUser(): AuthUser | null {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem(USER_KEY)
    return stored ? JSON.parse(stored) : null
  },

  getToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(TOKEN_KEY)
  },

  isAuthenticated(): boolean {
    return !!this.getToken()
  },

  async fetchCurrentUser(): Promise<AuthUser> {
    const res = await api.get('/auth/me')
    const user = res.data.data
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    return user
  },
}
