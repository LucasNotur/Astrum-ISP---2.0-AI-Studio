# SPRINT 5 — INTEGRAÇÃO END-TO-END + HARDENING
**Integração de todos os 12 Blocos**
**Duração:** 2 semanas (14 dias)
**Objetivo:** Os 12 blocos funcionando como um organismo único. Stress test. Security audit. Go-Live.
**Status:** ⬜ Não iniciado | 🔒 Bloqueado até Gate Sprint 4

---

## GATE DE ENTRADA
- [ ] Gate Sprint 4 aprovado (todos os 11 critérios ✅)

---

## SEMANA 11

### DIA 71 — Integração WhatsApp/Evolution API
**Sessão:** 71 | **Tipo:** IMPL
- [ ] Auditar integração Evolution API existente no projeto
- [ ] Garantir HMAC em todos os webhooks recebidos da Evolution API
- [ ] Implementar fluxo completo: WhatsApp → Presidio → LangGraph → Qdrant → LLM → Resposta
- [ ] Testar com número de WhatsApp real: enviar mensagem → receber resposta em <3s
- [ ] **TESTE:** Playwright — simular webhook WhatsApp → resposta gerada e enviada

**Checklist Master:** Nenhum item direto
**Blocos:** Integração B02+B03+B04+B07

---

### DIA 72 — Integração Sistemas ISP (Strangler Fig)
**Sessão:** 72 | **Tipo:** IMPL
- [ ] Auditar integrações com IXC/SGP/MK-Auth existentes no projeto
- [ ] Aplicar Strangler Fig: Astrum assume apenas suporte via WhatsApp primeiro
- [ ] Webhooks HMAC para callbacks dos sistemas ISP
- [ ] Testar com ISP de teste: consultar plano → verificar sinal → suspender
- [ ] **TESTE:** Vitest — consulta ao sistema ISP retorna dados corretos do cliente

**Checklist Master:** Nenhum item direto
**Blocos:** B12 Strangler Fig

---

### DIA 73 — CobrAI End-to-End Completo
**Sessão:** 73 | **Tipo:** IMPL
- [ ] Testar régua completa com ISP real: aviso → negociação → suspensão → reativação
- [ ] Validar cada job no BullMQ com timestamps corretos
- [ ] Confirmar zero jobs perdidos em crash simulado
- [ ] Medir taxa de auto-resolução da cobrança com dados reais
- [ ] **TESTE:** Vitest — régua de 5 etapas completa, zero perdas em 50 simulações

**Checklist Master:** `Jobs de cobrança perdidos em crash: 0` → ✅

---

### DIA 74 — Onboarding Automatizado de ISP
**Sessão:** 74 | **Tipo:** IMPL
- [ ] ISP cria conta → sistema provisiona tenant em <5 minutos
- [ ] Provisionamento automático: Supabase (tenant_id), Qdrant (collection), R2 (bucket), BullMQ (filas)
- [ ] Email de boas-vindas automático com credenciais
- [ ] Wizard de configuração guiado no painel (5 etapas)
- [ ] **TESTE:** Playwright — criar conta ISP do zero → sistema operacional em <5 minutos

**Checklist Master:** Nenhum item direto

---

### DIA 75 — Load Test: 1000 Mensagens Simultâneas
**Sessão:** 75 | **Tipo:** QA
- [ ] Instalar K6 para load testing
- [ ] Criar script K6: 1000 mensagens de WhatsApp simultâneas
- [ ] Simular pico: queda de fibra numa cidade → todos os clientes reclamam ao mesmo tempo
- [ ] Identificar gargalos e corrigir
- [ ] Meta: sistema aguentar 1000 req/s sem degradação >200ms
- [ ] **TESTE:** K6 — p95 de resposta <200ms com 1000 usuários simultâneos

**Checklist Master:** Nenhum item direto (qualidade de infraestrutura)

---

### DIA 76 — Chaos Testing: Resiliência a Quedas
**Sessão:** 76 | **Tipo:** QA
- [ ] Simular queda da OpenAI via Circuit Breaker → fallback em <500ms
- [ ] Simular queda do Qdrant → sistema degrada graciosamente sem crash
- [ ] Simular queda do Redis → BullMQ reinicia sozinho quando Redis volta
- [ ] Simular queda do Supabase → mensagens de erro claras, zero dados perdidos
- [ ] **TESTE:** Todos os 4 cenários de chaos passando

**Checklist Master:** Nenhum item direto (resiliência)

---

### DIA 77 — Security Audit Completo
**Sessão:** 77 | **Tipo:** QA
- [ ] Penetration test em todas as rotas críticas (OWASP Top 10)
- [ ] Verificar: todas as rotas financeiras têm Idempotency Key
- [ ] Verificar: todos os webhooks têm HMAC
- [ ] Verificar: CI grep passando (zero secrets no repositório)
- [ ] Verificar: RLS impedindo cross-tenant em todos os cenários
- [ ] Revisar CSP headers em todas as páginas
- [ ] **TESTE:** Relatório de segurança sem vulnerabilidades críticas

