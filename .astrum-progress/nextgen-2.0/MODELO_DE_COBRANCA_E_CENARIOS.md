# NEXTGEN 2.0 — MODELO DE COBRANÇA E CENÁRIOS PÓS-IMPLEMENTAÇÃO
# "Quanto a Astrum entrega, quanto deve custar, e o que se abre depois"

> Escrito em 2026-07-08 a pedido do Lucas. Premissas: todos os planos executados
> (IA-NEXTGEN Partes 1-2 + Nextgen 2.0 A/B/C) e Astrum operando em produção via
> conectores ERP (Plano B, P0). Números do setor são ESTIMATIVAS de mercado
> (marcadas como tal) — a regra RN20 manda substituí-los por números MEDIDOS do
> dashboard "Valor Gerado" (P5-01) assim que houver tenants em produção.
> ISP de referência nos cálculos: **1.862 assinantes** (exemplo do Lucas),
> ticket médio assumido R$ 90 → receita ≈ R$ 167 mil/mês.

---

## §1 — O VALOR ENTREGUE (ISP de 1.862 assinantes, regime maduro 6-12 meses)

| Frente | Mecanismo (planos) | Estimativa/mês |
|---|---|---|
| **Atendimento** | 80-86% dos ~1.500-2.500 contatos/mês resolvidos sem humano (IA-01/02/21, P1) → evita 1,5-2 posições de atendente (custo total c/ encargos ~R$ 3,5-4,5k cada) | **R$ 5k – 9k** |
| **Cobrança** | Inadimplência setorial 3-6% da receita (~R$ 8,3k em risco a 5%); bandit + negociação + religue recuperando 20-40% a mais e mais cedo (IA-26, P1, D-02/03) | **R$ 1,5k – 3,5k** + caixa antecipado |
| **Churn** | ~46 cancelamentos/mês (2,5% setorial); retenção proativa salvando 10-15% (IA-07/23/38) = 5-7 clientes × R$ 90 de MRR preservado, CUMULATIVO → após 12 meses | **R$ 5,5k – 7,5k** preservados/mês |
| **Campo/NOC** | Visita técnica custa R$ 80-150; diagnóstico remoto + anomalia preventiva (IA-09/16/24, D-04) cortando 20-30% de ~180-250 OS/mês | **R$ 2,5k – 5k** |
| **Crise** | Comunicação preventiva em massa corta 30-60% do pico de tickets em queda (D-04) — plantão/hora extra evitados | **R$ 0,5k – 1,5k** |
| **Vendas** | Funil 24/7 (P3, D-07): +3-6 instalações/mês fora do horário comercial, MRR cumulativo | +R$ 270-540 MRR/mês |
| **Gestão** | CFO virtual, previsão de demanda, benchmark (D-08/09, IA-25) — tempo e decisão do dono | não monetizado (honestidade) |

**Total tangível: ~R$ 10k – 20k/mês** para esse perfil — **6 a 12% da receita do
ISP**. Contra uma mensalidade de ~R$ 4,7k (modelo atual do Lucas), o ROI medido
fica entre **2× e 4×**. Regra de venda: NUNCA prometer esses números — MEDIR
(P5-01) e provar no histórico do próprio cliente (D-02 backtesting).

## §2 — CENÁRIOS QUE SE ABREM (pós-implementação)

1. **ISP 24/7 de verdade** — voz + NOC autônomo = madrugada sem plantonista.
   Argumento de venda emocional mais forte para o dono (é a dor pessoal dele).
2. **O dono vira gestor orientado a dado** — CFO virtual + previsões: decide
   expansão de rede, contratação e campanha com número, não intuição.
3. **Efeito de rede (Índice Astrum, D-09)** — cada tenant novo melhora o
   benchmark; vira autoridade de imprensa do setor e moat que concorrente não
   copia sem a base.
4. **Plataforma (D-11)** — parceiros construindo sobre o MCP/API = receita de
   ecossistema e lock-in positivo.
5. **A escada até o ERP (Plano B §2)** — cada degrau de substituição multiplica
   o ARPU por tenant (2-3× no longo prazo) sem custo de aquisição novo.
