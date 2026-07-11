/**
 * P5-03 — Kit de Compliance (DPA/LGPD, due diligence, política por tenant).
 *
 * As práticas JÁ existem no código (RLS por tenant, PII masking, audit trail,
 * right-to-be-forgotten via deleteCustomerMemory). Este módulo EMPACOTA esses
 * compromissos como documentos comerciais/legais consumíveis via API.
 *
 * Endpoints:
 *   GET /api/v2/compliance/dpa               DPA LGPD (público)
 *   GET /api/v2/compliance/due-diligence     Q&A de due diligence (público)
 *   GET /api/v2/compliance/policy            Política de dados por tenant (auth)
 */
import type { FastifyInstance } from 'fastify';

const DPA_VERSION = '1.0.0';
const DPA_DATE = '2026-07-11';

const DPA_DOCUMENT = {
  version: DPA_VERSION,
  effectiveDate: DPA_DATE,
  title: 'Acordo de Processamento de Dados (DPA) — Astrum AI',
  sections: [
    {
      id: 'S1',
      title: 'Definições',
      content:
        'Controlador: o ISP (Provedor de Acesso à Internet) contratante. ' +
        'Operador: Astrum Tecnologia, responsável pelo processamento dos dados ' +
        'pessoais dos assinantes do ISP em nome do Controlador.',
    },
    {
      id: 'S2',
      title: 'Dados Processados',
      content:
        'A Astrum processa, em nome do ISP: (a) dados cadastrais dos assinantes ' +
        '(nome, CPF/CNPJ, endereço, contato); (b) dados de faturamento (faturas, ' +
        'histórico de pagamentos); (c) dados de atendimento (histórico de conversas ' +
        'via WhatsApp, Instagram, e-mail); (d) dados técnicos (endereço IP, logs de ' +
        'conectividade quando fornecidos pelo ERP).',
    },
    {
      id: 'S3',
      title: 'Base Legal (LGPD Art. 7º)',
      content:
        'O processamento se baseia em: execução de contrato (inc. V), legítimo ' +
        'interesse do ISP em manter e cobrar pelos serviços (inc. IX), e ' +
        'consentimento explícito do assinante para comunicação comercial (inc. I).',
    },
    {
      id: 'S4',
      title: 'Medidas Técnicas e Organizacionais',
      content:
        'Isolamento por tenant via Row-Level Security (RLS) no Supabase; ' +
        'criptografia em trânsito (TLS 1.3) e em repouso (AES-256 para credenciais ' +
        'de ERP); mascaramento de PII em logs (infraLogger.piiMask); audit trail ' +
        'completo (tabela audit_log); retenção de dados de conversas: 24 meses.',
    },
    {
      id: 'S5',
      title: 'Direitos dos Titulares (LGPD Cap. III)',
      content:
        'O ISP é responsável por receber e encaminhar requisições de titulares. ' +
        'A Astrum provê: (a) API de exclusão de dados do assinante ' +
        '(DELETE /api/v2/customers/:id — apaga conversas, memória e dados pessoais); ' +
        '(b) exportação de dados em JSON via GET /api/v2/customers/:id/export; ' +
        '(c) prazo de atendimento: 15 dias úteis.',
    },
    {
      id: 'S6',
      title: 'Suboperadores',
      content:
        'OpenAI (processamento de linguagem natural — dados não usados para treino ' +
        'conforme API Terms); Supabase (banco de dados — infraestrutura AWS São Paulo); ' +
        'Cloudflare R2 (armazenamento de mídia); Redis Labs (cache e filas).',
    },
    {
      id: 'S7',
      title: 'Incidentes de Segurança',
      content:
        'Em caso de incidente com impacto a dados pessoais: notificação ao ISP ' +
        'em até 72h (LGPD Art. 48); notificação à ANPD pelo ISP (Controlador) ' +
        'quando aplicável. Contato: dpo@astrumai.com.br.',
    },
    {
      id: 'S8',
      title: 'Encerramento do Contrato',
      content:
        'Ao término: exportação completa dos dados do ISP em até 30 dias; ' +
        'exclusão segura de todos os dados processados em até 90 dias, com ' +
        'certificado de destruição emitido.',
    },
  ],
  contact: {
    dpo: 'dpo@astrumai.com.br',
    legal: 'legal@astrumai.com.br',
  },
};

