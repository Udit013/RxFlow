# RxFlow — Complete Technical Documentation

> A single, self-contained technical handbook for RxFlow: a multi-tenant pharmacy ERP built on Next.js, Fastify, and PostgreSQL (Prisma). Every section below is grounded in this repository's actual implementation — no invented features, no aspirational architecture.

---

## Table of Contents

1. [The Story: What Problem Does This Solve?](#1-the-story-what-problem-does-this-solve)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Folder Structure](#3-folder-structure)
4. [Database: Schema & Data Model](#4-database-schema--data-model)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Backend: API Layer](#6-backend-api-layer)
7. [Frontend: Pages, Components, State](#7-frontend-pages-components-state)
8. [Business Logic Deep Dives](#8-business-logic-deep-dives)
9. [Real-Time Sync (SSE)](#9-real-time-sync-sse)
10. [The Medicine-Intelligence Engine](#10-the-medicine-intelligence-engine)
11. [The CSV Import Architecture](#11-the-csv-import-architecture)
12. [Libraries & Why They Were Chosen](#12-libraries--why-they-were-chosen)
13. [Configuration Files Explained](#13-configuration-files-explained)
14. [Testing & CI](#14-testing--ci)
15. [Deployment Architecture](#15-deployment-architecture)
16. [User Action Traces (End-to-End Flows)](#16-user-action-traces-end-to-end-flows)
17. [Core Concepts Explained](#17-core-concepts-explained)
18. [Interview Preparation](#18-interview-preparation)
19. [Complete Walkthrough](#19-complete-walkthrough)

---

## 1. The Story: What Problem Does This Solve?

### 1.1 Meet the problem, before any code

Picture a neighborhood pharmacy in India. Every day, medicines arrive from distributors, get shelved, get sold to walk-in customers or to other medical shops in bulk, and eventually some of it expires, some gets returned, and all of it has to be accounted for at tax time. For decades this has run on paper ledgers or on old desktop software like **Marg** or **Tally**, one computer, one login, one copy of the truth sitting on a single hard drive.

That's fragile in ways that are easy to miss until they hurt:
- If the counter PC's hard drive dies, the shop's entire inventory and financial history can die with it.
- If the owner wants to check today's sales from home, they can't — the software only runs on that one machine.
- If two staff members serve customers at the same time, there's no shared, live view of what's actually left in stock.
- India's GST (Goods and Services Tax) regime requires itemized tax breakdowns (CGST/SGST for in-state sales, IGST for inter-state) and specific government-format returns (GSTR-1, GSTR-3B) — most legacy tools handle this clumsily or not at all.
- Medicines have **batches** and **expiry dates**. Selling from the wrong batch, or not noticing a batch is about to expire, is a compliance and financial risk pharmacies live with daily.

**RxFlow is a cloud-based, multi-tenant pharmacy ERP (Enterprise Resource Planning) system** that replaces that single-PC software with a real web application: the shop's data lives in a shared cloud database, any authorized device (a counter PC, a tablet, a phone) can see live stock levels and sales, and every business process a pharmacy actually runs — buying stock, selling stock, tracking expiries, managing GST, paying staff, reconciling accounts — is one connected system instead of a stack of spreadsheets and a legacy desktop app.

> **Definition — "multi-tenant":**
> **Simple:** Imagine one big apartment building where every family has their own locked apartment, but they all share the same building, the same front desk, and the same elevators. One codebase, one database, one deployment — but every pharmacy's data is invisible to every other pharmacy.
> **Technical:** A single running instance of the application serves multiple independent customers ("tenants"). Each tenant's data is logically isolated (in RxFlow's case, via a `tenantId` column present on nearly every database table, filtered on every query) even though it physically lives in the same PostgreSQL database as every other tenant's data.
> **In RxFlow:** Every signup creates a new `Tenant` row. Every subsequent query anywhere in the API includes `where: { tenantId: request.user.tenantId, ... }`, so Pharmacy A's stock, sales, and staff are never visible to Pharmacy B, even though both rows live in the same `Order` table.

### 1.2 Who is this built for?

- **Retail pharmacies** — a single storefront selling to walk-in customers, need POS billing, inventory, GST invoices.
- **Wholesale distributors** — sell in bulk to other pharmacies/hospitals, need credit terms, ledgers, salesman commission tracking.
- **Chain pharmacies** — multiple physical stores under one business, need per-store inventory with the ability to transfer stock between branches and see consolidated reporting.
- **Hospitals and clinics** — need prescription-linked dispensing and Schedule H/H1/X regulated-drug compliance tracking.
- Every one of these is represented as a `tenantType` on signup (`RETAIL_PHARMACY`, `WHOLESALE_DISTRIBUTOR`, `CHAIN_PHARMACY`, `HOSPITAL`, `CLINIC`, `SUPPLIER`), and the *same* underlying system serves all of them — the differences are in which modules a given business uses, not in separate codebases.

### 1.3 The story of a single day, told at a human level

Before any architecture diagram, here's what actually happens, narrated the way you'd explain it to someone who has never touched a computer:

1. **Morning — a distributor's van arrives** with a box of medicines and a paper invoice. The pharmacist opens RxFlow, goes to **New Purchase**, and either types in the invoice line by line or uploads the distributor's CSV (spreadsheet) file — RxFlow automatically figures out which of several known distributor formats the file is in and reads it correctly either way. Every medicine on that invoice gets a **batch number** and an **expiry date**, and the shop's stock count goes up.

2. **Midday — a customer walks in** and asks for a fever medicine. The pharmacist searches for it at the **Billing / POS** screen, RxFlow shows what's in stock (and which batch it'll sell from — usually the one expiring soonest, so nothing goes to waste), adds it to the bill, applies GST automatically based on the medicine's tax rate, and prints or shares a proper tax invoice. Stock goes down by exactly that amount, instantly, for every device connected to that pharmacy's account.

3. **Afternoon — a medical shop across town calls in a bulk order.** This is a business-to-business sale; a salesman handles the relationship and earns a commission on it. The pharmacist records the sale, picks the salesman from a list, and RxFlow calculates the commission automatically and keeps a running tally the salesman can be paid out against later.

4. **Evening — the owner checks the dashboard** from their phone: today's sales, what's low on stock and needs reordering, what's expiring in the next 30/60/90 days, and how much GST is currently owed to the government this month. None of this required calling the shop or being physically present at the counter PC.

5. **Month end — the accountant generates GSTR-1 and GSTR-3B** (the two government GST return formats) directly from RxFlow's recorded sales and purchases, instead of manually re-typing numbers from paper into a government portal template.

Every one of those five moments corresponds to real, working code in this repository — nothing above is aspirational. The rest of this document explains, layer by layer, exactly how each of those moments is implemented.

#### 💬 Interview Questions — Section 1

**Beginner**
- *What kind of product is RxFlow, in one sentence?* A cloud-based, multi-tenant ERP (inventory + billing + accounting + payroll) for pharmacies, replacing single-PC legacy tools like Marg/Tally.
- *What does "multi-tenant" mean, and why does it matter here?* One deployment, one database, serving many independent pharmacies whose data must never be visible to each other — see the apartment-building analogy above.

**Intermediate**
- *Why would a pharmacy switch from a desktop tool to something like this?* Multi-device/multi-user real-time access, no single point of hardware failure, built-in GST compliance, and audit trails — none of which a single-PC desktop app can offer without heavy custom work.
- *Name three different business types this serves and one feature each cares about disproportionately.* Retail (fast POS billing), Wholesale Distributor (credit terms + salesman commission), Chain Pharmacy (inter-store stock transfers + consolidated reporting).

**Advanced**
- *If you had to justify multi-tenancy via a shared schema (one database, a `tenantId` column) versus one database per tenant, what's the real trade-off, and which did this project choose?* Shared schema is cheaper to operate and simpler to migrate (one schema change touches every tenant at once), but isolation is enforced by application code, not the database — a missing `tenantId` filter is a real leak vector. Database-per-tenant gets you hard isolation at the infrastructure level but multiplies operational and migration complexity. This project chose shared-schema deliberately for a solo-built system without a compliance mandate forcing the heavier isolation model — full reasoning is in [Section 5](#5-authentication--authorization).

---

## 2. High-Level Architecture

### 2.1 The shape of the system

RxFlow is a **monorepo** (one Git repository containing multiple independently-deployable projects that share code) managed with **pnpm workspaces** and **Turborepo**. It has exactly three moving parts in production:

| Layer | Technology | Hosted on |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind | Vercel |
| Backend API | Fastify (Node.js) + TypeScript, run via `tsx` | Render (free web service) |
| Database | PostgreSQL, accessed through Prisma ORM | Neon (serverless Postgres) |

> **Definition — "monorepo":**
> **Simple:** Instead of three separate toolboxes for three separate jobs, you keep every tool in one big shared toolbox, and every job pulls out exactly the tools it needs.
> **Technical:** A single version-controlled repository containing multiple packages/apps (here: `apps/api`, `apps/web`, and several `packages/*` libraries) that can import from each other directly as workspace dependencies, with a shared build/lint/test pipeline (Turborepo) orchestrating all of them together.
> **In RxFlow:** `apps/api` and `apps/web` both import types and the Prisma client from `packages/db` and `packages/types` — a change to the database schema is felt as a compile error in both the API and (via shared types) the frontend, instead of two codebases silently drifting apart.

### 2.2 ASCII Architecture Diagram

```text
                              ┌─────────────────────────┐
                              │        Browser          │
                              │  (desktop / tablet /    │
                              │   phone — any device)    │
                              └────────────┬─────────────┘
                                           │  HTTPS
                                           ▼
                       ┌───────────────────────────────────────┐
                       │     Frontend — Next.js 14 (Vercel)     │
                       │  App Router pages, React components,   │
                       │  React Query for server-state caching  │
                       └───────────────┬─────────────┬──────────┘
                                       │             │
                        REST (axios)   │             │  SSE (EventSource,
                        JSON over HTTPS│             │  one-way live push)
                                       ▼             ▼
                       ┌───────────────────────────────────────┐
                       │   Backend API — Fastify (Render)       │
                       │  ┌─────────────────────────────────┐  │
                       │  │  Plugins: helmet, cors,          │  │
                       │  │  rate-limit, @fastify/jwt,       │  │
                       │  │  swagger docs                    │  │
                       │  └─────────────────────────────────┘  │
                       │  ┌─────────────────────────────────┐  │
                       │  │  ~28 route files (one per        │  │
                       │  │  domain: orders, inventory,       │  │
                       │  │  medicines, suppliers, HR, ...)  │  │
                       │  └─────────────────────────────────┘  │
                       │  ┌─────────────────────────────────┐  │
                       │  │  Business logic utils:           │  │
                       │  │  order-math, financial-year,     │  │
                       │  │  audit logging, email (Resend)   │  │
                       │  └─────────────────────────────────┘  │
                       └───────────┬─────────────────┬──────────┘
                                   │                  │
                     Prisma Client │                  │ SMTP-over-API
                                   ▼                  ▼
                       ┌───────────────────┐   ┌─────────────────┐
                       │  PostgreSQL (Neon) │   │  Resend (email)  │
                       │  pooled connection │   │  OTP / password   │
                       │  for runtime,       │   │  reset delivery   │
                       │  direct connection  │   └─────────────────┘
                       │  for schema changes │
                       └───────────────────┘

              (Shared code, imported by BOTH the API and the frontend)
        ┌────────────────────────────────────────────────────────────┐
        │  packages/db     — Prisma schema + generated client         │
        │  packages/types  — shared TypeScript types (JwtPayload, …)  │
        │  packages/medicine-intelligence — fuzzy medicine matching    │
        └────────────────────────────────────────────────────────────┘
```

### 2.3 Why this architecture, and what it costs

- **Next.js on Vercel for the frontend**: Vercel's free tier gives push-to-deploy static/serverless hosting with zero server management. The trade-off is that Next.js's App Router draws a hard line between **Server Components** (render on the server, can't use hooks/state) and **Client Components** (`'use client'`, run in the browser, can use hooks) — RxFlow's dashboard pages are Client Components because they're all interactive and data-driven (forms, live tables, modals), not content that benefits from server rendering.
- **Fastify on Render for the backend, not a Vercel serverless function**: the API is a long-running Node process, not a function invoked per-request. This matters for **Server-Sent Events** (a persistent HTTP connection that pushes live updates) — a real-time push channel needs a process that stays alive between requests, which a serverless function architecture actively works against. The cost: Render's free tier **sleeps the service after 15 minutes of inactivity**, so the first request after a quiet period can take up to ~50 seconds to "wake" the server — a real, visible trade-off of the free-tier choice, not a bug.
- **Neon (serverless Postgres) for the database**: real relational data — a sale touches inventory, ledgers, tax, and customer records, all of which need to update together or not at all (see ACID in the concepts section) — is what Postgres is built for, unlike a NoSQL document store. Neon specifically was chosen because it offers a genuinely free, always-on Postgres instance with both a **pooled** connection string (for normal runtime queries) and a **direct** connection string (required for schema-changing DDL statements) — more on why that split exists in the Deployment section.
- **A monorepo instead of two separate repos**: the API and the frontend both need to agree on what a "medicine" or an "order" looks like. Sharing `packages/types` and the generated Prisma client means that agreement is enforced by the TypeScript compiler, not by hoping two separately-maintained repos stay in sync.

#### 💬 Interview Questions — Section 2

**Beginner**
- *What are the three main pieces of infrastructure RxFlow runs on?* Vercel (frontend), Render (backend API), Neon (database).
- *What does REST mean, and where is it used here?* An architectural style for APIs built on HTTP methods (GET/POST/PUT/DELETE) representing actions on named resources (`/orders`, `/customers`); the frontend talks to the backend this way for almost everything except live push updates.

**Intermediate**
- *Why is the backend a persistent server on Render instead of Vercel serverless functions, given the frontend already lives on Vercel?* Server-Sent Events need a long-lived connection per connected client; a serverless function model (spin up per request, tear down after) is fundamentally at odds with holding an open push channel, so the API needed a platform built for long-running processes.
- *What's the practical downside of Render's free tier, and how does it show up to a real user?* The service sleeps after 15 minutes idle; the very first request afterward can take up to ~50 seconds while it wakes, which is why the README explicitly warns about it rather than letting a user discover it as an apparent bug.

**Advanced**
- *Why does a monorepo change the failure mode of a schema change, compared to two independent repositories?* In two separate repos, a backend schema change is silently invisible to the frontend until someone manually updates a shared contract (an OpenAPI spec, hand-copied types, or nothing at all) — the failure surfaces at runtime, in production, as a type mismatch or a missing field. In this monorepo, the frontend imports the same generated Prisma types (via `packages/types`/`packages/db`) that the backend uses, so a schema change that removes or renames a field becomes a **TypeScript compile error in the frontend immediately**, catchable in CI before it ever ships.

---

## 3. Folder Structure

```text
RxFlow/
├── apps/
│   ├── api/                      # Fastify backend — the "kitchen" that processes every order
│   │   └── src/
│   │       ├── server.ts         # App bootstrap: plugins, route registration, /health
│   │       ├── routes/           # 22 files, one per business domain (see Section 6)
│   │       ├── middleware/       # auth.ts (JWT verification), error-handler.ts
│   │       └── utils/            # Pure helpers: audit.ts, events.ts (SSE), order-math.ts,
│   │                             # financial-year.ts, pagination.ts, email.ts, env.ts
│   └── web/                      # Next.js 14 frontend — the "dining room" the user sees
│       └── src/
│           ├── app/               # App Router: every folder here is a URL route
│           ├── components/        # Reusable UI, grouped by concern (ui/, layout/, purchases/, medicines/)
│           ├── lib/                # api.ts (HTTP client), auth.ts, utils.ts, purchase-import/
│           ├── hooks/              # (present but effectively empty — see note below)
│           ├── data/               # Static seed data (sample medicines for demo/onboarding)
│           └── types/              # Frontend-only type augmentations
├── packages/
│   ├── db/                       # Prisma schema + generated client — the single source of truth
│   │   ├── prisma/schema.prisma  # Every table, every relationship (see Section 4)
│   │   ├── prisma/manual-migrations/  # 20 hand-written SQL files tracing schema evolution
│   │   └── src/index.ts          # Prisma client singleton, re-exports all generated types
│   ├── types/                    # Hand-maintained shared DTOs (JwtPayload, domain interfaces)
│   ├── medicine-intelligence/    # Standalone fuzzy-matching + normalization engine
│   └── ui/                       # (present; minimal — most UI actually lives in apps/web)
├── scripts/                       # One-off operational scripts (not part of the request lifecycle)
├── .github/workflows/ci.yml       # GitHub Actions: typecheck + test + build on every push
├── render.yaml                    # Render deployment blueprint for the API
├── turbo.json                     # Turborepo task pipeline (build/dev/lint/type-check/db:*)
├── pnpm-workspace.yaml             # Declares apps/* and packages/* as workspace members
├── vitest.config.ts                # Root-level test runner config (finds *.test.ts anywhere)
└── tsconfig.base.json               # Shared strict TypeScript compiler settings
```

### Why this shape?

- **`apps/` vs `packages/`** is a standard monorepo convention: `apps/` holds things that get *deployed* (a running server, a built website); `packages/` holds things that get *imported* (a schema, a type definition, an algorithm) by one or more apps. `packages/db` is imported by `apps/api` for every database query; it's imported by nothing else, since only the API ever talks to Postgres directly — the frontend never sees a database connection string.
- **`routes/` has one file per business domain** (orders, inventory, medicines, suppliers, ...) rather than one giant file, or one file per HTTP verb. This mirrors how a pharmacy owner actually thinks about their business ("show me the orders module," not "show me all the GET handlers") and keeps each file's cognitive load bounded — `orders.ts` only ever needs to know about orders, not about payroll.
- **`utils/` in the API holds pure, side-effect-light logic** (`order-math.ts`, `financial-year.ts`, `pagination.ts`) deliberately separated from `routes/`, which holds HTTP-aware logic (reading `request.body`, calling `reply.send`). This split is *why* `order-math.ts` and `financial-year.ts` could get their own unit tests with zero mocking — pure functions in, pure values out, no Fastify request object required.
- **`hooks/` exists in the frontend but is effectively unused** — every page in this codebase inlines its own `useState`/`useQuery` logic rather than extracting shared custom hooks. This is a genuine, honest observation about the codebase (not every real project reaches for custom hooks the moment two components share a pattern), and it's a fair thing to note if asked "would you refactor anything?" — see [Section 18](#18-interview-preparation).
- **`data/` holds static seed data** (a curated list of common Indian pharmacy medicines) used for one-click demo population, not something fetched from an API.

#### 💬 Interview Questions — Section 3

**Beginner**
- *What's the difference between `apps/` and `packages/` in this repo?* `apps/` are things that run and get deployed (the API server, the website); `packages/` are shared libraries imported by one or more apps.

**Intermediate**
- *Why does `packages/db` exist instead of each app defining its own Prisma client?* So there's exactly one schema and one generated client — if two apps each generated their own Prisma client from the same schema, you'd have two copies of the same types that could drift if one app's generation ran against a stale schema file.

**Advanced**
- *If you were asked to extract shared logic into custom hooks in `apps/web/src/hooks/`, where would you start, and why?* The debounced-search pattern (query state + a debounce timer, currently hand-rolled independently in the command palette, medicine search, and several list pages) and the SSE-driven cache-invalidation pattern in `live-sync.tsx` are the two clearest candidates — both are copy-pasted logic today rather than a shared abstraction, which is honest technical debt worth naming if asked to critique your own repo.

---

## 4. Database: Schema & Data Model

### 4.1 The mental model, before the tables

> **Analogy — the database as a warehouse's filing system:**
> Imagine a warehouse that stores medicines for many different pharmacy owners at once. Every filing cabinet drawer (a *table*) has a label taped to every folder inside it saying which owner it belongs to (`tenantId`). A clerk (the API) is only ever allowed to open drawers and read folders labeled with the owner they're currently working for — they simply never look at another owner's folders, even though physically they sit in the same cabinet.

RxFlow uses **PostgreSQL**, a relational database — data lives in *tables* with fixed columns, and tables *relate* to each other via foreign keys (an `Order` row points at the `Customer` row it belongs to, rather than embedding a copy of the customer's data). Prisma is the **ORM** (Object-Relational Mapper) — it lets the TypeScript code call `prisma.order.findMany({ where: { tenantId } })` instead of hand-writing SQL, while still generating real SQL underneath and giving full TypeScript autocomplete/type-checking on every field.

> **Definition — ORM (Object-Relational Mapper):**
> **Simple:** A translator that lets you ask for data in your programming language ("give me all orders for this customer") instead of the database's own language (SQL), and hands the answer back as normal objects your code already understands.
> **Technical:** A library that maps database tables to code-level types/classes and generates the actual SQL for you, based on a schema definition — Prisma specifically generates a fully-typed client from `schema.prisma`, so referencing a field that doesn't exist is a compile-time TypeScript error, not a runtime SQL error.
> **In RxFlow:** `packages/db/prisma/schema.prisma` is the one file that defines every table; running `prisma generate` reads it and produces the typed `PrismaClient` that both `apps/api` (via `packages/db/src/index.ts`) and, indirectly, `apps/web` (via shared types) rely on.

### 4.2 The Prisma client singleton

```ts
// packages/db/src/index.ts
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
export * from '@prisma/client'
```

**Why this pattern exists:** in development, the server process restarts frequently (hot reload). Without stashing the client on `globalThis`, every restart would create a brand-new `PrismaClient` — and therefore a brand-new connection pool — while the old one might still be alive, quickly exhausting the database's connection limit. Stashing it on `globalThis` means restarts reuse the same client instance instead of leaking connections. This guard is skipped in production, where the process doesn't hot-reload.

### 4.3 Two connection strings, and why

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooled — used for every normal query at runtime
  directUrl = env("DIRECT_URL")     // direct/unpooled — used only for schema changes (DDL)
}
```

Neon (the Postgres host) offers a **pooled** connection (routed through PgBouncer, which multiplexes many application connections over fewer real database connections — essential for a serverless-friendly database that many short-lived processes might connect to at once) and a **direct** connection (a real, unpooled connection to the database). Schema-changing statements (`CREATE TABLE`, `ALTER TABLE`, i.e. **DDL** — Data Definition Language) are **not supported reliably over PgBouncer's transaction-pooling mode**, so `prisma db push` and migrations must use `directUrl`, while every runtime query (`SELECT`/`INSERT`/`UPDATE` — **DML**, Data Manipulation Language) uses the pooled `url`. Getting this backwards is a real, documented failure mode this project hit and fixed during deployment — see [Section 15](#15-deployment-architecture).

### 4.4 Why `prisma db push`, not `prisma migrate`

Most Prisma projects use `prisma migrate dev` to generate a versioned history of SQL migration files. RxFlow instead uses **`prisma db push`**, which directly synchronizes the live database to match whatever `schema.prisma` currently says, with no migration history file. The trade-off: you lose the clean, replayable history that `migrate` gives you, but you avoid a specific failure this project hit repeatedly in production — a fresh `prisma migrate deploy` run against a database that already had some objects (like enum types) created outside the migration history would fail with `"type X already exists"`. Instead, schema changes are hand-written as **idempotent SQL files** in `packages/db/prisma/manual-migrations/` (every statement uses `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, etc.), which can be re-run safely any number of times, and `db push --accept-data-loss` is run non-fatally in the Render build step (a failure there logs a message and continues rather than blocking deployment).

### 4.5 Every table, grouped by what it's for

> Only fields with non-obvious purpose are called out individually below; see `packages/db/prisma/schema.prisma` for the exhaustive field list.

#### Identity: `Tenant`, `Store`, `User`, `UserStore`

| Table | What it represents | Key fields worth knowing |
|---|---|---|
| `Tenant` | One pharmacy business (the "apartment" in the multi-tenant building) | `type` (RETAIL_PHARMACY / WHOLESALE_DISTRIBUTOR / CHAIN_PHARMACY / HOSPITAL / CLINIC / SUPPLIER), `plan` (STARTER/GROWTH/PRO/ENTERPRISE — currently unenforced, no billing logic reads it), `allowNegativeStock` (a real business-logic toggle — see Section 8), `settings`/`metadata` (Json, currently holding config like currency/timezone at signup) |
| `Store` | A physical location belonging to a tenant (chain pharmacies have several) | `isHeadOffice`, unique per `(tenantId, code)` |
| `User` | A login account | `role` (8-value enum from SUPER_ADMIN down to VIEWER), unique per `(tenantId, email)` — **the same email can register at two different tenants**, since uniqueness is scoped to the tenant, not global |
| `UserStore` | Join table: which stores a user can access | `isPrimary` marks their default store |

#### Medicine Catalog: `Medicine`, `MedicineComposition`, `MedicineSubstitute`, `Manufacturer`, `MedicineCategory`, `MedicineAlias`, `MedicineSyncLog`

The medicine catalog is **global, not tenant-scoped** — every pharmacy shares the same master list of "Paracetamol 650mg" rather than each maintaining a private copy. This is a deliberate design choice: medicine identity (name, composition, HSN code, schedule classification) is a fact about the world, not about any one pharmacy's business — only *inventory of* that medicine is tenant-specific.

| Table | Purpose |
|---|---|
| `Medicine` | The master record — name, generic name, brand, manufacturer, dosage form, MRP, HSN code, GST rate, drug schedule, plus an extensive set of MARG-ERP-style fields added later (`rateA/B/C` tiered pricing, `division`, `packing`, `taxType`, `cess`, min/max stock defaults) |
| `MedicineComposition` | The active ingredients making up a medicine (a combination drug can have several) |
| `MedicineSubstitute` | Which medicines can substitute for which, with a `confidence` score |
| `Manufacturer` | Normalized manufacturer names + aliases |
| `MedicineCategory` | **Tenant-scoped** — each pharmacy can define its own category labels (e.g. "Antibiotics"), linked to medicines by matching the category **name as a string**, not a foreign key (a deliberate simplicity trade-off explained in Section 6) |
| `MedicineAlias` / `MedicineSyncLog` | Support tables for the fuzzy-matching engine — see [Section 10](#10-the-medicine-intelligence-engine) |

#### Inventory: `InventoryItem`, `Batch`

This is the heart of the "what do we actually have on the shelf" problem.

- **`InventoryItem`** is the tenant+store+medicine-specific stock record: `totalQuantity`, `availableQuantity` (total minus anything reserved), `reorderLevel`/`reorderQuantity` (drives low-stock alerts and reorder suggestions), `sellingPrice`, `rackNumber`/`shelfNumber`. Unique per `(tenantId, storeId, medicineId)` — the same medicine at two different stores is two different `InventoryItem` rows, which is exactly what lets stock transfers move a batch from one store's inventory into another's.
- **`Batch`** is a single received lot of that medicine: `batchNumber`, `lotNumber` (a distinct supplier-assigned lot code), `expiryDate`, `purchasePrice`, `discountPercent` (the purchase-time discount, retained specifically so a later sale can be flagged if it's being sold at a *higher* discount than it was bought at — a margin-protection check), `mrp`, `isTemporary` (goods physically received before the supplier's invoice has arrived — a real workflow this system supports explicitly), and write-off tracking fields (`writeOffQuantity`, `writeOffReason`, `writtenOffAt`) for expired/damaged stock.

> **Why track both `InventoryItem.availableQuantity` AND per-`Batch.quantity`?** Because a sale needs to know not just "do we have 50 units of Paracetamol" but "which *specific batch* those 50 units come from" — batches expire independently, and selling from the soonest-to-expire batch first (FEFO — First-Expired-First-Out) is standard pharmacy practice. `InventoryItem` answers "how much, in total, at this store" quickly without summing every batch; `Batch` answers "which lot, expiring when, bought at what price."

#### Orders, Invoices, and Money: `Order`, `OrderItem`, `Invoice`, `InvoiceItem`, `Payment`, `LedgerEntry`

- **`Order`** is the transaction record for *either* a sale or a purchase (`type: SALE | PURCHASE`) — the same table serves both directions of the business, distinguished by which of `customerId`/`supplierId` is set. Carries the full computed money breakdown (`subtotal`, `discountAmount`, `taxAmount`, `total`), the commission fields (`salesRepId`, `commissionPercent`, `commissionAmount`, `commissionStatus`), purchase-only fields (`transportCharge`, `purchaseDiscountPercent`), the bill-level special discount (`specialDiscountType`/`specialDiscountValue`), and parked-sale support (`parkedAt`/`parkedLabel` for a cart saved mid-transaction without deducting stock yet).
- **`Invoice`** is the **GST-compliant tax document** generated *from* an order — a deliberate separation: an `Order` is the business transaction, an `Invoice` is the formal tax paperwork with the CGST/SGST/IGST breakdown, and `type` extends beyond SALE/PURCHASE to include `CREDIT_NOTE` and `DEBIT_NOTE` (returns), which reference the `originalInvoiceId` they adjust.
- **`Payment`** records money actually received/paid against an invoice — an invoice can have partial payments over time, and `Invoice.paymentStatus` (PENDING/PARTIAL/PAID) is recalculated from the sum of its payments.
- **`LedgerEntry`** is a running debit/credit ledger against a customer or supplier — it uses a **polymorphic pattern**: `entityType: 'CUSTOMER' | 'SUPPLIER'` plus `entityId` rather than two separate foreign keys, so the same table serves both relationships (Prisma models this with two differently-named relations, `ledger_customer` and `ledger_supplier`, both resolving through `entityId`).

#### Stakeholders: `Supplier`, `Customer`, `SalesRep`

Both `Supplier` and `Customer` carry near-identical **regulatory/compliance fields**: `gstin` (validated against a real Indian GSTIN regex), `gstRegistrationType` (REGULAR/COMPOSITE/NON_GST — India's GST composition scheme has different rules for small businesses), and `drugLicenseNumber`/`drugLicenseExpiryDate` (pharmacies and distributors are legally required to hold a valid drug license). `Customer.salesRepId` is a direct link so that selecting a known B2B customer at billing time can auto-suggest the salesperson who manages that account (and their commission).

`SalesRep` tracks `defaultCommissionPercent` and an optional `flatBonusAmount` — the default commission terms, overridable per-order.

#### Stock Operations: `StockTake`, `StockTakeLine`, `StockTransfer`, `StockTransferItem`

- **Stock take** (physical inventory count / audit): a `StockTake` session snapshots the *system's believed quantity* for a scope of items into `StockTakeLine` rows; staff then walk the shelves and enter `actualQty`; `variance` is computed automatically; completing the take applies every counted variance back into `InventoryItem`/`Batch` in one transaction.
- **Stock transfer** (moving inventory between a chain's stores): a `StockTransfer` with `StockTransferItem` lines moves specific batch quantities from one store's inventory to another's, creating a *mirrored* batch at the destination with the same batch number/expiry/cost metadata.

#### HR & Payroll: `Employee`, `Attendance`, `PayrollRun`, `Payslip`

A full lightweight HR module: `Employee` (optionally linked to a `User` login account via `userId`), daily `Attendance` records (`PRESENT`/`ABSENT`/`HALF_DAY`/`PAID_LEAVE`/`UNPAID_LEAVE`/`HOLIDAY`/`WEEK_OFF`), and monthly `PayrollRun` → `Payslip` generation that reads attendance to compute **loss-of-pay proration** automatically (see [Section 8.4](#84-payroll-generation-and-loss-of-pay-proration)).

#### Accounting: `Expense`

A single flexible table for both money going out (`direction: OUT` — rent, salaries, utility bills) and money coming in outside of sales (`direction: IN` — e.g. interest, refunds), categorized (`EXPENSE_CATEGORIES`/`INCOME_CATEGORIES` constants), feeding directly into the P&L and cash-flow reports.

#### System: `Alert`, `AuditLog`, `OtpToken`, `Prescription`

- **`Alert`**: low-stock/expiry/price-change/order-update/payment-due/reorder-suggestion notifications surfaced on the dashboard.
- **`AuditLog`**: every consequential write anywhere in the system is recorded here (`action`, `entityType`/`entityId`, `oldValues`/`newValues` as JSON diffs, `ipAddress`, `userAgent`) — this is both a compliance trail and, as explained in [Section 9](#9-real-time-sync-sse), the trigger point for real-time UI updates.
- **`OtpToken`**: short-lived, bcrypt-hashed one-time codes for password reset and passwordless login (see [Section 5](#5-authentication--authorization)).
- **`Prescription`**: uploaded prescription images/data linked to a customer, with pharmacist verification workflow fields.

### 4.6 Entity-Relationship Overview (textual)

```text
Tenant ──┬── Store ──── UserStore ──── User
         ├── Medicine (global, NOT owned by Tenant)
         ├── InventoryItem ──── Batch
         ├── Supplier ──┬── Order (type=PURCHASE) ──── OrderItem
         │              ├── Invoice (type=PURCHASE/DEBIT_NOTE)
         │              └── LedgerEntry (entityType=SUPPLIER)
         ├── Customer ──┬── Order (type=SALE) ──── OrderItem
         │              ├── Invoice (type=SALE/CREDIT_NOTE)
         │              ├── LedgerEntry (entityType=CUSTOMER)
         │              └── Prescription
         ├── SalesRep ──── (Order.salesRepId, Customer.salesRepId)
         ├── Employee ──┬── Attendance
         │              └── Payslip ──(belongs to)── PayrollRun
         ├── Expense
         ├── Alert
         └── AuditLog

Order ──(1:1, optional)── Invoice ──(1:many)── Payment
Invoice ──(self-relation "InvoiceAdjustments")── Invoice   (credit/debit notes reference their original invoice)
```

#### 💬 Interview Questions — Section 4

**Beginner**
- *What is a foreign key, in plain terms?* A column in one table that stores the ID of a row in another table, creating a link — e.g., `Order.customerId` points to a specific row in `Customer`.
- *Why is Postgres (relational) used here instead of a NoSQL database?* Because the data is deeply interconnected — a single sale needs to update inventory, a ledger, and financial totals together, and relational databases with transactions are built for exactly that kind of coordinated, all-or-nothing update.

**Intermediate**
- *Why is `Medicine` NOT tenant-scoped, when almost everything else is?* A medicine's identity (its name, composition, legal schedule) is a fact about the world shared by every pharmacy; only *how much of it a given pharmacy has in stock* (`InventoryItem`) is tenant-specific. Making the catalog global also means one pharmacy's data-entry effort (adding a new medicine correctly) benefits every other tenant, rather than 500 pharmacies each re-typing the same 10,000 common medicines.
- *Explain the polymorphic `LedgerEntry` design (`entityType` + `entityId`) — what's the trade-off vs. two separate tables?* One shared table means ledger-querying/reporting code doesn't have to special-case customers vs. suppliers, but it sacrifices a hard database-level foreign-key constraint on `entityId` (the database can't enforce "this entityId actually exists in Customer OR Supplier" the way it could with two real FK columns) — that referential check has to be done in application code instead.

**Advanced**
- *Why does `prisma db push` fit this project's history better than `prisma migrate`, and what did it cost?* `migrate` demands a clean, replayable history; this schema evolved through 20 hand-written SQL files applied ad hoc in development, so a from-scratch `migrate deploy` against an already-partially-provisioned database kept failing on "type already exists" for enums created outside the migration history. `db push` sidesteps that by directly reconciling the live database to the current schema file, at the cost of losing a clean, auditable migration history and the ability to easily roll back a single change.
- *Walk through what happens end-to-end, at the database level, when a stock take is completed.* `POST /stock-takes/:id/complete` runs one Prisma `$transaction`: for every counted `StockTakeLine`, if it names a specific `batchId`, that batch's `quantity` is set directly to `actualQty` (an absolute overwrite, not an increment — the physical count *is* the new truth); regardless, the parent `InventoryItem`'s `totalQuantity`/`availableQuantity` are adjusted by the **variance delta** (`actualQty - systemQty`), not overwritten, since the inventory item aggregates across potentially many batches. Only after every line is applied does the `StockTake.status` flip to `COMPLETED` — if any single update in that transaction failed, Postgres would roll back every change in it, so the counts and the inventory numbers can never end up disagreeing.

---

## 5. Authentication & Authorization

### 5.1 The mental model

> **Analogy — a wristband at a members-only club:**
> When you check in at the front desk (log in), you get a wristband (a JWT — JSON Web Token) that proves who you are and which membership tier you have, without the bouncer at every door needing to call the front desk to double-check. The wristband has an expiry printed on it; once it expires, you need a fresh one, which you get by showing a longer-lived membership card (the refresh token) rather than checking in from scratch every time.

RxFlow's auth is **stateless JWT-based authentication** with a short-lived access token and a longer-lived refresh token, plus a passwordless OTP (One-Time Password) login option and an OTP-based password reset flow.

> **Definition — JWT (JSON Web Token):**
> **Simple:** A signed, tamper-proof note that says "this is user #42, and they're an admin at pharmacy #7" — anyone can read it, but only the server (which holds the secret key) could have written a valid one, so nobody can forge or edit it undetected.
> **Technical:** A compact, URL-safe token consisting of a header, a payload (arbitrary claims, here `{userId, tenantId, role, storeIds}`), and a signature computed over both using a secret key (HMAC in this project, via `@fastify/jwt`). The server verifies the signature on every request instead of looking up a session in a database — that's what makes it "stateless."
> **In RxFlow:** access tokens are signed with `JWT_SECRET`, expire in 15 minutes, and carry the full `JwtPayload`; refresh tokens are signed with a **separate** effective process (same underlying `@fastify/jwt` instance but semantically distinct — they carry only `{userId}`), expire in 7 days, and are additionally stored **bcrypt-hashed** in the `User.refreshToken` column so a stolen database dump alone can't be used to forge a working refresh token.

### 5.2 The login flow, end to end

```text
User submits email+password
        ↓
POST /api/v1/auth/login   (rate-limited: 10/min — brute-force protection)
        ↓
routes/auth.ts: loginSchema.parse(body)   (zod validation — malformed body → 422)
        ↓
prisma.user.findFirst({ where: { email, isActive: true } })
        ↓
   user not found? ──────────────→ 401 "Invalid credentials"
        ↓ found
bcrypt.compare(password, user.passwordHash)
        ↓
   wrong password? ──────────────→ 401 "Invalid credentials"   (same message as "not found" —
        ↓ correct                                                 deliberately, to avoid leaking
                                                                    which emails are registered)
user.tenant.isActive?
        ↓
   suspended? ────────────────────→ 403 "Account suspended"
        ↓ active
sign accessToken  (15m, payload {userId, tenantId, role, storeIds})
sign refreshToken (7d, payload {userId})
bcrypt.hash(refreshToken) → store in User.refreshToken; update lastLoginAt
        ↓
return { accessToken, refreshToken, expiresIn: 900, user: {...full profile...} }
        ↓
Frontend: authService.login() stores both tokens + user JSON in localStorage
        ↓
Every subsequent axios request attaches: Authorization: Bearer <accessToken>
```

**Why the identical "Invalid credentials" message for both a wrong email and a wrong password?** This is a deliberate security choice, not an oversight. If the server said "no account with that email" versus "wrong password" as two different messages, an attacker could use the login form itself to enumerate which email addresses have accounts on the system — a privacy leak with no legitimate user benefit.

### 5.3 Refreshing an expired access token (frontend + backend together)

Access tokens expire in 15 minutes — deliberately short, so that if one is ever stolen (e.g. leaked in a log, or a browser XSS), the window of usable damage is small. But logging the user out every 15 minutes would be unusable, so the frontend automatically and invisibly refreshes:

```ts
// apps/web/src/lib/api.ts — axios response interceptor (simplified shape)
axios response interceptor:
  on 401 AND request not already retried:
    queue this request (in case multiple requests 401 at the same instant)
    POST /auth/refresh  with the stored refreshToken
    if refresh succeeds:
        store new accessToken + refreshToken
        retry every queued request with the new token
    if refresh fails:
        clear both tokens
        hard-redirect to /login
```

**Why queue concurrent requests instead of letting each one refresh independently?** If the dashboard fires five API calls at once and the access token happens to be expired, without queuing, all five would independently detect the 401 and all five would call `/auth/refresh` simultaneously — wasteful, and (worse) each successful refresh invalidates the *previous* refresh token server-side (since a new one is generated and stored on every refresh), so a race between five concurrent refresh calls could leave four of them working with an already-superseded token. Queuing means only the *first* 401 triggers an actual refresh call; the other four wait for that one result and then retry with the single new token.

**Backend refresh logic** (`POST /auth/refresh`): verifies the refresh JWT signature, loads the user, `bcrypt.compare`s the presented token against the stored hash (so even a syntactically-valid, correctly-signed refresh token is rejected if it doesn't match what's on file — e.g. after a logout, which nulls the stored hash), and if all checks pass, issues a **new** access+refresh pair and re-persists the new hash. This means refresh tokens are effectively single-use in practice — each refresh invalidates the previous one.

### 5.4 Passwordless login (OTP) and password reset — shared machinery

Both features are built on the same two internal helpers in `routes/auth.ts`:

```ts
async function issueOtp(identifier: string, purpose: 'PASSWORD_RESET' | 'LOGIN') {
  const code = String(Math.floor(100000 + Math.random() * 900000))  // 6 random digits
  const codeHash = await bcrypt.hash(code, 10)
  await prisma.otpToken.deleteMany({ where: { identifier, purpose, consumedAt: null } }) // invalidate any prior unused code
  await prisma.otpToken.create({ data: { identifier, codeHash, purpose, expiresAt: +10min } })
  return code   // the PLAINTEXT code — only ever returned to be emailed, never stored plaintext
}

async function verifyOtp(identifier, purpose, code): Promise<boolean> {
  const token = find newest unconsumed, unexpired OtpToken for (identifier, purpose)
  if (!token) return false
  if (token.attempts >= 5) return false          // brute-force cap on guessing a 6-digit code
  const ok = await bcrypt.compare(code, token.codeHash)
  if (!ok) { increment attempts; return false }
  mark token consumed; return true
}
```

**Why bcrypt-hash a 6-digit OTP code at all, given a 6-digit code only has one million possible values?** Because the *database row itself* could leak (a backup, a misconfigured admin tool, a compromised read replica) — hashing means even someone with direct DB read access can't read out valid codes to use themselves, only compare a guess against the hash. The 5-attempt cap is the actual defense against brute-forcing the 1-in-a-million code space in real time; the hash defends against a completely different threat (data-at-rest exposure).

- **`POST /auth/forgot-password`** issues a `PASSWORD_RESET` OTP and emails it, then **always returns `200`** regardless of whether the account exists — the classic anti-enumeration pattern applied at the endpoint level, same reasoning as the login error-message merging above.
- **`POST /auth/reset-password`** verifies the OTP and, if valid, updates `passwordHash` and — importantly — **nulls `refreshToken`**, forcing every other device currently logged in as that user to be logged out on their next token refresh. This is a deliberate security decision: if you just reset your password (perhaps because it was compromised), any session an attacker already had open should not silently continue working.
- **`POST /auth/otp/request`** / **`POST /auth/otp/verify`** are the passwordless-login equivalent, keyed by `LOGIN` purpose, accepting either an email or a phone number as the `identifier`.

**A real production bug this project hit and fixed, worth knowing:** email delivery can fail silently if not configured correctly (the free-tier email provider's sandbox mode only delivers to the developer's own verified address). Rather than let a user's reset request vanish with no trace, the failure path logs the OTP code itself at `warn` level as an "operator rescue" — an admin can read server logs and manually relay the code to a locked-out user. This is a pragmatic trade-off for a free-tier-hosted solo project, not a pattern to defend as ideal in a compliance-regulated production system.

### 5.5 Authorization: roles and tenant scoping

```ts
// apps/api/src/middleware/auth.ts
export async function authenticate(request, reply) {
  try { await request.jwtVerify() }
  catch { reply.status(401).send({ success: false, error: 'Unauthorized' }) }
}
```

Every protected route registers `{ preHandler: [authenticate] }`, which runs `request.jwtVerify()` — this decodes and signature-checks the `Authorization: Bearer <token>` header and populates `request.user` with the `JwtPayload`. From that point on, **every tenant-scoped query in every route handler manually includes `tenantId: request.user.tenantId`** in its `where` clause.

**The honest, verified truth about how isolation is enforced (important — this is a place many candidates over-claim):** there is no Prisma middleware, no `$extends` query wrapper, and no PostgreSQL row-level security policy centrally enforcing the tenant filter. `requireRole()` and `requireTenant()` helper functions **do exist** in `middleware/auth.ts` but are **not actually used by any route** — every route instead does its own inline tenant/role checks (e.g. `tenant.ts` inlines `if (user.role !== 'TENANT_ADMIN' && user.role !== 'SUPER_ADMIN') return reply.status(403)...` directly, rather than composing a shared `requireRole('TENANT_ADMIN')` preHandler). This is **shared-schema multi-tenancy with application-layer enforcement**, not database-enforced isolation — see [Section 18](#18-interview-preparation) for how to talk about this honestly and what the real fix would be if pressed.

### 5.6 Protected routes on the frontend

```ts
// apps/web/src/app/(dashboard)/layout.tsx
useEffect(() => {
  if (!authService.isAuthenticated()) router.push('/login')
}, [router])
```

This is a **client-side** redirect guard, not true server-side route protection — the dashboard layout's JavaScript checks for a token in `localStorage` after the page has already started rendering, and redirects if absent. The *real* security boundary is the backend: even if someone bypassed this client-side check entirely, every API call still requires a valid JWT, so no protected data is actually reachable without one. The frontend check exists purely for user experience (bounce an unauthenticated visitor to the login page immediately, rather than showing them a dashboard shell that then fails every data fetch with 401s).

#### 💬 Interview Questions — Section 5

**Beginner**
- *What's the difference between authentication and authorization?* Authentication answers "who are you" (proven by the JWT signature); authorization answers "what are you allowed to do" (checked via the `role` field inside that same JWT).
- *Why does the access token expire so quickly (15 minutes) if that means the app has to refresh it constantly?* Short-lived tokens limit the damage window if one is ever stolen; the refresh mechanism makes that trade-off invisible to the user.

**Intermediate**
- *Walk through exactly what happens when a user's access token expires mid-session.* The next API call gets a 401; the axios response interceptor catches it, queues the failed request, calls `/auth/refresh` with the stored refresh token, receives a new access+refresh pair, updates `localStorage`, and retries the original (and any other queued) request — invisibly to the user, with no visible loading flash or forced re-login.
- *Why store the refresh token bcrypt-hashed in the database instead of storing it plaintext?* If the database were ever read by an unauthorized party (a backup leak, an internal misconfiguration), plaintext refresh tokens would let them impersonate any user indefinitely until expiry; a hash only allows verifying a *presented* token against it, not extracting a usable token from it.

**Advanced**
- *Is RxFlow's multi-tenancy enforcement structural (database-level) or conventional (application-level)? What's the actual risk, and how would you harden it?* It's application-level — every tenant-scoped query manually filters by `tenantId` read off the JWT, with no database-level backstop. The real risk is a route handler that simply forgets the filter, which would leak cross-tenant data with no error, no warning, and no automatic detection. The honest hardening path: a Prisma Client extension that automatically injects the tenant filter into every query for tenant-scoped models (so a forgotten filter becomes structurally impossible rather than a code-review catch), or PostgreSQL Row-Level Security policies as a database-level backstop that would reject an errant cross-tenant read even if the application code got it wrong. Neither was built here because this is a solo project without a compliance mandate forcing that extra layer — but knowing exactly where the gap is, and exactly what you'd add, is a stronger answer than pretending the gap doesn't exist.
- *Why does resetting a password null out the stored refresh token?* Because a password reset is often a response to a suspected compromise; if a session was already open on a device you don't control, silently letting that session continue (since its access token is still valid for up to 15 more minutes, and would otherwise keep refreshing indefinitely) would defeat the point of resetting the password at all. Nulling the refresh token means the next refresh attempt from that other session fails, forcing it to log in again — with the new password only the legitimate owner now knows.

---

## 6. Backend: API Layer

### 6.1 Server bootstrap (`apps/api/src/server.ts`)

Every request passes through these Fastify plugins, registered in this exact order, before reaching any route handler:

```text
1. helmet         → sets protective HTTP security headers (CSP disabled explicitly, since
                     this is a pure JSON API with no HTML templates to protect)
2. cors           → only allows requests from origins listed in CORS_ORIGIN (supports a
                     wildcard '*' for LAN/dev use, otherwise an explicit allow-list; requests
                     with no Origin header — e.g. server-to-server, curl — are always allowed)
3. rateLimit      → global default cap: 200 requests / minute per client (specific
                     auth endpoints override this with much stricter limits — see below)
4. jwt            → registers @fastify/jwt with JWT_SECRET; enables request.jwtVerify()
                     and app.jwt.sign() everywhere downstream
5. swagger        → generates an OpenAPI spec with a bearerAuth security scheme
6. swaggerUi      → serves interactive API docs at /docs
```

Then all 22 route files are registered under the shared prefix `/api/v1`, plus one unauthenticated `GET /health` endpoint (used by Render's health checks and by the free-tier "is the server awake yet" pattern), and a single global `app.setErrorHandler(errorHandler)` (see [Section 6.3](#63-the-central-error-handler)).

### 6.2 Route inventory

Every route file lives in `apps/api/src/routes/`, one file per business domain, each mounted at its own path prefix under `/api/v1`:

| Route file | Prefix | Tenant-scoped? | What it owns |
|---|---|---|---|
| `auth.ts` | `/auth` | No (pre-login) | Login, register, refresh, logout, OTP, password reset |
| `medicines.ts` | `/medicines` | **No — global catalog** | Medicine master CRUD, bulk import, barcode lookup, purchase history |
| `inventory.ts` | `/inventory` | Yes | Stock levels, batches, temporary purchases, write-offs, low-stock/expiry alerts, insights |
| `orders.ts` | `/orders` | Yes | Sale & purchase order creation, status, parked sales |
| `invoices.ts` | `/invoices` | Yes | GST invoice generation, payments, credit/debit notes |
| `purchases.ts` | `/purchases` | Yes | Bulk CSV purchase import, fuzzy medicine-name matching |
| `suppliers.ts` | `/suppliers` | Yes | Supplier CRUD, ledger, CSV import column-mapping presets |
| `customers.ts` | `/customers` | Yes | Customer CRUD, ledger, refill suggestions, purchase history |
| `sales-reps.ts` | `/sales-reps` | Yes | Sales rep CRUD, commission reports, settlement |
| `hr.ts` | `/hr` | Yes | Employees, attendance, payroll generation, performance |
| `accounts.ts` | `/accounts` | Yes | Expenses/income, P&L, cash flow |
| `reports.ts` | `/reports` | Yes | GSTR-1, GSTR-3B, sales/purchase registers, Schedule H1 register, license expiry, stock valuation |
| `stock-takes.ts` | `/stock-takes` | Yes | Physical inventory count sessions |
| `stock-transfers.ts` | `/stock-transfers` | Yes | Inter-store stock movement |
| `categories.ts` | `/categories` | Yes | Medicine category labels |
| `dashboard.ts` | `/dashboard` | Yes | The main dashboard aggregate + sales analytics |
| `search.ts` | `/search` | Yes (except medicines) | Global command-palette search |
| `medicine-intelligence.ts` | `/medicine-intelligence` | No | Fuzzy matching, normalization, prescription text extraction |
| `tenant.ts` | `/tenant` | Yes | Tenant profile, user management, store CRUD, account deletion |
| `events.ts` | `/events` | Yes | Server-Sent Events (real-time push) |
| `audit-logs.ts` | `/audit-logs` | Yes | Read-only audit trail |
| `backup.ts` | `/backup` | Yes | Full JSON export/import, per-entity CSV import |

### 6.3 The central error handler

Every thrown error in every route funnels through one Fastify error handler (`middleware/error-handler.ts`), which maps errors to consistent JSON responses in this priority order:

```text
ZodError (validation failed)          → 422  { error: 'Validation Error', details: [{field, message}] }
Fastify's own validation error         → 400  { error: 'Bad Request', message }
JWT missing/invalid                    → 401  { error: 'Unauthorized' }
Prisma P2002 (unique constraint)       → 409  { error: '<field> already exists' }
Prisma P2025 (record not found)        → 404  { error: 'Record not found' }
Prisma P2003 (foreign key violation)   → 400  { error: 'Related record not found or still in use' }
Prisma P2011 (required field missing) → 400  { error: '...' }
Prisma P2022 / P2021 (schema drift)    → 500  { error: 'The database schema is out of date...' }
anything else                          → error.statusCode ?? 500 (stack trace only in dev)
```

**Why centralize this instead of each route try/catching its own errors?** Every one of the 22 route files can simply `throw new Error(...)` or let a Prisma call reject, and trust that the client always gets a consistent, well-shaped JSON error — no route author has to remember to format a Zod error correctly, or to translate a cryptic `P2002` Prisma error code into something a frontend developer can build a helpful toast message from. This is the single place that decision is made, once.

### 6.4 Deep dive: creating an order (the most complex write path in the system)

`POST /api/v1/orders` is worth walking through in full, because it's where the most business rules converge at once — GST math, commission calculation, stock deduction, and a real concurrency bug this project found and fixed.

```text
Request: { type: 'SALE'|'PURCHASE', storeId, customerId?/supplierId?, items:[...],
           salesRepId?, commissionPercent?, transportCharge?, specialDiscount? }
        ↓
zod validates createOrderSchema — malformed body → 422 automatically (no manual check needed)
        ↓
calculateOrderTotals(items)
   for each line: lineTotal = qty × unitPrice
                  discountAmount = lineTotal × discountPercent / 100
                  taxableAmount = lineTotal − discountAmount
                  taxAmount = taxableAmount × taxRate / 100
   sums every line into { subtotal, discountAmount, taxAmount, total }
        ↓
applySpecialDiscount(totals, body.specialDiscount)
   IF a bill-level special discount was given (percent or flat ₹ amount):
      recompute the taxable base as (subtotal − line discounts − special discount)
      scale taxAmount DOWN proportionally to match the new, smaller taxable base
      (so GST is never charged on money the customer isn't actually being charged)
        ↓
IF type === 'PURCHASE': totals.total += transportCharge          (delivery cost is NOT taxed)
        ↓
IF salesRepId given:
   look up the active SalesRep
   commissionPercent = given value OR the rep's stored default
   commissionAmount = computeCommission(totals, commissionPercent, rep.flatBonusAmount)
                     = (subtotal − discountAmount) × commissionPercent/100 + flatBonusAmount
   (deliberately EXCLUDES tax and transport from the commission base — a salesperson
    shouldn't earn commission on money that just passes through to the government or a courier)
        ↓
generateOrderNumber(tenantId, type)  →  e.g. "INV/2025-26/00042" or "PO/2025-26/00007"
   (counts existing orders of this type within the current Indian fiscal year, +1)
        ↓
prisma.$transaction:                                    ← ALL-OR-NOTHING from here
   create Order + nested OrderItems
   IF type === 'SALE':
      for each line item:
         find the InventoryItem for (tenantId, storeId, medicineId)
         IF missing AND tenant.allowNegativeStock: auto-create one
         IF missing AND NOT allowed: throw "Insufficient stock for medicine <id>"
         IF availableQuantity < quantity AND NOT allowed: throw with exact have/need counts
         decrement InventoryItem.availableQuantity and totalQuantity
         IF a specific batchId was chosen: decrement that Batch's quantity too
      IF a customer is attached: bump their totalPurchases/totalOrders
   IF type === 'PURCHASE': bump the supplier's totalPurchases
        ↓
   ⚠ RACE CONDITION GUARD: order numbering is "count existing, then create" — two
     simultaneous checkouts (the exact multi-device scenario this app's real-time sync
     is built for) could both count the same number and both try to create with it,
     tripping the database's UNIQUE(tenantId, orderNumber) constraint on the loser.
     Rather than fail the second checkout with a confusing error, the whole create step
     is wrapped in a retry loop (up to 3 attempts): on a Prisma P2002 error specifically,
     generate a FRESH order number and try again.
        ↓
audit() — writes an AuditLog row AND pushes a live SSE event to every other device
          currently viewing this tenant's data, with invalidate: ['orders','inventory',
          'dashboard', ...] telling connected browsers exactly which cached data is now stale
        ↓
Response: 201 Created, the full Order object with its items
```

**Why is this whole block one Prisma `$transaction`?** A sale touches at minimum three different tables (`Order`, `OrderItem`, `InventoryItem`, sometimes `Batch`, sometimes `Customer`). If the process crashed or threw halfway through — say, right after creating the order rows but before decrementing stock — you'd have an order that says a sale happened while the inventory still shows the medicine as available, a direct contradiction that no report or dashboard could ever reconcile correctly. Wrapping it all in one transaction means Postgres guarantees **atomicity**: either every one of those writes lands, or none of them do (see [ACID](#171-acid-and-database-transactions)).

**An important, honest limitation to know cold:** the stock-sufficiency check above (`availableQuantity < quantity` → throw) is a **check-then-act** pattern at Postgres's default READ COMMITTED isolation level, with **no row lock (`SELECT ... FOR UPDATE`)**, no optimistic-concurrency version column, and no database `CHECK` constraint preventing negative stock. That means, in principle, two truly simultaneous sales for the last unit of a medicine could both pass the check before either decrements — a real, narrow race window that exists in this code today. The transaction guarantees *atomicity* (all-or-nothing per request), but atomicity and *race-safety between two concurrent requests* are different properties, and only the first one is fully solved here. The honest fix would be adding `SELECT ... FOR UPDATE` on the inventory row before the check, or a `CHECK (availableQuantity >= 0)` constraint as a hard database-level backstop.

### 6.5 Deep dive: generating a GST invoice from an order

`POST /invoices/from-order/:orderId` is where India-specific tax law becomes code:

```text
Load the Order + its items + the customer's/supplier's state and the tenant's own state
        ↓
Compare states (case-insensitive string match):
   states differ AND both known?  → inter-state sale → apply IGST (Integrated GST) only
   otherwise                      → intra-state sale → split the rate evenly into
                                                         CGST (Central) + SGST (State)
        ↓
For each line, using the medicine's stored gstRate:
   inter-state:  igstAmount = taxableAmount × gstRate / 100,   cgst = sgst = 0
   intra-state:  cgstAmount = taxableAmount × (gstRate/2) / 100
                 sgstAmount = taxableAmount × (gstRate/2) / 100,   igst = 0
        ↓
roundOff = round(grandTotal) − grandTotal        (India commonly rounds invoice totals to
                                                    the nearest rupee; this line records
                                                    exactly how much rounding adjustment
                                                    was applied, for audit transparency)
        ↓
grandTotal = totals.total + totalTax + roundOff
        ↓
Create the Invoice + InvoiceItems; audit + SSE-invalidate ['invoices','invoice','order','dashboard']
```

**Why determine inter-state vs. intra-state from the *customer's* state, not the tenant's alone?** Because GST law taxes the *transaction*, not just the seller — a Maharashtra pharmacy selling to a Maharashtra customer owes CGST+SGST to the state and center respectively; the exact same pharmacy selling to a Gujarat customer owes IGST instead, collected once and settled between the two states by the government. The invoice math has to look at both parties' locations, every time.

### 6.6 Deep dive: credit notes and the return-quantity cap

`POST /invoices/:id/credit-note` (a customer return against a sale) has to prevent one specific abuse: returning more of a line item than was ever actually sold on it, across possibly *several* separate credit notes over time.

```text
Body: { reason, items: [{ invoiceItemId, quantity, restockBatchId? }] }
        ↓
For each requested return line:
   find the matching line on the ORIGINAL invoice → 400 if it doesn't exist there
   sum quantities already returned via ANY prior credit note against this same invoice item
     (matched by a composite "soft key" of medicineId + batchNumber — there's no direct
      foreign key from a credit-note line back to the specific original invoice line)
   IF (already returned + this request) > original quantity → 400, reject
        ↓
Pro-rate the ORIGINAL line's tax and discount by (returnQty / originalQty)
   — a partial return of 3 out of 10 units returns exactly 30% of that line's tax, not
     a freshly recalculated tax on 3 units at today's rate (protects against a GST-rate
     edit on the medicine retroactively changing what a refund is worth)
        ↓
prisma.$transaction:
   create a new Invoice with type: CREDIT_NOTE, paymentStatus: 'PAID'
      (a credit note settles immediately against the original — there's no "owing" state
       for a document that itself represents money owed BACK to the customer)
   IF a restockBatchId was given: increment that batch's quantity + the inventory totals
      (the returned physical stock goes back on the shelf)
   write a LedgerEntry (type: CREDIT) against the customer, computing a running balance
      from ALL of that customer's prior ledger entries (DEBIT increases what they owe,
      CREDIT decreases it)
   decrement customer.outstandingBalance by the credit note's value
        ↓
400 if the original invoice isn't actually type SALE (can't credit-note a purchase bill)
```

#### 💬 Interview Questions — Section 6

**Beginner**
- *What HTTP status code does a validation failure return, and why not 400?* `422 Unprocessable Entity` — the request was syntactically valid JSON (so not a 400 "bad request" in the strict sense) but failed business-rule validation (a required field missing, a number out of range).
- *What does "idempotent" mean, and is `POST /orders` idempotent?* An idempotent operation produces the same result no matter how many times it's repeated. `POST /orders` is **not** idempotent — calling it twice creates two separate orders and deducts stock twice, which is exactly why the retry-on-collision logic regenerates a fresh order number rather than blindly resubmitting the same one.

**Intermediate**
- *Why is `Medicine` the one resource NOT filtered by `tenantId` while nearly everything else is?* The medicine catalog is shared across every tenant by design (see Section 4.5) — filtering it by tenant would mean every pharmacy has to rebuild the same catalog of common medicines from scratch.
- *Explain why the special discount recalculates tax proportionally instead of just subtracting a flat amount from the final total.* Subtracting the discount from an already-tax-included total would either overcharge GST (still taxing money the customer no longer owes) or require a completely separate "discount excludes tax" business rule to be invented and applied inconsistently elsewhere; recomputing tax on the reduced taxable base keeps the same GST formula used everywhere else in the system, so there's exactly one way tax is ever calculated, not two.

**Advanced**
- *Trace what happens if the database connection drops in the middle of the order-creation transaction, right after the `Order` row is inserted but before the inventory decrement.* Because it's all inside one `prisma.$transaction`, Postgres has not yet committed anything — a dropped connection mid-transaction causes an automatic rollback, so the partially-inserted `Order` row never becomes visible or durable. The client would receive a connection/timeout error and the order simply never happened, which is the correct outcome (no ghost order, no phantom stock deduction) — the alternative, without a transaction, would be a real order existing with no corresponding stock change, silently corrupting the inventory count.
- *The commission calculation explicitly excludes tax and transport charge from its base. Is there a scenario where a business would want commission to include GST, and how would you support both without breaking existing calculations?* Some businesses do pay commission on the GST-inclusive value (effectively rewarding a rep for the total cash collected). Supporting both without breaking existing behavior would mean adding an explicit, tenant-level or rep-level setting (e.g. `commissionBase: 'NET' | 'GROSS'`) defaulting to the current `NET` (tax-excluded) behavior, so every already-computed historical commission remains correct under its original rule, and only newly-created orders read the new setting.

---

## 7. Frontend: Pages, Components, State

### 7.1 What happens when a user opens the application

```text
Browser requests rxflow.app/
        ↓
apps/web/src/app/page.tsx  →  immediately redirect('/dashboard')
        ↓
(dashboard) route group's layout.tsx runs FIRST (it wraps every page under /dashboard/*)
        ↓
'use client' component — runs in the browser, checks: authService.isAuthenticated()?
        ↓
   NOT authenticated → router.push('/login')     (client-side redirect)
        ↓
   authenticated → render:
        <Sidebar/>          — the left navigation rail
        <TopBar/>           — search bar, notifications, user menu
        <main>{children}</main>   — the actual requested page
        <CommandPalette/>   — globally mounted, invisible until ⌘K is pressed
        <LiveSync/>         — globally mounted, invisible, opens the SSE connection
```

Because the root `layout.tsx` wraps `<Providers>` (which sets up React Query) around every single page in the app, **every page below it can immediately call `useQuery()`** without any additional setup — the query client, its cache, and its default options (`staleTime: 60_000`, `retry: 1`) are already in scope.

> **Definition — Client Component vs. Server Component (Next.js App Router):**
> **Simple:** A Server Component is like a chef preparing a dish in the kitchen before it ever reaches your table — by the time you see it, it's already finished and can't be changed by you. A Client Component is like a build-your-own-taco bar — the raw pieces are sent to your table, and you (your browser) assembles and can rearrange them live.
> **Technical:** Server Components render to static HTML on the server and ship zero JavaScript for their own logic to the browser; they cannot use `useState`, `useEffect`, or any browser API. Client Components (any file starting with `'use client'`) render (and re-render) in the browser, can hold state, and can respond to user interaction.
> **In RxFlow:** essentially every dashboard page is a Client Component, because every one of them is fundamentally interactive — forms, live-updating tables, modals, search-as-you-type. There isn't much here that benefits from server rendering the way a blog post or marketing page would.

### 7.2 The route tree

Every folder under `apps/web/src/app/` corresponds directly to a URL. The two route groups — `(auth)` and `(dashboard)` — are Next.js's way of applying a different shared layout to different sets of pages **without** that grouping showing up in the actual URL (a folder in parentheses is invisible to the URL path).

| Route | Page | What it does |
|---|---|---|
| `/login` | `(auth)/login` | Password login (react-hook-form + Zod) with a toggle to OTP passwordless login |
| `/register` | `(auth)/register` | Tenant signup — creates the pharmacy workspace |
| `/forgot-password` | `(auth)/forgot-password` | Two-step OTP-based password reset |
| `/dashboard` | `dashboard` | Operations home: today's metrics, inventory health, revenue chart, top sellers |
| `/dashboard/analytics` | `dashboard/analytics` | 30-day sales trend |
| `/dashboard/inventory` | `dashboard/inventory` | Batch-level stock table, insights, add-stock, CSV export |
| `/dashboard/stock-takes`, `/[id]` | | Physical count sessions, cycle-count entry |
| `/dashboard/stock-transfers`, `/[id]` | | Inter-store movement |
| `/dashboard/orders`, `/[id]` | | Order list + reorder-suggestion view; order detail |
| `/dashboard/purchases/new` | | New purchase entry: manual line-by-line OR CSV import |
| `/dashboard/purchases/returns` | | Purchase-return (debit note) flow |
| `/dashboard/billing` | | The POS/billing screen (cart, checkout, park-sale) |
| `/dashboard/invoices`, `/[id]` | | Invoice list; full detail with payments/credit-debit notes |
| `/dashboard/medicines`, `/[id]` | | Medicine master catalog CRUD + detail |
| `/dashboard/medicine-search` | | Fuzzy/AI-assisted medicine search & normalization tool |
| `/dashboard/categories` | | Medicine category label management |
| `/dashboard/customers`, `/[id]` | | Customer CRUD, ledger, refill suggestions |
| `/dashboard/suppliers`, `/[id]` | | Supplier CRUD, ledger |
| `/dashboard/sales-reps`, `/[id]` | | Sales rep CRUD, commission reports |
| `/dashboard/staff` | | HR: employees, attendance, payroll, performance (one large tabbed page) |
| `/dashboard/stores` | | Store (physical branch) CRUD |
| `/dashboard/accounts` | | P&L, expenses/income, cash flow (tabbed) |
| `/dashboard/reports` | | GST returns (GSTR-1/3B), registers, stock valuation |
| `/dashboard/compliance` | | Schedule H1 register, drug-license expiry tracker |
| `/dashboard/audit` | | Filterable audit trail |
| `/dashboard/backup` | | Full JSON backup export/import, per-entity CSV import |
| `/dashboard/alerts` | | Low-stock & expiring-batch panels, write-off action |
| `/dashboard/settings` | | Tenant profile, user management, danger-zone account deletion |
| `/print/invoice/[id]` | (outside dashboard chrome) | A bare, print-optimized invoice view that auto-triggers `window.print()` |

### 7.3 Component organization, and why it's split this way

```text
components/
├── ui/              # Generic, reusable, domain-agnostic building blocks
│   ├── data-table.tsx     # Sortable/searchable/paginated table w/ CSV export — used by
│   │                      # nearly every list page (medicines, suppliers, customers, ...)
│   ├── metric-card.tsx    # The "ledger tick" stat block on the dashboard
│   ├── empty-state.tsx, page-header.tsx, section-card.tsx, skeleton-row.tsx
│   ├── export-button.tsx  # CSV/XLSX export split-button
│   └── animated-section.tsx  # GSAP fade+rise entrance wrapper (respects reduced-motion)
├── layout/          # The persistent chrome around every dashboard page
│   ├── sidebar.tsx        # Navigation rail
│   └── topbar.tsx         # Search trigger, notifications, user menu
├── medicines/       # Domain-specific to the medicine catalog
│   └── medicine-master-modal.tsx   # Tabbed create/edit form
├── purchases/       # Domain-specific to purchase entry
│   ├── csv-import-flow.tsx    # Generic manual column-mapping importer
│   └── smart-csv-import.tsx   # Auto-detecting distributor-format importer
└── (top-level)      # App-wide singletons, mounted once in the root/dashboard layout
    ├── command-palette.tsx   # Global ⌘K search
    ├── notification-bell.tsx
    ├── live-sync.tsx          # The SSE connection + cache invalidation
    └── providers.tsx          # React Query setup
```

**Why `ui/` is separated from `medicines/`/`purchases/`:** `DataTable` has no idea what a "medicine" or a "supplier" is — it just renders columns and rows generically, given a config object. That's what makes it reusable across a dozen different list pages instead of each page hand-rolling its own sortable table. `medicine-master-modal.tsx`, by contrast, knows deeply specific things (which fields are required for a medicine, what a GST rate is, how MARG-style pricing tiers work) and would make no sense reused anywhere else — so it lives next to the feature it serves, not in the generic bucket.

### 7.4 `DataTable` — the most reused component in the app

```ts
DataTable<T>({
  columns: DataTableColumn<T>[],   // { key, header, render?, accessor?, align?, sortable?, ... }
  data: T[],
  rowKey: (row: T) => string,
  isLoading?, onRowClick?, searchPlaceholder?, searchable?, pageSize=15,
  emptyIcon?, emptyTitle?, emptyDescription?, emptyAction?,
  exportFileName?,   // presence of this prop turns on a CSV export button
  toolbar?,          // slot for page-specific filter controls, rendered inline with the search box
})
```

This single generic component does client-side search, column sorting, pagination, and CSV export — every list page in the app (medicines, suppliers, customers, invoices, and more) configures it with a `columns` array describing *what* to show, rather than each page re-implementing sort/search/paginate logic from scratch. This is a textbook example of **why components exist instead of writing everything in one file**: the sorting algorithm and pagination math are written and tested exactly once, and a bug fix there fixes every list page in the app simultaneously.

### 7.5 State management: what's used, and why

| Kind of state | Tool | Where |
|---|---|---|
| **Server data** (anything that lives in the database) | **TanStack React Query** | Every page, via `useQuery`/`useMutation` |
| **Real-time invalidation signal** | **Server-Sent Events** (`EventSource`) | `components/live-sync.tsx` |
| **Client-only shared state** (notifications) | **Zustand** | `lib/notification-store.ts` |
| **Form state** | **react-hook-form** | Every create/edit form |
| **Everything else** (is a modal open? which tab is active?) | Plain `useState` | Local to each component |

> **Definition — React Query / TanStack Query:**
> **Simple:** Instead of your component personally walking to the kitchen (the server) every single time it wants to know "is the order ready yet," you hire an assistant who remembers the last answer, only re-asks the kitchen when it makes sense to, and tells every other part of the room the same fresh answer at once.
> **Technical:** A data-fetching and caching library that manages server state (loading/error/success states, caching by a "query key," background refetching, and cross-component cache sharing) so components don't need to manually track `isLoading`/`error` booleans or worry about two components independently re-fetching the same data.
> **In RxFlow:** `useQuery({queryKey: ['inventory', search, filter], queryFn: () => api.get('/inventory', {...})})` — the query key doubles as a cache key, so two components requesting `['inventory']` with the same parameters share one cached result, and `queryClient.invalidateQueries({queryKey: ['inventory']})` (called by `LiveSync` when the server pushes an SSE event) forces every one of them to refetch fresh data at once.

**Why React Query instead of just calling `fetch` inside a `useEffect`?** A hand-rolled `useEffect` fetch has to reinvent, on every single page: a loading flag, an error flag, re-fetching when a dependency changes, avoiding a "setState on an unmounted component" warning if the user navigates away mid-request, and caching so switching between two tabs doesn't re-fetch the same data twice in a row. React Query provides all of that as one hook call, and — critically for this app — gives a single, app-wide mechanism (`invalidateQueries`) for "something changed on another device, please refresh this data," which is exactly what powers the real-time sync described in [Section 9](#9-real-time-sync-sse).

**Why is there no Redux?** Redux (and similar global-state libraries) solve the problem of complex, deeply-nested **client** state that many unrelated components need to read and write. Almost everything meaningful in RxFlow's state *is* server state (an order, a medicine, a customer) — which React Query already owns — and the one piece of genuinely global client-only state (notifications) is a small enough problem that a lightweight library (Zustand, a few dozen lines of actual store code) is a better fit than Redux's boilerplate (actions, reducers, dispatch) for a single, simple store.

**Why Zustand specifically for notifications, and not just React Context?** The notification bell needs to be updated from a component (`LiveSync`) that isn't a parent of the component displaying it (`NotificationBell`, in the top bar) — Context would require wrapping a Provider around both and threading a value down, which for one small, frequently-updated piece of shared state is more ceremony than Zustand's `create()` store, which any component can import and read/write directly with no wrapper needed at all.

### 7.6 Custom hooks — an honest gap

A repository-wide search for `use*.ts`/`use*.tsx` files found **no dedicated custom hooks** anywhere in `apps/web/src/hooks/` or elsewhere — every hook-like pattern (debounced search, the SSE connection lifecycle, GSAP animation setup) is written inline, independently, in each component that needs it. This is worth naming honestly rather than glossing over: the debounce-plus-search-state pattern, for instance, is duplicated across the command palette, the medicine search page, and several list pages, and would be a natural candidate to extract into a shared `useDebouncedSearch()` hook if this codebase kept growing. See [Section 18](#18-interview-preparation) for how to talk about this as a real, low-risk refactor opportunity rather than a hidden flaw.

#### 💬 Interview Questions — Section 7

**Beginner**
- *What is a "hook" in React, in plain English?* A function starting with `use` that lets a component "hook into" React features — remembering a value between renders (`useState`), running code after render (`useEffect`), or reading shared data (`useQuery`).
- *Why does almost every page in this app start with `'use client'`?* Because every page is interactive (forms, live tables, buttons with click handlers) — Server Components can't hold state or respond to clicks, so anything genuinely interactive has to be a Client Component.

**Intermediate**
- *Why is `DataTable` generic (`DataTable<T>`) instead of one component per entity type?* So the exact same sorting/searching/pagination/export code serves medicines, suppliers, customers, and every other list, configured only by a `columns` array — one bug fix or feature addition (say, adding a "sticky header" behavior) automatically applies everywhere it's used, instead of needing to be copy-pasted into a dozen near-identical table components.
- *What problem does React Query's `invalidateQueries` solve here that plain `useState` + `fetch` couldn't solve as cleanly?* It gives one, app-wide "this data is now stale, please refetch" signal that any part of the app can trigger and any component using that query key will respond to — which is exactly the shape of the real-time sync problem (a change on Device A needs to invalidate cached data on Device B, which has no direct reference to Device A's component tree at all).

**Advanced**
- *If you were told this app needs to support offline-first billing (a pharmacist should be able to keep selling even if the internet briefly drops), what would break first, and what would you change?* The SSE connection would drop (handled already — it auto-reconnects with exponential backoff), but every mutation (`POST /orders`, etc.) is a direct network call with no local queue — a checkout attempted while offline would simply fail. Supporting true offline-first would require queuing mutations locally (e.g. via a persisted React Query mutation cache or a custom outbox pattern) and replaying them on reconnect, plus a strategy for what happens if two now-conflicting offline sales both tried to sell the last unit of something — which loops back directly to the same inventory race-condition honesty from Section 6.4.
- *Given there are no custom hooks anywhere in the codebase, is that necessarily a problem? How would you decide whether to introduce one?* Not inherently — premature abstraction has its own cost (an extra layer of indirection to understand, for a pattern that might only be used twice). The signal worth acting on is duplication that's actually causing bugs or slowing feature work down, not duplication in the abstract; the debounced-search pattern here is duplicated in at least three places with basically the same 5–10 lines, which is right at the threshold where extracting a `useDebouncedSearch` hook would pay for itself the next time a fourth page needs the same behavior.

---

## 8. Business Logic Deep Dives

### 8.1 The shared money math (`apps/api/src/utils/order-math.ts`)

This one file is the **single source of truth** for how a line item becomes a total, used identically by order creation, purchase bulk-import, and (with the invoice-specific CGST/SGST/IGST split layered on top) invoice generation. Centralizing it here — rather than each route recalculating totals its own way — is exactly why it's the one part of the business logic covered by unit tests with no server, no database, and no HTTP request required:

```ts
export function calculateOrderTotals(items: OrderLineInput[]): OrderTotals {
  return items.reduce((acc, item) => {
    const lineTotal = item.quantity * item.unitPrice
    const discountAmount = (lineTotal * item.discountPercent) / 100
    const taxableAmount = lineTotal - discountAmount
    const taxAmount = (taxableAmount * item.taxRate) / 100
    acc.subtotal += lineTotal
    acc.discountAmount += discountAmount
    acc.taxAmount += taxAmount
    acc.total += taxableAmount + taxAmount
    return acc
  }, { subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0 })
}
```

**Time complexity:** O(n) in the number of line items — a single pass, no nested loops, no re-reading earlier lines. For a real invoice (rarely more than a few dozen lines), this is effectively instant.

### 8.2 The special discount: percent or flat amount, GST-correct either way

```ts
export function applySpecialDiscount(totals, special?: {type:'PERCENT'|'AMOUNT', value}) {
  const taxableBefore = totals.subtotal - totals.discountAmount
  if (!special || special.value <= 0 || taxableBefore <= 0) return { ...totals, specialDiscountAmount: 0 }

  const raw = special.type === 'PERCENT'
    ? (taxableBefore * special.value) / 100
    : special.value
  const specialDiscountAmount = Math.min(raw, taxableBefore)   // never discount past zero

  const scale = (taxableBefore - specialDiscountAmount) / taxableBefore
  const taxAmount = totals.taxAmount * scale                    // GST scales DOWN with the discount

  return {
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount + specialDiscountAmount,
    taxAmount,
    total: taxableBefore - specialDiscountAmount + taxAmount,
    specialDiscountAmount,
  }
}
```

**Why scale tax proportionally instead of recomputing it line-by-line for a bill-level discount?** A bill-level discount (e.g. "10% off the whole order" as a loyalty gesture) doesn't naturally map back onto which specific lines it came off of. Rather than inventing a rule for *how* to distribute a lump discount across lines with potentially different GST rates each, the simpler and equally correct approach is: the *total* tax already owed on the pre-discount taxable amount scales down by exactly the same percentage the taxable base itself just shrank by. If the taxable base drops by 10%, the tax on it also drops by 10% — no per-line recalculation needed, and the total tax collected always exactly matches "tax on what the customer is actually paying," never more.

**`Math.min(raw, taxableBefore)`** is a deliberately defensive clamp: without it, a cashier fat-fingering a ₹50,000 flat discount onto a ₹500 bill would produce a negative subtotal and negative tax — nonsensical values that could then corrupt a report or a ledger entry downstream. Capping the discount at the taxable base means the worst case is "this bill is free," never "this bill is negative."

### 8.3 Salesman commission

```ts
export function computeCommission(totals: {subtotal, discountAmount}, commissionPercent: number, flatBonusAmount = 0): number {
  const base = totals.subtotal - totals.discountAmount
  return (base * commissionPercent) / 100 + flatBonusAmount
}
```

Deliberately computed on the **net-of-discount, pre-tax** value. If a salesperson brought in a ₹10,000 order that GST and a discount bring down to a ₹8,500 taxable base, they earn commission on ₹8,500 (or less, after line discounts) — not on the ₹1,500 in tax that passes straight through to the government, and not inflated by the discount they may have negotiated away. This same function serves **both** sales commission (a rep who brought in a customer sale) and purchase commission (a distributor's salesman who brought in a bulk supply deal) — the business meaning differs, but the arithmetic is identical, so it's one function, not two.

### 8.4 Payroll generation and loss-of-pay proration

`POST /hr/payroll/generate` is the most involved piece of business logic outside of order/invoice creation. It answers the question "given a month of attendance records, what does every employee actually get paid?"

```text
STATUS_WEIGHT = {
  PRESENT:       { present: 1,   lop: 0,   leave: 0 },
  HALF_DAY:      { present: 0.5, lop: 0.5, leave: 0 },
  ABSENT:        { present: 0,   lop: 1,   leave: 0 },
  UNPAID_LEAVE:  { present: 0,   lop: 1,   leave: 1 },
  PAID_LEAVE:    { present: 1,   lop: 0,   leave: 1 },
  HOLIDAY:       { present: 1,   lop: 0,   leave: 0 },
  WEEK_OFF:      { present: 1,   lop: 0,   leave: 0 },
}

for each active Employee:
   sum STATUS_WEIGHT across every Attendance record in the period
      → presentDays, lopDays (Loss-Of-Pay days), leaveDays, absentDays
   IF salaryType === MONTHLY:
      perDay = monthlySalary / daysInMonth
      earnedSalary = monthlySalary − (perDay × lopDays)
   IF salaryType === DAILY:
      earnedSalary = dailyRate × presentDays
   create a Payslip { earnedSalary, bonus: 0, allowances: 0, deductions: 0,
                       netPay: earnedSalary, status: 'PENDING' }
create one PayrollRun wrapping all payslips for the period, status: 'DRAFT'
```

**Why does `HOLIDAY` and `WEEK_OFF` count as `present: 1, lop: 0`, the same as actually showing up to work?** Because a declared company holiday or a scheduled weekly day off is *not* the employee's absence — they're not penalized for not working on a day nobody was expected to work. Only genuinely unaccounted absence (`ABSENT`) or unpaid leave (`UNPAID_LEAVE`) reduces `earnedSalary`; `PAID_LEAVE` is explicitly paid-for time off, so it also contributes to `present` for pay purposes even though it separately counts toward `leaveDays` for HR record-keeping.

**Marking a payslip paid has a side effect worth knowing:** `POST /hr/payroll/payslip/:id/pay` doesn't just flip a status flag — it also **creates an `Expense` row** (category `Salaries`, direction `OUT`) for the paid amount, which is what makes payroll automatically show up in the Profit & Loss and cash-flow reports without any separate manual bookkeeping step. This is a deliberate cross-module side effect: paying a salary is simultaneously an HR event and an accounting event, and the code reflects that by writing to both domains in one action.

---

## 9. Real-Time Sync (SSE)

### 9.1 Why SSE, and not WebSockets or polling

> **Definition — Server-Sent Events (SSE):**
> **Simple:** Like subscribing to a radio station — once tuned in, you keep hearing updates as they're broadcast, without ever needing to ask "anything new?" You just can't talk back on the same channel.
> **Technical:** A one-directional, server-to-client push mechanism built on a single long-lived HTTP connection and the `text/event-stream` content type. The browser's native `EventSource` API auto-reconnects if the connection drops, and the protocol is plain HTTP — no special upgrade handshake, no extra infrastructure beyond a server willing to hold the connection open.
> **In RxFlow:** every logged-in browser tab opens exactly one `EventSource` to `GET /events?token=...`, and every consequential write anywhere in the API can push a small JSON event down every currently-open connection for that tenant.

RxFlow chose SSE over **WebSockets** (a full bidirectional protocol) because the actual communication need is entirely one-directional: the server needs to tell connected browsers "something changed, please refresh," but browsers never need to send anything back over that same channel — every action a user takes still goes through a normal REST `POST`/`PATCH` call. WebSockets would add real complexity (a protocol upgrade handshake, a different set of libraries, explicit ping/pong keep-alive handling) to solve a bidirectional problem this app doesn't actually have. SSE also runs over plain HTTP, which means it passes through the same proxies, load balancers, and hosting infrastructure a normal API request would, with **native browser reconnection built in for free** — no reconnect logic to hand-write.

RxFlow also chose SSE over simple polling (each browser asking "anything new?" every N seconds) because polling either wastes requests when nothing has changed (most of the time, in a typical pharmacy) or feels laggy if the interval is stretched out to avoid that waste; SSE pushes the instant something actually happens, with zero wasted requests in between.

### 9.2 Why a passed-in `?token=` query parameter instead of an `Authorization` header

Every other authenticated endpoint in this API reads the JWT from a standard `Authorization: Bearer <token>` header. The SSE endpoint can't do that — the browser's native `EventSource` API has **no way to attach custom headers** to the connection it opens. The pragmatic, standard workaround (used by SSE implementations broadly, not unique to this project) is to pass the token as a query string parameter instead, and verify it manually inside the route (`app.jwt.verify(token)`) rather than via the usual `authenticate` preHandler.

### 9.3 The publish/subscribe mechanism

```ts
// apps/api/src/utils/events.ts — simplified
const subscribers = new Map<string, Set<(event) => void>>()   // tenantId → set of callback fns

export function subscribe(tenantId, fn) {
  if (!subscribers.has(tenantId)) subscribers.set(tenantId, new Set())
  subscribers.get(tenantId)!.add(fn)
  return () => { /* remove fn; delete the Set entirely if now empty */ }
}

export function publish(tenantId, event: ChangeEvent) {
  const subs = subscribers.get(tenantId)
  if (!subs) return   // no-op if nobody's listening for this tenant right now
  const payload = `data: ${JSON.stringify({ ...event, at: new Date().toISOString() })}\n\n`
  for (const fn of subs) { try { fn(payload) } catch { /* drop that one subscriber, keep the rest */ } }
}
```

```text
Full path, start to finish:

Device A: pharmacist completes a sale
     ↓
routes/orders.ts: prisma.$transaction(...) commits
     ↓
audit(request, { action: 'order.sale.create', ..., invalidate: ['orders','inventory','dashboard'] })
     ↓                                            ↓
  writes an AuditLog row                    publish(tenantId, event)
                                                   ↓
                                     every Device B, C, D... currently connected
                                     for that SAME tenant gets the JSON event
                                     written down their open SSE connection
     ↓
Device B's browser: EventSource.onmessage fires
     ↓
components/live-sync.tsx: for each key in evt.invalidate:
     queryClient.invalidateQueries({ queryKey: [key] })
     ↓
React Query marks ['orders'], ['inventory'], ['dashboard'] as stale
     ↓
any component on Device B currently rendering data from those query keys
automatically refetches and re-renders — WITHOUT Device B's user doing anything
```

**A named, honest architectural limitation:** this pub/sub map lives entirely **in the memory of one running Node process**. If the API were ever scaled to run as two or more instances behind a load balancer (to handle more traffic than one process can), a write landing on instance #1 would only reach browsers whose SSE connection happens to be attached to instance #1 — browsers connected to instance #2 would simply never see that update. The documented fix for that future scaling step is swapping this in-memory `Map` for a **Redis pub/sub channel**, where every API instance subscribes to the same Redis channel and re-broadcasts to its own locally-connected browsers — a well-known pattern for scaling SSE/WebSocket fan-out horizontally, not yet needed at this project's current single-instance scale.

### 9.4 Keeping the connection alive

```ts
// routes/events.ts
setInterval(() => reply.raw.write(': heartbeat\n\n'), 25_000)
```

Many browsers, proxies, and load balancers will silently close an HTTP connection that's been idle (no bytes sent) for around 30–60 seconds, assuming it's dead. A `: heartbeat` comment line (the leading colon marks it as an SSE comment, ignored by `EventSource.onmessage`) sent every 25 seconds keeps bytes flowing often enough that nothing in the path ever decides the connection has gone quiet and closes it — without that heartbeat, a genuinely-idle pharmacy (nobody made a sale in the last minute) could see its live-sync connection silently die and never notice until the next reconnect attempt.

#### 💬 Interview Questions — Section 9

**Beginner**
- *What's the core difference between SSE and a WebSocket?* SSE is one-directional (server → client only); WebSocket is bidirectional (both sides can send messages at any time over the same connection).

**Intermediate**
- *Why can't `EventSource` send an `Authorization` header, and what did this project do instead?* The browser's native `EventSource` API doesn't support setting custom request headers at all; the workaround is passing the JWT as a `?token=` query parameter and manually verifying it inside the route handler instead of relying on the standard header-based auth middleware.
- *What's the purpose of the 25-second heartbeat comment?* To keep the underlying HTTP connection from being silently closed by an intermediary (browser, proxy, load balancer) that treats a long period of no data as a dead connection.

**Advanced**
- *This pub/sub is in-memory and per-process. Describe exactly what breaks if you deploy two instances of this API behind a load balancer, and how you'd fix it without changing the frontend at all.* A write handled by instance A calls `publish()` on instance A's in-memory subscriber map; only browsers whose SSE connection happens to be routed to instance A receive it. A browser connected to instance B (about half of them, under round-robin routing) would never see that update until they happened to make some other request that revealed the staleness, or reconnected to instance A by chance. The fix that requires zero frontend changes: replace the in-memory `Map` in `utils/events.ts` with a Redis pub/sub client — every instance subscribes to the same Redis channel on startup, `publish()` publishes to that channel instead of iterating a local Map, and every instance's own local subscriber list re-broadcasts to whichever browsers happen to be connected to *it*. The `EventSource` contract the frontend depends on never changes; only the fan-out mechanism between API instances does.

---

## 10. The Medicine-Intelligence Engine

### 10.1 The problem it solves

> **Analogy — a librarian who knows every nickname a book goes by:**
> If you ask a good librarian for "that Cinderella book, the classic one," they don't need the exact catalog title — they know common names, common misspellings, and how to narrow down from a rough description to a specific pull-that-book-off-the-shelf answer. `packages/medicine-intelligence` is that librarian, but for medicine names, which arrive from real-world sources — a doctor's messy handwriting transcribed by OCR, a supplier's inconsistent invoice spelling, a customer saying "the fever tablet" — that rarely match the catalog's exact spelling.

This is a standalone package (`packages/medicine-intelligence`), imported by the API, with two responsibilities: **normalizing** a raw text string into structured pieces, and **fuzzy-matching** a query against the medicine catalog to find the most likely real medicine(s) it refers to.

### 10.2 Normalization

`normalizeMedicineName(raw: string)` runs a sequence of extraction passes over the input text:

```text
"Dolo650 Tab 15's"
        ↓ 1. strip punctuation
        ↓ 2. extract dosage form   → matches "Tab" against DOSAGE_FORM_PATTERNS → TABLET
        ↓ 3. extract strength      → STRENGTH_PATTERN regex finds "650" + unit inference
        ↓                            (bare numbers >1000 assumed mcg, else mg → "650mg")
        ↓ 4. extract pack size     → PACK_PATTERN matches "15's" → packSize: "15"
        ↓ 5. strip NOISE_WORDS from what's left ("of", "pvt", "pharma", etc.)
        ↓
{ brandName: "Dolo", dosageForm: "TABLET", strength: "650mg", packSize: "15",
  confidence: 0.5 (base) + 0.2 (strength found) + 0.15 (dosage form found)
              + 0.15 (cleaned name > 2 chars) = 1.0 (capped) }
```

### 10.3 Multi-strategy fuzzy matching, ranked by confidence

`FuzzyMedicineMatcher.search(query)` tries several strategies **in order of decreasing certainty**, stopping early once enough confident results are found — this is a deliberate performance/accuracy trade-off, not an oversight:

```text
1. Exact barcode match         → score 1.0   (matchType: BARCODE)
2. Exact name/brandName match  → score 1.0   (matchType: EXACT)
3. Known alias match           → score 0.95  (matchType: ALIAS)
4. Fuse.js fuzzy match on name/brandName (threshold 0.4)
                                → score (1 − fuseScore) × 0.85   (matchType: FUZZY)
5. Fuse.js fuzzy match on genericName/searchTokens (threshold 0.3, only runs if
   strategy 4 found fewer than 3 results, or a generic name is present)
                                → score (1 − fuseScore) × 0.75   (matchType: COMPOSITION)
6. Token-overlap fallback (only if still fewer than 3 results)
                                → Jaccard-like overlap ratio × 0.65 (matchType: TOKEN)

Results deduped by medicine ID, sorted by score descending, sliced to `limit`.
```

**Why this specific cascade, rather than always running every strategy and combining scores?** Running an exact match check first is essentially free (a hash-map lookup) and, when it hits, is unambiguously correct — there's no reason to also run the much more expensive fuzzy-matching machinery (Fuse.js scans, token-set comparisons) if the input already matched something exactly. Each stage is progressively more expensive and progressively less certain, so the cascade only pays the cost of a later, fuzzier stage when the earlier, cheaper, more-confident stages didn't already produce enough results.

`searchWithStrengthFilter()` layers one more refinement on top: after getting ranked results, it re-checks whether each candidate's own parsed strength matches the strength extracted from the *query* — if "Dolo 650" is searched and a candidate medicine is genuinely 650mg, its score gets a +0.1 boost (capped at 1.0), nudging the correct strength variant above a same-brand-different-strength false positive.

### 10.4 Where Meilisearch fits (and why it's optional)

`meilisearch-client.ts` defines index settings for an optional, much faster full-text search engine (typo tolerance, curated synonyms for ~14 common Indian generic↔brand pairs like `paracetamol ↔ acetaminophen/pcm/para`) — but per the deployment documentation, **Meilisearch isn't actually deployed** in the free-tier production stack. The app falls back entirely to the in-memory `FuzzyMedicineMatcher` described above. This is a real, honest example of designing for a future upgrade path (swap in a real search engine once traffic or catalog size justifies its hosting cost) without blocking the current free-tier deployment on it.

#### 💬 Interview Questions — Section 10

**Beginner**
- *What is "fuzzy matching," in plain terms?* Finding the closest match to a search term even when it's not spelled exactly right — like a search engine still finding "Received" when you type "recieved."

**Intermediate**
- *Why does the matcher try several strategies in a specific order instead of running all of them and picking the best score?* Because the earlier strategies (exact match, barcode match) are both cheaper to compute AND more trustworthy when they hit — there's no reason to pay for an expensive fuzzy search once you already have a guaranteed-correct exact match, so the cascade short-circuits as soon as enough confident results exist.

**Advanced**
- *If the medicine catalog grew from 10,000 to 5 million entries, what would break first in this design, and how does the code already anticipate that?* The in-memory `FuzzyMedicineMatcher` loads the entire catalog into memory and builds its Fuse.js indexes at startup — at 5 million entries, that startup cost and memory footprint would become a real problem, and every API process would need its own full copy of that index. This is precisely the scaling cliff the (currently unused) Meilisearch integration exists to solve — a dedicated, disk-backed, horizontally-scalable search index that all API instances could query remotely instead of each holding a full in-memory copy.

---

## 11. The CSV Import Architecture

### 11.1 The problem: every distributor's spreadsheet is a little different

Indian pharmacy distributors overwhelmingly export purchase invoices from the same family of ERP software (MARG and its clones), in a distinctive **headerless, positional** format: one `H` (header) row, many `T` (transaction/line-item) rows, one `F` (footer/totals) row — with **no column names at all**, just raw comma-separated values in a fixed column order. The catch: that column *order* differs from distributor to distributor, even though the underlying format convention is the same. A naive "always read column 10 as the batch number" importer would work for exactly one distributor and silently misread every other one's data.

### 11.2 The plugin architecture

```ts
// packages/... (conceptually) — the shared contract every distributor format implements
interface SupplierParser {
  id: string
  label: string
  detect(rows: string[][]): number          // confidence score, 0 to 1
  parse(rows: string[][]): NormalizedInvoice
}
```

```text
createMargParser(config: MargColumnMap): SupplierParser
   — a FACTORY function. Each real distributor is just a small config object naming
     WHICH COLUMN INDEX holds the batch number, expiry, quantity, rate, GST rate, etc.
     for that distributor's specific export layout. Adding a sixth distributor means
     adding one more config object — zero changes to the detection or parsing logic itself.

PARSERS: SupplierParser[] = [
  createMargParser({ id: 'marg-bluestar',    batchCol: 6, expiryCol: 8, ... }),
  createMargParser({ id: 'marg-torrent',     batchCol: 7, expiryCol: 9, ... }),
  createMargParser({ id: 'marg-chandi',      ... }),
  createMargParser({ id: 'margerp-manada',   ... }),
  createMargParser({ id: 'margerp-lifeline', ... }),
]
```

### 11.3 Auto-detection: how the system figures out which distributor's format it's looking at

```text
autoDetect(rows: string[][]):
   for every registered parser:
       run parser.detect(rows) → a confidence score
           (internally: try parsing every T-row using THIS parser's column config, then
            check whether the resulting values look sane — is the "expiry date" column
            actually a plausible date? is the "quantity" column actually a plausible
            positive integer? is the "HSN code" column actually a plausible HSN-shaped
            string, as one extra tiebreaker between two otherwise-similar-scoring configs?)
   pick the parser with the HIGHEST confidence score
   IF that best score is still below a minimum threshold: return null
       (nothing looked confident enough — hand off to a manual "you pick the format" UI
        rather than guessing wrong and silently importing garbage data)
```

**Why validate the *parsed output* for plausibility, rather than just trying to match column headers?** Because there are no column headers at all in this format — the only signal available for "did I pick the right distributor's column layout" is whether interpreting the raw numbers *that way* produces values that make sense (a real calendar date, a positive quantity, a real-looking tax code). This is a clever, pragmatic solution to a genuinely headerless-data problem: let the *shape of correct data* itself be the detector, rather than requiring any metadata that simply isn't present in the file.

### 11.4 Normalizing into one shared shape, then handing off to fuzzy matching

Whichever parser wins detection, its `.parse(rows)` output is the exact same `NormalizedInvoice` shape regardless of which distributor it came from — every downstream step (fuzzy-matching each row's free-text product name against the medicine catalog via `POST /purchases/match-medicines`, building batches, creating the purchase order) operates on that one normalized shape and has **no idea** which distributor's file it originated from. This is the textbook payoff of the plugin pattern: the "messy, format-specific" concern (parsing) is fully isolated from the "clean, format-agnostic" concern (what to do with a normalized purchase line), so growing to support a sixth, seventh, or twentieth distributor never touches the matching or order-creation code at all.

This was verified against **real invoice files from five actual distributors** and is covered by unit tests pinned to their literal row data (`marg-parser.test.ts`) — not a hypothetical design, a working, tested pipeline.

#### 💬 Interview Questions — Section 11

**Beginner**
- *Why can't this importer just read column headers like a normal CSV parser would?* Because the source files genuinely don't have any — MARG-ERP-style exports are raw positional data with no header row naming what each column means.

**Intermediate**
- *What does "the plugin architecture" actually buy you here, concretely?* Supporting a new distributor's file format requires writing one small config object (which column index means what, for that one distributor) and registering it in a list — zero changes to the shared detection logic, the shared parsing logic, or anything downstream (fuzzy matching, batch creation). Without this separation, every new distributor would risk a hand-edited `if/else` chain growing more fragile and harder to test with each addition.

**Advanced**
- *The detector scores confidence by checking whether parsed output "looks plausible" (valid dates, positive quantities). What's a realistic failure mode of that heuristic, and how would you mitigate it?* Two different distributors' column layouts could, by coincidence, both produce plausible-looking (but for one of them, wrong) values for a given file — e.g., if distributor A's "quantity" column and distributor B's "discount" column both happen to contain small positive integers for a particular invoice, a plausibility check alone can't distinguish "parsed correctly" from "accidentally passed the sanity check while parsing the wrong columns." The practical mitigation already built in is the HSN-plausibility tiebreaker (checking a THIRD, more distinctively-shaped field) precisely to reduce this ambiguity; a further improvement would be checking more than one distinguishing field together (e.g., cross-checking that quantity × rate ≈ the row's stated line total) rather than relying on any single field's plausibility alone.

---

## 12. Libraries & Why They Were Chosen

### 12.1 Backend (`apps/api`)

| Library | Why it's here | What breaks/gets harder without it |
|---|---|---|
| **Fastify** | The web framework itself — chosen over Express for lower per-request overhead and first-class JSON Schema/Zod-friendly validation | Express would work but requires more manual wiring for validation and is measurably slower under load |
| **@fastify/jwt** | Signs and verifies JWTs, integrates `request.jwtVerify()`/`app.jwt.sign()` directly into the Fastify request lifecycle | Would need to hand-roll JWT signing/verification with the raw `jsonwebtoken` package and manually wire it into every route |
| **@fastify/cors, @fastify/helmet, @fastify/rate-limit** | Standard, battle-tested security/hardening middleware (origin allow-listing, security headers, brute-force throttling) | Rolling your own CORS or rate-limiting logic is a well-known source of subtle security bugs — these are exactly the kind of "don't reinvent this" infrastructure |
| **zod** | Runtime schema validation for every request body/query — and its errors integrate directly into the central error handler | Without it, every route would need hand-written `if (!body.email) throw ...` checks, easy to forget a field or get a check subtly wrong |
| **bcryptjs** | Password and OTP-code hashing | Storing passwords in plaintext or with a weak/fast hash (like plain SHA-256) is a textbook security failure — bcrypt is deliberately slow to make brute-forcing leaked hashes impractical |
| **Prisma (`@rxflow/db`)** | Type-safe database access + schema management (see Section 4) | Hand-written SQL everywhere loses compile-time type safety on every query and reopens the door to SQL-injection bugs if string interpolation is ever used carelessly |
| **dayjs** | Lightweight date math (financial-year boundaries, expiry-day calculations) | Moment.js (the older, larger alternative) is now in maintenance-only mode and ships a much bigger bundle |
| **resend** | Transactional email delivery (password reset, OTP codes) via a modern, generous-free-tier email API | Rolling raw SMTP is far more fragile (deliverability, spam-filtering) than using a dedicated transactional email provider |
| **pino / pino-pretty** | Structured JSON logging in production, human-readable pretty-printing in development | `console.log` doesn't give you log levels, structured fields, or easy log aggregation in production |
| **tsx** | Runs TypeScript directly (`tsx watch src/server.ts`) without a separate compile step | Without it, every code change would need an explicit `tsc` build before the server picks it up |

### 12.2 Frontend (`apps/web`)

| Library | Why it's here | What breaks/gets harder without it |
|---|---|---|
| **Next.js 14 (App Router)** | File-based routing, React Server/Client Component model, built-in bundling/optimization, one framework for the whole frontend | A bare Vite+React SPA would need a router library (react-router) and separate build tooling wired up by hand |
| **@tanstack/react-query** | Server-state caching, background refetching, and the `invalidateQueries` mechanism that powers real-time sync (Section 9) | Every page would need its own hand-rolled loading/error/caching logic, and there'd be no single, app-wide "please refetch this" signal |
| **zustand** | The one piece of genuinely global client state (notifications) | Redux would work but is much heavier machinery (actions, reducers, dispatch, middleware) for a single small store |
| **react-hook-form + @hookform/resolvers + zod** | Form state management with schema-based validation, shared validation schemas with the backend's mental model | Manually tracking every field's value/error/touched state in `useState` for every form is repetitive and error-prone |
| **axios** | The HTTP client, chosen specifically for its interceptor API (used for automatic token attachment and token-refresh-on-401 — see Section 5.3) | The native `fetch` API has no built-in interceptor concept; replicating the same auto-refresh behavior would require wrapping every single call by hand |
| **recharts** | Dashboard charts (revenue trend, sales analytics) | A lower-level library like D3 would give more control but require far more code to build the same charts |
| **gsap** | Entrance animations (`AnimatedSection`) — chosen for fine-grained control and built-in `prefers-reduced-motion` respect | CSS-only animations are more limited for the staggered, sequenced entrance effects used here |
| **papaparse** | CSV parsing on the client (bulk imports, the distributor-format detection pipeline) | Hand-parsing CSV text is notoriously fiddly (quoted commas, embedded newlines) — a dedicated, well-tested parser avoids re-solving already-solved edge cases |
| **xlsx, jspdf, jspdf-autotable** | Excel export (GST reports) and PDF generation (invoices) | Government GST report formats and printable invoices are expected in specific file formats; generating them client-side avoids needing a separate document-generation backend service |
| **lucide-react** | Icon set used throughout the UI | Any consistent icon library would do; this one is lightweight and tree-shakeable (only the icons actually imported end up in the bundle) |
| **sonner** | Toast notifications | A small, purpose-built library rather than hand-rolling a toast queue/animation system |

---

## 13. Configuration Files Explained

### 13.1 `pnpm-workspace.yaml`
```yaml
packages: ['apps/*', 'packages/*']
```
Tells pnpm which folders are independent workspace packages that can depend on each other by name (e.g. `apps/api` depending on `"@rxflow/db": "workspace:*"` resolves to the local `packages/db` folder directly, not a published npm package).

### 13.2 `turbo.json`
Defines the **task pipeline** — which tasks depend on which other tasks, and what output each task produces (so Turborepo can cache results and skip re-running unchanged work):
```json
"build":      { "dependsOn": ["^build"], "outputs": [".next/**", "!.next/cache/**", "dist/**"] }
"dev":        { "cache": false, "persistent": true }
"db:generate":{ "cache": false }
```
The `^build` dependency means "build every package this one depends on, first" — e.g. `apps/api`'s build depends on `packages/db`'s build completing first, since the API imports the generated Prisma client.

### 13.3 `tsconfig.base.json`
Shared, strict TypeScript settings inherited by every app/package: `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`. **Why so strict?** Every one of those flags catches a real class of bug at compile time instead of runtime — an unused import that suggests dead code, a function that forgets to return on one code path, a switch statement missing a `break`. For a solo-maintained codebase, the compiler catching these before they ever run is a substitute for the code-review a second engineer would otherwise provide.

### 13.4 `vitest.config.ts`
```ts
test: { include: ['apps/**/src/**/*.test.ts', 'packages/**/src/**/*.test.ts'], environment: 'node' }
```
One test runner configuration at the repository root, rather than a separate one per app — `pnpm test` from anywhere in the repo discovers and runs every `.test.ts` file across the entire monorepo in one pass.

### 13.5 `apps/web/tailwind.config.ts`
Defines the design-token layer (the "Dispensary Ledger" system — see Section 7): a custom warm-neutral color scale replacing Tailwind's default cool grays, a signature viridian-green brand color, a deliberately sharp (2–8px) border-radius scale, and a warm, low-opacity shadow scale. This is the single file that, if changed, would re-theme every component in the app at once, since every component references these named tokens (`bg-brand-600`, `text-surface-500`) rather than hardcoded hex values.

### 13.6 Environment variables (`.env`)

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | API (Prisma) | Pooled Postgres connection — used for all runtime queries |
| `DIRECT_URL` | API (Prisma) | Unpooled Postgres connection — used only for schema changes (`db push`) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | API | Signing keys for access/refresh tokens (required, min 32 chars — validated at startup) |
| `CORS_ORIGIN` | API | Comma-separated allow-list of origins permitted to call the API (supports `*` for open/LAN use) |
| `RESEND_API_KEY` / `EMAIL_FROM` | API | Transactional email delivery for password reset/OTP; if unset, emails log to console instead of sending |
| `NEXT_PUBLIC_API_URL` | Frontend (build-time, baked into the client bundle) | The base URL the frontend's axios client and SSE `EventSource` point at |
| `PORT` | API | Which port the Fastify server listens on |
| `STORAGE_PROVIDER` / `STORAGE_BASE_URL` | API | File storage strategy (currently `local` on the free tier — not durable across Render redeploys, a documented limitation) |

**Why is env validation done with Zod (`utils/env.ts`) instead of just reading `process.env.X` directly everywhere?** A missing or malformed environment variable (e.g. a `JWT_SECRET` under 32 characters) would otherwise fail silently or with a cryptic downstream error, possibly well after startup, in whatever code path first happens to use it. Validating the entire environment once at boot, and calling `process.exit(1)` with a clear, itemized error list if anything's wrong, means a misconfigured deployment fails loudly and immediately, at the moment it's easiest to diagnose — not three requests later, in production, as a confusing 500 error.

---

## 14. Testing & CI

### 14.1 What's actually tested, and why these specific things

The test suite (Vitest, 32 tests across 3 files) deliberately targets the **pure, side-effect-free business logic** — code with no database, no HTTP request, and no browser required to execute — because that's exactly the code where a subtle arithmetic or logic bug is both easy to introduce and hard to notice just by looking at it:

- **`order-math.test.ts`** — every GST/discount/commission calculation path described in Section 8: single-line and multi-line totals, the special-discount tax-scaling behavior (percent, flat amount, capping, stacking with line discounts), and commission math (net-of-tax base, fractional percentages, flat bonuses).
- **`financial-year.test.ts`** — the Indian fiscal-year boundary logic (Apr 1–Mar 31), specifically pinning the exact Mar 31 → Apr 1 UTC boundary flip and the FY-number formatting/padding rules.
- **`marg-parser.test.ts`** — the distributor CSV auto-detection and parsing logic (Section 11), using **literal rows copied from real distributor invoices**, not synthetic fixtures — so a regression in column-mapping or date-parsing logic would be caught against the actual data shape it needs to handle in production.

### 14.2 A real bug this test suite caught

While writing the fiscal-year tests, pinning the exact UTC boundary revealed that `getFinancialYear()` computed the year using the server's **local** timezone getters, while the paired `getFinancialYearBounds()` function built its date range using **UTC** getters — two functions meant to agree with each other could silently disagree near the Mar 31/Apr 1 boundary depending on what timezone the server process happened to be running in. The fix was straightforward once found (switch both functions to UTC consistently), but the bug itself was invisible in ordinary manual testing — it only surfaced because a test deliberately pinned the exact boundary moment in UTC and compared it against the function's actual local-time-based output.

### 14.3 CI pipeline (`.github/workflows/ci.yml`)

Every push to `main` and every pull request runs, in order:

```text
1. Checkout code
2. Install pnpm 9.1.0, Node 20 (with pnpm cache)
3. pnpm install --frozen-lockfile=false
4. Generate the Prisma client (packages/db)
5. Typecheck apps/web (tsc --noEmit)
6. Typecheck apps/api (tsc --noEmit)
7. Run the full test suite (pnpm test)
8. Production build the frontend (pnpm --filter @rxflow/web build)
```
Concurrency is configured to **cancel an in-progress run** if a new commit lands on the same branch/PR before the previous run finished — no point finishing a CI run against code that's already been superseded.

**Why typecheck both apps separately, rather than one combined `tsc` pass?** They have different `tsconfig.json` settings (the API runs via `tsx` and never emits compiled output; the frontend is built by Next.js's own compiler) — checking them independently catches type errors specific to each app's actual build target, rather than a single merged check that might miss an error only one of the two configurations would actually surface.

#### 💬 Interview Questions — Sections 12–14

**Beginner**
- *What is CI, in plain terms?* An automated process that runs every time code is pushed, checking that it still compiles, passes its tests, and builds successfully — catching mistakes before they reach production, without a human needing to manually run those checks every time.

**Intermediate**
- *Why test `order-math.ts` and `financial-year.ts` specifically, rather than trying to test the API routes directly?* Those two files are pure functions — same input always produces the same output, no database or network call involved — which makes them fast, reliable, and trivial to test in isolation. Testing a full route would require spinning up a database, seeding realistic data, and mocking authentication, for a large amount of setup cost to verify the same underlying arithmetic that's already fully covered by testing the pure function directly.

**Advanced**
- *The CSV parser tests use literal rows from real invoices instead of made-up sample data. Why does that matter?* Synthetic test data is written by the same person who wrote the parser, and tends to unconsciously avoid exactly the messy edge cases (unusual date formats, inconsistent spacing, stray characters) that real-world data actually contains — a parser can pass 100% of hand-crafted tests and still fail on the first real invoice it sees. Pinning tests to actual distributor rows means the tests are validating against the real shape of the problem, not a simplified mental model of it.

---

## 15. Deployment Architecture

### 15.1 The three services, and why each host was chosen

```text
┌─────────────┐        ┌──────────────┐        ┌─────────────┐
│   Vercel     │        │    Render     │        │     Neon     │
│  (frontend)  │───────▶│   (backend)   │───────▶│  (database)  │
│  Next.js 14  │  HTTPS │   Fastify     │ Prisma │  PostgreSQL  │
│  push-to-    │        │  persistent   │        │  serverless, │
│  deploy      │        │  Node process │        │  auto-pause  │
└─────────────┘        └──────────────┘        └─────────────┘
```

- **Vercel** hosts the Next.js frontend. Its Root Directory is set (in the Vercel dashboard, not a committed `vercel.json`) to `apps/web`, and `NEXT_PUBLIC_API_URL` points it at the deployed Render API URL. Push-to-deploy means every merge to `main` automatically rebuilds and redeploys.
- **Render** hosts the Fastify API as `render.yaml` describes: a real, persistent Node process (not a serverless function), `plan: free`, health-checked at `/health`. This is a deliberate, non-negotiable requirement given Server-Sent Events need a connection that stays open — a serverless function model, which spins up per-request and tears down after, is fundamentally incompatible with holding an SSE connection open indefinitely.
- **Neon** provides serverless Postgres — genuinely free, always-on (with an auto-pause-after-idle behavior), and specifically offering the pooled/direct connection-string split described in Section 4.3.

### 15.2 Free-tier trade-offs, stated plainly

| Trade-off | What it means in practice |
|---|---|
| Render sleeps after 15 minutes idle | The first request after a quiet period can take up to ~50 seconds while the service wakes — the README explicitly warns users about this rather than letting it look like a bug |
| Neon auto-pauses after 5 minutes idle | Roughly a 1-second wake delay on the database side — much less noticeable than Render's cold start |
| Local file storage (`STORAGE_PROVIDER=local`) | Uploaded files are **not durable** across a Render redeploy (the filesystem is ephemeral); a real production deployment would swap this for S3/Cloudinary/R2, which the storage abstraction already anticipates via the `STORAGE_PROVIDER` env var |
| Meilisearch/Redis are optional and not deployed | The app falls back to in-memory alternatives (the fuzzy matcher, a per-process pub/sub map) rather than requiring paid infrastructure |

### 15.3 Why `prisma db push` in the Render build step is deliberately non-fatal

```yaml
buildCommand: |
  npm install -g pnpm@9.1.0
  pnpm install --prod=false --frozen-lockfile=false
  cd packages/db && pnpm exec prisma generate
  (pnpm exec prisma db push --accept-data-loss || echo "schema already applied, continuing")
  (pnpm exec tsx prisma/seed.ts || echo "seed skipped (non-fatal)")
```

On a **redeploy** where the schema hasn't changed, `db push` would otherwise fail with errors like "type X already exists" (re-attempting to create enum types that are already present) and — without the `|| echo ...` fallback — that failure would **block the entire deployment**, even though the actual application code changes have nothing to do with the database schema. Making it non-fatal means a redeploy that only changed application logic (a bug fix, a new UI feature) isn't blocked by a schema-sync step that has nothing new to do. The trade-off, and a real failure mode this project hit in practice: if a schema change genuinely *does* need to reach production and `db push` fails for an unrelated reason, that failure is now silent — the deploy "succeeds" while the database is actually out of sync with the code that expects the new columns to exist. The mitigating practice this project follows: every schema change ships as its own idempotent, hand-written SQL file in `manual-migrations/`, runnable directly and safely (via `IF NOT EXISTS` guards) in the Neon SQL console as a manual verification step alongside the automated (but silently-failable) `db push`.

#### 💬 Interview Questions — Section 15

**Beginner**
- *Why are there three separate hosting providers instead of one?* Each one is free-tier-friendly for the specific thing it's good at: Vercel for static/serverless frontend hosting, Render for a persistent backend process, Neon for managed Postgres — no single free-tier provider covers all three well.

**Intermediate**
- *What's the real, concrete reason the API can't be a Vercel serverless function alongside the frontend?* Server-Sent Events require a connection that stays open indefinitely to push live updates; a serverless function is torn down shortly after handling its request, which is fundamentally incompatible with holding a connection open. The API needs a platform built for long-running processes.

**Advanced**
- *The `db push` step is deliberately allowed to fail silently on redeploy. What's the actual risk of that design, and how does this project mitigate it without giving up the convenience?* If a schema change genuinely needs to reach production and `db push` fails for a real reason (not just "already applied"), the deploy still reports success, and the running API would start throwing schema-mismatch errors (Prisma's `P2022`/`P2021`, specifically handled by the central error handler with a "schema out of date" message) against a database that's silently out of sync. The mitigation is that every schema change is *also* captured as a standalone, idempotent SQL file that can be run manually and verified directly against the production database, independent of whether the automated, best-effort `db push` step happened to succeed — trading a small amount of manual discipline for not blocking every unrelated deploy on database-sync steps that usually have nothing new to do.

---

## 16. User Action Traces (End-to-End Flows)

### 16.1 Trace: A pharmacist logs in

```text
User types email+password, clicks "Sign in"
        ↓
apps/web/src/app/(auth)/login/page.tsx: react-hook-form's onSubmit fires
        ↓
authService.login({email, password})   [apps/web/src/lib/auth.ts]
        ↓
api.post('/auth/login', {...})          [axios instance, apps/web/src/lib/api.ts]
        ↓ ── network ──▶
routes/auth.ts POST /auth/login (rate-limited 10/min)
        ↓
loginSchema.parse(body) → prisma.user.findFirst → bcrypt.compare → check tenant.isActive
        ↓
sign accessToken (15m) + refreshToken (7d); bcrypt-hash + store refreshToken; update lastLoginAt
        ↓ ── response ──▶
authService.login(): localStorage.setItem for accessToken, refreshToken, and the full user JSON
        ↓
router.push('/dashboard')
        ↓
(dashboard) layout.tsx: authService.isAuthenticated() now true → renders Sidebar/TopBar/page
        ↓
dashboard/page.tsx mounts → useQuery(['dashboard']) fires → GET /dashboard
        ↓
routes/dashboard.ts runs its large Promise.all of aggregates
        ↓ ── response ──▶
React Query caches the result → MetricCard components render today's numbers
```

### 16.2 Trace: A pharmacist bills a customer (POS sale)

```text
Pharmacist searches for a medicine at the Billing screen
        ↓
useQuery(['inventory', search]) → GET /inventory?search=...
        ↓
Clicks the medicine → added to the local cart (component useState, not yet sent anywhere)
        ↓
Picks a batch (or the system defaults to soonest-expiring), sets quantity
        ↓
Clicks "Complete Sale"
        ↓
useMutation → POST /orders  { type:'SALE', items:[...], customerId?, salesRepId? }
        ↓
[Section 6.4's full order-creation trace runs here: totals → special discount →
 commission → FY-aware order number → $transaction (create order+items, deduct
 inventory/batch stock, bump customer stats) → retry-on-P2002 → audit+SSE publish]
        ↓ ── response: 201, the new Order ──▶
Frontend immediately calls POST /invoices/from-order/:id to generate the GST invoice
        ↓
[Section 6.5's invoice-generation trace runs: inter/intra-state GST split → round-off
 → create Invoice+InvoiceItems → audit+SSE publish]
        ↓
Cart clears; success toast shown; option to print/share the invoice
        ↓
MEANWHILE, on every OTHER device logged into this same pharmacy:
   LiveSync's EventSource receives the pushed event
   → queryClient.invalidateQueries for ['orders','inventory','dashboard',...]
   → their inventory count for this medicine silently updates within moments,
     with no manual refresh needed
```

### 16.3 Trace: Importing a supplier's purchase invoice via CSV

```text
Pharmacist opens New Purchase → chooses CSV import → uploads the distributor's file
        ↓
Papaparse parses the raw file into rows client-side
        ↓
lib/purchase-import/registry.ts: autoDetect(rows)
   → scores every registered distributor parser's plausibility on this file
   → picks the highest-confidence match (or surfaces a manual-picker if none confident enough)
        ↓
winning parser's .parse(rows) → NormalizedInvoice (format-agnostic shape)
        ↓
For each normalized line: POST /purchases/match-medicines with the free-text product name
        ↓
routes/purchases.ts: normalizes + scores against up to 5000 active medicines,
   returns top-3 candidates per line
        ↓
Frontend shows each line with its best-guess medicine match; pharmacist confirms/corrects
        ↓
Submit → POST /purchases/bulk-import  { supplierId, storeId, rows:[...] }
        ↓
routes/purchases.ts: validates supplier/store belong to tenant, all medicineIds exist
   → computes line totals (same order-math pattern) → generates FY-aware PO number
   → $transaction: create Order (status CONFIRMED) + items; for each row,
     find-or-create InventoryItem, create Batch, increment stock; bump supplier.totalPurchases
        ↓ ── response ──▶
Purchase order created; stock is now on-hand and sellable
```

### 16.4 Trace: A customer return (credit note)

```text
Staff opens the original sale invoice → "Process Return"
        ↓
Selects which line items and quantities are being returned, a reason, optionally a
restock batch
        ↓
POST /invoices/:id/credit-note
        ↓
[Section 6.6's full trace: match each line to the original invoice → sum PRIOR returns
 against that line (soft-keyed by medicineId+batchNumber) → reject if this would exceed
 the original quantity → pro-rate tax/discount by the returned fraction]
        ↓
$transaction: create CREDIT_NOTE invoice (paymentStatus: PAID immediately)
   → IF restocking: increment batch + inventory quantities
   → write a CREDIT LedgerEntry against the customer, recompute running balance
   → decrement customer.outstandingBalance
        ↓ ── response ──▶
Credit note created; customer's outstanding balance reduced; stock restored if applicable;
audit logged; SSE-invalidates inventory/invoice caches on every connected device
```

---

## 17. Core Concepts Explained

Every advanced term used elsewhere in this document, explained twice — once simply, once technically — with a direct pointer to where it shows up in this actual codebase.

### 17.1 ACID and database transactions

**Simple:** Imagine moving money between two piggy banks — you take $10 out of one and it MUST end up in the other, never just vanish or get duplicated if something interrupts you halfway. A database transaction is that same all-or-nothing guarantee applied to a group of changes.
**Technical:** ACID = **A**tomicity (all operations in a transaction succeed or none do), **C**onsistency (the database moves from one valid state to another, never a broken in-between state), **I**solation (concurrent transactions don't see each other's uncommitted changes — Postgres defaults to READ COMMITTED here), **D**urability (once committed, the change survives even a crash immediately after).
**In RxFlow:** `prisma.$transaction(...)` wraps order creation, invoice generation, credit notes, stock takes, and stock transfers — every one of these touches multiple tables that must never be left disagreeing with each other (see Section 6.4 for the fullest example).

### 17.2 REST APIs

**Simple:** A shared vocabulary for asking a server to do things to named "resources" — `GET /orders` means "show me orders," `POST /orders` means "create a new order," using the same verb+noun pattern for every kind of resource in the system.
**Technical:** An architectural style where each URL identifies a resource, and the HTTP method (GET/POST/PUT/PATCH/DELETE) expresses the action, with statelessness (each request carries everything needed to understand it — here, the JWT) as a core principle.
**In RxFlow:** every one of the 22 route files follows this pattern (`GET /medicines`, `POST /medicines`, `PUT /medicines/:id`) — the one deliberate exception is `GET /events`, which behaves like a REST endpoint on the surface but actually holds the connection open indefinitely for SSE, rather than returning a single response.

### 17.3 JWT (JSON Web Token)

Covered in full in [Section 5.1](#51-the-mental-model).

### 17.4 Promises and async/await

**Simple:** A promise is a receipt for work that isn't done yet — "your order is being prepared, here's a ticket that will eventually tell you it's ready (or that something went wrong)." `async`/`await` lets code that deals with these receipts read top-to-bottom, as if each step just waited its turn, instead of a tangle of nested callbacks.
**Technical:** A `Promise` represents an eventual value from an asynchronous operation, resolving (success) or rejecting (failure); `await` pauses execution of an `async` function until the awaited promise settles, without blocking the whole JavaScript thread.
**In RxFlow:** virtually every route handler is an `async` function; `Promise.all([...])` is used in `dashboard.ts` to run many independent database aggregates concurrently rather than one after another, which is why the dashboard endpoint can compute a dozen different metrics without taking a dozen times as long as computing just one.

### 17.5 Server Components, Client Components, Hydration

Covered in full in [Section 7.1](#71-what-happens-when-a-user-opens-the-application).

**Definition — Hydration:**
**Simple:** Imagine a printed photo of a working machine — it looks complete, but you can't press any of its buttons yet. Hydration is the moment JavaScript "wakes up" that photo in the browser and its buttons actually start working.
**Technical:** The process by which React attaches event listeners and internal state to server-rendered HTML that was sent to the browser as static markup, making it interactive without re-rendering the visible content from scratch.
**In RxFlow:** because nearly every page here is a Client Component rendering entirely in the browser rather than being pre-rendered as static HTML on the server, hydration in the classic "server HTML + client JS attaching to it" sense is a relatively small factor for this specific app compared to a more content-heavy, server-rendered site — but the root `layout.tsx` and its `<html suppressHydrationWarning>` attribute exist precisely because some values (like the current date shown on the dashboard) can legitimately differ by milliseconds between server and client, and this flag tells React not to treat that specific, expected mismatch as an error.

### 17.6 Caching (as used here)

**Simple:** Keeping a copy of an answer nearby so you don't have to ask the same question again a second later.
**Technical:** React Query caches server responses keyed by a "query key" array; a cached entry is considered fresh for `staleTime` (60 seconds here) before it's eligible for a background refetch, and explicit `invalidateQueries` calls can mark it stale immediately regardless of that timer.
**In RxFlow:** this is the exact mechanism [Section 9](#9-real-time-sync-sse) depends on — the SSE handler doesn't push new *data*, it pushes a signal saying "these cache keys are stale," and React Query's own caching layer handles the actual refetch.

### 17.7 Rate limiting

**Simple:** A bouncer who only lets a certain number of people in per minute, no matter how hard the crowd pushes at the door.
**Technical:** Restricting how many requests a client can make in a given time window, implemented here via `@fastify/rate-limit`, both globally (200/min, applied to every route) and with much stricter per-route overrides on sensitive auth endpoints (login: 10/min, password reset: 5 per 5 minutes) specifically to blunt brute-force and account-enumeration attempts.
**In RxFlow:** see [Section 5](#5-authentication--authorization) for the specific auth-route limits and the reasoning behind them.

### 17.8 Idempotency

**Simple:** An elevator call button is idempotent — pressing it five times doesn't call five elevators. A "delete this order" click that isn't idempotent might delete it, then error confusingly on a second accidental click because it's already gone.
**Technical:** An operation is idempotent if performing it multiple times has the same effect as performing it once.
**In RxFlow:** `POST /orders` is explicitly **not** idempotent (a real design fact, not an oversight) — resubmitting it creates a second order and deducts stock twice, which is exactly why the retry-on-collision logic in Section 6.4 regenerates a fresh order number on retry rather than blindly resubmitting the identical request.

---

## 18. Interview Preparation

Every section above ends with its own beginner/intermediate/advanced questions. This section collects the **cross-cutting** questions an interviewer is likely to ask that don't belong to any single section — the "zoom out" questions.

### 18.1 Common follow-up questions, answered honestly

**"What if the database goes down?"**
Every write in this system goes directly to Postgres with no local queue or offline fallback — a database outage means the API can't serve reads or accept writes at all; it would return 500 errors (or timeouts) until the database recovers. Neon's free tier has no built-in high-availability failover. A production-hardening step here would be a managed Postgres tier with automatic failover/read replicas, plus circuit-breaking on the API side to fail fast with a clear "service temporarily unavailable" rather than hanging requests.

**"How would you scale this to one million users?"**
Break the honest scaling story into layers, since "users" for a B2B pharmacy ERP means concurrent pharmacies, not concurrent shoppers: (1) The API is currently a single Render instance — horizontal scaling (multiple instances behind a load balancer) is straightforward for the stateless REST endpoints, but requires swapping the in-memory SSE pub/sub for Redis pub/sub first (Section 9.3), since that's the one piece of genuinely per-process state. (2) The database would need connection pooling tuned for many more concurrent connections (Neon's pooler already exists for this) and likely read replicas for the heavier read-only aggregate endpoints (`/dashboard`, `/reports/*`). (3) The in-memory fuzzy medicine matcher (Section 10) loads the whole catalog into every process's memory — at real scale this is exactly what the (currently unused) Meilisearch integration exists to replace, moving that index out of application memory and into a dedicated, horizontally-scalable search service. (4) Multi-tenancy itself (Section 5.5) would need the application-layer tenant filter hardened into a structural guarantee (a Prisma extension or Postgres RLS) before onboarding enough tenants that a single missed filter becomes a real, statistically-inevitable risk rather than a theoretical one.

**"How would you optimize this?"**
The dashboard endpoint (`GET /dashboard`) already runs its dozen-plus aggregate queries concurrently via `Promise.all` rather than serially — that's a real optimization already in place, not a gap. The next honest opportunity is that several of those aggregates (today's sales, top medicines, revenue chart) recompute from scratch on every request; a short-TTL cache (even an in-memory one, given the free-tier constraints) on the more expensive raw-SQL aggregates would cut database load significantly for a dashboard that's realistically viewed far more often than the underlying data changes minute-to-minute.

**"Why did you choose this architecture?"**
Answered in full in [Section 2.3](#23-why-this-architecture-and-what-it-costs) — the short version: every choice was made to fit inside a genuinely free hosting budget while still supporting real-time multi-device sync, which specifically ruled out an all-serverless frontend+backend architecture.

**"What would you do differently if you rebuilt this today?"**
Two honest answers, matching the gaps already named throughout this document rather than inventing new ones for the sake of having an answer: (1) harden multi-tenancy from application-layer-only to a structural guarantee from day one (a Prisma extension auto-injecting the tenant filter), rather than retrofitting it later; (2) add the row-level lock (`SELECT ... FOR UPDATE`) on the inventory-deduction path from the start, rather than discovering the race condition risk in a design review after the fact.

### 18.2 The honest gaps in this codebase, and how to talk about them

An interviewer who's read the code (or asks pointed follow-ups) may probe for exactly these — the right posture is to name them proactively and precisely, the same way this project's own developer would when auditing it:

1. **Multi-tenancy is application-enforced, not database-enforced** (Section 5.5) — every tenant-scoped query manually filters by `tenantId`; there's no middleware, Prisma extension, or RLS policy backstopping a forgotten filter.
2. **The inventory-deduction race condition** (Section 6.4) — check-then-decrement inside a transaction, but with no row lock, version column, or DB constraint preventing two simultaneous sales of the last unit.
3. **`requireRole`/`requireTenant` helper functions exist but are unused** — every route inlines its own role/tenant checks instead of composing these shared helpers, a small consistency gap.
4. **No custom hooks in the frontend** (Section 7.6) — several patterns (debounced search, in particular) are duplicated rather than extracted.
5. **The SSE pub/sub is per-process, in-memory** (Section 9.3) — won't fan out correctly across multiple API instances without a Redis swap.
6. **Local file storage on Render is not durable** across redeploys — fine for the current free-tier deployment, would need S3/R2/Cloudinary before any real file-upload feature depended on persistence.
7. **`MedicineCategory` links to `Medicine.category` by matching a string name, not a foreign key** — simple, but means renaming a category requires an explicit bulk-update of every medicine referencing the old name (which `categories.ts` does handle correctly — see Section 6.2's route table — but it's worth knowing this is a string-match relationship, not a real FK, if asked to critique the schema).

Naming these clearly and precisely — with the *specific* mechanism of the gap and the *specific* fix you'd reach for — reads as far stronger technical judgment than either hiding them or being caught off guard by a follow-up question that assumes they don't exist.

---

## 19. Complete Walkthrough

This final section narrates, start to finish, everything that happens across a single representative day using RxFlow — tying every layer covered above into one continuous story.

**6:00 PM, Tuesday.** A distributor's van drops off a box of medicines at "Sunrise Pharmacy." The pharmacist, Priya, opens RxFlow on the counter tablet. Because she was logged in yesterday, `localStorage` still holds a valid (if expired) access token — the very first API call the dashboard makes gets a 401, silently triggers a refresh (Section 5.3), and she never notices any of it happened. The `(dashboard)` layout renders the sidebar and top bar, `GET /dashboard` fires, and within a second she's looking at today's numbers.

She clicks **New Purchase**, uploads the distributor's CSV file. `autoDetect()` (Section 11.3) scores all five registered distributor parsers against the file's actual data shape and picks "Blue Star Pharmaceuticals" format with high confidence — she doesn't have to tell the system which distributor this is; it figured it out from the numbers themselves. Each line's product name gets fuzzy-matched (Section 10.3) against the medicine catalog; two lines are ambiguous and she manually confirms which real medicine they refer to. She submits — `POST /purchases/bulk-import` runs one database transaction that creates the `PURCHASE` order, creates a `Batch` row per line with its expiry date and cost, and increments stock, all atomically (Section 17.1). The invoice's ₹100 delivery charge gets recorded as `transportCharge`, and since a distributor's salesman brought this order in, she records his 2% commission — computed by the exact same `computeCommission()` function that also handles sales-side commission (Section 8.3).

**11:30 AM, Wednesday.** A regular customer walks in for a fever medicine. Priya searches for it at the Billing screen; `GET /inventory?search=...` returns the medicine, showing which batch will sell first (soonest-expiring, per Section 4.5's FEFO reasoning). She adds it to the cart, applies a 5% loyalty discount as a bill-level special discount, and completes the sale. `POST /orders` runs the full transactional trace from Section 6.4: GST-correct totals with the discount scaling tax proportionally down (Section 8.2), a fiscal-year-aware invoice number generated and, on this particular millisecond, actually colliding with a nearly-simultaneous sale being rung up by a second staff member on the counter PC — the retry-on-`P2002` logic silently regenerates a fresh number and the sale completes without either cashier ever seeing an error. Stock decrements inside the same transaction; a `POST /invoices/from-order/:id` call immediately follows to generate the formal GST invoice, splitting into CGST+SGST since both Priya's pharmacy and the customer are in the same state (Section 6.5).

The moment that transaction commits, `audit()` writes the compliance trail row and pushes an SSE event (Section 9.3) to every other device currently connected to Sunrise Pharmacy's account. On the owner's phone, sitting in a different city, the dashboard's inventory count for that medicine silently updates within moments — no refresh button pressed, no polling delay, just React Query's cache being told "this is now stale" and quietly refetching in the background (Section 17.6).

**3:00 PM.** The customer changes their mind about one item and returns it. Priya opens the original invoice and processes a return; `POST /invoices/:id/credit-note` checks that this return, combined with anything already returned against this same line, doesn't exceed what was originally sold (Section 6.6), pro-rates the tax on the returned portion, restocks the medicine back into its original batch, and writes a ledger entry reducing what the customer owes.

**End of month.** The owner opens Reports, generates the GSTR-1 and GSTR-3B returns (Section 6.2), pulling every sale and purchase invoice recorded all month into the exact government-mandated format — numbers that were computed correctly the moment each sale happened, not re-derived or reconstructed after the fact from raw transaction data. HR runs payroll for the month; attendance records feed automatically into loss-of-pay proration (Section 8.4), and marking each payslip paid quietly creates a matching `Expense` row, so payroll flows into the P&L statement with zero additional manual bookkeeping.

None of this required a single desktop PC to stay running, a single point of failure to survive, or any manual reconciliation between "what the software says" and "what actually happened" — because every one of these operations, from a ₹15 fever-tablet sale to a month-end GST return, is the same database, updated transactionally, in real time, visible from any authorized device the moment it happens.

---

*End of PROJECT_DOCUMENTATION.md — this file is maintained as the living technical reference for RxFlow. When the schema, routes, or major architectural decisions change, update the corresponding section directly rather than letting this document drift out of sync with the actual implementation.*
