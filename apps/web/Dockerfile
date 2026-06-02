# ─── Stage 1: Build ─────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
RUN npm ci --workspace=apps/web --include-workspace-root

COPY apps/web/ ./apps/web/
COPY packages/ ./packages/

# Build arguments para variáveis em tempo de build
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL=https://api.astrum.com.br

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_API_URL=$VITE_API_URL

RUN npm run build --workspace=apps/web

# ─── Stage 2: Nginx para servir o frontend ──────────────
FROM nginx:1.25-alpine AS production

# Configuração nginx otimizada para SPA React
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Adicionar script de injeção de env runtime (para variáveis dinâmicas)
COPY apps/web/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
