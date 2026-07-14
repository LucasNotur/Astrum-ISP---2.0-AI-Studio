# ⭐ PRÓXIMOS PASSOS — o ÚNICO arquivo que você precisa abrir
# Atualizado 2026-07-13. Quando algo daqui for feito, risque e atualize AQUI.
# (Detalhe de execução: PLANO_F. Contexto: 00_PLANO. Mas a ORDEM é esta.)

## VOCÊ (Lucas) — em ordem, o caminho crítico

1. [ ] **Aplicar migrations em produção** (30 min) — `npm run db:migrate` com a
       DATABASE_URL de produção. Valida com `--dry-run` antes. Destrava TUDO.
2. [ ] **VPS** (Hetzner/DO/Contabo, ~R$ 50–100/mês) — necessário só para:
       webhooks de canais reais (WhatsApp exige URL pública) e workers 24/7.
       Me chame (ou o Sonnet com o PLANO_F) que montamos o deploy.
3. [ ] **Escolher o ISP piloto** e conectar o ERP dele (IXC real destrava a
       homologação P0). Shadow mode 7 dias → `ATENDIMENTO_ENGINE=v2`.
4. [ ] **Conta Asaas/gateway** (se o piloto usar) — vira conector do Gênesis (D-23).
5. [ ] Parcerias: CPE/OZmap (P6) e ClickSign/D4Sign keys (P3).

## A IA EXECUTORA (Sonnet via PLANO_F) — em ordem de valor

1. [ ] **F2-01** Worker cron do cérebro noturno (03:00) — o cérebro já pensa;
       falta pensar sozinho.
2. [ ] **D-23 Gênesis Engine** (NOVO, ver PLANO_A §2c + PLANO_F F6) — plug-and-play:
       conectar WhatsApp/ERP/Asaas/planilha → a Astrum se preenche sozinha +
       botão "Análise Completa WhatsApp" (o núcleo retroativo JÁ está codado:
       `whatsapp-retro.service.ts`).
3. [ ] **G-01** Home inteligente por papel (o maior salto de percepção de valor).
4. [ ] **F1-03** Signup aplica tier ao tenant (radar_trial → astrum).
5. [ ] **F3-01** Tela de incidentes (D-04 já tem API completa).
6. [ ] **Telas dos 3 cérebros** (D-01/D-02/D-08 — APIs prontas, ver PLANO_A §9):
       /intelligence/twin, /intelligence/policy-lab, /intelligence/cfo.
7. [ ] Resto do PLANO_F (fases 4–6) e PLANO_G (G-02..G-07).
8. [ ] Preparos da CONSTELAÇÃO sem quebrar o foco (PLANO_H §6): higiene do core,
       ISSUE_BUCKETS configurável, adapter Asaas (dupla função), alvo externo no túnel.

## O FUTURO ALÉM DO ISP (quando os gatilhos dispararem)
`PLANO_H_CONSTELACAO` — os produtos escondidos no que você já tem: **Atlas**
(rastreadoras/monitoramento, ~75% reuso), **Cobra** (cobrança IA p/ qualquer
mensalidade, success fee 5%), **Gênesis standalone** (raio-X de WhatsApp p/
qualquer PME, R$297), **Túnel** (QA de bots), **Selo** (compliance de IA),
**Foundry** (licenciar a fábrica). Gatilho do Horizonte 2: 10 ISPs pagantes.

## O ESTADO EM UMA LINHA
Código: 177 arquivos de teste / 1396 testes / tsc 0. Motores D-01/02/04/05/06F1/
07/08/15 + E-01..05 prontos e provados no demo. Preço: R$ 2,50 × assinante.
**Gargalo: operação (itens 1–3 seus), não código.**

## ONDE ESTÁ CADA COISA (mapa de 5 linhas)
- **Este arquivo** → a ordem do que fazer.
- `progress/3-dossie/DOSSIE_ASTRUM.md` → o que é cada tecnologia (119 catalogadas).
- `.astrum-progress/nextgen-2.0/PLANO_F_...` → o passo-a-passo de execução (Sonnet).
- `.astrum-progress/CEREBRO_FABLE5_ASTRUM.md` → como a IA deve pensar aqui.
- `.astrum-progress/PROGRESS_LOG.md` → o diário do que já aconteceu.
