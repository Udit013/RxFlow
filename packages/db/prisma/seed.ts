import { prisma, TenantType, UserRole, SubscriptionPlan } from '../src/index.js'
import bcrypt from 'bcryptjs'

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

async function main() {
  console.info('🌱 Seeding RxFlow database...')

  // ── Demo Tenant ──────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'rxflow-demo' },
    update: {},
    create: {
      name: 'RxFlow Demo Pharmacy',
      slug: 'rxflow-demo',
      type: TenantType.RETAIL_PHARMACY,
      gstin: '27AAACR5055K1ZV',
      drugLicenseNumber: 'MH-MUM-2024-001234',
      phone: '+919876543210',
      email: 'demo@rxflow.in',
      plan: SubscriptionPlan.PRO,
      settings: {
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        gstEnabled: true,
        eInvoicingEnabled: false,
        creditDays: 30,
        lowStockThreshold: 10,
        expiryAlertDays: 90,
        autoReorderEnabled: true,
        whatsappNotifications: true,
        languages: ['en', 'hi'],
      },
    },
  })

  // ── Demo Store ───────────────────────────────────────────────────────────
  const store = await prisma.store.upsert({
    where: { id: 'store-demo-001' },
    update: {},
    create: {
      id: 'store-demo-001',
      tenantId: tenant.id,
      name: 'Main Branch',
      code: 'MAIN',
      drugLicenseNumber: 'MH-MUM-2024-001234',
      gstin: '27AAACR5055K1ZV',
      phone: '+919876543210',
      email: 'main@rxflow.in',
      addressLine1: '123, Medicine Market, Bandra',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400050',
      isHeadOffice: true,
    },
  })

  // ── Admin User ───────────────────────────────────────────────────────────
  const adminUser = await prisma.user.upsert({
    where: { id: 'user-admin-001' },
    update: {},
    create: {
      id: 'user-admin-001',
      tenantId: tenant.id,
      name: 'Admin User',
      email: 'admin@rxflow.in',
      phone: '+919876543210',
      passwordHash: await hashPassword('admin123'),
      role: UserRole.TENANT_ADMIN,
      isEmailVerified: true,
    },
  })

  await prisma.userStore.upsert({
    where: { userId_storeId: { userId: adminUser.id, storeId: store.id } },
    update: {},
    create: { userId: adminUser.id, storeId: store.id, isPrimary: true },
  })

  // ── Demo Supplier ────────────────────────────────────────────────────────
  await prisma.supplier.upsert({
    where: { id: 'supplier-demo-001' },
    update: {},
    create: {
      id: 'supplier-demo-001',
      tenantId: tenant.id,
      name: 'Rajesh Pharma Distributors',
      companyName: 'Rajesh Pharma Distributors Pvt. Ltd.',
      gstin: '27AABCR1234D1ZV',
      drugLicenseNumber: 'MH-WS-2024-000789',
      phone: '+919898989898',
      email: 'rajesh@pharma-dist.com',
      addressLine1: '45, Pharma Market, Kurla',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400070',
      creditDays: 30,
      creditLimit: 500000,
    },
  })

  // ── Demo Customers ───────────────────────────────────────────────────────
  await prisma.customer.upsert({
    where: { id: 'customer-demo-001' },
    update: {},
    create: {
      id: 'customer-demo-001',
      tenantId: tenant.id,
      name: 'Ramesh Kumar',
      phone: '+919123456789',
      email: 'ramesh@gmail.com',
      city: 'Mumbai',
      state: 'Maharashtra',
    },
  })

  console.info('✅ Seed complete!')
  console.info(`   Tenant: ${tenant.name} (${tenant.slug})`)
  console.info(`   Store:  ${store.name}`)
  console.info(`   Admin:  admin@rxflow.in / admin123`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
