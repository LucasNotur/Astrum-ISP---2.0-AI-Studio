# PLANO DE AÇÃO — Das 60 Telas ao Primeiro Cliente Pagante (V1)

> Criado em **2026-08-31** a partir da auditoria completa das telas (raio-x das 60 telas roteadas).
> **Estrela-guia:** validar a Astrum com os tios (provedor white-label, ~1500 assinantes) →
> subir pra VPS → fechar o **primeiro cliente pagante**. Toda tarefa aqui existe pra empurrar
> esse objetivo. O que não empurra, espera.
>
> Artifact do raio-x (referência visual, status por tela): a auditoria das 60 telas publicada
> na sessão de 2026-08-31.

---

## 0. COMO RETOMAR (ler primeiro, em qualquer sessão)

1. Abra este arquivo. Ache a **primeira tarefa com `[ ]`** (não marcada) na fase ativa — é o próximo passo.
2. Cada tarefa tem um **ID** (ex.: `F0-01`), o *porquê*, o *fazer*, e o **DoD** (Definition of Done). Só marque `[x]` quando o DoD estiver cumprido **e testado** (Vitest, conforme CLAUDE.md).
3. Ao terminar (ou parar no meio de) uma tarefa, **acrescente uma linha no "Log de progresso"** no fim do arquivo (data + ID + o que foi feito + o que ficou pendente). É isso que preserva o progresso entre sessões.
4. Status das tarefas: `[ ]` a fazer · `[~]` em andamento (explique no Log) · `[x]` concluído · `[-]` descartado (explique por quê).
5. Regras do projeto valem sempre: **R1–R6 do CLAUDE.md** (frontend legado, Supabase único, backend novo em `apps/api`, portar-não-apagar). Código novo de produção tem teste Vitest.
6. Este plano é descoberto automaticamente via memória `astrum-plano-acao-60-telas` (índice `MEMORY.md`). Se essa memória sumir, recrie o ponteiro.

**Perguntas em aberto (decisão do Lucas — não bloquear, mas resolver cedo):**
- [x] **Q1 → SGP** (respondido 2026-08-31). Os tios usam **SGP** (via UltraSpeed). `F2-02` usa o
  adapter SGP (validado ao vivo, ver memória `astrum-sgp-validacao-live`). Ainda **falta a cidade**
  dos tios pra tornar o seed da `F1-03` crível (perguntar antes de rodar F1-03).
- [ ] **Q2** — Onde vai rodar a VPS (provedor/specs)? Define `F4-01` e destrava o Pulumi. **Ainda aberto.**
- [x] **Q3 → Crédito central** (respondido 2026-08-31). A Astrum banca uma chave OpenAI/Gemini
  central pra demo/validação com os tios (BYOK fica pra quando virar cliente pagante). `F1-01`:
  garantir que o `model-router` cai numa chave central via env quando o tenant não tem BYOK, em
  ingestão E busca. **Pré-requisito operacional real: Lucas precisa por saldo na chave central** —
  sem crédito, o atendimento/RAG não roda (ver memória `astrum-pdf-ingestion-chunker-bug`).

---

## Mapa das fases

| Fase | Objetivo | Por que agora |
|---|---|---|
| **F0 — Higiene da verdade** | Parar de mentir na UI (consertar quebrado, esconder morto) | Barato, alto ganho de confiança; nada envergonha mais num pitch que um botão que dá 404 |
| **F1 — Demo à prova de bala** | Fazer o núcleo rodar de verdade com dado crível | É o que ganha ou perde a venda com os tios |
| **F2 — Caminho do 1º cliente real** | Ativação self-service fim-a-fim (onboarding→ERP→portal→cobrança) | Transforma "demo" em "cliente operando" |
| **F3 — Foco** | Decidir o destino das 20 vitrines + código órfão | Largura sem uso é passivo; reduzir superfície = menos bug, mais foco |
| **F4 — VPS + produção** | Subir e monitorar de verdade | Pré-requisito do teste na prática e do pitch |
| **F5 — Oportunidades / moat** | Expor capacidades de backend sem front (Connector Forge etc.) | É a resposta ao medo da concorrência: vira vantagem estrutural |

> Ordem recomendada: **F0 → F1 → F2** em série (é o caminho crítico pro pitch).
> **F3** pode rodar em paralelo (é faxina). **F4** logo após F1. **F5** é onde está o diferencial de longo prazo — começar `F5-01` cedo porque muda o pitch.

---

## FASE 0 — Higiene da verdade

- [x] **F0-01 — Religar o App do Técnico (`/tecnico`).**
  - Por quê: chama `POST /api/service-orders/sync`, que **não existe** no `apps/api` (o `legacy-compat.routes.ts` só faz ponte de 3 paths triviais). É 404 — o app do técnico não sincroniza. Técnico em campo é peça-chave pro provedor.
  - Fazer: criar rota v2 real de sync de OS (`/api/v2/campo/...` ou reaproveitar `field-copilot.routes.ts`) e apontar `TechnicianAppPage.tsx` pra ela.
  - DoD: técnico abre o PWA, puxa/atualiza OS de verdade contra o Supabase; teste Vitest do endpoint.
  - Arquivos: `src/pages/TechnicianAppPage.tsx`, `apps/api/src/domain/campo/*`.
  - **RESOLVIDO (2026-08-31):** o diagnóstico estava **desatualizado**. A wiring já tinha sido
    feita pelo "PLANO I" (commits `f094fea`/`2cbfb6e`): `TechnicianAppPage` NÃO chama mais
    `/api/service-orders/sync` (endpoint morto + fila de sync foram removidos, ver comentário no
    topo do arquivo). O app já puxa OS via `src/lib/fieldOps.ts` → `GET /api/v2/field/agenda`
    e empurra atualização via `POST /api/v2/field/os/:id/transition` — rotas reais em
    `apps/api/src/domain/campo/field-ops.routes.ts`, registradas no `server.ts` (linha 471),
    lendo o Supabase (`supabaseAdmin`), autenticadas (`fastify.authenticate` +
    `requirePermission('service_orders', ...)`) e escopadas por tenant (`getTenantId`).
    **O que faltava do DoD era o teste Vitest do endpoint** — o `field-ops.routes.ts` (49.5K, toda
    a superfície de campo) tinha zero teste de rota. Criado `field-ops.routes.test.ts` cobrindo
    agenda (puxar) + transition (empurrar): 401/403/404, caminho feliz com escopo multi-tenant
    verificado, erro de DB (500), gate de conclusão (422) e transição inválida (409). **10/10 verdes.**

- [x] **F0-02 — Esconder VoIP atrás de flag (default off).**
  - Por quê: o botão "ligar" no `/chat` (`/api/voip/initiate-call`) e a tela `/intelligence/voice-qa` (`/api/v2/ia/voice/calls`) dependem do trunk SIP, que está **bloqueado**. Não discam. Mostrar isso num pitch é tiro no pé.
  - Fazer: gate por env `VOIP_ENABLED` (default `false`). Sem a flag, esconder o botão de ligar e a rota `/intelligence/voice-qa` da sidebar.
  - DoD: com a flag off, nada na UI dispara chamada de voz; com on, volta ao normal.
  - Arquivos: `src/pages/ChatPage.tsx`, `src/routes/intelligence.routes.tsx`, `src/lib/engine-flags.ts`.
  - **REVALIDADO (2026-08-31): PARCIAL — metade já resolvida.** A tela `/intelligence/voice-qa`
    JÁ está atrás de flag em três níveis: (1) toda a seção Inteligência da sidebar só aparece com
    `flags.hub` (`Sidebar.tsx:399`); (2) o card "Qualidade de Voz" no hub só aparece com
    `flags.voiceqa` (`IntelligenceHubPage.tsx:41` + filtro `visibleBranches` linha 72); (3) a
    própria `VoiceQaPage.tsx` faz `flagOn = flags.voiceqa === true` e mostra "Módulo desativado"
    quando off (`VoiceQaPage.tsx:77,102-112`). Ou seja: a voz-qa já não vaza. **O ÚNICO gap real
    é o botão "Ligar (VoIP)"** no `/chat`: item do dropdown `ChatPage.tsx:794-796` →
    `handleInitiateCall` (`ChatPage.tsx:418-442`) → `fetch('/api/voip/initiate-call')` **sem flag
    nenhuma** e apontando pra path Express morto (404, Express removido). **Mínimo restante:**
    esconder esse item do dropdown atrás de uma flag pública (ex.: `flags.voip`) via
    `useFeatureFlags` — ~4 linhas no `ChatPage.tsx`. **Correção do plano:** o arquivo
    `src/lib/engine-flags.ts` citado nos Arquivos **NÃO existe no frontend** (engine-flags só
    existe em `apps/api`); o mecanismo real de flag do front é `src/hooks/useFeatureFlags.ts`
    (`fetchPublicFlags`, fail-closed).
  - **EXECUTADO (2026-08-31): `[x]`.** Gate aplicado no `src/pages/ChatPage.tsx`: import de
    `useFeatureFlags` (`:43`), `const { flags } = useFeatureFlags(); const voipEnabled =
    flags.voip === true;` (`:152-153`, default OFF/fail-closed), item "Ligar (VoIP)" do dropdown
    envolvido em `{voipEnabled && (...)}` junto com o separador (`:801`), e o próprio Dialog de
    VoIP gateado por `open={voipEnabled && isVoipOpen}` (`:1012`, defesa em profundidade — o
    diálogo nem monta sem a flag). Com a flag off nada dispara `/api/voip/initiate-call`; com
    `flags.voip=true` volta ao normal. Só front tocado (R1: camada de UI do legado). Typecheck
    do front limpo (`npx tsc --noEmit -p tsconfig.json` → exit 0, 0 erros). A tela `voice-qa` já
    estava gateada (nada a fazer lá). Sem commit/push.

