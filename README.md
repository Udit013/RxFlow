# RxFlow — Pharmacy Management & Distribution Platform

> A modern, full-featured pharmacy ERP for the Indian market — inventory, GST billing, multi-store, accounts, payroll, and compliance — built to replace legacy tools like Marg, Tally, and Pharmarack.

**Live demo:** [rx-flow-web.vercel.app](https://rx-flow-web.vercel.app) — click **Create account** to spin up your own pharmacy workspace.

> ⏳ The API runs on a free tier that sleeps after inactivity, so the **first** request after a while can take ~50s to wake. Subsequent requests are instant.

---

## What is RxFlow?

A cloud-native, multi-tenant pharmacy management system. Each signup creates an isolated pharmacy workspace with its own stores, staff, inventory, and books.

**Built for:** retail pharmacies · wholesale distributors · chain pharmacies · hospitals · clinics · suppliers.

---

## Feature overview

### Operations
- **Inventory** — per-store stock, batch tracking, expiry monitoring, barcode, rack/shelf location, min-stock alerts, CSV export, valuation
- **POS / Billing** — fast retail billing, barcode, discounts, multiple payment modes, park/recall sales, thermal 80mm receipt, A4 GST invoice PDF, WhatsApp share
- **Purchases** — purchase entry, bulk **CSV import** (with per-supplier column presets + fuzzy medicine matching), pending tracking, history
- **Stock takes** — physical count with autosave, variance, one-shot reconciliation
- **Stock transfers** — move stock between stores with full audit trail
- **Returns** — customer credit notes *and* dedicated supplier purchase-returns (debit notes), both adjust stock + ledgers

### Catalog
- Medicine master catalog with composition, substitutes, schedules, HSN, GST
- **Category management** and fuzzy medicine search / normalization (Pharmarack-style)

### Stakeholders
- **Customers** — registration, purchase history, credit/dues, ledger, B2B GSTIN, refill suggestions
- **Suppliers** — registration, ledger, payment tracking, dues, license-expiry tracking
- **Sales reps** — commission tracking (percentage + flat bonus), monthly settlement
- **Staff & Payroll (HR)** — employees, attendance grid, monthly payroll from salary + attendance, performance, employee↔login linking
- **Stores** — multi-branch CRUD

### Finance & compliance
- **GST invoicing** — CGST/SGST/IGST, inter-state IGST routing, round-off
- **GST reports** — GSTR-1 (B2B/B2C + CDNR/CDNUR), GSTR-3B, sales/purchase registers
- **Accounts** — expense/income tracking, **Profit & Loss**, cash-flow statement
- **Compliance** — Schedule H/H1/X register, drug-license expiry alerts
- **Reports** — stock valuation, PDF + **Excel (.xlsx)** + CSV export

### Platform
- **Auth** — email/password (bcrypt) + JWT access/refresh, role-based access (Admin, Store Manager, Pharmacist, Sales Rep, Accountant, etc.), self-serve signup
- **Live multi-device sync** — SSE push so the counter PC, a tablet, and a phone stay in sync in real time
- **Notification center** + persistent unread state
- **Cmd+K global search** across every entity
- **Audit log** — who did what, when, from which device
- **Backup & import** — full JSON export (optionally AES-256 encrypted), restore, and CSV import from other apps
- **LAN mode** — run on one machine, access from devices on the same network

---

## Architecture

```
rxflow/                         ← Monorepo (pnpm workspaces + Turborepo)
├── apps/
│   ├── api/                    ← Fastify backend (Node + TypeScript, run via tsx)
│   └── web/                    ← Next.js 14 frontend (App Router)
├── packages/
│   ├── db/                     ← Prisma ORM + PostgreSQL schema
│   ├── types/                  ← Shared TypeScript types
│   └── medicine-intelligence/  ← Medicine normalization + fuzzy matching
├── render.yaml                 ← Render blueprint (API)
├── DEPLOYMENT.md               ← Full free-tier deploy guide
└── docker-compose.yml          ← Local Postgres / Redis / Meilisearch
```

### Tech stack

| Layer | Technology |
|-------|-----------|
| Backend | Fastify + TypeScript (SSE for live sync) |
| Frontend | Next.js 14 (App Router) + Tailwind + GSAP |
| Database | PostgreSQL + Prisma |
| State | React Query + Zustand |
| Auth | JWT (access + refresh), bcrypt |
| Search | Fuse.js (in-memory) with optional Meilisearch |
| Exports | jsPDF (invoices), SheetJS (Excel), papaparse (CSV) |
| Build | Turborepo + pnpm |

### Production hosting (all free tier)

| Layer | Service |
|-------|---------|
| Frontend | **Vercel** |
| API | **Render** (free web service) |
| Database | **Neon** (serverless Postgres) |

See [DEPLOYMENT.md](DEPLOYMENT.md) for the complete step-by-step guide, including the pooled-vs-direct Neon connection gotcha.

---

## Quick start (local)

### Prerequisites
- Node.js 20+ · pnpm 9+ · Docker Desktop

### Setup
```bash
pnpm install

# Start local infrastructure (Postgres + Redis)
docker compose up -d postgres redis

# Env files
cp apps/api/.env.example apps/api/.env          # set JWT secrets, DATABASE_URL, DIRECT_URL
cp apps/web/.env.local.example apps/web/.env.local

# Create the schema (the project uses prisma db push, not migrate)
cd packages/db && pnpm exec prisma generate && pnpm exec prisma db push && cd ../..

# (optional) seed sample medicines + a demo tenant
pnpm --filter @rxflow/api deploy:seed

# Run everything
pnpm dev
```

> **Note:** the schema is managed via `prisma db push` against `schema.prisma` (the source of truth). Historical hand-applied SQL lives in `packages/db/prisma/manual-migrations/` for reference. Set `DIRECT_URL` = `DATABASE_URL` for local dev.

### Access
| Service | URL |
|---------|-----|
| Web app | http://localhost:3000 |
| API | http://localhost:3001 |
| API docs (Swagger) | http://localhost:3001/docs |

Create your account from the **Create account** link on the login page.

---

## API overview

All routes are prefixed with `/api/v1`. Interactive docs at `/docs`.

| Area | Sample endpoints |
|------|------------------|
| Auth | `POST /auth/login` · `POST /auth/register` · `POST /auth/refresh` · `GET /auth/me` |
| Dashboard | `GET /dashboard` |
| Medicines | `GET /medicines` · `POST /medicines` · `GET /medicine-intelligence/search` |
| Categories | `GET/POST/PATCH/DELETE /categories` |
| Inventory | `GET /inventory` · `POST /inventory/batches` · `POST /inventory/batches/:id/write-off` · `GET /inventory/insights` · `GET /inventory/alerts/*` |
| Orders / Invoices | `POST /orders` · `POST /invoices/from-order/:id` · `POST /invoices/:id/credit-note` · `POST /invoices/:id/purchase-return` |
| Purchases | `POST /purchases/bulk-import` · `POST /purchases/match-medicines` |
| Stock | `POST /stock-takes` · `POST /stock-transfers` |
| Stakeholders | `/customers` · `/suppliers` · `/sales-reps` · `/hr/employees` · `/hr/attendance` · `/hr/payroll` |
| Finance | `/accounts/expenses` · `/accounts/profit-loss` · `/accounts/cash-flow` |
| Reports | `/reports/gstr1` · `/reports/gstr3b` · `/reports/stock-valuation` · `/reports/schedule-h1-register` · `/reports/license-expiry` |
| Platform | `/search` · `/events` (SSE) · `/audit-logs` · `/backup/export` · `/tenant/*` |

---

## Medicine Intelligence

A Pharmarack-style normalization + matching engine ([packages/medicine-intelligence](packages/medicine-intelligence)).

```
"Dolo650"
   ↓ normalize → { brand: "Dolo", strength: "650mg", form: "TABLET" }
   ↓ multi-strategy match: exact → alias → barcode → fuzzy → composition → token
   ↓ ranked results with confidence scores
```

Uses in-memory Fuse.js by default; plugs into Meilisearch for typo-tolerant full-text search when available.

---

## India-specific compliance

- **GST** — CGST/SGST/IGST on every invoice, inter-state IGST routing, GSTR-1/3B
- **HSN codes** per medicine
- **Schedule H/H1/X** register (CDSCO) + prescription-required enforcement
- **Drug license** tracking + expiry alerts (tenant + suppliers)
- **UPI / multi-mode** payments

---

## Development

```bash
pnpm dev                 # run api + web
pnpm --filter @rxflow/web exec tsc --noEmit   # type-check web
pnpm --filter @rxflow/api deploy:seed             # reseed demo data
```

The schema source of truth is `packages/db/prisma/schema.prisma`. After editing it, run `prisma generate` + `prisma db push`.

---

## Roadmap

- Email OTP / password reset (Resend)
- Loyalty points
- Wholesale tier pricing
- Mobile apps (Expo) + desktop (Tauri)
- e-Invoicing (IRN) + e-Way bill via NIC APIs
- Redis-backed pub/sub for multi-instance live sync

---

*Built by Udit · RxFlow © 2026*
