# DOSSIÊ ASTRUM — Toda a tecnologia, explicada para qualquer pessoa entender

> **O teste deste documento:** se um concorrente ler isto, ele vai entender EXATAMENTE
> o que a Astrum é, onde cada peça mora e como funciona — e mesmo assim não vai
> conseguir copiar, porque o valor não está em nenhuma peça: está no fato de TODAS
> conversarem entre si sobre os dados do mesmo cliente. Escrito em 2026-07-12.

---

## 1. O QUE É A ASTRUM (em um parágrafo)

A Astrum é um **funcionário digital para provedores de internet** (ISPs). Ela atende
os clientes no WhatsApp/Instagram/e-mail/telefone, cobra quem está devendo (com jeito),
vende planos para quem chega, ajuda o técnico no poste, avisa o dono quando a rede vai
dar problema — e **aprende com cada conversa** para fazer tudo melhor amanhã. Ela se
conecta ao sistema que o provedor já usa (IXC, Voalle, MKAuth, SGP, HubSoft), então
não pede que ninguém troque de sistema: ela **opera** o sistema existente.

**A analogia-mestra:** pense num prédio. O térreo é onde os clientes entram (canais).
Os andares do meio são os departamentos (atendimento, cobrança, vendas, campo). A
cobertura é a sala do dono (dashboards). E o subsolo tem a fiação que ninguém vê mas
tudo usa (banco de dados, filas, segurança). Este dossiê visita cada andar.

---

## 2. O MAPA DO PRÉDIO (arquitetura)

| Parte | O que é | Onde mora |
|---|---|---|
| **Frontend oficial** | As 22 telas que o time do provedor usa (React/Vite) | `src/pages/` |
| **Backend legado** | O servidor que está em produção hoje (Express) | `src/` + `server.ts` |
| **Motor novo (v2)** | O servidor novo, mais forte, que vai assumir tudo (Fastify/DDD) | `apps/api/` |
| **Workers** | 14 "operários" que trabalham em segundo plano nas filas | `packages/queue/src/workers/` |
| **Banco de dados** | Supabase (Postgres) — ÚNICO banco. 86 tabelas, 76 migrations | `packages/db/src/migrations/` |
| **Cache e filas** | Redis — memória rápida + fila de tarefas (BullMQ) | infra |
| **Busca por significado** | Qdrant — guarda textos como "vetores" para busca semântica | infra |
| **Análises rápidas** | DuckDB — banco analítico para gráficos e previsões | `duckdb.service.ts` |

**Como os dois motores convivem:** duas chaves no ambiente (`ATENDIMENTO_ENGINE` e
`COBRAI_ENGINE`) dizem qual motor atende. Hoje: `legacy`. O motor novo roda em
"shadow mode": processa tudo em paralelo, SEM responder, só para provar que acerta.
Virar a chave = trocar uma linha de configuração. Voltar atrás = trocar de volta.

---

## 3. A JORNADA DE UMA MENSAGEM (como o cérebro pensa)

Quando um cliente manda *"minha internet caiu"* no WhatsApp, acontece isto, em ordem,
em ~3 segundos:

1. **Chegada** — o webhook recebe a mensagem e a coloca numa fila (nada se perde;
   se o sistema cair, a fila segura).
2. **Classificação** — a IA descobre O QUE o cliente quer (suporte? fatura? cancelar?).
3. **Guardrails (o segurança da porta)** — verifica se a mensagem é maliciosa
   (tentativa de hackear o bot, pedir dado de terceiros). Se for, bloqueia.
4. **Busca de contexto (RAG)** — procura na base de conhecimento DO PROVEDOR a
   informação relevante ("como resolver LOS piscando"). Se o que achou é ruim, o
   **CRAG** reescreve a busca e tenta de novo — e se ainda assim não fundamentar a
   resposta, NÃO INVENTA: passa para um humano.
5. **Ferramentas** — se precisar de dados reais, usa tools: consulta a fatura NO ERP,
   verifica se o sinal está ok, abre OS, agenda visita. O dono controla quais
   ferramentas a IA pode usar (tela `/intelligence/tools`).
6. **Geração + autocrítica** — escreve a resposta e SE AVALIA (self-check). Depois
   passa pelo **veto constitucional**: um segundo classificador confere se a resposta
   respeita as regras do provedor (a "constituição" — ex.: nunca prometer desconto).
