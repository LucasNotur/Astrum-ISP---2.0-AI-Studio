# PLANO F — EXECUÇÃO "CAMISA 9": o roteiro que um modelo menor (Sonnet) executa sozinho
# Criado em 2026-07-13 por Fable 5. Cada tarefa é ATÔMICA, com arquivos exatos,
# padrão a copiar e critério de "pronto" objetivo. Zero ambiguidade proposital.

> **Como usar (para o executor, seja Sonnet ou humano):**
> 1. Faça as tarefas NA ORDEM. Cada uma tem: arquivos, o que fazer, o padrão a
>    imitar (um arquivo IRMÃO que já existe e funciona) e o teste de pronto.
> 2. NUNCA invente estrutura: copie o irmão indicado e adapte. É assim que o
>    resto do repo foi feito — consistência > criatividade aqui.
> 3. Depois de CADA tarefa: `cd apps/api && npx tsc --noEmit` (0 erros) +
>    `npx vitest run <arquivo de teste novo>` (verde). Só então commit e próxima.
> 4. Regras invioláveis: CLAUDE.md (R1–R6). Toda tabela nova tem RLS + GRANT
>    (ver migration 079 como padrão). Todo serviço novo tem teste Vitest.
> 5. Migrations: número sequencial após a última em `packages/db/src/migrations/`.
>    Aplicar local com `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npx tsx packages/db/src/migrate.ts`.

---

## REGRA DE OURO DO EXECUTOR MENOR

Antes de escrever QUALQUER arquivo, abra o "irmão" indicado e copie a ESTRUTURA
(imports, formato de rota, jeito de mockar no teste). O repo é altamente
padronizado — 90% de uma tarefa nova é o mesmo esqueleto de uma que já existe.
Se algo não bate com o irmão, o errado é você, não o irmão.

---

## MAPA DE COBERTURA (2026-07-19) — onde vive o roteiro camisa-9 de CADA plano

Este arquivo é O roteiro único do executor menor. Cobertura por plano:

| Plano | Roteiro | Situação |
|---|---|---|
| PLANO_B (paridade) | P0–P5 code-complete; o que resta é F1-01 (migrations) + dever de casa do Lucas (§4 do 00) + P6 (comercial, Lucas) | ✅ coberto |
| PLANO_E (autoevolução) | FASE 2 (F2-01..F2-03) — E-01..E-05 já codados | ✅ coberto |
| PLANO_A — D-04 NOC | FASE 3 | ✅ coberto |
| PLANO_A — D-01/D-02/D-08 | Motores PRONTOS (§9 do PLANO_A, 2026-07-13); telas na FASE 4 revisada | ✅ coberto |
| PLANO_A — D-23 Gênesis | FASE 6 | ✅ coberto |
| PLANO_A — demais D-XX | FASE 5 (gate RN17: expansão ANTES de executar — é intencional, não é lacuna) | ⏸ gated |
| PLANO_G (UI/UX 2.0) | FASE 7 (adicionada 2026-07-19) | ✅ coberto |
| PLANO_I (Uber do Técnico) | FASE 8 (adicionada 2026-07-19) | ✅ coberto |
| PLANO_H (Constelação) | FASE 9 → aponta para o §6 do próprio PLANO_H (H6-01..H6-04) | ✅ coberto |
| PLANO_MESTRE_V2 (Onda 2) | Cutover/operação — deveres do Lucas (§4 do 00), não é tarefa de executor | n/a |

---

## FASE 1 — LIGAR O QUE JÁ EXISTE (sem código novo de feature)

### F1-01 — Aplicar todas as migrations pendentes em produção
- **Arquivos:** nenhum (operação).
- **Fazer:** rodar `npm run db:migrate` apontando `DATABASE_URL` para o Supabase
  de produção. Conferir com `--dry-run` antes.
- **Pronto quando:** `db:migrate:dry` diz "0 pendentes".

### F1-02 — Rodar o seed demo em staging e conferir as telas
- **Fazer:** `npm run seed:demo` (staging), abrir cada página do painel e ver se
  populou (Customers, BI, Map, ChatPage, CobrAI, Valor Gerado).
- **Pronto quando:** as 6 telas mostram dados do "ISP Demo Astrolândia".

### F1-03 — Ligar signup/upgrade aplicando o tier ao tenant
- **Arquivos:** `src/pages/SignupPage.tsx` (linha ~82, onde cria o trial),
  `src/lib/plans.ts` (já tem `enabledModulesForTier`).
