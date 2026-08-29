# PLANO — P3-03 Contrato digital (Clicksign / D4Sign)

> Épico aberto em 2026-08-29 (a pedido do Lucas) ao fechar a auditoria do funil de
> vendas. **Não é bug** — é feature nova incompleta. `contract.service.ts` é
> throw-safe (fail-open, não derruba o agendamento), mas **não funciona
> ponta-a-ponta**. Este plano separa o que dá pra fazer **offline** (sem
> credencial, já testável) do que **exige credencial + validação ao vivo** (mesma
> classe de bloqueio dos adapters ERP).
>
> Fontes: `apps/api/src/domain/vendas/contract.service.ts`,
> chamada em `apps/api/src/domain/agent/subgraphs/vendas.subgraph.ts:226`
> (estágio `scheduling` → `completed`), colunas em
> `packages/db/src/migrations/067_p3_sales_leads.sql`. Ver também
> `astrum-sales-funnel-auditoria` na memória do Claude Code.

## Estado atual (o que existe)

- `sendContract(req, http)` resolve a chave do tenant (`resolveTenantContractKeys`,
  BYOK) com fallback pro env global; escolhe Clicksign se houver chave, senão
  D4Sign, senão retorna `pending_signature`/`provider: 'none'` sem erro.
- Cablado no subgraph: após agendar a instalação, se o lead tem email OU telefone,
  chama `sendContract` e persiste `contract_status`/`contract_url`/`contract_provider`
  no `sales_leads` (só quando veio `contractUrl`).
- Robustez OK: BYOK fail-open (`{}` em erro/timeout), `sendViaClicksign`/`sendViaD4sign`
  capturam e devolvem `failed` sem lançar. O agendamento já concluído não é
  derrubado por falha de contrato.

## Gaps confirmados (por que não funciona ponta-a-ponta)

1. **PDF placeholder inválido.** `buildContractBase64` monta bytes fake
   (`%PDF-1.4` + texto puro, sem objetos/xref/trailer) — Clicksign/D4Sign rejeitam.
   O próprio comentário admite ("em produção deve usar template real").
2. **Fluxo Clicksign incompleto (não só a URL).** A API v1 não aceita signatário
   inline no create de documento como o código faz — exige 3 chamadas: criar
   documento (`POST /documents`), criar signatário (`POST /signers`), vincular numa
   lista (`POST /lists`) e disparar. A `contractUrl` montada como
   `app.clicksign.com/${key}` também é formato provável errado (a resposta traz a
   URL/sign-key real). Nada disso é confirmável sem conta.
3. **Fluxo D4Sign incompleto.** Só faz `documents/upload` e devolve `sent` — falta
   registrar signatário (`.../createlist`) e disparar o envio (`.../sendtosigner`).
   O documento sobe mas nunca vai pra assinatura.
4. **`externalKey` não é persistido.** `ContractResult.externalKey` (document key
   Clicksign / uuid D4Sign) é retornado mas **não há coluna** pra guardá-lo → sem
   ele não dá pra reconciliar um webhook de assinatura depois.
5. **Sem webhook de assinatura.** Nada move `contract_status` de
   `pending_signature` → `signed`. Mesmo que o envio funcionasse, o lead nunca é
   marcado como assinado, e nada é disparado pós-assinatura.

## Decisões pendentes (Lucas) — resolver antes de codar as fases pagas

- **Qual provedor primeiro?** Clicksign e D4Sign são os dois líderes BR. Recomendo
  **um só pra MVP** (menos superfície pra validar ao vivo). Sem preferência do
  Lucas, sugiro **Clicksign** (API v1 mais documentada, sandbox self-service).
- **Biblioteca de PDF?** Recomendo **`pdf-lib`** (puro JS/TS, sem binário nativo —
  roda no Node do apps/api sem dor; `jsPDF` é orientado a browser). Decisão trava a
  Fase A.
- **Template do contrato:** default único da Astrum vs. por-tenant (texto
  configurável em Configurações → Integrações)? MVP = default único; por-tenant
  vira fase separada.
- **Ativação pós-assinatura** (marcar cliente ativo / disparar provisionamento
  quando `signed`) entra neste épico ou é frente separada? Recomendo **separada** —
  fecha o webhook aqui, a ativação puxa outra cadeia.

## Fases

### Fase A — Offline (sem credencial) — CONCLUÍDA 2026-08-29

- [x] **A1 — PDF real.** `buildContractBase64` gera via **jsPDF** (já era dep da raiz,
  evitou adicionar `pdf-lib`; validado gerando PDF com header/xref/trailer/%%EOF no
  Node). Teste assegura PDF estruturalmente válido. Função pura, exportada.
- [x] **A2 — Template default de verdade.** 7 cláusulas essenciais (objeto, preço,
  instalação, vigência, comodato, LGPD, aceite) com word-wrap. Default único da
  Astrum; por-tenant fica pra fase posterior (decisão em aberto).
- [x] **A3 — Migration `contract_external_key`.** `127_sales_leads_contract_external_key.sql`
  (coluna `text` nullable) — **aplicada no Supabase cloud e verificada**. Subgraph
  persiste `contractResult.externalKey`. Destrava a reconciliação por webhook (Fase C).
- [x] **A4 — Shape completo dos fluxos.** Clicksign (`/documents` → `/signers` →
  `/lists`) e D4Sign (`upload` → `createlist` → `sendtosigner`) implementados com
  `ContractHttpClient` injetável; leitura de resposta defensiva + fallback de URL.
  Testes mockam o HTTP e assertam sequência/payloads. **Shapes marcados como
  PROVÁVEIS no código — pendentes de validação ao vivo (Fase B).**

### Fase B — Precisa credencial (validação ao vivo) — BLOQUEADA no Lucas

- [ ] **B1 — Clicksign ao vivo.** Conta/sandbox + `CLICKSIGN_API_KEY`. Validar a
  sequência real, corrigir o shape da resposta e a `contractUrl` de verdade
  (sign-key devolvida pela API). Ajustar os mocks da A4 pro shape confirmado.
- [ ] **B2 — D4Sign ao vivo.** `tokenAPI` (+ cofre/`uuidSafe`). Validar
  upload→createlist→sendtosigner ponta-a-ponta.
- [ ] **B3 — Escolha do provedor MVP** (decisão acima) — o outro fica atrás de
  flag/BYOK, sem validação ao vivo até haver demanda.

### Fase C — Webhook de assinatura (fecha o ciclo) — precisa segredo do webhook

- [ ] **C1 — Rota `POST /webhooks/contracts/:provider`** recebendo o callback de
  "assinado", validando a assinatura HMAC do provedor (segredo = credencial),
  casando pelo `contract_external_key` (A3) e setando `contract_status='signed'` +
  URL do documento assinado.
- [ ] **C2 — Pós-assinatura** (se entrar no escopo): o que dispara quando vira
  `signed`. Provável frente separada (ver decisões).

## Definition of Done (por CLAUDE.md §qualidade)

- Todo código novo com teste Vitest cobrindo comportamento (não só "compila").
- Fase A validável 100% offline (PDF válido + sequência de chamadas mockada).
- Fases B/C só fecham com validação ao vivo em sandbox do provedor.
- Sem reintroduzir `firebase`/Express (R2/R4). Feature nova mora em `apps/api` (R4).

## Bloqueios / credenciais necessárias

- Clicksign: API key de sandbox (self-service).
- D4Sign: `tokenAPI` + cofre (sandbox).
- Webhook: segredo de assinatura HMAC de cada provedor (Fase C).
