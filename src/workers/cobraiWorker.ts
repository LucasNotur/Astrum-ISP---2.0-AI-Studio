import { Queue, Worker } from "bullmq";
import redis, { connection } from "../lib/redis";
import { adminDb as db } from "../lib/firebaseAdmin";
import admin from "../lib/firebaseAdmin";
import { revokeTenantUserTokens } from "../lib/authVerify";
import { revokeAllUserTokens } from "../lib/tokenBlacklist";
import { subBusinessDays, differenceInHours } from "date-fns";
import { COBRAI_TEMPLATES } from "../lib/cobraiTemplates";
import { buildTemplateComponents } from "../lib/templateBuilder";
import { incrementShardedCounter } from "../lib/dbAdmin";
import { logger } from "../lib/logger";
import { shouldBootWorker } from "../../apps/api/src/infrastructure/config/engine-flags";

const isMockRedis = !((redis as any).options);
// Guarda R6 (Plano Mestre V2, S68): o worker legado só sobe se COBRAI_ENGINE=legacy.
// Se for 'v2', o worker novo (apps/api) é a única régua ativa — evita cobrança dupla.
const cobraiEngineActive = shouldBootWorker("cobrai", "legacy", (m) => logger.warn("cobrai_engine_guard", { data: { msg: m } }));

async function logCobraiSkip(customerId: string, tenantId: string, reason: string) {
  try {
    await db.collection("logs").add({
      type: "COBRAI_SKIP",
      customerId,
      tenantId,
      reason,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    logger.info("cobrai_skipped", { tenant_id: tenantId, session_id: customerId, data: { reason } });
  } catch (err: any) {
    logger.error("cobrai_log_skip_failed", { error: err.message });
  }
}

export const cobraiQueue = isMockRedis ? {
  add: async (name: string, payload: any, opts?: any) => {
    logger.warn("mock_cobrai_queue_used");
    return { id: "mock" };
  }
} as any : new Queue('cobrai', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: false,  // manter histórico de jobs concluídos
    removeOnFail: false       // manter jobs falhos para análise
  }
});

