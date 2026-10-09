# RxFlow — Pharmacy Management & Distribution Platform

[![CI](https://github.com/Udit013/RxFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/Udit013/RxFlow/actions/workflows/ci.yml)

> A modern, full-featured pharmacy ERP — inventory, tax-compliant billing, multi-store, accounts, payroll, and compliance. Built **India-first** to replace legacy tools like Marg, Tally, and Pharmarack, and configurable for **any country**: currency, tax system, formats, regulatory labels and language come from per-country profiles.

**Live demo:** [rx-flow-web.vercel.app](https://rx-flow-web.vercel.app) — click **Create account** to spin up your own pharmacy workspace.

> ⏳ The API runs on a free tier that sleeps after inactivity. A scheduled keep-warm ping normally keeps it awake; if it has slept, the first request can take up to ~50s (the app starts the wake-up as soon as any page opens and says so on screen). Subsequent requests are instant.

---

## What is RxFlow?

A cloud-native, multi-tenant pharmacy management system. Each signup creates an isolated pharmacy workspace with its own stores, staff, inventory, and books.

**Built for:** retail pharmacies · wholesale distributors · chain pharmacies · hospitals · clinics · suppliers — in India and worldwide (bundled profiles: India, United States, United Kingdom, UAE, plus a configurable international profile).

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
- Medicine master catalog with composition, substitutes, schedules, HSN, GST — a shared catalog with **per-pharmacy copy-on-write**: editing a shared medicine saves your pharmacy's own copy and never changes anyone else's
- **Category management** and fuzzy medicine search / normalization (Pharmarack-style)

### Stakeholders
- **Customers** — registration, purchase history, credit/dues, ledger, B2B GSTIN, refill suggestions
- **Suppliers** — registration, ledger, payment tracking, dues, license-expiry tracking
- **Sales reps** — commission tracking (percentage + flat bonus), monthly settlement
- **Staff & Payroll (HR)** — employees, attendance grid, monthly payroll from salary + attendance, performance, employee↔login linking
- **Stores** — multi-branch CRUD

### Finance & compliance
- **GST invoicing** — CGST/SGST/IGST, inter-state IGST routing, bill-level special discounts and transport charges carried onto the invoice, round-off; one invoice per order (idempotent) and overpayment protection
- **GST reports** — GSTR-1 (B2B/B2C + CDNR/CDNUR), GSTR-3B, sales/purchase registers
- **Accounts** — expense/income tracking, **Profit & Loss**, cash-flow statement
- **Compliance** — Schedule H/H1/X register, drug-license expiry alerts
- **Reports** — stock valuation, PDF + **Excel (.xlsx)** + CSV export

### Global by configuration
- **Per-country profiles** (`packages/regional`) — currency, locale, timezone, fiscal year, tax engine, field labels & validation (GSTIN / VAT no. / EIN / TRN, PIN / ZIP / postcode), drug-classification labels, controlled-drug register, payment methods
- **Tax engines** — India GST (CGST+SGST / IGST), VAT, US sales tax, or none; India keeps GSTR-1/3B, every country gets a tax summary report
- **Local time** — "today", monthly reports and fiscal-year document numbering follow the pharmacy's timezone and fiscal year
- **Per-market catalogs** — shared medicines are scoped to the pharmacy's country
- **Languages** — app shell in English, Hindi and Spanish; untranslated text falls back to English
- **Settings → Region & Tax** with a live preview; existing pharmacies default to India and behave exactly as before

### Platform
- **Auth** — email/password (bcrypt) or email OTP; short-lived access token in memory + rotating refresh token in an **httpOnly cookie**, with per-device sessions (sign out one device or all); self-serve signup
- **Role-based access** — one permission matrix (Admin, Store Manager, Pharmacist, Sales Rep, Accountant, Delivery Staff, Viewer) enforced by the API and reflected in the navigation
- **Live multi-device sync** — SSE push so the counter PC, a tablet, and a phone stay in sync in real time
- **Notification center** + persistent unread state
- **Cmd+K global search** across every entity
- **Audit log** — who did what, when, from which device
- **Backup & import** — full JSON export (optionally AES-256-GCM encrypted in the browser), restore, and CSV import from other apps
- **LAN mode** — run on one machine, access from devices on the same network
- **Responsive & accessible UI** — mobile drawer navigation, horizontally scrollable tables, keyboard and screen-reader support, branded loading screen

---

## Architecture

```
rxflow/                         ← Monorepo (pnpm workspaces + Turborepo)
├── apps/
│   ├── api/                    ← Fastify backend (Node + TypeScript, run via tsx)
│   └── web/                    ← Next.js 14 frontend (App Router)
├── packages/
│   ├── db/                     ← Prisma ORM + PostgreSQL schema
│   ├── types/                  ← Shared TypeScript types + role matrix
│   ├── regional/               ← Country profiles, tax engines, time & format helpers
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
| Auth | JWT access token (memory) + rotating refresh token (httpOnly cookie, per-device sessions), bcrypt |
| Search | Fuse.js (in-memory) with optional Meilisearch |
| Exports | jsPDF (invoices), SheetJS (Excel), papaparse (CSV) |
| Testing | Vitest — money math, invoice GST, document numbering, auth middleware + role matrix, catalog copy-on-write, session hashing, and distributor CSV parsers (pinned to real invoice rows) |
| CI | GitHub Actions — typecheck + tests + production build on every push/PR |
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

### Tests

```bash
pnpm test          # run the unit suite (Vitest)
pnpm test:watch    # watch mode
```

82 tests covering the money- and security-critical logic: the regional tax engines, timezone/fiscal-year boundaries (incl. daylight saving) and per-country validation, collision-safe document numbering, GST/VAT/sales-tax/discount/commission and invoice arithmetic, the auth middleware and role matrix, medicine copy-on-write, refresh-token hashing, and the multi-distributor CSV parsers — the parser tests are pinned to verbatim rows from real supplier invoices, so a config regression can't silently break an import format.

---

## API overview

All routes are prefixed with `/api/v1`. Interactive docs at `/docs`. Every protected route checks the caller's role against the shared permission matrix (`packages/types` → `canAccess`). The web app reaches `/api/v1/auth/*` through its own origin (a Next.js rewrite), so the session cookie is first-party.

| Area | Sample endpoints |
|------|------------------|
| Auth | `POST /auth/login` · `POST /auth/register` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` |
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

## Security model

- **Tenant isolation** — every query is scoped to the caller's pharmacy, and IDs sent in requests (stores, customers, suppliers, batches, medicines) are verified to belong to it.
- **Sessions** — the 15-minute access token lives only in memory; the 7-day refresh token is an httpOnly, `SameSite=Strict` cookie, rotated on every use and stored only as a SHA-256 hash. Each device has its own session.
- **Authorization** — one role matrix decides who can read or change what; viewers are read-only, and unlisted write endpoints are restricted to managers by default.
- **Abuse protection** — per-route rate limits on auth endpoints, constant-time login responses, single-use 6-digit OTPs with a 5-attempt cap.

See [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md) (Section 5) for the full design.

---

## India-specific compliance (the India profile)

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

The schema source of truth is `packages/db/prisma/schema.prisma`. After editing it, run `prisma generate` + `prisma db push`, and for production add an idempotent SQL file to `packages/db/prisma/manual-migrations/` and list it in `IDEMPOTENT` — the Render build (`packages/db/scripts/deploy-db.sh`) applies every listed file on each deploy.

To support a new country, add a profile under `packages/regional/src/profiles/` — see [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md), Section 20.

For the complete technical handbook — architecture, data model, auth, business logic, and deployment — see [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md).

---

## Roadmap

- Verified email sending domain (OTP / password reset currently use the Resend sandbox)
- Per-store permissions on top of the role matrix
- Loyalty points
- Wholesale tier pricing
- Mobile apps (Expo) + desktop (Tauri)
- e-Invoicing (IRN) + e-Way bill via NIC APIs
- Redis-backed pub/sub for multi-instance live sync

---

*Built by Udit · RxFlow © 2026*
