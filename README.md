# RxFlow — Connected Pharma Distribution Network

> Modern pharmacy management, AI-powered medicine intelligence, and medicine distribution — built for Indian pharma.

---

## What is RxFlow?

RxFlow is a cloud-native, AI-assisted pharmacy management and medicine distribution platform designed to replace legacy tools like Marg ERP, Tally, and Pharmarack with a modern, fast, mobile-first system.

**Who it's for:**
- Retail pharmacies
- Wholesale distributors
- Chain pharmacies
- Hospitals & clinics
- Pharma suppliers

---

## Architecture

```
rxflow/                         ← Monorepo (pnpm workspaces + Turborepo)
├── apps/
│   ├── api/                    ← Fastify backend (Node.js + TypeScript)
│   └── web/                    ← Next.js 14 frontend (App Router)
├── packages/
│   ├── db/                     ← Prisma ORM + PostgreSQL schema
│   ├── types/                  ← Shared TypeScript types
│   ├── medicine-intelligence/  ← Pharmarack-like medicine engine
│   └── ui/                     ← Shared UI components
├── docker-compose.yml          ← PostgreSQL, Meilisearch, Redis, MinIO
└── scripts/setup.sh            ← One-command setup
```

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Backend** | Fastify + TypeScript | Fast, schema-first, great DX |
| **Frontend** | Next.js 14 (App Router) | SSR + RSC + great ecosystem |
| **Database** | PostgreSQL + Prisma | Relational, multi-tenant, type-safe |
| **Search** | Meilisearch + Fuse.js | Typo-tolerant, offline fallback |
| **State** | Zustand + React Query | Minimal, fast, server sync |
| **Styling** | Tailwind CSS | Rapid UI development |
| **Auth** | JWT (access + refresh) | Stateless, scalable |
| **Build** | Turborepo + pnpm | Monorepo with smart caching |

---

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm 9+
- Docker Desktop

### Setup (one command)

```bash
git clone <repo>
cd rxflow
bash scripts/setup.sh
```

### Manual setup

```bash
# 1. Install dependencies
pnpm install

# 2. Start infrastructure
docker compose up -d postgres meilisearch redis

# 3. Setup API environment
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env and set JWT secrets

# 4. Setup frontend environment
cp apps/web/.env.local.example apps/web/.env.local

# 5. Run database migrations
cd packages/db
npx prisma migrate dev --name init
npx ts-node --esm prisma/seed.ts
cd ../..

# 6. Start development
pnpm dev
```

### Access

| Service | URL |
|---------|-----|
| Web App | http://localhost:3000 |
| API | http://localhost:3001 |
| API Docs | http://localhost:3001/docs |
| Meilisearch | http://localhost:7700 |
| MinIO Console | http://localhost:9001 |

**Demo credentials:** `admin@rxflow.in` / `admin123`

---

## API Overview

All endpoints prefixed with `/api/v1`

| Resource | Endpoints |
|----------|-----------|
| Auth | `POST /auth/login` `POST /auth/register` `POST /auth/refresh` `GET /auth/me` |
| Dashboard | `GET /dashboard` `GET /dashboard/analytics/sales` |
| Medicines | `GET /medicines` `GET /medicines/:id` `POST /medicines` `GET /medicines/barcode/:barcode` |
| Medicine Intelligence | `POST /medicine-intelligence/search` `POST /medicine-intelligence/normalize` `POST /medicine-intelligence/extract` |
| Inventory | `GET /inventory` `POST /inventory/batches` `GET /inventory/alerts/low-stock` `GET /inventory/alerts/expiry` |
| Orders | `GET /orders` `POST /orders` `GET /orders/:id` `PATCH /orders/:id/status` |
| Invoices | `GET /invoices` `POST /invoices/from-order/:orderId` `POST /invoices/:id/payment` |
| Suppliers | `GET /suppliers` `POST /suppliers` `GET /suppliers/:id/ledger` |
| Customers | `GET /customers` `POST /customers` `GET /customers/:id/purchase-history` |

Full interactive docs at: http://localhost:3001/docs

---

## Medicine Intelligence Engine

The core differentiator — a Pharmarack-like medicine normalization and matching system.

### How it works

