# PLANO H — A CONSTELAÇÃO ASTRUM: os produtos escondidos dentro do que você já construiu
# Escrito por Fable 5 em 2026-07-13 (PLUS ULTRA). Pedido do Lucas: "que outros
# produtos posso vender para provedoras e empresas parecidas aproveitando o que já tenho?"

> **A tese que muda tudo:** a Astrum não é "um software de ISP". É um MOTOR de
> funcionário digital (atende + cobra + vende + opera campo + aprende sozinho)
> com um chassis multi-tenant de nível big tech (RLS, eval, replay, auditoria,
> custo por resposta). ISP foi o PRIMEIRO molde despejado desse motor. O mesmo
> metal derrete em qualquer negócio com: **assinantes recorrentes + WhatsApp +
> técnicos de campo + inadimplência**. E o Brasil está CHEIO deles.

---

## §0 — A REGRA DE OURO (leia antes de sonhar)

**Cabeça de praia primeiro.** NADA daqui se lança antes do 1º ISP pagante com
ROI medido. Diversificar antes da prova é como abrir 5 restaurantes sem saber
cozinhar um prato. A Constelação é uma SEQUÊNCIA com gatilhos, não uma dispersão:
cada produto só nasce quando o gatilho dispara (§3). O que se faz DESDE JÁ é
barato: não enterrar nada de ISP-específico no core (o monorepo já separa
`packages/*` de `apps/*` — manter essa disciplina é o "seguro da Constelação").

## §1 — O ESTOQUE: o que o código já sabe fazer × quem mais paga por isso

| Ativo (já pronto e testado) | Quem mais tem essa dor |
|---|---|
| Motor de atendimento agentic (LangGraph+RAG+guardrails+eval+omnichannel+voz) | QUALQUER negócio com WhatsApp lotado |
| CobrAI (régua + bandits + backtesting + 2ª via + negociação) | Qualquer receita recorrente: academia, escola, clínica, SaaS, condomínio |
| Gênesis (análise retroativa do WhatsApp) | Toda PME brasileira — o WhatsApp É o CRM do Brasil |
| Copiloto de campo (foto→diagnóstico→OS + PWA técnico) | Solar, CFTV/alarmes, climatização, elevadores, telecom |
| Gêmeo de rede + NOC (telemetria→anomalia→incidente→aviso em massa) | Rastreadoras, monitoramento, solar O&M, utilities |
| CFO virtual + Valor Gerado (caixa 90d + ROI provado) | Todo dono de PME recorrente |
| Túnel de Vento (personas sintéticas testando bots) | Toda empresa/agência que TEM um chatbot |
| Cartório de IA (auditoria hash-chain + compliance) | Qualquer empresa regulada usando IA |
| O chassis inteiro (multi-tenant, RLS, billing por unidade, observabilidade) | Você mesmo — para despejar o próximo molde em semanas |

## §2 — OS PRODUTOS DA CONSTELAÇÃO (fichas de batalha)

### ⭐ H-1 — ASTRUM ATLAS (o primo direto: rastreamento veicular e monitoramento)
**Mercado:** rastreadoras veiculares (~2 mil empresas no BR, milhões de veículos
monitorados a R$ 40–120/mês) e empresas de alarme/CFTV monitorado. **É o MESMO
esqueleto do ISP:** assinante recorrente + dispositivo em campo (rastreador/ONU,
central/roteador) + telemetria + inadimplência + técnico instalador + suporte
por WhatsApp lotado ("meu rastreador sumiu do mapa" = "minha internet caiu").
**Reuso: ~75%.** Troca-se: conectores ERP → plataformas do setor (Traccar é
open-source e domina; SGR/Fulltrack); "CTO" → veículo/central; jargão do RAG.
O grafo, o CobrAI, o NOC (D-04 detecta veículo mudo como detecta CTO anômala!),
o campo, o Gênesis: idênticos.
**Preço:** R$ 2,50 × veículo/dispositivo monitorado (a MESMA régua — vira slogan:
"R$ 2,50 por unidade, qualquer negócio").
**Pulo do gato:** rastreadora não tem NENHUM fornecedor de IA hoje. Oceano azul
de verdade — nem Anel 2 existe lá.

