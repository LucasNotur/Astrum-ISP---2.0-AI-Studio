# ONDA 2 — Cutover operacional — ⏳ BLOQUEADO NO LUCAS (é operação, não código)

**Fonte:** `.astrum-progress/00_PLANO_DE_ACAO_GERAL__EM_ANDAMENTO.md` §2 +
`docs/ASTRUM_ESTADO_FINAL_PLANO_V2.md`

**É o item nº 1 de toda a Astrum.** Todo o resto espera por ele.

## Checklist (em ordem)
1. [ ] Aplicar migrations em PRODUÇÃO (062–074 — mesmas já validadas no local).
2. [ ] `WIND_TUNNEL_ENABLED=true` em staging + 1 rodada do D-15 → pass-rate ≥90%
       vira o gate de confiança (custo: centavos).
3. [ ] Replay IA-46 com ≥200 conversas reais → pass-rate ≥95%; revisar divergências.
4. [ ] Escolher tenant piloto + shadow mode 7 dias (`message.worker` já grava shadow).
5. [ ] `ATENDIMENTO_ENGINE=v2` no piloto (per-tenant, migration 026). Rollback = env.
6. [ ] Ligar flags da Fase 1/2 (hoje TUDO off): hub → toolreg → safety → graphrag →
       compression → features → drift → costdrill → replay. 1 por vez, 48h cada.
7. [ ] 2 ciclos de fatura limpos → `COBRAI_ENGINE=v2` (R6).
8. [ ] `scripts/cutover/final-gate.ts` até os 10 critérios verdes → renomear
       PLANO_MESTRE_V2 para `__CONCLUIDO`.

**Critério de fechamento:** motor novo com 100% do tráfego do piloto por 30 dias sem rollback.

## O que a Onda 2 desbloqueia
- PLANO_E (cérebro noturno E-01..E-05)
- D-04 (NOC autônomo) e D-05 em produção real
- Métricas reais para o dashboard Valor Gerado → argumento de venda