- **Fazer:** ao criar o tenant, gravar `plan='radar_trial'` e
  `enabled_modules = enabledModulesForTier('radar_trial', allKeys)`. No upgrade,
  trocar para `'astrum'` e `enabled_modules = {}`.
- **Irmão:** a lógica de `enabled_modules` já roda em `src/hooks/useEnabledModules.ts`.
- **Pronto quando:** um tenant novo nasce só com os módulos do Radar; ao "assinar",
  todos aparecem. Teste Vitest cobrindo os dois caminhos.

---

## FASE 2 — CÉREBRO NOTURNO EM PRODUÇÃO (E-03..E-05 já codados; falta o cron)

### F2-01 — Worker cron do nightly-brain (03:00)
- **Arquivo novo:** `packages/queue/src/workers/nightly-brain.worker.ts`.
- **Irmão a copiar:** `packages/queue/src/workers/drift.worker.ts` (mesma cara:
  BullMQ repeat, flag de habilitação, chama um service de `apps/api`).
- **Fazer:** worker que, se `NIGHTLY_BRAIN_ENABLED=true`, roda
  `runNightlyReflection` + (se `NIGHTLY_BRAIN_ACT_ENABLED`) `executeSuggestedActions`
  para cada tenant ativo, todo dia 03:00. Registrar no `server.ts` (imitar o
  bloco do `message.worker`, linha ~402).
- **Pronto quando:** teste Vitest do worker (mock do service) verde + tsc 0.

### F2-02 — Card "O que a Astrum pensou esta noite" no dashboard
- **Arquivo:** nova aba/card em `src/pages/intelligence/` (ver ChatPage como
  padrão de fetch). Consome `GET /api/v2/ia/reflections`.
- **Skill obrigatória:** abrir `astrum-design` ANTES (é regra do U2).
- **Pronto quando:** o card lista as reflexões, com selo de severidade colorido.

### F2-03 — Card de autoevolução no Valor Gerado
- **Arquivo:** `src/pages/ValorGeradoPage.tsx` — adicionar bloco que consome
  `GET /api/v2/ia/autoevolucao/report`.
- **Pronto quando:** o `headline` do relatório aparece no topo do Valor Gerado.

---

## FASE 3 — D-04 NOC: FECHAR O LOOP VISUAL

### F3-01 — Tela de incidentes
- **Arquivo novo:** `src/pages/intelligence/IncidentsPage.tsx` + rota.
- **Irmão:** qualquer página de lista+detalhe (usar `PageHeader`/`FilterBar`/
  `DetailSheet` do design system U1).
- **Fazer:** lista de `GET /api/v2/rede/incidents`; botões que chamam
  confirm/communicate/normalize. O botão "comunicar" abre confirmação (é o gate
  humano — imitar o ConfirmDialog do `suspend_signal`).
- **Pronto quando:** dá para levar um incidente de suspeita a normalizada pela UI.

---

## FASE 4 — CÉREBROS DE DADOS (D-01, D-02, D-08): motores PRONTOS → agora as TELAS

> **ATUALIZAÇÃO 2026-07-19:** F4-01 e F4-02 foram EXECUTADOS pelo Fable 5 em
> 2026-07-13 (ver §9 do PLANO_A) — e o D-01 (gêmeo digital) veio junto. Os três
> motores existem e estão testados (19 testes):
> `cobranca/policy-backtest.service.ts`, `financeiro/cashflow-forecast.service.ts`,
> `rede/network-twin.service.ts`. O que resta é a CAMADA VISUAL (abaixo).
> Skill `astrum-design` antes de cada tarefa; `dataviz` onde houver gráfico.

### ~~F4-01 — D-02 Backtesting de régua (motor)~~ ✅ FEITO 2026-07-13
### ~~F4-02 — D-08 CFO virtual (motor)~~ ✅ FEITO 2026-07-13

### F4-03 — Tela do Policy Lab (D-02 Fase 2)
- **Arquivo novo:** `src/pages/intelligence/PolicyLabPage.tsx` + rota.
- **Irmão:** `src/pages/intelligence/ChurnPage.tsx` (formulário de parâmetros +
  resultado em cards/gráfico, mesmo padrão de fetch).
