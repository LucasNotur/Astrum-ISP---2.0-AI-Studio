# Inventário — Chamadas diretas ao Supabase no frontend legado

> Gerado pela tarefa **F1-INV** do [PLANO_ACAO_100_OPERACIONAL.md](PLANO_ACAO_100_OPERACIONAL.md).
> Executor: Claude Sonnet 5 (com 3 subagentes de pesquisa em paralelo), 2026-08-24.
> Escopo do grep, conforme spec da tarefa: `src/pages`, `src/components`, `src/hooks`
> (`.ts`/`.tsx`), padrão `supabase\.from(\|supabase\.rpc(`.
> **Nenhum código de produção foi alterado nesta tarefa** — só leitura/inventário.

## Sumário

- **Total de ocorrências do grep:** 91 (`supabase.from(`: 91 · `supabase.rpc(`: 0)
- Dessas, **1 não é uma chamada real** — é um comentário de código em
  `NetworkGraphPage.test.tsx:8` que apenas menciona `supabase.from(...)` numa explicação.
- **90 ocorrências reais classificadas:**
  - `JA_EXISTE_ROTA`: **4**
  - `PRECISA_ROTA_NOVA`: **86**
  - `CODIGO_MORTO`: **0**
- Nenhuma ocorrência do escopo pedido foi classificada como código morto — todas estão
  atrás de handlers, efeitos ou botões alcançáveis em runtime (verificado por arquivo).
- Arquivo com mais ocorrências: `SettingsPage.tsx` (31), seguido de `ChatPage.tsx` (7) e
  `TeamPage.tsx` (6).
- `src/hooks` teve **zero** ocorrências.

### Correção pós-F1-A (2026-08-24)

O grep do passo 1 (`supabase\.from\(`) só casa quando `supabase` e `.from(` estão na
**mesma linha**. Ao migrar de fato (tarefa F1-A), apareceram 2 ocorrências reais que o
grep não pegou por estarem quebradas em duas linhas (`await supabase\n  .from(...)`):
`BillingPage.tsx:63` (`tenants` select) e `CobrAIPage.tsx:127` (`cobrai_jobs` select,
antiga linha 128 do `.from(`). Ambas foram migradas normalmente na F1-A. **Atenção para
F1-B/C/D:** rodar também `grep -n "supabase$" <arquivo>` (ou revisar visualmente) além do
grep de uma linha só, pra não deixar ocorrências passarem batido.

### Achado colateral (fora do escopo desta tarefa — não corrigido, só registrado)

O grep pedido pela spec cobre só `src/pages`, `src/components`, `src/hooks`. Rodando o
mesmo padrão em `src/` inteiro aparecem **mais ~85 ocorrências** fora desse escopo, as
maiores concentrações em: `src/lib/db.ts` (~35), `src/lib/supabaseDb.ts` (~18),
`src/App.tsx` (~15), `src/lib/seedAstrum.ts` (2), `src/test-supabase.ts` (1). Esses
arquivos de `src/lib/*` são camadas de acesso a dados usadas por várias páginas (inclusive
algumas das listadas abaixo, indiretamente) e por `src/App.tsx` (componente raiz com boa
parte da lógica de negócio ainda inline). Como também usam o client anônimo, estão sujeitos
ao mesmo bug de RLS. Ficam registrados aqui para uma tarefa de inventário futura — não
foram analisados linha a linha porque a spec desta tarefa restringe o escopo.

---

## Legenda das colunas

| Coluna | Significado |
|---|---|
| tabela | tabela Supabase consultada |
| operação | select / insert / update / delete / upsert |
| o que a UI faz | resumo de 1 frase do uso do dado |
| rota apps/api equivalente | rota já existente que sirva o mesmo dado (ou "nenhuma") |
| classificação | `JA_EXISTE_ROTA` / `PRECISA_ROTA_NOVA` / `CODIGO_MORTO` / `COMENTÁRIO` |

---

## src/pages/SettingsPage.tsx (31 ocorrências)

