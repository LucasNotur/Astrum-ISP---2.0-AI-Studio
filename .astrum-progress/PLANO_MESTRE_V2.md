# ASTRUM — PLANO MESTRE V2 (Sessões 68–98 remapeadas)

> **Este documento substitui a ordem antiga das sessões 68–98 do `MAPA_SESSOES_1_a_98.md`.**
> Criado em 2026-07-01 a partir da auditoria completa do repositório.
> É o guia passo a passo para a IA executora. Uma sessão por vez, sem pular etapas.

---

## §0 — PROTOCOLO DE EXECUÇÃO (a IA DEVE ler isto no início de TODA sessão)

### 0.1 Ritual de início de sessão
1. Ler este arquivo inteiro (`.astrum-progress/PLANO_MESTRE_V2.md`).
2. Ler as últimas 3 entradas de `.astrum-progress/PROGRESS_LOG.md`.
3. Rodar `git status` e `git log --oneline -5` — se houver trabalho não commitado de sessão anterior, terminar/commitar antes de começar coisa nova.
4. Localizar a **primeira sessão com checkbox ⬜** neste arquivo. Essa é a sessão atual. Não executar sessões futuras "de carona".

### 0.2 Ritual de fim de sessão
1. Todos os critérios de aceite da sessão verificados **por comando** (não por leitura de código).
2. Marcar os checkboxes da sessão aqui neste arquivo.
3. Adicionar entrada no `PROGRESS_LOG.md` (mesmo formato das anteriores: data, tarefa, arquivos, status, observações).
4. Se a sessão fechar itens do `docs/feito/PROGRESSO_105_ITEMS.md`, marcar lá também (o mapeamento está em cada sessão abaixo).
5. Commit com mensagem `feat(sXX): <resumo>` ou `chore(sXX): <resumo>`.

### 0.3 Regras invioláveis (decididas pelo Lucas — NÃO rediscutir)
- **R1 — Frontend:** o frontend oficial é o legado (`src/pages/*`, 22 páginas, Vite na raiz). **NUNCA migrar telas para `apps/web`.** `apps/web` será canibalizado (hooks) e deletado na S78. Mudanças no frontend legado são permitidas APENAS em: camada de dados (repositories), auth, hooks de rede e correções de bug.
- **R2 — Dados:** Supabase é o único banco de destino. Redis para cache/filas. Firestore só existe até a S82 (cutover) — proibido criar coleção/campo novo no Firestore.
- **R3 — LLMs:** GPT-4o-mini para conversação, GPT-4o para orquestração/raciocínio. O sistema de fallback multi-provider **já existe** em `src/ai-provider/` (adapters openai/anthropic/gemini) — deve ser PORTADO para o motor novo, nunca reimplementado do zero.
- **R4 — Backend:** toda lógica nova vai em `apps/api` (Fastify/DDD). Proibido criar feature nova em `/src` (backend) — lá só se corrige bug crítico de produção.
- **R5 — Portar, não apagar:** código legado só é deletado quando o comportamento equivalente estiver no `apps/api`, testado, E recebendo o tráfego de produção.
- **R6 — Uma régua de cobrança:** até a S76, apenas UMA engine CobrAI pode estar ativa (controlada por env `COBRAI_ENGINE`).

### 0.4 Definição de "Pronto" (DoD universal)
Uma sessão só está pronta quando: (a) código escrito + teste unitário passando (`npx vitest run <arquivos>`); (b) typecheck limpo no pacote tocado; (c) critérios de aceite específicos verificados; (d) rituais do §0.2 cumpridos. **"Compila e existe" ≠ pronto.**

### 0.5 Documentos de referência (fonte da verdade)
| Assunto | Documento |
|---|---|
| Estado real das 3 frentes de backend | `docs/LEGACY_RETIREMENT_PLAN.md` |
| Mapa campo-a-campo Firestore→Supabase | `docs/DB_MIGRATION_GAP_REPORT.md` |
| Migrations existentes (001–020) | `packages/db/src/migrations/` |
| Backlog de produto (105 itens) | `docs/feito/PROGRESSO_105_ITEMS.md` |
| Sessões 1–67 (histórico, NÃO reexecutar) | `.astrum-progress/MAPA_SESSOES_1_a_98.md` |

---

## VISÃO DAS FASES

```
FASE 0  Contenção            → S68            (matar riscos ativos)
FASE 1  Migração de dados    → S69–S70        (Firestore → Supabase)
FASE 2  Cérebro do produto   → S71–S74        (webhook + messageWorker no apps/api)
FASE 3  ERP + CobrAI únicos  → S75–S76        (diferencial do produto)
FASE 4  Frontend legado v2   → S77–S78        (troca da camada de dados, telas intactas)
FASE 5  Workers operacionais → S79–S81        (9 workers portados)
FASE 6  Cutover              → S82–S83        (Fastify primário, adeus Express/Firestore)
FASE 7  Qualidade & Go-Live  → S84–S89        (load, chaos, OWASP, RAGAS, GATE)
FASE 8  Expansão             → S90–S97        (Svix, onboarding, módulos novos)
GATE FINAL                   → S98
```