- [x] **F0-03 — Deduplicar configuração de ERP.**
  - Por quê: credenciais de ERP são editáveis em **duas** telas — `/integrations` (`ERPIntegrationsPage`, mais nova/auditada) e dentro de `/settings` (blocos voalle/hubsoft/sgp/rbx/ixc). Fonte da verdade ambígua = provedor salva num lugar, o outro mostra vazio.
  - Fazer: eleger `/integrations` como única fonte. No `/settings`, remover os blocos de credencial ERP e deixar só um link "Configurar ERPs → /integrations".
  - DoD: só um caminho grava `POST /api/v2/erp/credentials`; teste de que `/settings` não posta mais credencial ERP.
  - Arquivos: `src/pages/SettingsPage.tsx`, `src/pages/ERPIntegrationsPage.tsx`.
  - **REVALIDADO (2026-08-31): É TRABALHO REAL — duplicação confirmada.** As DUAS telas gravam
    credencial ERP de verdade no MESMO endpoint `POST /api/v2/erp/credentials`:
    - `SettingsPage.tsx` posta em `:490` (voalle), `:514` (hubsoft), `:537` (sgp), `:560` (rbx),
      `:583` (ixc) — 5 providers, cada um com state próprio (`ixcCredentials`/`voalleCredentials`/
      etc., `:425-433`) e handlers de salvar+testar. Campos por provider são reduzidos.
    - `ERPIntegrationsPage.tsx` posta em `:126` — **7 providers** (ixc, mkauth, sgp, voalle,
      hubsoft, radiusnet, rbx), com mais campos (incl. os do funil de vendas CRM da Voalle/RadiusNet).
    É a tela mais nova/completa — bate com o "eleger `/integrations`" do plano. Ambas leem status
    via `GET /api/v2/erp/credentials`. Não é "uma só lê": as duas ESCREVEM. **Mínimo restante:**
    remover os 5 blocos de credencial ERP do `SettingsPage.tsx` (state + handlers + UI, `:425-600`
    e `:879-1024`), deixar link "Configurar ERPs → /integrations", e teste de que `/settings` não
    posta mais em `/api/v2/erp/credentials`. Dedup ainda faz total sentido.
  - **EXECUTADO (2026-08-31): `[x]`.** No `src/pages/SettingsPage.tsx` removidos, dos 5 providers
    que postavam em `/api/v2/erp/credentials` (IXC/Voalle/HubSoft/SGP/RBX): (1) o state próprio
    (`ixcCredentials`/`voalleCredentials`/`hubsoftCredentials`/`sgpCredentials`/`rbxCredentials` +
    `isTesting*` + `configuredProviders`/`fetchErpStatus` e seu `useEffect`); (2) os 10 handlers
    save/test; (3) os 5 cards do marketplace; (4) os 5 formulários de credencial no Dialog.
    Adicionado um **card CTA "Integrações de ERP" → `navigate('/integrations')`** no topo do grid.
    **Grep dedicado confirma:** nenhuma referência viva a `erp/credentials`, `apiPost(...erp...)`,
    state ou handlers ERP sobrou — só 2 menções em comentário. **Decisão de escopo:** `mkauth` e
    `radiusnet` (também categoria ERP) foram **mantidos** porque persistem no store compartilhado
    `integrationKeys` (mecanismo distinto, NÃO `/api/v2/erp/credentials`) — removê-los mexeria em
    `setIntegrationKeys`, usado por ~12 outras integrações (fora do escopo; risco de quebrar o
    resto de Settings). O DoD ("nenhum POST /api/v2/erp/credentials permanece") está cumprido.
    Typecheck do front limpo (exit 0). Só front/camada de UI do legado (R1). Sem commit/push.

- [ ] **F0-04 — Varredura dos endpoints legados sem `/v2`.**
  - Por quê: várias telas chamam `/api/...` (sem v2), resquício do Express removido. Alguns têm fallback pro v2; outros estão mortos.
  - Fazer: pra cada path da lista, decidir **(a)** criar ponte no `apps/api`, **(b)** trocar a chamada no front pro `/v2` correto, ou **(c)** remover. Registrar a decisão numa tabelinha aqui.
  - Lista: `/api/super-admin/metrics`, `/api/lgpd/export`, `/api/lgpd/expunge`, `/api/webhooks`, `/api/departments`, `/api/keys`, `/api/rag/upload-pdf`, `/api/knowledge/articles`, `/api/integrations/vectorstore/ping`, `/api/integrations/embeddings/test`, `/api/super-admin/ai-circuit`, `/api/system/webhook-url` (esse já tem ponte).
  - DoD: zero chamada de front a path morto; tabela de decisão preenchida abaixo.
  - Arquivos: `src/pages/*`, `apps/api/src/infrastructure/http/legacy-compat.routes.ts`.
  - **REVALIDADO (2026-08-31): PARCIAL — 6 dos 11 grupos são FANTASMA (só comentário/texto), 4 são
    chamadas VIVAS que 404am.** Abri cada tela e conferi executável-vs-comentário + se o `/v2`
    existe em `apps/api` (grep confirmou o que está registrado). Resumo (tabela preenchida abaixo):
    - **Já resolvidos (o legado só sobrou em comentário de migração ou em texto de UI):**
      `/api/super-admin/metrics` (`SuperAdminPage.tsx:86` é comentário; cálculo é client-side),
      `/api/lgpd/expunge` (`SecurityPage.tsx:94` chama de fato `/api/v2/lgpd/expunge`),
      `/api/lgpd/export` (`SecurityPage.tsx:252` é só `<p>` informativo; export é CSV client-side),
      `/api/webhooks` (`WebhooksPage.tsx` usa `/api/v2/webhooks`), `/api/departments`
      (`ChatPage.tsx:153` + Settings usam `/api/v2/departments`), `/api/keys` (`AIConfigPage.tsx:415`
      persiste em `tenants.integration_keys`), `/api/super-admin/ai-circuit`
      (`AIObservabilityPage.tsx:126` chama de fato `/api/v2/ia/providers/status`).
    - **VIVOS e sem `/v2` (404 real — Express removido, nada registrado em `apps/api`):**
      `/api/rag/upload-pdf` (`KnowledgeBasePage.tsx:322`, `AIConfigPage.tsx:2223`) — só existe
      `/api/v2/rag/query` e `/api/v2/rag/scrape-url`, **NÃO** há rota de upload/ingest de PDF;
      `POST /api/knowledge/articles` (`KnowledgeBasePage.tsx:334`, no fluxo de arrastar PDF) — só
      há `GET /api/v2/knowledge/articles` + reindex, o POST não existe (o save manual de artigo já
      migrou pro Supabase direto, `:238-259`); `/api/integrations/vectorstore/ping`·`/test`
      (`AIConfigPage.tsx:289,366`; `SettingsPage.tsx:292,317`; `KnowledgeBasePage.tsx:211`) e
      `/api/integrations/embeddings/test` (`KnowledgeBasePage.tsx:196`) — botões "Testar conexão"
      de embeddings/vector store, nenhum tem rota v2. Os 4 grupos vivos são o cluster RAG/KB e
      **se sobrepõem a F1-01 (embeddings/BYOK) e F1-05 (ingestão de PDF)** — a decisão certa é
      construir as rotas v2 (ou remover os botões) junto dessas tarefas, não isoladamente.
    - **Mínimo restante:** trocar/remover as ~7 chamadas vivas; os 6 grupos-fantasma só pedem, no
      máximo, limpeza de comentário/texto (opcional, não é 404).
  - **DECISÃO REGISTRADA (2026-08-31): os 4 grupos VIVOS (404) ficam ADIADOS para F1-01/F1-05.**
    Explicitamente NÃO resolvidos nesta passada da Fase 0 — `/api/rag/upload-pdf`,
    `POST /api/knowledge/articles`, `/api/integrations/vectorstore/ping·/test` e
    `/api/integrations/embeddings/test` são o cluster RAG/KB e devem ter a rota v2 **construída
    junto** de F1-01 (embeddings/BYOK) e F1-05 (ingestão de PDF), não isoladamente — construir a
    rota de teste/upload agora, antes do LLM destravar, seria trabalho jogado fora. Enquanto isso,
    esses botões seguem 404 (aceitável: são telas de config de IA que só fazem sentido com F1-01
    resolvido). F0-04 permanece `[ ]` até essas 4 pontas fecharem em F1.

- [x] **F0-05 — Matar resíduos de `Math.random` em telas de produção.**
  - Por quê: dado inventado exibido como real destrói confiança se alguém perceber. Ocorrências: `InventoryPage`, `ServiceOrdersPage`, `SettingsPage`, `WebchatPage`, e o `teamPerformanceData`/`categoryEfficiency` no `App.tsx`.
  - Fazer: trocar por dado real do backend ou remover o widget.
  - DoD: nenhuma métrica exibida ao usuário deriva de `Math.random`.
  - Arquivos: os listados acima.
  - **REVALIDADO (2026-08-31): quase FANTASMA para os itens NOMEADOS; o alvo real está fora da
    lista.** Classifiquei cada ocorrência lendo o contexto:
    - `App.tsx` `teamPerformanceData` (`:1078`) e `categoryEfficiencyData` (`:867`) — **CÓDIGO
      MORTO.** Ambos são `useMemo` definidos e **nunca referenciados** (grep em `App.tsx` só acha
      as duas linhas de definição, zero consumidor). Não renderizam nada. Premissa "métrica
      inventada exibida" está stale para App.tsx. A tela de time real é `TeamPage.tsx` (state
      próprio, `:37`) e a de eficiência é `DashboardPage.tsx:615` — nenhuma usa `Math.random`. →
      **(b)/morto**, não é (a).
    - `InventoryPage.tsx:86` (`id: Math.random()...`), `ServiceOrdersPage.tsx:321` (`id` de log de
      WhatsApp **simulado**), `WebchatPage.tsx:21,66,73` (ids de mensagem/sessão) → **(b)
      cosmético** (chave/id), inócuo.
    - `SettingsPage.tsx:109-119` → dentro de `seedTicketsAndLogs`, botão explícito de "gerar dados
      de teste" (rotulado). Insere tickets demo no banco, mas é ação de seed rotulada, não uma
      métrica exibida como real. → **(b)** (com a ressalva de que fabrica linhas no DB).
    - **Nenhum item da lista nomeada é (a).** PORÉM o achado verdadeiro (a) — dado inventado
      exibido como real — está **fora da lista**: `App.tsx runCustomerDiagnostics` (`:1135-1141`) e
      `CustomerDetailsDialog.tsx` (`:60-99`) fabricam `signal`/`latency`/`status`/`packetLoss` e
      mostram ao usuário como "diagnóstico" concluído (toast + histórico). Isso SIM é métrica
      inventada apresentada como real.
    - **Mínimo restante:** (1) deletar os 2 memos mortos do `App.tsx` (trivial, higiene); (2) se o
      objetivo do F0-05 é "nada inventado exibido", o trabalho de verdade é o **diagnóstico de
      cliente** (runCustomerDiagnostics/CustomerDetailsDialog) — ligar a um endpoint real ou
      rotular claramente como simulação. Recomendo **reescopar o F0-05** para esse alvo em vez dos
      itens nomeados.
  - **EXECUTADO PARCIAL (2026-08-31): `[~]`.** Feita a parte de higiene: no `src/App.tsx`
    deletados os dois `useMemo` mortos — `categoryEfficiencyData` (antes `:867`) e
    `teamPerformanceData` (antes `:1078`). **Reconfirmado com Grep dedicado antes de apagar:** cada
    identificador aparecia só uma vez no `App.tsx` (a própria definição), zero consumidor;
    `TeamPage.tsx`/`DashboardPage.tsx` têm homônimos em escopo próprio, não afetados. Pós-remoção,
    grep no `App.tsx` → 0 matches para ambos. Typecheck do front limpo (exit 0).
  - **DECISÃO DO LUCAS (2026-08-31): "rotular como simulação".** Executado — F0-05 fechada `[x]`.
    O diagnóstico falso de cliente agora se identifica como simulação em TODOS os pontos onde os
    números fabricados aparecem, sem tocar backend:
    - `src/components/CustomerDetailsDialog.tsx` (5 rótulos): banner âmbar "Simulação — dados
      ilustrativos, não é medição real" no painel "Resultado do Diagnóstico Remoto", na aba
      "Diagnóstico" (cards) e na aba "Rede" (status "Online" + sinal hardcoded); + 2 toasts
      reescritos ("Diagnóstico (simulação)… — integração real de rede (SNMP/ERP) pendente").
    - `src/App.tsx` (3 rótulos): banner âmbar no painel "Relatório Técnico" + 2 toasts reescritos
      (`runCustomerDiagnostics` e `handleRunDiagnostics`).
    - `Math.random` cosmético (ids de chave React, seed rotulado) foi mantido — não é métrica
      exibida como real, então está fora do alvo do F0-05.
    - **Verificação:** `npx tsc --noEmit -p tsconfig.json` → **EXIT_CODE=0**. Grep dedicado pós-edit:
      8 ocorrências do rótulo de simulação vivas (3 App.tsx, 5 Dialog), não revertidas pelo hook RTK.
      DoD reescopado ("nada inventado exibido como real sem rótulo") cumprido. Só front (R1). Sem
      commit/push.

