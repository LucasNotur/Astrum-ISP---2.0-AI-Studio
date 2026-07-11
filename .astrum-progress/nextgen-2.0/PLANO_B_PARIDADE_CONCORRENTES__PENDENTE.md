# NEXTGEN 2.0 — PLANO B — PARIDADE COM A CONCORRÊNCIA + ESTRATÉGIA DE ENTRADA
# "Igualar no que eles vendem hoje, entrar pela porta do ERP, e subir a escada"

> **Para a IA executora e para o Lucas.** Escrito em 2026-07-07 pela sessão NG2-PLAN.
> Pesquisa de mercado feita em julho/2026 via Google e páginas públicas de
> Instagram (Facebook/Instagram detalhados exigem login — ver §6 limitações e a
> recomendação de monitoramento contínuo). Fontes em §6.
>
> **Estratégia confirmada pelo Lucas:** a Astrum entra como BRAÇO DE INTELIGÊNCIA
> ("cérebro operacional do provedor") SOBRE o ERP que o ISP já usa e confia —
> barra de entrada zero. Conforme gera valor e acumula carga, substitui módulos
> passo a passo dentro do ciclo Astrum no cliente (§2). Este plano existe para:
> (a) eliminar os gaps que fazem um concorrente ganhar o deal hoje; (b) construir
> a porta de entrada (conectores). O distanciamento vem do PLANO_A.

---

## §0 — PROTOCOLO
- Herda §0 do `PLANO_MESTRE_V2__EM_ANDAMENTO.md` (R1–R6), RN1–RN16 dos planos IA-NEXTGEN e
  RN17/RN18 do PLANO_A. Sessões P-XX são GALHOS: expansão em densidade §4 só via
  sessão de planejamento dedicada auditando o código do dia (RN17).
- **RN19 — Paridade é integração, não reconstrução.** Onde o concorrente é um ERP
  maduro (fiscal, radius, OLT), a paridade se cumpre INTEGRANDO (P0/P6), nunca
  reimplementando nesta fase. Reimplementar módulo de ERP é decisão da fase de
  SUBSTITUIÇÃO (§2, degraus 4-5) e exige plano próprio.
- **RN20 — Todo item de paridade nasce com número de venda.** Cada sessão P-XX
  define a métrica que o comercial vai usar (ex.: "-X% inadimplência provada",
  "Y% resolvido sem humano") e instrumenta a medição desde o dia 1. Os concorrentes
  vendem com números (Mundiale: "-30% inadimplência", "84% auto") — a Astrum vai
  vender com números MEDIDOS.

---

## §1 — QUADRO COMPETITIVO (pesquisa julho/2026)

### 1a. Os dois anéis de concorrência
**Anel 1 — ERPs incumbentes** (donos da relação e do dado operacional):
| Concorrente | O que têm (verificado) | Sinal de IA |
|---|---|---|
| **IXC Soft** | Ecossistema completo (ERP + Opa! Suite omnichannel + IXC ACS/TR-069 + IXC Oner/nova Central do Assinante + IXC Assina); parceria Banco do Brasil; 25 países, 700 colaboradores; evento próprio (IXC Experience) | **IA real em produção interna**: assistentes "Lia + Manuel" no próprio suporte (90% de acurácia de transferência, −27k chamados humanos); IA no ACS para diagnóstico de CPE. É o incumbente MAIS perigoso em IA |
| **Voalle (Elleven)** | Plataforma nova com jornadas CORE (Vender→Entregar→Faturar→Cobrar→Atender); análise de capacidade de pagamento; viabilidade em segundos (inclui redes neutras); OS automática por região/habilidade; fatura Anatel 765; identificação de intenção de pagamento; desbloqueio automático; MWC 2026; parceria Telecall (MVNO) | IA embutida em jornadas (scoring/roteamento). Discurso forte de "workflow inteligente" |
| **MK Solutions** | R$30M de investimento anunciado; novo workspace do ERP; posicionamento de "maior ecossistema" | Blog com categoria IA; sem feature de agente publicada |
| **Hubsoft** | 100% web + app mobile forte; discurso "Panorama 2026" (IA como diferencial, operação previsível) | IA genérica no discurso; nada específico publicado |
| **SGP/TSMX** | Integrações OLT, gateways de pagamento, sistema responsivo | Sem IA própria publicada |