7. **Envio ou escalação** — responde no canal, ou entrega para um humano com resumo
   pronto se o assunto exige gente.
8. **Aprendizado** — a conversa vira: métrica de qualidade, exemplo de treino,
   candidato a artigo de KB, e custo contabilizado ao centavo.

**Onde mora o cérebro:** `apps/api/src/domain/agent/langgraph.service.ts` (o grafo de
nós acima) + `multi-agent.supervisor.ts` (o "gerente" que chama especialistas:
subgrafo de cobrança, de retenção, de vendas).

---

## 4. OS DEPARTAMENTOS (andar por andar)

### 4a. ATENDIMENTO (o coração)
| Tecnologia | Em palavras simples | Onde |
|---|---|---|
| Motor LangGraph | O passo-a-passo do pensamento (item 3 acima) | `domain/agent/` |
| RAG híbrido | A "memória de leitura": acha a resposta nos documentos do provedor por significado, não por palavra exata | `infrastructure/rag/` |
| CRAG (corretivo) | Se a busca veio ruim, refaz melhor; resposta sem fonte NUNCA sai | nós `grade_context`/`rewrite_query`/`self_check` |
| Guardrails + Constituição | Dois seguranças: um na entrada (mensagem maliciosa) e um na saída (resposta fora das regras do dono) | `infrastructure/guardrails/` + IA-21/39 |
| Memória de conversa | Lembra o histórico do cliente entre conversas (Zep + janela de contexto) | `context-window.service.ts` |
| Compressão de contexto | Espreme o texto repetido antes de mandar para a IA — corta custo sem perder informação | IA-30 |
| Escalação inteligente | Sabe QUANDO parar de ser robô e chamar humano, entregando resumo pronto | `shouldEscalate`/`escalateConversation` |
| Estilo por cliente | Aprende como cada cliente gosta de ser tratado (formal? emoji? direto?) | IA-28 |
| Inbox unificada | WhatsApp, Instagram, Messenger, e-mail e webchat numa tela só | P2 + ChatPage |

### 4b. COBRANÇA (CobrAI)
| Tecnologia | Em palavras simples | Onde |
|---|---|---|
| Régua de cobrança | A sequência de lembretes (D-3, D0, D+3…) com tom certo por canal | `cobrai.worker.ts` + `cobrai-rules.service.ts` |
| Bandits (variantes) | Manda 2-3 versões da mensagem de cobrança e APRENDE qual recupera mais — sozinha, tipo teste A/B que se ajusta | IA-26, `variant-picker.service.ts` |
| 2ª via instantânea | Boleto/PIX gerado NA HORA dentro da conversa, direto do ERP | tool `check_invoice` + `generateSecondCopy` |
| Religue por confiança | Cliente pagou? Religa sozinha dentro de política definida pelo dono (X religues/ano) | P1, `trust-unlock.service.ts` |
| Menu de negociação | Opções de parcelamento configuradas pelo dono, oferecidas pela IA | `debt-negotiation.service.ts` |
| Suspensão via ERP | Quando tem que cortar, corta NO SISTEMA do provedor, auditado | P0-06, `ERPOperationsCapable` |

### 4c. VENDAS
| Tecnologia | Em palavras simples | Onde |
|---|---|---|
| Funil autônomo | Lead chega → IA verifica se a rua tem cobertura → mostra planos → coleta dados → manda contrato → agenda instalação. Sem humano. | P3, `vendas.subgraph.ts` + `sales-funnel.service.ts` |
| Viabilidade real | "Tem porta sobrando na caixa da sua rua?" — consulta o grafo da rede ou o ERP | IA-16 + `checkViability` |
| Oferta calibrada por LTV | A IA calcula quanto aquele cliente vale ao longo do tempo e o quão cheia está a rede ali — e ajusta a oferta (não vende 1GB onde a CTO está lotada) | D-07, `ltv-offer.service.ts` |
| Contrato digital | Assinatura eletrônica na conversa (ClickSign/D4Sign) | `contract.service.ts` |
| Painel de vendas | Funil visual + LTV médio por origem | `/sales` (U8) |