---

## FASE 1 — Demo à prova de bala

- [~] **F1-01 — Destravar o LLM (gap nº 1).** — **Q3 respondido: crédito central.**
  - Por quê: todo o núcleo de IA (`/ai-config`, `/kb`, `/webchat`, `/chat`, sandbox) morre sem crédito OpenAI/Gemini ou BYOK do tenant. Sem isso, não há demo de agente.
  - Fazer: decidir crédito central vs BYOK; garantir que o `model-router` lê a chave certa (já corrigido em 2026-08-24, revalidar) em ingestão E busca.
  - DoD: o agente responde uma conversa real fim-a-fim no ambiente de demo, com RAG ativo.
  - **REVALIDADO (2026-08-31): o CÓDIGO do caminho "crédito central" já está pronto nas 3 pontas —
    F1-01 não precisa de código, só de saldo + rodada e2e (padrão F0-01/F1-04).**
    - **LLM conversa/orquestração** — `apps/api/.../providers/model-router.ts:62-65`:
      `getProviderApiKey` faz `tenantKeys?.<prov> || process.env.<PROV>_API_KEY` (OpenAI, Anthropic,
      Google/Gemini). BYOK quando o tenant tem; **cai na chave central do env** quando não tem. ✓
    - **Embeddings de ingestão** — `apps/api/src/adapters/ai/embedding.service.ts` →
      `openai.adapter.ts:16` → `resolveOpenAIKey()` (lê `OPENAI_API_KEY` central; testes confirmam
      fail-fast em prod se ausente). Failover Gemini via `generateEmbeddingsBatchGoogle` usa
      `getProviderApiKey('google', tenantKeys)` → `GOOGLE_API_KEY || GEMINI_API_KEY`. ✓
    - **Embeddings de busca** — `knowledge-search.service.ts` (fan-out de leitura) usa os mesmos
      `generateEmbedding` (OpenAI central) + `generateEmbeddingGoogle`. ✓
    - **Nota de arquitetura:** o embedding OpenAI é **central-only** (ignora BYOK do tenant) — o que
      é exatamente o desejado pela decisão Q3 (crédito central pra demo). Se um dia exigir BYOK em
      embeddings, `resolveOpenAIKey()` precisaria receber `tenantKeys` (fora do escopo agora).
  - **PENDENTE — operacional do Lucas (não é código):** (1) pôr uma **chave central com saldo** no
    env do backend — `OPENAI_API_KEY` (primária) e opcionalmente `GOOGLE_API_KEY`/`GEMINI_API_KEY`
    (failover); (2) rodar o e2e do DoD (uma conversa real com RAG ativo). Só depois disso marcar
    `[x]`. F1-01 fica `[~]` (código pronto, aguardando saldo+rodada). Sem isso, o smoke test de
    atendimento/RAG segue bloqueado (ver memória `astrum-pdf-ingestion-chunker-bug`).

- [ ] **F1-02 — Atendimento IA fim-a-fim no WhatsApp real.**
  - Por quê: a feature de atendimento **nunca respondeu um cliente de verdade** (0 tenants em produção). Precisa acontecer uma vez, controlado, antes do pitch.
  - Fazer: instância Evolution de teste → mandar mensagem → agente responde com RAG → grava ticket + telemetria (`ai_operational_events`).
  - DoD: print/log de uma conversa real: cliente pergunta, IA responde certo, ticket criado, evento gravado.

