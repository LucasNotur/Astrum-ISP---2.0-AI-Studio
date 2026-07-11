# 00 — PLANO DE AÇÃO GERAL DA ASTRUM (índice vivo de todos os planos)
# Criado em 2026-07-08 pela sessão NG2-INVENTARIO. O "00" garante que este arquivo
# fique no topo da pasta — é AQUI que se olha primeiro para saber onde tudo está.

> **Como usar (Lucas e IA executora):**
> 1. Este arquivo é o ÍNDICE + ROTEIRO. Os detalhes de cada sessão vivem nos
>    planos-filhos (linkados abaixo) — nunca duplicar conteúdo aqui.
> 2. O sufixo no NOME de cada arquivo de plano diz o status:
>    `__CONCLUIDO` · `__EM_ANDAMENTO` · `__PENDENTE` · `__AGUARDANDO_DECISAO` ·
>    `__ABSORVIDO_PELO_V2`. Ao mudar o status de um plano, RENOMEAR o arquivo
>    (git mv), atualizar as referências e a tabela §1 daqui.
> 3. Toda sessão continua obedecendo o protocolo do plano-filho correspondente
>    (§0 do PLANO_MESTRE_V2 + RN1–RN24). Docs sempre commitados direto no main.

---

## §1 — INVENTÁRIO COMPLETO DOS PLANOS (status em 2026-07-08)

### ✅ Concluídos (história — não mexer)
| Plano | O que foi | Quando |
|---|---|---|
| `SPRINT_0__CONCLUIDO.md` … `SPRINT_5__CONCLUIDO.md` + `SPRINT_5_e_6__CONCLUIDO.md` + `PLANO_ACAO_SPRINT1__CONCLUIDO.md` | Fundação: DDD, segurança, dados, mensageria, LLMs, guardrails, RAG, agentes, DevOps, frontend, E2E (Sessões 1–67) | 2026-05/06 |
| `12_BLOCOS_TECNOLOGICOS__CONCLUIDO.md` | Mapa dos 12 blocos — todas as tecnologias implementadas | 2026-06 |
| `SPRINT_6__ABSORVIDO_PELO_V2.md` | Escala multi-tenant — ficou 8/14 e o restante foi absorvido pelo Plano Mestre V2 | 2026-06 |
| `PLANO_FIRESTORE_ZERO__CONCLUIDO.md` | Firestore 100% removido; Supabase único banco (R2) | 2026-07-03 |
| `ia-nextgen/PARTE1_IA01-IA10_backend__CONCLUIDO.md` | IA-01..IA-10 100% (A3 da IA-08 fechou em 2026-07-09) | 2026-07-09 |
| `ia-nextgen/PARTE2_IA11-IA46_fullstack__CONCLUIDO.md` | Fase 1 + Fase 2 100% (GATED IA-18/20/41 documentadas à parte, reavaliadas na Onda 5) | 2026-07-09 |

**Onda 1 FECHADA** (2026-07-09) — critério de fechamento cumprido: PARTE1 e PARTE2 renomeadas `__CONCLUIDO`.

### 🔶 Em andamento (código avançado, falta fechar)
| Plano | Feito | Falta |
|---|---|---|
| `PLANO_MESTRE_V2__EM_ANDAMENTO.md` (+ `MAPA_SESSOES_1_a_98.md`) | S68–S98 **code-complete** (gate final codificado em `scripts/cutover/final-gate.ts`) | A OPERAÇÃO: cutovers reais (`ATENDIMENTO_ENGINE=v2`, `COBRAI_ENGINE=v2`) + 10 critérios do gate final verdes em produção (ver `docs/ASTRUM_ESTADO_FINAL_PLANO_V2.md`) → **Onda 2** |

### ⬜ Pendentes (planejados em detalhe, execução iniciada ou zero)
| Plano | Conteúdo | Desbloqueio |
|---|---|---|
| `nextgen-2.0/PLANO_B_PARIDADE_CONCORRENTES__PENDENTE.md` | Escada de entrada via ERP + blocos P0–P6. **P0 CODE-COMPLETE (2026-07-09), P1 CODE-COMPLETE (2026-07-11)** — migrations de 4 tabelas pendentes (dever do Lucas) | **P2 é o próximo bloco a executar** (Onda 3) |
| `nextgen-2.0/PLANO_C_UIUX_OPERACIONAL__PENDENTE.md` | UI/UX fases U0–U7 | U0/U1 liberadas; U2+ **BLOQUEADA nas imagens do Lucas** (GATE-VISUAL) |
| `nextgen-2.0/PLANO_A_DIFERENCIAL_TECNOLOGIAS_INEDITAS__PENDENTE.md` | 12 tecnologias inéditas D-01..D-12 | Gates de combustível (tráfego real, dados, conectores) — Onda 5 |