### 4d. REDE (os olhos)
| Tecnologia | Em palavras simples | Onde |
|---|---|---|
| Grafo da rede | O mapa vivo: qual cliente está em qual caixa (CTO), o que cai junto, onde está lotado | IA-16, `network-graph.service.ts` |
| Detector de anomalia | Matemática (EWMA + z-score) que percebe "algo estranho" na telemetria antes de virar reclamação | IA-24, `domain/rede/anomaly.ts` |
| Detector de crise | Muitos tickets da mesma região em minutos = crise; agrupa em vez de tratar 1 a 1 | `crisis-detector.ts` |
| Aviso proativo de falha | Operador confirma a falha em massa → todos os afetados recebem "já sabemos, equipe acionada" ANTES de ligarem | P1-02, `outage-notifier.routes.ts` |
| Previsão de demanda | Quantos tickets amanhã? Quantos atendentes precisa? | IA-25, `ml/forecast.ts` |

### 4e. CAMPO (o técnico no poste)
| Tecnologia | Em palavras simples | Onde |
|---|---|---|
| App do técnico (PWA) | Funciona no celular, offline-friendly, mostra as OS do dia | TechnicianAppPage (U5) |
| Copiloto de foto | Tira foto do equipamento → IA diz o que está errado (porta queimada, conector sujo) e anexa na OS | D-06, `field-copilot.service.ts` |
| OS no ERP | A ordem de serviço nasce no sistema que o técnico já usa | P0-06, `createServiceOrder` |

### 4f. CONHECIMENTO (a memória que cresce)
| Tecnologia | Em palavras simples | Onde |
|---|---|---|
| Base de conhecimento | Os documentos do provedor, fatiados e indexados por significado | `indexing.worker.ts` + Qdrant |
| KB viva (auto-escrita) | Cada problema RESOLVIDO vira rascunho de artigo; humano aprova com 1 clique; a IA aprende o "jeito da casa" | D-05, `kb-draft.service.ts` |
| Fila de curadoria | Tela única onde o time aprova artigos e rotula exemplos de treino | IA-29, LabelingPage |

### 4g. VOZ E VISÃO (os sentidos)
| Tecnologia | Em palavras simples | Onde |
|---|---|---|
| Voz em tempo real | Cliente LIGA e fala com a IA (Twilio ↔ OpenAI Realtime), com identificação e handoff | IA-08, `adapters/telephony/` |
| Leitura de boleto | Cliente manda foto do boleto → IA extrai valor/vencimento/código | IA-04, `vision.service.ts` |
| Leitura de conta de energia / fatura do concorrente | Para comparar e fazer contra-oferta | `EnergyBillSchema`/`CompetitorInvoiceSchema` |
| OCR multi-layout | Lê documentos variados sem template fixo | IA-15 |

### 4h. QUALIDADE E APRENDIZADO (por que ela melhora)
| Tecnologia | Em palavras simples | Onde |
|---|---|---|
| Eval (prova mensal) | 50+ cenários com gabarito; toda mudança precisa PASSAR NA PROVA antes de ir pro ar | IA-42, `apps/api/eval/` |
| Replay | Pega conversas reais antigas e reexecuta no motor novo em modo seguro — compara resposta a resposta | IA-46, `replay.service.ts` |
| **Túnel de Vento** | 12 clientes FALSOS (idoso confuso, caçador de desconto, hacker de prompt) estressam o agente 24/7 em staging; nota por conversa | D-15, `domain/ia/wind-tunnel/` |
| Drift | Alarme que dispara se o comportamento da IA mudar sem ninguém pedir | IA-31, `drift.worker.ts` |
| RAGAS | Nota automática da qualidade do RAG (a resposta usou a fonte certa?) | migration 029 + AIObservabilityPage |
| Judge | Um segundo modelo dá nota 1–5 na resposta do primeiro | `eval/judge.ts` |
| Active learning | As conversas mais difíceis viram exemplos rotulados → futuro fine-tune próprio (D-10) | IA-29, `labeled_examples` |

### 4i. DINHEIRO E OBSERVABILIDADE (a sala de máquinas)
| Tecnologia | Em palavras simples | Onde |
|---|---|---|
| Custo por resposta | Cada resposta da IA tem preço contabilizado (tokens × modelo), por conversa/dia/tenant, com teto e freio de emergência | IA-34, `cost-recorder.ts` + AICostsPage |
| Failover multi-provider | Se a OpenAI cair, muda para Anthropic/Gemini sozinha (circuit breaker) | IA-43, `ai-provider/` + `llm.adapter` |
| Health score | Nota de saúde de cada serviço, exposta em `/api/v2/health` | `health-score.ts` |
| Orçamento de latência | Mede quanto cada nó do cérebro demora; aponta o gargalo | `latency-budget.ts` |
| Rastreamento (OTel/Sentry) | Cada request deixa trilha; erro acorda alarme | `otel.ts` + `sentry.service.ts` |