- **Fazer:** formulário da política (lembrete prévio, cobranças D+N, desconto,
  canal) → `POST /api/v2/cobranca/backtest` (conferir o path exato em
  `policy-backtest.routes.ts`) → mostrar os 3 cenários + o disclaimer
  "o passado não reage" SEMPRE visível (honestidade estatística é regra do D-02).
- **Pronto quando:** rodar no tenant demo mostra o comparativo (≈R$ 1.687 base);
  teste Vitest da página.

### F4-04 — Tela do Gêmeo Digital (D-01 Fase 2)
- **Arquivo novo:** `src/pages/intelligence/TwinPage.tsx` + rota.
- **Irmão:** `src/pages/intelligence/NetworkHealthPage.tsx` (+ `MapPage.tsx` se
  plotar CTOs no mapa).
- **Fazer:** selecionar CTO → `GET .../twin/cto/:id/failure` (afetados, MRR em
  risco, tickets previstos, plano de realocação, stranded); aba "crescimento" →
  `POST .../twin/growth` (conferir paths em `network-twin.routes.ts`).
- **Pronto quando:** simular a queda da CTO-VILA-NOVA no demo mostra os números
  do §9 do PLANO_A (42 no escuro, R$ 4.945/mês).

### F4-05 — Projeção de caixa no painel (D-08 Fase 2)
- **Arquivo:** `src/pages/ValorGeradoPage.tsx` — card/aba "Caixa 90 dias".
- **Fazer:** `GET /api/v2/financeiro/cashflow` → gráfico dos 3 cenários +
  destaque "R$ X recuperáveis" (skill `dataviz` obrigatória no gráfico).
- **Pronto quando:** demo mostra caixa 90d nos 3 cenários (≈R$ 147k base).

---

## FASE 5 — CADA D-XX RESTANTE É UMA SESSÃO (pré-condição: RN17)

Para D-03, D-09, D-10, D-11, D-12, D-13, D-16, D-17, D-18 e a terceira geração
D-19..D-22 (§2c do PLANO_A): cada um começa relendo o galho no `PLANO_A`
(§2/§2b/§2c), auditando o código real do dia, e SÓ DEPOIS codando. O executor
menor faz UM D-XX por vez, seguindo o irmão indicado no próprio galho
("Fundação:"). Nunca dois ao mesmo tempo (RN da consolidação). (D-01 saiu desta
lista — motor pronto, tela na F4-04.)

---

## APÊNDICE — CHECKLIST QUE O EXECUTOR REPETE EM TODA TAREFA

```
[ ] Li o "irmão" indicado e copiei a estrutura
[ ] Migration (se houver) tem RLS + GRANT (padrão 079) e roda local
[ ] Serviço novo tem teste Vitest cobrindo o comportamento
[ ] cd apps/api && npx tsc --noEmit → 0 erros
[ ] npx vitest run <novos arquivos> → verde
[ ] Registrei rota no server.ts (se for rota)
[ ] Atualizei PROGRESS_LOG.md com uma entrada
[ ] Commit direto no main (workflow do Lucas), sem trailer de IA
```

---

## FASE 6 — D-23 GÊNESIS ENGINE (plug-and-play; o núcleo JÁ está codado)

> O motor de análise (`apps/api/src/domain/atendimento/whatsapp-retro.service.ts`)
> está pronto e testado. As tarefas abaixo penduram entradas e saída nele.

### F6-01 — Import de histórico do WhatsApp (Evolution API)
- **Arquivo novo:** `apps/api/src/adapters/whatsapp/history-import.service.ts`.
- **Irmão:** `message-sender.service.ts` (mesmo client Evolution) + `etl.worker.ts`
  (mesmo padrão de job em lote).
- **Fazer:** buscar chats+mensagens da instância do tenant (endpoints
  `/chat/findChats` e `/chat/findMessages` da Evolution API), gravar em
  `conversations`/`messages` com `created_by='history_import'`, dedupe por
  id externo (usar coluna `legacy_id`). Rodar em job BullMQ (pode demorar).
- **Pronto quando:** teste com client mockado + no demo real importa sem duplicar.

### ~~F6-02 — Adapter Asaas (gateway de cobrança)~~ ✅ FEITO (`apps/api/src/adapters/gateway/asaas.adapter.ts` + teste já existem)
- **Arquivo novo:** `apps/api/src/adapters/gateway/asaas.adapter.ts`.
- **Irmão:** `adapters/erp/sgp.adapter.ts` (HTTP injetável, credenciais, testes).
- **Fazer:** listar cobranças/inadimplentes (`GET /payments?status=OVERDUE`),
  mapear para `invoices` (source='asaas' no extra). Token por tenant em
  `tenant_erp_credentials` (provider='asaas').
