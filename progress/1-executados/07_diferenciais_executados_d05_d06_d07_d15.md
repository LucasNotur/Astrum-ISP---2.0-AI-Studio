# Diferenciais inéditos JÁ EXECUTADOS — D-05, D-06 F1, D-07, D-15 — ✅ (2026-07-12)

**Fonte:** `.astrum-progress/nextgen-2.0/PLANO_A_DIFERENCIAL_TECNOLOGIAS_INEDITAS__PENDENTE.md` §5–§8

## D-05 — Memória institucional viva (KB que se escreve sozinha)
Conversa resolvida e confirmada → GPT-4o gera rascunho de artigo → curador aprova com
1 clique → artigo entra no RAG. Em meses o provedor tem a documentação que nunca teve.
**Código:** `apps/api/src/domain/conhecimento/kb-draft.*` + aba na LabelingPage + migration 071.

## D-06 Fase 1 — Copiloto de campo (foto → diagnóstico → OS)
Técnico fotografa a CTO/ONU → visão estruturada classifica (equipamento, problema,
severidade) → anexa o diagnóstico na OS. **Código:** `apps/api/src/domain/campo/` +
seção na TechnicianAppPage + migration 069. Fases 2 (voz) e 3 (histórico visual da
planta) → pendentes.

## D-07 — Vendedor autônomo com LTV calibrado na oferta
No funil de vendas, a oferta é calibrada pelo LTV previsto do lead E pela ocupação da
CTO (não vende 1GB onde a rede está 95% cheia). **Código:** `ltv-offer.service` +
integração no `vendas.subgraph` + painel comercial + migration 070.

## D-15 — Túnel de Vento (população sintética de assinantes)
12 personas LLM (3 adversariais: caçador de desconto, injeção de prompt, sondagem
LGPD) conversam multi-turn com o agente REAL em staging; checks determinísticos +
judge 1–5; pass-rate vira gate objetivo do cutover. **Código:**
`apps/api/src/domain/ia/wind-tunnel/` + migration 072 + flag `WIND_TUNNEL_ENABLED`.
**Não depende de tráfego real — pode rodar HOJE em staging.**