### 4j. SEGURANÇA (as fechaduras)
| Tecnologia | Em palavras simples | Onde |
|---|---|---|
| Multi-tenant com RLS | Cada provedor só enxerga os próprios dados — imposto PELO BANCO, não só pelo código | policies `tenant_own_*` em toda tabela |
| RBAC | Papéis (admin/operador/viewer/técnico) com permissões por recurso | `rbac.middleware.ts` |
| ABAC | Permissões finas por condição (operador X só do departamento Y) | `permissionsManager.ts` |
| Auditoria hash-chain | Cada ação da IA num livro-razão encadeado — impossível apagar sem deixar rastro (base do futuro "Cartório de IA", D-18) | IA-06, `ai-audit.service.ts` |
| Mascaramento de PII | CPF/telefone borrados antes de ir para o modelo quando não são necessários | IA-40 |
| sql-guard | A IA só consegue LER, e só as tabelas permitidas — um validador de SQL puro barra o resto | IA-44 |
| LGPD | Expurgo de dados (Art. 18) + opt-out de comunicação | SecurityPage + `comm_optout` |

### 4k. PLATAFORMA (as portas para fora)
| Tecnologia | Em palavras simples | Onde |
|---|---|---|
| Conectores ERP | Fala a língua de IXC, Voalle, MKAuth, SGP, HubSoft — consulta E age | `adapters/erp/` |
| MCP server | Outros softwares (e IAs) podem consultar a Astrum com chave e escopo — semente do ecossistema D-11 | IA-17, `mcp-server.ts` |
| Webhooks (Svix) | Avisa sistemas externos quando algo acontece (fatura paga, ticket criado) | `svix.service.ts` |
| Status page pública | Página de "está tudo no ar?" para o assinante final | P5 |
| Central do assinante | PWA de autoatendimento sem senha (CPF + validação) | P4, `subscriber-portal.ts` |

### 4l. A EXPERIÊNCIA (o que se vê)
| Tecnologia | Em palavras simples | Onde |
|---|---|---|
| Design system | Tokens + primitivas + lint que impede tela feia/fora do padrão | U1/U2 + `/design` |
| Command palette | Ctrl+K acha qualquer cliente/fatura/tela em 2 teclas | U3, `CommandPalette.tsx` |
| Dashboard configurável | O dono arrasta os widgets que importam para o negócio dele | U6 |
| Módulos por tenant | Provedor pequeno vê um produto simples; grande vê tudo — mesmo código | U6-02 |
| Onboarding por papel | Tour guiado diferente para dono, atendente e técnico | U6 |
| Dashboard Valor Gerado | "A Astrum te economizou R$ X este mês" — o argumento de renovação | P5, `/value` |

---

## 5. O QUE AINDA NÃO ESTÁ LIGADO (honestidade total)

Tudo acima está CODIFICADO E TESTADO (1337 testes, typecheck zero). Mas o motor novo
ainda NÃO recebe tráfego real: as flags estão em `legacy` e as features novas em OFF.
O plano de virada (Onda 2) está em `progress/2-pendentes/01`. As tecnologias que
ainda nem viraram código (gêmeo digital, CFO virtual, cérebro noturno, marketplace…)
estão em `progress/2-pendentes/02` — cada uma com seu gate.

## 6. POR QUE NÃO DÁ PARA COPIAR (mesmo com este dossiê na mão)

1. **O loop fechado** — qualquer um compra um LLM. O difícil é: telemetria de rede +
   cobrança + atendimento + campo DO MESMO CLIENTE alimentando o mesmo cérebro. Os
   ERPs não têm o cérebro; os bots não têm os dados.
2. **A engenharia de avaliação** — eval, replay, túnel de vento, drift, judge. Sem
   isso, mexer no bot é roleta-russa; com isso, a Astrum muda TODO DIA sem medo.
   É o que permite velocidade que concorrente não acompanha.
3. **O custo de reconstrução** — 98 sessões de engenharia documentadas, 76 migrations,
   14 workers, 46 blocos de IA integrados. Copiar o marketing leva uma tarde;
   copiar o organismo leva os mesmos 6+ meses — e a Astrum não fica parada esperando.