---

# FASE 0 — CONTENÇÃO

## ✅ S68 — Matar o split-brain + limpar órfãos + bugs conhecidos
**Objetivo:** eliminar os dois riscos ativos (cobrança dupla, motor fantasma) e sanear o repo antes de qualquer port.

**Passos:**
1. **CobrAI única:**
   - Mapear como cada engine sobe: grep por `cobraiWorker` (legado, `src/workers/cobraiWorker.ts`) e `cobrai.scheduler`/`cobrai.worker` (novo, `apps/api/src/domain/cobranca/` + `packages/queue/src/workers/cobrai.worker.ts`).
   - Criar env `COBRAI_ENGINE=legacy|v2` (default `legacy`, pois é quem tem os dados reais hoje). Cada bootstrap verifica a env e **se recusa a subir** se não for o engine ativo, logando aviso.
   - Documentar em `docs/LEGACY_RETIREMENT_PLAN.md` §2.3 qual é a fonte-da-verdade por domínio (tickets: Firestore/v1 até S82; cobrança: legado até S76).
2. **Órfãos:** `apps/backend` e `apps/frontend` (billing enterprise) não são importados por nada (verificado por grep em 2026-07-01). Mover para branch `graveyard/billing-enterprise` e deletar do main. Mesma coisa para os 3 schemas conflitantes de `Supabase_Assinaturas/` (manter só como referência na branch). Se algum conceito de lá for desejado no futuro, ele entra pelo dossiê-105 (itens 13/14 já marcados).
3. **Bugs conhecidos (da auditoria):**
   - [conversation.service.ts:38] `.eq('customer_id', opts.customerId ?? null)` não casa NULL no PostgREST → usar `.is('customer_id', null)` quando não houver customerId. Adicionar teste cobrindo conversa sem customer (não pode duplicar).
   - [apps/api/src/server.ts:57] decorator `authenticate` responde erro sem status → `reply.code(401).send(...)`.
   - [apps/api/src/server.ts:232] boot do Fastify engole erro (`catch` com comentário "para não derrubar Express") → logar como `fatal` no Sentry E gravar flag de health `fastify_boot_failed` visível em `/api/health` do Express. (O `process.exit` só volta na S82, quando o Fastify for o processo principal.)
4. **Congelamento formal:** adicionar ao `README.md` e ao `CLAUDE.md` (criar se não existir) as regras R1–R6 do §0.3.

**Critérios de aceite:**
- [x] `COBRAI_ENGINE` implementada (`engine-flags.ts`); guarda nos dois workers; teste prova que as duas engines nunca sobem juntas.
- [x] `apps/backend` (órfão real) removido; `apps/frontend` MANTIDO (é UI viva em SettingsPage — correção da auditoria); `Supabase_Assinaturas` mantido (ligado à UI de billing). Suíte continua verde.
- [x] 3 bugs corrigidos com testes (customer_id NULL, 401 no authenticate, boot-state visível no health).
- [x] Regras R1–R6 em `CLAUDE.md`.

**Nota de execução (correção da auditoria):** o plano original mandava remover `apps/frontend` e `Supabase_Assinaturas` como órfãos. Ao executar, descobri que `src/pages/SettingsPage.tsx` importa 6 componentes de `apps/frontend` (billing/planos/pricing) — é UI viva. Pela R1, foram MANTIDOS. Só `apps/backend` (backend Fastify de billing, 0 importadores) era órfão real e foi removido.

---

# FASE 1 — MIGRAÇÃO DE DADOS (Firestore → Supabase)

## 🔶 S69 — Schema final + ETL backfill (entidades financeiras e cadastrais)
> Código completo e testado (26 testes). **Execução do backfill real pendente de credenciais vivas** (FIREBASE_*/SUPABASE_*).
**Objetivo:** todos os dados cadastrais/financeiros do Firestore existindo no Supabase, com validação por contagem.

**Pré-requisito:** ler `docs/DB_MIGRATION_GAP_REPORT.md` INTEIRO antes de escrever qualquer linha.