**Anel 2 — camada de IA/atendimento plugada nos ERPs** (concorrentes DIRETOS do
posicionamento Astrum):
| Concorrente | O que vendem (verificado) |
|---|---|
| **Mundiale.ai (WitHub)** | Atendimento (2ª via, abertura de OS, **religue por confiança**, notificação de falha, resumo p/ humano, 24/7), cobrança (lembretes, Pix, **negociação automatizada**, promessa "−30% inadimplência"), vendas (oferta, **viabilidade**, coleta, fechamento; "84% resolvido automaticamente"). Integra **Voalle, MK, IXC, SGP/TSMX, Hubsoft, MK-Auth** |
| **Talqui** | Balcão financeiro 24/7 no WhatsApp com IXC — busca fatura no ERP e **recalcula juros conforme a regra do IXC** |
| **Meu James (James IA)** — *adicionado 2026-07-08 por indicação do Lucas* | Atendimento WhatsApp 24/7 com IA respondendo **áudio e texto**, cobrança automatizada com PIX, boleto em segundos, desbloqueio, notificações personalizadas; integrado ao sistema do provedor; **trial de 7 dias acompanhado**. Máquina de marketing: blog com "comparativos 2026" ranqueando a si mesmo (SEO) + anúncios pesados no Instagram, com muitos donos de ISP seguindo. É o concorrente com MAIOR share de atenção do decisor — a guerra com ele é tanto de distribuição quanto de produto |
| **Telia (Agência Intellect)** — *adicionado 2026-07-08 por indicação do Lucas* | "Atendimento IA para provedores de Internet"; landing 100% JS (conteúdo não indexável — detalhes exigem olhar o Instagram deles diretamente, onde também anunciam forte). Mesmo playbook do James: mídia paga em cima do dono de ISP. Entra no radar mensal (§6) como prioridade |
| **Opa! Suite** (da própria IXC), **Chatlabs, Zapisp, PliQ, Maxbot, EvoTalks, ZiveAI, ISP AI Starter** | Omnichannel WhatsApp + cobrança integrados aos ERPs (Maxbot/EvoTalks com CRM multicanal; ZiveAI e ISP AI Starter são entrantes menores de IA) — **o anel 2 está lotado**: reforça que o diferencial da Astrum não pode ser "bot de WhatsApp" |
| **Meta Business Agent** (global desde jun/2026) | IA nativa do WhatsApp/Instagram para PMEs — **commoditiza o atendimento básico**. Quem só "responde WhatsApp" morre; quem opera o ERP com dados, não |

### 1b. Leitura estratégica
1. O Anel 2 provou o modelo de entrada da Astrum (plugar no ERP) — mas todos são
   RASOS: scripts + consulta ao ERP. Nenhum tem eval/replay/guardrails/custo por
   cliente/voz/rede. A Astrum entra pela mesma porta com um motor 10× mais fundo.
2. A IXC é a única com IA séria — e vai empurrá-la para o produto. A janela para
   se posicionar como "o cérebro que funciona com QUALQUER ERP" é AGORA: é a
   defesa contra cada ERP fazer a sua IA fechada.
3. O Meta Business Agent mata o bot burro, não a Astrum — mas OBRIGA a Astrum a
   nunca se vender como "chatbot": vende-se OPERAÇÃO (agir no ERP, na rede, na
   cobrança), que o Meta não alcança.
4. **James e Telia ensinam a lição de DISTRIBUIÇÃO** (2026-07-08): eles dominam a
   atenção do dono de ISP com anúncio no Instagram, trial de 7 dias sem fricção e
   conteúdo SEO — antes de qualquer superioridade técnica. O P5 deste plano ganha
   um item de resposta (P5-05) e o Degrau 0 da escada (§2) precisa ser TÃO sem
   fricção quanto o trial do James: conectar o ERP e ver o primeiro insight em
   minutos, sem reunião de venda.

---

## §2 — A ESCADA DE ENTRADA (o ciclo Astrum dentro do cliente)