- **Pronto quando:** testes com HTTP mockado; faturas aparecem no CobrAI.

### F6-03 — Import de planilha (CSV/XLSX → customers)
- **Arquivo novo:** rota `POST /api/v2/genesis/import-sheet` (multipart) +
  parser CSV (papaparse já no bundle do front; no back usar csv nativo simples).
- **Fazer:** mapear colunas comuns (nome/cpf/telefone/plano/valor/vencimento) com
  preview de mapeamento; gravar customers com `extra.imported_from='sheet'`.
- **Pronto quando:** planilha de 500 linhas entra sem duplicar (dedupe por CPF).

### F6-04 — O botão "Análise Completa WhatsApp Engine" + Relatório
- **Rota JÁ EXISTE** (2026-07-13): `POST /api/v2/genesis/retro-analysis`
  (genesis.routes.ts) — devolve o RetroReport completo. Falta SÓ a UI:
  botão na tela de onboarding/Settings + página do relatório
  (PageHeader/StatCards; skill astrum-design antes). Prova de fogo já rodou:
  81 contatos → 81 perfis em customers.extra.retro_profile no demo.
- **Pronto quando:** o botão na UI dispara a rota e a página mostra:
  contatos analisados, mix de pagadores, estilos, top problemas e a headline.

### F6-05 — Fluxo completo de onboarding plug-and-play
- Amarrar: conectar WhatsApp (QR da Evolution) → F6-01 importa → F6-04 analisa →
  conectar ERP/Asaas → F6-02 → Relatório da Situação Atual vira a 1ª tela do
  trial Radar (P5-05). Esse relatório É o gancho de venda do dia 1.

---

## FASE 7 — PLANO G (UI/UX 2.0): do consistente ao memorável
## (adicionada 2026-07-19 — fonte de intenção: `PLANO_G_UIUX_2.0__PENDENTE.md`, ler o galho G-XX antes de cada tarefa)

> REGRAS DA FASE: abrir a skill `astrum-design` ANTES de toda tarefa; skill
> `dataviz` onde houver gráfico. Backend fino primeiro (F7-01), depois telas.
> UMA tarefa por sessão. RN21: nenhuma animação gratuita.

### F7-01 — G-01 Home inteligente (o backend do briefing)
- **Arquivo novo:** `apps/api/src/domain/ia/daily-briefing.service.ts` + rota
  `GET /api/v2/ia/briefing`.
- **Irmão:** `autoevolucao-report.service.ts` (mesmo padrão: agrega leituras de
  vários serviços e devolve um resumo tipado).
- **Fazer:** lista rankeada "o que fazer hoje" POR PAPEL (dono/atendente/técnico):
  reflexões da noite (`/ia/reflections`), clientes em risco de churn, incidentes
  abertos, filas de conversa, OS do dia. Cada item: título, severidade, valor em
  R$ quando houver, rota de destino no painel. SEM LLM — ranking por regras
  (severidade × dinheiro), mesmo espírito do E-02.
- **Pronto quando:** teste Vitest com mocks devolve 5–7 itens ordenados,
  diferentes por papel.

### F7-02 — G-01 Home inteligente (a tela)
- **Arquivo:** `src/pages/DashboardPage.tsx` — o topo vira "1 número de saúde +
  a lista do briefing"; os widgets configuráveis do U6 descem para baixo da dobra.
- **Irmão de UI:** o próprio DashboardPage (widgets U6); padrão de fetch da ChatPage.
- **Fazer:** consumir `GET /api/v2/ia/briefing`; o papel vem do RBAC do usuário
  logado. Divulgação progressiva (padrão §1.1 do PLANO_G): 1 indicador grande
  ("está tudo bem?"), 5–7 itens clicáveis, detalhe só sob demanda.
- **Pronto quando:** dono, atendente e técnico logados veem listas DIFERENTES;
  teste de componente cobrindo os 3 papéis.