### 📋 Aguardando decisão (dever de casa do LUCAS — §4)
| Doc | Decisões |
|---|---|
| `nextgen-2.0/MODELO_DE_COBRANCA_E_CENARIOS__AGUARDANDO_DECISAO.md` | Valores finais das faixas, success fee, Radar grátis ou R$349, limiar enterprise |

### 📚 Documentos de apoio (não são planos — não recebem status)
`PROGRESS_LOG.md` (diário) · `CHECKLIST_MASTER.md` (rastreio dos 12 blocos) ·
`MAPA_SESSOES_1_a_98.md` · `TECH_DEBT.md` · `REGRAS_AI_STUDIO.md` ·
`ia-nextgen/AUDITORIA_FRONTEND.md` · `ia-nextgen/IA-10_DESIGN.md` ·
`docs/LEGACY_RETIREMENT_PLAN.md` · `docs/DB_MIGRATION_GAP_REPORT.md` ·
`docs/ASTRUM_ESTADO_FINAL_PLANO_V2.md`

---

## §2 — O ROTEIRO: 5 ONDAS ATÉ A ASTRUM COMPLETA

```
ONDA 1  Fechar o IA-NEXTGEN (Fase 2 + IA-08 A3)          ← FECHADA (2026-07-09)
ONDA 2  Operar de verdade (cutovers + gate final do V2)   ← AGORA (bloqueada no Lucas)
ONDA 3  Plano B — entrada no mercado (P0 done → P1)       ← AGORA (P0 code-complete)
ONDA 4  Plano C — UI/UX                                   ← U0/U1 já; resto pós-imagens
ONDA 5  Plano A — diferenciais inéditos                   ← conforme combustível
```
Regra de paralelismo: nunca 2 sessões tocando os MESMOS arquivos ao mesmo tempo
(lição da consolidação de 2026-07-06). Ondas 1 e 3 intercalam bem (domínios
diferentes: `ia/*` × `provedor/erp`).

### ONDA 1 — Fechar o motor (PARTE2 Fase 2 + PARTE1 A3) — ✅ FECHADA (2026-07-09)
Fonte de detalhe: `PARTE2_IA11-IA46_fullstack__CONCLUIDO.md` + `PARTE1_IA01-IA10_backend__CONCLUIDO.md`.
Todos os blocos A/B/C/D executados (18 sessões da Fase 2 + IA-08 A3). GATED
(IA-18/20/41) ficam para a Onda 5, documentadas como tal nos planos-filhos.
**Pendência que sobra (não bloqueia a onda, é homologação, não código):**
Lucas precisa fazer 1 ligação real em staging (conta Twilio) para validar o
critério "ligação real" do IA-08 A3 — ver §4 item 6.

### ONDA 2 — Ligar a chave (pendências operacionais do Plano Mestre V2)
Fonte: `PLANO_MESTRE_V2__EM_ANDAMENTO.md` + `docs/ASTRUM_ESTADO_FINAL_PLANO_V2.md`.
1. **Replay como gate:** rodar IA-46 com ≥200 conversas reais → pass-rate ≥95%
   (relatório anexado ao checklist do cutover). *Lucas:* revisar as divergências
   na tela de replay e dar o OK.
2. **Cutover atendimento piloto:** `ATENDIMENTO_ENGINE=v2` em 1 tenant
   (per-tenant já suportado — migration 026). Shadow 7d antes, rollback = env.
   *Lucas:* escolher o tenant piloto (sugestão: o próprio ISP dele/mais próximo)
   e acompanhar a 1ª semana.
3. **Cutover cobrança:** `COBRAI_ENGINE=v2` (R6) após 2 ciclos de fatura limpos.
4. **Ligar as flags da Fase 1/2 em produção** (hoje TUDO está off): ordem
   sugerida — hub → toolreg → safety → graphrag → compression → features →
   drift → costdrill → replay → demais. 1 flag por vez, 48h de observação.
5. **GATE FINAL:** rodar `scripts/cutover/final-gate.ts` até os 10 critérios
   verdes. → renomear PLANO_MESTRE_V2 para `__CONCLUIDO`.
**Critério de fechamento:** motor novo com 100% do tráfego do piloto por 30 dias
sem rollback.

### ONDA 3 — Entrada no mercado (Plano B; P0 CODE-COMPLETE, P1 é o próximo passo)
Fonte: `PLANO_B_PARIDADE_CONCORRENTES__PENDENTE.md` (blocos P0–P6 com metas RN20).
1. ~~P0-01 conector IXC~~ ✅ — feito na S75. *Lucas:* ainda falta conseguir acesso
   a uma instância IXC de teste (parceiro/trial) para validar contra API real —
   SEM isso o P0 fica sem homologação (não bloqueia o código de P1 em diante).
