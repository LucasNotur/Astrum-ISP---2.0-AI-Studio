# NEXTGEN 2.0 — PLANO A — DIFERENCIAL: TECNOLOGIAS INÉDITAS NO MERCADO
# "O que a Astrum tem potencial de se tornar — e o que ninguém mais tem como construir"

> **Para a IA executora e para o Lucas.** Escrito em 2026-07-07 pela sessão NG2-PLAN,
> após auditoria completa do código real (Parte 1 + Fase 1 + Fase 2 planejada do
> IA-NEXTGEN) e pesquisa de mercado de julho/2026 (ver PLANO_B, §6 — fontes).
>
> **Tese central:** a vantagem da Astrum NÃO é ter IA (todo concorrente diz que tem).
> É ser a única com o LOOP COMPLETO no mesmo produto: telemetria de rede + cobrança +
> atendimento + voz + campo do MESMO cliente, com engenharia de avaliação (eval/replay/
> guardrails) que permite iterar sem medo. Cada tecnologia deste plano só é possível
> porque esse loop existe — é por isso que são inéditas: os ERPs não têm o motor de IA,
> e os bots de WhatsApp não têm os dados operacionais.
>
> **Posição na estratégia:** este plano é a ARTILHARIA DE DISTANCIAMENTO. Ele pressupõe
> o PLANO_B (paridade + entrada via ERP) em andamento — sem conectores ERP profundos
> (P0) e sem tráfego real (cutover S74/S82), metade das tecnologias daqui não tem
> combustível. Ordem de leitura: PLANO_B §2 (escada de entrada) → este plano.

---

## §0 — PROTOCOLO

- Herda §0 do `PLANO_MESTRE_V2__EM_ANDAMENTO.md` (R1–R6), §0 do `PARTE1_IA01-IA10_backend__CONCLUIDO.md`
  (RN1–RN7) e §0.2 do `PARTE2_IA11-IA46_fullstack__CONCLUIDO.md` (RN8–RN16 + Apêndices C/D/E).
- **RN17 — Gate de expansão (igual RN16):** as sessões D-XX abaixo são GALHOS
  estruturados. Nenhuma pode ser executada sem antes uma sessão de planejamento
  (padrão IA-F2-PLAN) reescrevê-la em densidade §4 AUDITANDO o código real do dia —
  incluindo o estado dos pré-requisitos listados em cada uma.
- **RN18 — Combustível primeiro:** toda sessão D-XX declara o combustível que exige
  (tráfego real, dados acumulados, conector ERP, ADR Python). Sem o combustível
  verificado por query/log no dia, a sessão fica bloqueada e registra-se no
  PROGRESS_LOG. É proibido construir diferencial "no vazio" — vira a mesma
  IA-de-marketing dos concorrentes.

---

## §1 — MAPA DE POTENCIAL: O QUE JÁ EXISTE → PRÓXIMO NÍVEL

Antes de inventar o inédito, elevar o que já está construído. Auditado no repo em
2026-07-07:

| Ativo real (arquivo) | Nível hoje | Próximo nível (sessão) |
|---|---|---|
| Eval harness — `apps/api/eval/` (50 cenários) | Regressão básica | 300–500 cenários gerados dos dados reais + sintéticos (IA-45); cobertura por intent/idioma; entra em D-10 |
| RAG — `rag-query.service.ts` + Qdrant híbrido | Busca + compressão (IA-30) | Reranker (cohere/voyage via failover IA-43) + chunking semântico + avaliação RAGAS contínua (tabela 029 já existe) |
| Churn — `churn-score.ts` heurística linear | Score auditável | Modelo de sobrevivência (Python, pós-ADR IA-24) treinado nos dados reais; SHAP verdadeiro na tela da IA-38 |
| Cache semântico — `semantic-cache.service.ts` | Exato+semântico | Meta de hit-rate ≥25% com relatório de economia; cache por tenant com invalidação por mudança de KB |
| Multi-agente — `multi-agent.supervisor.ts` (IA-10) | Código pronto, sem tráfego | Cutover real (S74/S82) + subgrafo de VENDAS (novo domínio, ver PLANO_B P3) |
| Feature store — `feature-store.service.ts` (4+ features) | Base | 20+ features (rede, pagamento, canal preferido, comm_style IA-28) — vira o perfil operacional único do cliente |
| Voz — `adapters/telephony/` (A1+A2) | Bridge funcional | A3 (tools/identificação) → IA-13/40/12 → D-12 (voice-first total) |
| Active learning — `labeled_examples` (IA-29) | Coleta unificada | Fine-tuning próprio (D-10) — o dataset vira modelo |
| Health score — `observability/health-score.ts` | Interno | Vira produto: D-8 (CFO virtual do provedor) |
| Crisis detector — `atendimento/crisis-detector.ts` | Detecção passiva | Vira D-4 (NOC autônomo + comunicação preventiva em massa) |
| MCP server (IA-17, Fase 2) | 1 servidor read-only | Vira D-11 (plataforma/ecossistema) |
| Replay engine — `replay.service.ts` (IA-46) | Replay de conversas | Vira D-2 (backtesting de POLÍTICAS — cobrança, preço, régua) |

