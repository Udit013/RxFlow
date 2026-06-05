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

> **Cost honesty:** the only friction in the free path is Render free *sleeping* after 15 min idle. Fine for sharing/demo/low-traffic. When you have a real pharmacy on it daily, ~$7/mo on Render removes the sleep. Everything else stays free indefinitely.

---

## 0. Prerequisites

- Code pushed to a **GitHub** repo (Render + Vercel both deploy from GitHub).
- Accounts: [Neon](https://neon.tech), [Render](https://render.com), [Vercel](https://vercel.com) (you have this).

---

## 1. Database — Neon

1. Create a project at neon.tech → it gives you a Postgres database.
2. Copy the **pooled** connection string (Dashboard → Connection Details → toggle "Pooled connection"). It looks like:
   ```
   postgresql://user:pass@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/rxflow?sslmode=require
   ```
   Use the **-pooler** host — it handles serverless connection limits.
3. Keep this string; you'll paste it into Render as `DATABASE_URL`.

The schema is created automatically on first API deploy (see step 2). No manual SQL needed.

> **Why no migrations?** The schema was evolved during development with hand-applied SQL files in `packages/db/prisma/manual-migrations/`. Those are NOT a clean Prisma migration history. Production uses `prisma db push`, which syncs the complete current schema from `schema.prisma` directly. This is correct for a fresh database.

---

## 2. API — Render

1. Render → **New + → Blueprint** → connect your GitHub repo. Render reads [`render.yaml`](render.yaml).
2. When prompted, set the secret env vars:
   - `DATABASE_URL` → your Neon pooled string from step 1
   - `CORS_ORIGIN` → leave as `https://your-app.vercel.app` for now; update after step 3
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

### Uptime monitoring → UptimeRobot
- Free: 50 monitors. Add an HTTP(s) monitor pointing at `https://YOUR-API.onrender.com/health`.
- Bonus: a 5-min uptime ping keeps the Render free instance slightly warmer (fewer cold starts).
- Prefer self-hosted + a public status page? Use **Uptime Kuma** (open-source) instead — but it needs its own host.

### Scheduled jobs (no Redis needed) → GitHub Actions cron
Until you add BullMQ/Redis, run periodic tasks (daily backup, expiry sweep) with a free GitHub Actions workflow that `curl`s an authenticated endpoint on a cron schedule. Example in `.github/workflows/` (not yet added — ask and I'll scaffold it).

---

## 6. Production gotchas (specific to this app)

- **Live-sync (SSE) needs a persistent server.** It works on Render (a real container) but NOT on Vercel serverless functions. That's why the API is on Render, not folded into Next.js API routes. Don't move it.
- **In-memory pub/sub = single instance only.** Render free is single-instance, so fine. If you ever scale to multiple API instances, move the pub/sub in `apps/api/src/utils/events.ts` to Upstash Redis (free tier).
- **`prisma db push --accept-data-loss` runs on every deploy.** On a fresh DB and on no-op deploys it's safe. If you make a schema change that drops a column, it will drop it without asking. Back up first (Admin → Backup & Import → Export) before risky schema changes.
- **JWT secrets:** Render generates them once and keeps them. If you ever rotate them, all existing sessions log out — expected.
- **Cold start + POS:** if you demo to a real pharmacy, hit the URL a minute before so the API is awake, or upgrade to the no-sleep plan.

---

## 7. Custom domain (optional, free)

- Vercel: Project → Settings → Domains → add your domain (free SSL).
- Render: Settings → Custom Domain (free SSL). Then update `NEXT_PUBLIC_API_URL` + `CORS_ORIGIN` to the custom domains.

---

## 8. Updating after launch

Push to `main` → Render and Vercel both auto-deploy. The API re-runs `prisma db push` (syncs any schema changes), the frontend rebuilds. That's it.