| arquivo:linha | tabela | operação | o que a UI faz | rota apps/api equivalente | classificação |
|---|---|---|---|---|---|
| SettingsPage.tsx:153 | `messages` | insert | dentro de `seedTicketsAndLogs` (dev tool), insere mensagem de cliente num ticket recém-criado (dado sintético) | nenhuma | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:167 | `team_members` | delete | remove um membro da equipe da lista | nenhuma | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:180 | `team_members` | update | salva edição de membro existente (nome/email/role/status) | nenhuma | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:187 | `team_members` | insert | cria novo membro da equipe | nenhuma | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:303 | `role_permissions` | upsert | salva permissões granulares por role (matriz de acesso) | nenhuma | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:375 | `tenants` | update | salva domínio de SSO em `tenants.sso_config` | nenhuma | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:402 | `tenants` | select | carrega `tenants.theme` (cores/logo/whitelabel) ao montar | nenhuma (o `theme` de `webchat.service.ts` é do widget de chat, schema diferente) | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:409 | `tenants` | update | salva `tenants.theme` (branding) | nenhuma | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:419 | `tenants` | select | carrega `tenants.enabled_modules` pra montar toggles de módulos | nenhuma (`trial.service.ts` só usa no signup/upgrade, não numa rota de leitura) | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:425 | `tenants` | update | salva `tenants.enabled_modules` (liga/desliga módulos) | nenhuma | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:460 | `tenants` | select | carrega `vector_store_config`/`sso_config` ao montar | nenhuma | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:463 | `knowledge_articles` | select (count) | conta artigos indexados no vetor pra exibir progresso | nenhuma (`ia/scrape-url.routes.ts` grava em `knowledge_articles` mas não expõe contagem) | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:488 | `tenants` | update | salva `vector_store_config` (provider/url/apiKey/collection) | nenhuma | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:511 | `tenants` | select | carrega limites de token/worker + config de backup ao montar | nenhuma | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:531 | `tenants` | update | salva `monthly_token_limit` e `worker_concurrency` | nenhuma | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:545 | `tenants` | select | carrega `tenants.holidays` ao montar | `holidays.routes.ts` só cobre `POST fetch-national`; leitura/add/remove ficaram no Supabase direto por decisão documentada no próprio arquivo (hoje quebrada pela migration 092) | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:559 | `tenants` | select | recarrega `tenants.holidays` após o fetch-national | mesma rota acima só cobre o POST, não o GET de releitura | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:576 | `tenants` | update | adiciona feriado manual em `tenants.holidays` | nenhuma | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:588 | `tenants` | update | remove feriado de `tenants.holidays` | nenhuma | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:784 | `tenants` | update | salva campo dinâmico de config de backup (`[key]: value`) | nenhuma | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:858 | `tenants` | update | salva objeto inteiro `companySettings` | nenhuma | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:1040 | `tenants` | update | botão "Salvar MK-Auth" grava `integrationKeys` em `tenants.integrations` (coluna plaintext antiga) | `PUT /api/v2/settings/integration-keys` existe mas grava em `tenants.integration_keys` (cifrada, nova) e só cobre Evolution/OpenAI/Gemini/Anthropic/SMTP/Clicksign/D4Sign — MK-Auth não foi portado | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:1217 | `tenants` | update | botão "Salvar RD Station" — mesmo padrão do 1040 | idem — RD Station não portado | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:1242 | `tenants` | update | botão "Salvar Pipedrive" — mesmo padrão | idem — Pipedrive não portado | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:1267 | `tenants` | update | botão "Salvar HubSpot" — mesmo padrão | idem — HubSpot não portado | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:1345 | `tenants` | update | botão "Salvar RadiusNet" — mesmo padrão | idem — RadiusNet não portado | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:1368 | `tenants` | update | botão "Salvar Asaas" (aba Integrações, chave — não é o webhook de cobrança) | idem — Asaas (aba Integrações) não portado | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:1400 | `tenants` | update | botão "Salvar Gerencianet" — mesmo padrão | idem — Gerencianet não portado | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:1680 | `tenants` | update | botão "Salvar Qdrant" — mesmo padrão | idem — Qdrant não portado | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:1703 | `tenants` | update | botão "Salvar Instagram" — mesmo padrão | idem — Instagram não portado | PRECISA_ROTA_NOVA |
| SettingsPage.tsx:1726 | `tenants` | update | botão "Salvar Facebook" — mesmo padrão | idem — Facebook não portado | PRECISA_ROTA_NOVA |

