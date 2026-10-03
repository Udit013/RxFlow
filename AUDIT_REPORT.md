# RxFlow — Security, Reliability & UX Audit (Oct 2026)

Scope: `apps/api` (Fastify + Prisma), `apps/web` (Next.js 14), shared packages.
Validation after changes: API `tsc` ✅ · web `tsc` ✅ · `next lint` 0 errors (was 5) · `next build` ✅ ·
Vitest 44/44 ✅ (was 32; +12 new) · manual browser pass at 375 px and desktop.

---

## 1. Fixed in this pass

### Security

| Sev | Issue | Fix |
|---|---|---|
| **Critical** | **Refresh tokens worked as access tokens.** Both are signed with `JWT_SECRET`; a refresh token (`{ userId }` only) passed `authenticate`, leaving `request.user.tenantId` undefined — and Prisma silently drops `where: { tenantId: undefined }`, so list endpoints would return **every tenant's data**. | `authenticate` now rejects tokens without `userId`/`tenantId`/`role`. Regression test: `middleware/auth.test.ts`. |
| **High** | `authenticate`/`requireRole` didn't `return reply` after sending 401/403, so the route handler could still run. | Early-return in both; `requireRole` also checks `reply.sent`. |
| **High** | **Cross-tenant references.** IDs from request bodies (store, customer, supplier, prescription, sales rep, batch) were written into relations or used as update targets without an ownership check — e.g. a sale could decrement another tenant's batch or bump another tenant's customer totals. | New `utils/tenant-guard.ts` (`assertTenantRefs`) applied to orders, parked sales, inventory batches, temp-purchase conversion, expenses, stock takes, user creation; stock transfers now require the source batch to belong to the source inventory row. |
| **High** | **Backup restore could rewrite the shared medicine catalog.** Any workspace admin (free signup) could overwrite names/MRP/GST of medicines used by all tenants, and `create({ data: m })` mass-assigned arbitrary fields. | Restore is now insert-only for missing medicines, validated through the same schema as `POST /medicines`. |
| **High** | Category rename/delete re-labelled medicines for **all** tenants (global table, name-keyed). | Propagates only when no other tenant uses that category name. |
| Medium | Login timing revealed which emails exist (no bcrypt on unknown user). | Compare against a dummy hash on misses. |
| Medium | OTP codes from `Math.random()`. | `crypto.randomInt`. |
| Medium | `/auth/refresh` had no rate limit. | 30/min. |
| Medium | SSE `?token=` JWTs were written to request logs. | Logger serializer redacts `token=`. |
| Low | Login/registration/staff-invite email checks were case-sensitive (duplicate accounts by case). | Case-insensitive lookups. |
| Low | `taxRate`/`gstRate` accepted any number. | Bounded 0–100. |

### Bugs / reliability

| Issue | Fix |
|---|---|
| **Document numbers could collide permanently.** Numbers were `count(this FY) + 1`; deleting a parked sale lowered the count so the next number re-used an existing one and *every* later sale failed on the unique constraint. Concurrent requests also raced. | `utils/numbering.ts`: next = max(highest existing seq, count) + 1, plus `withUniqueRetry` on P2002. Applied to orders, parked sales, purchases, temp-purchase conversion, invoices, credit/debit notes, stock takes, transfers. Tested. |
| Overselling under concurrent checkouts (check-then-decrement). | Conditional `updateMany` re-asserts the stock floor atomically; loser gets a clear 409. |
| "Insufficient stock" and similar business errors surfaced as a generic **500 Internal Server Error**. | `utils/http-error.ts` — proper 400/404 with the real message. |
| Inventory expiry filters ran after pagination (short pages, wrong totals). | Filters moved into the DB query. |
| Backup import > 1 MB rejected (Fastify default body limit). | 25 MB on `/backup/import`, 5 MB on bulk imports. |
| **Wrong password showed no error** — the axios 401 interceptor tried a token refresh on `/auth/login`, then hard-redirected to `/login`, swallowing the message. | Credential endpoints are excluded from refresh handling. |
| Live sync stuck on "Sync paused" after ~15 min idle (expired token re-used on every reconnect). | Reconnect first triggers the refresh flow. |
| Dashboard rendered and fired all queries before the auth check (401 burst + flash). | Shell is gated on the session check. |
| Corrupted `rxflow_user` in localStorage crashed the app. | Guarded `JSON.parse`. |
| Downloads could be cancelled by synchronous `revokeObjectURL`. | Deferred revoke. |
| Missing favicon (404 on every load). | `app/icon.svg`. |

