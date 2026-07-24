# Load + Chaos Test Report — S84

> Template gerado em 2026-07-21. Execute os testes para preencher com dados reais.

## Scripts disponíveis

### Load Test (K6)
```bash
# 1000 mensagens burst no webhook Evolution v2
k6 run scripts/load-test/webhook-stress.js

# API endpoints com ramp-up
k6 run --env JWT_TOKEN=<token> scripts/load-test/api-endpoints.js

# Personalizar
k6 run --vus 200 --duration 60s scripts/load-test/webhook-stress.js
```

### Chaos Test
```bash
# Testar resiliência de cada dependência
npx tsx scripts/chaos/chaos-runner.ts --target redis --duration 15
npx tsx scripts/chaos/chaos-runner.ts --target qdrant --duration 15
npx tsx scripts/chaos/chaos-runner.ts --target openai --duration 15
npx tsx scripts/chaos/chaos-runner.ts --target supabase --duration 15
npx tsx scripts/chaos/chaos-runner.ts --target all --duration 15

# Testes unitários de resiliência (circuit breaker + fallback)
npx vitest run scripts/chaos/resilience.test.ts --config vitest.config.ts --project backend
```

## Metas

| Métrica | Meta | Status |
|---------|------|--------|
| p95 webhook | < 1500ms | ⏳ Pendente execução |
| Throughput | ≥ 1000 msg/120s | ⏳ Pendente execução |
| Job loss | 0 | ⏳ Pendente execução |
| Redis down → fail-open | Sem perda de msg | ⏳ Pendente execução |
| Qdrant down → RAG degrada | Conversa continua | ⏳ Pendente execução |
| OpenAI down → fallback | Provider alternativo | ✅ Validado (7 testes) |
| Supabase down → retry | Fila persiste | ⏳ Pendente execução |

## Testes unitários de resiliência

| Teste | Resultado |
|-------|-----------|
| Fallback quando provider primário falha | ✅ |
| Circuito abre após 3 falhas consecutivas | ✅ |
| HALF_OPEN após timeout do circuito | ✅ |
| Todos providers falhando → erro explícito | ✅ |
| Gemini como fallback de última instância | ✅ |
| Sucesso fecha o circuito | ✅ |
| HALF_OPEN que falha reabre o circuito | ✅ |

## Nota

A execução completa dos testes de load (K6) e chaos (Docker) depende de ambiente
com os containers rodando. Os scripts estão prontos; os números reais serão
preenchidos na primeira execução em staging.
