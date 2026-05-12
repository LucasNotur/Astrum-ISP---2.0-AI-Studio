import { Queue, Worker } from "bullmq";
import redis, { connection } from "../lib/redis";
import { db } from "../lib/firebase";
import { collection, doc, getDoc, getDocs, query, where, Timestamp, addDoc, serverTimestamp, limit } from "firebase/firestore";
import { subBusinessDays, differenceInHours } from "date-fns";
import { COBRAI_TEMPLATES } from "../lib/cobraiTemplates";
import { buildTemplateComponents } from "../lib/templateBuilder";
import { incrementShardedCounter } from "../lib/db";
import { logger } from "../lib/logger";

const isMockRedis = !((redis as any).options);

async function logCobraiSkip(customerId: string, tenantId: string, reason: string) {
  try {
    await addDoc(collection(db, "logs"), {
      type: "COBRAI_SKIP",
      customerId,
      tenantId,
      reason,
      timestamp: serverTimestamp()
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

    const tenantSnap = await getDoc(doc(db, "tenants", tenantId));
    if (!tenantSnap.exists()) return;
    const tenantData = tenantSnap.data();

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
    const customer = await getDoc(doc(db, "customers", customerId));
    if (!customer.exists()) return;
    const data = customer.data();

    // PROTEÇÃO — Verificar opt-in
    if (!data.marketing_opt_in) {
      await logCobraiSkip(customerId, tenantId, 'NO_CONSENT');
      return;
    }

    if (data.payment_agreement?.active === true) {
      const nextDue = data.payment_agreement.next_due_date?.toDate();
      if (nextDue && nextDue > new Date()) {
        // Cliente tem acordo em dia — pular disparo, logar skip
        await logCobraiSkip(customerId, tenantId, 'ACTIVE_PAYMENT_AGREEMENT');
        return;
      }
    }

    // PROTEÇÃO B — Janela de compensação bancária antes de suspender (D+61):
    if (stage === 'suspensao_automatica') {
      const threeBizDaysAgo = subBusinessDays(new Date(), 3);
      const recentPayment = await getDocs(
        query(
          collection(db, 'payments'),
          where('customer_id', '==', customerId),
          where('paid_at', '>=', Timestamp.fromDate(threeBizDaysAgo)),
          where('status', 'in', ['confirmado', 'pendente_compensacao']),
          limit(1)
        )
      );

      if (!recentPayment.empty) {
        // Pagamento recente — suspender após compensação, não agora
        await logCobraiSkip(customerId, tenantId, 'PAYMENT_PENDING_COMPENSATION');
        return;
      }
    }

    // Preparar dados do cliente e da fatura fictícia (neste mock)
    const invoice = { due_date: '01/01/2026', amount: data.current_price || 99.9 };

    let isWithin24hWindow = false;
    let templateName = 'Livre';
    if (data.last_customer_message_at) {
      const lastMsgDate = data.last_customer_message_at.toDate();
      if (differenceInHours(new Date(), lastMsgDate) < 24) {
        isWithin24hWindow = true;
      }
    }

    if (isWithin24hWindow) {
      // Envio de mensagem livre
      logger.info("cobrai_window_active_free_msg", { tenant_id: tenantId, session_id: customerId });
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
      // Chamada fictícia/real à Evolution API aconteceria aqui:
      /*
      await evolutionApi.sendTemplate({
        number: data.phone,
        templateName: template.templateName,
        language: template.language,
        components: components
      });
      */
      logger.info("cobrai_dispatched", { tenant_id: tenantId, session_id: customerId, data: { template_name: template.templateName, components } });
    }

    logger.info("cobrai_action_success", { tenant_id: tenantId, session_id: customerId, data: { stage } });

    // Registrar sucesso na cobrai_logs
    await addDoc(collection(db, "cobrai_logs"), {
      customer_id: customerId,
      tenant_id: tenantId,
      stage: stage,
      template_name: templateName,
      sent_at: serverTimestamp(),
      status: 'sent'
    });

    await incrementShardedCounter('cobrai_sent_today', tenantId);

  } catch (error: any) {
    logger.error("cobrai_action_failed", { tenant_id: tenantId, session_id: customerId, error: error.message, data: { stage } });
    // Registrar falha na cobrai_logs
    await addDoc(collection(db, "cobrai_logs"), {
      customer_id: customerId,
      tenant_id: tenantId,
      stage: stage,
      sent_at: serverTimestamp(),
      status: 'failed',
      error_message: error.message
    });
  }
}

// Worker com concurrency 1 por tenant para evitar race conditions (geralmente concurrency: 3)
export const worker = isMockRedis ? {
  on: () => {}
} as any : new Worker('cobrai', async (job) => {
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
}, { connection, concurrency: 3 });

worker.on('failed', async (job: any, err: any) => {
  if (!job) return;
  const attempts = job.attemptsMade;
  const maxAttempts = job.opts?.attempts ?? 3;
  if (attempts >= maxAttempts) {
    // Mover para DLQ no Firestore para visibilidade
    await addDoc(collection(db, 'dead_letter_queue'), {
      job_id: job.id,
      job_name: job.name,
      job_data: job.data,
      error_message: err.message,
      error_stack: err.stack?.substring(0, 500),
      attempts: attempts,
      failed_at: serverTimestamp(),
      tenant_id: job.data?.tenantId ?? 'unknown',
      resolved: false
    });
    logger.error("dlq_move", { tenant_id: job.data?.tenantId, error: err.message, data: { job_name: job.name, attempts } });
  }
});