**Checklist Master:** Nenhum item direto (validação de segurança)

---

## SEMANA 12

### DIA 78 — Dashboard de Saúde por ISP
**Sessão:** 78 | **Tipo:** IMPL
- [ ] Custo de IA, tickets resolvidos, taxa de resolução por ISP
- [ ] Gráfico de inadimplência: evolução diária/semanal/mensal
- [ ] Alertas automáticos: ISP com custo IA acima do threshold
- [ ] Exportação de relatório em PDF/Excel via DuckDB
- [ ] **TESTE:** Playwright — gerar relatório de 30 dias → PDF correto em <5s

**Checklist Master:** `Visibilidade de custo por ISP: Tempo real (Helicone)` → ✅

---

### DIA 79 — Ajuste Fino do LLM Router com Dados Reais
**Sessão:** 79 | **Tipo:** IMPL
- [ ] Analisar dados reais de produção no Helicone
- [ ] Calibrar threshold de complexidade do LLM Router
- [ ] Medir custo por mensagem antes e depois da calibração
- [ ] Expandir test set do LLM Router para 500 queries reais

**Checklist Master:** Nenhum item novo (otimização)

---

### DIA 80 — RAGAS Contínuo + LLM-as-a-Judge Calibrado
**Sessão:** 80 | **Tipo:** QA
- [ ] Analisar scores RAGAS com dados reais de produção
- [ ] Ajustar pipeline de chunking se precisão <0.85
- [ ] Calibrar LLM-as-a-Judge com perguntas reais de ISP
- [ ] Expandir test set para 200 perguntas
- [ ] **TESTE:** RAGAS score >0.80 com dados reais (não apenas test set)

**Checklist Master:** Nenhum item novo (qualidade de IA)

---

### DIA 81 — Synthetic Monitoring 24/7
**Sessão:** 81 | **Tipo:** IMPL
- [ ] Criar robô que a cada hora simula cliente real: abre chat → envia mensagem → verifica resposta → cria ticket → simula pagamento
- [ ] Alertar equipe (Slack/email) se qualquer etapa falhar
- [ ] Criar dashboard de uptime do sistema no painel admin
- [ ] **TESTE:** Desligar serviço → synthetic monitor detecta em <5 minutos

**Checklist Master:** `Synthetic monitoring rodando 24/7` → ✅

---

### DIA 82–83 — Otimização de Performance Final
**Sessão:** 82 | **Tipo:** QA
- [ ] Analisar Sentry Profiling: funções que consomem mais CPU
- [ ] Otimizar as 3 funções mais lentas identificadas
- [ ] Re-executar benchmark Fastify: confirmar >10k req/s
- [ ] Re-executar Lighthouse: confirmar >90 em todas as páginas
- [ ] Documentação técnica completa para o time

**Checklist Master:** Nenhum item novo

---

### DIA 84 — GATE SPRINT 5 — GO-LIVE AUTORIZADO
**Sessão:** 84 | **Tipo:** GATE
- [ ] ✅ WhatsApp end-to-end: <3s de resposta
- [ ] ✅ CobrAI: 0% de jobs perdidos em 50 simulações
- [ ] ✅ Onboarding: ISP novo em <5 minutos
- [ ] ✅ Load test: 1000 msg simultâneas → p95 <200ms
- [ ] ✅ Chaos test: OpenAI cai → fallback <500ms
- [ ] ✅ Security audit: zero vulnerabilidades críticas
- [ ] ✅ RAGAS >0.80 com dados reais
- [ ] ✅ Synthetic monitoring rodando e alertando
- [ ] ✅ Taxa de resolução autônoma medida >80%
- [ ] ✅ Deploy em <5 minutos com zero downtime

**GATE STATUS:** ⬜ Pendente
> 🎉 Quando todos os critérios ✅: ASTRUM AI ENGINE vai para produção

---

*Sprint 5 criado em: 2026-05-31 | Atualizado automaticamente pela IA*


---

# SPRINT 6 — ESCALA E WORKERS LEGADOS
**Duração:** 2 semanas (14 dias)
**Objetivo:** Integrar todos os workers existentes na nova arquitetura. Multi-tenant com 10+ ISPs.
**Status:** ⬜ Não iniciado | 🔒 Bloqueado até Gate Sprint 5

---

## GATE DE ENTRADA
- [ ] Gate Sprint 5 aprovado — Go-Live concluído ✅

---

### DIA 85 — Multi-tenant com 10 ISPs Simultâneos
- [ ] Testar 10 ISPs em paralelo sem interferência entre dados
- [ ] Medir performance do Qdrant com 10 coleções ativas
- [ ] Monitorar custo por ISP no Helicone com dados reais
- [ ] **TESTE:** Vitest — 10 queries simultâneas de ISPs diferentes → zero cross-contamination