---

## §2 — AS TECNOLOGIAS INÉDITAS (D-01 a D-12)

> Critério de inclusão: (a) nenhum concorrente do segmento tem (pesquisa julho/2026,
> PLANO_B §1); (b) big tech não entrega de prateleira para ISP; (c) a Astrum tem
> fundação REAL no repo para construir. Cada galho lista: por que é inédito,
> fundação auditada, combustível (RN18) e esboço de escopo.

### D-01 — Gêmeo Digital da Rede (simulação what-if)
**O que é:** o dono simula ANTES de acontecer: "se esta CTO cair, quem grita?",
"se eu ganhar 200 clientes neste bairro, onde satura primeiro?", "onde dói mais
investir R$50k?". Resposta com clientes, MRR em risco e tickets previstos.
**Por que é inédito:** OZmap documenta a planta; os ERPs cadastram; NINGUÉM simula
cenários com impacto financeiro conectado ao atendimento.
**Fundação real:** grafo rede↔clientes↔tickets (IA-16, `network-graph.service.ts` —
impacto/reincidência/capacidade JÁ calculados), telemetria (IA-09,
`network_metrics`), anomalia (IA-24), MapPage existente no legado.
**Combustível:** ≥60d de `network_metrics`; cadastro de topologia razoável (via
conector ERP P0 — a topologia costuma viver no ERP/OZmap).
**Escopo em 2 fases:** (1) simulador determinístico sobre o grafo (falha de nó,
crescimento por região) com tela em `/intelligence/twin` (mapa + sliders);
(2) probabilístico (falha provável via IA-24 alimenta o cenário automaticamente:
"a CTO Centro tem 3× mais chance de falhar este mês — impacto simulado: R$ X").

