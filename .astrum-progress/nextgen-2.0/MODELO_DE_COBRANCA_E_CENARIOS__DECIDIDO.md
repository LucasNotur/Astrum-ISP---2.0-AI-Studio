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

*(Revisado em 2026-07-08 após feedback do Lucas: o modelo precisa nascer da dor
de cada PORTE — o de 500 não pode pagar barreira de entrada; quem cresce sobe de
degrau com o caixa que a própria Astrum gerou. A mecânica dele — piso + por
assinante — foi mantida e generalizada em FAIXAS PROGRESSIVAS, estilo alíquota
marginal: cada faixa só cobra pelos assinantes DENTRO dela; crescer 1 assinante
nunca dá salto de fatura.)*

**RADAR** (porta de entrada/funil — preço de gancho, flat por porte):
até 1.000 = **R$ 349** · até 3.000 = **R$ 690** · até 5.000 = **R$ 990** ·
até 10.000 = **R$ 1.490** · até 20.000 = **R$ 1.990**

**COPILOTO** — piso **R$ 890** (já inclui os primeiros 500 assinantes) + faixas:
501-2.000 = **R$ 2,20**/assin. · 2.001-5.000 = **R$ 1,80** ·
5.001-10.000 = **R$ 1,40** · acima de 10.000 = **R$ 1,00**

**AUTÔNOMO** — piso **R$ 1.990** (inclui 500) + faixas:
501-2.000 = **R$ 3,60** · 2.001-5.000 = **R$ 3,00** ·
5.001-10.000 = **R$ 2,30** · acima de 10.000 = **R$ 1,70** (+ voz por consumo)

### Tabela de exemplos por porte (ticket médio assumido R$ 90; valor = 6-12% da receita)

| Assinantes | Receita ISP/mês | Valor Astrum est./mês | Radar | Copiloto (R$/assin.) | Autônomo (R$/assin.) | ROI Copiloto |
|---|---|---|---|---|---|---|
| 500 | R$ 45k | R$ 2,7k – 5,4k | R$ 349 | **R$ 890** (1,78) | R$ 1.990 (3,98) | 3-6× |
| 1.000 | R$ 90k | R$ 5,4k – 10,8k | R$ 349 | **R$ 1.990** (1,99) | R$ 3.790 (3,79) | 2,7-5,4× |
| 3.000 | R$ 270k | R$ 16k – 32k | R$ 690 | **R$ 5.990** (2,00) | R$ 10.390 (3,46) | 2,7-5,3× |
| 5.000 | R$ 450k | R$ 27k – 54k | R$ 990 | **R$ 9.590** (1,92) | R$ 16.390 (3,28) | 2,8-5,6× |
| 8.000 | R$ 720k | R$ 43k – 86k | R$ 1.490 | **R$ 13.790** (1,72) | R$ 23.290 (2,91) | 3,1-6,2× |
| 10.000 | R$ 900k | R$ 54k – 108k | R$ 1.490 | **R$ 16.590** (1,66) | R$ 27.890 (2,79) | 3,3-6,5× |
| 15.000 | R$ 1,35M | R$ 81k – 162k | R$ 1.990 | **R$ 21.590** (1,44) | R$ 36.390 (2,43) | 3,8-7,5× |
| 20.000 | R$ 1,8M | R$ 108k – 216k | R$ 1.990 | **R$ 26.590** (1,33) | R$ 44.890 (2,24) | 4,1-8,1× |

Conferência com o exemplo real do Lucas (1.862 assin.): Copiloto = 890 +
1.362×2,20 = **R$ 3.886** (R$ 2,09/assin.) · Autônomo = 1.990 + 1.362×3,60 =
**R$ 6.893**. O preço atual dele (R$ 4.655) fica ENTRE os dois — coerente.

### A dor e a âncora de venda por porte (o argumento, não só o número)
- **500** — o dono atende de madrugada e é refém do único atendente. Âncora:
  Copiloto custa **¼ de um atendente CLT** (custo total R$ 3,5-4,5k) e não tira
  férias. É aqui que o James ganha hoje por preço — R$ 890 compete de igual.
- **1.000** — a primeira contratação evitada JÁ paga o ano de Astrum.
- **3.000** — 2-3 atendentes + técnico de plantão; a conta muda para "equipe
  que eu não precisei montar" (R$ 10-15k/mês de folha evitada).
- **5.000-8.000** — nasce a dor de NOC/plantão noturno e de gestão de campo;
  âncora: Autônomo custa menos que o plantão que ele elimina.
- **10.000+** — operação multi-cidade: benchmark, SLA, white-label, M&A.
  Acima de ~15k é ENTERPRISE: contrato negociado (a tabela vira teto de
  referência, não preço de balcão), success fee maior, CSM dedicado.

