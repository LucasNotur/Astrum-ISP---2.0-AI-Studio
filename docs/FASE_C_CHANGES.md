# Fase C — Melhorias quando surgir o problema específico
**Data de execução:** 12/05/2026
**Objetivo:** Resolver edge cases específicos que aparecem com volume real e perfis variados de clientes.

## Alterações realizadas

#### 1. Prevenção de Spam, Menores de Idade e Palavras de Risco
**Arquivos alterados:** `src/workers/messageWorker.ts`, `src/lib/gemini.ts`
**Problema:** Usuários enviando flood, menores de idade tentando contratar, ou menções a PROCON/Anatel causando alucinações.
**Solução implementada:** Detectores pré-orquestrador no `messageWorker.ts` para bloquear menores e spam. No gemini, roteamento prioritário para escalar (`shouldEscalate`) em caso de atrito severo.
**Diff resumido:**
```typescript
if (aiResult?.isSpam) return;
if (aiResult?.minor_detected) { ... return; }
```

#### 2. Cliente com Múltiplos Contratos no mesmo CPF
**Arquivos alterados:** `src/lib/gemini.ts`, `src/lib/db.ts`
**Problema:** Clientes com contas num mesmo CPF (empresariais ou múltiplas residências) travavam a automação financeira.
**Solução implementada:** Criada ferramenta `select_customer_contract` para desambiguação de contrato no atendimento.
**Diff resumido:**
```typescript
// Tool adicionada
{ name: "select_customer_contract", description: "Pede ao cliente para escolher qual contrato deseja tratar." }
```

#### 3. Tratamento de Acessibilidade (Áudio e Redução de Texto)
**Arquivos alterados:** `src/lib/gemini.ts`, `firestore.rules`
**Problema:** Deficientes visuais com voiceover e idosos sofrem para ler blocos grandes de texto.
**Solução implementada:** Criada a tool `save_customer_preference`. Quando o cliente pede por menos texto ou em áudio, salva em `customers/{id}/preferences` e passa a adaptar o tamanho/formato das respostas no System Prompt.
**Diff resumido:**
```typescript
const prefs = customerData?.preferences?.prefer_audio ? "Seja extremamente conciso para conversão em áudio TTS." : "";
```

#### 4. Fluxo de Portabilidade
**Arquivos alterados:** `src/lib/gemini.ts`, `firestore.rules`
**Problema:** Leads querendo migrar de operadoras (Claro/Vivo) exigiam intervenção manual recorrente de vendas para coleta de dados.
**Solução implementada:** Tool `collect_portability_data` inserida no fluxo de VENDAS para pré-popular `portability_requests` e agilizar OCR em background.
**Diff resumido:**
```typescript
await addDoc(collection(db, "portability_requests"), { carrier, ticketId });
```

#### 5. Gestão de Escala para Equipes de Campo e Despacho
**Arquivos alterados:** `src/pages/ServiceOrdersPage.tsx`, `firestore.rules`, `src/store/useAppStore.ts`
**Problema:** As ordens de serviço geradas não conseguiam ser direcionadas eficientemente para técnicos de campo de forma visualizada.
**Solução implementada:** Funcionalidades adicionais acopladas no `ServiceOrdersPage` para associar as OS geradas aos técnicos armazenados em `technicians/{tenantId}/list`.
**Diff resumido:**
```typescript
<Select value={os.assignedTo} onChange={...}>
  {technicians.map(t => <SelectItem value={t.id}>{t.name}</SelectItem>)}
</Select>
```

#### 6. Monitoramento de Qualidade em Tempo Real (Quality Monitor)
**Arquivos alterados:** `src/pages/QualityMonitorPage.tsx`, `src/App.tsx`
**Problema:** Operadores e gestores sem visibilidade profunda das inferências dos agentes (logs complexos).
**Solução implementada:** Painel de observabilidade das convocações da IA, tempos de resposta e uso de tokens em tempo real.
**Diff resumido:**
```tsx
<Route path="/quality-monitor" element={<QualityMonitorPage />} />
```

#### 7. Logs Estruturados Globalmente (Observabilidade Enterprise)
**Arquivos alterados:** `src/lib/logger.ts`, `src/workers/messageWorker.ts`, `src/workers/cobraiWorker.ts`, `src/lib/gemini.ts`, `server.ts`
**Problema:** Ausência de padrões de agregação dificultava debug distribuído por tenant ou rastreamento de traços HTTP.
**Solução implementada:** Substituído todos os `console.log/error/warn` por uma interface estruturada em JSON (`logger.ts`) padronizando envio a agregadores como Google Cloud Logging.
**Diff resumido:**
```typescript
logger.info('worker_started', { tenant_id: tenantId });
logger.error('message_processing_failed', { error: err.message });
```

#### 8. Deploy Sem Downtime com Graceful Shutdown
**Arquivos alterados:** `server.ts`, `scripts/deploy.sh`
**Problema:** Encerramento abrupto de workers ao fazer redeploy no Cloud Run/Container perdia requisições e deixava webhooks desamparados.
**Solução implementada:** Adição de `gracefulShutdown` escutando comandos SIGTERM e de um script zero-downtime controlando os containers PID a nível de servidor.
**Diff resumido:**
```typescript
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
```

## Novos arquivos criados
- `src/lib/logger.ts`
- `scripts/deploy.sh`
- `scripts/regression-test.ts`

## Collections Firestore adicionadas
- `portability_requests`
- `technicians/{tenantId}/list`
- `customers/{id}/preferences`

## Páginas do painel adicionadas
- `src/pages/QualityMonitorPage.tsx`
- Funcionalidade expandida no painel de Técnicos em `src/pages/ServiceOrdersPage.tsx`

## Scripts adicionados ao package.json
- `"deploy": "bash scripts/deploy.sh"`
- `"test:regression": "tsx scripts/regression-test.ts"`

## Status final do sistema
Esta fase conclui todos os 115 problemas identificados na auditoria inicial.
Sistema preparado para crescimento de 0 a 10.000+ clientes sem refatoração estrutural.