```
Degrau 0 — CONECTAR   (30 min, read-only): credenciais do ERP → sync inicial →
                       primeiro insight gratuito ("você tem R$ X vencido há >30d
                       concentrado no bairro Y"). Barra de entrada ZERO.
Degrau 1 — ENXERGAR   (semana 1): dashboards de valor + churn + saúde da rede.
                       Astrum ainda não fala com cliente final. Confiança nasce.
Degrau 2 — FALAR      (mês 1): atendimento + cobrança IA agindo VIA ERP
                       (2ª via, Pix, religue, OS). O ERP continua sendo o registro.
Degrau 3 — OPERAR     (mês 2-3): vendas, campo, NOC preventivo, voz.
Degrau 4 — SUBSTITUIR (mês 6+): módulo a módulo onde a Astrum já é melhor
                       (atendimento→cobrança→OS/campo→estoque), no ritmo do cliente.
Degrau 5 — ERP ASTRUM (decisão futura): fiscal/radius/financeiro — só quando a
                       carga justificar (RN19; plano próprio).
```
Cada degrau tem critério de subida MEDIDO (RN20) — o comercial vende o próximo
degrau com o número do degrau atual.

---

## §3 — BLOCOS DE PARIDADE (sessões P-XX)

### BLOCO P0 — Conectores ERP profundos (A PORTA DE ENTRADA — prioridade absoluta)
✅ **CODE-COMPLETE em 2026-07-09** (commit `d3c12fc` + IXC/MK-Auth da S75). Falta só o
dever de casa do Lucas: acesso a uma instância real de ERP para validar os adapters
contra a API viva (hoje seguem só a documentação pública — §4 item 4 do
`00_PLANO_DE_ACAO_GERAL`). Próximo bloco a executar: **P1**.
**Gap:** Mundiale integra 7 ERPs; a Astrum tem `tenant_erp_credentials` (024) e
adapters embrionários IXC/MK-Auth (`ERP_CRED_KEY` no env.validator). Sem P0 não
existe estratégia de entrada.
**Arquitetura (auditada):** seguir o padrão do `src/ai-provider/` portado na IA-43
(política + adapters intercambiáveis): `IErpPort` único (clientes, contratos,
faturas+juros, desbloqueio, OS, viabilidade, planos) + 1 adapter por ERP + sync
incremental (webhooks onde houver; polling onde não) + cache Redis + circuito.
- [x] **P0-01 — IErpPort + conector IXC** (`ixc.adapter.ts`, S75) + `erp-admin.routes.ts`
  (credenciais AES-256-GCM + teste de sanidade `POST /:provider/test`, 2026-07-09).
  ⚠️ falta o wizard "conecte em 15 minutos" reusando `onboarding/wizard.ts` — não entrou
  no escopo desta rodada, é UX (coordenar com Onda 4).
- [x] **P0-02 — Conector Voalle/Elleven** (`voalle.adapter.ts`, 2026-07-09).
- [x] **P0-03 — Conector MK Solutions** (`mkauth.adapter.ts`, S75).
- [x] **P0-04 — Conector SGP/TSMX** (`sgp.adapter.ts`, 2026-07-09) ·
  [x] **P0-05 — Conector Hubsoft** (`hubsoft.adapter.ts`, 2026-07-09).
- [x] **P0-06 — Camada de AÇÃO via ERP:** `tools.executor.ts._checkInvoice` usa o ERP do
  tenant quando há credencial ativa, fallback silencioso para Supabase (2026-07-09).
  ⚠️ só `check_invoice` migrado ainda — `suspend_signal`/`schedule_technical_visit` via
  ERP ficam para a próxima sessão do bloco. **Teste de paridade Talqui** (2ª via com
  juros recalculados pela regra do ERP) não foi feito contra ERP real — só mock/doc.
**Métrica de venda (RN20):** tempo de go-live (meta: <1 dia vs semanas dos
concorrentes); nº de ações executadas via ERP/mês.

### BLOCO P1 — Ações operacionais que o Anel 2 já vende
✅ **CODE-COMPLETE em 2026-07-11** (commit `978e93e`). Tabelas novas no Supabase
pendentes de migration pelo Lucas: `trust_unlock_policies`, `trust_unlocks`,
`negotiation_policies`, `outage_notifications`. Rota HTTP de notificação de falha
(`POST /api/outages/notify`) também pendente (P2 ou sessão dedicada).
- [x] **P1-01 — Religue por confiança** (`trust-unlock.service.ts`): política por tenant
  (max_times_per_year, max_debt_cents), fallback para default (2x/ano, R$200), tool
  `trust_unlock` no executor, auditável via infraLogger + audit_log.
