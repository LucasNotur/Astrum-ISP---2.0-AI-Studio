# PENDÊNCIAS CONSOLIDADAS — o que ficou aberto (2026-07-23)

> Índice único do que ainda falta, por categoria de bloqueio. Atualizado ao fim de
> cada sessão. Regra: código puro/testável primeiro; UI precisa da skill
> `astrum-design`; operacional/dados/escala é gatilho externo (Lucas).

---

## 🎨 UI — precisa da skill `astrum-design` (não carregável como Skill nesta sessão)

| Item | O que é | Fonte |
|---|---|---|
| **PLANO_G inteiro** | UI/UX 2.0 nível Linear/Stripe/Attio: home inteligente, command palette total, IA-nativo, polish (G-01..G-07) | `nextgen-2.0/PLANO_G_UIUX_2.0__PENDENTE.md` |
| **F2-02** | Card "O que a Astrum pensou esta noite" no dashboard (consome `GET /api/v2/ia/reflections`) | PLANO_F Fase 2 |
| **F2-03** | Card de autoevolução no ValorGeradoPage (consome `/api/v2/ia/autoevolucao/report`) | PLANO_F Fase 2 |
| **F3-01 / D-04 UI** | `IncidentsPage.tsx` — lista de incidentes + botões confirm/communicate/normalize (backend 100% pronto) | PLANO_F Fase 3 |
| **F6-04** | Botão "Análise Completa WhatsApp Engine" + página de relatório (rota `/genesis/retro-analysis` já existe) | PLANO_F Fase 6 |
| **PLANO_I refinos** | Dossiê visual da OS na UI, deep-link Waze na PWA, dispatch drag-and-drop | `nextgen-2.0/PLANO_I_UBER_DO_TECNICO__PENDENTE.md` |

## 🔑 Ativação operacional — precisa de flags/chaves reais no `.env` (Lucas)

| Item | Passo |
|---|---|
| **F1-01** | Aplicar migrations pendentes em produção (`npm run db:migrate` apontando prod) |
| **F1-02** | `npm run seed:demo` em staging e conferir as 6 telas |
| **Cutover flags** | `ATENDIMENTO_ENGINE=v2`/`COBRAI_ENGINE=v2` já no tenant demo; replicar em prod |
| **IA de campo (I-4)** | `VISION_STRUCTURED_ENABLED`, `FIELD_SUMMARY_LLM_ENABLED`, `FIELD_WHATSAPP_NOTIFY_ENABLED` + `OPENAI_API_KEY`/`EVOLUTION_API_*` reais |
| **NOC (D-04)** | `NOC_AUTONOMO_ENABLED=true` para o scan automático de incidentes |
| **Cérebro noturno** | `NIGHTLY_BRAIN_ENABLED` / `NIGHTLY_BRAIN_ACT_ENABLED` |
| **Gateway Asaas (F6-02)** | Cadastrar credencial `provider='asaas'` em `tenant_erp_credentials` p/ o sync rodar |

## 📊 Diferenciais bloqueados em DADOS (30–90 dias de tráfego real no v2)

| Item | O que é | Combustível |
|---|---|---|
| **D-02** | Backtesting de régua (motor existe `policy-backtest`) — calibrar com histórico real | 90d de faturas/variantes |
| **D-08** | CFO virtual (motor `cashflow` existe) — calibrar | 90d de cobrança |
| **D-01** | Gêmeo digital da rede | 60d de telemetria + topologia |
| **D-10** | Fine-tune ISP-BR | ≥5k exemplos rotulados + eval ≥300 |

## 🏢 Diferenciais bloqueados em ESCALA (nº de tenants)

| Item | Combustível |
|---|---|
| **D-09** Índice Astrum (benchmark federado) | ≥10 tenants + LGPD |
| **D-17** Marketplace de playbooks | ≥10 tenants + D-02 |
| **D-16** Foundry (automação em linguagem natural) | ≥5 tenants pedindo coisas diferentes |
| **D-13** Conectores auto-gerados | 2+ pedidos de ERP fora do top-5 |
| **PLANO_H — Constelação** | Atlas/Cobra/Gênesis standalone: Horizonte 2 = 10 ISPs pagantes (§0 é lei) |

## 🤝 Bloqueados em parceria/decisão comercial (Lucas)

| Item | Desbloqueio |
|---|---|
| **P6 — CPE/OZmap** | Contato Anlix/Flashman ou ACS do ERP |
| **D-11 — Plataforma MCP** | 3 parceiros de design |
| **D-03 — Negociador com alçada** | Alçadas definidas + IA-20 |
| **D-12 — Voice-first** | Custo/chamada validado + pricing |
| **D-18 — Cartório de IA** | 1º caso real ou venda enterprise |

## 🟢 Código puro ainda executável agora (candidatos à próxima sessão)

- **D-04 auto-communicate (Fase 2 avançada):** auto-avançar suspeita→confirmada→comunicada
  quando severidade alta + flag `auto_communicate` por tenant (hoje é gate humano).
- **F6-01 wiring:** ligar `history-import.service` a um worker BullMQ disparável (o motor existe).
- **D-05 CSAT real:** o scoring já aceita `csatScore`, mas hoje entra sempre `null` —
  ligar à fonte real de CSAT (`nps-csat.service`) fecha o sinal de qualidade.

---

## Já FECHADO nesta leva (para não reabrir)

- ✅ Cutover Onda 2 (tenant demo: engine v2 + 13 flags)
- ✅ PLANO_I completo (I-1..I-4 + mapa MapLibre/OSM + dispatch)
- ✅ PLANO_F F6-02 (sync Asaas→invoices)
- ✅ D-04 Fase 2 (supressão de tickets + confirmação)
- ✅ D-05 Fase 2 (confirmação do cliente encurta quarentena 7d→1d + fila priorizada)
