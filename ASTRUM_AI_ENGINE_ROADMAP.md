# 🚀 ASTRUM — AI ENGINE SETORIAL ROADMAP
## Implementação dos 12 Blocos Tecnológicos · Nível Big Tech

> **Objetivo:** Transformar a Astrum de chatbot inteligente em AI Engine Setorial para ISPs brasileiros.  
> **Horizonte:** 14 Sprints · ~28 semanas · Stack: Node.js + TypeScript + Supabase + Qdrant + OpenAI  
> **Filosofia:** Majestic Monolith → DDD → Hexagonal → sem microserviços antes de escala justificar

---

## 📐 PRINCÍPIOS DE EXECUÇÃO

| Princípio | Aplicação |
|-----------|-----------|
| **Foundation First** | Arquitetura e padrões antes de features |
| **Strangler Fig** | Cada novo módulo substitui o antigo gradualmente |
| **One Source of Truth** | Cada tecnologia vive em um único lugar |
| **Observability desde o Dia 1** | Nada vai para produção sem logs + métricas |
| **Segurança by Design** | LGPD e isolamento multi-tenant em cada camada |

---

## 🗺️ MAPA DE DEPENDÊNCIAS CRÍTICAS

```
[Bloco 12: Padrões]     ←── BASE DE TUDO. Implementar ANTES do código.
       ↓
[Bloco 7: Backend]      ←── Node.js + Fastify. Motor central.
       ↓
[Bloco 9: Segurança]    ←── Auth + RLS. Sem isso, sem multi-tenant.
       ↓
[Bloco 5: Dados]        ←── Supabase + Qdrant + R2. Memória do sistema.
       ↓
[Bloco 6: Mensageria]   ←── Redis + BullMQ. Sistema circulatório.
       ↓
[Bloco 1: LLMs]         ←── OpenAI + Routing. O cérebro.
       ↓
[Bloco 2: Guardrails]   ←── Zod + Presidio. Blindagem cognitiva.
       ↓
[Bloco 3: RAG]          ←── Qdrant + Zep + HyDE. Memória de longo prazo.
       ↓
[Bloco 4: Agentes]      ←── LangGraph + BullMQ. O sistema nervoso.
       ↓
[Bloco 8: Frontend]     ←── React + Zustand + WebSockets. A interface.
       ↓
[Bloco 10: DevOps]      ←── Docker + CI/CD + PaaS. A fábrica de deploys.
       ↓
[Bloco 11: Observabilidade] ←── Sentry + LangSmith + RAGAS. Os olhos.
```

---

## ⚡ SPRINT 0 — FUNDAÇÃO ARQUITETURAL
### Duração: 2 semanas · Bloco 12

> **Meta:** Nenhuma feature. Apenas estrutura. O código que vai existir para sempre.

### Entregas

**0.1 — Reorganização do Monorepo (DDD + Hexagonal)**
- Estrutura de pastas por domínio de negócio, não por tecnologia
- Adapters isolados para OpenAI, Supabase, Qdrant (troca de provider = 1 arquivo)
- Separação rígida: `domain/` · `application/` · `infrastructure/` · `adapters/`

```
astrum/
├── domain/
│   ├── atendimento/        # Tickets, Chat, Clientes
│   ├── cobranca/           # CobrAI, Faturas, Pagamentos
│   ├── provedor/           # ISP, Contratos, Planos
│   └── ia/                 # Prompts, Agentes, RAG
├── application/            # Use cases
├── infrastructure/         # Supabase, Redis, BullMQ
└── adapters/               # OpenAI, Qdrant, WhatsApp
```

**0.2 — Padrões de Resiliência no Core**
- Circuit Breaker implementado no adapter da OpenAI
- Token Bucket no middleware do Fastify (rate limiting por tenant)
- Backpressure no pipeline de ingestão de arquivos CSV
- Idempotency Keys em TODAS as rotas financeiras e de suspensão

