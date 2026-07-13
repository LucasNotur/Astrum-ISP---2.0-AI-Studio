# NEXTGEN 2.0 — PLANO E — AUTOEVOLUÇÃO: A ASTRUM QUE PENSA E MELHORA TODO DIA
# Criado em 2026-07-12 (sessão de checkup geral). Status: PENDENTE (desbloqueio: Onda 2 — tráfego real).

> **A tese:** todo concorrente melhora quando um humano decide melhorar. A Astrum
> melhora **sozinha, toda noite**, porque o repo já tem os órgãos do loop de
> aprendizado (eval, replay, bandits, drift, RAGAS, KB viva, custo por resposta).
> Este plano liga esses órgãos num **ciclo fechado de reflexão → hipótese →
> experimento → promoção com gate → registro**. Nenhum concorrente do segmento
> tem NENHUMA das peças; a Astrum já tem todas — falta o maestro.

---

## §1 — OS TRÊS LOOPS DE PENSAMENTO (do mais rápido ao mais lento)

### Loop 1 — REFLEXO (tempo real, já existe em peças)
Guardrails + constituição (IA-21/39) + judge + fallback multi-provider (IA-43).
A cada resposta: avaliar, corrigir, registrar. **Estado: implementado. Falta: flags ON (Onda 2).**

### Loop 2 — SONO (noturno — o coração deste plano)
Um worker `nightly-brain` (BullMQ repeat, 03:00) que executa a "noite de sono" da Astrum:

1. **Reviver o dia** — replay (IA-46) das N conversas de pior CSAT/maior custo do dia
   em dry-run contra o prompt/política atual. Divergência = candidato a melhoria.
2. **Diagnosticar** — cruzar: drift (IA-31), RAGAS (qualidade RAG), custo por resposta
   (IA-34), taxa de escalação, tickets reabertos. Saída: **3 hipóteses do dia**, em
   linguagem natural, geradas por GPT-4o com acesso read-only às métricas
   ("o RAG não acha resposta para 'LOS piscando' → 14 escalações; hipótese: falta artigo KB").
3. **Agir dentro de alçada** —
   a. Falta de conhecimento → aciona o scanner D-05 (`POST /kb/drafts/scan`) e abre rascunho.
   b. Variante de mensagem com hipótese de ganho → cria braço novo no bandit (IA-26)
      com tráfego de 5% (a alçada é o próprio bandit — sem risco).
   c. Regressão de qualidade → roda o eval (IA-42); se score cair abaixo do baseline,
      abre incidente e NÃO mexe em nada (regra: eval é o juiz, nunca a intuição).
4. **Escrever o diário** — entrada em `ai_reflections` (nova tabela): hipóteses,
   ações tomadas, métricas antes. O dono lê no dashboard de manhã: **"o que a
   Astrum pensou esta noite"** — 5 linhas, não um relatório de 20 páginas.

### Loop 3 — ESTAÇÃO (semanal/mensal, com humano no gate)
- Semanal: fine-tune candidate check (D-10) — se `labeled_examples` cresceu o
  suficiente, propõe rodada de fine-tune; eval decide se promove.
- Mensal: backtesting de régua (D-02) com os 30d novos → proposta de política melhor
  → **Lucas aprova** → vira variante bandit.
- Mensal: relatório de autoevolução no dashboard Valor Gerado (P5): "este mês a
  Astrum aprendeu X artigos, promoveu Y variantes, reduziu custo/resposta em Z%".

---

## §2 — REGRAS DO ORGANISMO (invioláveis deste plano)

- **RE1 — Eval é o juiz.** Nada é promovido (prompt, variante, fine-tune, artigo KB
  com impacto em resposta) sem vencer o baseline no eval IA-42. Sem exceção.
- **RE2 — Alçada de mudança.** O loop noturno só age onde o raio de dano é limitado
  por design: bandit ≤5% de tráfego, rascunho KB (precisa curadoria humana),
  abertura de incidente. Mudança de prompt/política = sempre gate humano.
- **RE3 — Diário imutável.** Toda reflexão vai para `ai_reflections` com hash-chain
  (mesma disciplina do audit IA-06). A memória de "por que mudamos" nunca se perde.