**Notas SettingsPage:**
- As 10 ocorrências de `tenants.integrations` (linhas 1040–1726) são handlers `onClick` de
  botões "Salvar X" vivos, um por provedor na aba Integrações — não é código morto. A
  migração pra API cobriu só 7 provedores (chamadas `apiPut('/api/v2/settings/integration-keys', ...)`
  nas linhas 1306/1429/1464/1499/1573/1608/1643 do mesmo arquivo); os 10 acima ficaram
  para trás. Atenção: a rota nova grava em `tenants.integration_keys` (cifrado) e o código
  velho grava em `tenants.integrations` (plaintext) — migrar exige decidir se as chaves
  restantes vão pro schema cifrado e migrar os dados já salvos na coluna antiga.
- Linha 153 (`seedTicketsAndLogs`) é ferramenta de dev/seed atrás de `role==='admin'` —
  visível em produção para qualquer admin. Não é código morto, mas é discutível migrar vs.
  remover da UI de produção (decisão de produto).
- `holidays.routes.ts` tem comentário próprio reconhecendo que leitura/escrita de feriados
  ficaram no Supabase direto — decisão hoje quebrada pela migration 092.
- Não existe nenhuma rota em `apps/api` para `team_members` (CRUD) nem `role_permissions` —
  a única referência a `team_members` é leitura auxiliar somente-leitura em
  `quality-stats.routes.ts` (estatística "agente que mais escalou").

---

## src/pages/ChatPage.tsx (7 ocorrências)

| arquivo:linha | tabela | operação | o que a UI faz | rota apps/api equivalente | classificação |
|---|---|---|---|---|---|
| ChatPage.tsx:201 | `tickets` | select | deriva lista de departamentos (SLA) a partir dos `department_id` distintos dos tickets do tenant | `departments.routes.ts` — `GET /api/v2/departments` já é a fonte correta | JA_EXISTE_ROTA |
| ChatPage.tsx:217 | `tenants` | select | busca `closing_reasons`/`forms` do tenant p/ dialog de encerramento e formulários dinâmicos | nenhuma | PRECISA_ROTA_NOVA |
| ChatPage.tsx:368 | `messages` | insert | insere mensagem enviada pelo operador humano no ticket (chat interno) | nenhuma (`webchat/message` é só pro widget público; `tickets/:id/human-response` só marca flag, não grava mensagem) | PRECISA_ROTA_NOVA |
| ChatPage.tsx:420 | `messages` | update | grava `evo_msg_ids` retornado pela Evolution API na mensagem já inserida | nenhuma | PRECISA_ROTA_NOVA |
| ChatPage.tsx:452 | `tickets` | update | adia (snooze) o ticket: `status=snoozed` + `snoozed_until/snooze_reason/snoozed_by` | `PATCH /api/v2/tickets/:id` existe, mas `updateTicketSchema` não aceita `snoozed` nem campos de snooze | PRECISA_ROTA_NOVA |
| ChatPage.tsx:472 | `tickets` | update | grava `closing_reason` antes de encerrar o ticket | mesma rota acima — schema não tem `closing_reason` | PRECISA_ROTA_NOVA |
| ChatPage.tsx:513 | `customers` | update | salva edição de perfil do cliente (dialog "editar cliente") | nenhuma (não existe CRUD de `customers` em `apps/api`) | PRECISA_ROTA_NOVA |

**Nota:** os casos 452/472 são candidatos a *estender* a rota `PATCH /api/v2/tickets/:id`
existente (ajustar o schema Zod) em vez de criar rota nova do zero.

---

## src/pages/CobrAIPage.tsx (5 ocorrências)

| arquivo:linha | tabela | operação | o que a UI faz | rota apps/api equivalente | classificação |
|---|---|---|---|---|---|
| CobrAIPage.tsx:94 | `customers` | select (count, head) | conta clientes `financial_status='inadimplente'` do tenant p/ KPI | nenhuma | PRECISA_ROTA_NOVA |
| CobrAIPage.tsx:96 | `cobrai_jobs` | select | conta jobs de cobrança disparados hoje, por status | `queue-monitor.routes.ts` (`GET /api/v2/cobranca/queue-stats`) lê do BullMQ/Redis, não da tabela Postgres `cobrai_jobs` — fonte e shape diferentes | PRECISA_ROTA_NOVA |
| CobrAIPage.tsx:141 | `tenants` | select (single) | carrega config do tenant (regras/estado da régua de cobrança) | nenhuma | PRECISA_ROTA_NOVA |
| CobrAIPage.tsx:164 | `customers` | select (single) | lê `cobrai_opted_out` atual do cliente antes de alternar | nenhuma | PRECISA_ROTA_NOVA |
| CobrAIPage.tsx:166 | `customers` | update | alterna `cobrai_opted_out` (pausar/retomar cobrança automática) | nenhuma | PRECISA_ROTA_NOVA |