### F7-03 — G-02 Command palette total (Ctrl+K faz TUDO)
- **Arquivo:** `src/components/CommandPalette.tsx` (JÁ EXISTE — expandir, não recriar).
- **Fazer:** registrar AÇÕES além de busca/navegação: criar ticket, rodar scan de
  KB (`POST /kb/drafts/scan`), abrir incidente, mudar tema, exportar CSV da tela
  atual. Grupos + atalhos visíveis + "recentes" (padrão Linear). Ações com efeito
  destrutivo (ex.: suspender cliente) SEMPRE atrás de ConfirmDialog — imitar o
  gate humano do `suspend_signal`.
- **Pronto quando:** as ações listadas executam só por teclado; teste de
  componente cobrindo 2 ações + o confirm obrigatório.

### F7-04 — G-03 Detalhe fluido (timeline unificada do cliente)
- **Arquivos:** endpoint novo `GET /api/v2/customers/:id/timeline` (agrega
  conversas + faturas + OS + reflexões que citam o cliente) + variante "perfil
  de cliente" no `src/components/ui/DetailSheet.tsx`.
- **Irmão (API):** o dossiê da OS (F8-06) usa o mesmo padrão de agregação —
  quem fizer primeiro vira o irmão do outro.
- **Pronto quando:** abrir um cliente em Customers mostra a linha do tempo
  unificada sem clique extra; teste Vitest do endpoint.

### F7-05 — G-04 Micro-interações e polish
- **Arquivos:** Dashboard, ChatPage, CobrAIPage, CustomersPage, TicketsPage.
- **Fazer:** skeleton loaders no lugar de spinners; optimistic UI nas mutações
  (com rollback em erro); toasts com "desfazer" onde a ação permite; empty
  states que ensinam (texto + CTA). Framer Motion JÁ está no bundle
  (`vendor-motion`) — proibido lib nova.
- **Pronto quando:** navegar pelas 5 páginas sem ver spinner genérico nem empty
  state mudo.

### F7-06 — G-05 Modo foco do atendente (inbox de teclado)
- **Arquivo:** `src/pages/ChatPage.tsx`.
- **Fazer:** J/K navega conversas, Enter aprova a resposta sugerida pela IA,
  atalhos numéricos para respostas prontas, Esc volta à lista. Barra de atalhos
  visível no rodapé (aprender fazendo). NÃO quebrar o fluxo de mouse existente.
- **Pronto quando:** dá para triar 10 conversas sem tocar no mouse; teste de
  componente dos handlers de teclado.

### F7-07 — G-06 Data-viz de referência
- **Arquivos:** todos os gráficos FORA da BIPage (que já foi no U4): CobrAIPage,
  ValorGeradoPage, AICostsPage, SalesPage, dashboards.
- **Fazer:** aplicar a skill `dataviz`: paleta única acessível, mesmo sistema em
  claro/escuro, tooltips ricos, sparklines nos StatCards.
- **Pronto quando:** os gráficos das telas citadas usam o mesmo sistema visual
  nos 2 temas (conferir com `resize_window` claro/escuro no preview).

### F7-08 — G-07 Onboarding "aha em 5 minutos"
- **Arquivos:** tela pós-conexão do trial Radar (fluxo P5-05 / F6-05).
- **Fazer:** assim que conecta ERP/WhatsApp, revelar O NÚMERO (churn +
  inadimplência somados = "dinheiro vazando") com animação de contagem — em vez
  de tela vazia esperando dados. Consome o Relatório da Situação Atual (F6-04)
  quando houver histórico importado.
- **Pronto quando:** um tenant demo recém-criado vê o momento-aha em <5 min de
  fluxo, medido pela telemetria do U0.

---

## FASE 8 — PLANO I (UBER DO TÉCNICO): I-1..I-4 em tarefas atômicas
## (adicionada 2026-07-19 — fonte de intenção: `PLANO_I_UBER_DO_TECNICO__PENDENTE.md`; os SQLs completos estão no §2 de lá, NÃO duplicar aqui)

> REGRAS DA FASE: migrations a partir do próximo número livre (hoje a última é
> `080_plan_single_price.sql` → começar em 081; CONFERIR na hora). Toda tabela
> nova: RLS + GRANT (padrão 079). Decisões já tomadas no §8 do PLANO_I: mapa =
> Leaflet + OpenStreetMap (grátis); otimização v1 sem provedor externo; GPS SÓ
> com shift aberto (LGPD); fotos comprimidas client-side (WebP ~200KB).
> Ordem: F8-01 → F8-06 é o MVP (I-1); F8-07+ só depois do MVP verde.

