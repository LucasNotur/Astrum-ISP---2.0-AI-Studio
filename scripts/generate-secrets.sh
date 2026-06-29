#!/bin/bash
# scripts/generate-secrets.sh
# Gera todos os secrets de segurança da Astrum e imprime
# prontos para colar no .env do VPS.
#
# Uso: bash scripts/generate-secrets.sh >> .env
# ATENÇÃO: não commite o output. Rode no próprio VPS ou
# copie via SSH seguro.

set -euo pipefail

gen() {
  node -e "console.log(require('crypto').randomBytes($1).toString('hex'))"
}

echo ""
echo "# ── Secrets gerados em $(date -u '+%Y-%m-%dT%H:%M:%SZ') ──"
echo "# Cole no seu .env no VPS. Nunca compartilhe este output."
echo ""
echo "REDIS_PASSWORD=$(gen 32)"
echo "QDRANT_API_KEY=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")"
echo "JWT_SECRET=$(gen 64)"
echo "EVOLUTION_WEBHOOK_SECRET=$(gen 32)"
echo "WEBHOOK_HMAC_SECRET=$(gen 32)"
echo "PAYMENT_WEBHOOK_SECRET=$(gen 32)"
echo ""
echo "# Lembre de atualizar REDIS_URL após definir REDIS_PASSWORD:"
echo "# REDIS_URL=redis://:\${REDIS_PASSWORD}@redis:6379"