async function processCobraiStage(job: any, customerId: string, tenantId: string, stage: string) {
  try {
    if (!customerId) return;

    const tenantSnap = await db.collection("tenants").doc(tenantId).get();
    if (!tenantSnap.exists) return;
    const tenantData = tenantSnap.data() as any;

    // 1. Verificar se CobrAI está globalmente ativo
    if (tenantData.cobrai_enabled === false) {
      return { skipped: true, reason: 'COBRAI_DISABLED' };
    }

    // 2. Verificar janela de horário
    if (tenantData.cobrai_window) {
      const currentHour = new Date().getHours();
      const { start, end } = tenantData.cobrai_window;
      if (currentHour < start || currentHour >= end) {
        await logCobraiSkip(customerId, tenantId, 'OUTSIDE_WINDOW');
        return { skipped: true, reason: 'OUTSIDE_WINDOW' };
      }
    }

    // 3. Verificar se o cliente está pausado manualmente
    if (tenantData.cobrai_paused_customers?.includes(customerId)) {
      await logCobraiSkip(customerId, tenantId, 'CUSTOMER_PAUSED');
      return { skipped: true, reason: 'CUSTOMER_PAUSED' };
    }

    // 4. Verificar se a etapa específica está ativa
    if (tenantData.cobrai_stages && tenantData.cobrai_stages[stage]?.active === false) {
      return { skipped: true, reason: 'STAGE_DISABLED' };
    }

    const rateLimitKey = `cobrai_rate:${tenantId}`;
    const sentThisHour = await redis.incr(rateLimitKey);
    if (sentThisHour === 1) await redis.expire(rateLimitKey, 3600);

    // 5. Usar hourly limit do Firestore
    const limitEnv = tenantData.cobrai_hourly_limit ?? parseInt(process.env.COBRAI_HOURLY_LIMIT ?? '30');
    if (sentThisHour > limitEnv) {
      // Reagendar job para daqui 1h
      await cobraiQueue.add('retry', job.data, { delay: 3600000 });
      logger.warn('cobrai_rate_limited', { tenant_id: tenantId, session_id: customerId });
      return { skipped: true, reason: 'RATE_LIMIT' };
    }

    // PROTEÇÃO A — Respeitar acordo de parcelamento ativo:
    const customer = await db.collection("customers").doc(customerId).get();
    if (!customer.exists) return;
    const data = customer.data() as any;

    // PROTEÇÃO — Verificar opt-in
    if (!data.marketing_opt_in) {
      await logCobraiSkip(customerId, tenantId, 'NO_CONSENT');
      return;
    }

    if (data.payment_agreement?.active === true) {
      const nextDue = data.payment_agreement.next_due_date?.toDate?.() || data.payment_agreement.next_due_date;
      if (nextDue && nextDue > new Date()) {
        // Cliente tem acordo em dia — pular disparo, logar skip
        await logCobraiSkip(customerId, tenantId, 'ACTIVE_PAYMENT_AGREEMENT');
        return;
      }
    }

    // PROTEÇÃO B — Janela de compensação bancária antes de suspender (D+61):
    if (stage === 'suspensao_automatica') {
      const threeBizDaysAgo = subBusinessDays(new Date(), 3);
      const recentPayment = await db.collection('payments')
        .where('customer_id', '==', customerId)
        .where('paid_at', '>=', admin.firestore.Timestamp.fromDate(threeBizDaysAgo))
        .where('status', 'in', ['confirmado', 'pendente_compensacao'])
        .limit(1)
        .get();

      if (!recentPayment.empty) {
        // Pagamento recente — suspender após compensação, não agora
        await logCobraiSkip(customerId, tenantId, 'PAYMENT_PENDING_COMPENSATION');
        return;
      }
    }
    
    // Check daily limits
    const { checkDailyLimit, incrementDailyLimit } = await import('../lib/rateLimiter');
    const { allowed: dailyAllowed } = await checkDailyLimit(tenantId);
    if (!dailyAllowed) {
        logger.warn('cobrai_daily_limit_reached', { tenant_id: tenantId, session_id: customerId });
        return { skipped: true, reason: 'DAILY_RATE_LIMIT' };
    }

    // Preparar dados do cliente e da fatura fictícia (neste mock)
    const invoice = { due_date: '01/01/2026', amount: data.current_price || 99.9 };

    let isWithin24hWindow = false;
    let templateName = 'Livre';
    if (data.last_customer_message_at) {
      const lastMsgDate = data.last_customer_message_at.toDate?.() || data.last_customer_message_at;
      if (differenceInHours(new Date(), lastMsgDate) < 24) {
        isWithin24hWindow = true;
      }
    }

    if (isWithin24hWindow) {
      // Envio de mensagem livre
      logger.info("cobrai_window_active_free_msg", { tenant_id: tenantId, session_id: customerId });
      const template = COBRAI_TEMPLATES[stage];
      if (template) {
         try {
             const { getIntegrationKeys } = await import('../lib/dbAdmin');
             const keys = await getIntegrationKeys(tenantId);
             const evoUrl = keys.evolutionUrl?.replace(/\/+$/, "");
             const evoInstance = keys.evolutionInstance;
             const evoApiKey = keys.evolutionApiKey;
             
             if (evoUrl && evoInstance && evoApiKey) {
                 await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json', apikey: evoApiKey },
                     body: JSON.stringify({ number: data.phone, options: { delay: 1200 }, textMessage: { text: template.text_fallback } })
                 });
             }
         } catch (e) {
             logger.error("cobrai_free_msg_error", { tenant_id: tenantId, session_id: customerId, error: (e as any).message });
         }
      }
    } else {
      // Envio de HSM obrigatório
      const HSM_APPROVED_BY_META = process.env.HSM_APPROVED === 'true';
      if (!HSM_APPROVED_BY_META) {
        logger.warn("cobrai_hsm_unapproved_skipped", { tenant_id: tenantId, session_id: customerId });
        return;
      }
      
      logger.info("cobrai_window_inactive_hsm", { tenant_id: tenantId, session_id: customerId });
      const template = COBRAI_TEMPLATES[stage];
      if (!template) {
        logger.error("cobrai_template_not_found", { tenant_id: tenantId, session_id: customerId, data: { stage } });
        return;
      }

      const components = buildTemplateComponents(template, data, invoice);
      templateName = template.templateName;
      
      const { acquireSendSlot } = await import('../lib/rateLimiter');
      const { allowed, retryAfter } = await acquireSendSlot(tenantId, tenantData.evolution_instance || 'default');
      if (!allowed) {
          logger.warn('cobrai_instance_rate_limit', { tenant_id: tenantId, session_id: customerId });
          
          const redis = (await import('../lib/redis')).default;
          if (redis) {
              await redis.incr(`throttle_events:${tenantId}`);
          }
          
          await job.moveToDelayed(Date.now() + (retryAfter || 1000), job.token);
          return;
      }
      
      const { sendHSMTemplate } = await import('../lib/whatsappSender');
      // Create variables mapping for the HSM Template (var1, var2...) based on components content
      const variables: Record<string, string> = {};
      const params = components.find((c: any) => c.type === 'body')?.parameters || [];
      params.forEach((p: any, i: number) => {
         variables[`${i + 1}`] = p.text;
      });

      try {
         await sendHSMTemplate(tenantId, templateName, data.phone, variables);
         logger.info("cobrai_dispatched", { tenant_id: tenantId, session_id: customerId, data: { template_name: templateName, variables } });
      } catch (err: any) {
         if (err.name === 'TemplateNotApprovedError') {
             logger.warn("cobrai_template_unapproved", { tenant_id: tenantId, session_id: customerId, data: { template_name: templateName } });
             return; // Skip or try fallback? Since outside window, we just skip
         }
         throw err;
      }
    }

    logger.info("cobrai_action_success", { tenant_id: tenantId, session_id: customerId, data: { stage } });

    // Registrar sucesso na cobrai_logs
    await db.collection("cobrai_logs").add({
      customer_id: customerId,
      tenant_id: tenantId,
      stage: stage,
      template_name: templateName,
      sent_at: admin.firestore.FieldValue.serverTimestamp(),
      status: 'sent'
    });

    await incrementShardedCounter('cobrai_sent_today', tenantId);

  } catch (error: any) {
    logger.error("cobrai_action_failed", { tenant_id: tenantId, session_id: customerId, error: error.message, data: { stage } });
    // Registrar falha na cobrai_logs
    await db.collection("cobrai_logs").add({
      customer_id: customerId,
      tenant_id: tenantId,
      stage: stage,
      sent_at: admin.firestore.FieldValue.serverTimestamp(),
      status: 'failed',
      error_message: error.message
    });
  }
}