### F8-01 — Migrations do MVP (I-1)
- **Arquivo novo:** `packages/db/src/migrations/081_field_ops_mvp.sql` (número a conferir).
- **Fazer:** `customer_premises`, `service_order_media`, `service_order_events`,
  `service_order_checklist_templates` + `_items`, `service_order_materials` +
  extensões em `technicians`/`service_orders` — SQL exato nos §2.1–2.5 e §2.8 do PLANO_I.
- **Irmão:** `073_service_orders_align` (mesmo domínio) + `079` (padrão RLS/GRANT).
- **Pronto quando:** migrate local roda limpo; RLS isolando 2 tenants coberta em teste.

### F8-02 — Máquina de estados da OS
- **Arquivos novos:** `apps/api/src/domain/campo/os-lifecycle.service.ts` +
  `os-lifecycle.routes.ts` (`GET /api/v2/field/agenda?date=`,
  `POST /api/v2/field/os/:id/transition`).
- **Irmão:** `field-copilot.service.ts` / `field-copilot.routes.ts` (mesmo
  domínio, mesmo esqueleto de rota + RBAC).
- **Fazer:** transições válidas do §3.1 do PLANO_I (não pode `concluir` sem
  `chegou` etc.); cada transição grava `service_order_events` (com lat/lng) e
  atualiza `service_orders.status`. Guard de conclusão: checklist 100% (ou
  justificativa) + ≥1 foto `depois` + assinatura. UM endpoint de transição, não N.
- **Pronto quando:** Vitest cobre transição válida, inválida e o guard de conclusão.

### F8-03 — Mídia, prova e assinatura
- **Arquivos novos:** rotas `POST /api/v2/field/os/:id/media/sign-upload`
  (signed URL do Supabase Storage — upload direto do device),
  `POST .../media` (registra kind/GPS/EXIF em `service_order_media`),
  `POST .../signature` (base64 → storage).
- **Irmão:** `adapters/whatsapp/media-processor.service.ts` (trato de mídia) +
  `src/lib/storage.ts` no front (`uploadTenantFile`, já existe).
- **Fazer:** foto com `kind` tipado; quem enviar foto de equipamento pode
  encadear o `POST /api/v2/field/diagnose` (D-06, já pronto) via `diagnosis_id`.
- **Pronto quando:** teste com storage mockado; foto entra com GPS e aparece no dossiê.

### F8-04 — Checklist por tipo de OS
- **Arquivos:** rotas CRUD de templates + cópia dos itens na atribuição da OS +
  marcação com timestamp pelo técnico (tabelas da F8-01).
- **Fazer:** seed com 2 templates (instalação FTTH, reparo) para o tenant demo.
- **Pronto quando:** atribuir OS copia os itens; marcar item grava timestamp; teste verde.

### F8-05 — PWA do técnico ligada na API real
- **Arquivo:** `src/pages/TechnicianAppPage.tsx` (JÁ EXISTE, hoje 100% mock).
- **Fazer:** trocar mocks por `GET /field/agenda` + `POST /transition` (fluxo
  Uber do §4 do PLANO_I: aceitar → a caminho com deep-link Waze/Maps → cheguei →
  checklist + foto antes/depois obrigatórias → materiais via QR (já existe) →
  assinatura → concluir). A fila offline IDB existente vira oficial: TODA mutação
  entra na fila e sincroniza quando voltar sinal. Skill `astrum-design` antes.
- **Pronto quando:** ciclo completo de 1 OS no tenant demo pela PWA, incluindo
  passar por modo avião no meio (fila sincroniza depois).

### F8-06 — Dossiê da OS + PDF real
- **Arquivos:** rota `GET /api/v2/field/os/:id/dossie` (eventos + fotos +
  checklist + materiais + assinatura) + o jsPDF da PWA (já existe) passa a usar
  o dossiê real em vez de mock.
- **Pronto quando:** PDF de comprovante sai com dados reais da OS do demo.
  **← fim do MVP I-1.**

### F8-07 — Jornada e breadcrumbs (I-2)
- **Arquivos:** migration nova (`bases`, `technician_shifts`,
  `technician_locations`, `route_plans`, `route_stops` — §2.6/2.7 do PLANO_I) +
  rotas `POST /field/shift/start|end` e `POST /field/location` (ping em LOTE:
  o app junta N pontos e manda 1 request/60s).