```
Input: "Dolo650"
       ↓
Normalizer → { brand: "Dolo", strength: "650mg", form: "TABLET" }
       ↓
Multi-strategy matching:
  1. Exact match       → "Dolo 650" (score: 1.0)
  2. Alias match       → "Dolo650", "Para 650" (score: 0.95)
  3. Barcode match     → EAN lookup (score: 1.0)
  4. Fuzzy match       → Fuse.js typo-tolerant (score: 0.85)
  5. Composition match → Paracetamol 650 (score: 0.75)
  6. Token match       → token overlap (score: 0.65)
       ↓
Ranked results with confidence scores
```

### Meilisearch integration (production)

When Meilisearch is running, full-text search with:
- Typo tolerance
- Pharmaceutical synonyms ("paracetamol" ↔ "acetaminophen" ↔ "pcm")
- Composition-level indexing
- Auto-highlighting

Gracefully falls back to in-memory Fuse.js when Meilisearch is unavailable.

---

## Database Schema

Key tables:
- `Tenant` — Multi-tenant root (one per pharmacy/distributor)
- `Store` — Physical branches per tenant
- `Medicine` — Master medicine catalog (shared)
- `MedicineComposition` — Ingredient breakdown
- `MedicineSubstitute` — Substitute/generic mappings
- `InventoryItem` — Per-store stock levels
- `Batch` — Individual stock batches with expiry dates
- `Order` — Sales and purchase orders
- `Invoice` — GST-compliant invoices (CGST/SGST/IGST)
- `Customer` + `Supplier` — Stakeholder management
- `LedgerEntry` — Double-entry bookkeeping
- `Prescription` — Digital prescription storage
- `AuditLog` — Full audit trail

---

## Features (MVP)

### ✅ Implemented
- Multi-tenant architecture
- JWT auth with refresh tokens
- Medicine master catalog
- Fuzzy medicine search with normalization
- Inventory tracking with batch management
- Expiry date monitoring
- Low stock alerts
- Sales & purchase orders
- GST invoice generation (CGST/SGST/IGST)
- Payment recording
- Customer & supplier management
- Ledger / outstanding balance tracking
- Dashboard with charts
- Role-based access control

### 🔜 Next (Phase 2)
- Prescription upload + OCR
- WhatsApp order notifications
- Barcode scanning (mobile)
- Meilisearch full-text indexing API
- E-invoicing (IRN generation)
- Purchase order with GRN
- Credit/debit notes
- Multi-store transfer
- Sales rep tracking

### 🚀 Future (Phase 3+)
- React Native mobile app
- AI reorder suggestions
- Demand forecasting
- B2B marketplace
- Distributor portal
- API ecosystem
- US expansion (NDC, HIPAA)

---

## India-Specific Compliance

- **GST**: CGST/SGST/IGST breakdown on all invoices
- **HSN codes**: Stored per medicine (30049099 etc.)
- **Drug license**: Tracked per tenant and store
- **Schedule H/H1/X**: Enforced — prescription required flag
- **E-invoicing**: IRN field ready, integration point prepared
- **UPI**: Payment method supported in schema

---

## Development Workflow

```bash
# Start all services
pnpm dev

# Database operations
pnpm db:studio          # Prisma Studio GUI
pnpm db:migrate         # Run new migrations
pnpm db:seed            # Reseed demo data

# Type checking
pnpm type-check

# Linting
pnpm lint
```

---

## Deployment

### Recommended stack (low cost, scalable)

| Service | Provider | Cost |
|---------|----------|------|
| Database | Neon.tech or Supabase | Free tier → $25/mo |
| API hosting | Railway or Render | Free tier → $10/mo |
| Frontend | Vercel | Free tier |
| Search | Meilisearch Cloud | $30/mo OR self-hosted |
| Storage | Cloudflare R2 | Free tier 10GB |
| **Total MVP** | | **~$0 → $65/mo** |

### Production checklist
- [ ] Change JWT secrets
- [ ] Enable SSL/HTTPS
- [ ] Set `NODE_ENV=production`
- [ ] Enable database connection pooling (PgBouncer)
- [ ] Configure proper CORS origins
- [ ] Set up log aggregation (Axiom / Betterstack)
- [ ] Configure error monitoring (Sentry)
- [ ] Enable database backups
- [ ] Set rate limits appropriately

---

## Contributing

This is currently a solo-founder project. Structure is optimized for:
1. Fast AI-assisted development (Claude, Cursor)
2. Easy onboarding of first hires
3. Clear module boundaries for eventual microservices split

---

*Built by Udit · RxFlow © 2026*
