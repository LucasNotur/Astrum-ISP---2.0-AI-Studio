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
