# Inventário de Comportamento — messageWorker legado (1605 linhas)

> Plano Mestre V2, S71 (entregável obrigatório). Fonte: `src/workers/messageWorker.ts`.
> Cada item é um comportamento a ser reproduzido no port (`packages/queue/src/workers/message.worker.ts`
> + `apps/api`). Marcado quando portado E testado nas S72/S73.
> Legenda: ⬜ pendente | 🔶 parcial | ✅ portado+testado | ❌ descartado (com justificativa)

## A. Tipos de job (o worker é multiplexado por `job.name`)
- [ ] A1. `pos_instalacao` — follow-up D+1 pós-instalação; varia texto se houve ticket nas últimas 24h *(S79/SLA-adjacente)*
- [ ] A2. `sla_warning` — avisos de SLA nível 1/2; cancela se `human_responded`; notifica gerente no nível 2 *(S79)*
- [ ] A3. `send_whatsapp_text` — envio simples de texto *(S72)*
- [ ] A4. `send_csat` — dispara pesquisa CSAT (1–5), marca `awaiting_csat` no ticket *(S79/FCR)*
- [ ] A5. mensagem inbound normal (sem `job.name` especial) — fluxo principal *(S72/S73)*

## B. Resiliência de rede (Evolution API) — `safeEvoFetch`
- [ ] B1. Pausa por risco de ban: se `pause_jobs:{instance}` no Redis → lança e não envia
- [ ] B2. Circuit breaker: se `circuit_breaker:{instance}` setado → falha rápida; abre breaker (EX 60s) após falha total
- [ ] B3. Retry com backoff exponencial (3 tentativas; só em 429/5xx; 4xx não-retryable)
- [ ] B4. `checkBanSignal(res)` após cada resposta (heurística anti-ban do WhatsApp)

## C. Envio humanizado
- [ ] C1. `sendTyping` — presença "composing" antes de cada chunk (delay 1500ms)
- [ ] C2. `sendChunked` — quebra a resposta por sentença em blocos ≤300 chars; typing + 800ms entre blocos
- [ ] C3. Coleta `evoMsgIds` das mensagens enviadas (para rastreio/revogação)

## D. Deduplicação e concorrência
- [ ] D1. Skip se `revoked:{messageId}` no Redis (mensagem apagada pelo cliente)
- [ ] D2. Lock distribuído `processing_lock:{tenant}:{remoteJid}` (Redis SET NX EX 30)
- [ ] D3. Lock em processo `processingNumbers` Map (serializa por telefone na mesma instância)
- [ ] D4. Agregador por buffer (`bufferKey`): junta mensagens picadas do cliente num só texto; consome e apaga o buffer

## E. Modo degradado / manutenção
- [ ] E1. Se `system_degraded` no Redis → responde mensagem de instabilidade e re-enfileira com delay 120s
- [ ] E2. `incrementShardedCounter('messages_today')` — métrica de volume por tenant (contador shardeado)

## F. Mídia
- [ ] F1. Áudio → `downloadAndTranscribeAudio` (Whisper); prefixa `[Mensagem de voz transcrita]`; fallback pede reenvio em texto *(S73)*
- [ ] F2. Imagem → `imageMessage` processada por visão *(S73)*
- [ ] F3. Documento (`isDocument`) *(S73)*

## G. Fluxo de ticket / sessão
- [ ] G1. Encontrar ticket aberto/escalado existente por cliente OU criar novo *(S72)*
- [ ] G2. Reabertura: heurística por `createdAt`/`resolvedAt` do último ticket
- [ ] G3. Se `aiEnabled === false` OU `status === 'escalated'` → NÃO responde com IA (humano no controle) *(S72)*
- [ ] G4. Detecção de resposta de CSAT: se `awaiting_csat` e cliente manda número 1–5 → grava `csat_ratings`, `last_csat_score`; cria tag/ticket em nota baixa *(S79)*
- [ ] G5. Agendamento de CSAT ao resolver (`POST /api/jobs/schedule-csat`), `resolved_by` bot|human *(S79)*

## H. Cérebro de IA
- [ ] H1. `sanitizeUserInput` (guardrails legado) antes do LLM → mapear para `guardrails.pipeline` novo *(S72)*
- [ ] H2. `getAIResponse` (gemini.server) com histórico ordenado por `createdAt` → mapear para LangGraph+vercel-ai *(S72)*
- [ ] H3. Persona por instância (`ai_persona_id` / persona default do tenant) → `system-prompt-builder` *(S72)*
- [ ] H4. Tool calling: `aiResult.tools_called` — persistir e agir *(S72, ligar às tools reais)*
- [ ] H5. TTS opcional por persona (`tts_enabled`) — responder em áudio *(S73, opcional)*

## I. Escalação
- [ ] I1. Regras de escalação por tenant (`escalation_rules/{tenant}/rules`, active) — avaliar e casar *(S72)*
- [ ] I2. Ação `escalate_to_human` → muda ticket para `escalated`, notifica operador *(S72)*
- [ ] I3. Persistência da resposta da IA na subcoleção de mensagens do ticket → `messages` novo *(S72)*

## J. Bootstrap
- [ ] J1. `startWorkers`: um `Worker('messages-{tenantId}')` por tenant ativo, concorrência por tenant (`worker_concurrency`, default 3)
      → no novo: fila única `astrum:messages` com `tenantId` no payload (ver decisão no port)
- [ ] J2. Modo mock (sem Redis real) via `mockQueueEmitter`

---

## Decisões de arquitetura no port
1. **Fila por tenant → fila única com tenantId.** O legado cria uma fila BullMQ por tenant. O novo
   usa `astrum:messages` única com `tenantId` no job (mais simples e já é o padrão do `message.worker.ts`).
   Isolamento continua garantido por RLS + `tenantId` explícito em toda query.
2. **Jobs especiais (A1–A4) NÃO vão para o message.worker novo.** São responsabilidades de outros
   workers na arquitetura nova: `pos_instalacao`/`sla_warning` → SLA worker (S79); `send_csat`/CSAT →
   FCR worker (S79). O `message.worker` novo cuida só do inbound (A5). Marcados aqui para rastreio cruzado.
3. **Locks:** manter D1–D4 no novo (Redis já disponível via `redis.client.ts`).
4. **Firestore → Supabase** em toda persistência (tickets, messages, csat_ratings, notifications).

## Rastreio de progresso
- Total de itens: 32. Portados: 0. (Atualizado a cada sessão S72/S73/S79.)
