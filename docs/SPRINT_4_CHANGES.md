# Sprint 4 — Operações ISP em Escala Real
**Data de execução:** 10 de maio de 2026
**Objetivo:** Transformar o sistema de "funciona" para "opera liso" — detecção de incidente, capacidade de agendamento, confirmação D-1 e fluxo pós-instalação.

## Alterações realizadas

### 1. Detecção Pró-ativa de Massivas (NOC AI)
**Arquivos alterados:** `server.ts`, `src/lib/gemini.ts`
**Problema:** Clientes abriam chamados repetidos sobre o mesmo problema de infraestrutura (falhas de CTO/OLT), sobrecarregando a triagem de suporte.
**Solução implementada:** Rota de webhook (`/api/noc/webhook`) para recebimento de alarmes NOC (ex: PRTG, Zabbix). Em vez da IA responder cegamente e gerar tickets técnicos repetidos, criamos o bloqueio inteligente de abertura individual de ticket perante falha sistêmica detectada nas coleções `incidents`.
**Diff resumido:**
```diff
+ app.post("/api/noc/webhook", express.json(), async (req, res) => {
+   // Verificação de falhas e inserção de alerta NOC incident-level
+   await addDoc(collection(db, "incidents"), newIncident);
+ });
```

### 2. Verificação de Grade de Agendamento (Booking Inteligente)
**Arquivos alterados:** `src/lib/gemini.ts`
**Problema:** A IA costumava sugerir e marcar datas assumindo uma capacidade de agenda infinita por parte dos técnicos, propiciando overbooking.
**Solução implementada:** Inserimos na lógica das tools do agente (Vendas/Suporte) limites diários, validando a quantidade de ordens já inseridas num dado período e limitando-a com relação ao teto disponível por tenant.
**Diff resumido:**
```diff
+ const getDailyCapacity = async (dateStr: string, tenantId: string) => {
+   // Filtra agendamentos no Firestore por data e verifica viabilidade
+ }
```

### 3. Validação Constante de Limites de Projeto (Monitoramento Ativo)
**Arquivos alterados:** `server.ts`
**Problema:** A criação livre de tickets e envios estava descontrolada e dificultando auditoria via mocks.
**Solução implementada:** API foi configurada para analisar uso (quota de IA/Firebase) do provedor contra o plano estipulado.
**Diff resumido:**
```diff
+ // Múltiplas lógicas limitantes ao redor da API.
```

### 4. Identidade Simplificada de Integrações e Mock Contrato Jurídico
**Arquivos alterados:** `server.ts`, `src/lib/gemini.ts`
**Problema:** Precisávamos ter garantias sobre fechamentos e contratos com mocks parecidos com DocuSign e checagem de viabilidade CTO pré-vendas.
**Solução implementada:** Integração na IA via tools que gerencia assinaturas vitais e verifica portas em CTO antes do upgrade ou plano novo. 
**Diff resumido:**
```diff
+ // Valida capacidade da porta na CTO (check_coverage + contrato mockup)
```

### 5. Confirmação automática de Agendamento (D-1)
**Arquivos alterados:** `functions/src/index.ts`
**Problema:** Visitas técnica com alta taxa de "cliente ausente", onerando tempo logístico.
**Solução implementada:** Cloud function agendada diariamente as 18:00h para notificar sobre a visita, confirmando agendamentos. 
**Diff resumido:**
```diff
+ export const sendD1Confirmation = functions.scheduler.onSchedule('every day 18:00', async () => {
+    // Busca todas as ordens com D-1
+    // Envia WhatsApp via HSM/template
+ });
```

### 6. Roteirização Geográfica de Técnicos (Clusters de Instalação)
**Arquivos alterados:** `functions/src/index.ts`, `src/pages/ServiceOrdersPage.tsx`
**Problema:** Equipes técnicas se deslocavam com rotas aleatórias, com longos caminhos entre OS contíguas, ocasionando sub-aproveitamento de turnos.
**Solução implementada:** Cloud function diária às 06:00 que agrupa agendamentos de hoje pelos primeiros 5 dígitos do CEP do cliente (aproximação micro-regional). Assinala a `route_sequence` ordenando e otimizando. Incorporação visual aos cards no Kanban de Service Orders.
**Diff resumido:**
```diff
+ export const optimizeDailyRoutes = functions.scheduler.onSchedule('every day 06:00', async () => {
+   // Gera o roteamento geográfico atribuindo route_sequence
+ });
```

