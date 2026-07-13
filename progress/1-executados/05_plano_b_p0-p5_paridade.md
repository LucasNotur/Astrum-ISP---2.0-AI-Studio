# Plano B — Paridade competitiva P0–P5 — ✅ CÓDIGO COMPLETO (2026-07-09/12)

**Fonte:** `.astrum-progress/nextgen-2.0/PLANO_B_PARIDADE_CONCORRENTES__PENDENTE.md`
(pendente APENAS pelo P6 — parceria comercial)

**O que é:** tudo que os concorrentes (Mundiale, Elleven, bots de ERP) vendem, a
Astrum agora tem — e é a porta de entrada no cliente via ERP.

- **P0 — Conectores ERP profundos** ✅ — IXC, Voalle, MKAuth, SGP, HubSoft
  (`apps/api/src/adapters/erp/`). Interface comum `ERPProvider` + capacidades opcionais
  de vendas (`ERPSalesCapable`) e operação (`ERPOperationsCapable`, 2026-07-12).
  A IA consulta fatura, gera 2ª via, verifica conexão, desbloqueia, SUSPENDE e ABRE OS
  direto no sistema que o ISP já usa.
- **P1 — Ações operacionais** ✅ — religue por confiança (com política e limite),
  notificação proativa de falha em massa, menu de negociação de dívida, handover
  quente para humano.
- **P2 — Omnichannel real** ✅ — Instagram, Messenger, e-mail (inbound parse + envio)
  e inbox unificada. Webhook Meta + adapters de canal.
- **P3 — Vendas** ✅ — funil completo no subgrafo de vendas: lead → viabilidade
  (grafo/ERP) → apresentação de planos → coleta de dados → contrato digital
  (ClickSign/D4Sign) → agendamento de instalação.
- **P4 — Central do assinante** ✅ — PWA self-service: fatura, diagnóstico, status
  da conexão, sem login por senha (CPF + validação).
- **P5 — Prova de valor** ✅ — dashboard "Valor Gerado" (R$ economizado/recuperado),
  status page pública, kit compliance, case engine (gera estudo de caso com número
  real), trial 14 dias sem fricção.

**Pendências do Lucas (não são código):** aplicar migrations em produção, chaves
ClickSign/D4Sign, instância IXC real para homologação, decisão de URL do PWA.
**P6 (CPE/OZmap)** → `progress/2-pendentes/02`.
