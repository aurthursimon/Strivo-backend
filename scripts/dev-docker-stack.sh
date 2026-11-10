#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

run_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    pnpm "$@"
  elif command -v corepack >/dev/null 2>&1; then
    corepack pnpm "$@"
  else
    npx --yes pnpm@11.0.8 "$@"
  fi
}

read_api_port() {
  local f="$ROOT/packages/api/.env"
  local line port
  if [ ! -f "$f" ]; then
    echo "3000"
    return 0
  fi
  line="$(grep -E '^[[:space:]]*PORT=' "$f" | tail -1 || true)"
  port="${line#*=}"
  port="$(echo "${port}" | tr -d '\r')"
  port="${port//[[:space:]]/}"
  if [ -z "$port" ] || ! [[ "${port}" =~ ^[0-9]+$ ]]; then
    echo "3000"
  else
    echo "${port}"
  fi
}

echo "--- NutriScan AI: Postgres + API (local) ---"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker não está no PATH."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Inicie o Docker Desktop e rode de novo."
  exit 1
fi

if [ ! -f "$ROOT/packages/api/.env" ]; then
  echo "Copie packages/api/.env.example para packages/api/.env (e preencha chaves)."
  exit 1
fi

API_PORT="$(read_api_port)"

if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose)
else
  echo "Precisa Docker Compose (docker compose ou docker-compose)."
  exit 1
fi

COMPOSE_FILE="$ROOT/docker-compose.yml"

run_pnpm install

echo "Subindo Postgres e API (${DC[*]} up -d)..."
"${DC[@]}" -f "$COMPOSE_FILE" up -d

echo "Aguardando Postgres..."
i=0
until "${DC[@]}" -f "$COMPOSE_FILE" exec -T postgres pg_isready -U nutriscan -d nutriscan >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 45 ]; then
    echo "Postgres não respondeu a tempo."
    exit 1
  fi
  sleep 1
done

echo "Prisma generate + migrate deploy + seed..."
(
  cd "$ROOT/packages/api"
  run_pnpm exec prisma generate
  run_pnpm exec prisma migrate deploy
  run_pnpm exec prisma db seed
)

echo ""
echo "Dados:"
echo "  Postgres: localhost:5434 (user nutriscan)"
echo "  API:      http://localhost:${API_PORT}/api"
echo ""
echo "--- Iniciando dev (Ctrl+C encerra turbo) ---"

run_pnpm dev