**0.3 — Write-Ahead Logging (WAL) no Supabase**
- Configuração do PostgreSQL WAL ativada
- Verificação de que nenhuma transação financeira perde dados em crash

**0.4 — Configuração dos Padrões de Cache**
- ETag Caching nos endpoints de arquivos estáticos (manuais, PDFs)
- Memoization para funções de cálculo pesado (retenção, churn por ISP)
- CRDTs preparados para tickets colaborativos simultâneos

### Critério de Conclusão (Definition of Done)
- [ ] Monorepo organizado por domínio
- [ ] Circuit Breaker testado com simulação de queda da OpenAI
- [ ] Idempotency Keys cobrindo 100% das rotas críticas
- [ ] WAL verificado com teste de crash recovery

---

## ⚡ SPRINT 1 — BACKEND CORE
### Duração: 2 semanas · Bloco 7

> **Meta:** O motor central operacional. Tudo que existe depende disso.

### Entregas

**1.1 — Node.js + Fastify Production-Grade**
- Migração completa de Express → Fastify (se ainda não feita)
- Validação de JSON schemas em todas as rotas via Fastify
- Graceful Shutdown implementado: servidor termina jobs antes de morrer
- Pre-forking com Cluster Module para aproveitar todos os cores

**1.2 — WebSockets + SSE**
- WebSockets para mensagens bidirecionais em tempo real (chat)
- SSE para streaming de tokens da IA (efeito letra-a-letra)
- Reconexão automática no cliente com backoff exponencial

**1.3 — REST API + Webhooks HMAC**
- Assinatura HMAC em todos os webhooks recebidos (WhatsApp, pagamentos)
- Svix configurado para envio de webhooks para fora (notificações B2B)
- Padronização de respostas de erro com códigos semânticos

**1.4 — Cloudflare Workers**
- Workers na borda para validação de JWT antes de chegar ao Node.js
- Bloqueio de IPs maliciosos antes de consumir recursos do servidor

### Critério de Conclusão
- [ ] Fastify com benchmark >10k req/s no ambiente de staging
- [ ] WebSocket testado com 100 conexões simultâneas
- [ ] HMAC validando 100% dos webhooks recebidos
- [ ] Graceful Shutdown testado com SIGTERM durante processamento ativo

---

## ⚡ SPRINT 2 — SEGURANÇA & MULTI-TENANCY
### Duração: 2 semanas · Bloco 9

> **Meta:** Sem isso, a Astrum não é B2B. É o pré-requisito de tudo que vem depois.

### Entregas

**2.1 — Supabase Auth com JWT Rotation**
- JWT expirando a cada 15 minutos com refresh automático
- RBAC Granular: Support / Admin / Owner com permissões atômicas
- Políticas RLS validadas: teste automatizado de vazamento cross-tenant

**2.2 — Caddy + Cloudflare WAF**
- Caddy como reverse proxy com HTTPS automático
- WAF da Cloudflare bloqueando SQLi, XSS, e prompt injection via HTTP
- Rate limiting por IP na borda antes de chegar ao Node.js

**2.3 — Secrets Management**
- TODAS as chaves (OpenAI, Qdrant, Supabase) saem do `.env` para o Cloud Secrets Manager
- Rotação automática de secrets configurada
- Argon2id para hashing de senhas de usuários

**2.4 — VPC Peering + CSP**
- VPC fechando Supabase e Redis sem acesso público direto
- Content Security Policy estrita bloqueando scripts não autorizados
- Teste de penetração básico nas rotas críticas

### Critério de Conclusão
- [ ] Teste automatizado: Provedor A NÃO consegue acessar dados do Provedor B
- [ ] Rotação de JWT testada sem logout do usuário
- [ ] Zero secrets em variáveis de ambiente em produção
- [ ] CSP bloqueando injeção de scripts externos

---

