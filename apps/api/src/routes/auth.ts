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
  tenantName: z.string().min(2),
  tenantSlug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  tenantType: z.enum(['RETAIL_PHARMACY', 'WHOLESALE_DISTRIBUTOR', 'CHAIN_PHARMACY', 'HOSPITAL', 'CLINIC', 'SUPPLIER']),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().min(10),
})

const refreshSchema = z.object({
  refreshToken: z.string(),
})

export async function authRoutes(app: FastifyInstance) {
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

    const existingTenant = await prisma.tenant.findUnique({ where: { slug: body.tenantSlug } })
    if (existingTenant) {
      return reply.status(409).send({ success: false, error: 'Slug already taken' })
    }

    const existingUser = await prisma.user.findFirst({ where: { email: body.email } })
    if (existingUser) {
      return reply.status(409).send({ success: false, error: 'Email already registered' })
    }

    const passwordHash = await bcrypt.hash(body.password, 12)

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: body.tenantName,
          slug: body.tenantSlug,
          type: body.tenantType as any,
          phone: body.phone,
          email: body.email,
          settings: {
            currency: 'INR',
            timezone: 'Asia/Kolkata',
            gstEnabled: true,
            creditDays: 30,
            lowStockThreshold: 10,
            expiryAlertDays: 90,
          },
        },
      })

      const store = await tx.store.create({
        data: {
          tenantId: tenant.id,
          name: body.tenantName,
          code: 'MAIN',
          city: '',
          state: '',
          pincode: '',
          addressLine1: '',
          isHeadOffice: true,
        },
      })

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: body.name,
          email: body.email,
          phone: body.phone,
          passwordHash,
          role: 'TENANT_ADMIN',
        },
      })

      await tx.userStore.create({
        data: { userId: user.id, storeId: store.id, isPrimary: true },
      })

      return { tenant, store, user }
    })

    return reply.status(201).send({
      success: true,
      message: 'Registration successful',
      data: {
        tenantId: result.tenant.id,
        userId: result.user.id,
      },
    })
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
}
