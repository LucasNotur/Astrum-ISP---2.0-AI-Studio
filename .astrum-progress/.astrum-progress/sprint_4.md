# SPRINT 4 — FRONTEND PRODUCTION-GRADE
**Bloco:** B08 Frontend · UX · Estado Visual
**Duração:** 2 semanas (14 dias)
**Objetivo:** Interface que faz o gestor do ISP sentir que usa um produto enterprise de primeira linha.
**Status:** ⬜ Não iniciado | 🔒 Bloqueado até Gate Sprint 3

---

## GATE DE ENTRADA
- [ ] Gate Sprint 3 aprovado (todos os 12 critérios ✅)

---

## SEMANA 9

### DIA 57 — React 18 + Vite + TypeScript Strict
**Sessão:** 57 de 58 | **Tipo:** REFACTOR
- [ ] Ativar TypeScript strict mode (strict: true) sem exceções em tsconfig.json
- [ ] Remover TODOS os `any` implícitos do código de produção (usar unknown ou tipos corretos)
- [ ] Configurar Vite com code splitting por rota (lazy imports)
- [ ] Garantir bundle inicial <1MB após code splitting
- [ ] Configurar aliases: @/components, @/hooks, @/stores, @/lib
- [ ] **TESTE:** tsc --noEmit → zero erros de TypeScript

**Checklist Master:** Nenhum item direto
**Blocos:** B08

---

### DIA 58 — Zustand Stores por Domínio
**Sessão:** 58 de 58 | **Tipo:** REFACTOR
- [ ] Refatorar useAppStore.ts para stores separadas por domínio
- [ ] Criar: useAuthStore, useChatStore, useTicketStore, useBillingStore, useISPStore
- [ ] Implementar persistência seletiva com zustand/middleware/persist
- [ ] Garantir: mudança em um store não causa re-render em componentes de outro store
- [ ] Migrar todos os componentes React para usar as novas stores
- [ ] **TESTE:** Vitest — mudança em useBillingStore não re-renderiza componentes do useChatStore

**Checklist Master:** Nenhum item direto
**Blocos:** B08

---

### DIA 59 — TanStack Query Data Fetching
**Sessão:** 59 de 58 | **Tipo:** REFACTOR
- [ ] Auditar todos os useEffect de fetch e migrar para TanStack Query
- [ ] Implementar Stale-While-Revalidate em todas as queries críticas
- [ ] Configurar invalidação de cache via CDC do Supabase (Dia 26)
- [ ] Implementar prefetching nas rotas mais usadas
- [ ] **TESTE:** Playwright — navegar Faturas → Tickets → Faturas → zero nova chamada API na volta

**Checklist Master:** Nenhum item direto
**Blocos:** B08

---

### DIA 60 — Design System Shadcn/UI + Tailwind
**Sessão:** 60 | **Tipo:** IMPL
- [ ] Auditar e padronizar todos os componentes Shadcn existentes no projeto
- [ ] Definir e aplicar tokens de design da Astrum: cores brand, tipografia, espaçamentos
- [ ] Garantir consistência visual em todos os módulos: CRM, Billing, Chat, Dashboard
- [ ] Revisar e corrigir acessibilidade: ARIA labels, navegação por teclado, contraste
- [ ] **TESTE:** Lighthouse — Accessibility score >90 em todas as páginas

**Checklist Master:** Nenhum item direto
**Blocos:** B08

---

### DIA 61 — Framer Motion Animações
**Sessão:** 61 | **Tipo:** IMPL
- [ ] Implementar animação spring em abertura/fechamento de modais
- [ ] Implementar fade + slide nas transições entre páginas
- [ ] Implementar animação de pulsação no indicador "IA pensando..."
- [ ] Garantir animações em 60fps sem jank (usar GPU layers)
- [ ] Garantir: animações respeitam prefers-reduced-motion (acessibilidade)
- [ ] **TESTE:** Playwright — abrir modal → animação completa em <300ms

**Checklist Master:** Nenhum item direto
**Blocos:** B08

---

### DIA 62 — Optimistic UI + Skeletal Loading + Font Subset
**Sessão:** 62 | **Tipo:** IMPL
- [ ] Implementar Optimistic UI em: envio de mensagem, atualização de ticket, emissão de boleto
- [ ] Substituir TODOS os spinners por Skeletal Loading nas listagens
- [ ] Implementar Font Subset: apenas caracteres PT-BR carregados (redução de ~90%)
- [ ] Implementar: rollback visual se ação falhar (desfazer optimistic update)
- [ ] **TESTE:** Playwright — enviar mensagem → aparece instantaneamente (sem esperar API)

**Checklist Master:** Nenhum item direto
**Blocos:** B08

---

### DIA 63 — WebSockets + SSE no Frontend
**Sessão:** 63 | **Tipo:** IMPL
- [ ] Criar hook useWebSocket() para conexão ao chat em tempo real
- [ ] Criar hook useSSEStream() para streaming de tokens da IA
- [ ] Implementar Abort Controller no chat (usuário cancela resposta)
- [ ] Implementar reconexão automática com backoff exponencial
- [ ] **TESTE:** Playwright — desconectar WebSocket → reconectar em <3s automaticamente

**Checklist Master:** Nenhum item direto
**Blocos:** B08

---

## SEMANA 10