## ⚡ SPRINT 3 — DADOS & STORAGE
### Duração: 2 semanas · Bloco 5

> **Meta:** A memória persistente da Astrum. Sem dados, não há IA.

### Entregas

**3.1 — Supabase Multi-tenant Production-Grade**
- RLS policies em todas as tabelas críticas
- Materialized Views para dashboards (churn, retenção) — recalcula à meia-noite
- Índices otimizados para queries de atendimento em tempo real

**3.2 — Qdrant Dockerizado com Particionamento por Tenant**
- Coleção separada por ISP (Provedor A ≠ Provedor B no nível do banco vetorial)
- Configuração de Snapshotting automático diário
- Payload indexing para filtros por data, tipo de documento, ISP_ID

**3.3 — Cloudflare R2**
- Bucket configurado por tenant para áudios do WhatsApp e PDFs
- Zero Egress confirmado nas configurações
- S3 Intelligent-Tiering para arquivos >90 dias (arquivamento automático)
- ETag headers em todos os arquivos servidos

**3.4 — DuckDB In-Process**
- DuckDB rodando dentro do Node.js para queries analíticas
- Endpoint de upload de CSV/Excel do gestor processando via DuckDB
- Isolamento total do Supabase durante análises pesadas

**3.5 — Supabase Realtime CDC**
- CDC configurado: pagamento confirmado → webhook automático → BullMQ
- Teste de consistência: Supabase atualiza → React frontend atualiza em <500ms

### Critério de Conclusão
- [ ] Query de 100k registros via DuckDB em <2 segundos
- [ ] CDC disparando evento em <1 segundo após mudança no banco
- [ ] Qdrant com dados de 2 tenants sem vazamento entre coleções
- [ ] R2 servindo arquivo de 10MB com 0 custo de egress confirmado

---

## ⚡ SPRINT 4 — MENSAGERIA & FILAS
### Duração: 2 semanas · Bloco 6

> **Meta:** O sistema circulatório. Nenhuma mensagem pode se perder.

### Entregas

**4.1 — Redis Production-Grade**
- Redis com persistência AOF (Append-Only File) ativada
- Rate limiting por tenant armazenado no Redis (Token Bucket)
- Semantic Cache: respostas de IA cacheadas por similaridade de intent

**4.2 — BullMQ com Dead Letter Queues**
- Fila separada por tipo: `cobranca`, `whatsapp`, `ai_processing`, `notifications`
- Retry automático com backoff exponencial (3 tentativas: 1min, 5min, 15min)
- DLQ para jobs que falharam 3x — alertas no Sentry automaticamente
- Priority Queue: suspensões de sinal têm prioridade máxima

**4.3 — Outbox Pattern**
- Implementação na tabela `outbox_events` no Supabase
- Worker que lê a outbox e envia para BullMQ em transação atômica
- Garantia: nenhum pagamento processado perde o evento de ativação

**4.4 — Filas Prioritárias Dinâmicas CobrAI**
- Régua de cobrança com 5 etapas: cada etapa é um job com delay configurável
- Cancelamento de job possível se cliente pagar antes do próximo disparo
- Histórico de cada disparo persistido no Supabase com timestamp

### Critério de Conclusão
- [ ] Simulação de crash do Node.js durante processamento: 0 mensagens perdidas
- [ ] DLQ capturando jobs falhos e alertando em <1 minuto
- [ ] Outbox garantindo consistência em 100 transações simuladas
- [ ] BullMQ processando 1000 jobs/minuto sem degradação

---

## ⚡ SPRINT 5 — MOTOR LLM & FINOPS
### Duração: 2 semanas · Bloco 1

> **Meta:** O cérebro da Astrum. Inteligente, rápido e economicamente sustentável.

### Entregas

**5.1 — LLM Router**
- Classificador leve no Node.js que avalia complexidade da mensagem
- Rota simples (saudações, status) → GPT-4o-mini
- Rota complexa (diagnóstico técnico, análise de churn) → GPT-4o
- Log de roteamento no Helicone para auditoria de custo

