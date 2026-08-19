#!/usr/bin/env bash
# infra/vps/deploy.sh
# Deploy da API na VPS. Roda DE DENTRO do repo clonado — o path é resolvido
# a partir de onde o script está (infra/vps/ → raiz do repo), nada hardcoded.
# Uso: bash infra/vps/deploy.sh [serviços extras...]
# Ex:  bash infra/vps/deploy.sh          # redis + qdrant + api
#      bash infra/vps/deploy.sh zep      # + zep (memória de longo prazo)

set -euo pipefail

# ── Resolve a raiz do repo relativo ao script ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

# Health check da API (mesmo caminho do healthcheck em docker-compose.yml)
HEALTH_URL="${HEALTH_URL:-http://localhost:3001/api/v2/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"

echo "==> Repo em $REPO_ROOT"

# ── 1. Atualiza o código (branch atual, o que estiver checked out) ──
echo "==> git pull..."
git pull

# ── 2. Sobe os serviços base (+ extras passados por argumento) ──
# `web` não existe mais no compose; `zep` só sobe se pedido explicitamente.
EXTRA_SERVICES=("$@")
echo "==> docker compose up -d --build redis qdrant api${EXTRA_SERVICES:+ ${EXTRA_SERVICES[*]}}"
docker compose up -d --build redis qdrant api "${EXTRA_SERVICES[@]}"

# ── 3. Aguarda o health check responder 200 (ou timeout) ──
echo "==> Aguardando $HEALTH_URL (timeout: ${HEALTH_TIMEOUT}s)..."
RESP_FILE="$(mktemp)"
trap 'rm -f "$RESP_FILE"' EXIT

START_TS="$(date +%s)"
while true; do
  CODE="$(curl -sS -o "$RESP_FILE" -w '%{http_code}' --max-time 5 "$HEALTH_URL" 2>/dev/null || true)"
  if [ "$CODE" = "200" ]; then
    break
  fi
  if [ $(( $(date +%s) - START_TS )) -ge "$HEALTH_TIMEOUT" ]; then
    echo "ERRO: health check não respondeu 200 em ${HEALTH_TIMEOUT}s (último status: ${CODE:-sem resposta})." >&2
    echo "Últimos logs do serviço api:" >&2
    docker compose logs --tail=50 api >&2 || true
    exit 1
  fi
  sleep 2
done

# ── 4. Resposta do health check ──
echo "==> API saudável. Resposta do health check:"
cat "$RESP_FILE"
echo ""
