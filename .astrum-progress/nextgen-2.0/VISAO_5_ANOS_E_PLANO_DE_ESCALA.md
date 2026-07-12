# ASTRUM — VISÃO DE 5 ANOS E PLANO DE ESCALA
# Documento de apoio (não é plano de execução — não recebe status).
# Criado em 2026-07-12 na sessão de checkup geral. Base: PLANO_B §1 (quadro
# competitivo jul/2026), MODELO_DE_COBRANCA, estado real do repo (98 sessões).

---

## §1 — ONDE A ASTRUM ESTÁ HOJE (leitura fria)

**Ativo construído:** um motor agentic completo (46 blocos IA + 12 blocos de
infra), paridade competitiva P0–P5 code-complete, UI/UX nova, 1312 testes verdes,
7 sistemas de aprendizado que nenhum concorrente tem (eval, replay, bandits,
drift, RAGAS, KB viva, custo por resposta). **Passivo:** zero clientes pagantes,
zero tráfego real, decisões de preço paradas, cutover não executado.

**Tradução:** a Astrum é hoje um caça de 5ª geração estacionado no hangar.
O risco não é tecnológico — é ficar polindo a fuselagem em vez de decolar.
**Tudo nos próximos 12 meses se resume a: colocar tráfego real no motor.**

## §2 — O MERCADO EM 5 ANOS (2026 → 2031)

1. **O nicho é grande e invisível para big tech.** ~20 mil ISPs regionais no
   Brasil (ANATEL), maioria entre 1k e 30k assinantes. Big tech vende nuvem e
   modelo — não desce para integrar IXC com régua de cobrança em Sorocaba.
   O risco competitivo real são os **ERPs incumbentes** (IXC/Voalle/MK/SGP), que
   têm a distribuição, e comprarão ou copiarão um "bot" — mas raso.
2. **IA conversacional vira commodity até 2028.** "Ter um bot de WhatsApp" não
   diferenciará ninguém. O que não commoditiza: dados proprietários rotulados do
   nicho (D-10), efeito de rede entre tenants (D-09/D-17), switching cost da
   memória institucional (D-05 — a KB do cliente mora na Astrum), e **velocidade
   de evolução** (Plano E: o produto melhora toda noite sem contratar ninguém).
3. **Consolidação dos ISPs.** Os pequenos vão se fundir/vender. Quem opera a
   inteligência dos consolidadores fica com o mercado inteiro pela boca do funil.
4. **Regulação de IA chega.** Quem tiver auditoria hash-chain e compliance de
   fábrica (D-18) transforma o custo regulatório dos outros em vantagem própria.

## §3 — A TRAJETÓRIA (cenário base, execução disciplinada)

| Ano | Fase | Meta objetiva | O que destrava |
|---|---|---|---|
| **2026 H2** | Decolagem | Cutover no tenant piloto + **1º cliente externo pagante** com ROI ≥3× medido no dashboard | Onda 2 + P6 (100% Lucas) |
| **2027** | Prova | 10–20 ISPs, ~R$ 1,5–3M ARR, 3 cases públicos com número auditado, Índice Astrum v0 interno | Case engine (P5) já pronto |
| **2028** | Rede | 100+ tenants, fine-tune ISP-BR no ar (D-10), Índice Astrum público = autoridade de marca, marketplace de playbooks (D-17) | ≥10 tenants → D-09 |
| **2029** | Plataforma | Astrum vira infraestrutura: MCP/API para contabilidades, OZmap, integradores (D-11). Receita de plataforma além do SaaS | Parcerias (Lucas) |
| **2030–31** | Posição final | O "sistema operacional de IA" do ISP brasileiro: 500–1.000 tenants (~2,5–5% do mercado), R$ 30–80M ARR. Nesse ponto os desfechos são: (a) dominância independente, (b) aquisição por ERP incumbente a múltiplo de plataforma, (c) expansão LatAm (o problema é idêntico em ES/CO/MX) | Escala + Plano E rodando |

**A assimetria estrutural:** a Astrum é construída por 1 pessoa + agentes de
código. Custo marginal de engenharia ≈ custo de tokens. Concorrentes precisam de
squads; a Astrum precisa de sessões. Em 5 anos isso não é "vantagem de custo" —
é uma **espécie diferente de empresa**, e é o motivo de a janela ser AGORA:
essa vantagem só é exclusiva enquanto os outros não acordarem para ela.