**Passos:**
1. Verificar se as migrations 015–019 já cobrem as tabelas da Categoria 2 do gap report (`service_orders`, `network_ctos`, `inventory`, `notifications`, `technicians`, `ai_performance_logs`, `knowledge_articles`) e as colunas críticas (`invoices.payment_url`, `invoices.pix_copy_paste`, `customers.address/mrr`, `tickets.ai_enabled/ai_attempts`, colunas `legacy_id` em todas). O que faltar → nova migration `021_*.sql` seguindo o padrão (RLS incluída).
2. Rodar `npm run db:migrate:dry` e depois `npm run db:migrate` no Supabase de staging.
3. Criar `scripts/etl/firestore-to-supabase.ts` com:
   - Ordem de dependência: `tenants → users/team_members → plans → customers → invoices → service_orders → network_ctos → inventory → technicians → notifications`.
   - Regras do gap report: UUID novo + `legacy_id`; `amount` reais → `amount_cents` (multiplicar por 100, arredondar com `Math.round`, NUNCA truncar); enums mapeados (`inactive→suspended`, `urgent→critical`, etc.); `audit_logs` legado vai para `ai_performance_logs` (NUNCA para `audit_log`).
   - Idempotente: upsert por `legacy_id` — rodar duas vezes não duplica.
   - Flag `--tenant <id>` para migrar um tenant por vez e `--dry-run` para relatório sem escrita.
4. Executar backfill em staging; gerar relatório `docs/etl/BACKFILL_REPORT_S69.md` com contagem origem×destino por coleção/tabela e amostra de 5 registros comparados campo a campo.

**Critérios de aceite:**
- [ ] Contagens origem = destino para todas as entidades da sessão (tolerância zero em invoices/customers).
- [ ] Reexecução do ETL não altera contagens (idempotência provada).
- [ ] `invoices`: soma total em centavos = soma legada × 100 (validação financeira).

## 🔶 S70 — ETL conversacional + re-ingestão de conhecimento + GATE DE DADOS
> Lógica de split ticket→conversation e delta-sync completas e testadas (10 testes) + migration da ponte. Re-ingestão reusa pipeline RAG existente. **Execução + GATE DE DADOS pendentes de credenciais vivas.**
**Objetivo:** histórico de atendimento e base de conhecimento no mundo novo.

**Passos:**
1. **Tickets → tickets + conversations + messages:** cada ticket legado com subcoleção `messages` vira 1 `conversation` (ponte `ticket_id`↔`conversation_id` numa tabela `legacy_ticket_conversation_map`) + N `messages` (mapear `senderType`: customer→user, ai→assistant, human→assistant com `from_ai=false`).
2. **Knowledge base:** NÃO copiar — **re-ingerir**. Para cada artigo do Firestore: gravar texto original em `knowledge_articles` + passar pelo pipeline RAG novo (`document-chunker` → `embedding` → Qdrant coleção `knowledge_{tenantId}` com sparse vectors, cf. `collection-setup.service.ts`).
3. **Delta sync até o cutover:** criar `scripts/etl/delta-sync.ts` — job que roda a cada 15 min (BullMQ) reprocessando documentos Firestore com `updatedAt > última execução`. Ele mantém o Supabase espelhado até a S82.
4. **GATE DE DADOS:** relatório final `docs/etl/GATE_DADOS_S70.md`. Só passa se: contagens batem, 10 conversas amostradas legíveis no Supabase com ordem cronológica correta, busca RAG por 5 perguntas típicas retorna chunks dos artigos migrados.

**Critérios de aceite:**
- [ ] GATE DE DADOS aprovado e documentado.
- [ ] Delta sync rodando como job recorrente (visível na fila BullMQ).
- [ ] Zero registros em `audit_log` vindos do ETL (a armadilha do nome).

---

# FASE 2 — O CÉREBRO: INGRESSO WHATSAPP + MESSAGEWORKER NO apps/api

> Esta fase é o coração de todo o plano. O `src/workers/messageWorker.ts` tem ~1605 linhas de
> lógica validada em produção. O objetivo NÃO é reescrevê-la "mais bonita" — é reproduzi-la
> sobre a fundação nova (guardrails → LangGraph → tools), comportamento por comportamento.