**5.2 — Helicone**
- Proxy configurado entre Node.js e OpenAI
- Dashboard de custo por tenant ativo
- Alertas automáticos se custo de um ISP ultrapassar threshold configurado
- Latência p95 monitorada por endpoint

**5.3 — Prompt Caching / Context Caching**
- System instructions dos ISPs configuradas com cache ativado
- Teste de economia: comparar custo com/sem cache em 1000 mensagens
- Cache-Control headers nas chamadas à API da OpenAI

**5.4 — OpenAI Batch API**
- Pipeline noturno de análise de churn da base de clientes de cada ISP
- Processamento em lote do histórico de tickets para insights semanais
- Confirmação de 50% de desconto validada no painel do Helicone

### Critério de Conclusão
- [ ] LLM Router classificando corretamente >95% das mensagens em teste
- [ ] Helicone com custo por tenant visível em tempo real
- [ ] Prompt Cache reduzindo custo em >60% nas conversas longas
- [ ] Batch API processando análise de 10k clientes por <$2

---

## ⚡ SPRINT 6 — GUARDRAILS & SEGURANÇA COGNITIVA
### Duração: 2 semanas · Bloco 2

> **Meta:** A IA que não pode ser manipulada, que nunca vaza CPF e que sempre retorna JSON válido.

### Entregas

**6.1 — Zod + Vercel AI SDK Structured Outputs**
- Schemas Zod definidos para TODOS os outputs da IA que afetam o banco
- `generateObject` com JSON Mode em todas as extrações de dados
- Testes automatizados: IA com schema mal-formatado deve rejeitar e logar

**6.2 — Microsoft Presidio**
- Pipeline de anonimização antes de cada chamada à OpenAI
- CPF, cartão de crédito, email detectados e substituídos por `[DADO_SENSIVEL]`
- Log de cada dado anonimizado para auditoria LGPD

**6.3 — LLM Prompt Injection Deflector**
- Modelo leve de classificação rodando antes de cada mensagem
- Threshold de score para bloqueio configurável por ISP
- Mensagens bloqueadas logadas no Sentry com payload original (anonimizado)

**6.4 — Chain of Thought + Few-Shot Dinâmico**
- CoT ativado em todos os prompts de diagnóstico técnico e financeiro
- Pipeline de Few-Shot: Qdrant busca 3 tickets resolvidos similares → injeta no prompt
- Testes A/B: resposta com CoT vs sem CoT em 100 perguntas técnicas

### Critério de Conclusão
- [ ] 0 CPFs reais enviados para a OpenAI em 1000 mensagens de teste
- [ ] Presidio detectando >99% de CPFs e cartões simulados
- [ ] Prompt Injection Deflector bloqueando 100% dos jailbreaks de teste
- [ ] Structured Outputs com 0% de falha de parsing em 500 extrações

---

## ⚡ SPRINT 7 — RAG ENGINE
### Duração: 2 semanas · Bloco 3

> **Meta:** A Astrum passa a "ler" e "lembrar" os manuais técnicos dos ISPs com precisão cirúrgica.

### Entregas

**7.1 — Pipeline de Ingestão de Documentos**
- Upload de PDF/DOCX/TXT pelo painel do ISP
- Semantic Chunking com análise de parágrafos (não corte por palavras)
- Overlap de 20% entre chunks para preservar contexto
- Embeddings via `text-embedding-3-small` → vetores no Qdrant com payload ISP_ID

**7.2 — Hybrid Search (BM25 + Semântico)**
- Busca semântica via Qdrant para contexto e significado
- BM25 para termos técnicos exatos (IPs, modelos de equipamento, siglas)
- Score fusion configurado: peso 60% semântico + 40% BM25
- Filtro obrigatório por ISP_ID em todas as buscas (isolamento de dados)

