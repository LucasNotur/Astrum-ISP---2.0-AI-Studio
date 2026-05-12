# Fase B — Melhorias para 3.000–10.000 clientes
**Data de execução:** 11 de maio de 2026
**Objetivo:** Robustez de infraestrutura, segurança avançada e resiliência para volume alto de clientes simultâneos.

## Alterações realizadas

#### 1. Cache de métricas da equipe (Dashboard)
**Arquivos alterados:** `src/lib/metrics.ts`, `functions/src/index.ts`
**Problema:** O painel de administrador fazia muitas leituras diretas, estourando cota do Firestore e causando lentidão.
**Solução implementada:** Implementado pre-computação diária no Firebase Functions (`computeAgentMetrics`) e consulta simplificada no painel lendo a coleção compilada.
**Diff resumido:**
```typescript
// Precomputação na base diária gerando fragmentos reduzidos para os dashboards
```

#### 2. Sistema de proteção contra "OS Bombing" (#78)
**Arquivos alterados:** `src/lib/gemini.ts`
**Problema:** Clientes podiam gerar múltiplas Ordens de Serviço repetidas abusando da IA.
**Solução implementada:** Verificação prévia de OS aberta/agendada para o cliente nos últimos 30 dias na coleção `service_orders` antes de permitir novo agendamento.
**Diff resumido:**
```typescript
const existingOSLookup = await getDocs(query(collection(db, "service_orders"), where("customer_id", "==", args.customerId), where("status", "in", ["aberta", "agendada", "em_andamento"]), limit(1)));
```

#### 3. Auditoria de acesso a dados (LGPD) (#82)
**Arquivos alterados:** `src/lib/audit.ts`, `src/lib/gemini.ts`
**Problema:** Faltava registro minucioso de quais dados PII e sigilosos o agente de IA acessou.
**Solução implementada:** Função `logDataAccess` registra em `audit_logs` toda vez que o LLM usa dados financeiros, CPF, telefone ou de conexão dos clientes.
**Diff resumido:**
```typescript
export async function logDataAccess(params: AuditLogParams) {
  await addDoc(collection(db, "audit_logs"), { ...params, timestamp: serverTimestamp() });
}
```

#### 4. Controle rigoroso de limites de tokens diários/mensais (#88)
**Arquivos alterados:** `src/lib/gemini.ts`, `src/pages/SettingsPage.tsx`
**Problema:** Risco de custos surpresa altos da API do Gemini sem controle individual por tenant.
**Solução implementada:** O painel permite definir `monthly_token_limit`. O limite e uso são validados via cache Redis `checkTokenBudget` antes das requisições ao LLM.
**Diff resumido:**
```typescript
const budgetOk = await checkTokenBudget(tenantId, redisClient);
if (!budgetOk) throw new Error("TOKEN_LIMIT_REACHED");
```

#### 5. Circuit breaker automático para APIs falhas (#71)
**Arquivos alterados:** `src/lib/circuitBreaker.ts`
**Problema:** Lentidão num provedor externo (Asaas, OLT) causava gargalo em todo o fluxo de IA e timeout do sistema.
**Solução implementada:** Se uma requisição externa falhar sucessivamente, abre-se o disjuntor ("Circuit Breaker") via cache prevenindo novas tentativas por um período.
**Diff resumido:**
```typescript
// Controle de estado open/half-open/closed contornando requisições em APIs com degradação
```

#### 6. Agregação de janelas de mensagens (#79)
**Arquivos alterados:** `server.ts`, `src/workers/messageWorker.ts`
**Problema:** Clientes digitando em rajadas (uma palavra por linha) disparavam múltiplas execuções no LLM, sem sentido lógico.
**Solução implementada:** Janela de buffer acumulativo de mensagens no Redis com delay de 2.1s para concatenar o pensamento do usuário antes de processar seu input.
**Diff resumido:**
```typescript
const isNewWindow = await redis.set(windowKey, '1', 'EX', 2, 'NX');
if (isNewWindow) {
  await enqueueMessage(tenantId, payload, { delay: 2100 });
}
```