### Gatilhos de upgrade (a escada §2 do Plano B em versão comercial)
O upgrade nunca é empurrado por vendedor — é disparado pelo produto: quando o
dashboard "Valor Gerado" (P5-01) mostra por 2 meses seguidos valor medido ≥3×
a mensalidade, a Astrum oferece o degrau seguinte DENTRO do produto, com o
número do próprio cliente como argumento ("o Copiloto te devolveu R$ 18k em 60
dias; o Autônomo destrava a madrugada e as vendas"). O ISP sobe quando tem
caixa — caixa que a Astrum ajudou a criar.

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
1. Valores finais das faixas (os acima são ponto de partida calibrado por valor;
   validar contra o custo real medido pela IA-34 nos primeiros pilotos).
2. Success fee: % e teto; entra no contrato padrão ou só como destrava?
3. Radar de entrada: R$ 349 ou R$ 0 (grátis permanente até 1.000 assinantes?)
   para maximizar o funil contra o trial do James — trade-off: funil × percepção
   de valor ("de graça não vale nada").
4. White-label/revenda (U6-01) como tier próprio ou negociação enterprise.
5. Limiar do enterprise: a partir de quantos assinantes a tabela vira "sob
   consulta" (sugestão: 15.000).

---

## §5 — DECISÃO DO LUCAS (2026-07-13) — A ESCADA OFICIAL

> Mapa dado pelo Lucas: **R$ 2,50/assinante do ISP** é o preço-base da Astrum
> completa (acima de 1.000 assinantes). Abaixo de 1.000: degrau de entrada com
> ferramentas limitadas, preço calibrado pelo mercado. Radar = cavalo de troia.
> Implementado em `src/lib/plans.ts` (ASTRUM_LADDER) + testes.

| Degrau | Preço | Teto | O que abre |
|---|---|---|---|
| **RADAR** | **R$ 0 para sempre** | 1.000 assinantes | Conector ERP leitura + radar de churn/inadimplência + relatório mensal + mapa. NÃO opera — só mostra o dinheiro vazando. |
| **OPERAÇÃO** | **R$ 1,90/assinante** (piso R$ 349) | 1.000 assinantes | Atendimento IA + CobrAI + 2ª via + inbox + tickets/OS + KB + CSAT. |
| **AUTONOMIA** | **R$ 2,50/assinante** (piso R$ 990) | sem teto | Astrum 100% — omnichannel, voz, vendas com LTV, campo, religue, NOC, Valor Gerado, API/MCP. |
| **ENTERPRISE** | sob consulta (base 2,50 − volume) | sem teto | Autonomia + CSM + SLA + success fee de recuperação. |

Racional do R$ 1,90 (<1k): bots do Anel 2 cobram R$ 500–1.500 FIXOS. Um ISP de
700 assinantes paga R$ 1.330 na Astrum Operação — competitivo — e o de 300 paga
o piso R$ 349, mais barato que qualquer bot burro. A régua marginal preserva o
incentivo de crescer para a Autonomia (1.001 assinantes × 2,50 = R$ 2.502).

## §6 — PREÇO POR FERRAMENTA (o argumento de que R$ 2,50 é barato)

O que cada peça custaria se comprada avulsa no mercado (referências jul/2026 —
bots de WhatsApp, ferramentas de BI, plataformas de voz, sistemas de campo):

| Ferramenta Astrum | Equivalente avulso no mercado | Preço avulso típico/mês |
|---|---|---|
| Atendimento IA WhatsApp (motor completo c/ RAG) | Mundiale/Elleven bot | R$ 800–2.500 |
| CobrAI (régua + variantes que aprendem) | régua de ERP + equipe | R$ 500–1.500 |
| Omnichannel (IG/Messenger/e-mail/inbox) | plataforma omnichannel | R$ 400–1.200 |
| Voz IA (atende no 1º toque) | URA inteligente | R$ 1.000–3.000 |
| Funil de vendas autônomo + contrato digital | CRM + ClickSign + humano | R$ 600–1.500 |
| Copiloto de campo (foto→diagnóstico) | não existe no mercado | — |
| Radar de churn/inadimplência preditivo | BI + cientista de dados | R$ 2.000+ |
| NOC proativo (aviso de falha em massa) | não existe automatizado | — |
| Dashboard Valor Gerado + status page | ferramentas separadas | R$ 200–500 |
| Auditoria imutável + LGPD + compliance | consultoria | R$ 1.000+ |
| **SOMA se comprado separado** | | **R$ 6.500–13.000+/mês** |
| **Astrum Autonomia (ISP 3.000 assinantes)** | | **R$ 7.500/mês — TUDO integrado no mesmo cérebro** |

O argumento de venda não é "somos mais baratos" — é: **pelo preço de 2 ferramentas
avulsas você leva 10, integradas, que aprendem juntas.** E o ROI medido (dashboard
Valor Gerado) fecha a conta: meta contratual de ROI ≥3× o custo.

Decisões §3d fechadas: faixas = régua marginal simples por assinante (acima);
success fee = só no Enterprise (opcional); **Radar = grátis permanente até 1.000**;
limiar enterprise = 30k assinantes.


---

## §7 — REVISÃO FINAL (Lucas, 2026-07-13): PREÇO ÚNICO, SEM ALMOÇO GRÁTIS

> Correção do Lucas sobre o §5: **"são 2,5 × a quantidade de assinantes, padrão
> em qualquer quantidade, sem almoço grátis."** O §5 fica como histórico; VALE ESTA:

| Degrau | Preço | O que é |
|---|---|---|
| **Radar** | R$ 0 por **14 dias** (trial P5-05, sem cartão) | O cavalo de troia: conecta o ERP, mostra o dinheiro vazando, termina no relatório "quanto você teria economizado" |
| **Astrum** | **R$ 2,50 × assinantes — qualquer quantidade** | Tudo. Sem faixas, sem piso, sem desconto por volume, sem enterprise negociado. 200 assinantes = R$ 500; 50.000 = R$ 125.000 |

Implementação: `src/lib/plans.ts` (PRICE_PER_SUBSCRIBER_CENTS = 250) + migration 080.
A tabela de valor por ferramenta (§6) continua sendo o argumento: a soma avulsa
custa R$ 6,5–13k/mês — a Astrum entrega tudo integrado pela régua mais simples
do mercado. Um número, uma multiplicação, zero letra miúda.