## ✅ S71 — Webhook Evolution no Fastify + inventário do messageWorker
> Inventário completo (32 comportamentos), rota v2, parser testado, bug de nome de fila corrigido. Não recebe tráfego real até S74.
**Passos:**
1. **Inventário (entregável obrigatório):** ler `src/workers/messageWorker.ts` (1605L) e `src/routes/evolutionWebhook.ts` inteiros. Produzir `docs/port/MESSAGEWORKER_INVENTORY.md` listando TODOS os comportamentos: tipos de mídia tratados, transcrição de áudio, visão em imagem, tool calls e cada tool, regras de escalação, deduplicação de mensagens, rate limits, respostas fora de horário, etc. Cada item vira checkbox que as S72–S73 vão marcando. **Sem esse inventário, o port vai perder comportamento silenciosamente.**
2. Migration `022_tenant_evolution.sql`: colunas `evolution_instance TEXT` (+ tabela `tenant_evolution_instances` se houver multi-instância, cf. campo legado `evolution_instances`) em `tenants`, populada pelo ETL a partir do Firestore.
3. Criar `apps/api/src/domain/atendimento/evolution-webhook.routes.ts`:
   - Réplica funcional do webhook legado: validação HMAC (reusar `hmac.service.ts` — já é o mesmo dos dois lados), lookup do tenant por instância **no Supabase**, parse de `messages.upsert` (texto/áudio/imagem/documento/base64) e `connection.update`.
   - Publica na fila `astrum:messages` (o `MessageJobData` de `packages/queue/src/workers/message.worker.ts`) — estender o tipo com os campos de mídia do legado (`isAudio`, `audioUrl`, `base64Media`, `mediaMimeType`, `isImage`, `isDocument`).
   - Registrar rota no `server.ts` do Fastify como `/api/v2/webhook/evolution`.
4. **Ainda NÃO apontar a Evolution API para cá.** O legado continua atendendo.

**Critérios de aceite:**
- [ ] `MESSAGEWORKER_INVENTORY.md` completo (revisado contra o arquivo fonte, não de memória).
- [ ] POST simulado no `/api/v2/webhook/evolution` com payload real de exemplo → job aparece na fila com todos os campos (teste de integração com Redis local via `docker:dev`).
- [ ] Assinatura HMAC inválida → 401; instância desconhecida → 403 (testes).

## ✅ S72 — Port do messageWorker, parte 1: texto, contexto, tools de negócio
> Fallback multi-provider (R3) portado com failover na request + tools de negócio ligadas ao Supabase (billing com pix/2ª via, cobertura, diagnóstico, agendamento). 18 testes.
**Passos:**
1. Expandir `packages/queue/src/workers/message.worker.ts` (hoje 103L) seguindo o inventário: deduplicação por `messageId`, janela de agrupamento de mensagens picadas (se o legado tiver), seleção de idioma/persona por tenant.
2. **Port do fallback LLM (R3):** portar `src/ai-provider/` (service + adapters openai/anthropic/gemini) para `apps/api/src/adapters/ai/` integrando com o `llm.adapter.ts` existente. Roteamento: 4o-mini conversa / 4o orquestração; em falha do provider primário (circuit breaker Opossum já existe), próximo adapter assume de forma transparente. Config por tenant em `ai_configurations` (adicionar colunas `provider/model/fallback_provider/fallback_model` — gap report item 1.8, migration `023`).
3. Portar as tools de negócio do legado para `tools.executor.ts`: `get_billing_status` (agora lê `invoices` do Supabase e envia `payment_url`/`pix_copy_paste`), `check_coverage` (lê `network_ctos`), `run_diagnostics`, `search_knowledge_base` (usa hybrid-search), `schedule_technical_visit` (cria `service_orders`).
4. Testes unitários por tool (mock do Supabase) + teste do fluxo texto completo com LLM mockado.

**Critérios de aceite:**
- [ ] Mensagem de texto processada E2E em ambiente local: fila → guardrails → LangGraph → resposta → `messages` no Supabase (WhatsApp mockado).
- [ ] Derrubar o adapter OpenAI (forçar erro) → resposta ainda sai pelo fallback, com log do provider usado.
- [ ] Checkboxes correspondentes marcados no `MESSAGEWORKER_INVENTORY.md`.

## ✅ S73 — Port do messageWorker, parte 2: mídia (áudio, imagem, documento)
**Passos:**
1. **Áudio:** download da mídia Evolution → transcrição Whisper (`openai.audio.transcriptions`) → texto entra no fluxo normal. Guardar áudio original no R2 (`r2.adapter.ts`). *(fecha dossiê-105 item 71)*
2. **Imagem:** GPT-4o vision para descrever/diagnosticar (ex.: foto de roteador com LED) → resultado vira contexto da resposta. Portar prompts do `visionProcessor.ts` legado. *(prepara item 78)*
3. **Documento:** anexos (PDF/imagem de comprovante) → R2 + registro em `messages.metadata`; se for comprovante de pagamento, acionar tool de baixa manual/notificação ao operador (conforme comportamento do legado — conferir inventário).
4. Mensagens fora do expediente, saudações, e demais comportamentos restantes do inventário.

**Critérios de aceite:**
- [ ] Os 4 tipos de payload (texto/áudio/imagem/documento) processados em teste de integração local.
- [ ] `MESSAGEWORKER_INVENTORY.md` 100% marcado (ou item explicitamente descartado com justificativa escrita).