### Performance

- SheetJS (~400 kB) and jsPDF + autotable (~350 kB) are now loaded on demand. First-load JS: staff 318 → 226 kB, suppliers 313 → 221 kB, and every page with an Export button or PDF action is smaller.
- React Query no longer retries 4xx responses (they can't succeed; the retry only delayed the error).

### UI / UX & accessibility

- **Mobile navigation:** below 1024 px the sidebar is an off-canvas drawer (hamburger, scrim, Escape, auto-close on navigation). Previously the 240 px sidebar was always visible, leaving ~120 px for content on phones.
- Responsive top bar (fluid search, hidden ⌘K hint on small screens), `h-dvh` shell, tighter mobile padding.
- 31 data tables wrapped in horizontal-scroll containers. Before, `overflow-x: hidden` on `body` made their right-hand columns unreachable on narrow screens. Tables already inside a scroll box were left alone to keep sticky headers working.
- Accessibility: skip-to-content link, `aria-current` on the active nav item, labelled icon buttons, `aria-expanded`/`aria-haspopup` on the menu and drawer toggles, Escape closes the account menu, visible focus rings in the sidebar, improved contrast of inactive nav text.
- **Splash screen** (`components/splash-screen.tsx` + `globals.css`): server-rendered so it paints before JS loads. It uses the brand's paper ground, viridian mark, display wordmark and a sweeping ledger rule, and cross-fades out as soon as React hydrates, with no artificial delay. It respects `prefers-reduced-motion`, is announced as a status to screen readers, is hidden for print and the receipt print route, is hidden without JS, and has a 12 s CSS fail-safe so it can never trap the user.

---

## 2. Follow-up pass — design decisions applied

Validated end to end against a throwaway local Postgres (39 scripted API checks + browser flow
through the Next.js proxy), plus 63 unit tests.

### Shared medicine catalog → per-tenant copy-on-write
- `Medicine.ownerTenantId` (NULL = shared catalog row) and `forkedFromId`.
- Medicines a tenant creates (form, bulk import, backup restore) are **private** to it.
- Editing a shared row never changes it: the tenant gets a private copy (compositions
  included), its stock moves onto the copy, and the original disappears from that tenant's
  catalog only. Later edits reuse the same copy. `SUPER_ADMIN` can still edit shared rows.
- Every catalog read is scoped (list, detail, barcode, global search, CSV matching, bulk-import
  de-duplication, category counts, backup export). Order/stock writes reject another tenant's
  private medicines. The shared fuzzy-matcher index holds shared rows only.
- Category rename/delete now only touches the tenant's own medicines.
- The UI marks shared entries and confirms when a save created the pharmacy's own copy.
- Backfill (in the migration): unverified medicines stocked by exactly one tenant become that
  tenant's private rows; seeded/verified rows stay shared.

### Role-based access control
One matrix in `packages/types` (`canAccess`), enforced for every protected route in
`authenticate` and used by the sidebar to hide destinations:

| Area | Read | Write |
|---|---|---|
| Orders / billing / parked sales | all | Admin, Manager, Pharmacist, Sales rep (Delivery staff: status only) |
| Invoices — create from order, payments | all | billing roles + Accountant |
| Credit notes / purchase returns | all | Admin, Manager, Pharmacist, Accountant |
| Inventory, stock takes, transfers, purchases, medicines, categories | all | Admin, Manager, Pharmacist (deleting categories: Manager+) |
| Customers / suppliers | all | billing/stock roles + Accountant (delete: Manager+) |
| Accounts, reports | Finance (Admin, Manager, Accountant); H1 register & licence expiry also Pharmacist | Finance |
| HR & payroll | Finance | employees/attendance: Manager+; payroll: Finance |
| Sales reps | all (commission report: Finance) | Manager+ (settle: Finance) |
| Audit log | Manager+ (live-sync replay: all) | — |
| Workspace (users, stores, settings, backup, delete) | all (users: Finance) | Admin |

Unlisted writes fail closed (Manager+); Viewer is read-only.

### Tokens out of `localStorage`
- Refresh token → `HttpOnly; SameSite=Strict; Secure` cookie scoped to `/api/v1/auth`. Auth calls
  go through the web app's own origin (`next.config.js` rewrite), so the cookie is first-party
  and survives Safari/third-party-cookie blocking. Access token lives in memory only.
- **Per-device sessions** (`AuthSession` table, SHA-256 token hashes, rotation on every
  refresh). Signing in on a new device no longer signs the others out; logout ends only that
  device; a password reset ends all of them.
- Cross-tab refreshes are serialised with the Web Locks API (rotation-safe).
- Existing sessions migrate transparently: the old `localStorage` token is exchanged once for a
  cookie session and deleted.

### Invoice accounting
- Invoices now carry the order's special discount (spread proportionally, GST on the reduced
  base) and transport charge (`Invoice.otherCharges`, shown on screen, PDF and receipt).