### ⭐ H-2 — ASTRUM COBRA (CobrAI solteiro, para o Brasil inteiro)
**Mercado:** todo negócio de mensalidade SEM sistema decente de cobrança:
academias (~35 mil), escolas particulares (~40 mil), clínicas/odonto, cursos,
condomínios, SaaS pequenos. A dor nº 1 universal: inadimplência + vergonha de
cobrar.
**O produto:** conecta Asaas/gateway (F6-02) + WhatsApp → a IA cobra com jeito,
gera PIX na conversa, negocia parcelamento em alçada, aprende a mensagem que
recupera mais (bandits) e PROVA o resultado (backtesting D-02 + Valor Gerado).
**Reuso: ~70%** (CobrAI + Gênesis + canais + chassis; sem rede/campo/ERP).
**Preço:** o gancho perfeito é success fee — **5% do que a IA recuperar** (sem
mensalidade = zero fricção de entrada) ou R$ 0,50/cobrança. Se paga sozinho.
**Pulo do gato:** o backtesting roda no histórico do Asaas ANTES de ativar:
"seu histórico diz que eu teria recuperado R$ X mês passado. Quer que eu comece?"

### ⭐ H-3 — ASTRUM GÊNESIS STANDALONE ("raio-X do seu WhatsApp")
**Mercado:** TODA PME brasileira que atende por WhatsApp (milhões). O WhatsApp
é o CRM do Brasil — e ninguém lê o próprio histórico.
**O produto:** conecta o número → 20 minutos depois: relatório com quem são seus
clientes, como falam, o que mais reclamam, quem te deve, horários de pico, e as
10 oportunidades perdidas no seu histórico. O D-23 que JÁ EXISTE, com landing page.
**Reuso: ~85%.** Preço: **R$ 297 o relatório único** (compra por impulso) ou
R$ 97/mês pelo monitor contínuo. **É a porta de entrada da Constelação inteira:**
quem compra o raio-X descobre que precisa do Cobra; quem tem campo, do Atlas.
**Pulo do gato:** é VIRAL por natureza — o dono mostra o relatório pro amigo dono.

### H-4 — ASTRUM CAMPO (copiloto de técnicos, avulso)
**Mercado:** integradores solares (~25 mil no BR — instalação + O&M), climatização,
elevadores, CFTV, manutenção predial. **O produto:** PWA do técnico + foto→
diagnóstico IA→OS + agenda + histórico visual da planta do cliente. **Reuso: ~60%**
(D-06 + service_orders + PWA U5 + visão IA-04). **Preço:** R$ 49/técnico/mês.
**Nota:** lançar DEPOIS do Atlas (o Atlas já valida o campo fora de ISP).

### H-5 — ASTRUM TÚNEL (QA de bots as a service)
**Mercado:** todo mundo que tem chatbot — inclusive seus concorrentes e as
agências que os montam. **O produto:** aponte o túnel de vento (D-15) para
QUALQUER bot (via API/WhatsApp), as personas adversariais atacam (caçador de
desconto, injetor de prompt, LGPD), sai relatório com nota e vulnerabilidades.
**Reuso: ~85%** (wind-tunnel + judge; só precisa de um adapter "alvo externo").
**Preço:** R$ 497/rodada ou R$ 997/mês no CI do cliente. **Pulo do gato:** é
inteligência competitiva legalizada — você aprende como TODOS os bots do mercado
falham, e o dataset de ataques vira moat do produto principal.

### H-6 — ASTRUM SELO (Cartório de IA para o mercado)
**Mercado:** fintechs, healthtechs, edtechs, qualquer regulado usando IA com
cliente final — a fiscalização de IA no BR é questão de tempo (o PL de IA já
tramita). **O produto:** o D-18 como serviço: trilha hash-chain de cada decisão
de IA + relatório de conformidade assinado + eval-gate como certificação.
**Reuso: ~65%** (IA-06 + E-04 + kit compliance P5). **Preço:** R$ 999+/mês.
**Quando:** oportunista — no dia em que a regulação apertar, você lança em 1 mês
e surfa a onda de pânico.

### H-7 — ASTRUM FOUNDRY (a fábrica vira o produto)
**O endgame.** Depois de 2–3 moldes provados (ISP, Atlas, Cobra), o próprio
CHASSIS vira produto: agências e integradores licenciam o motor (white-label)
para despejar verticais próprias — pet shops, oficinas, imobiliárias — pagando
% de receita. É o D-11 elevado: a Astrum deixa de vender funcionário digital e
passa a vender a FÁBRICA de funcionários digitais. Também é o caminho de exit
mais valioso (plataforma vale múltiplo de fábrica, não de produto).

