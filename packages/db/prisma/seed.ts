import { PrismaClient, TenantType, UserRole, DrugSchedule, DosageForm, SubscriptionPlan } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

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

  // ── Manufacturers ────────────────────────────────────────────────────────
  const manufacturers = await Promise.all([
    prisma.manufacturer.upsert({
      where: { name: 'Micro Labs Limited' },
      update: {},
      create: { name: 'Micro Labs Limited', aliases: ['Micro Labs', 'Microlabs'], country: 'India' },
    }),
    prisma.manufacturer.upsert({
      where: { name: 'Sun Pharmaceutical Industries' },
      update: {},
      create: { name: 'Sun Pharmaceutical Industries', aliases: ['Sun Pharma', 'Sun Pharmaceuticals'], country: 'India' },
    }),
    prisma.manufacturer.upsert({
      where: { name: 'Cipla Limited' },
      update: {},
      create: { name: 'Cipla Limited', aliases: ['Cipla'], country: 'India' },
    }),
    prisma.manufacturer.upsert({
      where: { name: 'Abbott Healthcare' },
      update: {},
      create: { name: 'Abbott Healthcare', aliases: ['Abbott', 'Abbott India'], country: 'India' },
    }),
    prisma.manufacturer.upsert({
      where: { name: 'GSK Pharmaceuticals' },
      update: {},
      create: { name: 'GSK Pharmaceuticals', aliases: ['GSK', 'GlaxoSmithKline'], country: 'India' },
    }),
  ])

  // ── Seed Medicines ───────────────────────────────────────────────────────
  const medicines = [
    {
      name: 'Dolo 650',
      genericName: 'Paracetamol',
      brandName: 'Dolo',
      manufacturerName: 'Micro Labs Limited',
      manufacturerId: manufacturers[0].id,
      dosageForm: DosageForm.TABLET,
      strength: '650mg',
      strengthNumeric: 650,
      strengthUnit: 'mg',
      packSize: '15 Tablets',
      packSizeNumeric: 15,
      packUnit: 'tablets',
      mrp: 30.0,
      hsn: '30049099',
      gstRate: 12,
      schedule: DrugSchedule.OTC,
      requiresPrescription: false,
      aliases: ['Dolo650', 'Dolo 650mg', 'Paracetamol 650', 'Para 650', 'D650'],
      barcodes: ['8901234567890'],
      searchTokens: ['dolo', 'paracetamol', '650', 'fever', 'pain', 'analgesic'],
    },
    {
      name: 'Crocin 500',
      genericName: 'Paracetamol',
      brandName: 'Crocin',
      manufacturerName: 'GSK Pharmaceuticals',
      manufacturerId: manufacturers[4].id,
      dosageForm: DosageForm.TABLET,
      strength: '500mg',
      strengthNumeric: 500,
      strengthUnit: 'mg',
      packSize: '10 Tablets',
      packSizeNumeric: 10,
      packUnit: 'tablets',
      mrp: 14.0,
      hsn: '30049099',
      gstRate: 12,
      schedule: DrugSchedule.OTC,
      requiresPrescription: false,
      aliases: ['Crocin500', 'Crocin Advance', 'Para 500'],
      barcodes: ['8901234567891'],
      searchTokens: ['crocin', 'paracetamol', '500', 'fever', 'pain'],
    },
    {
      name: 'Azithral 500',
      genericName: 'Azithromycin',
      brandName: 'Azithral',
      manufacturerName: 'Alembic Pharmaceuticals',
      manufacturerName2: 'Alembic',
      dosageForm: DosageForm.TABLET,
      strength: '500mg',
      strengthNumeric: 500,
      strengthUnit: 'mg',
      packSize: '3 Tablets',
      packSizeNumeric: 3,
      packUnit: 'tablets',
      mrp: 89.0,
      hsn: '30041020',
      gstRate: 12,
      schedule: DrugSchedule.SCHEDULE_H,
      requiresPrescription: true,
      aliases: ['Azithral500', 'Azithromycin 500', 'Azee 500', 'Zithromax'],
      barcodes: ['8901234567892'],
      searchTokens: ['azithral', 'azithromycin', '500', 'antibiotic'],
    },
    {
      name: 'Pantop 40',
      genericName: 'Pantoprazole',
      brandName: 'Pantop',
      manufacturerName: 'Sun Pharmaceutical Industries',
      manufacturerId: manufacturers[1].id,
      dosageForm: DosageForm.TABLET,
      strength: '40mg',
      strengthNumeric: 40,
      strengthUnit: 'mg',
      packSize: '10 Tablets',
      packSizeNumeric: 10,
      packUnit: 'tablets',
      mrp: 56.0,
      hsn: '30049099',
      gstRate: 12,
      schedule: DrugSchedule.SCHEDULE_H,
      requiresPrescription: true,
      aliases: ['Pantop40', 'Pantoprazole 40', 'Pan 40', 'Pantocid 40'],
      barcodes: ['8901234567893'],
      searchTokens: ['pantop', 'pantoprazole', '40', 'acid', 'reflux', 'ppi'],
    },
    {
      name: 'Asthalin Inhaler',
      genericName: 'Salbutamol',
      brandName: 'Asthalin',
      manufacturerName: 'Cipla Limited',
      manufacturerId: manufacturers[2].id,
      dosageForm: DosageForm.INHALER,
      strength: '100mcg',
      strengthNumeric: 100,
      strengthUnit: 'mcg',
      packSize: '200 MDI',
      packSizeNumeric: 200,
      packUnit: 'doses',
      mrp: 128.0,
      hsn: '30049099',
      gstRate: 12,
      schedule: DrugSchedule.SCHEDULE_H,
      requiresPrescription: true,
      aliases: ['Asthalin', 'Salbutamol Inhaler', 'Ventolin', 'Albuterol'],
      barcodes: ['8901234567894'],
      searchTokens: ['asthalin', 'salbutamol', 'inhaler', 'asthma', 'bronchodilator'],
    },
    {
      name: 'Metformin 500',
      genericName: 'Metformin Hydrochloride',
      brandName: 'Glycomet',
      manufacturerName: 'USV Limited',
      manufacturerName2: 'USV',
      dosageForm: DosageForm.TABLET,
      strength: '500mg',
      strengthNumeric: 500,
      strengthUnit: 'mg',
      packSize: '20 Tablets',
      packSizeNumeric: 20,
      packUnit: 'tablets',
      mrp: 38.0,
      hsn: '30049099',
      gstRate: 12,
      schedule: DrugSchedule.SCHEDULE_H,
      requiresPrescription: true,
      aliases: ['Glycomet 500', 'Metformin', 'Glucophage', 'Obimet'],
      barcodes: ['8901234567895'],
      searchTokens: ['metformin', 'glycomet', '500', 'diabetes', 'sugar', 'antidiabetic'],
    },
    {
      name: 'Amoxicillin 500',
      genericName: 'Amoxicillin',
      brandName: 'Mox',
      manufacturerName: 'Cipla Limited',
      manufacturerId: manufacturers[2].id,
      dosageForm: DosageForm.CAPSULE,
      strength: '500mg',
      strengthNumeric: 500,
      strengthUnit: 'mg',
      packSize: '10 Capsules',
      packSizeNumeric: 10,
      packUnit: 'capsules',
      mrp: 95.0,
      hsn: '30041020',
      gstRate: 12,
      schedule: DrugSchedule.SCHEDULE_H,
      requiresPrescription: true,
      aliases: ['Mox 500', 'Amoxicillin', 'Amoxil', 'Novamox'],
      barcodes: ['8901234567896'],
      searchTokens: ['amoxicillin', 'mox', '500', 'antibiotic', 'penicillin'],
    },
    {
      name: 'Atorvastatin 10',
      genericName: 'Atorvastatin',
      brandName: 'Atorfit',
      manufacturerName: 'Sun Pharmaceutical Industries',
      manufacturerId: manufacturers[1].id,
      dosageForm: DosageForm.TABLET,
      strength: '10mg',
      strengthNumeric: 10,
      strengthUnit: 'mg',
      packSize: '10 Tablets',
      packSizeNumeric: 10,
      packUnit: 'tablets',
      mrp: 72.0,
      hsn: '30049099',
      gstRate: 12,
      schedule: DrugSchedule.SCHEDULE_H,
      requiresPrescription: true,
      aliases: ['Atorvastatin 10', 'Atorfit 10', 'Lipitor', 'Tonact'],
      barcodes: ['8901234567897'],
      searchTokens: ['atorvastatin', 'atorfit', '10', 'cholesterol', 'statin', 'lipid'],
    },
    {
      name: 'Azithromycin 500',
      genericName: 'Azithromycin',
      brandName: 'Azithral',
      manufacturerName: 'Sun Pharmaceutical Industries',
      manufacturerId: manufacturers[1].id,
      dosageForm: DosageForm.TABLET,
      strength: '500mg',
      strengthNumeric: 500,
      strengthUnit: 'mg',
      packSize: '5 Tablets',
      packSizeNumeric: 5,
      packUnit: 'tablets',
      mrp: 105.0,
      hsn: '30042090',
      gstRate: 12,
      schedule: DrugSchedule.SCHEDULE_H,
      requiresPrescription: true,
      aliases: ['Azithromycin 500', 'Azithral 500', 'Azee 500', 'Azax', 'AZ 500'],
      barcodes: ['8901234567898'],
      searchTokens: ['azithromycin', 'azithral', 'azee', '500', 'antibiotic', 'macrolide'],
    },
    {
      name: 'Pan-D 40',
      genericName: 'Pantoprazole + Domperidone',
      brandName: 'Pan-D',
      manufacturerName: 'Alkem Laboratories',
      manufacturerId: manufacturers[2].id,
      dosageForm: DosageForm.CAPSULE,
      strength: '40mg',
      strengthNumeric: 40,
      strengthUnit: 'mg',
      packSize: '15 Capsules',
      packSizeNumeric: 15,
      packUnit: 'capsules',
      mrp: 215.0,
      hsn: '30049099',
      gstRate: 12,
      schedule: DrugSchedule.SCHEDULE_H,
      requiresPrescription: true,
      aliases: ['Pan-D 40', 'Pan D', 'PanD', 'Pantoprazole Domperidone'],
      barcodes: ['8901234567899'],
      searchTokens: ['pantoprazole', 'domperidone', 'pan-d', 'pand', '40', 'acidity', 'ppi'],
    },
  ]

  for (const med of medicines) {
    const existing = await prisma.medicine.findFirst({ where: { name: med.name } })
    if (!existing) {
      await prisma.medicine.create({
        data: {
          name: med.name,
          genericName: med.genericName,
          brandName: med.brandName,
          manufacturerName: med.manufacturerName,
          manufacturerId: med.manufacturerId,
          dosageForm: med.dosageForm,
          strength: med.strength,
          strengthNumeric: med.strengthNumeric,
          strengthUnit: med.strengthUnit,
          packSize: med.packSize,
          packSizeNumeric: med.packSizeNumeric,
          packUnit: med.packUnit,
          mrp: med.mrp,
          hsn: med.hsn,
          gstRate: med.gstRate,
          schedule: med.schedule,
          requiresPrescription: med.requiresPrescription,
          aliases: med.aliases,
          barcodes: med.barcodes,
          searchTokens: med.searchTokens,
          isVerified: true,
        },
      })
    }
  }

  // ── Demo Supplier ────────────────────────────────────────────────────────
  const supplier = await prisma.supplier.upsert({
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
  console.info(`   Medicines seeded: ${medicines.length}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
