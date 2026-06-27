import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

const registerSchema = z.object({
  pharmacyName: z.string().min(2),
  tenantType: z.enum(['RETAIL_PHARMACY', 'WHOLESALE_DISTRIBUTOR', 'CHAIN_PHARMACY', 'HOSPITAL', 'CLINIC', 'SUPPLIER']).default('RETAIL_PHARMACY'),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().min(10),
})

function slugify(name: string): string {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'pharmacy'
  return `${base}-${Math.random().toString(36).slice(2, 6)}`
}

const refreshSchema = z.object({
  refreshToken: z.string(),
})

export async function authRoutes(app: FastifyInstance) {
  // Build the full auth response (tokens + user) for a given user id.
  async function issueSession(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { tenant: true, stores: { include: { store: true } } },
    })
    const payload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      storeIds: user.stores.map((us) => us.storeId),
    }
    const accessToken = app.jwt.sign(payload, { expiresIn: '15m' })
    const refreshToken = app.jwt.sign({ userId: user.id }, { expiresIn: '7d' })
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await bcrypt.hash(refreshToken, 10), lastLoginAt: new Date() },
    })
    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
      user: {
        id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId,
        tenant: {
          id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug, type: user.tenant.type, plan: user.tenant.plan,
          gstin: user.tenant.gstin ?? null, drugLicenseNumber: user.tenant.drugLicenseNumber ?? null,
          phone: user.tenant.phone ?? null, email: user.tenant.email ?? null,
          addressLine1: user.tenant.addressLine1 ?? null, city: user.tenant.city ?? null,
          state: user.tenant.state ?? null, pincode: user.tenant.pincode ?? null,
          allowNegativeStock: user.tenant.allowNegativeStock ?? false,
        },
        stores: user.stores.map((us) => ({ id: us.store.id, name: us.store.name, code: us.store.code, isPrimary: us.isPrimary })),
      },
    }
  }

  // POST /api/v1/auth/login
  app.post('/login', async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body)

    const user = await prisma.user.findFirst({
      where: { email, isActive: true },
      include: {
        tenant: true,
        stores: { include: { store: true } },
      },
    })

    if (!user) {
      return reply.status(401).send({ success: false, error: 'Invalid credentials' })
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash)
    if (!passwordMatch) {
      return reply.status(401).send({ success: false, error: 'Invalid credentials' })
    }

    if (!user.tenant.isActive) {
      return reply.status(403).send({ success: false, error: 'Account suspended' })
    }

    const payload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      storeIds: user.stores.map((us) => us.storeId),
    }

    const accessToken = app.jwt.sign(payload, { expiresIn: '15m' })
    const refreshToken = app.jwt.sign({ userId: user.id }, { expiresIn: '7d' })

    // Store refresh token hash
    await prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken: await bcrypt.hash(refreshToken, 10),
        lastLoginAt: new Date(),
      },
    })

    return reply.send({
      success: true,
      data: {
        accessToken,
        refreshToken,
        expiresIn: 900,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          tenant: {
            id: user.tenant.id,
            name: user.tenant.name,
            slug: user.tenant.slug,
            type: user.tenant.type,
            plan: user.tenant.plan,
            gstin: user.tenant.gstin ?? null,
            drugLicenseNumber: user.tenant.drugLicenseNumber ?? null,
            phone: user.tenant.phone ?? null,
            email: user.tenant.email ?? null,
            addressLine1: user.tenant.addressLine1 ?? null,
            city: user.tenant.city ?? null,
            state: user.tenant.state ?? null,
            pincode: user.tenant.pincode ?? null,
            allowNegativeStock: user.tenant.allowNegativeStock ?? false,
          },
          stores: user.stores.map((us) => ({
            id: us.store.id,
            name: us.store.name,
            code: us.store.code,
            isPrimary: us.isPrimary,
          })),
        },
      },
    })
  })

  // POST /api/v1/auth/register
  app.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body)

    const existingUser = await prisma.user.findFirst({ where: { email: body.email } })
    if (existingUser) {
      return reply.status(409).send({ success: false, error: 'An account with this email already exists. Try signing in.' })
    }

    const passwordHash = await bcrypt.hash(body.password, 12)

    // Generate a unique slug (retry on the rare collision)
    let slug = slugify(body.pharmacyName)
    for (let i = 0; i < 5; i++) {
      const taken = await prisma.tenant.findUnique({ where: { slug } })
      if (!taken) break
      slug = slugify(body.pharmacyName)
    }

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: body.pharmacyName,
          slug,
          type: body.tenantType as any,
          phone: body.phone,
          email: body.email,
          settings: {
            currency: 'INR', timezone: 'Asia/Kolkata', gstEnabled: true,
            creditDays: 30, lowStockThreshold: 10, expiryAlertDays: 90,
          },
        },
      })

      const store = await tx.store.create({
        data: {
          tenantId: tenant.id, name: body.pharmacyName, code: 'MAIN',
          city: '', state: '', pincode: '', addressLine1: '', isHeadOffice: true,
        },
      })

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id, name: body.name, email: body.email, phone: body.phone,
          passwordHash, role: 'TENANT_ADMIN',
        },
      })

      await tx.userStore.create({ data: { userId: user.id, storeId: store.id, isPrimary: true } })
      return { user }
    })

    // Auto-login: return the same session payload the login endpoint does
    const session = await issueSession(result.user.id)
    return reply.status(201).send({ success: true, message: 'Welcome to RxFlow', data: session })
  })

  // POST /api/v1/auth/refresh
  app.post('/refresh', async (request, reply) => {
    const { refreshToken } = refreshSchema.parse(request.body)

    let payload: { userId: string }
    try {
      payload = app.jwt.verify<{ userId: string }>(refreshToken)
    } catch {
      return reply.status(401).send({ success: false, error: 'Invalid refresh token' })
    }

    const user = await prisma.user.findFirst({
      where: { id: payload.userId, isActive: true },
      include: { stores: true },
    })

    if (!user?.refreshToken) {
      return reply.status(401).send({ success: false, error: 'Invalid refresh token' })
    }

    const isValid = await bcrypt.compare(refreshToken, user.refreshToken)
    if (!isValid) {
      return reply.status(401).send({ success: false, error: 'Invalid refresh token' })
    }

    const newPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      storeIds: user.stores.map((us) => us.storeId),
    }

    const accessToken = app.jwt.sign(newPayload, { expiresIn: '15m' })
    const newRefreshToken = app.jwt.sign({ userId: user.id }, { expiresIn: '7d' })

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await bcrypt.hash(newRefreshToken, 10) },
    })

    return reply.send({
      success: true,
      data: { accessToken, refreshToken: newRefreshToken, expiresIn: 900 },
    })
  })

  // POST /api/v1/auth/logout
  app.post('/logout', { preHandler: [authenticate] }, async (request, reply) => {
    await prisma.user.update({
      where: { id: request.user.userId },
      data: { refreshToken: null },
    })
    return reply.send({ success: true, message: 'Logged out' })
  })

  // GET /api/v1/auth/me
  app.get('/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      include: {
        tenant: true,
        stores: { include: { store: true } },
      },
    })

    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' })
    }

    return reply.send({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        tenant: user.tenant,
        stores: user.stores.map((us) => ({ ...us.store, isPrimary: us.isPrimary })),
      },
    })
  })

  // ── OTP helpers ─────────────────────────────────────────────────────────────
  async function issueOtp(identifier: string, purpose: 'PASSWORD_RESET' | 'LOGIN') {
    const code = String(Math.floor(100000 + Math.random() * 900000)) // 6 digits
    const codeHash = await bcrypt.hash(code, 10)
    // Invalidate prior unconsumed OTPs for this identifier+purpose
    await prisma.otpToken.deleteMany({ where: { identifier, purpose, consumedAt: null } })
    await prisma.otpToken.create({
      data: { identifier, codeHash, purpose, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    })
    return code
  }

  async function verifyOtp(identifier: string, purpose: 'PASSWORD_RESET' | 'LOGIN', code: string): Promise<boolean> {
    const token = await prisma.otpToken.findFirst({
      where: { identifier, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
    if (!token) return false
    if (token.attempts >= 5) return false
    const ok = await bcrypt.compare(code, token.codeHash)
    if (!ok) {
      await prisma.otpToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } })
      return false
    }
    await prisma.otpToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } })
    return true
  }

  // POST /auth/forgot-password — always responds 200 (no account enumeration)
  app.post('/forgot-password', async (request, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(request.body)
    const normalized = email.toLowerCase().trim()
    const user = await prisma.user.findFirst({ where: { email: normalized, isActive: true } })
    if (user) {
      const code = await issueOtp(normalized, 'PASSWORD_RESET')
      try {
        const { sendEmail, otpEmailHtml } = await import('../utils/email.js')
        await sendEmail({ to: normalized, subject: 'Reset your RxFlow password', html: otpEmailHtml(code, 'reset') })
      } catch (e) {
        request.log.error({ err: e }, 'password-reset email failed')
      }
    }
    return reply.send({ success: true, message: 'If an account exists for that email, a reset code has been sent.' })
  })

  // POST /auth/reset-password — verify OTP + set new password
  app.post('/reset-password', async (request, reply) => {
    const body = z.object({
      email: z.string().email(),
      otp: z.string().length(6),
      newPassword: z.string().min(8),
    }).parse(request.body)
    const normalized = body.email.toLowerCase().trim()

    const ok = await verifyOtp(normalized, 'PASSWORD_RESET', body.otp)
    if (!ok) return reply.status(400).send({ success: false, error: 'Invalid or expired code' })

    const user = await prisma.user.findFirst({ where: { email: normalized, isActive: true } })
    if (!user) return reply.status(404).send({ success: false, error: 'Account not found' })

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(body.newPassword, 12), refreshToken: null },
    })
    return reply.send({ success: true, message: 'Password updated. You can now sign in.' })
  })

  // POST /auth/otp/request — passwordless login. Accepts email OR registered phone.
  // The code is delivered to the account's email (free). True SMS needs a paid gateway.
  app.post('/otp/request', async (request, reply) => {
    const { identifier } = z.object({ identifier: z.string().min(3) }).parse(request.body)
    const value = identifier.toLowerCase().trim()
    // Look up by email or phone
    const user = await prisma.user.findFirst({
      where: { isActive: true, OR: [{ email: value }, { phone: identifier.trim() }] },
    })
    let delivered = false
    if (user) {
      const code = await issueOtp(user.email.toLowerCase(), 'LOGIN')
      try {
        const { sendEmail, otpEmailHtml } = await import('../utils/email.js')
        await sendEmail({ to: user.email, subject: 'Your RxFlow login code', html: otpEmailHtml(code, 'login') })
        delivered = true
      } catch (e) {
        request.log.error({ err: e }, 'login OTP email failed')
      }
    }
    // Mask the email for the UI (e.g., r***@gmail.com) when we found a user
    const maskedEmail = user ? user.email.replace(/^(.).*(@.*)$/, '$1***$2') : null
    return reply.send({ success: true, data: { sent: delivered, maskedEmail } })
  })

  // POST /auth/otp/verify — verify login OTP, issue a session
  app.post('/otp/verify', async (request, reply) => {
    const body = z.object({ identifier: z.string().min(3), otp: z.string().length(6) }).parse(request.body)
    const value = body.identifier.toLowerCase().trim()
    const user = await prisma.user.findFirst({
      where: { isActive: true, OR: [{ email: value }, { phone: body.identifier.trim() }] },
      include: { tenant: true },
    })
    if (!user) return reply.status(401).send({ success: false, error: 'Invalid code' })
    if (!user.tenant.isActive) return reply.status(403).send({ success: false, error: 'Account suspended' })

    const ok = await verifyOtp(user.email.toLowerCase(), 'LOGIN', body.otp)
    if (!ok) return reply.status(401).send({ success: false, error: 'Invalid or expired code' })

    const session = await issueSession(user.id)
    return reply.send({ success: true, data: session })
  })
}