### D-02 — Backtesting de política de cobrança ("replay de régua")
**O que é:** antes de mudar a régua (dias, tom, desconto, ordem de canais), o dono
roda a política NOVA contra os últimos 90 dias REAIS e vê a diferença projetada de
recuperação — como um quant testa estratégia antes de operar.
**Por que é inédito:** os bots concorrentes prometem "-30% de inadimplência" sem
prova (Mundiale). A Astrum PROVA em cima do histórico do próprio cliente antes de
ligar. É argumento de venda devastador.
**Fundação real:** replay engine com dry-run e judge (IA-46, `replay.service.ts` —
o padrão de reexecução segura JÁ existe); bandits (IA-26, `variant_sends` guarda
envio→outcome); `cobrai-rules.service.ts` com ports injetáveis (D6 do Apêndice D).
**Combustível:** cutover CobrAI v2 (R6) + ≥90d de `variant_sends`/faturas no motor
novo.
**Escopo:** motor de simulação (política parametrizada × histórico de faturas e
respostas), com honestidade estatística explícita (IC, viés de "o passado não
reage"); tela `/intelligence/policy-lab` com comparação A×B; sai direto do
resultado para "ativar como variante bandit" (IA-26 fecha o loop).

### D-03 — Negociador autônomo com alçada financeira
**O que é:** o agente NEGOCIA de verdade dentro de alçada definida pelo dono
(ex.: parcelar em até 3×, desconto máx 10%, isenção de 1 multa/ano): propõe,
contrapropõe, fecha, registra contrato de acordo — sozinho, auditado.
**Por que é inédito:** Mundiale tem "negociações automatizadas" = script de opções
fixas. Negociação real com alçada + trilha imutável não existe no segmento.
**Fundação real:** audit trail hash-chain (IA-06, `ai-audit.service.ts`), guardrails
+ constituição (IA-21/39), debate para alto valor (IA-20 GATED), bandits para
aprender qual proposta converte (IA-26), tool `suspend_signal` com ConfirmDialog já
trata ação financeira como classe especial (IA-19).
**Combustível:** cutover atendimento v2; IA-20 aberta (para valores altos);
alçadas definidas pelo Lucas COM o provedor piloto (decisão de produto).
**Escopo:** policy engine de alçada por tenant (tabela + validador puro — mesma
disciplina do sql-guard IA-44); nó `negotiate` no subgrafo de cobrança (IA-10);
acordo vira boleto/carnê VIA CONECTOR ERP (P0); painel de acordos com taxa de
cumprimento.

### D-04 — NOC autônomo nível 1 + comunicação preventiva de crise
**O que é:** anomalia detectada → Astrum correlaciona (é 1 cliente? uma CTO? a
cidade?), abre o incidente, AVISA os clientes afetados ANTES de ligarem
("identificamos instabilidade na sua região; equipe acionada; não precisa nos
chamar"), suprime tickets duplicados, e ao normalizar confirma com quem reclamou.
**Por que é inédito:** Mundiale tem "notificação de falha" disparada MANUALMENTE.
O fechamento do loop detecção→impacto→comunicação→supressão→confirmação, sozinho,
não existe. Corta 30-60% do pico de tickets em crise — o momento de maior dor do ISP.
**Fundação real:** TUDO já existe em peças: `crisis-detector.ts` (detecção por
janela), IA-24 (anomalia estatística), IA-16 (impacto por CTO = a lista exata de
afetados), `cto-alert.worker` (dedupe de ticket), notificações (016), WhatsApp
(message.worker).
**Combustível:** IA-24 rodando com ≥30d; integração de telemetria CPE via parceria
(PLANO_B P6) engorda a precisão.
**Escopo:** orquestrador de incidente (máquina de estados: suspeita→confirmada→
comunicada→normalizada) com aprovação humana opcional por tenant no passo
"comunicar"; microcópia de crise pré-aprovada pelo dono (RN14); métricas: tickets
evitados, tempo de detecção vs primeira reclamação.

### D-05 — Memória institucional viva (KB que se escreve sozinha)
**O que é:** cada ticket RESOLVIDO com solução confirmada vira rascunho de artigo
da base de conhecimento; curadoria humana de 1 clique; o RAG aprende o "jeito
daquele provedor" (equipamentos, bairros, gambiarras históricas). Em 6 meses, o
provedor tem a documentação que nunca teve — e que sai junto se ele sair (retenção
brutal).
**Por que é inédito:** os ERPs têm KB manual morta. Auto-construção com curadoria e
medição de reuso não existe no segmento.
**Fundação real:** `knowledge_articles` (017), pipeline de indexação
(`indexing.worker`), RAGAS (029), active learning (IA-29 — a fila de curadoria é a
mesma UX), `TicketReportSchema` já estrutura o desfecho do atendimento.
**Combustível:** tráfego real de tickets no motor novo.
**Escopo:** detector de "solução confirmada" (cliente confirmou + ticket fechado
sem reabertura em 7d) → gerador de rascunho (gpt-4o, com fonte linkada ao ticket) →
fila de curadoria (aba na LabelingPage IA-29) → publica → mede: % de respostas RAG
citando artigos auto-gerados.

### D-06 — Copiloto de campo multimodal (técnico no poste)
**O que é:** app mobile-first para o técnico: fotografa a CTO/caixa/ONU → visão
diagnostica (porta queimada, sujeira de conector, LED de status), guia o passo a
passo por VOZ (mãos ocupadas), preenche a OS sozinho, e cada foto vira histórico
visual da planta (que alimenta D-01).
**Por que é inédito:** os apps de campo dos ERPs são formulário digital. Visão +
voz + auto-documentação da planta física não existe.
**Fundação real:** visão estruturada (IA-04, `vision.service.ts` —
`classifyFieldPhoto` JÁ classifica foto de campo), OCR multi-layout (IA-15), voz
(IA-08), `service_orders`/field_operations (015), frontend legado já é
mobile-first para técnico (auditoria RN8).
**Combustível:** IA-15 executada; conector de OS do ERP (P0) quando a OS vive lá.
**Escopo em fases:** (1) foto→diagnóstico→anexo na OS; (2) checklist guiado por
voz com confirmação falada; (3) histórico visual da planta por CTO (linha do tempo
de fotos georreferenciadas → alimenta o gêmeo digital D-01).

### D-07 — Vendedor autônomo com simulação de LTV na oferta
**O que é:** funil completo sem humano: lead chega (anúncio/site/indicação) →
viabilidade no grafo em segundos → oferta CALIBRADA pelo LTV previsto e capacidade
da rede (não vender 1GB onde a CTO está 95% cheia) → coleta dados → contrato →
agenda instalação. A parte inédita não é o funil (Elleven/Mundiale têm partes) —
é a oferta calibrada por LTV+rede.
**Fundação real:** viabilidade (IA-16 `capacidade`), LTV (IA-23), forecast de
demanda (IA-25), subscriber-portal embrionário (`subscriber-portal.ts`), wizard de
onboarding (`wizard.ts`).
**Combustível:** PLANO_B P3 (paridade de vendas) executado — este galho é o
UPGRADE inédito por cima da paridade.
**Escopo:** motor de oferta (regras + LTV + ocupação da CTO), integração contrato
via ERP (P0), painel comercial com conversão por origem.

### D-08 — CFO virtual: fluxo de caixa preditivo do provedor
**O que é:** previsão de caixa 90 dias combinando o que só a Astrum vê junto:
inadimplência prevista (churn+bandit), demanda prevista (IA-25), sazonalidade de
pagamento, custo de operação por cliente (IA-34). Alertas do tipo: "em 45 dias seu
caixa aperta — estes 120 clientes têm 70% de chance de atrasar; esta campanha
recupera R$ X".
**Por que é inédito:** os ERPs mostram o caixa PASSADO. Previsão conectada a AÇÃO
(disparar a campanha da previsão) não existe.
**Fundação real:** `health-score.ts` + `cost-budget.ts` (observability), IA-25
(forecast), IA-23 (LTV), IA-26 (campanhas), dados de faturas via db-compat/ERP.
**Combustível:** ≥90d de dados de cobrança no motor novo; IA-25 executada.
**Escopo:** motor de projeção (agregações DuckDB — `duckdb.service.ts` já existe) +
tela `/intelligence/cfo` com cenários otimista/base/pessimista + botão "agir"
(cria campanha IA-26 a partir da previsão). É o produto que faz o DONO abrir a
Astrum todo dia — não só a equipe.

### D-09 — Índice Astrum: benchmark federado do setor
**O que é:** "seu provedor vs a mediana anônima do setor": inadimplência, churn,
tempo de resolução, NPS de atendimento IA — com privacidade diferencial. Vira
relatório mensal e, publicamente, o "Índice Astrum de Saúde dos ISPs" (autoridade
de marca + imprensa).
**Fundação:** IA-41 (GATED — este galho é a versão produto dela). Todas as
métricas-fonte já existem por tenant.
**Combustível:** ≥10 tenants ativos + análise LGPD aprovada (gate da IA-41).
**Nota:** é o único moat que CRESCE com cada cliente novo — efeito de rede real.

### D-10 — Modelo próprio "ISP-BR" (fine-tuning sobre o dataset Astrum)
**O que é:** fine-tune de modelo mini (4o-mini/Haiku, via API de fine-tuning) sobre
`labeled_examples` (IA-29): o jargão do setor ("tá dando LOS", "internet arrastando",
nomes de equipamento), o tom certo, as políticas típicas. Resultado: classificação e
respostas melhores E mais baratas que o modelo genérico dos concorrentes.
**Por que é inédito:** todo concorrente usa modelo genérico com prompt. Dataset
proprietário rotulado de ISP brasileiro não existe fora da Astrum (se IA-29 rodar).
**Fundação:** IA-29 (labeled_examples com export JSONL JÁ desenhado), eval (IA-42)
como prova de melhora, failover (IA-43) permite servir o fine-tune como mais um
provider.
**Combustível:** ≥5k exemplos rotulados de qualidade; eval ≥300 cenários (senão a
"melhora" não é mensurável).
**Regra:** o fine-tune SÓ entra se vencer o baseline no eval com margem — número no
PROGRESS_LOG.

### D-11 — Plataforma: ecossistema MCP/API da Astrum
**O que é:** o MCP server (IA-17) vira plataforma: parceiros (contabilidades,
integradores regionais, OZmap, ferramentas de mapa) constroem SOBRE os dados e
tools da Astrum, com keys, escopos e marketplace de conectores. A Astrum deixa de
ser fornecedor e vira INFRAESTRUTURA — o mesmo movimento que fez os ERPs
incumbentes dominarem.
**Fundação:** IA-17 (keys por tenant, read-only enforcement), IA-19 (registry).
**Combustível:** IA-17 executada + 3 parceiros de design (decisão comercial do
Lucas).

### D-12 — Voice-first: o provedor que atende no primeiro toque
**O que é:** 100% das ligações atendidas em <1s por voz natural, com identificação
(IA-12), resolução com tools reais, QA de 100% (IA-13), PII mascarada (IA-40) e
handoff quente para humano com resumo falado. Meta agressiva: 60% de resolução sem
humano.
**Por que é inédito no segmento:** URA burra é o padrão; os bots concorrentes são
só texto. Voz é onde o cliente do ISP mais sofre (fila de telefone).
**Fundação:** IA-08 A1+A2 prontos; A3 pendente (E2); IA-13/40/12 planejadas.
**Combustível:** Bloco D da Fase 2 completo + custo por chamada validado
(Realtime API é cara — decisão de pricing por tenant).

---

## §3 — SEQUÊNCIA E DEPENDÊNCIAS

```
Trilho de combustível (pré-requisitos externos a este plano):
  Cutover atendimento (S74/S82) ──► tráfego real
  Cutover CobrAI v2 (R6/S76)    ──► dados de cobrança
  PLANO_B P0 (conectores ERP)   ──► dados operacionais profundos
  ADR ML/Python (IA-24)         ──► modelos de verdade

Onda 1 (destrava com Fase 2 + cutover):   D-05 memória viva · D-04 NOC autônomo
Onda 2 (destrava com 90d de dados):       D-02 backtesting · D-08 CFO virtual · D-01 gêmeo digital
Onda 3 (destrava com P0+P3 do PLANO_B):   D-06 copiloto de campo · D-07 vendedor com LTV
Onda 4 (destrava com escala/decisão):     D-03 negociador · D-10 modelo próprio · D-12 voice-first
Onda 5 (efeito de rede):                  D-09 índice federado · D-11 plataforma MCP
```

Regra de priorização quando houver dúvida: **o que gera história de venda mensurável
primeiro** (D-02 e D-04 são os campeões: "provei no SEU histórico" e "seus clientes
não ligaram na última queda").

## §4 — GATE (RN17)
Nenhuma sessão D-XX é executável a partir deste texto. Quando uma onda destravar,
rodar sessão de planejamento dedicada (padrão IA-F2-PLAN) que expande os galhos da
onda em densidade §4 contra o código real do dia, e só então executar.

---

## §5 — D-06 EXPANDIDO (RN17 — sessão 2026-07-12)

> Auditoria do código real feita em 2026-07-12. Combustível P0+P3 satisfeitos.
> Esta seção substitui o galho original do D-06 como o plano executável.

### Fundação auditada

| Ativo | Arquivo | Estado |
|---|---|---|
| `classifyFieldPhoto()` | `apps/api/src/infrastructure/vision/vision.service.ts` | ✅ pronto — GPT-4o, equipment/issue/severity/recommended_action/confidence |
| Rota de diagnóstico | `apps/api/src/domain/ia/vision.routes.ts` (`POST /api/v2/ia/vision/diagnose`) | ✅ existe mas NÃO persiste — retorna JSON apenas |
| Tabela `service_orders` | `packages/db/src/migrations/015_field_operations.sql` | ✅ tem `ai_summary`, `cto_id`, `assigned_to`, `lat/lng`; falta histórico de fotos |
| Tabela `technicians` | mesma migration 015 | ✅ existe |
| `TechnicianAppPage.tsx` | `src/pages/TechnicianAppPage.tsx` | ✅ câmera + GPS + upload S3 + checklist por OS; usa MOCK_OSS |
| `uploadTenantFile` | `src/lib/storage.ts` | ✅ upload S3 direto do browser |
| Flag `VISION_STRUCTURED_ENABLED` | env | 🔴 default false — precisa ligar |

### Fase 1 — foto → diagnóstico → OS (THIS SESSION)

**Arquivos a criar:**
1. `packages/db/src/migrations/069_d06_field_photos.sql`
   - Table `field_photo_diagnoses`: id, tenant_id, service_order_id (FK nullable), cto_id (FK nullable), photo_url, equipment, issue, severity, recommended_action, confidence, technician_id (FK nullable), created_at
   - RLS: tenant_own

2. `apps/api/src/domain/campo/field-copilot.service.ts`
   - `diagnosePlusAttach({ tenantId, imageUrl, serviceOrderId?, ctoId?, technicianId? })` → chama `classifyFieldPhoto` → salva em `field_photo_diagnoses` → se serviceOrderId, faz UPSERT no `service_orders.ai_summary` com o diagnóstico → retorna resultado estruturado
   - Fail-open: se confidence < 0.6, salva mesmo assim mas marca como `low_confidence`

3. `apps/api/src/domain/campo/field-copilot.routes.ts`
   - `POST /api/v2/field/diagnose` — body: `{ image_url, service_order_id?, cto_id? }`, auth=técnico ou operador
   - `GET /api/v2/field/diagnoses` — lista diagnósticos por OS (`?service_order_id=`) ou por CTO (`?cto_id=`)

4. `apps/api/src/domain/campo/field-copilot.service.test.ts` — testes Vitest

**Arquivos a modificar:**
- `apps/api/src/app.ts` — registrar `fieldCopilotRoutes`
- `src/pages/TechnicianAppPage.tsx` — hook de rede: após upload S3, chama `POST /api/v2/field/diagnose`, mostra diagnóstico com badge de severidade colorido; botão "Confirmar e anexar à OS"

### Fase 2 — checklist guiado por voz (sessão futura)
- Pré-requisito: IA-08 A3 (conta Twilio staging — dever do Lucas)
- Checklist da OS gerado como TTS a cada passo; técnico confirma falando
- `voice-checklist.service.ts` + integra `adapters/telephony/`

### Fase 3 — histórico visual da planta (sessão futura)
- Pré-requisito: Fase 1 com ≥30d de fotos acumuladas
- Timeline de `field_photo_diagnoses` por CTO (linha do tempo + foto + severidade)
- Alimenta D-01 (gêmeo digital) com histórico de falhas visuais

### Métricas (RN20)
- Tempo diagnóstico foto→laudo: meta <3s
- % OS com foto diagnóstica anexada: meta ≥60% em 30d de uso
- Severidades `alta`+`crítica` detectadas antes de o cliente reclamar (comparar timestamp foto vs timestamp abertura de ticket)

---

## §6 — D-07 EXPANDIDO (RN17 — sessão 2026-07-12)

> Auditoria do código real feita em 2026-07-12. Combustível P0+P3 satisfeitos.
> Esta seção é o plano executável do D-07 (vendedor autônomo com LTV na oferta).

### Fundação auditada

| Ativo | Arquivo | Estado |
|---|---|---|
| `computeLtv()` | `apps/api/src/domain/ml/ltv.ts` | ✅ mrrCents × 0.35 × lifetime por churn band |
| Funil P3 completo | `apps/api/src/domain/vendas/sales-funnel.service.ts` | ✅ state machine address→viability→plans→data→ERP→scheduling→contrato |
| `runVendasSubgraph()` | `apps/api/src/domain/agent/subgraphs/vendas.subgraph.ts` | ✅ orquestra o funil via multi-agente |
| `checkViability()` | `sales-funnel.service.ts` | ✅ retorna ctoId + ctoName + availablePorts |
| `capacidade()` + `CapacidadeRow.occupancy` | `apps/api/src/domain/rede/network-graph.service.ts` | ✅ occupancy 0–1 por CTO; filtra >85% |
| `sales_leads` | `packages/db/src/migrations/067_p3_sales_leads.sql` | ✅ pronto; faltam 4 colunas D-07 |
| Rotas de vendas | `apps/api/src/server.ts` | 🔴 não registradas — só o subgrafo no multi-agente |

### O que D-07 ADICIONA sobre P3 (o diferencial inédito)

P3 = funil que fecha venda. D-07 = oferta CALIBRADA: o agente sabe o LTV do lead e a ocupação da CTO,
e usa isso para decidir se oferece bônus (CTO com folga = crescimento barato) ou mantém preço cheio
(CTO saturada = custo de infra sobe se fechar; melhor não dar desconto).

### Arquivos a criar

1. **`packages/db/src/migrations/070_d07_ltv_offer.sql`**
   - ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS:
     - `source` text check in ('whatsapp','site','indicacao','anuncio','outro') default 'whatsapp'
     - `cto_occupancy_pct` smallint (0–100, snapshot no momento da oferta)
     - `estimated_ltv_cents` integer
     - `offer_tier` text check in ('standard','premium','promotional') default 'standard'

2. **`apps/api/src/domain/vendas/ltv-offer.service.ts`**
   - `computeCtOccupancy(db, tenantId, ctoId)` → busca `network_ctos` direto, retorna occupancy % (0–100)
   - `computeLtvOffer({ planPriceCents, ctoOccupancyPct })` → retorna `{ estimatedLtvCents, offerTier, offerNotes }`
     - LTV: `computeLtv({ mrrCents: planPriceCents, band: 'low' })` (novo cliente → band padrão 'low')
     - tier = 'promotional' se ctoOccupancyPct < 70; 'premium' se planPriceCents > 10000; 'standard' caso contrário
     - offerNotes: frase curta para o agente (ex: "CTO com 35% livre — ótimo momento para oferecer instalação grátis")

3. **`apps/api/src/domain/vendas/ltv-offer.service.test.ts`** — testes Vitest

4. **`apps/api/src/domain/vendas/vendas-dashboard.routes.ts`**
   - `GET /api/v2/vendas/dashboard` (auth: operador/admin/super_admin)
   - Agrega `sales_leads`: counts por stage, LTV médio dos completed, taxa conversão, top sources

### Arquivos a modificar

- `apps/api/src/domain/agent/subgraphs/vendas.subgraph.ts`
  - No estágio `presenting_plans` (logo após `checkViability` retornar), chamar `computeLtvOffer`
  - Salvar `cto_occupancy_pct`, `estimated_ltv_cents`, `offer_tier` via `updateLead`
  - Injetar `offerNotes` no prompt do agente junto com os planos
  - Novo dep injetável `computeLtvOfferFn` (para testabilidade)

- `apps/api/src/domain/vendas/sales-funnel.service.ts`
  - Adicionar campos D-07 ao tipo `SalesLead`

- `apps/api/src/server.ts`
  - Registrar `vendasDashboardRoutes`

### Métricas (RN20)
- % de leads `completed` com `offer_tier` preenchido: meta 100% após deploy
- LTV médio dos completados vs estimado (validar modelo em 30d)
- Taxa conversão collecting_address → completed: meta ≥ 15%

---

## §7 — D-05 EXPANDIDO (RN17 — sessão 2026-07-12)

> Auditoria do código real feita em 2026-07-12. Combustível parcialmente satisfeito:
> infraestrutura 100% construída; métricas ativam quando tráfego real chegar (Onda 2).
> Decisão do Lucas: construir a fundação agora, não "no vazio" — o scanner pode ser
> acionado manualmente desde já em staging com tickets de teste.

### Fundação auditada

| Ativo | Arquivo | Estado |
|---|---|---|
| `knowledge_articles` | `packages/db/src/migrations/017_knowledge_articles.sql` | ✅ title, content, tags, category, ingest_status, document_id |
| `indexing.worker.ts` | `packages/queue/src/workers/indexing.worker.ts` | ✅ pega artigos com ingest_status='pending' no Qdrant |
| `ai_ragas_scores` | `packages/db/src/migrations/029_ragas_guardrails.sql` | ✅ ticket_id/message_id linkável |
| `LabelingPage` | `src/pages/intelligence/LabelingPage.tsx` | ✅ padrão de fila de curadoria reutilizado |
| `callOpenAI` | `apps/api/src/adapters/openai/openai.adapter.ts` | ✅ gpt-4o-mini/gpt-4o com Helicone |
| `conversations` + `messages` | migration 005 | ✅ status='resolved', role user/assistant, content |

### Sinal de "solução confirmada"
Conversation `status='resolved'` + `updated_at < NOW() - 7d` + ≥3 mensagens + sem draft gerado ainda.
(Sem sinal explícito de confirmação do cliente ainda — detectado por inatividade resolvida.)

### O que foi entregue

1. **`packages/db/src/migrations/071_d05_kb_drafts.sql`**
   - Table `kb_drafts`: id, tenant_id, conversation_id (FK nullable), ticket_id (FK nullable),
     status (pending/approved/rejected/published), draft_title, draft_body, source_summary,
     generated_by, reviewed_by, reviewed_at, published_article_id, created_at/updated_at
   - RLS tenant_own; índices em (tenant_id, status) e conversation_id

2. **`apps/api/src/domain/conhecimento/kb-draft.service.ts`**
   - `findCandidateConversations(tenantId)` → conversas resolvidas sem draft, ≥3 msg, ≥7d
   - `generateDraft(tenantId, conversationId)` → transcript → GPT-4o → insert pending
   - `listDrafts(tenantId, status?)` → lista filtrada
   - `approveAndPublish(tenantId, draftId, reviewedBy)` → insere em knowledge_articles (ingest_status=pending) → indexing worker pega automaticamente
   - `rejectDraft(tenantId, draftId, reviewedBy)` → marca rejected

3. **`apps/api/src/domain/conhecimento/kb-draft.routes.ts`**
   - `GET /api/v2/kb/drafts?status=` — lista rascunhos
   - `POST /api/v2/kb/drafts/scan` — varre conversas e gera rascunhos em batch
   - `PATCH /api/v2/kb/drafts/:id/approve` — publica
   - `PATCH /api/v2/kb/drafts/:id/reject` — rejeita

4. **`src/pages/intelligence/LabelingPage.tsx`** (modificado)
   - Tabs: "Rascunhos KB" (padrão) + "Rotulagem" (existente)
   - Tab KB Drafts: botão "Varrer conversas" (POST scan), lista de cards com Publicar/Rejeitar
   - Badge de contador pendente no tab

5. **`apps/api/src/server.ts`** — registro de `kbDraftRoutes`

### Testes
11 testes Vitest passando (findCandidateConversations: 3, generateDraft: 3, listDrafts: 2, approveAndPublish: 2, rejectDraft: 1)

### Métricas (RN20 — ativar quando tráfego real disponível)
- % de conversas resolvidas que viraram artigo KB: meta ≥ 20% em 30d
- % de rascunhos aprovados vs rejeitados: meta ≥ 60% aprovação (sinal de qualidade do GPT-4o)
- % de respostas RAG citando artigos com tag `auto-gerado`: meta ≥ 15% em 60d

### Fase 2 — sinal de confirmação explícita (sessão futura)
- Adicionar coluna `customer_confirmed_at` em `conversations` (customer envia 👍/positivo)
- Usar esse sinal como critério mais forte que "inatividade 7d"
- Permitir geração imediata (sem esperar 7d) quando confirmado
