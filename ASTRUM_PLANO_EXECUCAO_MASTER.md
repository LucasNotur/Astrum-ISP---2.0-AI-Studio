## Sprint 2 — Decisões Arquiteturais

### Guardrails Pipeline (Dias 30-32)
- **Ordem**: PII → Injection → Moderation (fail-fast)
- **PII**: regex brasileiro (CPF, cartão, email, telefone)
- **Injection**: score acumulativo, threshold configurável por tenant
- **Moderation**: OpenAI Moderation API (gratuita), fail-open

### RAG Pipeline (Dias 33-35)
- **Modelo de embedding**: text-embedding-3-small (1536 dims)
- **Score threshold**: 0.72 (abaixo = chunk não relevante)
- **Estratégia de chunking**: sliding window + overlap 200 chars
- **Com RAG**: gpt-4o | **Sem RAG**: gpt-4o-mini

### Context Window (Dia 37)
- **Limite**: 20 mensagens no histórico
- **Recentes preservadas**: últimas 6 mensagens integrais
- **Compressão**: resumo das mensagens antigas (evita perda de contexto)

### Fluxo de Atendimento (Dia 38)
- Mensagem original → banco (operador vê conteúdo real)
- Mensagem mascarada → LLM (LGPD compliance)
- Escalação automática: 10+ mensagens OU keyword de urgência

## GitHub Actions Secrets Necessários

### CI (unit-tests + e2e)
- `SUPABASE_TEST_URL`: URL do Supabase de teste/staging
- `SUPABASE_TEST_ANON_KEY`: Chave anon do Supabase de teste
- `SUPABASE_TEST_SERVICE_ROLE`: Service role key do Supabase de teste
- `JWT_SECRET_TEST`: Secret JWT para testes
- `JWT_REFRESH_SECRET_TEST`: Secret de refresh para testes
- `E2E_ADMIN_EMAIL`: Email do admin de testes E2E
- `E2E_ADMIN_PASSWORD`: Senha do admin de testes E2E
- `CODECOV_TOKEN`: Token do Codecov (cobertura)

### Deploy
- `RAILWAY_TOKEN`: Token do Railway (deploy backend)
- `VERCEL_TOKEN`: Token do Vercel (deploy frontend)
- `VERCEL_ORG_ID`: ID da organização no Vercel
- `VERCEL_PROJECT_ID`: ID do projeto no Vercel
- `SENTRY_AUTH_TOKEN`: Token Sentry para release tracking
- `PRODUCTION_URL`: URL de produção para health check

### Opcionais
- `SLACK_WEBHOOK`: Notificações de deploy no Slack
