import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import etag from '@fastify/etag';
import { validateEnv } from './infrastructure/config/env.validator';
import { initSentry } from './infrastructure/observability/sentry.service';
import sentryPlugin from './infrastructure/observability/sentry-fastify.plugin';

export async function buildServer() {
  initSentry(); // DEVE ser chamado antes de qualquer outro código
  validateEnv();

  // IA-32 — OTel boot ANTES de tudo (spans precisam do SDK registrado).
  const { initOtel } = await import('./infrastructure/observability/otel');
  await initOtel();
  
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
  });

  // APPSEC-05: captura os bytes CRUS do corpo antes do parse, em request.rawBody.
  // Necessário para validar HMAC de webhooks contra o que o provider assinou de fato —
  // reserializar via JSON.stringify(request.body) muda os bytes (ordem de chaves, espaços,
  // unicode) e pode falsear negativo OU deixar passar assinatura forjada.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    (request as any).rawBody = body;
    if (body.length === 0) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(body.toString('utf8')));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Registrar plugin Sentry antes dos outros plugins
  await app.register(sentryPlugin);

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
  });

  await app.register(compress, { global: true, threshold: 1024 });
  await app.register(etag);

  await app.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:5173'],
    credentials: true,
  });

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('FATAL: JWT_SECRET ausente ou menor que 32 caracteres. Servidor NÃO vai subir.');
  }

  await app.register(jwt, {
    secret: jwtSecret,
    sign: { expiresIn: '15m' },
  });

  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  app.decorate('authenticate', async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch (err) {
      // Bug S68: responder 401 explícito (antes ia sem status → virava 500 em alguns casos).
      return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Token ausente ou inválido.' });
    }
    // AUTH-01 (auditoria 2026-08-10): token de ASSINANTE (portal do cliente final) é
    // assinado com o MESMO JWT_SECRET. Sem esta checagem, um assinante autenticado usava
    // rotas de OPERADOR (ex.: /api/v2/conversations/inbox) e lia o atendimento de todos os
    // clientes do provedor. Rotas de operador NUNCA aceitam token de assinante.
    const u = (request as any).user ?? {};
    if (u.role === 'subscriber' || u.aud === 'subscriber-portal') {
      return reply.code(403).send({ code: 'FORBIDDEN', message: 'Token de assinante não é válido para esta rota.' });
    }
    // AUTH-05: exige binding de emissor/audiência do access token de operador.
    if (u.iss !== 'astrum-api' || u.aud !== 'astrum-operator') {
      return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Token com emissor/audiência inválidos.' });
    }
  });

  const idempotencyPlugin = await import('./infrastructure/idempotency/idempotency.middleware');
  await app.register(idempotencyPlugin.default);

  const rateLimitPlugin = await import('./infrastructure/rate-limit/rate-limit.plugin');
  await app.register(rateLimitPlugin.default);

  const webhookHmacPlugin = await import('./infrastructure/security/webhook-hmac.plugin');
  await app.register(webhookHmacPlugin.default);

  // Compat com o Express legado: /api/system/webhook-url, /api/health, /api/health/whatsapp.
  const legacyCompatRoutes = await import('./infrastructure/http/legacy-compat.routes');
  await app.register(legacyCompatRoutes.default);

  const { authRoutes } = await import('./domain/auth/auth.routes');
  await app.register(authRoutes);

  const { loginRoute } = await import('./domain/auth/login.route');
  await app.register(loginRoute);

  const { registerRoute } = await import('./domain/auth/register.route');
  await app.register(registerRoute);

  // 2º fator (TOTP) do login próprio do apps/api — migration 107.
  const { mfaRoutes } = await import('./domain/auth/mfa.routes');
  await app.register(mfaRoutes);

  const { onboardingRoutes } = await import('./domain/onboarding/onboarding.routes');
  await app.register(onboardingRoutes);

  const { requirePermission } = await import('./infrastructure/auth/rbac.middleware');

  const { ticketRoutes } = await import('./domain/atendimento/tickets.routes');
  await app.register(ticketRoutes);

  const { documentRoutes } = await import('./domain/ia/documents.routes');
  await app.register(documentRoutes);

  const { knowledgeReindexRoutes } = await import('./domain/conhecimento/knowledge-reindex.routes');
  await app.register(knowledgeReindexRoutes);

  const { analyticsRoutes } = await import('./domain/ia/analytics.routes');
  await app.register(analyticsRoutes);

  const { ragRoutes } = await import('./domain/ia/rag.routes');
  await app.register(ragRoutes);

  // Scrape ad-hoc de URL → artigo na KB (KnowledgeBasePage). SSRF-guarded.
  const { scrapeUrlRoutes } = await import('./domain/ia/scrape-url.routes');
  await app.register(scrapeUrlRoutes);

  const { visionRoutes } = await import('./domain/ia/vision.routes');
  await app.register(visionRoutes);

  const { chatStreamRoutes } = await import('./domain/ia/chat-stream.routes');
  await app.register(chatStreamRoutes);

  const { etlRoutes } = await import('./domain/ia/etl.routes');
  await app.register(etlRoutes);

  // IA-11 — flags públicas para o frontend legado (sem autenticação).
  const { flagsRoutes } = await import('./domain/ia/flags.routes');
  await app.register(flagsRoutes);

  // IA-19 — tool registry: listar/ligar/desligar tools do agente por tenant.
  const { toolsAdminRoutes } = await import('./domain/ia/tools-admin.routes');
  await app.register(toolsAdminRoutes);

  // IA-21 — fila de revisão de respostas vetadas pelo classificador de segurança.
  const { safetyRoutes } = await import('./domain/ia/safety.routes');
  await app.register(safetyRoutes);

  // IA-16 — Grafo de rede (impacto, reincidência, capacidade).
  const { graphRoutes } = await import('./domain/rede/graph.routes');
  await app.register(graphRoutes);

  // IA-27 — feature store: catálogo de features pré-computadas (cataloga + freshness).
  const { featuresRoutes } = await import('./domain/ia/features.routes');
  await app.register(featuresRoutes);

  // IA-26 — campanhas: variantes de mensagem de cobrança competindo por conversão
  // (multi-armed bandit Thompson sampling). Flag BANDIT_ENABLED default false.
  const { campaignsRoutes } = await import('./domain/ia/campaigns.routes');
  await app.register(campaignsRoutes);

  // IA-33 — drift detection: PSI histórico + atual (intents/sentimentos).
  // Flag DRIFT_DETECTION_ENABLED default false. Rota fica exposta mesmo
  // com flag off para permitir inspeção dos dados que o worker já tenha
  // produzido em rodadas anteriores.
  const { driftRoutes } = await import('./domain/ia/drift.routes');
  await app.register(driftRoutes);

  // IA-44 — Sandbox SQL do agente (somente leitura, defesa dupla).
  const { sandboxRoutes } = await import('./domain/ia/sandbox.routes');
  await app.register(sandboxRoutes);

  // IA-45 — Gerador de dados sintéticos (apenas tenants de teste).
  const { syntheticRoutes } = await import('./domain/ia/synthetic.routes');
  await app.register(syntheticRoutes);

  // IA-43 — status dos providers (chave, circuito, latência 24h) p/ painel IA.
  const { providersRoutes } = await import('./domain/ia/providers.routes');
  await app.register(providersRoutes);

  // IA-46 — Replay engine: POST /api/v2/ia/replay, GET /runs, GET /runs/:id.
  const { replayRoutes } = await import('./domain/ia/replay.routes');
  await app.register(replayRoutes);

  // IA-32 — OTel status (GET /api/v2/ia/otel/status).
  const { otelRoutes } = await import('./domain/ia/otel.routes');
  await app.register(otelRoutes);

  // IA-31 — Elo ranking: ranking, pending, resolve.
  const { modelsRoutes } = await import('./domain/ia/models.routes');
  await app.register(modelsRoutes);

  // IA-29 — Active learning: rotulagem de exemplos.
  const { labelingRoutes } = await import('./domain/ia/labeling.routes');
  await app.register(labelingRoutes);

  // IA-15 — OCR multi-layout: fila de revisão humana.
  const { ocrReviewRoutes } = await import('./domain/ia/ocr-review.routes');
  await app.register(ocrReviewRoutes);

  // IA-17 — MCP server: keys admin + endpoint POST /api/v2/mcp.
  const { mcpAdminRoutes } = await import('./domain/ia/mcp-admin.routes');
  await app.register(mcpAdminRoutes);

  // IA-22 — Web browsing: allowlist admin.
  const { browseAdminRoutes } = await import('./domain/ia/browse-admin.routes');
  await app.register(browseAdminRoutes);

  // IA-39 — Constitutional loop: princípios editáveis.
  const { constitutionRoutes } = await import('./domain/ia/constitution.routes');
  await app.register(constitutionRoutes);

  // IA-36 — Edge inference: shadow agreement stats.
  const { edgeRoutes } = await import('./domain/ia/edge.routes');
  await app.register(edgeRoutes);

  // IA-35 — Latency budget: relatório de latência por nó.
  const { latencyRoutes } = await import('./domain/ia/latency.routes');
  await app.register(latencyRoutes);

  // IA-24 — Network anomaly: detecção EWMA + z-score.
  const { anomalyRoutes } = await import('./domain/rede/anomaly.routes');
  await app.register(anomalyRoutes);

  // IA-25 — Demand forecast: seasonal moving average + staffing.
  const { forecastRoutes } = await import('./domain/ia/forecast.routes');
  await app.register(forecastRoutes);

  // IA-13 — Voice QA: scorecard de chamadas de voz.
  const { voiceQaRoutes } = await import('./domain/ia/voice.routes');
  await app.register(voiceQaRoutes);

  // IA-12 — Voice biometrics: consentimento + verificação.
  const { voiceConsentRoutes } = await import('./domain/ia/voice-consent.routes');
  await app.register(voiceConsentRoutes);

  // P0-01 — ERP admin: wizard de credenciais (15 min) + sanity test.
  const { erpAdminRoutes } = await import('./domain/erp/erp-admin.routes');
  await app.register(erpAdminRoutes);

  // SEC-R5 — gravação cifrada dos segredos de integração (openaiApiKey/evolutionApiKey).
  const { integrationSecretsRoutes } = await import('./domain/provedor/integration-secrets.routes');
  await app.register(integrationSecretsRoutes);

  // S90 — Svix outbound webhooks: configuração de endpoints pelo ISP.
  const webhookConfigRoutes = await import('./domain/webhooks/webhook-config.routes');
  await app.register(webhookConfigRoutes.default);

  const websocketRoutes = await import('./domain/realtime/websocket.routes');
  await app.register(websocketRoutes.default);

  // Webhook Evolution v2 (S71) — não recebe tráfego real até o cutover S74.
  const { evolutionWebhookRoutes } = await import('./domain/atendimento/evolution-webhook.routes');
  await app.register(evolutionWebhookRoutes);

  // P2-01 — Webhook Meta Graph API (Instagram DM + Messenger)
  const { metaWebhookRoutes } = await import('./adapters/meta/meta-webhook.routes');
  await app.register(metaWebhookRoutes);

  // P2-02 — Webhook e-mail inbound (SendGrid/Mailgun/Postmark)
  const { emailInboundRoutes } = await import('./adapters/email/email-inbound.routes');
  await app.register(emailInboundRoutes);

  // P2-04 — Inbox unificada do operador (todos os canais)
  const { inboxRoutes } = await import('./domain/atendimento/inbox.routes');
  await app.register(inboxRoutes);

  // Departamentos de atendimento (SLA + roteamento) — CRUD (migration 097).
  const { departmentsRoutes } = await import('./domain/atendimento/departments.routes');
  await app.register(departmentsRoutes);

  // Métricas de atendimento (cards FCR + Time-Quality) — fonte daily_metrics (098).
  const { metricsRoutes } = await import('./domain/atendimento/metrics.routes');
  await app.register(metricsRoutes);

  // Saúde da conexão WhatsApp (card WhatsAppPage) — sinais Redis + fila global.
  const { whatsappHealthRoutes } = await import('./domain/atendimento/whatsapp-health.routes');
  await app.register(whatsappHealthRoutes);

  // Histórico de saúde WhatsApp (tendência no card WhatsAppPage) — migration 105.
  const { whatsappHealthHistoryRoutes } = await import('./domain/atendimento/whatsapp-health-history.routes');
  await app.register(whatsappHealthHistoryRoutes);

  // Saúde da CONEXÃO WhatsApp (card MonitoringPage) — check ativo na Evolution API,
  // substitui o stub `/api/health/whatsapp` (Express raiz) que sempre dizia "open".
  const { whatsappConnectionHealthRoutes } = await import('./domain/atendimento/whatsapp-connection-health.routes');
  await app.register(whatsappConnectionHealthRoutes);

  // F1-B — WhatsAppPage: remoção de instância desconectada (antes ia direto ao Supabase
  // anônimo). Só a operação de delete — ver comentário no arquivo pro resto da página.
  const { whatsappPageRoutes } = await import('./domain/atendimento/whatsapp-page.routes');
  await app.register(whatsappPageRoutes);

  // Fase 2 — proxy Evolution API (port do Express /api/evolution/proxy). Creds server-side + guard SSRF.
  const { evolutionProxyRoutes } = await import('./domain/atendimento/evolution-proxy.routes');
  await app.register(evolutionProxyRoutes);

  // Freio de emergência do atendimento IA (kill switch de verdade, pós Fase 4 — ver
  // emergency-stop.service.ts e migration 108). Checado por message.worker.ts em toda mensagem.
  const { emergencyStopRoutes } = await import('./domain/atendimento/emergency-stop.routes');
  await app.register(emergencyStopRoutes);

  // Fase 3 — templates HSM (port de /api/hsm-templates, nunca montado no Express — bug pré-existente).
  const { hsmTemplatesRoutes } = await import('./domain/atendimento/hsm-templates.routes');
  await app.register(hsmTemplatesRoutes);

  // Fase 3 — widget de webchat (port de /api/webchat/*, nunca montado no Express — bug pré-existente).
  // Público (visitante anônimo do site do ISP) — sem authenticate, ver header do arquivo.
  const { webchatRoutes } = await import('./domain/atendimento/webchat.routes');
  await app.register(webchatRoutes);

  // Fase 2 — stats das filas BullMQ (port do Express /api/queues/stats → v2).
  const { queuesRoutes } = await import('./domain/ops/queues.routes');
  await app.register(queuesRoutes);

  // Fase 2 — agendamento de jobs (port do Express /api/jobs/schedule-csat → v2).
  const { jobsRoutes } = await import('./domain/ops/jobs.routes');
  await app.register(jobsRoutes);

  // Fase 2 — dead letter queue (port do Express /api/dlq → v2, retry engine-aware).
  const { dlqRoutes } = await import('./domain/ops/dlq.routes');
  await app.register(dlqRoutes);

  // Personas de IA por tenant (AIConfigPage) — portado do personaManager legado,
  // mesma fonte (legacy_docs/ai_personas) que o messageWorker lê.
  const { personasRoutes } = await import('./domain/atendimento/personas.routes');
  await app.register(personasRoutes);

  // Validação de system prompts (AIConfigPage → "Validar e salvar").
  const { promptsRoutes } = await import('./domain/atendimento/prompts.routes');
  await app.register(promptsRoutes);

  // Monitor de qualidade ao vivo (QualityMonitorPage) — agregados de tickets.
  const { qualityStatsRoutes } = await import('./domain/atendimento/quality-stats.routes');
  await app.register(qualityStatsRoutes);

  // Feriados nacionais (SettingsPage) — carga determinística do ano corrente.
  const { holidaysRoutes } = await import('./domain/atendimento/holidays.routes');
  await app.register(holidaysRoutes);

  // Verificação de DNS de domínio customizado (SettingsPage → whitelabel).
  const { domainVerifyRoutes } = await import('./domain/atendimento/domain-verify.routes');
  await app.register(domainVerifyRoutes);

  // IA-09 — Coleta de métricas de rede (CTO failure prediction, fase 0)
  const { metricsIngestRoutes } = await import('./domain/rede/metrics-ingest.routes');
  await app.register(metricsIngestRoutes);

  // IA-08 — Voz MVP (telefonia + OpenAI Realtime)
  const { twilioVoiceRoutes } = await import('./adapters/telephony/twilio-webhook.routes');
  await app.register(twilioVoiceRoutes);

  const { voiceStreamRoutes } = await import('./adapters/telephony/voice-stream.routes');
  await app.register(voiceStreamRoutes);

  const { subscriberPortalRoutes } = await import('./domain/provedor/subscriber-portal.routes');
  await app.register(subscriberPortalRoutes);

  // P5-01/02/04 — Dashboard Valor Gerado + Status page + Case engine
  const { valorGeradoRoutes } = await import('./domain/provedor/valor-gerado.routes');
  await app.register(valorGeradoRoutes);

  // F1-A — DashboardPage: upsell events + CSAT ratings (antes iam direto ao Supabase anônimo).
  const { dashboardRoutes } = await import('./domain/provedor/dashboard.routes');
  await app.register(dashboardRoutes);

  // F1-B — TeamPage: CRUD de colaboradores + performance/ranking do mês (antes iam
  // direto ao Supabase anônimo).
  const { teamPageRoutes } = await import('./domain/provedor/team-page.routes');
  await app.register(teamPageRoutes);

  // F1-C — SettingsPage: toggles de módulos habilitados (antes ia direto ao Supabase
  // anônimo). Só enabled_modules — o resto da página mira colunas/tabelas que não
  // existem no schema real, ver settings-page.routes.ts.
  const { settingsPageRoutes } = await import('./domain/provedor/settings-page.routes');
  await app.register(settingsPageRoutes);

  // P5-03 — Kit de compliance (DPA/LGPD + due diligence)
  const { complianceRoutes } = await import('./domain/provedor/compliance.routes');
  await app.register(complianceRoutes);

  // LGPD Art. 18 — expurgo (direito ao apagamento) por cliente. Admin-only, destrutivo.
  const { lgpdRoutes } = await import('./domain/provedor/lgpd.routes');
  await app.register(lgpdRoutes);

  // Reveal auditado de PII (MaskedSensitiveData) — grava audit_log, ecoa o valor.
  const { unmaskRoutes } = await import('./domain/security/unmask.routes');
  await app.register(unmaskRoutes);

  // P5-05 — Trial sem fricção (signup self-service → insight em <30min)
  const { trialRoutes } = await import('./domain/provedor/trial.routes');
  await app.register(trialRoutes);

  // D-06 — Copiloto de campo: foto → diagnóstico (classifyFieldPhoto) → anexo na OS
  const { fieldCopilotRoutes } = await import('./domain/campo/field-copilot.routes');
  await app.register(fieldCopilotRoutes);

  // PLANO I (Uber do Técnico) I-1 — agenda + máquina de estados da OS de campo
  const { fieldOpsRoutes } = await import('./domain/campo/field-ops.routes');
  await app.register(fieldOpsRoutes);

  // D-07 — Painel comercial: funil de conversão + LTV médio
  const { vendasDashboardRoutes } = await import('./domain/vendas/vendas-dashboard.routes');
  await app.register(vendasDashboardRoutes);

  // SPEC 1 — Upsell/convert: registra evento de upsell do operador (upsell_events, migration 100).
  const { upsellRoutes } = await import('./domain/vendas/upsell.routes');
  await app.register(upsellRoutes);

  // D-05 — Memória institucional viva: curadoria de rascunhos KB gerados por IA
  const { kbDraftRoutes } = await import('./domain/conhecimento/kb-draft.routes');
  await app.register(kbDraftRoutes);

  // P1-02 — Notificação proativa de falha em massa (operador dispara via CTO/região)
  const { outageNotifierRoutes } = await import('./domain/atendimento/outage-notifier.routes');
  await app.register(outageNotifierRoutes);

  // D-15 — Túnel de Vento: população sintética de assinantes (staging; flag WIND_TUNNEL_ENABLED)
  const { windTunnelRoutes } = await import('./domain/ia/wind-tunnel/wind-tunnel.routes');
  await app.register(windTunnelRoutes);

  // E-01..E-05 — Cérebro noturno: reflexões + ações em alçada + eval-gate + relatório
  const { nightlyBrainRoutes } = await import('./domain/ia/nightly-brain/nightly-brain.routes');
  await app.register(nightlyBrainRoutes);

  // D-04 — NOC autônomo: incidentes de rede (flag NOC_AUTONOMO_ENABLED p/ scan)
  const { incidentRoutes } = await import('./domain/rede/incident.routes');
  await app.register(incidentRoutes);

  // D-02 — Backtesting de régua: política nova × histórico real (projeção honesta)
  const { policyBacktestRoutes } = await import('./domain/cobranca/policy-backtest.routes');
  await app.register(policyBacktestRoutes);

  // D-01 — Gêmeo digital da rede: simulação de falha de CTO e de crescimento
  const { networkTwinRoutes } = await import('./domain/rede/network-twin.routes');
  await app.register(networkTwinRoutes);

  // D-08 — CFO virtual: projeção de caixa 90d + inadimplência recuperável
  const { cashflowRoutes } = await import('./domain/financeiro/cashflow.routes');
  await app.register(cashflowRoutes);

  // D-23 — Gênesis Engine: análise retroativa do histórico de WhatsApp
  const { genesisRoutes } = await import('./domain/atendimento/genesis.routes');
  await app.register(genesisRoutes);

  const { negotiationRoutes } = await import('./domain/cobranca/negotiation.routes');
  await app.register(negotiationRoutes);

  // Fase 2 — monitor read-only da fila cobrai (queue-stats + queue v2).
  const { queueMonitorRoutes } = await import('./domain/cobranca/queue-monitor.routes');
  await app.register(queueMonitorRoutes);

  // Fase 2 — disparo manual da régua CobrAI (send-now) + gestão da fila (DELETE). Engine-aware (R6).
  const { cobraiDispatchRoutes } = await import('./domain/cobranca/cobrai-dispatch.routes');
  await app.register(cobraiDispatchRoutes);

  // F1-A — CobrAIPage: métricas do card, histórico de disparos, config do tenant e
  // toggle de opt-out por cliente (antes iam direto ao Supabase anônimo).
  const { cobraiPageRoutes } = await import('./domain/cobranca/cobrai-page.routes');
  await app.register(cobraiPageRoutes);

  // F6-02 — Sync gateway Asaas → invoices (cobranças aparecem no CobrAI)
  const { gatewaySyncRoutes } = await import('./domain/cobranca/gateway-sync.routes');
  await app.register(gatewaySyncRoutes);

  // F1-A — BillingPage: resumo de assinatura do ISP + marcar fatura(s) como paga (antes
  // iam direto ao Supabase anônimo).
  const { billingPageRoutes } = await import('./domain/cobranca/billing-page.routes');
  await app.register(billingPageRoutes);

  // Fase 2 — TAREFA 1: webhook de entrada do Asaas (push; complementa o pull do F6-02).
  const { asaasWebhookRoutes } = await import('./domain/cobranca/asaas-webhook.routes');
  await app.register(asaasWebhookRoutes);

  const { sheetImportRoutes } = await import('./domain/onboarding/sheet-import.routes');
  await app.register(sheetImportRoutes);

  // IA-07 — Churn risk ranking (estava sem registro)
  const { churnRoutes } = await import('./domain/ia/churn.routes');
  await app.register(churnRoutes);

  // G-01 — Home inteligente por papel (agrega incidentes, inbox, cashflow, churn, campo)
  const { smartHomeRoutes } = await import('./domain/home/smart-home.routes');
  await app.register(smartHomeRoutes);

  // D-10 — ISP-BR fine-tune: pipeline de fine-tuning sobre labeled_examples
  const { fineTuneRoutes } = await import('./domain/ml/isp-br-finetune.routes');
  await app.register(fineTuneRoutes);

  // D-13 — Connector Forge: conectores ERP gerados por agente codificador
  const { connectorForgeRoutes } = await import('./domain/erp/connector-forge.routes');
  await app.register(connectorForgeRoutes);

  // D-16 — Foundry: automações por linguagem natural instaladas por tenant
  const { foundryRoutes } = await import('./domain/foundry/foundry.routes');
  await app.register(foundryRoutes);

  // D-17 — Marketplace de Playbooks: políticas com prova via backtesting D-02
  const { playbookMarketRoutes } = await import('./domain/cobranca/playbook-market.routes');
  await app.register(playbookMarketRoutes);

  // D-19 — Gêmeo do Assinante: simulação de decisão por cliente/segmento
  const { subscriberTwinRoutes } = await import('./domain/ml/subscriber-twin.routes');
  await app.register(subscriberTwinRoutes);

  // D-20 — Copiloto do Dono: perguntas em NL respondidas com dados + ação
  const { ownerCopilotRoutes } = await import('./domain/ia/owner-copilot.routes');
  await app.register(ownerCopilotRoutes);

  // D-21 — Onboarding IA em 1 dia: orquestrador self-service
  const { aiOnboardingRoutes } = await import('./domain/onboarding/ai-onboarding.routes');
  await app.register(aiOnboardingRoutes);

  // D-22 — Rede de Alerta Precoce: imunidade coletiva entre tenants
  const { threatNetworkRoutes } = await import('./domain/security/threat-network.routes');
  await app.register(threatNetworkRoutes);

  // Health check com status dos serviços
  app.get('/api/v2/health', async () => {
    const { getLLMStatus } = await import('./adapters/ai/llm.adapter');
    const { getRedisStatus } = await import('./infrastructure/cache/redis.client');
    const { getCollectionStats } = await import('./adapters/vector/qdrant.adapter');

    const qdrantStatus = await getCollectionStats('health-check')
      .then(s => s.exists ? 'connected' : 'no-collections')
      .catch(() => 'unavailable');

    return {
      status: 'ok',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      // SEC-R4: endpoint anônimo — `worker.pid` (detalhe interno de processo) removido;
      // uptime fica como sinal de liveness (baixa sensibilidade).
      worker: {
        uptime: Math.floor(process.uptime()),
      },
      services: {
        redis: getRedisStatus(),
        openai_circuit: getLLMStatus().openai,
        llm_router: getLLMStatus().router,
        qdrant: qdrantStatus,
        sentry: process.env.SENTRY_DSN ? 'configured' : 'not_configured',
        langsmith: process.env.LANGCHAIN_API_KEY ? 'configured' : 'not_configured',
      },
    };
  });

  // SEC-R4: endpoint anônimo — `architecture`/`sprint` (detalhe interno) removidos.
  app.get('/api/v2/status', async () => ({
    status: 'ok',
    version: '2.0.0',
  }));

  // Error handler
  app.setErrorHandler((error: any, _req, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) app.log.error({ err: error }, 'Erro interno');
    return reply.status(status).send({
      code: error.code ?? 'INTERNAL_ERROR',
      message: status === 500 ? 'Erro interno. Nossa equipe foi notificada.' : error.message,
    });
  });

  // Not found handler
  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ code: 'NOT_FOUND', message: 'Rota não encontrada.' });
  });

  return app;
}