### DIA 64 — Lighthouse CI + Performance Final
**Sessão:** 64 | **Tipo:** IMPL
- [ ] Executar Lighthouse em todas as páginas principais
- [ ] Corrigir issues: Performance, Accessibility, Best Practices, SEO
- [ ] Atingir: Performance >90, Accessibility >90, Best Practices >90
- [ ] Time to Interactive <2 segundos em conexão 4G simulada
- [ ] Configurar Lighthouse CI como gate no GitHub Actions (bloqueia deploy se cair)
- [ ] **TESTE:** Lighthouse CI no pipeline → bloqueia PR de teste com score baixo

**Checklist Master:** `Lighthouse CI: Performance >85, Accessibility >90` → ✅
**Blocos:** B08 + B11

---

### DIA 65 — Dashboard Principal
**Sessão:** 65 | **Tipo:** IMPL
- [ ] Implementar cards de KPIs: tickets abertos, resolução IA %, custo IA mês, inadimplência %
- [ ] Gráficos Recharts: atendimentos por dia, churn mensal, receita por plano
- [ ] Integração com DuckDB para relatórios pesados sem bloquear chat
- [ ] Filtros por período e por ISP (super admin)
- [ ] **TESTE:** Playwright — dashboard carrega em <2s com dados reais

**Checklist Master:** Nenhum item direto
**Blocos:** B08

---

### DIA 66 — AstroChat UI Completa
**Sessão:** 66 | **Tipo:** IMPL
- [ ] Lista de conversas com busca e filtros (por status, canal, atribuição)
- [ ] Painel de conversa com histórico completo, SSE streaming, ações rápidas
- [ ] Indicadores: "IA respondendo...", "Aguardando humano", "Resolvido"
- [ ] Visualizador do nó ativo do LangGraph (qual etapa o agente está)
- [ ] Transcrição automática de áudios WhatsApp na thread da conversa
- [ ] **TESTE:** Playwright — fluxo completo de atendimento: receber → responder → resolver

**Checklist Master:** Nenhum item direto
**Blocos:** B08

---

### DIA 67 — Módulo CobrAI UI
**Sessão:** 67 | **Tipo:** IMPL
- [ ] Dashboard de inadimplência: lista de devedores, estágio da régua, dias em atraso
- [ ] Botões de ação: avançar etapa, pausar cobrança, registrar pagamento manual
- [ ] Timeline visual da régua por cliente (cada disparo com timestamp)
- [ ] Indicador de jobs pendentes no BullMQ por ISP
- [ ] **TESTE:** Playwright — visualizar cliente inadimplente → avançar etapa → job criado no BullMQ

**Checklist Master:** Nenhum item direto
**Blocos:** B08

---

### DIA 68 — Módulo Tickets + Faturamento
**Sessão:** 68 | **Tipo:** IMPL
- [ ] Lista de tickets: filtros por status, prioridade, técnico, ISP, SLA
- [ ] Detalhe do ticket com histórico, ações, escalação, edição colaborativa (CRDTs)
- [ ] Módulo de faturamento: emissão, histórico, status, vencimento
- [ ] Optimistic UI em todas as ações de tickets e faturamento
- [ ] **TESTE:** Playwright — criar ticket → editar simultaneamente em dois tabs → merge sem conflito (CRDT)

**Checklist Master:** Nenhum item direto
**Blocos:** B08

---

### DIA 69 — Configurações ISP + Onboarding
**Sessão:** 69 | **Tipo:** IMPL
- [ ] Painel de configurações por ISP: personalidade da IA, regras de cobrança, planos, threshold de segurança
- [ ] Upload de manuais técnicos com barra de progresso e status de ingestão no Qdrant
- [ ] Fluxo de onboarding guiado para novo ISP (wizard de 5 etapas)
- [ ] Painel de auditoria LGPD (log de dados anonimizados)
- [ ] **TESTE:** Playwright — onboarding completo de ISP do zero em <10 minutos

**Checklist Master:** Nenhum item direto
**Blocos:** B08

---

### DIA 70 — GATE SPRINT 4 (Definition of Done)
**Sessão:** 70 | **Tipo:** GATE
- [ ] ✅ TypeScript strict: zero erros em toda a codebase
- [ ] ✅ Lighthouse >90 em todas as páginas principais
- [ ] ✅ TanStack: sem polling desnecessário (Playwright confirmando)
- [ ] ✅ WebSocket + SSE: chat em tempo real funcionando
- [ ] ✅ Optimistic UI: ações instantâneas em todas as operações críticas
- [ ] ✅ Skeleton Loading: zero spinners em listagens
- [ ] ✅ AstroChat UI completa e funcional
- [ ] ✅ CobrAI UI operacional com BullMQ integrado
- [ ] ✅ Tickets + Faturamento funcionando
- [ ] ✅ Onboarding de ISP em <10 minutos
- [ ] ✅ Todos os testes Playwright do Sprint 4 passando

**GATE STATUS:** ⬜ Pendente

---

## RESUMO DO SPRINT 4

| Item | Status |
|------|--------|
| Dias concluídos | 0 / 14 |
| Sessões executadas | 0 / 14 |
| Testes Vitest criados | 0 |
| Testes Playwright criados | 0 |
| Gate | ⬜ Pendente |
| Próximo sprint | Sprint 5 — Integração E2E + WhatsApp |

---

*Sprint 4 criado em: 2026-05-31 | Atualizado automaticamente pela IA*