**Riscos do cenário (e antídotos):** ERP incumbente lança bot nativo grátis
(antídoto: profundidade — eles não reescrevem 98 sessões; e D-17/D-09 criam rede
que ERP nenhum tem) · custo de LLM (antídoto: IA-34 + compression + D-10 mini
fine-tuned) · dependência do Lucas para operação comercial (antídoto: §4-F). 

## §4 — PLANO DE ESCALA: COMO CONSEGUIR CLIENTES (funil concreto)

**North-star metric: assinantes sob gestão da Astrum** (não nº de tenants —
1 ISP de 30k vale 30 de 1k).

### A. Fundação da venda (semanas 1–4 — tudo já codificado, falta operar)
1. Cutover piloto no ISP mais próximo (Onda 2) — sem case próprio não há venda.
2. Fechar preço (MODELO__AGUARDANDO_DECISAO): recomendação — **Radar grátis
   permanente até 1.000 assinantes** (CAC ≈ 0, é o cavalo de troia), Copiloto
   R$ 890, Autônomo R$ 1.990, success fee na recuperação de inadimplência.
3. Trial 14d sem cartão (P5-05 pronto) terminando no relatório "quanto a Astrum
   teria te economizado ESTE mês" (dashboard Valor Gerado, P5 pronto).

### B. O produto vende o produto (mecânicas embutidas, já construídas)
- **Radar grátis** = conector P0 lê o ERP e mostra o dinheiro vazando (churn
  previsto, inadimplência recuperável). O upgrade é um botão, não uma reunião.
- **Relatório de valor mensal** (P5) com número em R$ — vira e-mail que o dono
  encaminha para o sócio. Cada relatório é um vendedor.
- **Case engine** (P5-04): a cada meta batida no piloto, um case com número
  auditado sai da máquina.

### C. Canais (ordem de CAC, do menor para o maior)
1. **Comunidades de ISP** (grupos de WhatsApp/Telegram de provedores, fóruns
   técnicos): o Lucas é do meio — vender como par, não como fornecedor. Meta: 100%
   dos 10 primeiros clientes daqui. CAC ≈ R$ 0.
2. **Indicação estruturada entre ISPs:** vantagem única do nicho — ISPs de cidades
   diferentes NÃO competem entre si → indicam sem ciúme. Incentivo: 1 mês grátis
   para quem indica + trial estendido para o indicado. Meta: ≥40% dos deals do ano 1.
3. **Eventos do setor** (Abrint e regionais): 1 estande pequeno + demo ao vivo do
   Radar lendo o ERP do visitante NA HORA (conector P0 permite). Um "uau" físico
   vale 6 meses de anúncio.
4. **Conteúdo de autoridade:** Índice Astrum (D-09) mensal público + posts "por
   dentro da IA" — o único player do nicho que PROVA número em vez de prometer.
5. **Parceiros-revenda** (consultores/integradores regionais que os ISPs já
   pagam): 20% recorrente. Escala sem contratar vendedor. (Mesma tecla de D-11.)

### D. A escada dentro do cliente (retenção = escala silenciosa)
Radar (grátis) → Copiloto (IA sugere, humano aprova) → Autônomo (IA age em
alçada) → módulos D-XX como add-ons premium (CFO virtual, NOC, voz). Cada degrau
é confiança comprada com o valor medido no anterior. A KB viva (D-05) e o
histórico (memória Zep) fazem o custo de sair crescer todo mês — retenção por
valor acumulado, não por multa.

### E. Metas de funil (ano 1 pós-piloto)
| Trimestre | Tenants pagantes | Assinantes sob gestão | Mecanismo dominante |
|---|---|---|---|
| T1 | 3 | ~15k | comunidade + founder-led |
| T2 | 8 | ~50k | indicação + case do piloto |
| T3 | 15 | ~120k | evento + Radar grátis convertendo |
| T4 | 25–30 | ~250k | parceiros-revenda entram |

Conversão presumida trial→pago: 25–35% (o Radar mostra dinheiro perdido — quem
vê o número não desinstala). Se <15%, o problema é preço ou onboarding, não
mercado — voltar ao MODELO e medir.

### F. O gargalo honesto
Nada acima depende de código novo. **Depende de: cutover (Onda 2), preço
decidido, P6/parcerias e presença comercial — os 4 são dever de casa do Lucas
(§4 do 00_PLANO).** A recomendação operacional mais valiosa deste documento:
tratar as próximas 4 semanas como "sprint comercial" com a mesma disciplina de
protocolo das 98 sessões técnicas — 1 sessão = 1 entrega comercial, registrada
no PROGRESS_LOG igual código.