- [x] **P1-02 — Notificação proativa de falha em massa** (`outage-notifier.service.ts`):
  operador informa CTO/região, Astrum busca afetados, dispara WhatsApp e persiste
  `outage_notifications`. ⚠️ Rota HTTP de invocação ainda não criada.
- [x] **P1-03 — Negociação guiada** (`debt-negotiation.service.ts`): menu parametrizado
  (desconto à vista + parcelamento), tool `negotiate_debt` no executor.
- [x] **P1-04 — Resumo para transferência humana** (`handover-summary.service.ts`):
  `buildHandoverSummary` + `formatHandoverForTicket` — `escalate.node.ts` usa.
**Métrica:** % resolvido sem humano (meta inicial: ≥84%, o número da Mundiale).

### BLOCO P2 — Omnichannel de verdade
✅ **CODE-COMPLETE em 2026-07-11**. Migrations pendentes (Lucas): `tenant_meta_pages`, `tenant_email_inboxes`.
**Gap:** Astrum é WhatsApp (Evolution). Concorrentes cobrem Instagram/Messenger/
e-mail/telefone; a Meta empurra IA nativa nesses canais.
- [x] **P2-01 — Instagram DM + Messenger** (`meta-graph.adapter.ts` + `meta-webhook.routes.ts`):
  Meta Graph API v21.0; circuit-breaker; GET verification + POST inbound; tenant lookup via
  `tenant_meta_pages`; assinatura FACEBOOK_APP_SECRET (reutiliza provider existente).
  Rotas: GET/POST `/api/v2/webhook/meta`.
- [x] **P2-02 — E-mail** (`email.adapter.ts` + `email-inbound.routes.ts`): sender nodemailer (já
  na workspace root) fail-open sem SMTP_HOST; inbound POST `/api/v2/webhook/email` compatível
  SendGrid/Mailgun/Postmark; tenant lookup via `tenant_email_inboxes`; Bearer secret.
- [x] **P2-03 — Unificação de fila** (`channel-sender.service.ts`): `message.worker` agora usa
  `sendChannelResponse` — roteia whatsapp→Evolution, instagram/messenger→Meta, email→SMTP,
  webchat/telephony→sem-op (têm canal próprio). Canal expandido no `MessageJobData`.
- [x] **P2-04 — Inbox unificada do operador** (`inbox.routes.ts`): GET `/api/v2/conversations/inbox`
  (lista com filtros status/channel/limit/offset, inclui handoverSummary do P1-04) e
  GET `/api/v2/conversations/inbox/metrics` (contadores byChannel + byStatus + escalated).
  Coordenar UI com Onda 4.
**Métrica:** canais ativos por tenant; tempo de primeira resposta por canal.

### BLOCO P3 — Vendas (o funil que Elleven e Mundiale já têm)
✅ **CODE-COMPLETE em 2026-07-11**. Migration `067_p3_sales_leads` pendente de apply pelo Lucas.
Chaves de contrato digital pendentes de configuração: `CLICKSIGN_API_KEY` ou `D4SIGN_API_KEY`.
**Gap:** a Astrum não vende — só atende e cobra. Elleven tem a jornada "Vender"
completa; Mundiale fecha venda no WhatsApp.
- [x] **P3-01 — Funil conversacional de venda** (`sales-funnel.service.ts`): state machine completa:
  collecting_address → checking_viability → viability_failed | presenting_plans → collecting_data
  → registering → scheduling → completed. Viabilidade via ERP (P0) ou grafo local (IA-16 `capacidade`).
  Planos via ERP ou tabela local. Pré-cadastro e agendamento de OS no ERP; fallback local.
- [x] **P3-02 — Subgrafo `vendas` no multi-agente** (`vendas.subgraph.ts`): domínio `vendas` adicionado
  ao `AgentDomainSchema`, ao `SupervisorIntentSchema` e ao grafo LangGraph. Usa `generateObject` para
  extrair endereço, seleção de plano, dados pessoais e data de agendamento da conversa.
- [x] **P3-03 — Contrato digital** (`contract.service.ts`): Clicksign (CLICKSIGN_API_KEY) e D4Sign
  (D4SIGN_API_KEY). Fail-open: sem chave retorna `pending_signature` sem erro. Tool `send_contract`
  no `tools.executor.ts`. Novo tool `check_viability` e `list_plans` também adicionados.
  ERP: IXC agora implementa `ERPSalesCapable` (checkViability/getPlans/createPreRegistration/scheduleInstallation).
  Migrations pendentes (Lucas): `067_p3_sales_leads.sql` (tabela `sales_leads`).