const DUE_DILIGENCE_QA = [
  {
    q: 'Onde os dados dos assinantes são armazenados?',
    a: 'No Supabase (PostgreSQL), infraestrutura AWS região São Paulo (sa-east-1). Dados de mídia (áudio, imagens) no Cloudflare R2.',
  },
  {
    q: 'A Astrum usa os dados dos assinantes para treinar modelos de IA?',
    a: 'Não. Usamos modelos via API da OpenAI, que por contrato não usa dados de clientes via API para treino. Dados sintéticos gerados internamente nunca incluem PII real.',
  },
  {
    q: 'Como é garantido o isolamento entre diferentes ISPs (tenants)?',
    a: 'Row-Level Security (RLS) no PostgreSQL: toda query é automaticamente filtrada pelo tenant_id. Validado por suíte de testes de isolamento (packages/db/src/tests/rls-isolation.test.sql).',
  },
  {
    q: 'Qual é o SLA de disponibilidade?',
    a: '99,5% de uptime mensal. Status em tempo real: GET /api/v2/valor/status. Incidentes históricos disponíveis no mesmo endpoint.',
  },
  {
    q: 'Como funciona o direito ao esquecimento (LGPD)?',
    a: 'DELETE /api/v2/customers/:id apaga: conversas, memória vetorial (Qdrant), dados pessoais da tabela customers e registros de cobrança associados, mantendo apenas audit trail anonimizado por obrigação legal.',
  },
  {
    q: 'Quais certificações de segurança a Astrum possui?',
    a: 'Em processo de SOC 2 Type I (previsão: Q3/2026). Atualmente: auditoria OWASP Top 10 interna, pen test anual por empresa terceirizada, e LGPD DPA formal desde 2026-07.',
  },
  {
    q: 'Como as credenciais do ERP são armazenadas?',
    a: 'Criptografadas com AES-256-GCM (chave gerenciada pelo operador, nunca exposta em logs). Coluna cifrada na tabela tenant_erp_credentials. Auditadas via audit_log.',
  },
  {
    q: 'Qual é o processo de backup e recuperação de dados?',
    a: 'Supabase realiza backups automáticos diários com retenção de 7 dias (plano Pro) e Point-in-Time Recovery. RTO: 4h; RPO: 24h.',
  },
];

export async function complianceRoutes(app: FastifyInstance) {
  // ── GET /api/v2/compliance/dpa ────────────────────────────────────────────
  app.get('/api/v2/compliance/dpa', async (_request, reply) => {
    return reply
      .header('Cache-Control', 'public, max-age=3600')
      .send(DPA_DOCUMENT);
  });

  // ── GET /api/v2/compliance/due-diligence ──────────────────────────────────
  app.get('/api/v2/compliance/due-diligence', async (_request, reply) => {
    return reply
      .header('Cache-Control', 'public, max-age=3600')
      .send({
        version: DPA_VERSION,
        updatedAt: DPA_DATE,
        questions: DUE_DILIGENCE_QA,
      });
  });

  // ── GET /api/v2/compliance/policy (por tenant, auth obrigatória) ──────────
  app.get('/api/v2/compliance/policy', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const { tenantId } = (request as any).user;
    return reply.send({
      tenantId,
      generatedAt: new Date().toISOString(),
      dataRetention: {
        conversations: '24 months',
        invoices: '60 months (fiscal obligation)',
        auditLog: '60 months',
        media: '12 months',
      },
      piiMasking: {
        logs: true,
        exports: 'partial (CPF masked as ***)',
      },
      rlsEnabled: true,
      auditTrailEnabled: true,
      dpaVersion: DPA_VERSION,
      contact: DPA_DOCUMENT.contact,
    });
  });
}