## 🔶 S74 — Shadow mode → cutover do atendimento
**Objetivo:** provar que o motor novo responde igual ou melhor, e então virar a chave.

**Passos:**
1. **Espelhamento:** no webhook legado (`src/routes/evolutionWebhook.ts` — exceção autorizada à R4, ~10 linhas), após enfileirar no legado, repassar o payload bruto via HTTP para `/api/v2/webhook/evolution` com header `x-shadow: true`.
2. No motor novo, modo shadow: processa tudo, MAS `sendWhatsAppResponse` é suprimido; grava a resposta que TERIA enviado em `shadow_results` (migration `024`: tenant, conversa, resposta_legado?, resposta_v2, latência, tokens, provider).
3. Rodar 3–7 dias de tráfego real espelhado. Gerar `docs/port/SHADOW_REPORT.md`: % de respostas equivalentes (avaliar amostra com GPT-4o como juiz), latência p95 comparada, custo por conversa comparado (Helicone).
4. **Decisão de cutover (envolve o Lucas):** se relatório aprovado → env `ATENDIMENTO_ENGINE=v2`: webhook legado passa a só repassar (proxy), motor novo envia de verdade, `messageWorker` legado desligado. Rollback = voltar a env.

**Critérios de aceite:**
- [ ] ≥95% de equivalência na amostra julgada, p95 ≤ legado, custo ≤ legado (senão: iterar antes de cortar).
- [ ] Cutover executado com rollback testado (virar a env de volta e confirmar que o legado volta a responder).
- [ ] A partir daqui o atendimento REAL roda no `apps/api`. 🏁 Marco maior do plano inteiro.

---

# FASE 3 — ERP + COBRAI ÚNICOS

## 🔶 S75 — Port das integrações ERP
**Objetivo:** a IA nova resolve boleto/sinal/cadastro REAIS. *(fecha dossiê-105 itens 31–35, 40, 43 parcial)*

**Passos:**
1. Portar `src/lib/integrations/*` → `apps/api/src/adapters/erp/` (ixc, mk-auth, sgp, voalle, hubsoft, radiusnet, rbx + `erpAdapter` como interface comum). Envolver cada client com circuit breaker Opossum + retry + timeout (padrão dos adapters existentes).
2. Cache de respostas ERP no Redis (portar `erpCache.ts`, TTL curto).
3. Credenciais por tenant: tabela `tenant_erp_credentials` (migration `025`) com colunas cifradas (pgcrypto ou app-level via `node-forge` já disponível) — NUNCA em texto puro. *(prepara item 4 do dossiê)*
4. Ligar as tools do `tools.executor.ts` aos adapters reais (ex.: `get_billing_status` consulta o ERP quando o tenant tiver integração ativa, senão cai no Supabase).
5. Teste com sandbox/mock de pelo menos IXC e MK-Auth (os mais comuns).

**Critérios de aceite:**
- [ ] 7 adapters portados com testes unitários (HTTP mockado).
- [ ] Tool de fatura retorna boleto real de ERP sandbox em teste de integração.
- [ ] Credenciais no banco ilegíveis sem a chave (verificar por SELECT direto).

## 🔶 S76 — CobrAI unificado E2E sobre Supabase
**Objetivo:** uma única régua de cobrança, no motor novo, com os dados migrados. *(fecha dossiê-105 item 82)*

**Passos:**
1. Comparar regra a regra o `cobraiWorker.ts` legado (454L) com `cobrai-rules.service.ts` novo; portar o que faltar (limites por hora, janelas de disparo, templates de mensagem, opt-out).
2. Garantir que o scheduler novo lê `invoices` migradas (com `payment_url`/`pix_copy_paste`) e dispara via o message-sender novo, respeitando idempotência (`cobrai_jobs`).
3. Rodar em staging com tenant de teste: fatura vencida → mensagem com link/pix correto → registro auditável.
4. Virar `COBRAI_ENGINE=v2` em produção. Desligar worker legado. Monitorar 48h (zero disparo duplo — conferir por `cobrai_jobs` × logs legados).

**Critérios de aceite:**
- [ ] Diff de comportamento legado×novo documentado e zerado.
- [ ] 48h em produção sem disparo duplo nem fatura pulada.
- [ ] Worker legado de cobrança removido do bootstrap (código ainda existe até S82, mas nada o inicia).

---

# FASE 4 — FRONTEND LEGADO SOBRE O MUNDO NOVO (telas intactas — R1)

