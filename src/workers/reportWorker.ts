import { Queue, Worker } from "bullmq";
import redis from "../lib/redis";
import customAdmin, { adminDb as db } from "../lib/firebaseAdmin";
import { sendEmail } from "../lib/email";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const isMockRedis = !((redis as any).options);

export const reportQueue = isMockRedis ? {
  upsertJobScheduler: async () => {}
} as any : new Queue("report-generator", { connection: redis as any });

export const reportWorker = isMockRedis ? null : new Worker('report-generator', async (job) => {
  if (job.name === 'generate_daily_report') {
    const now = new Date();
    // report is for "today"
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const startObj = customAdmin.firestore.Timestamp.fromDate(startOfDay);
    const endObj = customAdmin.firestore.Timestamp.fromDate(endOfDay);
    const dateStr = startOfDay.toLocaleDateString("pt-BR");

    try {
        const tenantsSnap = await db.collection("tenants").where("status", "==", "active").get();

        for (const doc of tenantsSnap.docs) {
            const tenantId = doc.id;
            const tData = doc.data() as any;
            
            const recipients = tData.report_recipients;
            if (!recipients || !Array.isArray(recipients) || recipients.length === 0) continue;

            const ticketsSnap = await db.collection("tickets")
                .where("tenantId", "==", tenantId)
                .where("createdAt", ">=", startObj)
                .where("createdAt", "<=", endObj)
                .get();

            let totalTickets = ticketsSnap.size;
            let resolvedCount = 0;
            let escalatedCount = 0;
            let tmaSum = 0;
            let tmaCount = 0;
            let csatSum = 0;
            let csatCount = 0;
            
            const reasonsCount: Record<string, number> = {};

            ticketsSnap.docs.forEach(ticketDoc => {
                const ticket = ticketDoc.data();
                const escalated = ticket.status === "escalated" || ticket.escalated === true;
                const reopened = ticket.reopened === true;
                const resolved = ticket.status === "resolved" || ticket.status === "closed";

                if (resolved && !escalated && !reopened) resolvedCount++;
                
                const cat = ticket.category || ticket.subject || "Outros";
                reasonsCount[cat] = (reasonsCount[cat] || 0) + 1;

                if (ticket.csat_score) {
                    csatSum += Number(ticket.csat_score);
                    csatCount++;
                }

                const createdAtDt = ticket.createdAt?.toDate?.() || null;
                const resolvedAtDt = ticket.resolvedAt?.toDate?.() || (ticket.resolved_at ? (ticket.resolved_at.toDate?.() || new Date(ticket.resolved_at)) : null);

                if (createdAtDt && resolvedAtDt) {
                    tmaSum += (resolvedAtDt.getTime() - createdAtDt.getTime());
                    tmaCount++;
                }
            });

            const fcr = totalTickets > 0 ? (resolvedCount / totalTickets) * 100 : 0;
            const tmaAvg = tmaCount > 0 ? (tmaSum / tmaCount) : 0;
            const tmaMinutes = tmaAvg / 60000;
            const npsAvg = csatCount > 0 ? (csatSum / csatCount) : 0;

            const topReasons = Object.entries(reasonsCount)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3);
                
            const aiLogs = await db.collection("ai_token_logs")
                .where("tenantId", "==", tenantId)
                .where("createdAt", ">=", startObj)
                .where("createdAt", "<=", endObj)
                .get();
            let totalCost = 0;
            aiLogs.forEach(lg => {
                totalCost += (lg.data().estimatedCostUsd || 0);
            });
            
            const docPdf = new jsPDF();
            
            // Try to fetch company settings for this tenant (or default)
            let logoUrl = null;
            try {
               let compSnap = await db.collection("tenants").doc(tenantId).collection("settings").doc("company").get();
               if (!compSnap.exists) {
                   compSnap = await db.collection("settings").doc("company").get();
               }
               if (compSnap.exists) {
                   logoUrl = compSnap.data()?.logoUrl;
               }
            } catch (e) {
               console.error("Error fetching company settings for logo:", e);
            }

            let startY = 40;
            if (logoUrl && logoUrl.startsWith("data:image")) {
               try {
                  // Assuming base64 data url from crop/upload in SettingsPage
                  const format = logoUrl.split(';')[0].split('/')[1].toUpperCase(); 
                  docPdf.addImage(logoUrl, format, 14, 10, 20, 20);
                  docPdf.setFontSize(22);
                  docPdf.text(`Relatório Diário - ${tData.name}`, 38, 20);
                  docPdf.setFontSize(14);
                  docPdf.text(`Data: ${dateStr}`, 38, 30);
                  startY = 40;
               } catch (e) {
                  docPdf.setFontSize(22);
                  docPdf.text(`Relatório Diário - ${tData.name}`, 14, 20);
                  docPdf.setFontSize(14);
                  docPdf.text(`Data: ${dateStr}`, 14, 30);
               }
            } else {
                docPdf.setFontSize(22);
                docPdf.text(`Relatório Diário - ${tData.name}`, 14, 20);
                docPdf.setFontSize(14);
                docPdf.text(`Data: ${dateStr}`, 14, 30);
            }
            
            autoTable(docPdf, {
                startY: startY,
                head: [['Métrica', 'Valor']],
                body: [
                    ['Total de Atendimentos', totalTickets.toString()],
                    ['FCR (First Contact Resolution)', `${fcr.toFixed(1)}%`],
                    ['TMA (Tempo Médio de Atendimento)', `${tmaMinutes.toFixed(1)} min`],
                    ['NPS Médio (CSAT)', `${npsAvg.toFixed(1)} / 5.0`],
                    ['Custo de IA (USD)', `$${totalCost.toFixed(4)}`]
                ]
            });

            autoTable(docPdf, {
                startY: (docPdf as any).lastAutoTable.finalY + 10,
                head: [['Top 3 Motivos de Chamado', 'Qtd']],
                body: topReasons.map(r => [r[0], r[1].toString()])
            });

            const pdfBuffer = docPdf.output('arraybuffer');
            const base64Str = Buffer.from(pdfBuffer).toString('base64');

            for (const email of recipients) {
                await sendEmail(email, `Relatório Diário - ${tData.name} - ${dateStr}`, "Segue em anexo o relatório diário das métricas de atendimento.", [
                    {
                        filename: `relatorio_${dateStr.replace(/\//g,'-')}.pdf`,
                        content: base64Str,
                        encoding: 'base64'
                    }
                ]);
            }
            console.log(`[Report Worker] Generated and sent daily report for tenant ${tenantId}`);
        }
    } catch (e) {
        console.error("[Report Worker] Error generating reports:", e);
    }
  }
}, { connection: redis as any, concurrency: 1 });

if (!isMockRedis) {
   reportQueue.upsertJobScheduler?.(
      'daily-report-job',
      { pattern: '0 23 * * *', tz: 'America/Sao_Paulo' },
      { name: 'generate_daily_report', data: {} }
   ).catch((e: any) => console.error("Error scheduling daily report job", e));
}