// Worker com concurrency 1 por tenant para evitar race conditions (geralmente concurrency: 3)
export const processCobraiJob = async (job: any) => {
  if (job.name === 'lockout_tenant') {
    const { tenantId } = job.data;
    const tenantSnap = await db.collection("tenants").doc(tenantId).get();
    if (!tenantSnap.exists) return;
    
    const tenantData = tenantSnap.data() as any;
    if (tenantData.billing_status === 'overdue') {
      await db.collection("tenants").doc(tenantId).update({
        status: 'suspended',
        suspended_reason: 'billing_overdue'
      });
      
      // FZ-3: revogação via tabela users + Redis (era listUsers/revokeRefreshTokens do Firebase)
      const revoked = await revokeTenantUserTokens(tenantId, revokeAllUserTokens);
      logger.info("tenant_sessions_revoked", { tenant_id: tenantId, data: { revoked } });
      
      await db.collection("audit_logs").add({
        action: "BILLING_LOCK",
        tenant_id: tenantId,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      logger.info("tenant_locked_out", { tenant_id: tenantId, data: { reason: 'billing_overdue' } });
    }
    return;
  }

  if (job.name === 'sync_redis_counters') {
    const keys = await redis.keys('msg_count:*:*');
    for (const key of keys) {
      const parts = key.split(':');
      if (parts.length === 3) {
        const tenantId = parts[1];
        const yyyyMm = parts[2];
        const countStr = await redis.get(key);
        if (countStr) {
          const docId = `${tenantId}_${yyyyMm}`;
          await db.collection("usage_stats").doc(docId).set({
            tenantId,
            month: yyyyMm,
            message_count: parseInt(countStr, 10),
            updated_at: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          
          // Reseta o contador
          await redis.del(key);
        }
      }
    }
    return;
  }

  if (job.name === 'sync_token_costs') {
    const keys = await redis.keys('token_cost:*:*');
    for (const key of keys) {
      const parts = key.split(':');
      if (parts.length === 3) {
        const tenantId = parts[1];
        const yyyyMm = parts[2];
        const costStr = await redis.get(key);
        if (costStr) {
          const costUsd = parseFloat(costStr);
          const costBrl = costUsd * 5.0; // Cambiar se necessário
          const tokenCountStr = await redis.get(`token_count:${tenantId}:${yyyyMm}`);
          const tokenCount = tokenCountStr ? parseInt(tokenCountStr, 10) : 0;
          const providerBreakdown = await redis.hgetall(`token_provider:${tenantId}:${yyyyMm}`);
          
          const docId = `${tenantId}_${yyyyMm}`;
          await db.collection("token_usage").doc(docId).set({
            tenantId,
            month: yyyyMm,
            custo_usd: costUsd,
            custo_brl: costBrl,
            token_count: tokenCount,
            provider_breakdown: providerBreakdown,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          
          // Verificar threshold
          const tenantSnap = await db.collection("tenants").doc(tenantId).get();
          if (tenantSnap.exists) {
            const limit = tenantSnap.data()?.llm_budget_usd || 50; // Threshold padrao de ISP
            if (costUsd > limit) {
               const alertedKey = `token_cost_alert:${tenantId}:${yyyyMm}`;
               const alreadyAlerted = await redis.get(alertedKey);
               if (!alreadyAlerted) {
                  const { sendEmail } = await import("../lib/email");
                  const ispAdminEmail = tenantSnap.data()?.admin_email;
                  const text = `Atenção: Seu limite de USD ${limit} para custo LLM foi ultrapassado. Uso atual de USD ${costUsd.toFixed(2)}`;
                  await sendEmail("noturcursos1@gmail.com", `Super-Admin: Limite excedido para o tenant ${tenantId}`, text);
                  if (ispAdminEmail) {
                     await sendEmail(ispAdminEmail, `Serviço LLM: Limite de Custos Excedido`, text);
                  }
                  await redis.setex(alertedKey, 86400 * 30, '1'); // Alert sent this month
               }
            }
          }
        }
      }
    }
    return;
  }

  if (job.name === 'incident_notification') {
    const { customerId, tenantId, cto_name, estimated_resolution } = job.data;
    
    try {
      const text = `Identificamos instabilidade na sua região. Nossa equipe já está trabalhando.`;
      logger.info("incident_notification_dispatched", { tenant_id: tenantId, session_id: customerId });
      
      await db.collection("cobrai_logs").add({
        customer_id: customerId,
        tenant_id: tenantId,
        stage: 'incident_notification',
        template_name: 'Livre',
        sent_at: admin.firestore.FieldValue.serverTimestamp(),
        status: 'sent',
        message: text
      });
      return { skipped: false, reason: 'sent' };
    } catch (err: any) {
      logger.error("incident_notification_failed", { tenant_id: tenantId, session_id: customerId, error: err.message });
      return { skipped: true, reason: 'error', error: err.message };
    }
  }

  if (job.name === 'incident_resolved') {
    const { customerId, tenantId, cto_name } = job.data;
    
    try {
      const text = `Serviço normalizado! Pedimos desculpas pelo inconveniente.`;
      logger.info("incident_resolved_dispatched", { tenant_id: tenantId, session_id: customerId });
      
      await db.collection("cobrai_logs").add({
        customer_id: customerId,
        tenant_id: tenantId,
        stage: 'incident_resolved',
        template_name: 'Livre',
        sent_at: admin.firestore.FieldValue.serverTimestamp(),
        status: 'sent',
        message: text
      });
      return { skipped: false, reason: 'sent' };
    } catch (err: any) {
      logger.error("incident_resolved_failed", { tenant_id: tenantId, session_id: customerId, error: err.message });
      return { skipped: true, reason: 'error', error: err.message };
    }
  }

  const { customerId, tenantId, stage } = job.data;
  
  const lockKey = `cobrai_lock:${tenantId}:${customerId}:${stage}`;
  const lock = await redis.set(lockKey, '1', 'EX', 7200, 'NX');
  
  if (!lock) {
    // Job já sendo processado por outro worker — descartar silenciosamente
    return { skipped: true, reason: 'LOCK_EXISTS' };
  }
  
  try {
    await processCobraiStage(job, customerId, tenantId, stage);
  } finally {
    await redis.del(lockKey);
  }
};

export const worker = (isMockRedis || !cobraiEngineActive) ? {
  on: () => {}
} as any : new Worker('cobrai', processCobraiJob, { connection, concurrency: 3 });

worker.on('failed', async (job: any, err: any) => {
  if (!job) return;
  const attempts = job.attemptsMade;
  const maxAttempts = job.opts?.attempts ?? 3;
  if (attempts >= maxAttempts) {
    // Mover para DLQ no Firestore para visibilidade
    await db.collection('dead_letter_queue').add({
      job_id: job.id,
      type: job.name,
      payload: job.data,
      error_message: err.message,
      retry_count: attempts,
      failed_at: admin.firestore.FieldValue.serverTimestamp(),
      tenant_id: job.data?.tenantId ?? 'unknown',
      resolved: false
    });
    logger.error("dlq_move", { tenant_id: job.data?.tenantId, error: err.message, data: { job_name: job.name, attempts } });
  }
});

if (!isMockRedis) {
  cobraiQueue.add("sync_redis_counters", {}, { repeat: { pattern: "0 0 1 * *" } });
  cobraiQueue.add("sync_token_costs", {}, { repeat: { pattern: "0 23 * * *" } });
}