4. **Os dados que só ela acumula** — cada conversa vira exemplo rotulado, artigo de
   KB e métrica de benchmark. O produto de amanhã é treinado pelo uso de hoje.
   Concorrente que chegar depois começa de zero PARA SEMPRE.


---
---

# PARTE II — O CATÁLOGO COMPLETO (toda tecnologia, nomeada, uma a uma)

> Pedido do Lucas (2026-07-13): "quero todas nomeadas e para que servem".
> Formato: **Número — Nome | o que é em 1 frase que qualquer pessoa entende | onde mora.**

## §A — Os 12 Blocos de Fundação (Sprints 0–6)

| # | Bloco | O que é |
|---|---|---|
| B-01 | Monorepo TurboRepo | Um repositório só para tudo — apps e pacotes compartilham código sem cópia |
| B-02 | Backend DDD (Fastify) | O servidor novo organizado por domínio de negócio, não por tecnologia |
| B-03 | Supabase multi-tenant + RLS | O banco onde cada provedor SÓ enxerga o que é dele — regra imposta pelo próprio banco |
| B-04 | Redis + BullMQ | A fila de tarefas: nada se perde se o sistema cair no meio |
| B-05 | LLM Gateway (4o-mini/4o) | O "cérebro alugado": modelo barato para conversar, modelo forte para decidir |
| B-06 | LangGraph Agent | O passo-a-passo do pensamento da IA (classificar → checar → buscar → responder → validar) |
| B-07 | Guardrails Pipeline | O segurança da porta: barra mensagem maliciosa e resposta perigosa |
| B-08 | RAG + Qdrant | A memória de leitura: acha respostas nos documentos do provedor por significado |
| B-09 | Auth JWT + RBAC | Quem é você e o que pode fazer — por papel (dono, atendente, técnico) |
| B-10 | Frontend legado (22 telas) | O painel oficial que o time do provedor usa todo dia |
| B-11 | Observabilidade (Sentry/pino) | Caixa-preta de voo: todo erro deixa rastro e acorda alarme |
| B-12 | E2E (Vitest/Playwright) | Robôs que testam o sistema inteiro antes de cada mudança |

## §B — IA-01 a IA-46 (o motor de inteligência)

