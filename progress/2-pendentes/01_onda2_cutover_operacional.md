# ONDA 2 — Cutover operacional — ✅ EXECUTADO (2026-07-22)

**Fonte:** `.astrum-progress/00_PLANO_DE_ACAO_GERAL__EM_ANDAMENTO.md` §2 +
`docs/ASTRUM_ESTADO_FINAL_PLANO_V2.md`

## Checklist (em ordem)
1. [x] Migrations em produção — schema consolidado (8 parts) já inclui tudo de 001–081.
2. [x] `ATENDIMENTO_ENGINE=v2` no tenant Astrum Telecom (per-tenant, migration 026).
       Executado via SQL direto no Supabase: `UPDATE tenants SET atendimento_engine = 'v2'`.
3. [x] 13 feature flags inseridas em `tenant_feature_flags` (intelligence_hub, tool_registry,
       safety_classifier, graphrag, prompt_compression, replay_engine, provider_failover,
       bandit, drift_detection, multi_agent, nightly_brain, wind_tunnel, noc_autonomo).
4. [x] `.env` local atualizado: `COBRAI_ENGINE=v2`, `ATENDIMENTO_ENGINE=v2`,
       `MULTI_AGENT_ENABLED=true`, + 16 flags de IA ativadas.
5. [ ] Setar mesmas env vars na plataforma de deploy (Vercel só serve frontend;
       backend precisa de hosting próprio — VPS, Railway, Render, etc.).
6. [ ] `scripts/cutover/final-gate.ts` até os 10 critérios verdes → renomear
       PLANO_MESTRE_V2 para `__CONCLUIDO`.

**Rollback:**
```sql
UPDATE tenants SET atendimento_engine = NULL WHERE id = '11111111-1111-1111-1111-111111111111';
```
Ou `.env`: `ATENDIMENTO_ENGINE=legacy`, `COBRAI_ENGINE=legacy`.

## O que a Onda 2 desbloqueia
- PLANO_E (cérebro noturno E-01..E-05)
- D-04 (NOC autônomo) e D-05 em produção real
- Métricas reais para o dashboard Valor Gerado → argumento de venda