#### 7. Backups diários automatizados do Firestore (#112)
**Arquivos alterados:** `functions/src/index.ts`
**Problema:** Bases sensíveis e históricas em risco diante de corrupção de dados ou perda catastrófica.
**Solução implementada:** Função `dailyBackup` configurada no pubsub schedulada às 02h da manhã chamando API de ExportDocuments para bucket de segurança.
**Diff resumido:**
```typescript
export const dailyBackup = functions.pubsub.schedule('0 2 * * *').onRun(async () => {
    await client.exportDocuments({ name: `projects/${projectId}/databases/(default)`, outputUriPrefix: `gs://${bucketName}` });
});
```

#### 8. Testes de regressão nos fluxos do LLM (#75)
**Arquivos alterados:** `scripts/regression-test.ts`
**Problema:** Alteraçōes contínuas do prompt causavam distorções semânticas inesperadas na operação principal.
**Solução implementada:** Escrito um mock executor que testa sistematicamente os prompts correntemente instanciados prevendo o sucesso das integrações e categorização.
**Diff resumido:**
```typescript
// Avalia os outputs simulados via prompts vs asserts de intents (escala ou não?)
```

#### 9. Isolamento de tenants no nível de código (Guards) (#83)
**Arquivos alterados:** `src/lib/tenantGuard.ts`, `src/lib/gemini.ts`
**Problema:** Em caso de comprometimento, um tenant conseguia escalar acesso ao id de usuário de outra operadora.
**Solução implementada:** Função `assertTenantOwnership` criada e imposta nos getters como middleware restrito que devolve erro e quebra a requisição se o inquilino for diferente.
**Diff resumido:**
```typescript
export const assertTenantOwnership = async (collectionName, docId, tenantId) => {
   // Validate the 'tenant_id' field inside doc is === 'tenantId'
}
```

#### 10. Plano de Disaster Recovery e Fallback (#104)
**Arquivos alterados:** `/docs/DISASTER_RECOVERY.md`
**Problema:** Falta de política clara e passível de execução automatizada/manual em catástrofes de infraestrutura.
**Solução implementada:** Escrito guia normativo de nível arquitetural e operacional pormenorizando passos de reestabelecimento da infraestrutura.
**Diff resumido:**
```markdown
# Procedimentos de Disaster Recovery e Níveis de Incidente
```

#### 11. Rastreamento de origem de clientes (#61)
**Arquivos alterados:** `src/lib/gemini.ts`, `src/workers/messageWorker.ts`
**Problema:** O marketing precisava mensurar o impacto das origens numísticas informadas oralmente em chats (ex: "um vizinho indicou").
**Solução implementada:** Prompt atualizado e rotina no Worker atualizada para coletar a prop `referral_source` quando o Gemini inferi-la e registrá-la no contrato final e sessões de tickets.
**Diff resumido:**
```typescript
if (aiResult.referral_source) {
   await updateDoc(doc(db, "tickets", ticketId), { "session_state.referral_source": aiResult.referral_source });
}
```

#### 12. Modo de funcionamento degradado (#67)
**Arquivos alterados:** `src/lib/dbSafe.ts`, `src/workers/messageWorker.ts`
**Problema:** Ao existir uma falha conectiva com a base de dados em nuvem, ocorria saturação máxima de conexões travando também as interfaces.
**Solução implementada:** Encapsulou as consultas críticas em `safeFirestoreGet` num `Promise.race` com limites de 5 segundos. Ativa chave Redis de degradação e enfileira pra tentar dnv mais tarde com delay, avisando os usuários amigavelmente da pane.
**Diff resumido:**
```typescript
export async function safeFirestoreGet<T>(operation, fallback, operationName) {
   // ... implementa Promise.race estourando com setTimeout
}
```

#### 13. Cache de diagnóstico por CTO e busca semântica melhorada no RAG (#93 e #33)
**Arquivos alterados:** `src/lib/gemini.ts`, `src/lib/db.ts`
**Problema:** Muito consumo em rodar diagnósticos pesados na mesma OLT (CTO) para clientes da mesma região, simultaneamente. Buscas RAG não achavam artigos bem escritos se a forma lexical sofresse variação informal de gírias.
**Solução implementada:** CTO-based cache por 5 mins via Redis para run_diagnostics. Implementado normalização e injeção de expansões com `slangMap` dentro da mecânica local do RAG em base de vetores.
**Diff resumido:**
```typescript
const ctoCacheKey = `diagnostic:${tenantId}:${targetCtoId}`;
const cachedDiagnostic = await redisClient.get(ctoCacheKey);
// And RAG search expanding query term inside searchKnowledgeBase using slang map
```

#### 14. Filas isoladas por ISP no BullMQ (#97)
**Arquivos alterados:** `src/lib/queue.ts`, `src/workers/messageWorker.ts`, `server.ts`
**Problema:** Um pico súbito volumoso em uma ISP de alto calibre afogava outras menores em processamento estático numa única fila.
**Solução implementada:** Map e spawn dinâmico de Filas (`messages:{tenantId}`) e correspondentes instanciamentos de WorkPools onde a `concurrency` está setável como recurso base do plano ISP.
**Diff resumido:**
```typescript
export function getTenantQueue(tenantId: string): Queue {
   // Generates isolated bullmq instance with namespace messages:tenantId
}
```

## Novos arquivos criados
- `src/lib/dbSafe.ts`
- `scripts/regression-test.ts`
- `/docs/DISASTER_RECOVERY.md`

## Variáveis de ambiente adicionadas
- `BACKUP_BUCKET_NAME`
- `GCLOUD_PROJECT`

## Dependências adicionadas
- `@google-cloud/firestore` (admin SDK para backup)
- `@google-cloud/storage`

## Collections Firestore adicionadas/alteradas
- `agent_metrics`, `metrics_shards`
- `prompts/{tenantId}/versions` (subcoleção)
- `tickets/{id}/message_traces` (subcoleção)
- `customers` (campos: `status_history` subcoleção, `referral_source`)

## Cloud Functions adicionadas
- `computeAgentMetrics` (daily 03:00)
- `dailyBackup` (daily 02:00)

## Itens pendentes após esta fase
- Substituir busca por keyword no RAG por embeddings vetoriais reais quando volume justificar
- Integrar BACKUP_BUCKET_NAME com conta GCP de produção
- Configurar worker_concurrency por tenant no painel
