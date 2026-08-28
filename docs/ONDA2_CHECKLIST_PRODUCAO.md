# Onda 2 — Checklist de Ativação em Produção

> Itens que podem ser ligados HOJE sem tráfego real.
> Ação do Lucas: setar no painel Vercel (frontend) e Railway (backend).

## 1. Flags de infra (Tier 1) — zero risco com tráfego zero

Setar no painel Railway (backend `apps/api`):

| Env Variable | Valor | O que faz |
|---|---|---|
| `INTELLIGENCE_HUB_ENABLED` | `true` | Central de inteligência no nav |
| `TOOL_REGISTRY_ENABLED` | `true` | Liga/desliga tools do agente por tenant |
| `SAFETY_CLASSIFIER_ENABLED` | `true` | Classificador constitucional de respostas |
| `GRAPHRAG_ENABLED` | `true` | Tool de grafo de rede |
| `LIVE_TRANSLATION_ENABLED` | `true` | Atendimento multilíngue |
| `PROMPT_COMPRESSION_ENABLED` | `true` | Compressão determinística de contexto RAG |
| `FEATURE_STORE_ENABLED` | `true` | Feature store para ML pipelines |
| `BANDIT_ENABLED` | `true` | Multi-armed bandit para seleção de prompts |
| `DRIFT_DETECTION_ENABLED` | `true` | Detecção de drift em embeddings |
| `AGENT_SANDBOX_ENABLED` | `true` | Sandbox SQL seguro |
| `PROVIDER_FAILOVER_ENABLED` | `true` | Failover automático entre LLM providers |
| `REPLAY_ENGINE_ENABLED` | `true` | Replay de conversas para validação |
| `OTEL_ENABLED` | `true` | Tracing distribuído OpenTelemetry |

## 2. Shadow mode — começa a coletar dados

| Env Variable | Valor | O que faz |
|---|---|---|
| `FASTIFY_INTERNAL_URL` | URL interna do Fastify | Ativa shadow mirroring do legacy → v2 |
| `COBRAI_ENGINE` | `legacy` (prod) | Mantém cobrança no legado enquanto coleta shadow |
| `ATENDIMENTO_ENGINE` | `legacy` (prod) | Mantém atendimento no legado enquanto coleta shadow |

> **Sequência segura**: manter engines em `legacy`, ligar `FASTIFY_INTERNAL_URL`.
> O shadow coleta dados sem afetar produção. Após 7 dias avaliar SHADOW_REPORT.

## 3. Wind Tunnel (D-15) — staging only

| Env Variable | Valor | Onde |
|---|---|---|
| `WIND_TUNNEL_ENABLED` | `true` | **Staging apenas** — nunca em produção |

Requisito: migrations 072 e 078 aplicadas no Supabase.

## 4. Coisas que JÁ estão prontas no código (sem env)

- [x] Lighthouse CI config (`.lighthouserc.cjs`) — roda em push/PR no main (corrigido 2026-08-27: só tinha gatilho `pull_request`, mas o projeto faz push direto no main sem PR, então nunca rodava; config também estava em `.js` com `module.exports` colidindo com `"type": "module"` do `package.json`, quebrava ao carregar)
- [x] Turbo cache otimizado (`turbo.json` com inputs)
- [x] GitHub Actions: Lighthouse workflow (`.github/workflows/lighthouse.yml`)
- [x] CI/CD: unit tests, build, E2E, eval, CodeQL, security audit
- [x] Dependabot semanal
- [x] CODEOWNERS configurado

## 5. Bloqueado por tráfego real (Onda 2 tardia)

| Item | Requisito | Estimativa |
|---|---|---|
| Taxa de resolução >80% | Conversas reais | 30+ dias de tráfego |
| Backtesting régua (D-02) | 90d de variant_sends no v2 | ~90 dias |
| CFO virtual (D-08 F2) | 90d de dados de cobrança | ~90 dias |
| Modelo ISP-BR (D-10) | 5k+ exemplos rotulados | Depende de volume |
| Índice federado (D-09) | 10+ tenants ativos | Depende de adoção |
| Nightly brain calibrado | Conversas do dia | Depende de shadow |

## 6. Próximos passos sugeridos

1. Setar as 13 flags Tier 1 no Railway
2. Configurar `FASTIFY_INTERNAL_URL` apontando para o Fastify de prod
3. Esperar 7 dias de shadow → avaliar SHADOW_REPORT
4. Cutover do primeiro tenant piloto
5. Em paralelo: rodar Wind Tunnel em staging para validar o agente