- **RE4 — Um experimento por vez por domínio.** Cobrança, atendimento e vendas nunca
  recebem 2 experimentos simultâneos — senão não se sabe o que causou o quê.

---

## §3 — SESSÕES DE EXECUÇÃO (quando a Onda 2 liberar tráfego)

| Sessão | Entrega | Fundação já existente |
|---|---|---|
| E-01 | Tabela `ai_reflections` + worker `nightly-brain` esqueleto (só diagnóstico, sem ação) | drift.worker, replay.service, cost-recorder |
| E-02 | Gerador de hipóteses (GPT-4o sobre métricas do dia) + card "O que pensei esta noite" no dashboard | AICostsPage, dashboards U6 |
| E-03 | Ações de alçada: scan D-05 + braço bandit 5% | kb-draft.service, variant-picker |
| E-04 | Gate de eval automático (roda IA-42 antes/depois de qualquer promoção) | eval/run-eval.ts |
| E-05 | Relatório mensal de autoevolução no Valor Gerado (P5) | valor-gerado service |

**Critério de fechamento:** 30 dias de diário noturno ininterrupto + ≥3 melhorias
promovidas por eval (não por opinião) + dono lendo o card matinal (telemetria de clique).

---

## §4 — POR QUE ISSO É INALCANÇÁVEL PARA OS CONCORRENTES

O loop precisa de: eval próprio (IA-42), replay seguro (IA-46), bandits (IA-26),
atribuição de custo (IA-34), KB auto-gerada (D-05), drift (IA-31) e auditoria
hash-chain (IA-06) — **sete sistemas que já existem neste repo** e que os
concorrentes (Mundiale, Elleven, bots de ERP) não têm nem o primeiro. Copiar o
marketing é fácil; copiar o organismo é reescrever 98 sessões de engenharia.


---

## §5 — EXECUÇÃO REGISTRADA (2026-07-13) — E-01..E-05 CODIFICADOS

Destravado com combustível sintético (ISP Demo Astrolândia, IA-45) a pedido do
Lucas ("por que não codar com exemplos e calibrar depois?"). TUDO rodou E2E no
tenant demo local:

- **E-01/E-02** — `nightly-brain.service.ts` (migration 077 `ai_reflections`):
  gatherDailyMetrics → generateHypotheses POR REGRAS (o LLM só refinaria texto,
  RE1) → suggestActions em alçada → diário upsert. Rotas GET/POST
  `/api/v2/ia/reflections`. Flag NIGHTLY_BRAIN_ENABLED.
- **E-03** — `nightly-actions.service.ts`: executeSuggestedActions dentro de
  alçada (RE2) — kb_scan gera RASCUNHOS (humano aprova), open_incident abre
  'suspeita' (comunicar tem gate humano), bandit/prompt NUNCA executam.
  Flag NIGHTLY_BRAIN_ACT_ENABLED. Prova de fogo: 10 rascunhos gerados no demo.
- **E-04** — `eval-gate.service.ts`: checkEvalGate/assertPromotionAllowed sobre
  o spec-tracker (IA-42). FAIL-CLOSED (sem baseline/resultado = bloqueia).
  Rota GET `/api/v2/ia/eval-gate`. É o juiz obrigatório de qualquer promoção (RE1).
- **E-05** — `autoevolucao-report.service.ts`: relatório mensal (noites,
  hipóteses, ações, KB gerada/publicada, incidentes, tendência de custo) com
  headline pronta para o card do Valor Gerado (P5). Rota GET
  `/api/v2/ia/autoevolucao/report`.
- Testes: 23 (E-01..E-05). Prova de fogo em `scripts/seed/run-brain-demo.ts`.

**O que resta (calibragem com tráfego real, não código):** afinar os limiares
das regras (E-02) com dados reais; ligar o worker noturno 03:00 (hoje é sob
demanda via rota); refino LLM opcional (E-02, flag NIGHTLY_BRAIN_LLM).
Status do plano: de PENDENTE para **CODE-COMPLETE** — renomear na próxima sessão
que ligar o worker cron.
