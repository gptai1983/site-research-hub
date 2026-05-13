#!/usr/bin/env bash
set -euo pipefail

# ── Hermes Site Research Hub — Ubuntu Deploy Script ──
# Usage: bash scripts/deploy-ubuntu.sh [--dev]
#   --dev    skip docker, run with tsx directly (for development)

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

echo "==> Hermes Site Research Hub — Ubuntu Deployment"
echo ""

# ── 1. System dependencies ──
echo "==> Installing system dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq curl git nodejs npm docker.io docker-compose-v2 2>/dev/null || true

# ── 2. Node.js (if missing) ──
if ! command -v node &>/dev/null; then
  echo "==> Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# ── 3. Playwright ──
if ! npx playwright --version &>/dev/null; then
  echo "==> Installing Playwright..."
  npm install -g playwright 2>/dev/null || true
  npx playwright install chromium 2>/dev/null || \
    echo "  [WARN] Playwright install failed — browser.navigate will not work"
fi

# ── 5. .env ──
if [ ! -f .env ]; then
  echo "==> Creating .env from .env.example..."
  cp .env.example .env

  # Generate secrets
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env
  sed -i "s/^ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$(openssl rand -hex 32)/" .env

  echo "  JWT_SECRET and ENCRYPTION_KEY generated"
fi

echo ""
echo "==> .env configuration:"
grep -v '^#' .env | grep -v '^\s*$' | sed 's/=.*/=***/' | sed 's/^/  /'

# ── 6. Run ──
if [ "${1:-}" = "--dev" ]; then
  echo ""
  echo "==> Starting in dev mode (tsx)..."
  npm install
  npx tsx src/index.ts
else
  echo ""
  echo "==> Starting with Docker Compose..."
  sudo docker compose up -d --build
  echo ""
  echo "==> Waiting for server..."
  for i in $(seq 1 15); do
    if curl -sf http://localhost:3000/health >/dev/null 2>&1; then
      echo "  Server ready at http://localhost:3000"
      break
    fi
    sleep 2
  done
  echo ""
  echo "==> First-time setup:"
  echo '  curl -X POST http://localhost:3000/trpc/auth.setupFirstUser \'
  echo '    -H "Content-Type: application/json" \'
  echo '    -d '\''{"email":"admin@example.com","password":"your-password"}'\'''
  echo ""
  echo "==> Frontend: http://localhost:5173"
  echo "==> API:      http://localhost:3000/health"
  echo "==> Metrics:  http://localhost:3000/metrics"
  echo "==> Logs:     sudo docker compose logs -f"
fi