## 🔶 S77 — Auth swap: Firebase Auth → Supabase/JWT v2
**Passos:**
1. Mapear todos os pontos de auth do frontend legado (grep `firebase/auth`, `onAuthStateChanged`, `signIn`) e o contexto de usuário atual.
2. Trocar por Supabase Auth + rotas do `apps/api` (`login.route.ts`, refresh token). Aproveitar `apps/web/src/contexts/AuthContext.tsx` e `apps/web/src/lib/api-client.ts` como base — copiar para `src/` e adaptar (é o único sentido permitido: apps/web → src).
3. Manter RBAC: roles do JWT v2 alimentam as mesmas verificações de UI que existiam.
4. Migrar os usuários: script `scripts/etl/migrate-auth-users.ts` (Firebase Auth export → Supabase `users` com senha resetável ou fluxo "definir nova senha no primeiro login" — Argon2id não é compatível com hash Firebase; decidir com o Lucas se força reset ou usa hash import do Supabase).

**Critérios de aceite:**
- [ ] Login/logout/refresh funcionando no frontend legado contra `/api/v2` (teste manual + Playwright de auth adaptado).
- [ ] Nenhum import de `firebase/auth` restante no frontend.

## 🔶 S78 — Data swap: repositories Supabase + hooks colhidos + morte do apps/web
**Passos:**
1. O legado JÁ tem o padrão pronto: `src/repositories/firebase/*` e `src/repositories/supabase/*` (Customer, Ticket, Knowledge, ServiceOrder, Tenant). Localizar a factory/injeção que escolhe a implementação e **virar a chave para Supabase**. Completar as implementações Supabase que estiverem defasadas em relação às Firebase (comparar método a método).
2. Páginas que falam com endpoints Express (`/api/v1`, `/api/cobrai` etc.): repontar para os equivalentes `/api/v2` via `api-client`. Onde não houver equivalente v2 ainda, criar a rota no `apps/api` (fina, sobre os services existentes) — listar as rotas criadas na entrada do PROGRESS_LOG.
3. Colher de `apps/web`: `useWebSocket.ts` (canal Redis pub/sub), `useChat.ts` (SSE streaming), hooks React Query. Integrar no chat/dashboard legados.
4. Remover chamadas client-side diretas ao Gemini (`gemini.ts` no browser) — toda IA passa pelo backend v2.
5. **Deletar `apps/web`** (após confirmar que nada mais importa dele) e mover os testes E2E úteis de `apps/web/e2e` para `e2e/` na raiz, apontando para o frontend legado.

**Critérios de aceite:**
- [ ] Frontend inteiro operando com Firestore client DESLIGADO (remover config web do Firebase e navegar pelas 22 páginas sem erro de console).
- [ ] Chat com streaming SSE + indicador WebSocket funcionando na UI legada.
- [ ] `apps/web` não existe mais; Playwright roda contra o frontend legado.

---

# FASE 5 — WORKERS OPERACIONAIS (portar 9 workers para packages/queue)

> Padrão para TODOS: ler o worker legado inteiro → mini-inventário no topo do arquivo novo →
> port sobre BullMQ + Supabase + Sentry (`addSentryToWorker`) + DLQ (`setupDLQ`) → teste unitário →
> registrar no bootstrap de workers → desligar o legado correspondente.

## 🔶 S79 — Workers de atendimento: `slaWorker`, `fcrWorker`, `snoozeWorker`
- SLA: monitora `conversations`/`tickets` abertos, escala por tempo (usar `escalateConversation` + notificação WS). *(dossiê item 84)*
- FCR (first contact resolution): métrica pós-conversa gravada em `ai_performance_logs`.
- Snooze: reagendamento de follow-ups.
- [ ] 3 workers portados, testados, legados desligados.

## 🔶 S80 — Workers de gestão: `reportWorker`, `gamificationWorker`, `planSyncWorker`
- Reports: relatórios agendados via DuckDB (não bater no Postgres transacional). *(itens 85/90 parciais)*
- Gamification: ranking de operadores. PlanSync: sincroniza planos tenant↔ERP.
- [ ] 3 workers portados, testados, legados desligados.

## ⬜ S81 — Workers de percepção: `visionProcessor`, `siteScrapeWorker`, `erpSyncWorker`
- Vision: já parcialmente coberto na S73 — consolidar aqui o processamento assíncrono em lote. *(item 78)*
- SiteScrape: ingestão do site do ISP para o RAG (cheerio já é dependência).
- ErpSync: sincronização em massa de cadastros ERP→Supabase. *(itens 39/40)*
- [ ] 3 workers portados, testados, legados desligados.

---

# FASE 6 — CUTOVER FINAL

## ⬜ S82 — Fastify primário; adeus Express + Firestore
**Pré-condição dura:** S74, S76, S77, S78, S79–S81 concluídas = NADA em produção depende de Express/Firestore.

