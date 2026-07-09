# AUDITORIA UI/UX — 45 telas do frontend legado
# U0-01 — Executado em 2026-07-09

> Gerado automaticamente pela sessão U0-01 (Onda 4, Plano C).
> Auditou: `src/pages/*.tsx` (27 arquivos) + `src/pages/intelligence/*.tsx` (18 arquivos) = 45 telas.
> **NOTA:** O plano estimava 38 telas; a contagem real é 45 (algumas adicionadas pela Fase 2 IA-NEXTGEN).

## Legenda
- **Resp** = Responsiva (breakpoints Tailwind sm:/md:/lg:)
- **Est** = Estados loading / empty / error
- **Dark** = Suporte dark mode (CSS vars vs hex hardcoded)
- **i18n** = Chaves ptBR do pt-br.ts
- ✅ OK · ⚠️ Parcial · ❌ Ausente/Quebrado

---

## Tabela completa (45 telas)

| # | Arquivo | Persona | Resp | Est | Dark | i18n | Linhas | Problema principal |
|---|---------|---------|:----:|:---:|:----:|:----:|-------:|-------------------|
| 1 | `pages/AICostsPage.tsx` | admin/owner | ✅ | ✅ | ✅ | ⚠️ | 896 | `openConversationInChat()` injeta ticket incompleto (só id/conversationId/customerId) causando null errors no ChatPage |
| 2 | `pages/AIConfigPage.tsx` | admin/owner | ✅ | ⚠️ | ✅ | ❌ | 1998 | **BUG:** dois `TabsTrigger value="retention"` (l.390 e l.417) tornam aba inacessível; `tenantId = 'default'` hardcoded quebra multi-tenant |
| 3 | `pages/AIObservabilityPage.tsx` | admin/super_admin | ✅ | ✅ | ⚠️ | ⚠️ | 875 | Tooltip de gráficos com `contentStyle={{ backgroundColor: '#1f2937' }}` hardcoded — invisible em light mode |
| 4 | `pages/BIPage.tsx` | admin | ✅ | ❌ | ⚠️ | ❌ | 361 | **BUG:** `Math.random()` dentro de `useMemo` gera dados de gráfico diferentes a cada re-render |
| 5 | `pages/BillingPage.tsx` | admin/owner | ✅ | ⚠️ | ⚠️ | ❌ | 592 | Botão "Exportar PDF" executa apenas `console.log('Generating PDF...')` — não implementado |
| 6 | `pages/ChatPage.tsx` | todos auth | ✅ | ⚠️ | ⚠️ | ❌ | 2020 | **BUG CRÍTICO:** UPDATE Supabase de snooze sem `.eq('id', ticket.id)` pode corromper timestamps de TODOS os tickets |
| 7 | `pages/CobrAIPage.tsx` | admin | ⚠️ | ⚠️ | ⚠️ | ❌ | 360 | `<table>` HTML nativo sem variantes dark: nas células; sem estado de erro |
| 8 | `pages/CustomersPage.tsx` | todos/admin/owner | ✅ | ⚠️ | ⚠️ | ❌ | 1255 | Formulários de criação e edição são blocos JSX quasi-idênticos de ~400 linhas sem componente compartilhado |
| 9 | `pages/DashboardPage.tsx` | owner/admin | ✅ | ✅ | ⚠️ | ❌ | 1697 | dark:bg-[#16171a] hardcoded misturado com CSS vars — estratégia inconsistente |
| 10 | `pages/ERPIntegrationsPage.tsx` | admin/owner | ⚠️ | ✅ | ✅ | ❌ | 300 | Sem estado de erro quando fetch de credenciais falha |
| 11 | `pages/InventoryPage.tsx` | admin | ❌ | ❌ | ❌ | ❌ | 37 | **NÃO IMPLEMENTADO:** só cabeçalho + botão, zero lógica |
| 12 | `pages/KnowledgeBasePage.tsx` | admin/owner | ⚠️ | ⚠️ | ⚠️ | ❌ | 513 | `alert()` e `confirm()` nativos bloqueantes |
| 13 | `pages/MapPage.tsx` | todos auth | ⚠️ | ⚠️ | ✅ | ❌ | 502 | SVG fake com MOCK_OSS hardcoded; coordenadas fixas para São Paulo |
| 14 | `pages/MonitoringPage.tsx` | admin | ✅ | ⚠️ | ✅ | ❌ | 296 | `markAllNotificationsRead` faz N queries Supabase sequenciais (loop) em vez de batch update |
| 15 | `pages/OperatorMobilePage.tsx` | operator/support | ⚠️ | ⚠️ | ✅ | ❌ | 227 | `max-w-[375px]` fixo — aparece como faixa estreita em desktop |
| 16 | `pages/QualityMonitorPage.tsx` | admin/owner | ✅ | ⚠️ | ⚠️ | ❌ | 497 | **BUG SILENCIOSO:** filtro lê `rating.score` mas cards exibem `rating.rating` — filtros retornam resultados errados |
| 17 | `pages/SecurityPage.tsx` | admin/owner | ✅ | ✅ | ✅ | ❌ | 298 | Expurgo LGPD usa `confirm()` nativo em vez de Dialog shadcn |
| 18 | `pages/ServiceOrdersPage.tsx` | admin/tecnico | ✅ | ✅ | ⚠️ | ❌ | 1309 | `window.prompt()` coleta telefone para WhatsApp; `dark:bg-[#16171a]` hardcoded |
| 19 | `pages/SettingsPage.tsx` | admin/owner | ✅ | ✅ | ✅ | ❌ | 2494 | Maior arquivo (2494 l); ~30 props como `any`; reindex simula progresso fake com setInterval |
| 20 | `pages/SignupPage.tsx` | público | ✅ | ✅ | ❌ | ❌ | 390 | Sem validação de CNPJ; usa `window.location.href` em vez de React Router navigate |
| 21 | `pages/SuperAdminPage.tsx` | super_admin | ✅ | ✅ | ✅ | ❌ | 448 | **VULNERABILIDADE:** sem guarda RBAC — qualquer auth acessa gerenciamento de tenants e feature flags |
| 22 | `pages/TeamPage.tsx` | admin/owner | ✅ | ⚠️ | ⚠️ | ❌ | 436 | `handleRedistribute` é stub; barras de progresso em 0% pois `resolved_month` é sempre 0 |
| 23 | `pages/TechnicianAppPage.tsx` | tecnico | ✅ | ✅ | ✅ | ❌ | 697 | Dados de `MOCK_OSS` hardcoded; sync é `console.log`; `tenantId = "default"` fixo |
| 24 | `pages/TicketsPage.tsx` | todos auth | ✅ | ⚠️ | ⚠️ | ❌ | 338 | TMA "2h 15m" e FCR "82%" são strings literais — não calculados de dados reais |
| 25 | `pages/WebchatPage.tsx` | público | ✅ | ✅ | ⚠️ | ❌ | 220 | Session ID gerado com `Math.random()` (baixa entropia); inline style impede dark mode |
| 26 | `pages/WebhooksPage.tsx` | admin/owner | ✅ | ✅ | ✅ | ❌ | 331 | `confirm()` nativo para exclusão; sem estado de erro se Svix falha |
| 27 | `pages/WhatsAppPage.tsx` | admin/owner | ✅ | ✅ | ✅ | ❌ | 814 | `window.confirm()` para desconectar/remover instâncias |
| 28 | `pages/intelligence/CampaignsPage.tsx` | admin/owner | ✅ | ✅ | ✅ | ✅ | 570 | Sem problema crítico — padrão de referência |
| 29 | `pages/intelligence/ChurnPage.tsx` | admin/owner | ✅ | ✅ | ✅ | ✅ | 505 | Strings "LTV total em risco" e "Esta cliente ainda não tem vetor..." fora do ptBR |
| 30 | `pages/intelligence/DriftPage.tsx` | admin/super_admin | ✅ | ✅ | ✅ | ✅ | 446 | Sem problema crítico |
| 31 | `pages/intelligence/FeaturesPage.tsx` | admin/owner | ✅ | ✅ | ✅ | ✅ | 185 | Sem problema crítico |
| 32 | `pages/intelligence/GuardrailsPage.tsx` | admin | ✅ | ✅ | ✅ | ✅ | 228 | `window.location.reload()` no estado de erro em vez de `queryClient.invalidateQueries` |
| 33 | `pages/intelligence/IntelligenceHubPage.tsx` | todos (filtrado) | ✅ | ✅ | ✅ | ✅ | 144 | Sem problema crítico — página mais limpa do projeto |
| 34 | `pages/intelligence/LabelingPage.tsx` | admin | ✅ | ✅ | ✅ | ❌ | 217 | `useEffect` do listener de teclado sem array `[]` — memory leak por re-registro a cada render |
| 35 | `pages/intelligence/McpPage.tsx` | admin/super_admin | ✅ | ✅ | ✅ | ❌ | 281 | `<input type="checkbox">` nativo; `deleteMut` sem `onError` — falhas silenciosas |
| 36 | `pages/intelligence/ModelsPage.tsx` | admin | ✅ | ✅ | ✅ | ❌ | 255 | Sem estado de erro quando mutação de resolução de divergência falha |
| 37 | `pages/intelligence/NetworkGraphPage.tsx` | admin/owner | ✅ | ✅ | ✅ | ✅ | 309 | `window.location.reload()` no ErrorCard em vez de retry do TanStack Query |
| 38 | `pages/intelligence/NetworkHealthPage.tsx` | admin/owner | ✅ | ✅ | ✅ | ❌ | 100 | **BUG:** `riskAccessor` retorna `'high'`/`'medium'` mas `RiskBadge` espera `'alto'`/`'medio'` — badges renderizam errado |
| 39 | `pages/intelligence/ReplayPage.tsx` | admin/super_admin | ✅ | ✅ | ✅ | ✅ | 654 | "Ver divergentes →" hardcoded fora do ptBR |
| 40 | `pages/intelligence/ReviewQueuePage.tsx` | admin | ✅ | ✅ | ✅ | ❌ | 259 | Zoom de imagem muta `el.classList` diretamente em vez de usar estado React |
| 41 | `pages/intelligence/SandboxPage.tsx` | super_admin | ✅ | ✅ | ✅ | ✅ | 403 | Sem problema crítico |
| 42 | `pages/intelligence/StaffingPage.tsx` | admin/owner | ✅ | ✅ | ✅ | ❌ | 108 | **BUG:** `riskAccessor` retorna `'high'`/`'medium'`/`'low'` em vez de `'alto'`/`'medio'`/`'baixo'`; erro e dados insuficientes mesma EmptyState |
| 43 | `pages/intelligence/SyntheticPage.tsx` | super_admin | ✅ | ✅ | ✅ | ✅ | 469 | Sem problema crítico |
| 44 | `pages/intelligence/ToolsPage.tsx` | admin/super_admin | ✅ | ✅ | ✅ | ✅ | 214 | Sem problema crítico |
| 45 | `pages/intelligence/VoiceQaPage.tsx` | admin/owner | ✅ | ⚠️ | ✅ | ❌ | 265 | Sem loading enquanto `detailQuery` busca — área em branco após clicar na linha |

---

## Top-10 prioridade de dor (para U4)

| Pos | Tela | Score | Tipo |
|:---:|------|:-----:|------|
| 1 | `ChatPage.tsx` | 10 | BUG CRÍTICO: UPDATE sem WHERE pode corromper TODOS os tickets |
| 2 | `InventoryPage.tsx` | 10 | NÃO IMPLEMENTADO: apenas placeholder |
| 3 | `SuperAdminPage.tsx` | 9 | VULNERABILIDADE: RBAC ausente — qualquer auth acessa gerenciamento de tenants |
| 4 | `TechnicianAppPage.tsx` | 8 | NÃO FUNCIONAL: MOCK_OSS + sync fake + tenantId fixo |
| 5 | `QualityMonitorPage.tsx` | 7 | BUG SILENCIOSO: mismatch de campo torna filtros CSAT enganosos |
| 6 | `BIPage.tsx` | 7 | Math.random em useMemo — dashboard executivo com dados aleatórios |
| 7 | `AIConfigPage.tsx` | 7 | TabsTrigger duplicado + tenantId='default' quebra multi-tenant |
| 8 | `NetworkHealthPage.tsx` | 6 | RiskBadge com valores em inglês — badges de severidade invisíveis |
| 9 | `BillingPage.tsx` | 6 | Exportar PDF = console.log |
| 10 | `SettingsPage.tsx` | 5 | 2494 linhas + ~30 any + reindex fake |

**Menção honrosa:** `StaffingPage.tsx` compartilha o mesmo bug de RiskBadge (#8) com agravante de confundir erro de API com dados insuficientes.

---

## Totais

| Critério | ✅ OK | ⚠️ Parcial | ❌ Ausente | Total |
|----------|------:|----------:|-----------:|------:|
| Responsividade | 39 | 5 | 1 | 45 |
| Estados (loading/empty/error) | 31 | 12 | 2 | 45 |
| Dark mode | 30 | 13 | 2 | 45 |
| i18n (chaves ptBR) | 11 | 2 | 32 | 45 |

### Padrões sistêmicos identificados
- **i18n: zero nos legados.** Todos os 27 arquivos em `src/pages/` têm i18n ❌.
- **Intelligence é outro nível.** 11 de 18 telas têm ✅ em responsividade + estados + dark simultaneamente.
- **`window.confirm/alert/prompt` em 7 telas:** KnowledgeBasePage, SecurityPage, ServiceOrdersPage, WebhooksPage, WhatsAppPage, AIConfigPage, ChatPage.
- **`tenantId = "default"` hardcoded** em AIConfigPage e TechnicianAppPage — risco multi-tenant.
- **`window.location.reload()`** em 2 telas de intelligence (GuardrailsPage, NetworkGraphPage) — contorna TanStack Query.
- **`riskAccessor` com valores em inglês** em NetworkHealthPage e StaffingPage — mesmo bug, dois arquivos.

### Bugs que corrompem dados ou violam segurança (priority fix)
1. `ChatPage.tsx` — UPDATE de snooze sem `.eq()` — corrupção de dados
2. `SuperAdminPage.tsx` — sem RBAC guard — vulnerabilidade de segurança
3. `NetworkHealthPage.tsx` — `riskAccessor` inglês vs ptBR — visual broken
4. `StaffingPage.tsx` — mesmo bug de riskAccessor + EmptyState ambíguo
5. `QualityMonitorPage.tsx` — field mismatch silencioso nos filtros
