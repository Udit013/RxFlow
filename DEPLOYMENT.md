# Deploying RxFlow for $0

Everything below runs on **free tiers or open-source** software. No card required for the core path.

## The complete free stack

| Layer | Service | Free tier | Why this one |
|-------|---------|-----------|--------------|
| Frontend | **Vercel** | Hobby (free) | Native Next.js, zero config |
| API (Fastify) | **Render** | Free web service | Real container — needed for SSE live-sync. Sleeps after 15 min idle (~50s cold start) |
| Database | **Neon** | Free | Serverless Postgres, ~1s wake from idle, DB branching |
| Auth | **Custom JWT** | — | Already built into the app, $0 forever |
| Email (reset/OTP) | **Resend** | 3k emails/mo | Clean API; only free way to do OTP (SMS isn't free) |
| File storage | **Cloudflare R2** | 10 GB | S3-compatible (app already supports it) |
| Errors | **GlitchTip** or **Sentry** | self-host / 5k events/mo | GlitchTip is open-source + Sentry-API-compatible = unlimited if self-hosted |
| Analytics | **PostHog** | 1M events/mo | Add once you have real users |
| Uptime | **UptimeRobot** | 50 monitors | Pings `/health`; zero ops (vs self-hosting Uptime Kuma) |

### Deliberately deferred (add only when you outgrow free)
- **Redis / Upstash** — the live-sync pub/sub is currently in-memory, which works perfectly on a single Render instance. Only swap to Upstash Redis pub/sub when you run 2+ API instances (the free tier won't). Free when you get there (10k cmd/day).
- **BullMQ** — for scheduled jobs (expiry sweeps, payment reminders, auto-backup). Needs the Redis above. Until then, use a free GitHub Actions cron hitting an authenticated endpoint.

### Apps (later)
- **Mobile:** Expo (React Native) — share the API client + types from this monorepo.
- **Desktop:** **Tauri** (open-source, ~10MB) over Electron (~150MB) unless you need deep native printer drivers.

> **Cost honesty:** the only friction in the free path is Render free *sleeping* after 15 min idle. The repo's **Keep API warm** workflow (`.github/workflows/keep-warm.yml`) pings `/health` every 10 minutes so it normally never sleeps — one always-on free service uses ~744 of Render's 750 free hours a month. When you have a real pharmacy on it daily, ~$7/mo on Render removes the sleep for certain (and gives more CPU). Everything else stays free indefinitely.

---

## 0. Prerequisites

- Code pushed to a **GitHub** repo (Render + Vercel both deploy from GitHub).
- Accounts: [Neon](https://neon.tech), [Render](https://render.com), [Vercel](https://vercel.com) (you have this).

---

## 1. Database — Neon

1. Create a project at neon.tech → it gives you a Postgres database.
2. You need **TWO** connection strings from Neon (Dashboard → Connection Details):
   - **Pooled** (toggle "Pooled connection" ON) — host ends in `-pooler`. This is `DATABASE_URL` (runtime queries).
     ```
     postgresql://user:pass@ep-xxxx-pooler.REGION.aws.neon.tech/rxflow?sslmode=require
     ```
   - **Direct** (toggle "Pooled connection" OFF) — host has **no** `-pooler`. This is `DIRECT_URL` (migrations).
     ```
     postgresql://user:pass@ep-xxxx.REGION.aws.neon.tech/rxflow?sslmode=require
     ```
3. You'll paste **both** into Render. **Why two?** `prisma db push` runs DDL (CREATE TABLE) that Neon's connection pooler (PgBouncer) can't handle — it needs the direct connection. The running app uses the pooled one. Getting this wrong is the #1 cause of a failed first deploy.

The schema is created automatically on first API deploy (see step 2). No manual SQL needed.

> **Why no migrations?** The schema was evolved during development with hand-applied SQL files in `packages/db/prisma/manual-migrations/`. Those are NOT a clean Prisma migration history. Production uses `prisma db push`, which syncs the complete current schema from `schema.prisma` directly. This is correct for a fresh database.

---

## 2. API — Render

1. Render → **New + → Blueprint** → connect your GitHub repo. Render reads [`render.yaml`](render.yaml).
2. When prompted, set the secret env vars:
   - `DATABASE_URL` (pooled, runtime) → copy the **pooled** connection string from Neon → Dashboard → Connection Details (its host contains `-pooler`)
   - `DIRECT_URL` (direct, for `db push`) → the same string **without** `-pooler` in the host
   - `CORS_ORIGIN` → leave as `https://your-app.vercel.app` for now; update after step 3
   > ⚠️ Drop `&channel_binding=require` from both — it commonly breaks Prisma's `db push`. `sslmode=require` alone is secure.
   > 🔒 **Never paste real connection strings into this file or `.env.example`** — both are committed to the repo. Secrets belong only in the Render/Vercel dashboards and your local, gitignored `.env`.
   - `STORAGE_BASE_URL` → `https://rxflow-api.onrender.com` (Render shows your real URL after first deploy — come back and fix it)
   - `JWT_SECRET` / `JWT_REFRESH_SECRET` → Render auto-generates these (`generateValue: true`)
3. Deploy. The build runs `prisma db push` and creates every table on Neon.
4. **Seed demo data** (one time): Render → your service → **Shell** tab →
   ```bash
   pnpm --filter @rxflow/api deploy:seed
   ```
   This creates the demo tenant + login `admin@rxflow.in` / `admin123` and sample medicines.
5. Verify: open `https://YOUR-API.onrender.com/health` → should return `{"status":"ok"}`.

> First request after idle is slow (cold start). That's the free tier. The health check keeps it warmer than nothing.

---

## 3. Frontend — Vercel

1. Vercel → **Add New → Project** → import the same GitHub repo.
2. **Root Directory:** set to `apps/web` (important — it's a monorepo).
3. Framework preset: **Next.js** (auto-detected).
4. **Environment Variable:**
   - `NEXT_PUBLIC_API_URL` = `https://YOUR-API.onrender.com/api/v1`  (your Render URL + `/api/v1`)
5. Deploy. Vercel gives you `https://your-app.vercel.app`.
   > Sign-in calls (`/api/v1/auth/*`) are proxied through the Vercel app itself (see `apps/web/next.config.js`) so the httpOnly session cookie is first-party. The proxy target comes from `NEXT_PUBLIC_API_URL` at build time — no extra variable needed, but **redeploy the frontend whenever that URL changes**.
6. **Go back to Render** → update `CORS_ORIGIN` to exactly `https://your-app.vercel.app` → redeploy the API (or it'll reject the browser's requests).

Done — open the Vercel URL, log in with the demo credentials, and it's live for anyone.

---

## 4. Build settings reference

**Vercel (apps/web):**
- Root Directory: `apps/web`
- Build Command: `pnpm build` (default)
- Install Command: `pnpm install` (default)
- Output: `.next` (default)

If Vercel struggles with the monorepo workspace deps, set Install Command to:
```
cd ../.. && pnpm install --filter @rxflow/web...
```

**Render (API):** all defined in `render.yaml`. Nothing to configure manually beyond the secret env vars.

---

## 5. Optional integrations (add later, still free)

### File uploads → Cloudflare R2
1. Cloudflare → R2 → create bucket `rxflow-uploads`.
2. Create an R2 API token (S3 credentials).
3. In Render set: `STORAGE_PROVIDER=s3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION=auto`, `AWS_BUCKET=rxflow-uploads`, `AWS_ENDPOINT=https://<account>.r2.cloudflarestorage.com`.

### Password reset / OTP → Resend email
1. Resend → create API key.
2. In Render set `RESEND_API_KEY`.
3. (The email-OTP flow is not built yet — it's on the roadmap. SMS OTP isn't free; email OTP via Resend is.)

### Error tracking → GlitchTip (open-source) or Sentry
- **GlitchTip** is open-source and Sentry-SDK-compatible — self-host it (Docker) for *unlimited* free error tracking, or use their hosted free tier.
- Or use **Sentry** hosted free (5k events/mo).
- Either way the SDK is the same. To wire it (when ready):
  - API: `pnpm --filter @rxflow/api add @sentry/node`, init at the top of `apps/api/src/server.ts` with `SENTRY_DSN` from env.
  - Web: `pnpm --filter @rxflow/web add @sentry/nextjs`, run `npx @sentry/wizard@latest -i nextjs`.
- Set `SENTRY_DSN` in Render and `NEXT_PUBLIC_SENTRY_DSN` in Vercel. No DSN set = no-op, so it's safe to ship the code before you sign up.

### Product analytics → PostHog
- Free tier: 1M events/mo. Add only once you have real users (it's noise before then).
- Web: `pnpm --filter @rxflow/web add posthog-js`, init with `NEXT_PUBLIC_POSTHOG_KEY` in a client provider.

### Keeping the API awake (already set up)
- `.github/workflows/keep-warm.yml` pings `https://rxflow-api.onrender.com/health` every 10 minutes. If your API URL differs, add a repository variable **`API_HEALTH_URL`** (GitHub → Settings → Secrets and variables → Actions → Variables) with the full `/health` URL.
- `/health` doesn't query the database, so Neon still auto-suspends and stays within its free compute.
- Limits: GitHub can delay scheduled runs under load, and pauses scheduled workflows after 60 days without repository activity (re-enable it from the Actions tab).

### Uptime monitoring → UptimeRobot
- Free: 50 monitors. Add an HTTP(s) monitor pointing at `https://YOUR-API.onrender.com/health`.
- A 5-minute monitor is also a reliable second keep-warm ping alongside the GitHub workflow.
- Prefer self-hosted + a public status page? Use **Uptime Kuma** (open-source) instead — but it needs its own host.

### Scheduled jobs (no Redis needed) → GitHub Actions cron
Until you add BullMQ/Redis, run periodic tasks (daily backup, expiry sweep) with a free GitHub Actions workflow that `curl`s an authenticated endpoint on a cron schedule. Example in `.github/workflows/` (not yet added — ask and I'll scaffold it).

---

## 6. Production gotchas (specific to this app)

- **Live-sync (SSE) needs a persistent server.** It works on Render (a real container) but NOT on Vercel serverless functions. That's why the API is on Render, not folded into Next.js API routes. Don't move it.
- **In-memory pub/sub = single instance only.** Render free is single-instance, so fine. If you ever scale to multiple API instances, move the pub/sub in `apps/api/src/utils/events.ts` to Upstash Redis (free tier).
- **`prisma db push --accept-data-loss` runs on every deploy.** On a fresh DB and on no-op deploys it's safe. If you make a schema change that drops a column, it will drop it without asking. Back up first (Admin → Backup & Import → Export) before risky schema changes.
- **JWT secrets:** Render generates them once and keeps them. If you ever rotate them, all existing sessions log out — expected.
- **Cold start + POS:** the keep-warm workflow normally prevents sleeping, and the web app starts waking the API the moment any page opens (overlapping the wake-up with sign-in) and tells the user when a wake-up is in progress. For guaranteed no-sleep, use the paid plan.
- **Put the API and database in the same region.** Every request makes one or more database round trips, and a transaction makes many in sequence. The API runs in Render **Singapore** (`render.yaml`) while the Neon project was created in **AWS us-east-1**, so each round trip crosses the Pacific (~200 ms+). Moving Neon to **AWS Asia Pacific (Singapore)** — the closest region to Indian users and to the API — removes most of that: create a new Neon project there, `pg_dump` the old database and restore into it, then update `DATABASE_URL` / `DIRECT_URL` on Render. (Alternatively move the Render service to Virginia, but that puts the API further from users in India.)
- **Start command:** Render runs `cd apps/api && node_modules/.bin/tsx src/server.ts` directly — going through `pnpm --filter … start` scanned the whole workspace first and doubled boot time.

---

## 7. Custom domain (optional, free)

- Vercel: Project → Settings → Domains → add your domain (free SSL).
- Render: Settings → Custom Domain (free SSL). Then update `NEXT_PUBLIC_API_URL` + `CORS_ORIGIN` to the custom domains.

---

## 8. Updating after launch

Push to `main` → Render and Vercel both auto-deploy. The API re-runs `prisma db push` (syncs any schema changes), the frontend rebuilds. That's it.