---

## src/pages/TeamPage.tsx (6 ocorrências)

| arquivo:linha | tabela | operação | o que a UI faz | rota apps/api equivalente | classificação |
|---|---|---|---|---|---|
| TeamPage.tsx:45 | `tickets` | select | agrega tickets do mês por `assigned_to` p/ métricas por colaborador | nenhuma (`quality-stats.routes.ts` agrega por tenant, não por operador) | PRECISA_ROTA_NOVA |
| TeamPage.tsx:76 | `team_members` | delete | remove colaborador | nenhuma | PRECISA_ROTA_NOVA |
| TeamPage.tsx:90 | `team_members` | update | atualiza dados do colaborador | nenhuma | PRECISA_ROTA_NOVA |
| TeamPage.tsx:110 | `team_members` | insert | cria novo colaborador | nenhuma | PRECISA_ROTA_NOVA |
| TeamPage.tsx:145 | `team_members` | select | lista todos os operadores do tenant | nenhuma (`quality-stats.routes.ts` só busca 1 nome por id) | PRECISA_ROTA_NOVA |
| TeamPage.tsx:150 | `tickets` | select | tickets resolvidos no mês por agente p/ ranking/gamificação | nenhuma — `provedor/gamification.ts` tem a lógica pura (`computeOperatorRanking`), mas não existe rota que a alimente com dados reais | PRECISA_ROTA_NOVA |

---

## src/pages/MonitoringPage.tsx (4 ocorrências)

| arquivo:linha | tabela | operação | o que a UI faz | rota apps/api equivalente | classificação |
|---|---|---|---|---|---|
| MonitoringPage.tsx:33 | `dead_letter_queue` | select | lista até 10 jobs mortos não resolvidos | `ops/dlq.routes.ts` — `GET /api/v2/dlq` (nota: a query direta do front nem filtra por `tenant_id`, vazando jobs de outros tenants — a rota já corrige isso) | JA_EXISTE_ROTA |
| MonitoringPage.tsx:36 | `notifications` | select | lista até 20 notificações não lidas do tenant | nenhuma | PRECISA_ROTA_NOVA |
| MonitoringPage.tsx:73 | `dead_letter_queue` | update | marca job da DLQ como resolvido/descartado | `dlq.routes.ts` — `POST /api/v2/dlq/:id/retry` cobre "resolvido" mas sempre reenfileira; não cobre "descartar sem reenviar" | PRECISA_ROTA_NOVA |
| MonitoringPage.tsx:93 | `notifications` | update (loop) | marca todas as notificações não lidas como lidas, uma a uma | nenhuma | PRECISA_ROTA_NOVA |

**Nota de segurança (fora do escopo, só registrando):** a query direta de
`MonitoringPage.tsx:33` não filtra por `tenant_id` — vaza jobs da DLQ de todos os tenants
pra tela. Reforça a prioridade de migrar essa tela cedo.

---

## src/pages/OnboardingWizardPage.tsx (4 ocorrências)

| arquivo:linha | tabela | operação | o que a UI faz | rota apps/api equivalente | classificação |
|---|---|---|---|---|---|
| OnboardingWizardPage.tsx:299 | `customers` | select (count, head) | conta total de clientes do tenant (wizard, step Report) | nenhuma | PRECISA_ROTA_NOVA |
| OnboardingWizardPage.tsx:300 | `invoices` | select (count, head) | conta faturas vencidas (`status=overdue`) | nenhuma | PRECISA_ROTA_NOVA |
| OnboardingWizardPage.tsx:301 | `invoices` | select | soma valor das faturas vencidas | nenhuma | PRECISA_ROTA_NOVA |
| OnboardingWizardPage.tsx:302 | `tickets` | select | calcula tempo médio de resolução (até 200 tickets) | nenhuma (`quality-stats.routes.ts` calcula `avgResponseMs` diferente, via `daily_metrics`) | PRECISA_ROTA_NOVA |

**Nota:** este step depende de `supabase.auth.getSession()` (sessão Supabase Auth, trilha
diferente do JWT próprio do `apps/api` — logada em `src/App.tsx:1936` via
`supabase.auth.signInWithPassword`). Vale investigar à parte se essa segunda trilha de auth
é intencional ou resquício.

---

