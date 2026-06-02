# ─── Stage 1: Dependências ──────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Instalar dependências do sistema para compilação nativa (argon2, etc.)
RUN apk add --no-cache python3 make g++

# Copiar manifests de dependências
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/*/package*.json ./packages/*/

# Instalar todas as dependências
RUN npm ci --workspace=apps/api --include-workspace-root

# ─── Stage 2: Build TypeScript ──────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

# Copiar código fonte
COPY tsconfig*.json ./
COPY apps/api/ ./apps/api/
COPY packages/ ./packages/

# Compilar TypeScript
RUN npm run build --workspace=apps/api

# ─── Stage 3: Produção (imagem mínima) ──────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Criar usuário não-root para segurança
RUN addgroup -g 1001 -S nodejs && \
    adduser -S astrum -u 1001

# Copiar apenas o necessário para produção
COPY --from=builder --chown=astrum:nodejs /app/apps/api/dist ./dist
COPY --from=deps --chown=astrum:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=astrum:nodejs /app/apps/api/node_modules ./apps/api/node_modules

# Criar diretório de dados para DuckDB
RUN mkdir -p .data && chown astrum:nodejs .data

# Variáveis de ambiente padrão (sobrescritas via env do container)
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0

# Mudar para usuário não-root
USER astrum

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/api/v2/health || exit 1

EXPOSE 3001

CMD ["node", "dist/cluster.js"]
