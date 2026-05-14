import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { v1 } from "@google-cloud/firestore";

// @ts-ignore
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const checkWhatsAppHealth = functions.scheduler.onSchedule(
  "every 15 minutes",
  async (event) => {
    const tenants = await db
      .collection("tenants")
      .where("active", "==", true)
      .get();

    for (const tenant of tenants.docs) {
      const { evolution_instance, evolution_url, evolution_key, alert_email } =
        tenant.data();
        
      if (!evolution_url || !evolution_instance || !evolution_key) continue;

      try {
        const response = await fetch(
          `${evolution_url}/instance/connectionState/${evolution_instance}`,
          {
            headers: { apikey: evolution_key },
            signal: AbortSignal.timeout(5000),
          },
        );
        const data = await response.json();
        const status = data?.instance?.state; // 'open' | 'close' | 'connecting'

        await db
          .collection("tenants")
          .doc(tenant.id)
          .update({
            "whatsapp_health.status": status || "unknown",
            "whatsapp_health.checked_at": admin.firestore.FieldValue.serverTimestamp(),
            "whatsapp_health.consecutive_failures":
              status === "open"
                ? 0
                : admin.firestore.FieldValue.increment(1),
          });

        if (status !== "open") {
          await sendHealthAlert(tenant.id, alert_email, status || "unknown", evolution_instance);
        }
      } catch (err) {
        await db
          .collection("tenants")
          .doc(tenant.id)
          .update({
            "whatsapp_health.status": "unreachable",
            "whatsapp_health.checked_at": admin.firestore.FieldValue.serverTimestamp(),
            "whatsapp_health.consecutive_failures": admin.firestore.FieldValue.increment(1),
          });
        await sendHealthAlert(tenant.id, alert_email, "unreachable", evolution_instance);
      }
    }
  },
);

async function sendHealthAlert(
  tenantId: string,
  alertEmail: string,
  status: string,
  instance: string
) {
  // Simulando ou invocando envio de email (nodemailer seria importado se houvesse credenciais)
  console.log(`[ALERT] Enviando email para ${alertEmail || 'admin@isp.com'}`);
  console.log(`Assunto: 🚨 WhatsApp desconectado — [nome da ISP]`);
  console.log(`Corpo: Instância ${instance} está com status: ${status} às ${new Date().toISOString()}`);
  
  // Registro local caso a notificação precise ser tratada por outro worker
  await db.collection("notifications").add({
    tenantId,
    type: "WHATSAPP_DISCONNECTED",
    message: `A fila da instância ${instance} reportou status ${status}. Verifique o painel do Evolution API.`,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    status: "pending"
  });
}


export const timeoutInactiveSessions = functions.scheduler.onSchedule(
  "every 5 minutes",
  async (event) => {
    const thirtyMinutesAgo = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 30 * 60 * 1000),
    );

    try {
      const snapshot = await db
        .collection("tickets")
        .where("status", "==", "open")
        .where("session_state.active_flow", "!=", "IDLE")
        .where("lastMessageAt", "<", thirtyMinutesAgo)
        .get();

      const batch = db.batch();
      let count = 0;

      for (const doc of snapshot.docs) {
        batch.update(doc.ref, {
          "session_state.active_flow": "IDLE",
          "session_state.step": "timeout",
          "session_state.agent": null,
        });
        count++;
      }

      if (count > 0) {
        await batch.commit();
        console.log(`Timed out ${count} inactive sessions.`);
      } else {
        console.log("No inactive sessions to timeout.");
      }
    } catch (error) {
      console.error("Error timing out sessions:", error);
    }
  },
);