## src/pages/QualityMonitorPage.tsx (4 ocorrências)

| arquivo:linha | tabela | operação | o que a UI faz | rota apps/api equivalente | classificação |
|---|---|---|---|---|---|
| QualityMonitorPage.tsx:80 | `tickets` | select | lista até 10 conversas abertas, ordenadas por `updated_at` | `GET /api/v2/tickets` existe mas não filtra `status` nem ordena por `updated_at`, e não devolve esse campo | PRECISA_ROTA_NOVA |
| QualityMonitorPage.tsx:84 | `notifications` | select | lista até 20 alertas não lidos p/ painel de qualidade | nenhuma | PRECISA_ROTA_NOVA |
| QualityMonitorPage.tsx:88 | `tickets` | select | `csat_score` dos últimos 100 tickets avaliados p/ gráfico de CSAT | `quality-stats.routes.ts` devolve `avgCsatWeek`, mas está hardcoded `null` (não implementado) | PRECISA_ROTA_NOVA |
| QualityMonitorPage.tsx:97 | `notifications` | update | marca um alerta específico como lido | nenhuma | PRECISA_ROTA_NOVA |

---

## src/pages/SuperAdminPage.tsx (4 ocorrências)

| arquivo:linha | tabela | operação | o que a UI faz | rota apps/api equivalente | classificação |
|---|---|---|---|---|---|
| SuperAdminPage.tsx:75 | `tenants` | select | lista até 100 tenants (nome, plano, ativo, nº assinantes) | nenhuma | PRECISA_ROTA_NOVA |
| SuperAdminPage.tsx:76 | `shadow_results` | select | lista últimos 50 resultados de execução em modo-sombra | nenhuma (`edge_shadow_results` de `ia/edge.routes.ts` é outra tabela/domínio) | PRECISA_ROTA_NOVA |
| SuperAdminPage.tsx:77 | `tenant_feature_flags` | select | lista até 200 feature flags por tenant | nenhuma | PRECISA_ROTA_NOVA |
| SuperAdminPage.tsx:116 | `tenants` | update | suspende/reativa um tenant (super_admin agindo sobre tenant de outro) | nenhuma | PRECISA_ROTA_NOVA |

**Nota:** maior buraco do lote B — nenhuma das 4 ocorrências tem qualquer cobertura em
`apps/api`.

---

## src/pages/WhatsAppPage.tsx (3 ocorrências)

| arquivo:linha | tabela | operação | o que a UI faz | rota apps/api equivalente | classificação |
|---|---|---|---|---|---|
| WhatsAppPage.tsx:97 | `tenants` | update | grava lista de nomes de instância Evolution (`evolution_instances`) | nenhuma (só leitura em `whatsapp-connection-health.routes.ts`) | PRECISA_ROTA_NOVA |
| WhatsAppPage.tsx:99 | `tenant_evolution_instances` | upsert | cria/atualiza instância WhatsApp (label, telefone, status, ai_enabled) | nenhuma (só leitura em `whatsapp-connection-health.routes.ts`/`whatsapp-health-history.routes.ts`) | PRECISA_ROTA_NOVA |
| WhatsAppPage.tsx:136 | `tenant_evolution_instances` | delete | remove instância WhatsApp desconectada | nenhuma | PRECISA_ROTA_NOVA |

---

## src/pages/AIConfigPage.tsx (2 ocorrências)

| arquivo:linha | tabela | operação | o que a UI faz | rota apps/api equivalente | classificação |
|---|---|---|---|---|---|
| AIConfigPage.tsx:301 | `tenants` | select | carrega config do tenant (vector store, limites, worker, plano) ao abrir | nenhuma | PRECISA_ROTA_NOVA |
| AIConfigPage.tsx:321 | `tenants` | update | salva patch genérico no tenant (toggle CobrAI, limiter, janela de disparo, stages, vector config) | nenhuma | PRECISA_ROTA_NOVA |

---

## src/pages/BillingPage.tsx (2 ocorrências)

| arquivo:linha | tabela | operação | o que a UI faz | rota apps/api equivalente | classificação |
|---|---|---|---|---|---|
| BillingPage.tsx:93 | `invoices` | update | marca fatura individual como paga (`simulatePayment`) | nenhuma (`gateway-sync.routes.ts` só sincroniza cobranças vindas do Asaas, não update manual) | PRECISA_ROTA_NOVA |
| BillingPage.tsx:520 | `invoices` | update | marca em lote as faturas selecionadas como pagas | nenhuma | PRECISA_ROTA_NOVA |