- `POST /invoices/from-order/:id` is idempotent: a repeat returns the existing invoice.
- Payments above the outstanding balance, or on a fully-paid invoice, are rejected.

### Pre-existing bugs found while testing
| Issue | Fix |
|---|---|
| **The custom error handler never ran.** It was registered after the route plugins, which capture their parent's handler at registration, so validation errors became 500s and business errors a bare "Bad Request". | Registered before routes. |
| **Live sync never connected cross-origin.** The SSE stream wrote raw headers and dropped the queued CORS headers, so browsers blocked it (web and API are on different domains). | Queued headers are copied into the stream response. |
| **Refresh-token rotation was ineffective.** bcrypt reads only 72 bytes and all of a user's JWTs share that prefix, so any old refresh token kept working. | SHA-256 hashes + `jti`; legacy bcrypt hashes accepted once. |
| Rate limits keyed on the load balancer's IP (one bucket for everyone). | `trustProxy`. |
| `@rxflow/types` couldn't export runtime values to the API (CommonJS/ESM mismatch — would have crashed the API on boot). | Package marked `"type": "module"`. |

### Deploy notes
- Render's build now runs `prisma/manual-migrations/2026-10-03-ownership-invoice-charges-sessions.sql`
  (idempotent, verified twice in a row). If it fails the build fails, and the previous release
  stays live.
- Vercel needs no new env vars: the auth proxy targets the existing `NEXT_PUBLIC_API_URL`.
- Users are asked to sign in again only if their old session can't be migrated (e.g. it had already expired).

---

## 3. Still open

| # | Sev | Issue | Recommended next step |
|---|---|---|---|
| 1 | Low | `/auth/otp/request` reveals whether an account exists (`sent`, `maskedEmail`). | Uniform response + "if an account exists, a code was sent". |
| 2 | Low | OTP codes are logged in plaintext when email delivery fails (operator fallback while on the Resend sandbox). | Remove once a verified sending domain is configured. |
| 3 | Low | Batch-level quantities can go negative (only inventory totals are floor-guarded). | Conditional decrement on `batch` when negative stock is off. |
| 4 | Low | ~27 modal overlays lack focus trapping / Escape. | Migrate to `@radix-ui/react-dialog` (already a dependency). |
| 5 | Low | Swagger UI (`/docs`) is public. | Gate behind non-production or auth. |
| 6 | Low | SSE pub/sub is in-memory (single instance). | Redis pub/sub before scaling out. |
| 7 | Low | `prisma db push --accept-data-loss` on every deploy. | Adopt `prisma migrate` with a baseline. |
| 8 | Low | With `trustProxy`, a client calling the API directly can spoof `X-Forwarded-For` to dodge IP rate limits. | Pin the proxy hop count once the Vercel→Render chain is confirmed, or key auth limits per account. |
| 9 | Low | The fuzzy medicine matcher indexes only the shared catalog, so tenants' private medicines aren't suggested by it (catalog search and CSV matching do include them). | Per-tenant matcher index if needed. |