| # | Nome | O que faz (em simples) | Onde |
|---|---|---|---|
| IA-01 | Self-RAG / CRAG | Se a busca de contexto veio ruim, refaz melhor; resposta sem fonte NUNCA sai — vira humano | nós grade_context/rewrite_query/self_check |
| IA-02 | Cache semântico + cascata | Pergunta repetida = resposta instantânea e grátis; pergunta fácil = modelo barato | semantic-cache.service.ts |
| IA-03 | Eval harness + prompt registry | A prova com gabarito que toda mudança precisa passar antes de ir pro ar | apps/api/eval/ |
| IA-04 | OCR boleto + visão de campo | Lê foto de boleto (valor/vencimento) e foto de equipamento (o que está quebrado) | vision.service.ts |
| IA-05 | Memory decay | A memória da conversa esquece o irrelevante e guarda o importante — como gente | composer de contexto |
| IA-06 | Audit trail hash-chain | Livro-razão IMUTÁVEL: cada decisão da IA encadeada — impossível apagar sem rastro | ai-audit.service.ts |
| IA-07 | Churn prediction | Nota de risco de cancelamento por cliente, com os motivos | churn-score.ts |
| IA-08 | Voz em tempo real | Cliente LIGA e conversa com a IA (Twilio ↔ OpenAI Realtime) | adapters/telephony/ |
| IA-09 | CTO failure prediction | Coleta de telemetria por caixa de rede para prever falha antes de acontecer | network_metrics |
| IA-10 | Multi-agente por domínio | Um "gerente" que chama especialistas: cobrança, retenção, vendas | multi-agent.supervisor.ts |
| IA-11 | Central de Inteligência | O hub no painel onde todas as ferramentas de IA moram | /intelligence |
| IA-12 | Voice biometrics | Reconhece o cliente pela voz (com consentimento LGPD) | trilho gated |
| IA-13 | Speech analytics QA | Dá nota para 100% das ligações — não amostra, TODAS | scorecard |
| IA-14 | Multilíngue | Atende em português, espanhol, inglês — sem o cliente pedir | pipeline de idioma |
| IA-15 | OCR multi-layout | Lê documento de QUALQUER formato sem template + fila de revisão humana | ocr_review |
| IA-16 | GraphRAG (grafo da rede) | O mapa vivo: quem está em qual caixa, o que cai junto, onde está lotado | network-graph.service.ts |
| IA-17 | MCP server | Outros softwares consultam a Astrum com chave e escopo — semente da plataforma | mcp-server.ts |
| IA-18 | A2A protocol | 🔒 GATED — agentes conversando com agentes de outros sistemas | Onda 5 |
| IA-19 | Tool registry dinâmico | O dono liga/desliga cada ferramenta da IA numa tela — controle total | /intelligence/tools |
| IA-20 | Multi-agent debate | 🔒 GATED — para decisões caras, dois modelos DEBATEM antes de agir | Onda 5 |
| IA-21 | Constitutional classifier | O juiz de saída: veta resposta que fere as regras do provedor | nó safety_veto |
| IA-22 | Web browsing agent | A IA consulta sites permitidos (allowlist) e SEMPRE cita a fonte | url-guard.ts |
| IA-23 | LTV por cliente | Quanto cada cliente vale ao longo da vida — calibra oferta e retenção | ltv.service |
| IA-24 | Anomalia de rede | Matemática (EWMA/z-score) que percebe "algo estranho" antes do cliente reclamar | domain/rede/anomaly.ts |
| IA-25 | Forecast de demanda | Quantos tickets amanhã? Quantos atendentes escalar? | ml/forecast.ts |
| IA-26 | Multi-armed bandit | Testa 2-3 versões da mensagem de cobrança e aprende sozinha qual recupera mais | variant-picker.service.ts |
| IA-27 | Feature Store | O perfil operacional único de cada cliente (paga em dia? canal favorito?) | feature-store.service.ts |
| IA-28 | Perfil de comunicação | Formal, coloquial ou técnico — a IA fala como AQUELE cliente gosta | comm profile |
| IA-29 | Active learning | As conversas difíceis viram exemplos rotulados → o futuro modelo próprio | LabelingPage |
| IA-30 | Compressão de contexto | Espreme texto repetido antes de mandar pro modelo — corta custo sem perder nada | compression service |
| IA-31 | LLM-as-judge + Elo | Um segundo modelo dá nota nas respostas e rankeia versões como xadrez | judge permanente |
| IA-32 | OpenLLMetry | Cada passo do pensamento vira um "span" rastreável — dá pra ver ONDE demorou | otel.ts |
| IA-33 | Drift detection | Alarme se o comportamento da IA mudar sem ninguém ter pedido | drift.worker.ts |
| IA-34 | Cost attribution | Cada resposta tem preço por cliente/feature/dia — com teto e freio de emergência | cost-recorder.ts + AICostsPage |
| IA-35 | Orçamento de latência | Meta de tempo por nó do cérebro; estourou = aparece no painel | latency-budget.ts |
| IA-36 | Edge inference | Triagem barata na borda antes do modelo caro (modo shadow) | edge shadow |
| IA-37 | Batching de tool calls | Agrupa chamadas de ferramenta para ir mais rápido e mais barato | executor |
| IA-38 | Explicabilidade do churn | Não só "vai cancelar" — POR QUÊ (os fatores, visíveis na tela) | /intelligence/churn |
| IA-39 | Constitutional loop | A "constituição" que o DONO edita: as regras supremas da IA daquele provedor | tenant_constitutions |
| IA-40 | PII em voz | CPF falado é mascarado ANTES de gravar — privacidade por construção | voice PII |
| IA-41 | Federated evaluation | 🔒 GATED — comparação anônima entre provedores (vira o Índice Astrum D-09) | Onda 5 |
| IA-42 | Spec tracker | O eval vira PORTEIRO do deploy: nota caiu → não sobe | spec-tracker.ts |
| IA-43 | Failover multi-provider | OpenAI caiu? Muda para Anthropic/Gemini sozinha em segundos | llm.adapter |
| IA-44 | Sandbox SQL | A IA só LÊ o banco, e só as tabelas permitidas — um validador puro barra o resto | sql-guard |
| IA-45 | Synthetic data generator | Tenants de teste marcados is_sandbox — a base do ISP Demo de 500 assinantes | migration 046 + seed-demo-tenant.ts |
| IA-46 | Replay engine | Reexecuta conversas antigas no motor novo em modo seguro e compara — o gate do cutover | replay.service.ts |