**Passos:**
1. Servir o build do frontend (Vite) pelo Fastify (`@fastify/static`) ou por CDN/Vercel — decidir pelo caminho já usado no deploy atual.
2. `package.json`: `dev`/`start` passam a apontar para o `apps/api` (cluster). Fastify volta a ter `process.exit(1)` em erro de boot (reverter a mitigação da S68).
3. Rodar delta-sync final (S70) → congelar escrita no Firestore → verificação final de contagens.
4. Deletar: `server.ts` raiz, `src/routes/*`, `src/workers/*`, `src/lib/db.ts`, `src/lib/firebaseAdmin.ts`, `gemini.server.ts`, `functions/`, `firebase*.json`, `firestore.rules`, deps `firebase`/`firebase-admin`/`express` do package.json. **O frontend em `src/` (pages, components, hooks, repositories/supabase, store) FICA.**
5. Exportar backup completo do Firestore para R2 antes de desligar o projeto Firebase (retenção 12 meses).

**Critérios de aceite:**
- [ ] `npm run dev` sobe só o Fastify e o produto inteiro funciona (smoke manual nas 22 páginas + fluxo WhatsApp real).
- [ ] `grep -ri "firebase" src/ apps/ packages/ --include="*.ts*"` → zero resultados de runtime.
- [ ] Backup Firestore no R2 verificado.

## ⬜ S83 — Saneamento do monorepo + CI/CD
1. `package.json` por workspace (fechar o débito do `TECH_DEBT.md`); raiz volta a `"dev": "turbo run dev"`.
2. Dockerfiles/compose atualizados para a topologia final (api + workers + redis + qdrant); CI roda lint→vitest→playwright→build via turbo com cache.
3. Corrigir os 5 arquivos de teste que falham por dependência de ambiente (duckdb/rag timeouts) — mocks ou tag `integration` separada do CI unitário.
- [ ] `turbo run build test` verde local e no GitHub Actions; deploy de staging automático funcionando.

---

# FASE 7 — QUALIDADE, ESCALA E GO-LIVE

## ⬜ S84 — Load + Chaos
- K6: 1000 mensagens simultâneas no webhook v2; medir p95 (<1.5s meta), throughput, perda de jobs (deve ser 0 — Outbox+DLQ).
- Chaos: derrubar Redis, Qdrant, OpenAI (via proxy) e Supabase um por vez → sistema degrada com fail-open/fallback documentado, sem perder mensagem.
- [ ] Relatório `docs/qa/LOAD_CHAOS_S84.md` com números e correções aplicadas.

## ⬜ S85 — Security audit (OWASP Top 10 + LGPD)
- Rodar `/security-review` no repo + checklist OWASP manual (authz por tenant em TODAS as rotas v2, IDOR em ids, rate limits, headers).
- LGPD: testar `deleteCustomerMemory` (Zep) + right-to-be-forgotten E2E (dossiê item 99 — criar rota se faltar).
- [ ] Zero achados críticos/altos abertos.

## ⬜ S86 — 🚦 GATE GO-LIVE
Reavaliar as North Star Metrics do `CHECKLIST_MASTER.md` com dados REAIS (agora existem): resolução autônoma, custo/conversa (Helicone), p95, jobs perdidos, custo por ISP visível.
- [ ] Gate documentado com números reais. Aprovação do Lucas registrada.

## ⬜ S87 — RAGAS + LLM-as-a-Judge + calibração do router
- Test set de ≥50 perguntas reais de ISP (extrair das conversas migradas); RAGAS ≥0.75; judge automático em cada deploy de prompt (CI job).
- Calibrar LLM Router com dados reais do shadow/produção: quais intents realmente precisam de 4o vs 4o-mini (relatório de custo antes/depois).
- [ ] RAGAS no CI; router recalibrado com evidência de economia.

## ⬜ S88 — Synthetic monitoring + dashboard de saúde por ISP
- Sonda 24/7 (cron worker): conversa sintética E2E a cada 15min por tenant piloto; alerta Sentry se falhar/latência estourar.
- Dashboard de saúde por ISP (página nova no frontend legado — exceção a R1 aprovada por ser página NOVA, não migração): status filas, custo IA, resolução autônoma, uptime WhatsApp. *(dossiê itens 85, 26)*
- [ ] Sonda ativa; dashboard populado com dados reais.

## ⬜ S89 — Feature flags por tenant + prova de 10 ISPs
- Tabela `tenant_feature_flags` + helper no backend + gate por plano *(dossiê itens 29, 86)*.
- Teste de isolamento: 10 tenants simultâneos com dados/coleções Qdrant/limites distintos; provar por teste automatizado que RLS impede vazamento cruzado (rodar `packages/db/src/tests/rls-isolation.test.sql` estendido).
- [ ] Flags funcionando; teste de isolamento no CI.

---

# FASE 8 — EXPANSÃO (produto novo em cima da base sólida)

