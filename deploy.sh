#!/usr/bin/env bash
set -euo pipefail

# 1. Ensure all binary directories are in PATH
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=================================================="
echo " 🤖 Oh My Pi (omp) Telegram Bot Deployment Script "
echo "=================================================="

# 2. Check Bun without executing remote installer scripts
if ! command -v bun &> /dev/null; then
    echo "❌ Bun runtime not found. Install Bun from https://bun.sh/docs/installation and retry."
    exit 1
fi
echo "✅ Bun version: $(bun --version)"

# 3. Check OMP without executing remote installer scripts
if ! command -v omp &> /dev/null; then
    echo "❌ OMP CLI not found. Install @oh-my-pi/pi-coding-agent from a trusted registry and retry."
    exit 1
fi
echo "✅ OMP CLI found: $(command -v omp)"

# 4. Check .env exists
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo "⚠️ .env not found. Creating .env from .env.example..."
        cp .env.example .env
        chmod 600 .env
        echo "📝 Created .env. Please edit it with your TELEGRAM_BOT_TOKEN and BOT_OWNER_ID:"
        echo "   nano .env"
        exit 1
    fi
fi
chmod 600 .env

# 5. Install bot dependencies
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies (bun install)..."
    bun install --frozen-lockfile
fi

echo "🚀 Starting OMP Telegram Bot..."
exec bun run src/index.ts "$@"