## §C — P0 a P6 (paridade competitiva — Plano B)

| # | Nome | O que faz | Onde |
|---|---|---|---|
| P0-01..05 | Conectores ERP | Fala a língua do IXC, Voalle, MKAuth, SGP e HubSoft — consulta E age | adapters/erp/ |
| P0-06 | Tools operando o ERP | 2ª via, suspensão e OS acontecem DENTRO do sistema do provedor | tools.executor.ts |
| P1-01 | Religue por confiança | Pagou? Religa sozinha, dentro de política e limite anual | trust-unlock.service.ts |
| P1-02 | Notificação de falha em massa | Todos os afetados avisados ANTES de ligarem | outage-notifier.routes.ts |
| P1-03 | Menu de negociação | Parcelamento configurado pelo dono, oferecido pela IA | debt-negotiation.service.ts |
| P1-04 | Handover quente | Quando vira humano, o atendente recebe o resumo pronto — cliente não repete nada | escalação |
| P2-01..04 | Omnichannel | Instagram, Messenger, e-mail e inbox unificada | adapters/meta/, adapters/email/ |
| P3-01..04 | Funil de vendas | Lead → viabilidade → planos → dados → contrato digital → instalação. Sem humano | sales-funnel.service.ts + vendas.subgraph.ts |
| P4-01..03 | Central do assinante | PWA de autoatendimento sem senha (CPF + validação) | subscriber-portal.ts |
| P5-01 | Dashboard Valor Gerado | "A Astrum te economizou R$ X este mês" — o argumento de renovação | /value |
| P5-02 | Status page pública | "Está tudo no ar?" para o assinante final | /api/v2/valor/status |
| P5-03 | Kit compliance | Relatórios ANATEL/LGPD prontos para auditoria | compliance.routes |
| P5-04 | Case engine | Meta batida vira estudo de caso com número auditado e link compartilhável | valor_cases |
| P5-05 | Trial sem fricção | 14 dias sem cartão, terminando no relatório "quanto você teria economizado" | SignupPage + trial.service |
| P6 | CPE via parceria | 🔒 Telemetria do roteador do cliente (Anlix/ACS) — parceria comercial, não código | pendente Lucas |

## §D — U0 a U8 (a experiência — Plano C)

| # | Nome | O que entregou |
|---|---|---|
| U0 | Auditoria + telemetria de uso | Ranking científico de qual tela doía mais |
| U1 | Tokens + primitivas + lint | O DNA visual: cores, tipografia, componentes — e um lint que barra tela fora do padrão |
| U2 | Design language + skill guardiã | O estilo "tecnológico limpo" + a skill que toda sessão de UI é obrigada a ler |
| U3 | Command palette + navegação | Ctrl+K acha qualquer coisa em 2 teclas; breadcrumbs; sidebar 2 modos |
| U4 | Redesign por persona | As 38 telas repensadas para quem realmente as usa (dono/atendente/técnico) |
| U5 | Responsividade + PWA campo | Tudo funciona no celular; técnico tem app instalável |
| U6 | Onboarding + módulos + dashboard configurável | Tour por papel; módulos ligáveis por tenant; widgets arrastáveis |
| U7 | Qualidade contínua | Playwright e2e, testes de componente, página /design viva, bundle 6× menor |
| U8 | Painel de Vendas | Funil P3 + LTV D-07 numa tela executiva (/sales) |

## §E — D-01 a D-18 (as inéditas — Plano A) e E-01..E-05 (Plano E)