**7.3 — HyDE (Hypothetical Document Embeddings)**
- Implementação para queries vagas ("a internet caiu", "tô sem sinal")
- IA gera laudo hipotético → laudo vira query de busca → acha o real
- Comparação de precisão: HyDE vs busca direta em 100 queries vagas

**7.4 — Zep / Mem0 — Memória de Longo Prazo**
- Zep configurado como camada sobre o Qdrant
- Resumo automático de conversas antigas por cliente
- Extração de entidades: plano atual, histórico de problemas, equipamentos
- Injeção automática de contexto relevante em cada nova conversa

### Critério de Conclusão
- [ ] Ingestão de PDF de 100 páginas em <30 segundos
- [ ] Hybrid Search com precisão >85% em 50 queries técnicas reais de ISP
- [ ] HyDE melhorando recall em >30% em queries vagas
- [ ] Zep recuperando contexto de conversa de 3 meses em <500ms

---

## ⚡ SPRINT 8 — AGENTES & ORQUESTRAÇÃO
### Duração: 2 semanas · Bloco 4

> **Meta:** A IA para de responder e começa a agir. Máquinas de estado determinísticas.

### Entregas

**8.1 — LangGraph State Machines**
- Fluxo de Suporte Técnico: Triagem → Diagnóstico → Solução → Escalonamento
- Fluxo CobrAI: Aviso → Negociação → Suspensão → Reativação
- Fluxo de Onboarding: Boas-vindas → Coleta de dados → Ativação
- Regra: NENHUM agente avança para o nó seguinte sem validação do nó atual

**8.2 — Agentic RAG**
- Agente decide automaticamente: Supabase (dados) ou Qdrant (manuais)
- Custo de decisão: query ao Supabase = $0 · query ao Qdrant = custo de embedding
- Log de cada decisão de roteamento para otimização futura

**8.3 — BullMQ Durable Workflows**
- "Vou pagar amanhã" → job com delay de 24h no BullMQ
- "Ligue em 3 dias" → delay de 72h com cancelamento se pagar antes
- Teste de resiliência: servidor reinicia durante espera → job continua

**8.4 — Webhooks HMAC nos Agentes**
- Todos os eventos externos que ativam agentes (pagamento, WhatsApp) assinados via HMAC
- Validação criptográfica antes de qualquer ação do agente
- Log de cada webhook recebido, validado e processado

### Critério de Conclusão
- [ ] Agente de Suporte completando fluxo end-to-end sem intervenção humana em >80% dos casos simples
- [ ] LangGraph nunca pulando um nó de validação em 100 execuções de teste
- [ ] BullMQ delay de 24h testado com crash: job executado no tempo correto após restart
- [ ] 0 webhooks processados sem validação HMAC

---

## ⚡ SPRINT 9 — FRONTEND & UX
### Duração: 2 semanas · Bloco 8

> **Meta:** Interface que faz o gestor do ISP sentir que está usando um produto enterprise de primeira linha.

### Entregas

**9.1 — React 18 + Vite SPA + TypeScript Strict**
- TypeScript strict mode sem `any` no código de produção
- Vite com HMR ultrarrápido no ambiente de desenvolvimento
- Code splitting por rota para carregamento inicial <1MB

**9.2 — Zustand + TanStack Query**
- Zustand para estado global de sessão e UI
- TanStack Query para cache de dados do servidor
- Stale-While-Revalidate: dados mostrados instantaneamente, atualizados em background
- Invalidação de cache automática via CDC do Supabase

**9.3 — Design System Shadcn/UI + Tailwind**
- Componentes Shadcn customizados com identidade visual da Astrum
- Tailwind com tokens de design: cores, tipografia, espaçamentos padronizados
- Framer Motion em 3 pontos críticos: abertura de modais, transições de página, loading states

