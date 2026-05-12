# Sprint 1 — Fundação de Escala
**Data de execução:** 2026-05-10
**Objetivo:** Garantir que o sistema aguenta carga real antes de qualquer escala.

## Alterações realizadas

### 1. Atualização do `lastMessageAt` e `session_state` do ticket
**Arquivos alterados:** `src/lib/gemini.ts`
**Problema:** O ticket não atualizava corretamente o timestamp da última mensagem e o estado da sessão ao fim da chamada da IA.
**Solução implementada:** Inserimos a atualização do Firestore usando `updateDoc` manipulando dinamicamente os campos de `session_state`.
**Diff resumido:**
```diff
+  if (ticketId && finalResult?.session_state_update) {
+    try {
+      const { doc, updateDoc, serverTimestamp } = await import("firebase/firestore");
+      const updates: any = { "lastMessageAt": serverTimestamp() };
+      // Atribuição condicional das propriedades do session_state...
+      await updateDoc(doc(db, "tickets", ticketId), updates);
+    } catch (e) {
+      console.error(e);
+    }
+  }
```

### 2. Implementação de Fila com BullMQ + Redis
**Arquivos alterados:** `server.ts`, `src/lib/queue.ts`, `src/workers/messageWorker.ts`
**Problema:** O webhook dependia de um processamento síncrono da API do Gemini, o que causava timeouts na Evolution API em picos de mensagens.
**Solução implementada:** Refatoração do handler do webhook para apenas enfileirar o payload (`enqueueMessage`), com o arquivo `messageWorker.ts` consumindo a fila assincronamente (com limitação de concorrência definida via `WORKER_CONCURRENCY`).
**Diff resumido:**
```diff
-      const aiResult = await getAIResponse(historyBuffer, undefined, customerDataForAi);
-      // Respond immediately...
+      const { enqueueMessage } = await import("./src/lib/queue");
+      await enqueueMessage({ payload, messageId, remoteJid, textMessage, messageData });
+      res.status(200).json({ status: "queued" });
```

### 3. Cache Redis para Respostas Comuns do Agente SAC_GERAL
**Arquivos alterados:** `src/lib/gemini.ts`
**Problema:** Chamadas desnecessárias ao LLM para perguntas e saudações frequentes do cliente.
**Solução implementada:** Para mensagens classificadas como `SAC_GERAL` (e sem contexto crítico ou numérico sensível), um hash MD5 da mensagem é gerado para buscar a resposta predefinida no cache do Redis (TTL: 24h).
**Diff resumido:**
```diff
+          const hash = crypto.createHash("md5").update(normalizedMsg).digest("hex");
+          sacCacheKey = `sac_cache:${tenantId}:${hash}`;
+          const cachedValue = await redisClient.get(sacCacheKey);
+          if (cachedValue) {
+            chatRes = JSON.parse(cachedValue);
+            cachedHit = true;
+          }
```

### 4. Idempotência no Webhook
**Arquivos alterados:** `server.ts`
**Problema:** Duplicação de mensagens no banco de dados e gatilhos de LLM em caso de reenvio do payload pela Evolution.
**Solução implementada:** Verificação antecipada do ID da mensagem (`messageId`) contra uma chave do Redis.
**Diff resumido:**
```diff
+      const processedKey = `processed:${messageId}`;
+      const isProcessed = await redis.get(processedKey);
+      if (isProcessed) {
+        return res.status(200).json({ status: "already_processed" });
+      }
```

### 5. Mecanismo de Retry e Circuit Breaker para LLMs
**Arquivos alterados:** `src/lib/gemini.ts`
**Problema:** A instabilidade das APIs do provedor de IA ou timeouts impediam a continuidade e travavam tickets.
**Solução implementada:** Adição do wrapper `callLLMWithRetry` implementando proteção com limite de timeout, limites locais e verificação de disjuntor `circuitBreaker`.
**Diff resumido:**
```diff
+  const result = await Promise.race([fn(), timeoutPromise]);
+  circuitBreaker.failures = 0;
+  return result;
```

### 6. Isolamento e Mock de Ambiente Local para módulos do Redis
**Arquivos alterados:** `src/lib/gemini.ts`, `src/workers/messageWorker.ts`, `src/lib/queue.ts`
**Problema:** Erro ao realizar a compilação pro frontend com base nos workers (ex: módulos nativos Node "assert", "redis-errors") importados vazados na web build.
**Solução implementada:** Mock assíncrono isolado usando lazy load e condicionais baseados na ausência de opção do socket (isMockRedis).
**Diff resumido:**
```diff
+export const messageWorker = isMockRedis ? {
+  on: (event: string, handler: any) => { console.log("Mock listener"); }
+} as any : new Worker("message-processing", processMessageJob, ...
```

### 7. Conversão de Áudio com Whisper e Fallbacks de Segurança
**Arquivos alterados:** `src/workers/messageWorker.ts`
**Problema:** Envio de mídias/áudios poderia quebrar o app se a chave OpenAI faltasse ou caso ocorressem falhas convertendo payload em Base64.
**Solução implementada:** Verificação antecipada por `whisperKey` (via `openaiWhisper` isolado) ou notificação inline se não estiver mapeada.
**Diff resumido:**
```diff
+        if (!whisperKey) {
+           processedTextMessage = "[Áudio recebido, mas a chave da OpenAI não está configurada para transcrição]";
+        } else {
+           const transcription = await openai.audio.transcriptions.create({ ... });
```

### 8. Organização do Fallback para "Desative Atividades Genéricas"
**Arquivos alterados:** `src/lib/gemini.ts`
**Problema:** Casos em que as APIs falham irremediavelmente (erros nativos ex: HTTP 500 globais do banco).
**Solução implementada:** Bloco "catch" isolando falhas e retornando payload neutro informando passagem humana.
**Diff resumido:**
```diff
+    if (error.message === "Estou com uma instabilidade no momento...") {
+      finalResult = { message: error.message, shouldEscalate: false };
+    } else {
+      finalResult = { message: "Desculpe, tive um problema técnico. Vou chamar um humano.", shouldEscalate: true };
+    }
```

---

## Variáveis de ambiente adicionadas
- `REDIS_URL`: URL de conexão com a instância/cluster Redis (fundamental para Idempotência, Debounce e roteamento via BullMQ do Worker).
- `WORKER_CONCURRENCY`: Define quantas mensagens oriundas da fila `message-processing` o Node conseguirá processar em paralelo na infra. O padrão é 5.

## Dependências adicionadas
- `bullmq`: Para gerenciamento das filas (produção e consumo de jobs) baseadas no Redis, prioridades e retry robusto.
- `ioredis`: (Presumivelmente existente, porém integrado e melhorado) para cliente nativo Node acessando a API do Redis de forma não blocante e adaptável para ambiente Mock.

## Pontos de atenção para próximos sprints
- O uso de `isMockRedis` precisa ser monitorado. Ele atua bem no frontend Dev, porém recomenda-se uma arquitetura de Monorepo ou processos severos de CI/CD para separar as _builds_ de client (SPA) das _builds_ de server (Cloud Run).
- A política de limpeza da fila "dead-letter" não está automatizada.
- A função de detecção para bloqueio de cache no regex `/\d{5,}/` é bastante premissa. Possíveis problemas ao cachear tickets por variação ortográfica. Ideal adotar embedding search de baixo porte futuramente, limitando o uso extremo apenas ao cache simples atual.