**Métrica:** % de leads convertidos sem humano; tempo lead→instalação agendada.

### BLOCO P4 — Experiência do assinante
**Gap:** IXC Oner tem nova Central do Assinante; todos têm app/central. A Astrum
tem o embrião `subscriber-portal.ts` (auth por CPF, ações por status — real,
auditado).
- **P4-01 — Central do assinante white-label (PWA)**: 2ª via, diagnóstico
  (`run_diagnostics` já existe como tool), status da OS, histórico — mesmo backend
  do agente, casca web instalável. PWA primeiro, loja depois (decisão registrada:
  app nativo só com demanda).
- **P4-02 — Diagnóstico self-service** ("minha internet está lenta" → roda o
  diagnóstico real → mostra o resultado → abre OS se preciso).
**Métrica:** % de autoatendimento no portal; nota de app/loja quando houver.

### BLOCO P5 — Prova de valor e confiança (o que faz o deal fechar)
**Gap:** concorrentes vendem com números e a IXC vende confiança institucional
(Banco do Brasil, eventos). A Astrum precisa de artilharia de prova.
- **P5-01 — Dashboard "Valor Gerado"** (a tela que o DONO vê): R$ recuperado pela
  cobrança IA, atendimentos resolvidos sem humano, horas economizadas, tickets
  evitados — com metodologia aberta (nada de número inventado; RN20). Fonte:
  IA-34 (custo) + variant_sends (IA-26) + tickets. *Item de UI/UX coordenado.*
- **P5-02 — Status page pública + SLA publicado** (uptime do motor; transparência
  vende para técnico).
- **P5-03 — Kit de compliance:** DPA/LGPD formal, política de dados por tenant,
  resposta padrão a due diligence (as práticas já existem no código — RLS por
  tenant, PII masking, audit trail; falta EMPACOTAR como documento comercial).
- **P5-04 — Case engine:** todo tenant piloto gera case com número auditado
  (backtesting D-02 do PLANO_A vira a máquina de cases quando existir).