### H-8 — WHITE-LABEL PARA ERPs DE ISP (a jogada de xadrez)
IXC/Voalle/MK têm distribuição (milhares de ISPs) e NÃO têm o motor. Licenciar
a Astrum embutida no ERP deles = escala instantânea… e criar o próprio
concorrente. **Regra:** só considerar com contrato de exclusividade parcial +
% por assinante + os DADOS continuam alimentando o Índice Astrum (D-09). É
também o comprador natural num exit. Guardar esta carta para quando houver
100+ tenants próprios (poder de barganha).

## §3 — OS TRÊS HORIZONTES (com gatilhos objetivos, não datas)

```
HORIZONTE 1 — O ISP (agora)               gatilho: já disparado
  Astrum ISP: piloto → 10 → 30 tenants. TODO o foco aqui.
  Enquanto isso, de graça: manter o core limpo de ISP-específico.

HORIZONTE 2 — Os primos (1 molde por vez)  gatilho: 10 ISPs pagantes + Onda 2 estável
  1º: GÊNESIS standalone (H-3) — menor esforço, vira funil de tudo.
  2º: COBRA (H-2) — success fee, se vende sozinho.
  3º: ATLAS (H-1) — o primeiro molde "pesado" novo; prova que a fábrica funciona.

HORIZONTE 3 — A fábrica (o endgame)        gatilho: 2 verticais provadas OU 100+ tenants
  TÚNEL (H-5) e SELO (H-6) — produtos-satélite de margem alta.
  FOUNDRY (H-7) — o chassis licenciado.
  WHITE-LABEL ERP (H-8) — a carta de exit.
```

## §4 — POR QUE A CONSTELAÇÃO É DEFENSÁVEL (e única)

1. **O custo marginal de um molde novo é semanas, não anos** — o chassis (auth,
   RLS, billing, eval, observabilidade, cérebro noturno) é 100% compartilhado.
   Concorrente que quiser o Atlas precisa construir a fábrica primeiro.
2. **Cada vertical alimenta as outras:** o dataset de cobrança do Cobra melhora
   o CobrAI do ISP; os ataques do Túnel blindam todos os bots; o Gênesis é o
   funil universal. É um sistema estelar, não produtos soltos.
3. **Uma régua, um slogan:** "R$ 2,50 por unidade gerenciada" (assinante, veículo,
   aluno, mensalista) — precificação que qualquer dono entende em 5 segundos.

## §5 — RISCOS E ANTÍDOTOS (a malemolência com juízo)

| Risco | Antídoto |
|---|---|
| Diluir o foco antes da prova | §0 é lei: gatilhos objetivos, não vontade |
| Marca confusa ("Astrum é de quê?") | Uma marca-mãe + submarcas (Atlas/Cobra/Gênesis) desde o dia 1 |
| Suporte multi-vertical esmaga 1 pessoa | Só lançar molde novo com o cérebro noturno + PLANO_F rodando (a IA opera a si mesma) |
| White-label criar concorrente | H-8 só com 100+ tenants e contrato blindado |

## §6 — O QUE O SONNET PODE FAZER DESDE JÁ (camisa-9, sem quebrar o §0)

1. **H6-01 (higiene do core):** auditar `packages/*` — nada de import de
   `apps/api/src/domain/provedor|rede` dentro de packages. O que for ISP-específico
   em packages, mover para apps. Critério: `packages/*` compila sem apps.
2. **H6-02 (Gênesis standalone-ready):** extrair os textos do ISSUE_BUCKETS para
   config por tenant (JSONB `tenants.extra.issue_buckets`) com o default atual —
   o mesmo motor lê vocabulário de academia ("treino", "matrícula") sem fork.
3. **H6-03 (Cobra-ready):** F6-02 (adapter Asaas) já está no PLANO_F — é a MESMA
   peça que destrava o Cobra. Prioridade dobrada.
4. **H6-04 (Túnel-ready):** adapter "alvo externo" no wind-tunnel (port `agent`
   apontando para um webhook/número de WhatsApp externo em vez do processMessage).
   ~40 linhas — o produto H-5 nasce disso.
5. **NÃO fazer:** landing pages, marcas, CNPJs de produto — isso é gatilho do
   Horizonte 2, decisão do Lucas.
