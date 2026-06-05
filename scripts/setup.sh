#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# RxFlow — One-command local setup
# Usage: bash scripts/setup.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🚀 Setting up RxFlow...${NC}"

# ── Check prerequisites ───────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || { echo "❌ Node.js 20+ required"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "📦 Installing pnpm..."; npm install -g pnpm; }
command -v docker >/dev/null 2>&1 || { echo "⚠️  Docker not found — skip infrastructure"; SKIP_DOCKER=true; }

# ── Install dependencies ──────────────────────────────────────────────────────
echo -e "${BLUE}📦 Installing dependencies...${NC}"
pnpm install

# ── Setup environment files ───────────────────────────────────────────────────
echo -e "${BLUE}⚙️  Setting up environment files...${NC}"

if [ ! -f "apps/api/.env" ]; then
  cp apps/api/.env.example apps/api/.env
  echo -e "${YELLOW}  Created apps/api/.env (please update JWT secrets!)${NC}"
fi

if [ ! -f "apps/web/.env.local" ]; then
  cp apps/web/.env.local.example apps/web/.env.local
  echo -e "${GREEN}  Created apps/web/.env.local${NC}"
fi

# ── Start infrastructure ──────────────────────────────────────────────────────
if [ -z "$SKIP_DOCKER" ]; then
  echo -e "${BLUE}🐳 Starting Docker infrastructure...${NC}"
  docker compose up -d postgres meilisearch redis
  echo -e "${GREEN}  Waiting for PostgreSQL to be ready...${NC}"
  sleep 5
fi

# ── Database migration + seed ─────────────────────────────────────────────────
echo -e "${BLUE}🗄️  Running database migrations...${NC}"
cd packages/db
npx prisma migrate dev --name init --skip-seed
echo -e "${BLUE}🌱 Seeding database...${NC}"
npx ts-node --esm prisma/seed.ts
cd ../..

echo ""
echo -e "${GREEN}✅ RxFlow setup complete!${NC}"
echo ""
echo "  🌐 Start development:"
echo "     pnpm dev"
echo ""
echo "  📱 Apps:"
echo "     Web:     http://localhost:3000"
echo "     API:     http://localhost:3001"
echo "     API Docs: http://localhost:3001/docs"
echo "     Meilisearch: http://localhost:7700"
echo ""
echo "  🔑 Demo login:"
echo "     Email:    admin@rxflow.in"
echo "     Password: admin123"
echo ""