**9.4 — Performance UX**
- Optimistic UI em todas as ações críticas (envio de mensagem, atualização de ticket)
- Skeletal Loading substituindo spinners em todas as listagens
- Font Subset: apenas caracteres PT-BR carregados (redução de 90% no tamanho)
- WebSockets integrados: mensagens chegam sem polling

**9.5 — SSE Streaming**
- Tokens da IA aparecem letra-a-letra no chat (efeito ChatGPT)
- Abort Controller: usuário pode cancelar resposta em andamento
- Indicador visual de "IA pensando..." com animação durante streaming

### Critério de Conclusão
- [ ] Lighthouse Score >90 em Performance, Accessibility, Best Practices
- [ ] Time to Interactive <2 segundos em conexão 4G simulada
- [ ] Optimistic UI testado com latência de rede simulada de 2 segundos
- [ ] Streaming de tokens funcionando em todas as respostas da IA

---

## ⚡ SPRINT 10 — DEVOPS & CI/CD
### Duração: 2 semanas · Bloco 10

> **Meta:** A fábrica de deploys. Código vai para produção em minutos, não horas.

### Entregas

**10.1 — Docker Multi-stage Production**
- Build de produção com Multi-stage: imagem final <100MB
- GitHub Container Registry como registry privado
- Nenhuma chave ou secret na imagem Docker
- Health checks configurados no container

**10.2 — GitHub Actions Pipeline**
- Pipeline: Lint → Test → Build → Deploy
- TurboRepo Remote Caching: módulos não alterados não recompilam
- Ephemeral Environments: PR abre ambiente temporário com link para testar
- Proteção: deploy para produção somente após todos os tests passarem

**10.3 — PaaS Deploy com Graceful Shutdown**
- Render / DigitalOcean App Platform configurado
- Graceful Shutdown: servidor recusa novas conexões, espera jobs ativos terminarem
- Zero-downtime deploy com Health Probe antes de trocar container

**10.4 — Pulumi + Renovate**
- Infraestrutura como código em TypeScript via Pulumi
- Renovate configurado: PRs automáticos para atualização de dependências
- Alertas de segurança (Dependabot) integrados ao Slack/Discord

### Critério de Conclusão
- [ ] Deploy completo do zero em <5 minutos via GitHub Actions
- [ ] Ephemeral Environment funcionando em cada PR aberto
- [ ] Graceful Shutdown testado: 0 jobs interrompidos durante deploy
- [ ] Renovate abrindo PR automaticamente para atualização de biblioteca crítica

---

## ⚡ SPRINT 11 — OBSERVABILIDADE
### Duração: 2 semanas · Bloco 11

> **Meta:** Ver tudo. Saber de problemas antes do cliente reclamar.

### Entregas

**11.1 — Pino.js Logging**
- Substituição de todos os `console.log` por Pino.js estruturado
- Logs em JSON com campos padronizados: `tenant_id`, `request_id`, `user_id`
- SonicBoom para escrita assíncrona (0 impacto na latência do chat)
- Pino-HTTP capturando metadata de todas as requests automaticamente

**11.2 — Sentry**
- Error tracking em produção com Source Maps do TypeScript
- Sentry Profiling: identificar qual função consume mais CPU
- Alertas para Slack em erros novos ou spike de erros existentes
- Performance Monitoring: rastrear endpoints lentos

**11.3 — Vitest + Playwright + Lighthouse CI**
- Vitest: testes unitários para toda a lógica de domínio
- Playwright: testes E2E cobrindo fluxo completo de atendimento
- Lighthouse CI travando deploy se Performance Score cair abaixo de 85

**11.4 — LangSmith + RAGAS + LLM-as-a-Judge**
- LangSmith: rastreio visual de cada chamada LLM em produção
- RAGAS rodando diariamente: nota de qualidade do Qdrant
- LLM-as-a-Judge em cada deploy: GPT-4o avalia 100 perguntas com a nova versão
- Deploy cancelado automaticamente se nota cair >10% vs versão anterior

