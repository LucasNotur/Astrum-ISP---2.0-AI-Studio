# GATE GO-LIVE — S86

> Checklist de avaliação com dados REAIS antes de habilitar produção.
> Cada item precisa de número concreto + evidência (screenshot/log/query).
> Aprovação do Lucas é obrigatória e registrada neste documento.

## North Star Metrics

| Métrica | Meta | Valor Real | Evidência | Status |
|---------|------|------------|-----------|--------|
| Resolução autônoma (sem escalação humana) | ≥ 60% | ⏳ | query `conversations` | ⏳ |
| Custo por conversa (Helicone/token usage) | < R$ 0,15 | ⏳ | dashboard Helicone | ⏳ |
| p95 latência webhook→resposta | < 1.5s | ⏳ | K6 load test report | ⏳ |
| Jobs perdidos (DLQ count) | 0 | ⏳ | BullMQ dashboard | ⏳ |
| Custo por ISP/mês visível para o tenant | sim | ⏳ | `/api/v2/valor/dashboard` | ⏳ |

## Checklist Técnico

### Infraestrutura
- [ ] Redis gerenciado configurado (Upstash/Redis Cloud)
- [ ] Supabase Pro com Point-in-Time Recovery ativo
- [ ] Sentry DSN configurado + alertas ativos
- [ ] HMAC secret sincronizado com Evolution API
- [ ] TLS 1.3 ativo em todos os endpoints

### Segurança (S85 validado)
- [x] Anti-IDOR: todas as roles testadas (30 testes OWASP)
- [x] RBAC: viewer/operator/admin/super_admin matrix
- [x] Rate limiting: ai (10), billing (5), webhooks (100), default (60)
- [x] Helmet CSP: script-src 'self', default-src 'self'
- [x] JWT_SECRET >= 32 chars obrigatório
- [x] LGPD right-to-be-forgotten: 8 camadas de dados
- [ ] DPA assinado pelo primeiro ISP piloto

### Resiliência (S84 validado)
- [x] Circuit breaker: 3 falhas → OPEN → HALF_OPEN → recovery (7 testes)
- [x] Provider fallback: openai → anthropic → gemini
- [ ] K6 burst test executado em staging (1000 msgs)
- [ ] Chaos test executado (Redis/Qdrant/OpenAI/Supabase)

### Workers
- [x] CobrAI v2: guardas (janela, limites, acordo, compensação)
- [x] Usage sync: msg_count + token_cost → Supabase
- [x] SLA monitor: escalação por tempo
- [x] FCR calculator: first contact resolution
- [x] Snooze: follow-up reagendado
- [x] Report: snapshot diário (FCR, TMA, CSAT)
- [x] Gamification: ranking mensal operadores
- [x] PlanSync: catálogo ERP → erp_plans
- [x] Vision: análise de imagem GPT-4o-mini
- [x] SiteScrape: website → knowledge_base (RAG)
- [x] ErpSync: sync cadastro → ERP

### Dados
- [ ] ETL backfill executado (S69)
- [ ] Delta sync ativo (S70)
- [ ] Gate de dados aprovado (contagens origem = destino)

### Atendimento
- [ ] Shadow mode rodou 3-7 dias sem divergência (S74)
- [ ] Cutover atendimento habilitado (ATENDIMENTO_ENGINE=v2)

### Frontend
- [x] Auth swap: Supabase JWT (S77)
- [x] CobrAI endpoints: /api/v2/cobranca/* (S78)
- [x] apps/web removido (S78)

## Bloqueadores Atuais

| Bloqueador | Sessão | Ação Necessária |
|------------|--------|-----------------|
| ETL real não executado | S69, S70 | Credenciais vivas (Firebase + Supabase prod) |
| Shadow traffic não rodou | S74 | Espelhar webhook legado → v2 por 3-7d |
| Express ainda ativo | S82 | Só após S74 completar |
| HSM templates Meta | — | Submeter templates + aguardar aprovação |

## Aprovação

```
Data: _______________
Aprovado por: Lucas Ferraz
Assinatura: _______________
Observações: _______________
```
