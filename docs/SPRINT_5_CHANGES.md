# Sprint 5 — Experiência e Qualidade do Atendimento
**Data de execução:** 10 de maio de 2026
**Objetivo:** Elevar a qualidade percebida do atendimento — linguagem adaptada, detecção de frustração, CSAT e segurança multi-tenant.

## Alterações realizadas

### 1. Adaptação de Linguagem e Empatia Forçada
**Arquivos alterados:** `src/lib/gemini.ts`
**Problema:** A IA utilizava sempre o mesmo tom de voz genérico para todos os clientes, independentemente de como o cliente se comunicava ou do seu nível de estresse.
**Solução implementada:** O LLM classificador (Orchestrator) agora avalia o registro linguístico (formal, informal, técnico). O estado `session_state.register` e `session_state.force_empathetic` ajusta o prompt do agente final.
**Diff resumido:**
```typescript
if (sessionState?.register === "informal") {
  activePrompt += "\nO cliente está usando uma linguagem mais solta. Aproxime o tom...";
}
if (sessionState?.force_empathetic) {
  activePrompt += "\nO cliente apresentou frustração. Seja altamente empático...";
}
```

### 2. Monitoramento de Frequência e Risco de Churn
**Arquivos alterados:** `src/lib/gemini.ts`
**Problema:** Clientes reincidentes tinham que repetir todo o contexto. Usuários vulneráveis não recebiam prioridade.
**Solução implementada:** Injetado `customer_frequency` para clientes que abriram múltiplos tickets recentes e gerada tag `churn_risk` se há alta taxa de insatisfação.
**Diff resumido:**
```typescript
const recentTickets = await getDocs(query(
  collection(db, 'tickets'),
  where('customerId', '==', customerData.id),
  where('tenant_id', '==', tenantId),
  where('createdAt', '>=', Timestamp.fromDate(thirtyDaysAgo))
));
if (recentTickets.size >= 3) {
  sessionStateObj.customer_frequency = { isFrequent: true, count: recentTickets.size };
}
```

### 3. Detecção de Loops e Escalonamento
**Arquivos alterados:** `src/lib/gemini.ts`
**Problema:** A IA entrava em loops infindáveis quando falhava ao resolver o fluxo do cliente.
**Solução implementada:** Utilização de `loop_detected` e `loop_count` no `session_state`. Se o count chegar a 3, a IA impõe o `escalation_reason = 'LOOP_DETECTED'` para transbordo humano.
**Diff resumido:**
```typescript
if (sessionState.loop_detected && sessionState.loop_count >= 3) {
  finalResult.shouldEscalate = true;
  finalResult.escalation_reason = 'LOOP_DETECTED';
}
```

### 4. Coleta Automática de CSAT (WhatsApp)
**Arquivos alterados:** `server.ts`, `src/workers/messageWorker.ts`, `src/lib/db.ts`
**Problema:** O feedback sobre o atendimento não era coletado diretamente após a resolução.
**Solução implementada:** Criação do job `send_csat` via BullMQ no endpoint `/api/jobs/schedule-csat`. A worker agenda e envia o template HSM. Quando o usuário responde 1-5, o webhook salva em `csat_ratings`.
**Diff resumido:**
```typescript
app.post("/api/jobs/schedule-csat", async (req, res) => {
  await messageQueue.add('send_csat', { ticketId, customerId, tenantId, category }, { delay: 60000 });
});
```

### 5. Isolamento Multi-Tenant em Queries e Tools
**Arquivos alterados:** `src/lib/tenantGuard.ts`, `src/lib/gemini.ts`
**Problema:** Possível vazamento onde tenant A poderia consultar dados (tools) do tenant B simplesmente forçando o LLM com IDs avulsos.
**Solução implementada:** Função `assertTenantOwnership` para validar `tenant_id` ativamente antes da IA acessar. Injeção de `where("tenant_id", "==", tenantId)` nas queries de DB.
**Diff resumido:**
```typescript
export async function assertTenantOwnership(collectionName, docId, expectedTenantId) {
  const docSnap = await getDoc(doc(db, collectionName, docId));
  if (docSnap.data()?.tenant_id !== expectedTenantId) throw new Error('TENANT_MISMATCH');
  return docSnap.data();
}
```

### 6. Isolamento Seguro da Base de Conhecimento (RAG)
**Arquivos alterados:** `src/lib/db.ts`, `src/lib/gemini.ts`
**Problema:** O RAG buscava em toda a collection `knowledge_base` sem restrição de tenant, vazando políticas de outros provedores.
**Solução implementada:** A ferramenta genérica injeta e checa obrigatoriamente `tenant_id` e filtra `rawResults.filter(r => r.tenant_id === tenantId)`.
**Diff resumido:**
```typescript
export const searchKnowledgeBase = async (searchTerm: string, tenantId: string = "default") => {
  // ... fetch docs
  return rawResults.filter(r => r.tenant_id === tenantId);
};
```

## Novos jobs BullMQ
- `send_csat`: Dispara pesquisa de satisfação 1 minuto após o fechamento do ticket.

## Collections Firestore adicionadas
- `csat_ratings`: Centraliza avaliações, incluindo score (1 a 5), quem resolveu (bot/human) e categoria.
- `security_events`: Registra anomalias como o erro de `TENANT_MISMATCH`.

## Templates HSM adicionados
- `csat_rating`: Menu interativo numérico para escolha de 1 a 5 estrelas.

## Campos adicionados em customers
- `last_csat_score`
- `last_csat_at`
- `churn_risk`
- `engagement.monthly_contacts`

## Pontos de atenção
- O tenant_id segue tipado/injetado como `"default"` na maioria dos flows da IA, mas o alicerce multi-tenant agora é forçado em toda extração de dados. Será preciso escalar o repasse real do tenant nos webhooks do WhatsApp e do banco em sprints futuros de autenticação B2B.
- As atualizações massivas de score do CSAT impactarão a contagem das tags de priorização de leads, cabendo uma consolidação nas métricas do Dashboard (para ver score médio do atendente humano vs IA).
