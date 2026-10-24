#!/usr/bin/env bash
# Database step of the Render build. Keeping it here (instead of inline in the Render dashboard)
# means new schema changes ship with the code — no dashboard edits per migration.
#
#   1. generate the Prisma client
#   2. `prisma db push` — creates the full schema on a FRESH database and applies purely
#      additive changes on an existing one. It runs WITHOUT --accept-data-loss, so anything
#      that would drop a table, column or value is refused (non-fatal) instead of applied.
#   3. apply every migration listed in prisma/manual-migrations/IDEMPOTENT, in order — each is
#      safe to re-run, and a failure here FAILS the build so the previous release stays live
#   4. seed demo data (idempotent, non-fatal)
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm exec prisma generate
pnpm exec prisma db push --skip-generate \
  || echo "db push refused or failed (never destructive) — idempotent migrations below bring it up to date"

while IFS= read -r file || [ -n "$file" ]; do
  case "$file" in ''|'#'*) continue ;; esac
  echo "==> applying manual-migrations/$file"
  pnpm exec prisma db execute --schema prisma/schema.prisma --file "prisma/manual-migrations/$file"
done < prisma/manual-migrations/IDEMPOTENT

../../apps/api/node_modules/.bin/tsx prisma/seed.ts || echo "seed skipped (non-fatal)"