- **P5-05 — Trial sem fricção (resposta ao James/Telia):** o Degrau 0 vira
  produto: cadastro self-service → conectar ERP (P0-01) → sync read-only →
  primeiro relatório de insight em <30 min, grátis por 7-14 dias, sem call de
  vendas obrigatória. O relatório do trial JÁ usa os números do P5-01 ("neste
  período a Astrum teria recuperado R$ X"). Distribuição: presença de conteúdo
  onde o dono de ISP está (Instagram) é decisão comercial do Lucas — o produto
  entrega a landing do trial e o funil instrumentado.
**Métrica:** ciclo de venda (dias); % de deals ganhos vs Anel 2; conversão
trial→pago.

### BLOCO P6 — Rede/CPE via parceria (não construir)
**Gap:** IXC ACS gerencia CPE com IA (TR-069). Construir ACS = anos (RN19).
- **P6-01 — Integração de telemetria CPE** (Anlix/Flashman ou o ACS do próprio
  ERP via P0): leituras de sinal/reboot/wifi alimentam `network_metrics` (IA-09)
  e turbinam IA-24/D-04 sem construir o ACS.
- **P6-02 — Integração OZmap** (documentação de planta → alimenta o grafo IA-16 e
  o futuro gêmeo digital D-01).
**Métrica:** % de tenants com telemetria de CPE fluindo.

---

## §4 — METAS DE PARIDADE (checklist de "igual a igual")

| Capacidade do concorrente | Sessão | Meta medida (RN20) |
|---|---|---|
| Integra os 6 grandes ERPs (Mundiale) | P0-01..05 | 5 conectores; go-live <1 dia |
| 2ª via com juros do ERP (Talqui) | P0-06 | 100% de exatidão vs ERP em 50 casos |
| Religue por confiança (Mundiale) | P1-01 | Ativo em 100% dos pilotos |
| "84% resolvido automaticamente" (Mundiale) | P1-* | ≥84% medido em produção |
| "−30% inadimplência" (Mundiale, sem prova) | IA-26 + P5-04 | Δ inadimplência MEDIDO por coorte (e depois PROVADO por backtesting D-02) |
| Funil de venda (Elleven "Vender") | P3-01..03 | Venda ponta a ponta sem humano em piloto |
| Omnichannel (Opa!/Chatlabs) | P2-01..04 | WhatsApp+IG+e-mail na mesma fila |
| Central do assinante (IXC Oner) | P4-01..02 | ≥30% de autoatendimento no portal |
| IA institucional (IXC Lia/Manuel) | já superado pelo motor (eval/guardrails/replay) | manter: eval nightly verde (IA-42) |

## §5 — ORDEM E INTERCALAÇÃO COM OS PLANOS EXISTENTES
1. **P0 é o desbloqueador universal** — pode e deve intercalar com a Fase 2 do
   IA-NEXTGEN (não conflita: P0 é domínio `provedor/erp`, Fase 2 é `ia/*`).
   Sugestão: P0-01 (IXC) logo após IA-38/IA-23 (Bloco A da Fase 2).
2. P1/P2 dependem de P0 + cutover do atendimento (S74) para agir em produção.
3. P3 depende de P0 + IA-10 (subgrafo). P4 depende de P0. P5-01 depende de IA-34
   (já em main). P6 é independente (parceria comercial primeiro).
4. O PLANO_A consome P0/P3 como combustível (RN18) — a paridade alimenta o
   diferencial, nunca o contrário.

## §6 — FONTES DA PESQUISA (julho/2026) E LIMITAÇÕES
- Mundiale.ai — IA para provedores: https://www.mundiale.ai/ia-para-provedores-de-internet/
- Talqui × IXC (balcão financeiro WhatsApp): https://talqui.chat/integracoes/com/ixc
- IXC — assistentes Lia/Manuel: https://wiki-erp.ixcsoft.com.br/artigos/assistente-inteligente---lia
- IXC ACS — IA: https://central-ixcacs.ixcsoft.com.br/es/documentacion/articulos/inteligencia-artificial-do-acs.html
- IXC Oner — nova Central do Assinante: https://central-ixconer.ixcsoft.com.br/
- Voalle Elleven: https://grupovoalle.com.br/elleven · MVNO/Telecall: https://inforchannel.com.br/2025/09/30/telecall-e-voalle-fecham-parceria-para-integrar-o-erp-elleven-ao-mercado-mvno/
- Hubsoft — Panorama 2026: https://hubsoft.io/2025/12/04/panorama-2026-a-nova-era-dos-provedores-de-internet/
- MK Solutions — investimento R$30M: https://ipnews.com.br/especialista-em-telecomunicacoes-mk-solutions-anuncia-investimentos-de-r-30-milhoes/ · categoria IA: https://www.mksolutions.com.br/categoria/inteligencia-artificial/
- Meta Business Agent (jun/2026): https://exame.com/tecnologia/meta-amplia-business-agent-no-whatsapp-inclui-instagram-e-prepara-cobranca-para-pmes/
- Ecossistema de bots: https://www.chatlabs.com.br/whatsapp-api-para-provedores-de-internet-suporte-cobranca-e-os · https://wiki.opasuite.com.br/integracoes/erp-ixc/cobranca-whatsapp · https://zapisp.com.br/integracoes · https://www.pliq.io/integracoes/
- Instagram público: @ixcsoft (18k, APTC Cumbre Lima 2026, parceria BB) · @hubsoftoficial · @grupovoalle.
- Meu James (add. 2026-07-08): https://meujames.com/ · https://meujames.com/lp/provedor · blog SEO: https://blog.meujames.com/plataforma-chatbot-provedores-internet-isp-brasil-whatsapp-atendimento/
- Telia (add. 2026-07-08): https://telia.agenciaintellect.com.br/ (landing JS — monitorar Instagram diretamente)
- Demais anel 2 (add. 2026-07-08): https://www.maxbot.com.br/plataforma-de-atendimento-digital-2/plataforma-de-atendimento-para-provedores-de-internet · https://www.evotalks.com.br/provedores-de-internet/ · https://ziveai.com.br/ · https://ispai.com.br/

**Limitações registradas:** Facebook/Instagram exigem login para o feed completo —
a leitura foi de posts indexados publicamente. **Recomendação:** monitoramento
mensal recorrente (sessão curta: 6 buscas fixas + 3 perfis) com registro num
`RADAR_CONCORRENCIA.md` nesta pasta; a primeira execução pode ser agendada quando
o Lucas quiser.