async function scheduleBatchJobs() {
  const { queues } = await import('./infrastructure/queue/priority-queues');

  const queue = queues['ai-batch'];

  await queue.add('run_churn_analysis',
    { tenantId: 'all' },
    {
      repeat: { pattern: '0 2 * * *' },
      jobId: 'scheduled_churn_analysis',
      priority: 1,
    }
  );

  await queue.add('run_ticket_classification',
    { tenantId: 'all' },
    {
      repeat: { pattern: '0 3 * * *' },
      jobId: 'scheduled_ticket_classification',
      priority: 1,
    }
  );

  await queue.add('poll_batch_results',
    {},
    {
      repeat: { every: 5 * 60 * 1000 },
      jobId: 'batch_results_poller',
      priority: 3,
    }
  );
}

export async function startFastifyServer() {
  const app = await buildServer();
  const port = parseInt(process.env.FASTIFY_PORT ?? '3001');

  try {
    const listenConfig: any = { port, host: '0.0.0.0' };
    await app.listen(listenConfig);
    app.log.info(`[FASTIFY] Servidor v2 rodando em http://localhost:${port}`);
    
    // Iniciar listeners de Realtime
    const { initBusinessListeners } = await import('./infrastructure/realtime/business-listeners');
    initBusinessListeners();

    // Agendar ETL a cada 15 minutos
    // @ts-ignore
    const { aiProcessingQueue } = await import('../../../packages/queue/src/queues');
    await aiProcessingQueue.add(
      'etl:scheduled',
      { trigger: 'scheduled' },
      {
        repeat: { every: 15 * 60 * 1000 }, // 15 minutos
        jobId: 'etl:recurring',             // ID fixo evita duplicatas
      }
    );
    app.log.info('ETL: job recorrente agendado (a cada 15min)');

    // Histórico de saúde WhatsApp (migration 105): snapshot a cada 15 min por
    // instância — permite ler tendência de ban_signals no card do WhatsAppPage.
    const { createWhatsappHealthSnapshotWorker, scheduleWhatsappHealthSnapshotJobs } =
      await import('./domain/atendimento/whatsapp-health-snapshot.worker');
    createWhatsappHealthSnapshotWorker();
    await scheduleWhatsappHealthSnapshotJobs();
    app.log.info('[whatsapp-health-snapshot] job recorrente agendado (a cada 15min)');

    // Inicializar DuckDB Analytics Schema
    const { initAnalyticsSchema } = await import('./infrastructure/analytics/analytics.schema');
    await initAnalyticsSchema();

    // Iniciar poller do Outbox
    // @ts-ignore
    const { startOutboxPoller } = await import('../../../packages/queue/src/workers/outbox.worker');
    await startOutboxPoller();

    // Worker de mensagens — único motor de atendimento (v2). Freio de emergência
    // é o kill switch real (emergency-stop.service.ts), não uma env de engine.
    // @ts-ignore
    const { createMessageWorker } = await import('../../../packages/queue/src/workers/message.worker');
    const msgWorker = createMessageWorker();
    app.log.info('[message-worker] iniciado');

    // R6 — Worker v2 da régua CobrAI. Auto-guardado por COBRAI_ENGINE=v2 (shouldBootWorker);
    // nunca era chamado antes (bug — descoberto na Fase 2/TAREFA 1, ver commit da fila 'cobrai').
    // @ts-ignore
    const { createCobraiWorker } = await import('../../../packages/queue/src/workers/cobrai.worker');
    const cobraiWorker = createCobraiWorker();
    if (cobraiWorker) app.log.info('[cobrai-worker] v2 iniciado (COBRAI_ENGINE=v2)');

    // F2-01 — Nightly brain worker (03:00 BRT, flag NIGHTLY_BRAIN_ENABLED).
    // @ts-ignore
    const { createNightlyBrainWorker, scheduleNightlyBrainJobs } = await import('../../../packages/queue/src/workers/nightly-brain.worker');
    const brainWorker = createNightlyBrainWorker();
    if (brainWorker) {
      await scheduleNightlyBrainJobs();
      app.log.info('[nightly-brain-worker] iniciado (03:00 BRT)');
    }

    // S79 — Workers de atendimento (SLA + FCR + Snooze).
    // @ts-ignore
    const { createSlaWorker, scheduleSlaJobs } = await import('../../../packages/queue/src/workers/sla.worker');
    createSlaWorker();
    await scheduleSlaJobs();
    app.log.info('[sla-worker] iniciado (*/5 * * * *)');

    // @ts-ignore
    const { createFcrWorker, scheduleFcrJobs } = await import('../../../packages/queue/src/workers/fcr.worker');
    createFcrWorker();
    await scheduleFcrJobs();
    app.log.info('[fcr-worker] iniciado (01:00 BRT)');

    // @ts-ignore
    const { createSnoozeWorker, scheduleSnoozeJobs } = await import('../../../packages/queue/src/workers/snooze.worker');
    createSnoozeWorker();
    await scheduleSnoozeJobs();
    app.log.info('[snooze-worker] iniciado (* * * * *)');

    // S80 — Workers de gestão (Report + Gamification + PlanSync).
    // @ts-ignore
    const { createReportWorker, scheduleReportJobs } = await import('../../../packages/queue/src/workers/report.worker');
    createReportWorker();
    await scheduleReportJobs();
    app.log.info('[report-worker] iniciado (23:00 BRT)');

    // @ts-ignore
    const { createGamificationWorker, scheduleGamificationJobs } = await import('../../../packages/queue/src/workers/gamification.worker');
    createGamificationWorker();
    await scheduleGamificationJobs();
    app.log.info('[gamification-worker] iniciado (02:00 BRT)');

    // @ts-ignore
    const { createPlanSyncWorker, schedulePlanSyncJobs } = await import('../../../packages/queue/src/workers/plan-sync.worker');
    createPlanSyncWorker();
    await schedulePlanSyncJobs();
    app.log.info('[plan-sync-worker] iniciado (00:00 BRT)');

    // S81 — Workers de percepção (Vision + SiteScrape + ErpSync).
    // @ts-ignore
    const { createVisionWorker } = await import('../../../packages/queue/src/workers/vision.worker');
    createVisionWorker();
    app.log.info('[vision-worker] iniciado (on-demand via queue)');

    // @ts-ignore
    const { createSiteScrapeWorker, scheduleSiteScrapeJobs } = await import('../../../packages/queue/src/workers/site-scrape.worker');
    createSiteScrapeWorker();
    await scheduleSiteScrapeJobs();
    app.log.info('[site-scrape-worker] iniciado (dom 02:00 BRT)');

    // @ts-ignore
    const { createErpSyncWorker, scheduleErpSyncJobs } = await import('../../../packages/queue/src/workers/erp-sync.worker');
    createErpSyncWorker();
    await scheduleErpSyncJobs();
    app.log.info('[erp-sync-worker] iniciado (*/30 * * * *)');

    // S76 — UsageSync worker (contadores Redis → Supabase, alerta budget LLM).
    // @ts-ignore
    const { createUsageSyncWorker, scheduleUsageSyncJobs } = await import('../../../packages/queue/src/workers/usage-sync.worker');
    createUsageSyncWorker();
    await scheduleUsageSyncJobs();
    app.log.info('[usage-sync-worker] iniciado (23:30 BRT)');

    // S88 — Synthetic monitor worker (sonda E2E a cada 15min).
    // @ts-ignore
    const { createSyntheticMonitorWorker, scheduleSyntheticMonitorJobs } = await import('../../../packages/queue/src/workers/synthetic-monitor.worker');
    createSyntheticMonitorWorker();
    await scheduleSyntheticMonitorJobs();
    app.log.info('[synthetic-monitor-worker] iniciado (*/15 * * * *)');

    // S92 — Crisis detector worker (crise massiva por região, */1).
    // @ts-ignore
    const { createCrisisWorker, scheduleCrisisJobs } = await import('../../../packages/queue/src/workers/crisis.worker');
    createCrisisWorker();
    await scheduleCrisisJobs();
    app.log.info('[crisis-worker] iniciado (*/1 * * * *)');

    // S93 — Network telemetry worker (SNMP poller, */5).
    // @ts-ignore
    const { createNetworkTelemetryWorker, scheduleNetworkTelemetryJobs } = await import('../../../packages/queue/src/workers/network-telemetry.worker');
    createNetworkTelemetryWorker();
    await scheduleNetworkTelemetryJobs();
    app.log.info('[network-telemetry-worker] iniciado (*/5 * * * *)');

    // F6-01 — History Import worker (on-demand via queue, sem cron).
    // @ts-ignore
    const { createHistoryImportWorker } = await import('../../../packages/queue/src/workers/history-import.worker');
    createHistoryImportWorker();
    app.log.info('[history-import-worker] iniciado (on-demand via queue)');

    // IA-46 — Replay worker (consome a fila astrum-replay; no-op se REPLAY_ENGINE_ENABLED=false).
    // @ts-ignore
    const { createReplayWorker } = await import('../../../packages/queue/src/workers/replay.worker');
    createReplayWorker();
    app.log.info('[replay-worker] boot verificado (ver log próprio para enabled/disabled)');

    // RAG — Indexing worker (consome a fila astrum:ai-processing — chunk+embed+upsert Qdrant).
    // Existia desde antes mas nunca era chamado no boot; fila ficava sem consumidor.
    // @ts-ignore
    const { createIndexingWorker } = await import('../../../packages/queue/src/workers/indexing.worker');
    createIndexingWorker();
    app.log.info('[indexing-worker] iniciado (astrum:ai-processing)');

    // RAG — Documents worker (consome a fila 'documents' do Outbox; extrai texto PDF/DOCX/TXT/MD
    // e enfileira em astrum:ai-processing). Sem isso, upload de documento ficava preso em 'processing'.
    // @ts-ignore
    const { createDocumentsWorker } = await import('../../../packages/queue/src/workers/documents.worker');
    createDocumentsWorker();
    app.log.info('[documents-worker] iniciado (fila: documents)');

    // Agendar Batch Jobs
    await scheduleBatchJobs();

    // Boot concluído com sucesso — registra estado saudável.
    const { markFastifyBooted } = await import('./infrastructure/observability/boot-state');
    markFastifyBooted();
  } catch (err: any) {
    // Bug S68: NÃO engolir mais o erro em silêncio. Registra como fatal no Sentry
    // e marca a flag que o health-check do Express expõe (fastify_boot_failed).
    // O process.exit(1) volta na S82, quando o Fastify for o processo principal.
    app.log.fatal({ err }, 'FALHA AO INICIAR FASTIFY — motor v2 indisponível (visível em /api/health)');
    try {
      const { captureError } = await import('./infrastructure/observability/sentry.service');
      captureError(err instanceof Error ? err : new Error(String(err)), { context: 'fastify_boot' });
    } catch { /* Sentry pode não estar configurado */ }
    try {
      const { markFastifyBootFailed } = await import('./infrastructure/observability/boot-state');
      markFastifyBootFailed(err);
    } catch { /* ignore */ }
  }

  // Graceful Shutdown
  const shutdown = async (signal: string) => {
    app.log.info(`[FASTIFY] ${signal} recebido. Encerrando...`);
    
    // 1. Parar de aceitar novas requests
    await app.close();
    
    // 2. Fechar Realtime Channels
    try {
      const { closeAllChannels } = await import('./infrastructure/realtime/realtime.service');
      await closeAllChannels();
    } catch(e) {}
    
    // Fechar DuckDB
    try {
      const { closeDuckDB } = await import('./infrastructure/analytics/duckdb.service');
      await closeDuckDB();
    } catch(e) {}
    
    // 3. Fechar filas BullMQ (aguardar jobs em andamento)
    try {
      // @ts-ignore
      const { closeAllQueues } = await import('../../../packages/queue/src/queues');
      await closeAllQueues();
      app.log.info('[FASTIFY] Filas BullMQ encerradas.');
    } catch(e) { /* ignore se não buildado */ }
    
    // 3. Fechar Redis
    try {
      const { closeRedis } = await import('./infrastructure/cache/redis.client');
      await closeRedis();
    } catch(e) {}

    // IA-32 — OTel shutdown (flush spans pendentes).
    try {
      const { shutdownOtel } = await import('./infrastructure/observability/otel');
      await shutdownOtel();
    } catch(e) {}

    app.log.info('[FASTIFY] Shutdown gracioso concluído.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return app;
}

// Fase 4 — Fastify vira o processo principal (antes só era invocado pelo Express raiz
// via `await import(...) + startFastifyServer()`, nunca rodava sozinho). Roda o boot
// só quando este arquivo é o entrypoint de verdade (`tsx watch src/server.ts`), não
// quando é importado como módulo por outro processo.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // IIFE (não top-level await — este arquivo é transformado como CJS pelo esbuild/tsx).
  (async () => {
    // Standalone não herda o `-r dotenv/config` do script raiz (que carrega o .env da
    // raiz do monorepo) — carrega explicitamente aqui. `dotenv.config()` não sobrescreve
    // vars já setadas, então é seguro mesmo se algo já tiver carregado env antes.
    const { config: loadDotenv } = await import('dotenv');
    loadDotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

    await startFastifyServer();
  })().catch((err) => {
    console.error('[FASTIFY] Falha fatal ao iniciar standalone:', err);
    process.exit(1);
  });
}