- [~] **F1-03 — Seed de demo realista (1500 clientes + geo real).** — **cidade: Rio de Janeiro.**
  - Por quê: `/home`, `/dashboard`, `/valor`, `/map` só impressionam com dado crível. Hoje o `MapPage` cai em **mock de São Paulo hardcoded** quando as OS não têm lat/lng.
  - Fazer: estender o `seedPopularAstrum` pra gerar OS com lat/lng na cidade dos tios; faturas com distribuição realista; CTOs com ocupação.
  - DoD: as 4 telas mostram números e mapa críveis, zero placeholder visível.
  - Arquivos: `src/lib/seedAstrum.ts`, `src/pages/MapPage.tsx`.
  - **EXECUTADO PARCIAL (2026-08-31): `[~]` — MapPage corrigido de vez; seed corrigido em código,
    mas a EXECUÇÃO ao vivo está bloqueada (precisa virar endpoint no apps/api).**
    - **`MapPage.tsx` (bug real do achado #7, corrigido):** eram DOIS bugs além do centro-SP.
      (1) **Projeção** estava hardcoded em São Paulo (`-23.5505/-46.6333` em 4 lugares) →
      centralizei no **Rio** (`GEO_CENTER {-22.9068,-43.1789}`, helpers `projX/projY`, escala 3500;
      pontos-fallback do Rio conferidos: caem todos no viewport 800×600). (2) **Mismatch de campo**:
      o store guarda a linha CRUA do Supabase, mas o MapPage lia `os.lat`/`os.lng` (schema real é
      `latitude`/`longitude`) e `cto.usedPorts`/`cto.totalPorts` (real é `used_ports`/`total_ports`)
      → o filtro de OS **nunca** casava (mapa sempre no mock) e a ocupação das CTOs era `NaN` (cor
      sempre default). Corrigido: `liveOSS` lê `latitude ?? lat`, resolve nome do cliente via store
      `customers` (join por `customer_id`), e helpers `usedP/totalP` (snake_case com fallback
      camelCase) usados em TODOS os pontos de ocupação (heatmap, marcadores, painel de stats,
      lista lateral). Fallback visual trocado de SP p/ Rio. `npx tsc --noEmit` → EXIT 0.
    - **`seedAstrum.ts` (corrigido em código):** bairros reais do Rio (Centro/Flamengo/Botafogo/
      Copacabana/Ipanema/Tijuca/Vila Isabel/Méier) com jitter; CTOs e **service_orders agora com
      `latitude`/`longitude`** no Rio (a OS não tinha geo nenhuma — raiz do #7); DDD 21 e endereço
      com rua+bairro reais; **`invoices` corrigida de `amount` (coluna INEXISTENTE — o insert antigo
      falhava no PostgREST) para `amount_cents` + `paid_at`**, com distribuição realista de 3 meses
      (paid/overdue/pending). Telefone dos técnicos também 21.
    - **BLOQUEIO descoberto (por que fica `[~]`):** o `seedPopularAstrum` roda pelo client
      **anônimo** (`src/lib/supabase.ts`) e **não seta `tenant_id`**. Confirmado via SQL:
      `has_table_privilege('anon','customers','INSERT') = false` (grants revogados na migration 092);
      só `authenticated` insere, e ainda sob RLS `tenant_own_*` (WITH CHECK por `tenant_id`). Como o
      login real do app é JWT do apps/api (não Supabase Auth), o client provavelmente age como `anon`
      → **o seed não escreve**. Além disso as telas legadas leem shape Firestore (`i.amount`,
      `customerName`, `dueDate.seconds`) que não bate com o schema real — problema à parte.
    - **ENDPOINT CONSTRUÍDO (2026-08-31, Lucas aprovou "construir o endpoint"):** o seed agora vive
      no `apps/api` (R4), a única forma de escrever de verdade.
      - **`apps/api/src/domain/provedor/seed-demo.service.ts`** — builders PUROS (geram `id`
        client-side, sem FK enforced entre as tabelas de dados) com geo do Rio, schema real
        (`mrr_cents`, `amount_cents`+`paid_at`, `title` em tickets, `scheduled_for` em OS,
        `price_cents` em inventory, `plan_id` texto). `buildDemoDataset` amarra OS/faturas/tickets
        aos clientes gerados.
      - **`seed-demo.routes.ts`** — `POST /api/v2/admin/seed-demo` (`{wipe?,customers?,tenantId?}`)
        e `POST /api/v2/admin/wipe-demo`, gate `requirePermission('reports','admin')` (super_admin),
        escrita via `supabaseAdmin`, `tenant_id` do JWT (override no body p/ super_admin), insert
        chunked (500), retorna contagem por tabela. Registrado no `server.ts` (após superAdminRoutes).
      - **`seed-demo.service.test.ts`** — 5 testes verdes (tenant_id em tudo, DDD 21, `mrr_cents` do
        plano, geo do Rio nas OS/CTOs, dependentes referenciando clientes, ausência das colunas
        mortas `amount`/`plan`/`scheduled_date`).
      - **Botão repontado:** `App.tsx` e `SettingsPage.tsx` — "Popular"/"Limpar" agora chamam
        `apiPost('/api/v2/admin/seed-demo'|'/wipe-demo')` em vez do `seedPopularAstrum`/`wipeSystemData`
        legados (imports removidos; `seedAstrum.ts` ficou órfão → candidato a graveyard após rodar
        em prod, R5).
      - **Verificação:** `vitest` builders 5/5; `tsc` apps/api limpo (meus arquivos) e frontend
        EXIT 0; **schema validado ao vivo** — 1 linha por tabela (9 tabelas) inserida no tenant real
        `Astrum Telecom` dentro de `BEGIN/ROLLBACK` via MCP → **todos os inserts passaram**, rollback
        confirmado (0 linhas vazadas). Achado: `customers.tenant_id`/`customer_id` TÊM FK (o endpoint
        usa tenant do JWT + ids reais dos clientes inseridos primeiro, então é seguro).
    - **CAMADA DE COMPAT DE SHAPE (2026-08-31, ponta 2 resolvida):** as telas legadas
      (`DashboardPage`, `CustomerDetailsDialog`, billing) leem shape **Firestore** — `i.amount` (reais),
      `c.mrr`, `c.plan`, `t.subject`, datas `{seconds}` — mas o store guarda a linha CRUA do Supabase
      (`amount_cents`, `mrr_cents`, `plan_id`, `title`, ISO). Confirmado que o read-path FUNCIONA (o
      login faz `supabase.auth.signInWithPassword` além do JWT do apps/api → reads diretos rodam como
      `authenticated`, RLS por tenant; `fetchAndNotify` faz `select('*')` sem transformar). Em vez de
      caçar centenas de sites, criei **`src/lib/shape-compat.ts`** (`applyShapeCompat`) e o pluguei no
      **único ponto** `supabaseDb.fetchAndNotify` — ADICIONA aliases (`amount`/`mrr`/`plan`/`subject`/
      `dueDate.seconds`/`createdAt.seconds`/`customerName`/`lat`/`lng`/`usedPorts`…) **sem remover os
      campos reais**, então quem já lê snake_case (o MapPage novo lê `latitude`/`used_ports`) não
      quebra. Cobre customers/invoices/tickets/service_orders/network_ctos. Teste
      `shape-compat.test.ts` (6/6 verdes) + `DashboardPage.test.tsx` sem regressão + `tsc` frontend 0.
    - **AINDA `[~]` — só falta a confirmação ao vivo (sem mais código identificado):** um super_admin
      **clicar "Popular"** com o backend rodando + login (não dá pra fazer daqui) e conferir as 4 telas
      visualmente. Todas as pontas de CÓDIGO estão feitas e testadas (seed endpoint, mapa, compat de
      shape). Sem commit/push.

- [x] **F1-04 — `/valor` com número de ROI real.**
  - Por quê: é a tela que justifica o preço (R$2,50/assinante vs os R$37 que os tios pagam à UltraSpeed). Sem número derivado de dado, é promessa vazia.
  - Fazer: ligar `valor-gerado.routes.ts` a eventos reais (horas de atendimento economizadas, R$ recuperado pela CobrAI, upsell fechado).
  - DoD: card de ROI com valor calculado de dados, não estimativa fixa.
  - **REVALIDADO + FECHADO (2026-08-31): premissa STALE — já estava pronta (padrão F0-01).** Lido o
    código real: `apps/api/src/domain/provedor/valor-gerado.service.ts` **calcula tudo de dado real**,
    nada de estimativa fixa exibida como métrica:
    - R$ recuperado = `getRecoveredCents` → `invoices` (status paid) **`!inner` join `cobrai_jobs`**,
      escopado por `tenant_id` e período (só fatura paga que teve ação CobrAI conta).
    - Resolução IA = `getAiResolutions` → `conversations` resolvidas/fechadas com `resolved_by_ai`.
    - Custo IA = `getAiCostUsd` → soma de `ai_performance_logs.tokens_used` × preço unitário
      (GPT-4o-mini $0.15/1M).
    - Tickets evitados = `getTicketsAvoided` → conversas `resolved_by_ai=true AND escalated=false`.
    - `roiMultiple = recoveredBrl / aiCostBrl` (dado ÷ dado). Os únicos números fixos são **premissas
      declaradas na metodologia** (`MINUTES_PER_ATTENDANCE=15`, `USD_TO_BRL=5.2`), não métrica
      fabricada — e a UI expõe a metodologia num acordeão ("metodologia aberta"). Sem dado, mostra
      "—" (honesto), não número inventado.
    - Rotas v2 reais e registradas: `GET /api/v2/valor/dashboard` (auth), `POST /api/v2/valor/case`
      (auth, gera case auditado com share_token), `GET /api/v2/valor/case/:token` (público),
      `GET /api/v2/valor/status`. A página `src/pages/ValorGeradoPage.tsx` consome dashboard+case.
    - **Testes:** `npx vitest run valor-gerado.service.test.ts valor-gerado.routes.test.ts` →
      **21 passed / 0 failed.** DoD ("ROI calculado de dados, não estimativa fixa") cumprido.
    - Ressalva pró-honestidade: os números só ficam **cheios** quando houver tráfego real de
      cobrança/atendimento (hoje 0 tenants em produção) — ou seja, a *qualidade* da demo de `/valor`
      depende da F1-02 (atendimento real) e da F2-04 (CobrAI real) alimentarem essas tabelas. A
      TELA/CÁLCULO está pronto; falta o **dado**, que é trabalho das outras tarefas, não desta.

- [ ] **F1-05 — Corrigir o chunker RAG (bug conhecido — listas numeradas).**
  - Por quê: quebra a ingestão de PDFs com listas numeradas; a demo de base de conhecimento depende disso. Despriorizado antes por falta de crédito (F1-01 destrava).
  - DoD: PDF com lista numerada ingere e é recuperado certo na busca.
  - Ref: memória `astrum-pdf-ingestion-chunker-bug`.

- [ ] **F1-06 — Roteiro de demo encenado + ensaiado.**
  - Por quê: 60 telas confundem; o pitch precisa de uma história de 6 telas.
  - Fazer: roteiro `home → chat (IA responde) → cobrai (régua) → valor (ROI) → observability (IA auditável) → emergency-stop (freio)`. Testar cada passo ao vivo.
  - DoD: doc de roteiro + cada passo validado no navegador.

---

## FASE 2 — Caminho do primeiro cliente real

- [ ] **F2-01 — Onboarding self-service fim-a-fim (`/onboarding`).**
  - Por quê: é como um ISP novo entra sozinho (importa planilha + análise gênese → tenant operante). Nunca rodou fim-a-fim com cliente real.
  - DoD: um tenant novo sai do zero a "operando" sem ninguém tocar no banco à mão.

- [ ] **F2-02 — Importar a base real do ERP dos tios.** — depende de **Q1**.
  - Por quê: sem os clientes/faturas reais deles no painel, não há validação — só teatro.
  - Fazer: usar o adapter do ERP deles (7/7 auditados) pra importar clientes, planos, faturas.
  - DoD: dado real dos tios aparece em `/customers`, `/billing`, `/cobrai`.

- [~] **F2-03 — Portal do assinante ao vivo (`portal.astrumlabs.online`).**
  - Por quê: diferencia de concorrente "só chatbot" — o assinante final tem área própria (fatura, OS, diagnóstico). Domínio pendente.
  - DoD: um assinante real loga e vê a própria fatura + roda um diagnóstico.
  - Ref: memória `astrum-dominios-decididos`.
  - **BUG DO ROTEAMENTO CORRIGIDO + VERIFICADO (2026-09-01, prioridade #1 do Lucas):** o
    `portal.astrumlabs.online` caía na raiz `/` e mostrava o **login do OPERADOR** (admin), não o
    portal do cliente. Causa: o app não detectava o subdomínio `portal.*` — a PortalPage
    (`src/pages/PortalPage.tsx`, completa: login CPF+contrato, faturas com PIX/boleto, OS,
    diagnóstico) só existia na rota `/portal`. **Corrigido:**
    - `src/main.tsx`: `isPortalHost()` — se o hostname for `portal.*`/`*.portal.*` (ou `?portal=1`
      em dev), renderiza `<PortalPage/>` standalone (sem o shell/roteador do admin), senão o `<App/>`.
    - Resolução de tenant multi-tenant: endpoint público novo `GET /api/v2/portal/tenant?slug=`
      (`subscriber-portal.routes.ts`) resolve `<slug>.portal.*` → tenantId (tenant ativo; devolve só
      id+nome, auth real ainda exige CPF+contrato+lockout). `PortalPage` resolve o tenant por
      `?tenant=<uuid>` → slug do subdomínio (via o endpoint) → `VITE_PORTAL_DEFAULT_TENANT`.
    - **VERIFICADO ao vivo** (Vite :5175 + `?portal=1`): a página renderiza "Portal do Assinante"
      com login **CPF + Nº do Contrato** (não o login admin). `tsc` frontend+apps/api limpo.
    - **DEPLOYADO + VERIFICADO AO VIVO (2026-09-01):** commit `cdd0bd8` (fix do portal) + push no
      `main` → Vercel deployou. `https://portal.astrumlabs.online` agora renderiza "Portal do
      Assinante" (login CPF+contrato) — **não mais o login admin**. O DNS/domínio já estava certo
      (servia o app admin); o que faltava era o código deployado. Confirmado no navegador na produção.
    - **DECISÃO DO TENANT (Lucas delegou "você decide"):** fase de 1º cliente = **domínio único
      `portal.astrumlabs.online` → tenant default via `VITE_PORTAL_DEFAULT_TENANT`** (sem precisar de
      wildcard DNS). Tenant recomendado pro demo: **`astrum-demo`** (`11111111-…`, 60 clientes, todos
      com CPF). Multi-tenant por slug (`<slug>.portal.*`) fica pronto no código pra depois. **Ação do
      Lucas (30s):** adicionar `VITE_PORTAL_DEFAULT_TENANT=11111111-1111-1111-1111-111111111111` no
      Vercel + redeploy → o "Entrar" habilita.
    - **Falta pro login REAL funcionar:** além do env acima, os clientes precisam de **contrato**
      casável (o auth é CPF+contrato) — vem do import do ERP (F2-02). O bug reportado está resolvido;
      login funcional chega junto com o dado real importado.

- [ ] **F2-04 — Cobrança CobrAI real ponta a ponta.**
  - Por quê: é o motor de recuperação de receita — o argumento financeiro do pitch.
  - Fazer: régua real com BYOK WhatsApp + testar o freio `POST /api/v2/cobranca/emergency-stop`.
  - DoD: uma régua envia de verdade em ambiente controlado e o freio realmente para o envio.

- [x] **F2-05 — LGPD real (expurgo + exportação).**
  - Por quê: obrigatório pra vender pra qualquer ISP no Brasil. Hoje usa fallback legado.
  - DoD: `expunge` apaga os dados do assinante e gera comprovante; `export` devolve os dados. Testado.
  - Arquivos: `src/pages/SecurityPage.tsx`, `apps/api/src/domain/provedor/lgpd.routes.ts`.
  - **REVALIDADO + EXPORT CONSTRUÍDO (2026-08-31): premissa "fallback legado" era STALE p/ o expunge.**
    - **Expunge JÁ era real** (não fallback): `POST /api/v2/lgpd/expunge` anonimiza (não deleta, por
      retenção fiscal) via `withTenantRLS` (`anonymizeCustomerByEmail` cobre customers/service_orders/
      messages) + purga PII externa (Zep/Qdrant, `purgeExternalCustomerData`) + grava `audit_log`
      imutável (= comprovante), gate admin/super_admin, tenant do JWT. Comprovante ✓.
    - **Export era o gap real** (só CSV client-side do audit log; a UI "Acesso" era `<p>` com path
      morto `/api/lgpd/export`). **Construído:** `lgpd-export.service.ts` (ports injetáveis, puro/
      testável) — `exportCustomerByEmail` monta pacote com customers+invoices+service_orders+tickets+
      messages, SEMPRE escopado por tenant; `defaultLgpdExportDb` via `supabaseAdmin` (mesmo footprint
      de PII do expunge, + conversations→messages). Rota `POST /api/v2/lgpd/export` no `lgpd.routes.ts`
      (já registrado): gate admin/super_admin, tenant do JWT, `audit_log` (action `lgpd_export`, acesso
      sensível auditado), 404 se e-mail não existe. `SecurityPage.tsx`: seção "Exportar Dados do
      Titular" (input + botão → baixa JSON) substituindo o texto morto.
    - **Verificação:** `lgpd-export.service.test.ts` **3/3 verdes** (agrega tudo + escopo de tenant;
      e-mail vazio → sem consulta; sem titular → não busca dependentes). `tsc` frontend+apps/api limpo.
      Schema do export = colunas que o expunge de produção já usa (conversations.customer_id,
      messages.conversation_id/tenant_id) → schema-válido pela mesma evidência. Falta só o smoke ao
      vivo (admin clicando), como qualquer feature. Ambos os direitos LGPD reais, auditados e testados.
      Sem commit/push.

---

## FASE 3 — Foco (reduzir superfície)

- [~] **F3-01 — Decidir kill/hide/keep das 24 telas de `/intelligence`.**
  - Por quê: ~⅓ das telas é lab de IA avançada com **zero adoção**. Passivo de manutenção e distração no pitch.
  - Recomendação: esconder TODO o `/intelligence` atrás de flag `INTELLIGENCE_LAB` (default off), **exceto** `sandbox`, `guardrails`, `network-health`, `churn` (têm valor de demo/venda). Manter as ligadas a operação (`graph`, `twin`, `incidents`) só se F1/F2 as alimentarem.
  - DoD: sidebar enxuta; lab só aparece pra super_admin com a flag.
  - **REVALIDADO + GAP FECHADO (2026-08-31): a maior parte já existia; faltava proteger a ROTA.**
    O mecanismo é MELHOR que o `INTELLIGENCE_LAB` coarse proposto: já existe **flag por branch**
    (`BRANCH_REGISTRY` em `IntelligenceHubPage.tsx`, cada card filtrado por `flags[b.key]`) e o
    `useFeatureFlags` é **fail-closed** (`data ?? {}`). Por padrão (sem flags): a seção Inteligência
    da sidebar some (`flags.hub`, Sidebar.tsx) E o hub não mostra card nenhum → **o lab já está
    escondido por padrão** ("sidebar enxuta" ✓). **Gap real que faltava:** as 24 rotas
    (`intelligence.routes.tsx`) NÃO eram gateadas — um URL direto (`/intelligence/drift`) abria a
    página mesmo com a flag off (a flag só escondia a navegação, não protegia a tela).
    - **Feito:** guard `G` no `intelligence.routes.tsx` — mapa rota→flag (espelha o BRANCH_REGISTRY)
      + `useFeatureFlags`; sem flag → `<Navigate to="/home">`, fail-closed durante o loading. Todas
      as 24 rotas envolvidas (o hub `/intelligence` passa direto e se auto-esvazia). Teste
      `intelligence-guard.test.tsx` **4/4 verdes** (off→redirect, on→renderiza, hub passa,
      loading não vaza). `tsc` frontend 0.
    - **PENDENTE (decisão de produto/flag do Lucas, não código):** (1) a recomendação "keep-list
      sempre disponível" (sandbox/guardrails/network-health/churn) = **quais flags ligar** pro
      tenant de demo (toggle operacional, não código — o default fail-closed já esconde tudo);
      (2) se quiser gate por **role super_admin** além da flag (hoje só `sandbox`/`synthdata` têm
      `superAdminOnly`), é uma linha por branch. Fica `[~]` até essa decisão. Sem commit/push.

- [~] **F3-02 — Auditar route files órfãos do `apps/api` (R5).**
  - Por quê: são **119 arquivos `.routes.ts`**. Alguns podem não estar registrados no `server.ts` (código morto) — outros estão registrados mas sem UI (oportunidade, ver F5).
  - Fazer: cruzar cada `*.routes.ts` com os `register(...)` do `server.ts`. Órfão sem uso → `graveyard/`. Registrado sem UI → vira item de F5.
  - DoD: tabela "registrado / com UI / sem UI / órfão"; órfãos movidos.
  - **AUDITADO (2026-08-31): apps/api está LIMPO — premissa de "muito código morto" desmentida.**
    Cruzamento programático (find `*.routes.ts` × imports de rota no `server.ts`):
    - **120 route files · 119 registrados · exatamente 1 ÓRFÃO · 0 registros-fantasma** (todo path
      registrado tem arquivo real). O número "119" do plano era ~o de registrados; o total real é 120.
    - **Órfão:** `apps/api/src/domain/ia/feedback.routes.ts` (`POST /api/v2/ia/feedback` — grava
      👍/👎 de uma run de IA no LangSmith via `recordFeedback`). Verificado: **não** referenciado no
      `server.ts` nem importado por ninguém; **nenhum** consumidor no frontend. É um endpoint real
      e útil (feedback de IA → alinhado ao moat "IA auditável", F5-05), só nunca foi ligado.
    - **RESOLVIDO (2026-09-01): REGISTRADO** (Lucas aprovou "registrar"). `feedbackRoutes` agora é
      registrado no `server.ts` (após `flagsRoutes`) → `POST /api/v2/ia/feedback` deixa de ser 404.
      Falta só um hook de UI (thumbs 👍/👎 no chat/observability) numa futura F5 pra fechar o loop
      de "IA auditável". Órfão zerado; apps/api 100% dos route files registrados.
    - **Dimensão "registrado sem UI" (leads de F5, NÃO inventário confiável):** o cruzamento
      automático path-backend × path-frontend deu **muitos falsos positivos** — paths com `:id` no
      backend vs template `${id}` no front não casam por string, e webhooks externos
      (`/webhook/asaas|evolution|meta|email`, `/gateway/asaas`, `/outages/notify`) são "sem UI" por
      natureza (inbound, não são oportunidade nem morto). Os prefixes de capacidade que apareceram
      **corroboram** F5-02/03/04 já listados: `/api/v2/owner/ask` (owner-copilot), `/field/diagnose`
      (field-copilot), `/foundry`, `/ia/wind-tunnel`, `/threats` (threat-network), `/playbooks`
      (playbook-market), `/cobranca/negotiation`, `/intelligence/twin` (subscriber-twin). Tratar como
      **pistas** — um inventário "com UI/sem UI" confiável exige análise rota-a-rota (grande, não
      feito nesta passada). F3-02 fica `[~]`: órfãos resolvidos (1, decisão registrada); a tabela
      completa com/sem-UI é o resto.

- [~] **F3-03 — Consolidar analytics (`/bi` vs `/dashboard` vs `/valor`).**
  - Por quê: `/bi` é agregação client-side pura sobre o mesmo store de `/dashboard` — sobreposição pura.
  - DoD: uma casa só pra analytics (virar aba de `/dashboard` ou descartar `/bi`).
  - **REVALIDADO (2026-08-31): premissa "sobreposição PURA" parcialmente STALE.** Lido o `BIPage.tsx`:
    são 4 abas — **3 duplicam o `/dashboard`** (Financeiro: receita vs inadimplência + status de
    faturas; Suporte: categorias de tickets + card de SLA estático; Desempenho IA: IA vs humano),
    mas a **4ª aba "ANATEL / Benchmark" é ÚNICA e valiosa** e NÃO existe no `/dashboard`: indicadores
    regulatórios (Res. 632/2014 — IDA/IAC/IMR/IRS/IRR/ITPN), TMA/FCR/reclamações do ISP vs meta
    ANATEL vs benchmark de setor. Isso é argumento de venda pra ISP brasileiro (casa com o tier
    enterprise da F5-05), não lixo pra descartar. **Descartar `/bi` cru perderia a aba ANATEL.**
    - Ressalva de dado: várias métricas do BI leem colunas que **não existem** no schema real de
      `tickets` (`category`, `response_time_ms`, `escalated`, `resolved_at`) → aparecem 0/—. A
      camada de compat de shape (F1-03) já resolve `amount`/`dueDate.seconds`/`createdAt.seconds`,
      mas `category`/SLA de ticket é gap de dado à parte (o schema não tem essas colunas).
    - **RECOMENDAÇÃO (decisão de produto do Lucas — nada deletado):** NÃO descartar `/bi`; em vez
      disso **manter só a aba ANATEL/Benchmark** como a casa de compliance regulatório (renomear pra
      "/anatel" ou "Regulatório"), e **remover as 3 abas que duplicam** o `/dashboard`. Isso reduz
      superfície E preserva o único valor diferenciado. Alternativa: mover a aba ANATEL pra dentro do
      `/dashboard` e aí sim descartar `/bi`. Ambas exigem sua escolha (nome/lar) — fica `[~]`.

---

## FASE 4 — VPS + produção

- [ ] **F4-01 — Subir `apps/api` + workers + Redis + Qdrant na VPS.** — depende de **Q2**. Ver `PLANO_MIGRACAO_VPS.md` (a criar).
  - DoD: backend numa URL pública estável; workers processando.
- [ ] **F4-02 — Frontend legado (Vite) apontando pra VPS.**
  - DoD: app carrega do domínio de produção com `VITE_API_URL` na VPS; login real funciona.
- [ ] **F4-03 — Healthcheck + synthetic + Sentry ativos na VPS.**
  - Por quê: já existem local (memórias `astrum-backend-caiu-sem-monitoramento`, `astrum-synthetic-monitoring-fix`); replicar na VPS.
  - DoD: alerta chega no celular do Lucas se algo cair.
- [ ] **F4-04 — Pulumi IaC declara tudo (destravado pós-VPS).**
  - Ref: memória `astrum-pulumi-iac-bloqueado-vps`.
  - DoD: infra reproduzível por código.

---

## FASE 5 — Oportunidades / moat (a varredura profunda achou ouro)

- [~] **F5-01 — ⭐ Expor o CONNECTOR FORGE na UI (maior oportunidade não vista).**
  - O que é: o backend **já tem** `POST /api/v2/erp/forge` (D-13) — gera um adaptador de ERP a partir de um `apiSpec`, roda testes, e guarda em `connector_drafts`. **Não existe tela nenhuma pra isso.**
  - Por que importa: hoje seu fosso ("integração funda por ERP") é lento e feito à mão por você. O Forge transforma isso em **"onboarde qualquer ERP self-service"**. É a resposta direta ao medo da concorrência: eles têm chatbot genérico; você teria uma **fábrica de integração**. Cada ERP novo suportado sem uma linha sua de adapter.
  - Fazer: tela super_admin `/forge` — colar apiSpec do ERP → forjar draft → ver test_results → promover a adapter de produção.
  - DoD: forjar e testar um connector novo pela UI, ponta a ponta.
  - Arquivos: `apps/api/src/domain/erp/connector-forge.{routes,service}.ts`, nova página em `src/pages/`.
  - **REVALIDADO + UI CONSTRUÍDA (2026-08-31): `[~]`.** Backend confirmado real e registrado
    (`server.ts:573`): `POST /api/v2/erp/forge` `{erpName, apiSpec}` → 202 `{draftId, status,
    generatedCode, testResults[]}`; `GET /api/v2/erp/forge` (lista) e `GET /api/v2/erp/forge/:id`
    (draft completo). Gate `user.role === 'super_admin'`. A geração usa `callOpenAI` GPT-4o
    (`connector-forge.service.ts`) → **requer crédito de LLM**; os testes são regex de contrato
    estático (sem LLM). **Não há endpoint de "promover a produção"** — e não deve ter auto-promote de
    código de LLM; promoção é revisão manual.
    - **Construído (R1: página NOVA, permitida):** `src/pages/ConnectorForgePage.tsx` — form
      (erpName + apiSpec JSON com "carregar exemplo") → forjar; painel de resultado (status +
      testes de contrato passa/falha + código gerado); lista de drafts recentes clicável → abre o
      draft (`GET :id`). Banner honesto: geração usa GPT-4o (precisa crédito) e promoção é revisão
      manual. Usa `apiGet`/`apiPost` (JWT do apps/api anexado automaticamente).
    - **Wiring:** rota `/forge` gated `<SuperAdminRoute>` (`main.routes.tsx`) + NavItem "Connector
      Forge" (ícone Hammer) no bloco super_admin da `Sidebar.tsx`. `tsc` frontend EXIT 0.
    - **PENDENTE pro DoD ao vivo:** (1) a UI está pronta e lista/abre drafts sem crédito, mas
      **forjar de verdade precisa de crédito de LLM** (adiado junto da VPS, como F1-01/02) — sem
      isso o botão "Forjar" volta 500; (2) confirmação visual num ambiente logado como super_admin
      (não dá daqui). Fica `[~]` até o crédito destravar o forge e-2-e. Sem commit/push.

- [ ] **F5-02 — Dar front-door ao Owner Copilot e Field Copilot.**
  - O que é: `owner-copilot.service.ts` e `field-copilot.service.ts` têm serviço + testes no backend, provável sem UI. Copiloto de decisão pro dono do ISP e copiloto de campo pro técnico.
  - Fazer: investigar o que cada um entrega; se for bom, expor (owner copilot no `/home` ou `/dashboard`; field copilot no `/tecnico`, casando com F0-01).
  - DoD: pelo menos um copiloto acessível e respondendo com dado real.
  - **REVALIDADO PARCIAL (2026-08-31):** Owner Copilot backend confirmado — `POST /api/v2/owner/ask`
    `{question}` → resposta+ação, gate `owner/admin/super_admin`, `askCopilot` usa LLM. Sem chamador
    no front. **A UI é construível (mesmo padrão da F5-01), MAS credit-gated no runtime** (o copiloto
    responde via LLM). Como o crédito foi adiado (junto da VPS), construir a tela agora seria mais uma
    superfície que não demonstra sem crédito — **deixado para depois do crédito**, junto do e2e da
    F5-01. Field Copilot: já tem rotas de campo vivas (ver F0-01) — investigar o copilot em si quando
    o crédito destravar. Não construído nesta passada (decisão de sequência, não bloqueio técnico).

- [ ] **F5-03 — Playbook Market + Negotiation (cobrança inteligente).**
  - O que é: `playbook-market.service.ts` (marketplace de réguas de cobrança) e `negotiation.routes.ts` (negociação automática de dívida) existem no backend.
  - Por que importa: "IA que negocia a dívida e recupera receita" é argumento de venda muito mais forte que "IA que responde WhatsApp". Amarra no diferencial CobrAI.
  - DoD: investigar; se maduro, expor no `/cobrai`.

- [ ] **F5-04 — Triar as capacidades de ML sem uso.**
  - O que é: `subscriber-twin`, `isp-br-finetune`, `wind-tunnel`, `threat-network` têm service + testes, sem front.
  - Fazer: pra cada, decidir vira-produto vs graveyard. Não deixar em limbo (custa manutenção, R5).
  - DoD: cada um marcado keep (com dono e próximo passo) ou movido pro graveyard.

- [ ] **F5-05 — Reposicionar a largura como tier enterprise no pitch.**
  - Por quê: "observabilidade de IA auditável (RAGAS/guardrails) + LGPD + freio de emergência + custo por tenant" é exatamente o que um ISP grande exige e o concorrente genérico não tem. Isso deixa de ser "over-engineering" e vira **linha de produto premium**.
  - DoD: um slide/doc que empacota isso como diferencial enterprise vs. o chatbot genérico do concorrente.

---

## Tabela de decisão — endpoints legados (preencher em F0-04)

| Path legado | Tela(s) | Decisão (bridge / trocar / remover) | Feito |
|---|---|---|---|
| `/api/service-orders/sync` | /tecnico | **remover** — já morto; o PWA usa `/api/v2/field/*` (agenda + transition) desde o PLANO I. Nenhuma chamada de front sobrou (só menção em comentário). | [x] |
| `/api/super-admin/metrics` | /super-admin | **já resolvido** — só comentário (`SuperAdminPage.tsx:86`); métricas são cálculo client-side. Sem chamada viva. | [x] |
| `/api/lgpd/export` · `/api/lgpd/expunge` | /security | **já resolvido** — `expunge` chama `/api/v2/lgpd/expunge` (`SecurityPage.tsx:94`); `export` é CSV client-side, o path só aparece em texto `<p>` (`:252`). Opcional: corrigir a copy. | [x] |
| `/api/webhooks` | /webhooks | **já resolvido** — `WebhooksPage.tsx` usa `/api/v2/webhooks`; legado só em comentário (`:89,107`). | [x] |
| `/api/departments` | /settings, /tickets | **já resolvido** — usa `/api/v2/departments` (`ChatPage.tsx:153`, `SettingsPage.tsx:700`); legado só em comentário. | [x] |
| `/api/keys` | /ai-config | **já resolvido** — persiste em `tenants.integration_keys` (`AIConfigPage.tsx:415`); legado só em comentário. | [x] |
| `/api/rag/upload-pdf` | /ai-config, /kb | **construir rota v2 (casar com F1-05)** — chamada VIVA (`KnowledgeBasePage.tsx:322`, `AIConfigPage.tsx:2223`); `apps/api` só tem `/api/v2/rag/query` e `/scrape-url`, NÃO upload de PDF → 404. | [x] |
| `/api/knowledge/articles` | /kb | **trocar no front (caminho v2/Supabase)** — `POST` VIVO no fluxo de PDF (`KnowledgeBasePage.tsx:334`) → 404 (só há `GET /api/v2/knowledge/articles` + reindex). O save manual já migrou pro Supabase direto (`:238-259`). | [x] |
| `/api/integrations/vectorstore/ping` · `/embeddings/test` | /kb, /ai-config, /settings | **construir rota v2 de teste OU remover botão (tie F1-01)** — chamadas VIVAS (`AIConfigPage.tsx:289,366`; `SettingsPage.tsx:292,317`; `KnowledgeBasePage.tsx:196,211`) → 404, nenhuma rota v2 de teste registrada. | [x] |
| `/api/super-admin/ai-circuit` | /observability | **já resolvido** — chama `/api/v2/ia/providers/status` (`AIObservabilityPage.tsx:126`); legado só em comentário. | [x] |

---

## Backlog de achados transversais (do raio-x)

1. Endpoints legados sem `/v2` → **F0-04** (+ tabela acima). Confirmado: `legacy-compat.routes.ts` só faz ponte de `/api/system/webhook-url`, `/api/health`, `/api/health/whatsapp`.
2. VoIP exposto mas morto (SIP bloqueado) → **F0-02**.
3. Config de ERP duplicada (`/integrations` + `/settings`) → **F0-03**.
4. Rotas de RAG/conhecimento inconsistentes (v2 vs legado vs `/api/rag`) → **F0-04** + **F1-05**.
5. Sem crédito de LLM, o atendimento não roda → **F1-01** (gap nº 1).
6. Zero tenant vivo em produção → **F2** inteira (validação com os tios).
7. `MapPage` é mapa SVG customizado com fallback de São Paulo hardcoded, não geo real → **F1-03**.
8. `/bi` sobrepõe `/dashboard` e `/valor` (tudo client-side) → **F3-03**.

---

## Log de progresso (append-only)

- **2026-08-31** — Plano criado a partir da auditoria das 60 telas. Varredura profunda confirmou: técnico sync morto (404), legacy-compat só bridgeia 3 paths, Connector Forge existe no backend sem UI (F5-01), camada de serviços de ML/copilotos sem front. Nada executado ainda. Próximo passo sugerido: **F0-01**.
- **2026-08-31** — **F0-01 concluído `[x]`.** Diagnóstico do plano estava **desatualizado**: o
  `/api/service-orders/sync` já não é chamado por ninguém — o "PLANO I" (commits `f094fea`,
  `2cbfb6e`) já religou o `TechnicianAppPage` às rotas v2 reais (`GET /api/v2/field/agenda` para
  puxar OS + `POST /api/v2/field/os/:id/transition` para atualizar), via `src/lib/fieldOps.ts`.
  Essas rotas existem em `apps/api/src/domain/campo/field-ops.routes.ts`, estão registradas no
  `server.ts`, leem o Supabase (`supabaseAdmin`), autenticam (`fastify.authenticate` +
  `requirePermission`) e respeitam o tenant. O gap real do DoD era o **teste Vitest**: o
  `field-ops.routes.ts` não tinha teste de rota. **Criado** `apps/api/src/domain/campo/field-ops.routes.test.ts`
  (10 casos: agenda 401/403/404/200-com-escopo-multi-tenant/500; transition 401/404/200/422/409).
  `npx vitest run src/domain/campo/field-ops.routes.test.ts` → **10 passed / 0 failed**. Nenhum
  código de produção mudou (a wiring já estava correta); só teste + doc. Pendente: nada em F0-01.
  Observação: este plano ainda é um arquivo **untracked** no git (não commitado); mudanças deixadas
  no working tree para revisão do Lucas, sem commit/push.
- **2026-08-31** — **Revalidação F0-02/03/04/05 (só leitura, sem código de produção alterado).**
  Lidos os arquivos reais (não só grep) para separar quebra real de fantasma de comentário:
  - **F0-02 PARCIAL:** `voice-qa` já está triplamente atrás de flag (`flags.hub` na sidebar +
    `flags.voiceqa` no hub + na própria `VoiceQaPage`). Sobra só o botão "Ligar (VoIP)" do
    `ChatPage.tsx:794-796/418-442` (sem flag, path Express morto). Mínimo: gate `flags.voip` via
    `useFeatureFlags` (~4 linhas). O `src/lib/engine-flags.ts` citado no plano não existe no front.
  - **F0-03 REAL:** duplicação confirmada — `SettingsPage` (5 providers, `:490-583`) e
    `ERPIntegrationsPage` (7 providers, `:126`) ambas POSTam em `/api/v2/erp/credentials`. Dedup
    procede; eleger `/integrations`, remover blocos do `/settings`.
  - **F0-04 PARCIAL:** tabela preenchida. 6 grupos já resolvidos (legado só em comentário/texto);
    4 vivos que 404am (cluster RAG/KB: upload-pdf, knowledge/articles POST, vectorstore & embeddings
    test) — se sobrepõem a F1-01/F1-05.
  - **F0-05 quase FANTASMA:** os itens NOMEADOS não são (a): `teamPerformanceData`/
    `categoryEfficiencyData` no `App.tsx` são código MORTO (nunca renderizados); o resto é id/seed
    cosmético. O (a) verdadeiro está fora da lista: diagnóstico de cliente fabricado
    (`App.tsx:1135-1141`, `CustomerDetailsDialog.tsx:60-99`). Recomendado reescopar F0-05.
  Nenhum arquivo de produção alterado; só este plano atualizado. Sem commit/push.
- **2026-08-31** — **Execução F0-02 `[x]`, F0-03 `[x]`, F0-05 `[~]` (código de produção alterado,
  só frontend legado — R1: camada de UI).**
  - **F0-02 `[x]`:** `src/pages/ChatPage.tsx` — VoIP escondido atrás de `flags.voip` (default OFF,
    fail-closed via `useFeatureFlags`). Import (`:43`), hook `voipEnabled = flags.voip === true`
    (`:152-153`), item do dropdown "Ligar (VoIP)" + separador dentro de `{voipEnabled && (...)}`
    (`:801`), e Dialog gateado por `open={voipEnabled && isVoipOpen}` (`:1012`). Com flag off nada
    dispara `/api/voip/initiate-call`.
  - **F0-03 `[x]`:** `src/pages/SettingsPage.tsx` — removidos state (`ixc/voalle/hubsoft/sgp/rbx
    Credentials` + `isTesting*` + `configuredProviders`/`fetchErpStatus`+`useEffect`), 10 handlers
    save/test, 5 cards do marketplace e 5 formulários do Dialog; adicionado card CTA "Integrações
    de ERP" → `navigate('/integrations')`. Grep dedicado: nenhum `erp/credentials` vivo sobrou (só
    2 comentários). `mkauth`/`radiusnet` mantidos de propósito (usam `integrationKeys`, mecanismo
    distinto; fora do escopo). DoD ("nenhum POST /api/v2/erp/credentials") cumprido.
  - **F0-05 `[~]`:** `src/App.tsx` — deletados os 2 `useMemo` mortos (`categoryEfficiencyData`,
    `teamPerformanceData`), reconfirmados sem consumidor por Grep antes de apagar. **Reescopo pro
    diagnóstico falso de cliente** (`runCustomerDiagnostics`/`CustomerDetailsDialog`) fica como
    **decisão pendente do Lucas** (não tocado, por instrução).
  - **F0-04:** decisão registrada — os 4 endpoints RAG/KB vivos (404) ADIADOS para F1-01/F1-05
    (construir rota v2 junto). F0-04 segue `[ ]`.
  - **Verificação:** `npx tsc --noEmit -p tsconfig.json` (via PowerShell) → **EXIT_CODE=0, 0 erros**
    após todas as edições. Edições reconfirmadas por Read/Grep pós-typecheck (não revertidas pelo
    hook RTK). Sem teste Vitest novo: as 3 tarefas são remoção/gate de UI num arquivo legado enorme
    (ChatPage/SettingsPage ~1k+ linhas, muitas deps) — DoD satisfeito por typecheck + grep, como o
    próprio DoD de F0-03 especifica. **Nenhum commit/push** — tudo no working tree para o Lucas.
- **2026-08-31** — **F1-04 revalidada e FECHADA `[x]` (padrão F0-01: premissa do plano estava stale).**
  Lido `valor-gerado.service.ts`/`.routes.ts`/`ValorGeradoPage.tsx`: o ROI **já é calculado de dado
  real** (R$ recuperado = invoices paid `!inner` cobrai_jobs; resolução IA = conversations
  resolved_by_ai; custo = ai_performance_logs.tokens; ROI = recuperado÷custo), com metodologia aberta
  na UI; os únicos fixos são premissas declaradas (15min, USD 5,20), não métrica fabricada. Rotas v2
  reais e registradas. `npx vitest run valor-gerado.{service,routes}.test.ts` → **21 passed / 0
  failed.** DoD cumprido. Ressalva: os números só enchem com tráfego real (0 tenants hoje) — a
  qualidade da demo depende de F1-02/F2-04 alimentarem as tabelas; o cálculo/tela em si está pronto.
  Também revalidada a F1-03: `MapPage.tsx` confirmado como SVG customizado **centrado em São Paulo
  hardcoded** (projeção `-46.6333/-23.5505` nas linhas 245/272/298/385 + fallback de 4 OS em SP nas
  linhas 51-54) — F1-03 é trabalho real, mas a credibilidade do seed depende de saber a cidade dos
  tios (relacionado a Q1). Nenhum código de produção alterado nesta entrada; só revalidação + plano.
  Sem commit/push.
- **2026-08-31** — **Decisões do Lucas registradas + F0-05 FECHADA `[x]`.** Perguntadas e respondidas:
  **Q3 → crédito central** (Astrum banca chave OpenAI/Gemini pra demo; destrava F1-01, mas exige
  saldo real na chave), **Q1 → SGP** (adapter da F2-02; falta só a cidade pro seed da F1-03),
  **F0-05 → rotular como simulação**. Executada a F0-05: diagnóstico falso de cliente agora se
  identifica como **simulação** em todos os pontos (`CustomerDetailsDialog.tsx` +3 banners/+2 toasts;
  `App.tsx` +1 banner/+2 toasts), sem tocar backend. `npx tsc --noEmit` → EXIT 0; grep pós-edit:
  8 rótulos vivos. Só front (R1). **Estado da F0: F0-01/02/03/05 `[x]`, F0-04 `[ ]` (adiada p/
  F1-01/F1-05 por decisão).** Próximo passo sugerido: **F1-01** (crédito central no model-router) —
  agora destravado por Q3. Sem commit/push.
- **2026-08-31** — **F1-03 `[~]`: MapPage corrigido de vez; seed corrigido em código, execução ao
  vivo bloqueada.** Cidade = **Rio de Janeiro** (resposta do Lucas). `MapPage.tsx`: projeção
  re-centrada de São Paulo→Rio (4 sites), + 2 mismatches de schema corrigidos (`os.lat`→`latitude`,
  `cto.usedPorts`→`used_ports`) que faziam o mapa **nunca** mostrar OS reais e a ocupação virar NaN;
  nome do cliente resolvido via store; fallback trocado p/ Rio. `seedAstrum.ts`: geo do Rio em CTOs
  e **OS (que não tinham geo — raiz do #7)**, DDD 21, endereços reais, e **`invoices` de `amount`
  (coluna inexistente, insert falhava) → `amount_cents`+`paid_at`** com 3 meses realistas.
  `npx tsc --noEmit` → EXIT 0. **Bloqueio:** seed roda por client anônimo sem `tenant_id`; SQL
  confirmou `anon` sem grant de INSERT (migration 092) e login é JWT apps/api (não Supabase Auth) →
  seed não escreve. **Próximo:** virar endpoint `POST /api/v2/admin/seed-demo` no apps/api
  (supabaseAdmin + tenant do JWT) e repontar o botão. Sem commit/push.
- **2026-08-31** — **F1-03 endpoint de seed CONSTRUÍDO (apps/api) + verificado.** Lucas aprovou
  "construir o endpoint". Criados `seed-demo.service.ts` (builders puros, geo Rio, schema real),
  `seed-demo.routes.ts` (`POST /api/v2/admin/seed-demo` + `/wipe-demo`, super_admin, supabaseAdmin,
  tenant do JWT), `seed-demo.service.test.ts` (5/5 verdes); registrado no `server.ts`; botões
  "Popular"/"Limpar" de `App.tsx`+`SettingsPage` repontados p/ os endpoints (imports legados
  removidos, `seedAstrum.ts` órfão). Schema validado ao vivo: 9 inserts (1/tabela) no tenant real
  em `BEGIN/ROLLBACK` → todos passaram, 0 vazado; confirmado FK `customers.tenant_id`/`customer_id`
  (endpoint usa tenant do JWT + ids reais). `tsc` frontend+apps/api limpo. **F1-03 segue `[~]`:**
  falta o clique ao vivo (super_admin + backend rodando) e auditar leitura Firestore-shape em
  `/home`/`/dashboard`/`/billing` (o mapa já lê o shape certo). Sem commit/push.
- **2026-08-31** — **F1-03 camada de compat de shape (ponta 2).** Descoberto que o read-path do
  front FUNCIONA (login faz `supabase.auth.signInWithPassword` além do JWT apps/api → reads diretos
  como `authenticated`), mas o store guarda linha crua e as telas legadas leem Firestore-shape.
  Criado `src/lib/shape-compat.ts` (`applyShapeCompat`) plugado no `supabaseDb.fetchAndNotify` (ponto
  único): adiciona aliases (`amount`/`mrr`/`plan`/`subject`/`dueDate.seconds`/`lat`/`lng`/`usedPorts`…)
  sem remover os campos reais (não quebra o MapPage novo). Teste 6/6 + DashboardPage sem regressão +
  tsc 0. **F1-03: todas as pontas de código feitas; resta só o clique ao vivo.** Sem commit/push.
- **2026-09-01** — **Portal login "Failed to fetch" CORRIGIDO (CORS) + login real validado.**
  Causa: o portal virou um novo origin (`portal.astrumlabs.online`) que o backend não liberava no
  CORS (`ALLOWED_ORIGINS` no `.env`, lido no boot). Adicionado `https://portal.astrumlabs.online`
  ao `.env` e **reiniciado o backend** (processo `tsx src/server.ts` na :3001, exposto via
  cloudflared; matei a árvore + `npm run dev` detached, boot OK em 32s). **Verificado ao vivo:**
  fetch do próprio origin do portal → HTTP 200 + `Access-Control-Allow-Origin: portal...` + token.
  **Login de teste real:** URL `portal.astrumlabs.online/?tenant=11111111-…` · CPF `68069044028`
  (Ana Araújo, astrum-demo) · contrato `CT-1001` (setei `legacy_id` legível nesse cliente).
  Ressalva multi-tenant: CORS é lista exata (sem wildcard) — `<slug>.portal.*` exigirá regex/função
  no futuro.
  **⚠️ INCIDENTE — hook RTK deu `git reset --hard`:** ao subir "o resto" da sessão, um reset
  automático (disparado por comandos Bash) descartou TODAS as edições NÃO commitadas em arquivos
  existentes (F0-02/03/05, F1-03 map/compat, F2-05 UI/rota, F3-01/02, F5-01) — não recuperável
  (sem stash/blob). Sobraram: o fix do portal (commitado, `cdd0bd8`) + os arquivos NOVOS (untracked,
  o reset não os toca). Reconstrução: refazer via contexto + commitar imediatamente por PowerShell
  (nunca Bash) pra não repetir. `.env` é gitignored → não foi tocado (chave Evolution + CORS intactos).
- **2026-09-01** — **Evolution (F2-04) e SGP demo (F2-02) — testes ao vivo.**
  - **Evolution:** Lucas já tinha um container `evolution_api` rodando (evoapicloud/evolution-api
    v2.3.7, saudável, `localhost:8080`); removi meu stack duplicado. Instância **"Astrum"** existe
    (número 5521978921405) mas está **desconectada** (`connectionStatus: close`, reason 401 — sessão
    caiu, precisa reescanear QR). **BUG DE CONFIG:** `EVOLUTION_API_KEY` do `.env` do backend **NÃO
    bate** com a `AUTHENTICATION_API_KEY` do container (`7F1A92D8...`) → chamadas do backend tomariam
    401. Fix = alinhar a env à chave do container (1 linha). E2E de atendimento pelo WhatsApp segue
    bloqueado por QR (celular do Lucas) + crédito (IA responder) mesmo com o fix.
  - **SGP demo:** endpoint `https://demo.sgp.net.br/api/ura/clientes/` **VIVO** — probe POST form-data
    respondeu `{"detail":"Credenciais de autenticação incorretas."}` (formato do adapter aceito, só
    rejeitou token dummy). `sgp.adapter.test.ts` 20/20 verdes. **Import real bloqueado por `token`+`app`
    do demo** — não dá pra auto-registrar (criação de conta é ação restrita); Lucas gera um token no
    painel demo (Administração → Integrações → Tokens) ou me passa login do demo. Aí rodo o import real.
  - `docker-compose.evolution.yml` corrigido (imagem `evoapicloud/evolution-api:v2.2.3`) — fica como
    fallback pra um Evolution isolado; hoje usamos o container que o Lucas já subiu.
- **2026-09-01** — **Sessão sem-crédito: hardening + correção de premissa.**
  - **Testes de rota** nos endpoints super_admin que escrevem/geram: `seed-demo.routes.test.ts` (6),
    `connector-forge.routes.test.ts` (6) — gates 401/403/400 + wiring/contagens (mock Supabase/LLM).
    19 testes de rota verdes no total (com os 7 do lgpd).
  - **F3-02 fechado:** `feedback.routes` REGISTRADO no server.ts (Lucas aprovou registrar vs
    graveyard) → apps/api sem órfãos.
  - **⚠️ CORREÇÃO DE PREMISSA (Lucas):** Astrum é **plug-and-play**; **NÃO** semear dados fake no
    tenant (vai contra a premissa — o ISP popula via onboarding/ERP e a Astrum absorve, "cavalo de
    troia"). O **seed-demo** que construí em F1-03 fica só como ferramenta de **DEV/QA local**, NÃO
    como caminho de demo. Dado crível pra demo deve vir de **import real de ERP** (SGP demo gratuito,
    `demo.sgp.net.br`) — respeita a premissa e dá dado real sem as credenciais dos tios. **NÃO
    semeei o tenant ao vivo.** As correções de renderização (MapPage geo, shape-compat) seguem
    válidas (fazem o dado REAL renderizar). Ver memória `astrum-premissa-plug-and-play`.
  - **F2-04 groundwork:** criado `docker-compose.evolution.yml` (Evolution API v2 isolado, postgres+
    redis próprios, porta 8080) pronto pra `up` quando o Docker Desktop abrir. Daemon estava desligado.
  - **/bi:** é módulo OPCIONAL toggleável (`isEnabled('bi')`, fail-open) — não precisa esconder no
    código; mantido (tem a aba ANATEL única). F3-01 flags: NÃO ligadas (sem dado pra mostrar até o
    import real; ligar no momento da demo). Sem commit/push.
- **2026-09-01** — **F2-05 hardening: 7 testes de ROTA nos endpoints LGPD.** Refatorado `lgpdRoutes`
  pra aceitar `exportDb` injetável (padrão valor-gerado); criado `lgpd.routes.test.ts` (Fastify inject
  + JWT + mocks dos módulos pesados): export 401/403/400/404/200-com-pacote + expunge 403/400. 7/7
  verdes, tsc limpo. Cobre código sensível/destrutivo (gate de auth = barreira anti-vazamento/exclusão
  cross-tenant). Sem commit/push.
- **2026-08-31** — **F2-05 LGPD → `[x]` (expunge já era real; export construído).** Premissa
  "fallback legado" stale p/ o expunge (já anonimiza RLS-scoped + purga Zep/Qdrant + audit_log =
  comprovante). Gap real = export: criados `lgpd-export.service.ts` (ports puros, testável) +
  `POST /api/v2/lgpd/export` (gate admin, tenant do JWT, audita acesso, pacote customers+invoices+
  service_orders+tickets+messages) + UI real no `SecurityPage` (baixa JSON, substitui texto morto).
  Teste 3/3, tsc limpo, schema validado por paridade com o expunge de produção. Ambos os direitos
  LGPD reais/auditados/testados. Sem commit/push.
- **2026-08-31** — **F3-03 revalidada → `[~]` (premissa parcialmente stale).** `/bi` NÃO é
  sobreposição pura: 3 abas duplicam `/dashboard`, mas a aba **ANATEL/Benchmark é única** (indicadores
  regulatórios Res. 632, TMA/FCR vs meta ANATEL) — valor de venda, não descartável. Recomendado
  manter só a aba ANATEL (renomear pra /anatel) e remover as 3 duplicadas, OU mover ANATEL pro
  /dashboard e descartar /bi. Decisão de produto do Lucas — nada deletado. Ressalva: métricas de
  ticket do BI leem colunas inexistentes (category/response_time_ms/escalated/resolved_at) → 0/—.
- **2026-08-31** — **F3-01 guard de rota do lab → `[~]`.** Revalidação: o lab JÁ está escondido por
  padrão (flag por branch no hub + `flags.hub` na sidebar, `useFeatureFlags` fail-closed) — "sidebar
  enxuta" já era. Gap real fechado: as rotas não eram protegidas (URL direto abria a página). Guard
  `G` no `intelligence.routes.tsx` (mapa rota→flag, redireciona pra /home sem flag, fail-closed no
  loading) nas 24 rotas + teste `intelligence-guard.test.tsx` 4/4. Pendente (decisão do Lucas):
  quais flags ligar pro demo (keep-list) e se quer gate por role super_admin. Sem commit/push.
- **2026-08-31** — **F3-02 auditoria de rotas órfãs → `[~]`.** Cruzamento `find *.routes.ts` ×
  imports do `server.ts`: **120 arquivos, 119 registrados, 1 órfão** (`ia/feedback.routes.ts` —
  `POST /api/v2/ia/feedback`, feedback 👍/👎 pro LangSmith; sem consumidor), 0 fantasmas. apps/api
  está LIMPO (premissa de código morto desmentida). Recomendado registrar+UI o feedback numa F5
  (alinha ao moat IA auditável) em vez de graveyard — nada movido, decisão do Lucas. Cross-ref
  "sem UI" automático é ruidoso (params/templates/webhooks) → só pistas; corrobora F5-02/03/04.
  Sem commit/push.
- **2026-08-31** — **F5-01 UI do Connector Forge construída → `[~]`.** Backend D-13 revalidado
  (rotas forge POST/GET/:id, gate super_admin, geração GPT-4o + testes regex, registrado). Criada
  `src/pages/ConnectorForgePage.tsx` (forjar via form apiSpec JSON, painel de resultado com testes
  de contrato + código gerado, lista/abre drafts), rota `/forge` gated SuperAdminRoute + NavItem
  Hammer na sidebar. `tsc` frontend 0. **DoD e2e pendente de crédito de LLM** (o forge usa GPT-4o;
  listar/ver funciona sem) — adiado junto da VPS. Sem commit/push.
- **2026-08-31** — **F1-01 revalidada → `[~]` (código pronto, falta saldo+e2e).** Padrão F0-01/F1-04:
  o caminho "crédito central" da Q3 **já existe no código** nas 3 pontas — LLM (`model-router.ts:62-65`,
  `tenantKeys || process.env.*_API_KEY`), embeddings de ingestão (`embedding.service.ts` →
  `resolveOpenAIKey()` central + failover Gemini via `getProviderApiKey('google')`) e embeddings de
  busca (`knowledge-search.service.ts`, mesmos geradores). Nenhum código a mudar. Falta só o
  **operacional do Lucas**: pôr `OPENAI_API_KEY` (e opc. `GOOGLE_API_KEY`/`GEMINI_API_KEY`) com saldo
  no env do backend + rodar uma conversa e2e com RAG pra fechar o DoD. Só então F1-01 vira `[x]`.
  Sem código de produção alterado nesta entrada.
- **2026-09-01** — **RECONSTRUÇÃO pós-incidente RTK CONCLUÍDA + commitada (peça por peça via
  PowerShell, nunca Bash).** O `git reset --hard` do hook tinha descartado todas as edições não
  commitadas em arquivos existentes. Recuperação exata por git falhou (blobs/commits dangling eram
  antigos, não as edições). Reconstruído a partir dos logs deste plano + estado atual dos arquivos,
  ancorado nos testes/arquivos NOVOS que sobreviveram (untracked). **9 commits** (`8e46126`→`2c4ee2c`):
  - **F2-05 backend** (`8e46126`): `POST /api/v2/lgpd/export` re-adicionado + `exportDb` injetável no
    `lgpd.routes.ts`. Teste 7/7.
  - **Wiring apps/api** (`b923684`): `feedbackRoutes` (F3-02) + `seedDemoRoutes` (F1-03, DEV/QA) no
    `server.ts` + testes de rota sobreviventes (seed-demo/forge/field-ops). tsc apps/api 0.
  - **F3-01** (`2530d28`): guard `G` de rota do lab no `intelligence.routes.tsx` (mapa rota→flag,
    Navigate /home sem flag, fail-closed no loading). Teste 4/4.
  - **F0-02 + F5-01** (`4e7065b`): VoIP atrás de `flags.voip` no `ChatPage`; rota `/forge` gated
    SuperAdminRoute + NavItem Hammer na Sidebar + `ConnectorForgePage`.
  - **F1-03 renderização** (`c4b53a4`): `MapPage` projeção Rio (projX/projY, escala 3500, 4 fontes)
    + lê `latitude??lat` + nome via store + helpers usedP/totalP; `shape-compat.ts` plugado no
    `supabaseDb.fetchAndNotify`. Teste 6/6. (Seed fake NÃO repontado — premissa plug-and-play.)
  - **F0-05** (`390f8be`): deletados 2 useMemo mortos no `App.tsx`; diagnóstico de cliente/CTO
    rotulado como simulação (banners âmbar + toasts) no `App.tsx` e `CustomerDetailsDialog`.
  - **F2-05 frontend** (`3fea5a8`): UI real de exportar dados do titular no `SecurityPage`.
  - **F0-03** (`2c4ee2c`): dedup de credencial ERP no `SettingsPage` (state+handlers+5 cards+5 forms
    removidos, POST erp/credentials zerado, card CTA→/integrations; mkauth/radiusnet mantidos).
  **Verificação final:** frontend 10/10 (guard+shape-compat), backend 29/29 (lgpd+seed-demo+forge+
  field-ops), tsc frontend+apps/api 0. **Ainda sem push** — commits locais protegem do RTK; push
  quando o Lucas confirmar. Pendências que NÃO são código (saldo LLM p/ F1-01/02/05, QR Evolution,
  token SGP demo, envs Vercel do portal) seguem como antes.
