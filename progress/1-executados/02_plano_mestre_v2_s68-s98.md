# Plano Mestre V2 — S68–S98 — ✅ CÓDIGO COMPLETO (operação → pendentes/01)

**Fonte:** `.astrum-progress/PLANO_MESTRE_V2__EM_ANDAMENTO.md` + `MAPA_SESSOES_1_a_98.md` + `docs/ASTRUM_ESTADO_FINAL_PLANO_V2.md`

**O que é:** a migração estranguladora (Strangler Fig) do backend legado (`/src`, Express)
para o motor novo (`apps/api`, Fastify) SEM big bang — os dois convivem, flags decidem
quem atende (`ATENDIMENTO_ENGINE`, `COBRAI_ENGINE`, default `legacy`).

**Entregas-chave (todas codificadas e testadas):**
- **message.worker v2** — pipeline completo de atendimento no motor novo, com shadow
  mode (processa em paralelo SEM responder, para comparar com o legado).
- **cobrai.worker v2** — régua de cobrança nova com guards e variantes bandit.
- **ETL/backfill** — scripts de migração de dados legado→novo (`scripts/etl/`).
- **Cutover per-tenant** — migration 026 permite ligar o v2 para UM tenant piloto.
- **Gate final** — `scripts/cutover/final-gate.ts` com 10 critérios objetivos que
  precisam ficar verdes antes de declarar o V2 concluído.
- **Replay (IA-46)** — reexecuta conversas reais no motor novo em dry-run e compara.

**Por que ainda não está "CONCLUÍDO":** falta a OPERAÇÃO (ligar as chaves em produção
com tenant piloto) — ver `progress/2-pendentes/01_onda2_cutover.md`.

**Nota do checkup 2026-07-12:** os imports quebrados que impediam o boot real dos
workers v2 foram corrigidos (commit 8414415) — o código agora liga de verdade.