// Acompanhamento pós-instalação (24h)
export const postInstallationFollowUp = functions.scheduler.onSchedule(
  "every 1 hours",
  async (event) => {
    const now = Date.now();
    const startWindow = admin.firestore.Timestamp.fromDate(
      new Date(now - 25 * 60 * 60 * 1000),
    );
    const endWindow = admin.firestore.Timestamp.fromDate(
      new Date(now - 24 * 60 * 60 * 1000),
    );

    try {
      const osSnapshot = await db
        .collection("service_orders")
        .where("status", "==", "concluida")
        .where("completedAt", ">=", startWindow.toDate().toISOString())
        .where("completedAt", "<", endWindow.toDate().toISOString())
        .get();

      const batch = db.batch();
      let count = 0;

      for (const doc of osSnapshot.docs) {
        const os = doc.data();
        // Verificamos se já enviamos contato de pós-venda
        if (os.postInstallationContacted) continue;

        // Cria um novo ticket de follow-up ou envia mensagem
        const ticketRef = db.collection("tickets").doc();
        batch.set(ticketRef, {
          customerId: os.customerId,
          subject: "Acompanhamento Pós-Instalação",
          status: "open",
          priority: "low",
          aiHandled: true,
          session_state: {
            active_flow: "SAC_GERAL",
            step: "pos_venda",
            agent: "Maria Pós-Venda",
          },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const messageRef = ticketRef.collection("messages").doc();
        batch.set(messageRef, {
          ticketId: ticketRef.id,
          senderId: "ai",
          senderType: "ai",
          text: `Olá ${os.customerName || ""}, aqui é a Maria da Astrum! Vi que a sua instalação foi concluída ontem. Está tudo funcionando perfeitamente? A conexão está rápida?`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        batch.update(doc.ref, { postInstallationContacted: true });
        count++;
      }

      if (count > 0) {
        await batch.commit();
        console.log(`Created ${count} post-installation follow-ups.`);
      }
    } catch (error) {
      console.error("Error in post-installation follow-up:", error);
    }
  },
);

// Alertas de Infraestrutura e Qualidade
export const systemAlerts = functions.scheduler.onSchedule(
  "every 30 minutes",
  async (event) => {
    try {
      const batch = db.batch();
      let alertsCreated = 0;

      // 1. Escalações (últimos 30 minutos)
      const thirtyMinsAgo = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() - 30 * 60 * 1000),
      );
      const logsSnapshot = await db
        .collection("logs")
        .where("timestamp", ">=", thirtyMinsAgo)
        .where("escalated", "==", true)
        .get();

      if (logsSnapshot.size > 5) {
        // Limiar ex: 5
        const notifRef = db.collection("notifications").doc();
        batch.set(notifRef, {
          type: "CRITICAL_ESCALATION",
          message: `Anomalia detectada: ${logsSnapshot.size} escalações para humano nos últimos 30 minutos.`,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        alertsCreated++;
      }

      // 2. Erros Fatais
      const errorsSnapshot = await db
        .collection("logs")
        .where("timestamp", ">=", thirtyMinsAgo)
        .where("result", "==", "fatal")
        .get();

      if (errorsSnapshot.size > 2) {
        const notifRef = db.collection("notifications").doc();
        batch.set(notifRef, {
          type: "SYSTEM_ERROR",
          message: `Alerta: ${errorsSnapshot.size} erros técnicos graves registrados pela IA.`,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        alertsCreated++;
      }

      // 3. OS sem atribuição há mais de 24 horas
      const oneDayAgo = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() - 24 * 60 * 60 * 1000),
      );
      const unassignedOsSnapshot = await db
        .collection("service_orders")
        .where("status", "==", "pendente")
        .where("assignedTo", "in", [null, "FILA_TRIAGEM"])
        .get();

      let overdueOS = 0;
      unassignedOsSnapshot.docs.forEach((doc) => {
        const createdAt = doc.data().createdAt;
        if (createdAt && createdAt < oneDayAgo) overdueOS++;
      });

      if (overdueOS > 0) {
        const notifRef = db.collection("notifications").doc();
        batch.set(notifRef, {
          type: "SLA_BREACH",
          message: `${overdueOS} Ordens de Serviço aguardando atribuição por mais de 24 horas.`,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        alertsCreated++;
      }

      if (alertsCreated > 0) {
        await batch.commit();
        console.log(`Generated ${alertsCreated} system alerts.`);
      }
    } catch (error) {
      console.error("Error generating system alerts:", error);
    }
  },
);

export const detectMassiveIncident = functions.scheduler.onSchedule('every 5 minutes', async () => {
  const thirtyMinutesAgo = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 30 * 60 * 1000));
  
  const recentTickets = await db.collection("tickets") // Top-level collection in schema
    .where('createdAt', '>=', thirtyMinutesAgo)
    .where('status', '==', 'open')
    // We remove .where('category', 'in', ...) constraint inside the query because Firestore index might not exist for complex multiquery. We will filter in JS if needed. Or we can try.
    // .where('category', 'in', ['SUPORTE_TECNICO', 'SAC_GERAL'])
    .get();
  
  // Agrupar por cto_id do cliente
  const ctoClusters: Record<string, string[]> = {};
  for (const ticket of recentTickets.docs) {
    const data = ticket.data();
    const category = data.category || data.session_state?.active_flow;
    if (category !== 'SUPORTE_TECNICO' && category !== 'SAC_GERAL' && data.subject !== 'Suporte Técnico') {
       continue;
    }

    const customerId = data.customerId || data.customer_id;
    if (!customerId) continue;
    const customer = await db.collection('customers').doc(customerId).get();
    const ctoId = customer.data()?.cto_id;
    if (!ctoId) continue;
    if (!ctoClusters[ctoId]) ctoClusters[ctoId] = [];
    ctoClusters[ctoId].push(ticket.id);
  }
  
  const INCIDENT_THRESHOLD = parseInt(process.env.INCIDENT_THRESHOLD ?? '5');
  
  for (const [ctoId, ticketIds] of Object.entries(ctoClusters)) {
    if (ticketIds.length >= INCIDENT_THRESHOLD) {
      // Verificar se já existe incidente ativo para essa CTO
      const existing = await db.collection('incidents')
        .where('cto_id', '==', ctoId)
        .where('status', '==', 'active')
        .limit(1).get();
      
      if (existing.empty) {
        // Criar incidente mãe
        const incidentRef = await db.collection('incidents').add({
          cto_id: ctoId,
          tenant_id: "default", // derivar do primeiro ticket, assumimos multitenant simples
          affected_tickets: ticketIds,
          status: 'active',
          created_at: admin.firestore.FieldValue.serverTimestamp(),
          auto_detected: true
        });
        
        // Responder todos os clientes afetados com mensagem de incidente
        for (const ticketId of ticketIds) {
          await notifyIncidentToCustomer(ticketId, incidentRef.id, ctoId);
        }
        
        // Bloquear abertura de novas OS individuais para essa CTO
        await db.collection('cto_incidents').doc(ctoId).set({
          incident_id: incidentRef.id,
          blocked_until: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 4 * 60 * 60 * 1000))
        });
      } else {
        // Adicionar novos tickets ao incidente existente
        await existing.docs[0].ref.update({
          affected_tickets: admin.firestore.FieldValue.arrayUnion(...ticketIds)
        });
      }
    }
  }
});

async function notifyIncidentToCustomer(ticketId: string, incidentId: string, ctoId: string) {
  try {
     const ticketData = (await db.collection("tickets").doc(ticketId).get()).data();
     if (!ticketData) return;
     
     const messageRef = db.collection("tickets").doc(ticketId).collection("messages").doc();
     await messageRef.set({
       ticketId: ticketId,
       senderId: "ai",
       senderType: "ai",
       text: `Identificamos uma instabilidade técnica na sua região. Nossa equipe já está trabalhando na solução. Você receberá uma atualização assim que o serviço for normalizado. Protocolo: ${incidentId}`,
       createdAt: admin.firestore.FieldValue.serverTimestamp(),
     });
     
     // Update ticket to incident queue
     await db.collection("tickets").doc(ticketId).update({
       "session_state.active_flow": "IDLE",
       "session_state.step": "incident_wait",
       "aiHandled": false
     });
  } catch (err) {
     console.error("notifyIncidentToCustomer err", err);
  }
}

export const sendD1Confirmation = functions.scheduler.onSchedule('every day 18:00', async () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStart = new Date(tomorrow.setHours(0,0,0,0));
  const tomorrowEnd = new Date(tomorrow.setHours(23,59,59,999));
  
  const scheduledOS = await db.collection("service_orders")
    .where('status', '==', 'agendada')
    .where('scheduled_date', '>=', admin.firestore.Timestamp.fromDate(tomorrowStart))
    .where('scheduled_date', '<=', admin.firestore.Timestamp.fromDate(tomorrowEnd))
    .get();
  
  for (const os of scheduledOS.docs) {
    const data = os.data();
    
    // Evitar duplo envio
    if (data.d1_confirmation_sent) continue;
    
    const customer = await db.collection('customers').doc(data.customer_id).get();
    const customerData = customer.data();
    if (!customerData || !customerData.phone) continue;
    
    const tenant = await db.collection('tenants').doc(data.tenant_id || "default").get();
    const tenantData = tenant.data();
    if (!tenantData) continue;
    
    const scheduledDate = data.scheduled_date.toDate().toLocaleDateString('pt-BR');
    
    try {
      const evoUrl = tenantData.evolution_url?.replace(/\/+$/, "");
      const evoInstance = tenantData.evolution_instance;
      const evoKey = tenantData.evolution_key;
      
      const phoneOnly = customerData.phone.replace(/\D/g, "");
      const remoteJid = `${phoneOnly}@s.whatsapp.net`;
      
      const textMessage = `Olá ${customerData.name.split(' ')[0]}! Aqui é da Astrum.
Lembrando que temos uma visita técnica agendada para amanhã (${scheduledDate}) no período da ${data.scheduled_period === 'manha' ? 'Manhã (08h-12h)' : 'Tarde (13h-18h)'}.

Por favor, confirme se haverá um maior de 18 anos no local:
✅ Confirmar
🔄 Reagendar`;

      if (evoUrl && evoInstance && evoKey) {
          await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: evoKey,
            },
            body: JSON.stringify({
              number: remoteJid,
              text: textMessage,
            }),
          });
          
          await os.ref.update({
            d1_confirmation_sent: true,
            d1_confirmation_sent_at: admin.firestore.FieldValue.serverTimestamp()
          });
      }
    } catch (err) {
      console.error("Erro ao enviar D-1 da OS:", os.id, err);
    }
  }
});

