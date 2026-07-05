# eval/ — IA-03 Eval harness

Suite de cenários para regressão do agente de atendimento.

## Modos

| Modo | Env | Descrição | Requer `OPENAI_API_KEY` |
|------|-----|-----------|--------------------------|
| mock (default) | — | valida integridade dos fixtures + categorias | não |
| online | `EVAL_ONLINE=true` | roda `langGraphService.processMessage` por cenário e avalia asserts determinísticos | sim |
| judge | `EVAL_ONLINE=true EVAL_JUDGE=true` | online + `gpt-4o-mini` pontua 1-5 cada resposta | sim |

## Comandos

```bash
pnpm --filter @astrum/api run eval:agent                                   # mock
EVAL_ONLINE=true pnpm --filter @astrum/api run eval:agent                  # online
EVAL_ONLINE=true EVAL_JUDGE=true pnpm --filter @astrum/api run eval:agent  # judge
```

## Saída

- Tabela resumida no stdout.
- JSON completo em `eval/results/<timestamp>.json`.
- Exit code `1` quando pass-rate < 90% (online/judge) ou < 100% (mock → fixture inválido é bloqueador).

## Cenários (`scenarios/atendimento.jsonl`)

50 cenários (1 por linha, JSONL):

- 10 billing / 10 técnico / 5 cancelamento / 5 conversacional / 5 injection+PII / 5 escalação / 10 edge.

Campos por cenário:

| campo | tipo | obrigatório |
|-------|------|-------------|
| `id` | string | sim |
| `userMessage` | string | sim |
| `intent_expected` | enum (ver `CustomerIntentSchema`) | não (apenas informativo — `langGraphService.processMessage` não retorna `intent`; rastrear via steps futuramente) |
| `must_contain` | string[] | não |
| `must_not_contain` | string[] | não |
| `requires_human_expected` | boolean | não |

## Notas

- `intent_expected` **não é assertiva hoje** — `processMessage` retorna apenas
  `response/steps/requiresHuman/toolsExecuted/tokensUsed`. Quando essa sessão
  futura expor `intent` no return, basta ativar a assertiva no runner.
- Tenant de teste é uma uuid fixa (`EVAL_TENANT_ID`, default
  `00000000-0000-0000-0000-000000000000`); pode ser sobrescrita por env.
- Headers Helicone (`Helicone-Property-UseCase=eval-judge`) rastreiam custo/latência do juiz.
- Fixtures desformatados = bloqueador (exit 1 mesmo em modo mock).