- **Regra LGPD (§8.2):** rastrear SÓ com shift aberto; clock-out desliga o GPS;
  reter pontos brutos 90 dias, agregados para sempre.
- **Pronto quando:** teste do ciclo shift + lote de pontos; pontos fora de shift são rejeitados.

### F8-08 — Otimizador de rota v1 (NN + 2-opt)
- **Arquivo novo:** `apps/api/src/domain/campo/route-optimizer.service.ts` +
  rota `POST /api/v2/field/route/optimize?date=`.
- **Fazer:** vizinho-mais-próximo + 2-opt em TypeScript puro (zero custo, ≤15
  paradas/dia); salva `route_plans`/`route_stops`; a agenda (F8-02) passa a vir
  na ordem da rota. É a rota que a PWA hoje chama e NÃO existe (`/api/os/optimize-route`).
- **Pronto quando:** teste com 10 paradas conhecidas devolve rota ≤ que a ordem
  ingênua; este é um dos 2 serviços críticos do DoD do PLANO_I (§7).

### F8-09 — Relatórios de km e tempo
- **Arquivos:** rotas `GET /field/reports/km` e `GET /field/reports/tempo` +
  serviço de cálculo (haversine entre breadcrumbs com filtros: descarta
  accuracy >50m, saltos >150 km/h, pontos parados; odômetro manual = auditoria).
- **Pronto quando:** teste do cálculo de km com trilha sintética (o 2º serviço
  crítico do DoD); relatório do demo devolve km/dia plausível.

### F8-10 — Painel do gestor: FieldOpsPage (I-3)
- **Arquivo novo:** `src/pages/FieldOpsPage.tsx` (página NOVA — permitida por R1)
  + rota `GET /api/v2/field/live` (posição + status de todos os técnicos).
- **Irmão de UI:** `MapPage.tsx` (mapa Leaflet) + padrões U1 (PageHeader/FilterBar/DetailSheet).
- **Fazer:** mapa ao vivo (técnicos coloridos por status, OSs do dia, CTOs),
  dispatch (atribuir/reatribuir com sugestão: mais próximo + skill + carga),
  painéis (SLA em risco, km/dia-mês, tempo médio por tipo, custo por OS), dossiê
  clicável. Skill `astrum-design` antes.
- **Pronto quando:** gestor acompanha 1 OS do demo da atribuição à conclusão pela tela.

### F8-11 — WhatsApp "seu técnico está a caminho"
- **Arquivos:** gancho na transição `a_caminho` (F8-02) → mensagem via canais
  existentes (`adapters/channels/channel-sender.service.ts` — irmão).
- **Fazer:** "técnico X a caminho, chega ~14h20" (ETA da rota F8-08). Respeitar
  janela prometida (`time_window_start/end`).
- **Pronto quando:** transição no demo dispara a mensagem (sender mockado no teste).

### F8-12 — IA de campo (I-4)
- **Arquivos:** serviços em `domain/campo/`: (a) diagnóstico automático da foto
  "antes" (encadeia o D-06 existente); (b) validação da foto "depois" (visão IA:
  a foto mostra serviço concluído do tipo declarado? anti-"foto do chão");
  (c) `ai_summary` da OS via GPT-4o-mini (eventos + checklist + diagnósticos) →
  entra no comprovante; (d) anomalia de rota/tempo (desvio 3× da média → alerta).
- **Irmão:** `field-copilot.service.ts` (visão) + `nightly-brain.service.ts` (regras de anomalia).
- **Pronto quando:** 4 serviços com teste; validação "depois" reprova foto aleatória no demo.

---

## FASE 9 — PLANO H (CONSTELAÇÃO): o que o executor pode fazer JÁ

O roteiro camisa-9 do PLANO_H mora NELE MESMO, no §6 (H6-01..H6-04): higiene do
core (`packages/*` sem import de domínio ISP), Gênesis standalone-ready
(ISSUE_BUCKETS → config por tenant), Cobra-ready e Túnel-ready (adapter de alvo
externo no wind-tunnel). **Atualização 2026-07-19:** H6-03 (adapter Asaas) já
está FEITO (`apps/api/src/adapters/gateway/asaas.adapter.ts` + teste). O resto
do PLANO_H (marcas, landing, CNPJ, Horizonte 2+) é gatilho comercial do Lucas —
o executor NÃO toca (§0 do PLANO_H é lei).