export const optimizeDailyRoutes = functions.scheduler.onSchedule('every day 06:00', async () => {
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
  
  // Como o app usa 'default' em muitos casos, vou pegar todas as OS agendadas de hoje direto
  const todayOS = await db.collection('service_orders')
    .where('scheduled_date', '>=', admin.firestore.Timestamp.fromDate(todayStart))
    .where('scheduled_date', '<=', admin.firestore.Timestamp.fromDate(todayEnd))
    .where('status', '==', 'agendada')
    .get();
  
  if (todayOS.empty) return;
  
  // Agrupar por tenant + primeiros 5 dígitos do CEP (aproximação de bairro)
  const byRegion: Record<string, admin.firestore.QueryDocumentSnapshot[]> = {};
  for (const os of todayOS.docs) {
    const data = os.data();
    // Caso usem address em vez de customer_cep, tentamos pegar o cep
    let cep = 'sem_cep';
    if (data.customer_cep) {
       cep = data.customer_cep.replace(/\D/g, '').substring(0, 5);
    } else if (data.address) {
       const match = data.address.match(/\d{5}-?\d{3}/);
       if (match) cep = match[0].replace(/\D/g, '').substring(0, 5);
    }
    if (!cep || cep.length < 5) cep = 'sem_cep';

    const tenantId = data.tenant_id ?? 'default';
    const key = `${tenantId}_${cep}`;
    if (!byRegion[key]) byRegion[key] = [];
    byRegion[key].push(os);
  }
  
  // Ordenar regiões por maior concentração (mais OS por bairro primeiro)
  const sortedRegions = Object.entries(byRegion)
    .sort(([,a],[,b]) => b.length - a.length);
  
  // Atribuir sequence_number a cada OS na ordem otimizada, resetando em cada tenant
  const tenantSeq: Record<string, number> = {};
  const batch = db.batch();
  for (const [regionKey, osList] of sortedRegions) {
    const tenantId = regionKey.split('_')[0];
    const region = regionKey.split('_')[1];
    
    if (!tenantSeq[tenantId]) tenantSeq[tenantId] = 1;
    
    for (const os of osList) {
      batch.update(os.ref, {
        route_sequence: tenantSeq[tenantId]++,
        route_region: region,
        route_optimized_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }
  await batch.commit();
});

export const checkOperationalHealth = functions.scheduler.onSchedule('every 30 minutes', async () => {
  const thirtyMinutesAgo = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 30 * 60 * 1000));
  
  // Degraded Mode Check (PASSO 4)
  try {
    await db.collection('tenants').limit(1).get(); // Leitura simples
    
    // Se bem-sucedida, limpar flag de degradação
    try {
      const Redis = require('ioredis');
      const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL; // Attempt string or REST
      // In this environment we might not have the URL directly, but we do best effort
      if (redisUrl && redisUrl.startsWith('redis')) {
        const redis = new Redis(redisUrl);
        await redis.del('system_degraded');
        redis.disconnect();
      } else if (process.env.UPSTASH_REDIS_REST_URL) {
        await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/del/system_degraded`, {
          headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` }
        });
      } else {
        const redis = new Redis();
        await redis.del('system_degraded');
        redis.disconnect();
      }
    } catch (redisErr) {
       console.error("Não foi possível limpar a flag no Redis", redisErr);
    }
  } catch (err) {
    console.error("Firestore health check falhou", err);
    // Se falhou, a API/Worker cuidará de setar system_degraded lá
  }

  // DLQ acumulando?
  const dlqSnap = await db.collection('dead_letter_queue')
    .where('failed_at', '>=', thirtyMinutesAgo)
    .where('resolved', '==', false)
    .get();
  if (dlqSnap.size >= 5) {
    await sendOperationalAlert('DLQ_SPIKE', `${dlqSnap.size} jobs falharam nos últimos 30 minutos`);
  }
  
  // Tickets sem resposta humana > 20 minutos?
  const stalledTickets = await db.collection('tickets')
    .where('human_responded', '==', false)
    .where('escalated_at', '<=', admin.firestore.Timestamp.fromDate(new Date(Date.now() - 20 * 60 * 1000)))
    .get();
  if (stalledTickets.size >= 3) {
    await sendOperationalAlert('SLA_BREACH_MULTIPLE', `${stalledTickets.size} tickets sem resposta humana há mais de 20min`);
  }
  
  // Clientes com churn_risk sem ação?
  const churnRisk = await db.collection('customers')
    .where('churn_risk', '==', true)
    .where('churn_actioned', '!=', true)
    .get();
  if (churnRisk.size >= 5) {
    await sendOperationalAlert('CHURN_RISK_QUEUE', `${churnRisk.size} clientes com risco de churn sem ação`);
  }
});

