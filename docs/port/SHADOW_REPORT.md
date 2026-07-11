# SHADOW_REPORT — S74: Motor v2 em modo espelhado

> **Status:** PENDENTE — aguardando 3–7 dias de tráfego real espelhado.
> Preencher após executar: `ATENDIMENTO_ENGINE=legacy` (default) + webhook legado
> com espelhamento ativo para `/api/v2/webhook/evolution` com `x-shadow: true`.
>
> **Gate de cutover:** taxa de equivalência ≥ 95 %, p95 ≤ legado, custo ≤ legado.
> Se aprovado pelo Lucas → setar `ATENDIMENTO_ENGINE=v2`.

---

## 1. Período de observação

| Campo | Valor |
|---|---|
| Início | _preencher_ |
| Fim | _preencher_ |
| Dias coletados | _preencher_ |
| Total de mensagens espelhadas | _preencher_ |
| Tenants cobertos | _preencher_ |

---

## 2. Equivalência de respostas (LLM-as-judge via `/api/v2/ia/replay`)

Executar: `POST /api/v2/ia/replay` com `{ from, to, sample: 100 }` e aguardar `status: done`.

| Métrica | Valor | Gate |
|---|---|---|
| Total amostrado | _preencher_ | ≥ 50 |
| Equivalentes | _preencher_ | — |
| **Taxa de equivalência** | _preencher_ | **≥ 95 %** |
| Erros de execução | _preencher_ | — |

Amostra de 5 pares divergentes (para análise):

| # | Mensagem do cliente | Resposta legado | Resposta v2 | Motivo da divergência |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |

---

## 3. Latência

Fonte: tabela `shadow_results`, coluna `latency_ms`.

```sql
SELECT
  percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms) AS p50_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99_ms,
  avg(latency_ms)::int                                      AS avg_ms,
  count(*)                                                  AS total
FROM shadow_results
WHERE created_at BETWEEN '<início>' AND '<fim>';
```

| Métrica | Valor v2 | Valor legado (Helicone) | Gate |
|---|---|---|---|
| p50 | _preencher_ | _preencher_ | — |
| **p95** | _preencher_ | _preencher_ | **≤ legado** |
| p99 | _preencher_ | _preencher_ | — |
| média | _preencher_ | _preencher_ | — |

---

## 4. Custo por conversa (Helicone)

| Motor | Custo total período | Conversas | Custo / conversa | Gate |
|---|---|---|---|---|
| Legado | _preencher_ | _preencher_ | _preencher_ | — |
| **v2** | _preencher_ | _preencher_ | _preencher_ | **≤ legado** |

---

## 5. Erros e incidentes

| Data/hora | Descrição | Impacto (shadow / real) | Resolvido? |
|---|---|---|---|
| | | | |

---

## 6. Decisão de cutover

- [ ] Taxa de equivalência ≥ 95 % — confirmado
- [ ] p95 latência v2 ≤ legado — confirmado
- [ ] Custo por conversa v2 ≤ legado — confirmado
- [ ] Zero incidente crítico durante o período shadow — confirmado
- [ ] Replay IA-46 executado com `pass_rate ≥ 0.95` — confirmado

**Decisão:** _preencher: "APROVADO — executar cutover" ou "BLOQUEADO — motivo"_

**Responsável:** Lucas (dono do produto)

**Data da decisão:** _preencher_

### Procedimento de cutover

```bash
# 1. Setar a engine v2 em produção
ATENDIMENTO_ENGINE=v2

# 2. Monitorar por 30 min: logs do message.worker + health do Fastify
# dashboard: /api/health + BullMQ dashboard (astrum-messages)

# 3. Rollback (se necessário):
ATENDIMENTO_ENGINE=legacy
# O legado volta a atender imediatamente; o v2 vira shadow de novo.
```

---

## 7. Pós-cutover (preencher após virar a chave)

| Métrica | Valor pós-cutover | Comparação |
|---|---|---|
| Taxa de erro (500s) | | |
| p95 latência real | | |
| Respostas enviadas pelo v2 | | |
| Problemas reportados por clientes | | |

---

*Gerado em 2026-07-11 pelo executor da S74. Preencher durante o período de observação.*