---

### DIA 86 — Feature Flags por ISP
- [ ] Refatorar lib/featureFlags.ts para suporte por tenant
- [ ] Flags: CobrAI automático, escalação humana, relatórios avançados, vision processor
- [ ] Painel de controle de feature flags no super admin
- [ ] **TESTE:** Playwright — desativar CobrAI para ISP A → ISP B não afetado

---

### DIA 87 — Vision Processor (Análise de Imagens)
- [ ] Integrar GPT-4o Vision no fluxo de suporte técnico
- [ ] Usuário envia foto do roteador/cabo danificado → IA analisa e diagnostica
- [ ] Integrar com RAG: foto similar a problemas já resolvidos no Qdrant
- [ ] **TESTE:** Vitest — imagem de roteador com LED vermelho → diagnóstico correto

---

### DIA 88 — SLA Engine + Escalation Engine Integrado
- [ ] Integrar slaWorker.ts com LangGraph: nó de escalação automática
- [ ] Integrar escalationEngine.ts com LangGraph
- [ ] Alertas antes de SLA vencer (configurável por ISP)
- [ ] **TESTE:** Vitest — SLA prestes a vencer → alerta disparado e escalação iniciada

---

### DIA 89 — Gamification + Upsell Engine
- [ ] Integrar gamificationWorker.ts com novos flows LangGraph
- [ ] Integrar upsellEngine.ts: IA sugere upgrade em momento oportuno
- [ ] Dashboard de gamification para técnicos
- [ ] **TESTE:** Playwright — técnico resolve 10 tickets → badge concedido automaticamente

---

### DIA 90 — Reports + ERP Sync + Transcrição
- [ ] Migrar reportWorker.ts para DuckDB in-process
- [ ] Integrar erpSyncWorker.ts com Outbox Pattern
- [ ] Integrar transcription.ts com Whisper API via Helicone (rastrear custo)
- [ ] **TESTE:** Vitest — relatório de 100k registros via DuckDB em <3s

---

### DIA 91 — Site Scrape + Persona + Routing Engine
- [ ] Integrar siteScrapeWorker.ts com pipeline RAG do Qdrant
- [ ] Integrar personaManager.ts com LangGraph (personas por ISP)
- [ ] Refatorar routingEngine.ts para usar LangGraph Agentic RAG
- [ ] **TESTE:** Vitest — site scrapado → chunks → embeddings → Qdrant automaticamente

---

### DIA 92–97 — Integrações Restantes + Testes Finais
- [ ] FCR Worker integrado ao LangGraph (fcrWorker.ts)
- [ ] Snooze Worker integrado ao BullMQ Durable Workflows (snoozeWorker.ts)
- [ ] Plan Sync Worker integrado ao Outbox Pattern (planSyncWorker.ts)
- [ ] Suite completa de testes Vitest para todos os workers integrados
- [ ] Revisão final de toda a documentação técnica
- [ ] Runbook de incidentes completo

---

### DIA 98 — CONCLUSÃO: ASTRUM AI ENGINE SETORIAL
**GATE FINAL:**
- [ ] ✅ 10 ISPs em paralelo sem interferência
- [ ] ✅ Todos os workers legados integrados à nova arquitetura
- [ ] ✅ North Star Metrics atingidas:
  - Taxa de resolução autônoma >80%
  - 0% de jobs de cobrança perdidos
  - Isolamento absoluto entre ISPs (RLS + Qdrant)
  - Custo IA por ISP em tempo real
  - Deploy em <5 minutos com 0 downtime
  - RAGAS medido automaticamente a cada deploy
- [ ] ✅ Documentação técnica completa
- [ ] ✅ Synthetic monitoring rodando 24/7

**🏆 MISSÃO CONCLUÍDA — ASTRUM É UM AI ENGINE SETORIAL PARA ISPs**

---

## RESUMO FINAL DOS 6 SPRINTS

| Sprint | Dias | Blocos | Status |
|--------|------|--------|--------|
| Sprint 0 | 14 | B12 Padrões | ⬜ |
| Sprint 1 | 14 | B07+B09+B05 | ⬜ |
| Sprint 2 | 14 | B06+B01+B02+B03 | ⬜ |
| Sprint 3 | 14 | B04+B10+B11 | ⬜ |
| Sprint 4 | 14 | B08 | ⬜ |
| Sprint 5 | 14 | Integração E2E | ⬜ |
| Sprint 6 | 14 | Escala + Workers | ⬜ |
| **TOTAL** | **98** | **12 Blocos** | **0%** |

---

*Sprints 5 e 6 criados em: 2026-05-31 | Atualizado automaticamente pela IA*