async function sendOperationalAlert(type: string, message: string) {
  // Gravar em notifications/ para o painel
  await db.collection('notifications').add({
    type,
    message,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
    severity: 'high'
  });
  // Log para Cloud Run
  console.error(`[ALERT] ${type}: ${message}`);
}

export const computeAgentMetrics = functions.scheduler.onSchedule('every day 03:00', async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const todayStart = new Date(yesterday);
  todayStart.setDate(todayStart.getDate() + 1);

  const tenants = await db.collection('tenants').where('active', '==', true).get();
  for (const tenant of tenants.docs) {
    const tickets = await db.collection('tickets')
      .where('tenant_id', '==', tenant.id)
      .where('created_at', '>=', admin.firestore.Timestamp.fromDate(yesterday))
      .where('created_at', '<', admin.firestore.Timestamp.fromDate(todayStart))
      .get();

    const byAgent: Record<string, { total: number, escalated: number, csat_sum: number, csat_count: number }> = {};
    for (const ticket of tickets.docs) {
      const agent = ticket.data().session_state?.agent ?? 'UNKNOWN';
      if (!byAgent[agent]) byAgent[agent] = { total: 0, escalated: 0, csat_sum: 0, csat_count: 0 };
      byAgent[agent].total++;
      if (ticket.data().human_responded) byAgent[agent].escalated++;
      if (ticket.data().last_csat_score) {
        byAgent[agent].csat_sum += ticket.data().last_csat_score;
        byAgent[agent].csat_count++;
      }
    }

    await db.collection('agent_metrics').add({
      tenant_id: tenant.id,
      date: admin.firestore.Timestamp.fromDate(yesterday),
      agents: Object.entries(byAgent).map(([agent, m]) => ({
        agent,
        total_tickets: m.total,
        escalation_rate: m.total > 0 ? parseFloat((m.escalated / m.total * 100).toFixed(1)) : 0,
        avg_csat: m.csat_count > 0 ? parseFloat((m.csat_sum / m.csat_count).toFixed(2)) : null
      }))
    });
  }
});

