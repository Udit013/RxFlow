# RxFlow — Free Hosting Guide

Everything below is **free, no credit card** required (except Vercel which is free but asks for one as a fraud check).

**Stack:** Neon Postgres → Render API → Vercel Frontend
**Total time:** ~25 minutes
**Total cost:** ₹0/month

---

## Step 1 — Push to GitHub (3 min)

If you haven't already:

```bash
cd ~/Code/RxFlow
git init
git add .
git commit -m "Initial commit"
gh repo create rxflow --private --source=. --push
# or use GitHub web UI to create + push
```

Private repo is fine — Vercel and Render both support private GitHub deploys.

---

## Step 2 — Database on Neon (5 min)

1. Sign up at **https://neon.tech** (GitHub login)
2. Create project → name it `rxflow`, region closest to you
3. Copy the **Pooled connection string** — looks like:
   ```
   postgresql://USER:PASS@ep-xxx-pooler.region.aws.neon.tech/rxflow?sslmode=require
   ```
4. Save it somewhere — you'll paste it into Render

**Neon notes:**
- Free tier auto-pauses after 5 min idle. First request after pause takes ~1s.
- 0.5 GB storage limit — plenty for thousands of medicines + orders.
- The "Pooled" connection string handles Render's concurrent requests. Don't use the unpooled one.

---

## Step 3 — Backend on Render (10 min)

1. Sign up at **https://render.com** (GitHub login)
2. **New + → Blueprint** → select your `rxflow` repo
3. Render reads `render.yaml` automatically. You'll see one service: `rxflow-api`.
4. When prompted for env vars:
   - `DATABASE_URL`: paste your Neon connection string from Step 2
   - `JWT_SECRET` and `JWT_REFRESH_SECRET`: leave blank, Render will auto-generate
   - `STORAGE_BASE_URL`: paste your Render service URL (Render shows it before deploy, format: `https://rxflow-api.onrender.com`)
5. Click **Apply**. First build takes 4-6 min — Prisma generates the client and runs migrations.
6. Once "Live", visit `https://YOUR-API.onrender.com/health` → you should see `{"status":"ok",...}`
7. **Seed the demo data**: in Render dashboard → your service → **Shell** tab → paste:
   ```bash
   cd packages/db && pnpm exec tsx prisma/seed.ts
   ```
   This creates the demo tenant + admin user (`admin@rxflow.in` / `admin123`).

**Render free-tier gotchas:**
- After 15 min with no traffic, the service spins down. First request afterwards takes 30-60s. Subsequent requests are fast.
- 750 hours/month free — fine for 1 service running 24/7.
- The Shell tab is a real terminal on the server — use it to run migrations, seeds, or query Prisma.

---

## Step 4 — Frontend on Vercel (5 min)

1. Sign up at **https://vercel.com** (GitHub login)
2. **Add New → Project** → import your `rxflow` repo
3. Vercel auto-detects Next.js. Set the **Root Directory** to `apps/web`.
4. Add this environment variable:
   - `NEXT_PUBLIC_API_URL` = `https://YOUR-API.onrender.com/api/v1`
5. Click **Deploy**. Takes ~2 min.
6. Visit the URL Vercel gives you (e.g. `rxflow-xxx.vercel.app`).
7. **Login:** `admin@rxflow.in` / `admin123`

---

## Step 5 — Tighten CORS (optional, 2 min)

Once both URLs exist, lock down CORS:

1. Render dashboard → rxflow-api → Environment
2. Change `CORS_ORIGIN` from `*` to your Vercel URL: `https://rxflow-xxx.vercel.app`
3. Save → Render redeploys automatically

---

## Step 6 — Change the demo password (1 min)

**Before sharing with anyone:** log in and change the admin password.

Settings → Users tab → click your row → invite a new admin OR use the API:

```bash
# From Render shell:
cd packages/db && pnpm exec tsx -e "
import bcrypt from 'bcryptjs'
import { prisma } from '../db/src/index.js'
const hash = await bcrypt.hash('YOUR_NEW_PASSWORD', 12)
await prisma.user.update({
  where: { email: 'admin@rxflow.in' },
  data: { passwordHash: hash }
})
console.log('Done')
process.exit(0)
"
```

---

## What works on this stack

✅ Login + dashboard + all CRUD
✅ Multi-user (everyone on the shared URL)
✅ Live multi-device sync (SSE works through Render)
✅ PDF invoices + WhatsApp share
✅ Backup export/import
✅ Stock takes, transfers, parked sales
✅ All reports

## What doesn't work yet

❌ **File uploads / images** — currently set to local storage. On Render free tier, the filesystem is ephemeral (wiped on restart). For uploads you'd need to wire in S3 / Cloudflare R2 / Supabase storage. Not blocking unless you start uploading prescription images.
❌ **Meilisearch** — the medicine intelligence layer falls back to in-memory fuzzy matching. Fine for the demo.
❌ **Redis** — only used for caching elsewhere; nothing critical depends on it.

## Sharing the URL

After Step 4 you have a public URL like `https://rxflow-myname.vercel.app`. Send that to anyone — they'll see the app, log in with admin@rxflow.in / your-password, and use it like local.

The first load after idle is slow (Render cold start + Neon resume = ~30-60s). Once warm, it's snappy. Tell them to refresh if the first request hangs.

## Quick alternative: laptop tunnel

If you just want someone to see what you've built **right now** without setting up cloud accounts, run on your laptop and use a free tunnel:

```bash
# 1. Install cloudflared (one-time)
brew install cloudflared

# 2. Run your app locally
pnpm dev    # in another terminal

# 3. Expose the web app
cloudflared tunnel --url http://localhost:3000
```

Cloudflare prints a public `https://random-name.trycloudflare.com` URL. Anyone in the world can hit it. Lives as long as your laptop + the tunnel command run. No signup needed.

Catch: the frontend will still call `localhost:3001` for the API since `NEXT_PUBLIC_API_URL` is local. To make the API public too, tunnel it separately and update the env var:
```bash
cloudflared tunnel --url http://localhost:3001
# Copy the URL, then:
echo "NEXT_PUBLIC_API_URL=https://that-url/api/v1" > apps/web/.env.local
# Restart pnpm dev
```

This is the fastest path for a one-off demo. The Render/Vercel stack is better if you want it always-on.

---

## Cost trajectory

| Stage | Cost | When |
|---|---|---|
| Hobby/demo | ₹0/mo | Now |
| 1 real pharmacy (~500 invoices/mo) | Still ₹0 | First few months |
| Need uploads + always-on | ~₹2000/mo | When you onboard paying customers (Render Starter $7 + R2 $0.015/GB) |
| Production-grade | ~₹6000/mo | Multiple tenants, real SLA |

The free stack will take you through MVP and first 1-2 customers comfortably.