---

## src/pages/AIObservabilityPage.tsx (2 ocorrências)

| arquivo:linha | tabela | operação | o que a UI faz | rota apps/api equivalente | classificação |
|---|---|---|---|---|---|
| AIObservabilityPage.tsx:142 | `ai_ragas_scores` | select | lista últimos 200 scores RAGAS pro painel de qualidade da IA | nenhuma (tabela existe desde a migration 029, mas nenhuma rota lê/escreve — só `scripts/cutover/collect-signals.ts`) | PRECISA_ROTA_NOVA |
| AIObservabilityPage.tsx:144 | `ai_guardrail_blocks` | select | lista últimos 200 bloqueios de guardrail | nenhuma (mesma migration 029, mesma ausência de rota) | PRECISA_ROTA_NOVA |

---

## src/pages/DashboardPage.tsx (2 ocorrências)

| arquivo:linha | tabela | operação | o que a UI faz | rota apps/api equivalente | classificação |
|---|---|---|---|---|---|
| DashboardPage.tsx:118 | `upsell_events` | select | carrega eventos de upsell do tenant pro card do dashboard | `vendas/upsell.routes.ts` existe, mas só tem `POST /api/v2/upsell/convert` (insert) — sem GET/list | PRECISA_ROTA_NOVA |
| DashboardPage.tsx:119 | `tickets` | select | carrega `csat_score`/`created_at` pro gráfico de CSAT | `GET /api/v2/tickets` existe, mas select fixo (`id,title,status,priority,created_at`) não retorna `csat_score` nem filtra not-null | PRECISA_ROTA_NOVA |

---

## src/pages/InventoryPage.tsx (1 ocorrência)

| arquivo:linha | tabela | operação | o que a UI faz | rota apps/api equivalente | classificação |
|---|---|---|---|---|---|
| InventoryPage.tsx:173 | `inventory` | insert | importa itens de estoque via CSV, linha a linha | nenhuma — `provedor/inventory.service.ts` existe mas está órfão (só usado pelo próprio `.test.ts`; nenhuma rota o expõe) | PRECISA_ROTA_NOVA |

---

## src/pages/KnowledgeBasePage.tsx (3 ocorrências)

| arquivo:linha | tabela | operação | o que a UI faz | rota apps/api equivalente | classificação |
|---|---|---|---|---|---|
| KnowledgeBasePage.tsx:160 | `knowledge_articles` | select | lista artigos da base de conhecimento do tenant | nenhuma (`kb-draft.routes.ts` é sobre drafts pendentes, tabela/conceito diferente; `knowledge-reindex.routes.ts` não lista) | PRECISA_ROTA_NOVA |
| KnowledgeBasePage.tsx:166 | `tenants` | select | carrega `embedding_config`/`vector_store_config` | nenhuma | PRECISA_ROTA_NOVA |
| KnowledgeBasePage.tsx:175 | `tenants` | update | salva `embedding_config`/`vector_store_config` | nenhuma | PRECISA_ROTA_NOVA |

---

## src/pages/TicketsPage.tsx (1 ocorrência)

| arquivo:linha | tabela | operação | o que a UI faz | rota apps/api equivalente | classificação |
|---|---|---|---|---|---|
| TicketsPage.tsx:75 | `tickets` | insert | cria ticket a partir do formulário "Novo Ticket" | `POST /api/v2/tickets` existe | JA_EXISTE_ROTA |

**Nota:** a rota existe mas o payload da UI (`subject`, `ai_enabled`, `ai_attempts`) não
bate com `createTicketSchema` (espera `title`; não tem `ai_enabled`/`ai_attempts`) — migrar
exige ajustar o payload, não só trocar o client.

---

## src/pages/intelligence/NetworkGraphPage.tsx + .test.tsx (2 ocorrências, 1 real)

| arquivo:linha | tabela | operação | o que a UI faz | rota apps/api equivalente | classificação |
|---|---|---|---|---|---|
| NetworkGraphPage.tsx:77 | `network_ctos` | select | lista `id,name` das CTOs pro dropdown de seleção | `rede/graph.routes.ts` — `GET /api/v2/rede/graph/capacidade` retorna `{id,name,total_ports,used_ports}` por tenant (superset do necessário) | JA_EXISTE_ROTA |
| NetworkGraphPage.test.tsx:8 | — | — | comentário no teste explicando o mock — **não é uma chamada real** | — | COMENTÁRIO |