export const dailyBackup = functions.scheduler.onSchedule('every 1 hours', async () => {
  const tenants = await db.collection("tenants").where("backup_enabled", "==", true).get();
  
  // Obtém a hora atual do Brasil (ex: '02h', '13h')
  const currentHourBRT = new Date(Date.now() - 3 * 3600000).getUTCHours().toString().padStart(2, '0') + "h";

  const { v1 } = require("@google-cloud/firestore");
  const client = new v1.FirestoreAdminClient();

  for (const tenant of tenants.docs) {
    const data = tenant.data();
    
    // Verifica se a hora do backup bate com a hora atual, ou se configurado
    if (data.backup_hour && data.backup_hour !== currentHourBRT) {
      continue;
    }

    const projectId = data.gcp_project_id || process.env.GCLOUD_PROJECT;
    const bucketName = data.backup_bucket_name || process.env.BACKUP_BUCKET_NAME;

    if (!projectId || !bucketName) {
      console.error(`[BACKUP] Missing GCP config for tenant ${tenant.id}`);
      continue;
    }

    try {
      const responses = await client.exportDocuments({
        name: `projects/${projectId}/databases/(default)`,
        outputUriPrefix: `gs://${bucketName}/backups/${new Date().toISOString().split('T')[0]}_${tenant.id}`,
        collectionIds: [
          'customers', 'tickets', 'service_orders', 'contracts',
          'tenants', 'plans', 'incidents', 'csat_ratings', 'data_access_logs'
        ]
      });

      console.log('[BACKUP] Export started for tenant', tenant.id, ':', responses[0].name);

      await tenant.ref.update({
        last_backup_at: admin.firestore.FieldValue.serverTimestamp(),
        last_backup_status: 'success',
        last_backup_size_mb: 'Estimado 50MB'
      });

      const retentionDays = data.backup_retention_days || 30;
      await cleanOldBackups(bucketName, retentionDays);
    } catch (err: any) {
      await tenant.ref.update({
        last_backup_status: 'failed',
        last_backup_error: err.message
      });
      console.error('[BACKUP] Error exporting tenant', tenant.id, err);
    }
  }
});

async function cleanOldBackups(bucket: string, retentionDays: number) {
  const { Storage } = require('@google-cloud/storage');
  const storage = new Storage();
  const [files] = await storage.bucket(bucket).getFiles({ prefix: 'backups/' });
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  for (const file of files) {
    if (file.metadata?.timeCreated) {
      const created = new Date(file.metadata.timeCreated);
      if (created < cutoff) await file.delete();
    }
  }
}

