# IA-10 — Multi-agente por domínio: Plano de Design

> **Status:** GATED — não implementável em código de produção até `ATENDIMENTO_ENGINE=v2` estar estável (pós-S74/S82).
> **Sessão autorizada por:** Lucas (dono do produto) em 2026-07-05, apesar do gating do plano.
> **Dependências não satisfeitas:** IA-01 (CRAG), IA-03 (prompt registry), IA-07 (`churn_scores`), cutover `ATENDIMENTO_ENGINE=v2`.

---

## 1. Objetivo

Criar um supervisor LangGraph que roteia conversas para subgrafos especializados por domínio:

- **`atendimento`** — grafo atual (`domain/agent/langgraph.service.ts`), focado em suporte técnico/billing.
- **`cobranca`** — tools de fatura/negociação integradas às regras do `cobrai-rules.service.ts`.
- **`retencao`** — gatilhado por `churn_scores.risk_band='critical'` (IA-07), com playbook de retenção.

Handoff via edge condicional por intent, estado compartilhado mínimo.

## 2. Arquitetura MVP

```
                    ┌─────────────┐
  mensagem do cliente → Supervisor │
                    └──────┬──────┘
                           │ intent + contexto
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │ atendimento │ │  cobranca   │ │  retencao   │
    │   (grafo    │ │  (tools +   │ │ (churn +    │
    │   atual)    │ │   regras)   │ │  ofertas)   │
    └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
           │               │               │
           └───────────────┴───────────────┘
                           │
                           ▼
                     resposta única
```

## 3. Estado compartilhado mínimo

```ts
interface MultiAgentState {
  tenantId: string;
  customerId?: string;
  conversationId: string;
  userMessage: string;
  intent: 'atendimento' | 'cobranca' | 'retencao' | 'escalation';
  summary?: string;        // resumo acumulado entre subgrafos
  subGraphResult?: string; // resposta do subgrafo ativo
  response?: string;       // resposta final ao cliente
  steps: string[];
}
```

## 4. Supervisor

Responsabilidades:
1. Classificar intent da mensagem (`classifyIntent` reutilizando `vercel-ai.service.ts` com `gpt-4o-mini`).
2. Se `churn_scores.risk_band='critical'` para o cliente → forçar `retencao`.
3. Escolher subgrafo e delegar.
4. Receber resposta do subgrafo; decidir se encerra, re-roteia ou escala.

Prompt do supervisor (placeholder):

```
Você é o supervisor de atendimento da Astrum. Classifique a intenção do cliente em uma das categorias:
- atendimento: suporte técnico, status, visita, diagnóstico
- cobranca: fatura, boleto, negociação, suspensão
- retencao: cancelamento, insatisfação, churn crítico
- escalation: caso complexo que precisa de humano

Responda apenas com o JSON: {"intent": "...", "reason": "..."}
```

## 5. Subgrafos

### 5.1 `atendimento`
- Reutilizar `buildAgentGraph()` atual (com CRAG quando IA-01 mergeada).
- Entrada: estado compartilhado.
- Saída: `response` + `requiresHuman`.

### 5.2 `cobranca`
- Tools: `check_invoice`, `create_payment_plan`, `negotiate_due_date`, `suspend_signal`.
- Regras: importar `cobrai-rules.service.ts` para limites de negociação.
- Guardrail: janela de horário, opt-out, limite de contatos.

### 5.3 `retencao`
- Gatilho: `churn_scores.risk_band='critical'` para o `customerId`.
- Playbook:
  - Oferecer desconto/upgrade (se permitido pelo plano do tenant).
  - Escalar para time de retenção humano se cliente confirmar cancelamento.
- Tools: `apply_retention_offer`, `schedule_retention_call`.

## 6. Handoff

- Edge condicional do supervisor lê `intent` e `churn_scores.risk_band`.
- Após subgrafo terminar, supervisor decide:
  - `response` pronto → responde ao cliente.
  - intent mudou (ex.: fatura → cancelamento) → re-roteia.
  - `requiresHuman` → escalation.

## 7. Flags

- `MULTI_AGENT_ENABLED=off|on` (default `off`).
- Só sobe quando `ATENDIMENTO_ENGINE=v2` e `MULTI_AGENT_ENABLED=on`.

## 8. Arquivos previstos

| Arquivo | Ação |
|---|---|
| `apps/api/src/domain/agent/multi-agent.supervisor.ts` | Criar |
| `apps/api/src/domain/agent/multi-agent.state.ts` | Criar |
| `apps/api/src/domain/agent/subgraphs/cobranca.subgraph.ts` | Criar |
| `apps/api/src/domain/agent/subgraphs/retencao.subgraph.ts` | Criar |
| `apps/api/src/domain/agent/multi-agent.service.test.ts` | Criar |

## 9. Critérios de aceite futuros

- [ ] Flag off → comportamento do grafo `atendimento` atual.
- [ ] Flag on + intent cobrança → subgrafo de cobrança responde usando `cobrai-rules`.
- [ ] Flag on + churn crítico → subgrafo de retenção entra em ação.
- [ ] Handoff mantém contexto mínimo (tenant/customer/conversation/summary).
- [ ] Testes cobrem roteamento por intent e gatilho de churn.

## 10. Bloqueios atuais

1. `ATENDIMENTO_ENGINE=v2` não está estável em produção.
2. IA-01 (CRAG) e IA-03 (prompt registry) não mergeados em `main`.
3. IA-07 (`churn_scores`) não mergeada em `main`.
4. Sem `cobrai-rules.service.ts` consolidado como subgrafo.

**Recomendação:** não gerar código de produção até os bloqueios 1–3 serem resolvidos.