## ⬜ S90 — Svix outbound webhooks (a antiga S68 original)
- Ativar `svix.service.ts` (já escrito): eventos `invoice.paid/overdue`, `ticket.*`, `customer.*` emitidos pelo Outbox; portal de webhooks para o ISP. *(dossiê item 38)*
- [ ] ISP de teste recebe eventos com retry e assinatura.

## ⬜ S91 — Onboarding wizard UI + automação Evolution
- Wizard no frontend legado consumindo `onboarding.service.ts` (6 etapas) + criação automática de instância Evolution API por tenant. *(dossiê itens 1, 2, 5, 10)*
- [ ] ISP novo entra sozinho do signup ao WhatsApp conectado em <30min.

## ⬜ S92 — MÓDULO NOVO: Detecção de crise massiva
- Worker que detecta pico de mensagens por região/CTO (janela deslizante no Redis) → agrupa, responde em massa com status do incidente, suprime cobrança/SLA do período, painel de crise. *(dossiê item 94)*
- [ ] Simulação de 200 mensagens iguais em 5min → 1 incidente criado, respostas agrupadas.

## ⬜ S93 — MÓDULO NOVO: Telemetria de rede (SNMP/TR-069) — MVP
- Poller SNMP para OLT/CTOs piloto → série temporal (DuckDB) → alerta proativo ("degradação na sua região") ligado ao módulo de crise. Escopo MVP: 1 fabricante, 1 ISP piloto.
- [ ] Alerta proativo disparado por degradação real/simulada antes do cliente reclamar.

## ⬜ S94 — MÓDULO NOVO: Portal do assinante white-label (PWA)
- PWA mínimo: login por CPF+contrato, 2ª via/pix, diagnóstico self-service (mesma tool da IA), acompanhar OS (função Uber básica — dossiê itens 92, 11 parcial).
- [ ] Assinante de ISP piloto pega 2ª via sem falar com ninguém.

## ⬜ S95 — MÓDULO NOVO: Voz em tempo real — MVP
- Atendimento telefônico IA (OpenAI Realtime API ou pipeline Whisper+TTS): atender, identificar cliente, consultar fatura, agendar visita; transferir para humano quando precisar. Escopo MVP: 1 número, horário comercial, PT-BR.
- [ ] Ligação de teste resolve consulta de fatura de ponta a ponta.

## ⬜ S96 — MÓDULO NOVO: Benchmarking setorial + relatórios ANATEL
- Métricas agregadas anônimas entre tenants (DuckDB) → "seu churn vs mediana do setor"; geração assistida de indicadores regulatórios (SICI/RQUAL).
- [ ] Relatório de benchmark gerado para 2+ tenants; export regulatório validado com 1 ISP.

## ⬜ S97 — Performance final + hardening
- Lighthouse ≥85/90; revisão de índices Postgres com dados reais; tuning de filas; revisão de custos (Helicone) com metas do CHECKLIST_MASTER.
- [ ] Todas as métricas de performance do checklist master verdes.

## ⬜ S98 — 🏆 GATE FINAL — ASTRUM AI ENGINE SETORIAL
Reavaliar os 10 critérios do `MAPA_SESSOES_1_a_98.md` (agora atingíveis porque há tráfego real) + varredura final do dossiê-105 (tudo que ficou aberto vira backlog pós-GA priorizado).
- [ ] 10/10 critérios com evidência por comando/relatório. Astrum é GA.

---

## APÊNDICE A — Mapa de riscos permanentes (consultar quando algo der errado)
| Risco | Mitigação no plano |
|---|---|
| Port perder comportamento do messageWorker | Inventário obrigatório S71 + shadow mode S74 |
| Erro financeiro na conversão de centavos | Validação de soma S69 + idempotência |
| Cobrança dupla durante transição | `COBRAI_ENGINE` única (S68) + monitor 48h (S76) |
| Frontend quebrar na troca de dados | Repositories já abstraídos; trocar por entidade, testar página a página (S78) |
| Rollback do cutover | Envs `ATENDIMENTO_ENGINE`/`COBRAI_ENGINE` reversíveis até S82; backup Firestore no R2 |

## APÊNDICE B — Fusão com o dossiê-105
Itens do dossiê cobertos por este plano: 1, 2, 4, 5, 10, 26, 29, 31–35, 38–40, 43, 68, 71, 78, 82, 84, 85, 86, 90, 92, 94, 99. Os demais permanecem como backlog pós-S98, a priorizar no GATE FINAL.

---
*Criado em 2026-07-01 pela auditoria completa. Este arquivo é a fonte-da-verdade da execução — o `MAPA_SESSOES_1_a_98.md` permanece como histórico das sessões 1–67.*