6. **Consolidação do mercado (M&A)** — o setor ISP BR está em onda de fusões;
   um ISP com dados Astrum organizados vale mais na venda, e a Astrum vira
   ferramenta de due diligence do comprador. Cenário de receita nova
   (relatório de M&A) e de defesa (o consolidador padroniza na Astrum).
7. **Assinante final melhor atendido** — NPS sobe, churn cai, e o ISP usa isso
   contra as grandes operadoras (o diferencial histórico do ISP regional é
   atendimento — a Astrum industrializa isso sem perder o "jeito local").

## §3 — MODELO DE COBRANÇA RECOMENDADO

### 3a. Avaliação do modelo atual do Lucas
Híbrido "piso fixo + R$/assinante excedente" (ex.: R$ 2.500 + R$ 2,50/assinante
acima do escopo; 1.862 assinantes ≈ R$ 4,7k ≈ R$ 2,50/assinante efetivo).
**Veredito: a MECÂNICA está certa** (previsibilidade + escala com o cliente, e é
o modelo mental do setor — ERP, OZmap, tudo se paga por assinante). Dois ajustes:
- **Na entrada, o piso de R$ 2,5k é alto** — ISP de 400-800 assinantes pagaria
  R$ 3-6/assinante, matando a estratégia "barra de entrada zero" (Plano B §2,
  degrau 0) e a resposta ao trial do James (P5-05).
- **No teto, R$ 2,50/assinante é barato para o stack completo** — com voz,
  vendas autônomas, NOC e negociador, deixa dinheiro na mesa (valor entregue de
  6-12% da receita suporta captura maior).

### 3b. Estrutura proposta: 3 degraus + consumo + success fee
Espelha a escada de entrada (Plano B §2) — o cliente sobe de degrau no produto E
no preço, com o dashboard de valor justificando cada upgrade:

| Tier | Cobre (degraus) | Preço/assinante | Piso mensal | 1.862 assin. |
|---|---|---|---|---|
| **Radar** | 0-1: conector ERP, dashboards, churn, saúde de rede (read-only) | R$ 1,20 | R$ 690 | ≈ R$ 2,2k |
| **Copiloto** | 2: + atendimento IA omnichannel, cobrança IA agindo via ERP | R$ 2,80 | R$ 1.990 | ≈ R$ 5,2k |
| **Autônomo** | 3: + vendas, NOC preventivo, negociador c/ alçada, CFO virtual | R$ 4,50 | R$ 3.990 | ≈ R$ 8,4k |

- **Voz é SEMPRE consumo** (add-on em qualquer tier): a Realtime API tem custo
  real por minuto — vender pacotes (ex.: 1.000 min/mês) com margem, nunca
  embutir ilimitado no tier. Idem excedentes pesados de dados sintéticos/batch.
- **Success fee OPCIONAL na cobrança:** 8-10% do incremental de recuperação
  ACIMA do baseline provado pelo backtesting (D-02), com teto mensal p/
  previsibilidade. Só a Astrum consegue oferecer isso de forma auditável —
  nenhum concorrente prova incremento. Ótimo para destravar ISP cético: "se
  não recuperar mais, não paga".
- **Trial 14 dias** (P5-05): tier Radar grátis, terminando com o relatório
  "no seu histórico, a Astrum teria recuperado R$ X" (D-02).

### 3c. Sanidade econômica (unit economics da Astrum)
- Custo de IA por assinante/mês (texto): **R$ 0,10-0,35** com a arquitetura real
  (gpt-4o-mini dominante, cache semântico IA-02, compressão IA-30, batching
  IA-37; medido por tenant pela IA-34) → margem bruta 85-92% nos tiers.
- Voz: US$ 0,06-0,30/min na Realtime — por isso consumo, nunca flat.
- Âncora de preço: NUNCA se comparar por preço com bot de WhatsApp (James é mais
  barato e sempre será). A fatura da Astrum deve aparecer AO LADO do "Valor
  Gerado" do mês (P5-01): "custou R$ 5,2k, entregou R$ 14,1k medidos".

### 3d. Decisões em aberto (do Lucas)
1. Valores finais por tier (os acima são ponto de partida calibrado por valor).
2. Success fee: % e teto; entra no contrato padrão ou só como destrava?
3. Piso do Radar: R$ 690 ou ainda mais baixo (R$ 0?) para maximizar funil?
4. White-label/revenda (U6-01) como tier próprio ou negociação enterprise.