**Nota:** o próprio código-fonte já reconhece a lacuna num comentário ("reaproveita
supabase direto — não passa pelo backend IA-16"). A rota `capacidade` cobre o dado mas é
semanticamente uma rota de relatório, não uma listagem de CTOs — vale considerar um
endpoint dedicado `GET /api/v2/rede/ctos`.

---

## src/components/*.tsx (8 ocorrências)

| arquivo:linha | tabela | operação | o que a UI faz | rota apps/api equivalente | classificação |
|---|---|---|---|---|---|
| CustomerDetailsDialog.tsx:118 | `invoices` | insert | gera fatura manual pro cliente selecionado (`handleGenerateInvoice`) | nenhuma | PRECISA_ROTA_NOVA |
| CustomerDetailSheet.tsx:140 | `customers` | select | carrega dados do cliente ao abrir o sheet | nenhuma — não existe `customers.routes.ts` em `apps/api` | PRECISA_ROTA_NOVA |
| CustomerDetailSheet.tsx:141 | `reflections` | select | carrega últimas 10 "reflections" (notas) do cliente | nenhuma — `GET /api/v2/ia/reflections` lê de `ai_reflections` (diário do Cérebro Noturno), conceito/tabela diferente | PRECISA_ROTA_NOVA |
| CustomerHistorySidebar.tsx:37 | `customers` | select | carrega dados do cliente pro sidebar de histórico | nenhuma | PRECISA_ROTA_NOVA |
| CustomerHistorySidebar.tsx:38 | `tickets` | select | lista tickets do cliente (por `created_at`) pro histórico | `GET /api/v2/tickets` existe mas não filtra por `customer_id` nem ordena | PRECISA_ROTA_NOVA |
| CustomerHistorySidebar.tsx:40 | `service_orders` | select | lista ordens de serviço do cliente pro histórico | `campo/field-ops.routes.ts` tem rotas de `service_orders`, mas todas por técnico logado ou por `id` de OS — nenhuma lista por `customer_id` | PRECISA_ROTA_NOVA |
| KanbanBoard.tsx:63 | `tickets` | update | atualiza `pipeline_stage` ao arrastar card no Kanban | `PATCH /api/v2/tickets/:id` existe, mas `updateTicketSchema` não inclui `pipeline_stage` (seria descartado pela validação) | PRECISA_ROTA_NOVA |
| layout/Sidebar.tsx:114 | `users` | select | verifica se usuário logado é `super_admin` pra exibir itens extra de menu | nenhuma rota `/me` — o JWT (`jwt.service.ts`) já carrega `role` no payload | PRECISA_ROTA_NOVA |

**Nota:** não existe nenhuma rota `customers.routes.ts` (ou equivalente) em `apps/api` — é
o maior buraco transversal: 3 dos 8 usos em componentes dependem só de buscar 1 cliente por
id, e essa rota básica nem existe ainda.

**Achado colateral de segurança (fora do escopo, só registrando, NÃO corrigido):** em
`apps/api/src/domain/campo/field-ops.routes.ts` várias definições de rota usam barra
invertida em vez de `/` (ex.: linha 216 `fastify.post('\api\v2\field\os:id/transition', ...)`,
e mais nas linhas 485, 594, 615, 692, 744, 817, 851, 871, 892) — parece bug de find/replace
no Windows que quebraria essas rotas em runtime. Impacto real não investigado.

---

## src/hooks (0 ocorrências)

Nenhum arquivo em `src/hooks` faz `supabase.from(` ou `supabase.rpc(` diretamente.

---

## Verificação (passo 4 da spec)

- Total de linhas classificadas nas tabelas acima: 91 (31 SettingsPage + 7 ChatPage +
  5 CobrAIPage + 6 TeamPage + 4 MonitoringPage + 4 OnboardingWizardPage +
  4 QualityMonitorPage + 4 SuperAdminPage + 3 WhatsAppPage + 2 AIConfigPage +
  2 BillingPage + 2 AIObservabilityPage + 2 DashboardPage + 1 InventoryPage +
  3 KnowledgeBasePage + 1 TicketsPage + 2 NetworkGraphPage(+test) + 8 components + 0 hooks
  = 91), batendo com o total do grep do passo 1.
- `supabase.rpc(` no escopo: 0 ocorrências.