### Critério de Conclusão
- [ ] 100% das chamadas à OpenAI rastreadas no LangSmith
- [ ] RAGAS com score >0.8 na base de manuais técnicos de teste
- [ ] Sentry capturando 100% dos erros não tratados
- [ ] Lighthouse CI bloqueando 1 deploy de teste com score baixo

---

## ⚡ SPRINT 12-14 — CONSOLIDAÇÃO & AI ENGINE COMPLETO
### Duração: 6 semanas · Integração de todos os blocos

> **Meta:** Os 12 blocos funcionando como um organismo único. A Astrum é um AI Engine Setorial.

### Sprint 12 — Integração End-to-End
- Fluxo completo: WhatsApp → Presidio → LangGraph → Qdrant → LLM → Resposta
- Teste com ISP real: carregar manuais, simular 100 atendimentos, medir precisão
- Ajuste fino do LLM Router com dados reais de produção
- CobrAI end-to-end: inadimplente recebe régua completa de 5 etapas

### Sprint 13 — Stress Test & Hardening
- Load test: 1.000 mensagens simultâneas (k6 ou Artillery)
- Chaos test: simular queda da OpenAI → Circuit Breaker ativa fallback
- Chaos test: simular queda do Qdrant → sistema degrada graciosamente
- Revisão completa de segurança: penetration test em todas as rotas críticas

### Sprint 14 — Multi-tenant Scale & Onboarding
- Onboarding automatizado: ISP cria conta → sistema provisiona tenant em <5 minutos
- Strangler Fig ativo: ISP X migra do IXC para Astrum módulo por módulo
- Dashboard de saúde por ISP: custo de IA, tickets resolvidos, taxa de resolução
- Documentação técnica completa para o time (ou próxima IA que mexer no código)

---

## 📊 SCORECARD DE TRANSFORMAÇÃO

| Métrica | Hoje (Chatbot) | Meta (AI Engine) |
|---------|---------------|-----------------|
| Taxa de resolução autônoma | ~40% | >80% |
| Custo por conversa | R$ X | R$ X × 0,4 (Prompt Cache) |
| Latência de resposta p95 | >3s | <1,5s |
| Dados de ISP vazando cross-tenant | Risco | Impossível (RLS) |
| Jobs de cobrança perdidos em crash | Possível | 0 (Outbox + DLQ) |
| Visibilidade de custo por ISP | Nenhuma | Tempo real (Helicone) |
| Deploy com downtime | Sim | 0 (Graceful Shutdown) |
| Erros capturados antes do cliente reclamar | Raro | 100% (Sentry) |

---

## 🎯 NORTH STAR METRICS

Quando todos os 14 sprints estiverem concluídos, a Astrum deve:

1. **Resolver >80% dos tickets de suporte sem intervenção humana**
2. **Processar a régua de cobrança CobrAI com 0% de jobs perdidos**
3. **Garantir isolamento absoluto de dados entre ISPs (RLS + Qdrant collections)**
4. **Custo de IA por ISP visível em tempo real com granularidade de centavos**
5. **Deploy de nova versão em <5 minutos com 0 downtime**
6. **Qualidade do RAG medida automaticamente a cada deploy**

---

## 📁 ARQUIVOS DE REFERÊNCIA

| Arquivo | Propósito |
|---------|-----------|
| `ASTRUM_12_BLOCOS.md` | Decisões arquiteturais e justificativas |
| `ASTRUM_AI_ENGINE_ROADMAP.md` | Este documento — plano de execução |
| `SETTINGS_REFACTOR.md` | Estrutura atual do Settings pós-auditoria |
| `PLANO_EXECUCAO.md` | Status das tarefas da sessão atual |

---

*Roadmap gerado com base nos 12 Blocos Tecnológicos da Astrum · Versão 1.0*  
*Próxima revisão: após conclusão do Sprint 7 (RAG Engine)*