2. ~~P0-02..05 (Voalle/MK/SGP/Hubsoft)~~ ✅ — feito em 2026-07-09 (commit `d3c12fc`).
3. ~~P0-06 (tools do agente operando o ERP)~~ ✅ — só `check_invoice` migrado;
   `suspend_signal`/`schedule_technical_visit` via ERP ficam para sessão futura.
4. ~~P1 (religue por confiança, notificação de falha, negociação, handover)~~ ✅ CODE-COMPLETE 2026-07-11.
   **PRÓXIMO: P2** (Instagram/e-mail/inbox) →
   P3 (vendas) → P4 (portal do assinante) → P5 (dashboard de valor + trial sem
   fricção + kit compliance) → P6 (parcerias CPE/OZmap — *Lucas:* contato comercial).
5. Em paralelo com P5: *Lucas* fecha as decisões de PREÇO (doc
   `__AGUARDANDO_DECISAO`).
**Critério de fechamento:** 1º ISP externo pagante operando via conector, com
dashboard de valor mostrando ROI ≥3× medido.

### ONDA 4 — UI/UX (Plano C)
Fonte: `PLANO_C_UIUX_OPERACIONAL__PENDENTE.md`.
1. **Já liberadas (sem depender de imagens):** U0-01 auditoria das 38 telas →
   U0-02 telemetria de uso → U1-01 desmontar App.tsx (5.903 linhas) → U1-02/03/04
   tokens/padrões/lint.
2. **GATE-VISUAL (bloqueado no Lucas):** enviar as IMAGENS de referência com
   observações (incluindo os 2 pins do Pinterest que ficaram atrás de login).
   ⚠️ A 1ª hipótese (blueprint neon dark) foi REJEITADA — não retomar.
3. U2: destilar linguagem → **Skill `astrum-design`** → tela piloto → aprovação
   do Lucas → U3 (shell/command palette) → U4 (redesign por persona) → U5
   (responsividade/PWA campo) → U6 (white-label/config por ISP) → U7 (qualidade).
**Critério de fechamento:** 38 telas no padrão da skill, auditoria U0 toda verde.

### ONDA 5 — Diferenciais inéditos (Plano A; abre por combustível)
Fonte: `PLANO_A_DIFERENCIAL_TECNOLOGIAS_INEDITAS__PENDENTE.md` (§3 tem o mapa).
- Com Onda 2 fechada → D-05 (KB viva) e D-04 (NOC autônomo).
- Com 90d de dados → D-02 (backtesting de régua — a máquina de cases) → D-08
  (CFO virtual) → D-01 (gêmeo digital).
- Com P0+P3 → D-06 (copiloto de campo) e D-07 (vendedor com LTV).
- Com escala/decisão → D-03, D-10, D-12; com ≥10 tenants → D-09; com parceiros
  → D-11. GATED IA-18/20/41 reavaliadas aqui.
Cada onda de D-XX começa com sessão de expansão (RN17) — nunca executar direto.

---

## §3 — MAPA DE DEPENDÊNCIAS (visão de 1 tela)
```
ONDA 1 (motor) ──────────► ONDA 2 (cutover) ──► flags ON ──► ONDA 5 (D-04/05...)
     │                          ▲                                   ▲
     └── IA-46 replay ──────────┘                                   │
ONDA 3 (P0 conectores) ── pode começar JÁ ──► P1..P5 ──► 1º cliente pagante
     │                                                              │
     └── P0+P3 ────────────────────────────────────────────► D-06/D-07
ONDA 4 (UI): U0/U1 JÁ ──► [IMAGENS DO LUCAS] ──► Skill ──► U2..U7
```

## §4 — DEVER DE CASA DO LUCAS (tudo que só você pode fazer, consolidado)
1. **Imagens de UI** com observações (destrava a Onda 4 inteira). ← mais antigo
2. **Decisões de preço** (§3d do MODELO__AGUARDANDO_DECISAO — 5 itens).
3. **Tenant piloto** para o cutover (Onda 2) + acompanhar 1ª semana.
4. **Acesso a instância IXC** de teste (destrava P0-01/Onda 3).
5. **Aprovar a ADR ML/Python** quando a IA-24 escrevê-la (Onda 1, passo 5).
6. **Conta Twilio staging** ativa + 1 ligação de teste (IA-08 A3 / Bloco D).
7. Contatos comerciais: parceria CPE/OZmap (P6) e, mais tarde, parceiros MCP (D-11).
8. Validar custo de voz por chamada antes do piloto de voz.

## §5 — REGRAS DE MANUTENÇÃO DESTE ARQUIVO
- Fechou uma onda/plano → renomear o arquivo do plano (git mv + atualizar
  referências) e atualizar §1/§2 aqui, no MESMO commit.
- Todo commit de docs: direto no main, autoria LucasNotur, SEM trailer de IA.
- Sessão nova sempre lê: este arquivo → o plano-filho da onda ativa → PROGRESS_LOG
  (3 últimas entradas) → executa.