| # | Nome | O que é | Status |
|---|---|---|---|
| D-01 | Gêmeo Digital da Rede | Simula "se esta CTO cair, quem grita? quanto custa?" ANTES de acontecer | gate: 60d telemetria |
| D-02 | Backtesting de régua | Testa a política de cobrança nova contra 90d de histórico REAL antes de ligar | gate: 90d dados |
| D-03 | Negociador com alçada | IA negocia DE VERDADE (parcela, desconto) dentro de limites do dono, auditada | gate: cutover+alçadas |
| D-04 | NOC autônomo | Detecta → confirma (mede afetados) → comunica em massa → normaliza. Máquina de estados | ✅ F1 CODIFICADO 2026-07-13 |
| D-05 | KB viva | Problema resolvido vira artigo; curadoria de 1 clique; a IA aprende o "jeito da casa" | ✅ CODIFICADO |
| D-06 | Copiloto de campo | Foto do equipamento → diagnóstico → anexo na OS. Fases 2/3: voz e histórico visual | ✅ F1 CODIFICADO |
| D-07 | Vendedor com LTV | Oferta calibrada pelo valor do cliente E pela ocupação da rede | ✅ CODIFICADO |
| D-08 | CFO virtual | Previsão de caixa 90 dias conectada a AÇÃO ("dispare esta campanha") | gate: 90d dados |
| D-09 | Índice Astrum | Benchmark anônimo do setor — vira autoridade de marca e imprensa | gate: ≥10 tenants |
| D-10 | Modelo ISP-BR | Fine-tune próprio no jargão do setor ("tá dando LOS") — melhor E mais barato | gate: 5k exemplos |
| D-11 | Plataforma MCP | Parceiros constroem SOBRE a Astrum — de fornecedor a infraestrutura | gate: 3 parceiros |
| D-12 | Voice-first | 100% das ligações atendidas em <1s, 60% resolvidas sem humano | gate: custo/chamada |
| D-13 | Conectores auto-gerados | Agente codificador escreve o adapter de um ERP novo a partir da doc, com testes | gate: demanda |
| D-14 | Cérebro noturno | = PLANO_E (abaixo) | ✅ E-01/E-02 CODIFICADOS |
| D-15 | Túnel de Vento | 12 clientes sintéticos (incl. hacker e caçador de desconto) estressam o agente 24/7 | ✅ CODIFICADO |
| D-16 | Foundry | Dono descreve automação em português → IA constrói, testa e instala só para ele | gate: 5 tenants |
| D-17 | Marketplace de playbooks | Régua campeã de um ISP vira produto instalável COM PROVA (backtesting) | gate: 10 tenants |
| D-18 | Cartório de IA | Certificado auditável de cada ato da IA para ANATEL/Procon — compliance vira receita | gate: caso real |
| E-01 | Diário de reflexões | Toda noite: números do dia → hipóteses por REGRAS → diário ai_reflections | ✅ CODIFICADO 2026-07-13 |
| E-02 | Gerador de hipóteses | As regras que transformam métricas em "o que a Astrum pensou esta noite" | ✅ CODIFICADO 2026-07-13 |
| E-03 | Ações em alçada | O cérebro EXECUTA o que é seguro: scan de KB, braço bandit ≤5% | próximo |
| E-04 | Gate de eval automático | Nada é promovido sem vencer o baseline na prova (IA-42) | próximo |
| E-05 | Relatório de autoevolução | "Este mês a Astrum aprendeu X artigos e reduziu custo Y%" no Valor Gerado | próximo |

## §F — Motores com nome próprio (o que amarra tudo)

| Nome | O que é | Onde |
|---|---|---|
| **CobrAI** | A régua de cobrança inteligente — o produto que paga a conta | cobrai.worker.ts + cobrai-rules.service.ts |
| **db-compat** | O truque que removeu o Firebase sem reescrever 50 arquivos: imita a API antiga, grava no Supabase | src/lib/db-compat/ |
| **A Escada Astrum** | Radar grátis → Operação R$1,90 → Autonomia R$2,50/assinante → Enterprise | src/lib/plans.ts |
| **ISP Demo Astrolândia** | 500 assinantes sintéticos com faturas, tickets, conversas e uma anomalia plantada — o laboratório vivo | scripts/seed/seed-demo-tenant.ts |
| **Final Gate** | Os 10 critérios objetivos que decidem se o motor novo assume produção | scripts/cutover/final-gate.ts |
| **Shadow mode** | O motor novo processa TUDO em paralelo sem responder — prova que acerta antes de assumir | message.worker.ts + shadow-mode.ts |
| **Engine flags** | As 2 chaves que decidem qual motor atende (rollback = trocar a env) | engine-flags.ts |
| **Outbox pattern** | Nenhuma mensagem se perde: primeiro grava, depois envia, com poller de retry | outbox.worker.ts |

**Contagem da casa:** 12 blocos + 46 IA + 21 P + 9 U + 18 D + 5 E + 8 motores nomeados
= **119 tecnologias catalogadas** — e o pipeline §2b garante que a lista só cresce.
