"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.optimizeDailyRoutes = exports.sendD1Confirmation = exports.detectMassiveIncident = exports.systemAlerts = exports.postInstallationFollowUp = exports.timeoutInactiveSessions = exports.checkWhatsAppHealth = void 0;
const functions = require("firebase-functions/v2");
const admin = require("firebase-admin");
// @ts-ignore
if (!admin.apps.length)
    admin.initializeApp();
const db = admin.firestore();
exports.checkWhatsAppHealth = functions.scheduler.onSchedule("every 15 minutes", async (event) => {
    var _a;
    const tenants = await db
        .collection("tenants")
        .where("active", "==", true)
        .get();
    for (const tenant of tenants.docs) {
        const { evolution_instance, evolution_url, evolution_key, alert_email } = tenant.data();
        if (!evolution_url || !evolution_instance || !evolution_key)
            continue;
        try {
            const response = await fetch(`${evolution_url}/instance/connectionState/${evolution_instance}`, {
                headers: { apikey: evolution_key },
                signal: AbortSignal.timeout(5000),
            });
            const data = await response.json();
            const status = (_a = data === null || data === void 0 ? void 0 : data.instance) === null || _a === void 0 ? void 0 : _a.state; // 'open' | 'close' | 'connecting'
            await db
                .collection("tenants")
                .doc(tenant.id)
                .update({
                "whatsapp_health.status": status || "unknown",
                "whatsapp_health.checked_at": admin.firestore.FieldValue.serverTimestamp(),
                "whatsapp_health.consecutive_failures": status === "open"
                    ? 0
                    : admin.firestore.FieldValue.increment(1),
            });
            if (status !== "open") {
                await sendHealthAlert(tenant.id, alert_email, status || "unknown", evolution_instance);
            }
        }
        catch (err) {
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
});
async function sendHealthAlert(tenantId, alertEmail, status, instance) {
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
exports.timeoutInactiveSessions = functions.scheduler.onSchedule("every 5 minutes", async (event) => {
    const thirtyMinutesAgo = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 30 * 60 * 1000));
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
        }
        else {
            console.log("No inactive sessions to timeout.");
        }
    }
    catch (error) {
        console.error("Error timing out sessions:", error);
    }
});
// Acompanhamento pós-instalação (24h)
exports.postInstallationFollowUp = functions.scheduler.onSchedule("every 1 hours", async (event) => {
    const now = Date.now();
    const startWindow = admin.firestore.Timestamp.fromDate(new Date(now - 25 * 60 * 60 * 1000));
    const endWindow = admin.firestore.Timestamp.fromDate(new Date(now - 24 * 60 * 60 * 1000));
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
            if (os.postInstallationContacted)
                continue;
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
    }
    catch (error) {
        console.error("Error in post-installation follow-up:", error);
    }
});
// Alertas de Infraestrutura e Qualidade
exports.systemAlerts = functions.scheduler.onSchedule("every 30 minutes", async (event) => {
    try {
        const batch = db.batch();
        let alertsCreated = 0;
        // 1. Escalações (últimos 30 minutos)
        const thirtyMinsAgo = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 30 * 60 * 1000));
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
        const oneDayAgo = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
        const unassignedOsSnapshot = await db
            .collection("service_orders")
            .where("status", "==", "pendente")
            .where("assignedTo", "in", [null, "FILA_TRIAGEM"])
            .get();
        let overdueOS = 0;
        unassignedOsSnapshot.docs.forEach((doc) => {
            const createdAt = doc.data().createdAt;
            if (createdAt && createdAt < oneDayAgo)
                overdueOS++;
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
    }
    catch (error) {
        console.error("Error generating system alerts:", error);
    }
});
exports.detectMassiveIncident = functions.scheduler.onSchedule('every 5 minutes', async () => {
    var _a, _b, _c;
    const thirtyMinutesAgo = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 30 * 60 * 1000));
    const recentTickets = await db.collection("tickets") // Top-level collection in schema
        .where('createdAt', '>=', thirtyMinutesAgo)
        .where('status', '==', 'open')
        // We remove .where('category', 'in', ...) constraint inside the query because Firestore index might not exist for complex multiquery. We will filter in JS if needed. Or we can try.
        // .where('category', 'in', ['SUPORTE_TECNICO', 'SAC_GERAL'])
        .get();
    // Agrupar por cto_id do cliente
    const ctoClusters = {};
    for (const ticket of recentTickets.docs) {
        const data = ticket.data();
        const category = data.category || ((_a = data.session_state) === null || _a === void 0 ? void 0 : _a.active_flow);
        if (category !== 'SUPORTE_TECNICO' && category !== 'SAC_GERAL' && data.subject !== 'Suporte Técnico') {
            continue;
        }
        const customerId = data.customerId || data.customer_id;
        if (!customerId)
            continue;
        const customer = await db.collection('customers').doc(customerId).get();
        const ctoId = (_b = customer.data()) === null || _b === void 0 ? void 0 : _b.cto_id;
        if (!ctoId)
            continue;
        if (!ctoClusters[ctoId])
            ctoClusters[ctoId] = [];
        ctoClusters[ctoId].push(ticket.id);
    }
    const INCIDENT_THRESHOLD = parseInt((_c = process.env.INCIDENT_THRESHOLD) !== null && _c !== void 0 ? _c : '5');
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
            }
            else {
                // Adicionar novos tickets ao incidente existente
                await existing.docs[0].ref.update({
                    affected_tickets: admin.firestore.FieldValue.arrayUnion(...ticketIds)
                });
            }
        }
    }
});
async function notifyIncidentToCustomer(ticketId, incidentId, ctoId) {
    try {
        const ticketData = (await db.collection("tickets").doc(ticketId).get()).data();
        if (!ticketData)
            return;
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
    }
    catch (err) {
        console.error("notifyIncidentToCustomer err", err);
    }
}
exports.sendD1Confirmation = functions.scheduler.onSchedule('every day 18:00', async () => {
    var _a;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStart = new Date(tomorrow.setHours(0, 0, 0, 0));
    const tomorrowEnd = new Date(tomorrow.setHours(23, 59, 59, 999));
    const scheduledOS = await db.collection("service_orders")
        .where('status', '==', 'agendada')
        .where('scheduled_date', '>=', admin.firestore.Timestamp.fromDate(tomorrowStart))
        .where('scheduled_date', '<=', admin.firestore.Timestamp.fromDate(tomorrowEnd))
        .get();
    for (const os of scheduledOS.docs) {
        const data = os.data();
        // Evitar duplo envio
        if (data.d1_confirmation_sent)
            continue;
        const customer = await db.collection('customers').doc(data.customer_id).get();
        const customerData = customer.data();
        if (!customerData || !customerData.phone)
            continue;
        const tenant = await db.collection('tenants').doc(data.tenant_id || "default").get();
        const tenantData = tenant.data();
        if (!tenantData)
            continue;
        const scheduledDate = data.scheduled_date.toDate().toLocaleDateString('pt-BR');
        try {
            const evoUrl = (_a = tenantData.evolution_url) === null || _a === void 0 ? void 0 : _a.replace(/\/+$/, "");
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
        }
        catch (err) {
            console.error("Erro ao enviar D-1 da OS:", os.id, err);
        }
    }
});
exports.optimizeDailyRoutes = functions.scheduler.onSchedule('every day 06:00', async () => {
    var _a;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    // Como o app usa 'default' em muitos casos, vou pegar todas as OS agendadas de hoje direto
    const todayOS = await db.collection('service_orders')
        .where('scheduled_date', '>=', admin.firestore.Timestamp.fromDate(todayStart))
        .where('scheduled_date', '<=', admin.firestore.Timestamp.fromDate(todayEnd))
        .where('status', '==', 'agendada')
        .get();
    if (todayOS.empty)
        return;
    // Agrupar por tenant + primeiros 5 dígitos do CEP (aproximação de bairro)
    const byRegion = {};
    for (const os of todayOS.docs) {
        const data = os.data();
        // Caso usem address em vez de customer_cep, tentamos pegar o cep
        let cep = 'sem_cep';
        if (data.customer_cep) {
            cep = data.customer_cep.replace(/\D/g, '').substring(0, 5);
        }
        else if (data.address) {
            const match = data.address.match(/\d{5}-?\d{3}/);
            if (match)
                cep = match[0].replace(/\D/g, '').substring(0, 5);
        }
        if (!cep || cep.length < 5)
            cep = 'sem_cep';
        const tenantId = (_a = data.tenant_id) !== null && _a !== void 0 ? _a : 'default';
        const key = `${tenantId}_${cep}`;
        if (!byRegion[key])
            byRegion[key] = [];
        byRegion[key].push(os);
    }
    // Ordenar regiões por maior concentração (mais OS por bairro primeiro)
    const sortedRegions = Object.entries(byRegion)
        .sort(([, a], [, b]) => b.length - a.length);
    // Atribuir sequence_number a cada OS na ordem otimizada, resetando em cada tenant
    const tenantSeq = {};
    const batch = db.batch();
    for (const [regionKey, osList] of sortedRegions) {
        const tenantId = regionKey.split('_')[0];
        const region = regionKey.split('_')[1];
        if (!tenantSeq[tenantId])
            tenantSeq[tenantId] = 1;
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
//# sourceMappingURL=index.js.map