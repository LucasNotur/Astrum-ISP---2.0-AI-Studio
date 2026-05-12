# Sprint 3 — Endurecimento WhatsApp + CobrAI
**Data de execução:** 10 de maio de 2026
**Objetivo:** Garantir operação segura do canal WhatsApp e da cadência CobrAI em escala, com conformidade Meta e LGPD.

## Alterações realizadas

### 1. Indicador de Digitação (Typing Indicator) no Evolution API
**Arquivos alterados:** `src/workers/messageWorker.ts`
**Problema:** Bot parecia artificial por responder instantaneamente sem mostrar "digitando...", causando confusão em respostas assíncronas.
**Solução implementada:** Injetada nova validação visual via API REST do Evolution API (`chat/sendPresence`) com estado `composing`, para criar percepção orgânica à espera do LLM processar.
**Diff resumido:**
```diff
+ async function sendTyping(remoteJid: string, url: string, instance: string, key: string) {
+   try {
+     await fetch(`${url}/chat/sendPresence/${instance}`, { ... });
+   } catch { /* Falha silenciosa */ }
+ }
```

### 2. Chunking de Mensagens Longas (Anti-Ban Meta)
**Arquivos alterados:** `src/workers/messageWorker.ts`
**Problema:** Respostas maiores que 300 caracteres (especialmente KBs detalhados) disparam spam metrics no WhatsApp Business.
**Solução implementada:** Criada a função `sendChunked` que pega a resposta completa da IA, fatiando por pontuação e enviando sequencialmente, com delay injetado de 800ms entre as frases, simulando digitação humana.
**Diff resumido:**
```diff
+ if (whatsappFormattedMessage.length > 300) {
+   await sendChunked(whatsappFormattedMessage, remoteJid, evoUrl, evoInstance, evoApiKey);
+ } else {
    // fluxo original
+ }
```

### 3. Agregação Temporal de Mensagens (Message Window)
**Arquivos alterados:** `server.ts`, `src/workers/messageWorker.ts`
**Problema:** O cliente frequentemente manda textos divididos em várias linhas ("oi", "tudo bem?", "como faço x?"). O processamento acontecia no primeiro "oi", desorganizando o raciocínio.
**Solução implementada:** Redis buffer e janela atrasada dinâmico. O Webhook armazena os blocos no REDIS (`msg_buffer`) por um tempo restrito e agenda o BullMQ assíncrono para 2.1s à frente se uma nova janela temporal foi iniciada. No worker o buffer inteiro é concatenado.
**Diff resumido:**
```diff
+ const buffer = existing ? JSON.parse(existing) : [];
+ buffer.push({ id, text: textContent, timestamp: Date.now(), ... });
...
+ const isNewWindow = await redis.set(windowKey, '1', 'EX', 2, 'NX');
+ if (isNewWindow) {
+   await messageQueue.add("process-message", { remoteJid, bufferKey }, { delay: 2100 });
+ }
```

### 4. Circuit Breaker do Webhook Evolution (Early 503)
**Arquivos alterados:** `server.ts`
**Problema:** Durante desconexões do WhatsApp, as mensagens poderiam reter processamentos fantasmas no Worker gerando loop, acúmulos na fila ou penalização por requests em dead-end.
**Solução implementada:** Incorporado cache Healthcheck no webhook apontando para o status da instância, barrando requests sem prosseguimento com código 503 se o bot estiver "disconnected".
**Diff resumido:**
```diff
+ let healthStatus = await redis.get(cacheKey);
+ if (healthStatus !== 'open' && healthStatus !== 'unknown') {
+   return res.status(503).json({ error: "Service Unavailable" });
+ }
```

### 5. Mecanismo de Rate Limit e Concorrência na CobrAI
**Arquivos alterados:** `src/workers/cobraiWorker.ts`
**Problema:** Jobs paralelos enviando mensagens simultâneas da mesma tenant geravam bloqueio temporário e flag de disparo massivo no Meta.
**Solução implementada:** Implementado trava rigorosa com concorrência = 1 e delay (backoff por hora). O script barra excedentes de taxa usando `COBRAI_HOURLY_LIMIT` retornando retry atrasado via fila.
**Diff resumido:**
```diff
+ const sentThisHour = await redis.incr(rateLimitKey);
+ if (sentThisHour > limitEnv) {
+   await cobraiQueue.add('retry', job.data, { delay: 3600000 });
+ }
```

### 6. Mock Memory Reducer local
**Arquivos alterados:** `src/lib/redis.ts`, `src/lib/queue.ts`
**Problema:** Crashes no CI e ambientes sem o Redis em execução devido à conexão recusa `ECONNREFUSED 127.0.0.1:6379`.
**Solução implementada:** Criação de interface abstrata (Local Redis Mock) transparente substituindo bullmq. Sem servidor online, a classe opera sob JS RAM store baseada em tempo usando timer nativo.
**Diff resumido:**
```diff
+ const isLocalRedis = !process.env.REDIS_URL || process.env.REDIS_URL.includes('localhost');
```

## Arquivos novos criados
- `/docs/SPRINT_3_CHANGES.md` (Este arquivo com todo documento detalhado da atualização).

## Collections Firestore alteradas
- Adicionado campo `whatsapp_health` aos dados do documento `tenants` (utilizado como ponte de verificação entre falhas e Webhook circuit breaker).

## Variáveis de ambiente adicionadas
- `COBRAI_HOURLY_LIMIT`: Teto limite por hora em cada inquilino de envios permitidos para prevenção contra bloqueio do chip.
- `WORKER_CONCURRENCY`: Número local de threads alocadas para pool redis/filas.

## Dependências adicionadas
- (Nenhuma nova lib de escopo extra para Sprint 3; atualizações internas via BullMQ e IORedis contidas)

## Pontos de atenção para próximos sprints
- O Webhook local continua não autenticado entre os microsserviços se não providenciado HMAC.
- Necessário evoluir a tela Web UI sobre métricas das filas.
- Necessidade de implementar persistência de Dead Letter Queue para visualização no Firebase.