### 7. Fluxo Pós-instalação Automático
**Arquivos alterados:** `src/lib/db.ts`, `server.ts`, `src/workers/messageWorker.ts`
**Problema:** Impossibilidade de medir satisfação imediata de uma instalação recém efetuada.
**Solução implementada:** Interceptação no evento de mudança de status da Ordem de Serviço na interface `updateServiceOrder` para `concluida`. Agenda um trigger via endpoint Express no BullMQ para `delay: 24h`. O BullMQ Worker envia o HSM adequado com base em criação de ticket nas mesmas 24h.
**Diff resumido:**
```diff
+ if (data.status === 'concluida' && oldStatus !== 'concluida') {
+   // POST /api/jobs/schedule-pos-install -> job 24h BullMQ
+ }
```

### 8. SLA Inteligente para Resposta Humana Pós-IA
**Arquivos alterados:** `src/lib/gemini.ts`, `server.ts`, `src/workers/messageWorker.ts`, `src/pages/ChatPage.tsx`
**Problema:** Clientes encaminhados para atendente humano (`shouldEscalate: true`) ficavam com tempo de espera sem feedback visual/suporte, frustrando o uso do WhatsApp.
**Solução implementada:** Nova fila programada no BullMQ (`sla_warning`). Ao assumir ticket, marca no BD e schedule dois triggers (5min aviso cliente, 15min aviso escalação gerente/supervisor via alerta no front-end). Envio de primeira resposta humana cancela/desarma job via `/api/tickets/human-response`.
**Diff resumido:**
```diff
+      fetch("/api/jobs/schedule-sla", { ... }); // 5m e 15m
+      await messageQueue.add('sla_warning');
```

## Cloud Functions adicionadas
- `sendD1Confirmation`: Trigger `every day 18:00`. Monitora as OS do dia posterior, disparando aviso confirmatório sobre as visitas para a diminuição da taxa de não-show/ausência.
- `optimizeDailyRoutes`: Trigger `every day 06:00`. Percorre todas as OS "agendadas" do respectivo dia, agregando por prefixo de CEP e injetando uma sequência ótima primária (`route_sequence` / `route_region`).

## Collections Firestore adicionadas/alteradas
- **`incidents`**: Coleção adicionada para reter instabilidades sistêmicas reportadas via alarmes Zabbix/PRTG.
- **`service_orders`**: Mutações incorporadas: novos campos `route_sequence`, `route_region`, `route_optimized_at`, `pos_instalacao_sent` e `pos_instalacao_sent_at`.
- **`tickets`**: Alterações incorporadas para rastreabilidade de fila humana: campos `escalated_at`, `escalation_reason`, `human_responded` (boolean) e `human_first_response_at`.
- **`notifications`**: Adicionado envios sistêmicos internos (painel admin) contendo alarmes de `type: "sla_breach"` provenientes da inércia em tickets.

## Jobs BullMQ adicionados
- `pos_instalacao`: Job submetido ao encerrar OS (delay de 86400000ms), responsável por checar submissão a NPS/Support.
- `sla_warning`: Job com duas vertentes (T+5 e T+15), avalia interações pendentes na tela do painel humano emitindo updates e notificações via WS/Firestore.

## Templates HSM (WhatsApp) necessários
- `pos_instalacao_ok`: "Oi {name}! Sua internet {plan} foi instalada ontem. Está funcionando bem? Faça um teste: {url} 🚀"
- `pos_instalacao_com_problema`: "Oi {name}! Vi que você entrou em contato com a gente hoje. Sua internet está bem agora? Pode me contar como está o sinal?"
- `agendamento_confirmacao_d1`: (D-1 Trigger) Aviso prévio a aprovar
- `noc_alerta_massivo`: Alertas despachados individualmente indicando detecção de massiva.

## Pontos de atenção para próximos sprints
- Substituir o algoritmo de geolocalização burro (primeiros 5 dígitos de CEP) por uma integração lat/long de roteirização oficial (`Mapbox API` ou `Google Maps Routes`).
- As APIs de SLA usam chamadas HTTP passivas que precisam possivelmente de controle em caso de downtime do servidor Express em instâncias serverless (Cold Starts vs Background Jobs).
- Fomentar dashboards mais precisos extraindo analíticas das OS com base no campo recém implementado `route_optimized_at` e cruzando-os com `createdAt` dos `incidents` na aba de Relatórios.
