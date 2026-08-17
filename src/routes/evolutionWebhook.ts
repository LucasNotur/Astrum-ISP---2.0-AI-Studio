import express from "express";
import { enqueueMessage } from "../lib/queue.ts";
import { adminDb as db } from "../lib/firebaseAdmin.ts";
import { handleConnectionUpdate } from "./evolutionConnection.ts";

export const evolutionWebhookRouter = express.Router();

evolutionWebhookRouter.post("/", async (req, res) => {
  try {
    const { validateWebhookSignature } = await import('../../apps/api/src/infrastructure/security/hmac.service.ts');
    const signature = (req.headers['x-hub-signature-256'] || req.headers['x-evolution-signature']) as string ?? '';
    // APPSEC-05: HMAC sobre os BYTES CRUS (req.rawBody), não o body re-serializado.
    const rawBody: Buffer = (req as any).rawBody instanceof Buffer
      ? (req as any).rawBody
      : Buffer.from(JSON.stringify(req.body));
    const isValid = validateWebhookSignature(rawBody, signature, 'evolution');

    if (!isValid) {
      return res.status(401).json({ error: 'Assinatura inválida' });
    }

    const payload = req.body;
    
    // Look for tenant by Evolution instance name.
    const instanceName = payload?.instance;
    if (!instanceName) {
      return res.status(400).json({ error: "Missing instance name" });
    }

    let tenantId;
    let tenantDoc: any;
    let tenantQuery = await db.collection("tenants")
      .where("evolutionInstance", "==", instanceName)
      .limit(1)
      .get();

    if (!tenantQuery.empty) {
      tenantId = tenantQuery.docs[0].id;
      tenantDoc = tenantQuery.docs[0].data();
    } else {
      tenantQuery = await db.collection("tenants")
        .where("evolution_instances", "array-contains", instanceName)
        .limit(1)
        .get();
      if (!tenantQuery.empty) {
        tenantId = tenantQuery.docs[0].id;
        tenantDoc = tenantQuery.docs[0].data();
      } else {
        console.warn(`[SECURITY] Webhook rejeitado: instance '${instanceName}' não mapeada a nenhum tenant`);
        return res.status(403).json({ error: "Unknown instance" });
      }
    }

    if (payload.event === "messages.upsert") {
      const messageData = payload.data?.message;
      const key = payload.data?.key;
      const remoteJid = key?.remoteJid;

      if (!remoteJid || key?.fromMe) {
        return res.status(200).json({ status: "ignored" });
      }

      let textMessage = "";
      let isAudio = false;
      let audioUrl = "";
      let base64Media = "";
      let mediaMimeType = "";
      let isImage = false;
      let isDocument = false;

      if (messageData?.conversation) {
        textMessage = messageData.conversation;
      } else if (messageData?.extendedTextMessage?.text) {
        textMessage = messageData.extendedTextMessage.text;
      } else if (messageData?.audioMessage) {
        isAudio = true;
        audioUrl = messageData.audioMessage.url || "";
        mediaMimeType = messageData.audioMessage.mimetype || "";
      } else if (messageData?.imageMessage) {
        isImage = true;
        textMessage = messageData.imageMessage.caption || "";
        mediaMimeType = messageData.imageMessage.mimetype || "";
      } else if (messageData?.documentMessage) {
        isDocument = true;
        textMessage = messageData.documentMessage.caption || messageData.documentMessage.fileName || "";
        mediaMimeType = messageData.documentMessage.mimetype || "";
      }

      if (payload.data?.message?.base64) {
         base64Media = payload.data.message.base64;
      }

      const enqueueLegacy = () => enqueueMessage(tenantId, {
        remoteJid,
        textMessage,
        messageData: payload.data,
        payload,
        tenantId,
        isAudio,
        audioUrl,
        isImage,
        isDocument,
        base64Media,
        mediaMimeType,
        messageId: key.id
      });

      // S74 — cutover/shadow do atendimento (exceção autorizada a R4). Respeita o
      // canário por tenant (tenants.atendimento_engine): um ISP pode estar em 'v2'
      // enquanto os demais seguem 'legacy', ou vice-versa (rollback fino).
      {
        const [{ generateWebhookSignature }, { resolveEvolutionWebhookMode }] = await Promise.all([
          import('../../apps/api/src/infrastructure/security/hmac.service.ts'),
          import('../../apps/api/src/infrastructure/config/engine-flags.ts'),
        ]);
        const mode = resolveEvolutionWebhookMode(tenantDoc?.atendimentoEngine ?? null);
        const v2Url = (process.env.FASTIFY_INTERNAL_URL ?? 'http://localhost:3001') + '/api/v2/webhook/evolution';

        if (mode === 'proxy_to_v2') {
          // Cutover real: o legado NÃO processa — repassa (sem x-shadow) pro v2
          // processar e enviar de verdade. Se o v2 estiver fora do ar, cai pro
          // legado como fallback (nunca perde a mensagem do cliente).
          try {
            const sig = generateWebhookSignature(rawBody, 'evolution');
            const resp = await fetch(v2Url, {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig },
              body: rawBody.toString('utf8'),
            });
            if (!resp.ok) throw new Error(`v2 respondeu ${resp.status}`);
          } catch (err: any) {
            console.error('[cutover] proxy pro v2 falhou — processando via legado (fallback):', err?.message);
            await enqueueLegacy();
          }
        } else {
          // Legado processa normalmente + espelha uma cópia pro v2 (shadow, sem
          // enviar). Fire-and-forget: falha no espelhamento nunca impacta o
          // atendimento real.
          await enqueueLegacy();
          const shadowSig = generateWebhookSignature(rawBody, 'evolution');
          fetch(v2Url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-shadow': 'true', 'x-hub-signature-256': shadowSig },
            body: rawBody.toString('utf8'),
          }).catch((err: unknown) => console.warn('[shadow] falha ao espelhar para v2:', (err as Error).message));
        }
      }
    } else if (payload.event === "connection.update") {
      const state = payload.data?.state || payload.data?.status;
      if (tenantId !== "local_tenant") {
        // OBS-11: só persiste quando o estado MUDA (Evolution reenvia o mesmo 'open').
        const keyRef = db.collection("tenants").doc(tenantId).collection("integration_keys").doc("default");
        await handleConnectionUpdate(
          {
            getPrevStatus: async () => {
              const snap = await keyRef.get();
              return snap.exists ? (snap.data() as any)?.whatsappStatus : undefined;
            },
            setStatus: async (s) => { await keyRef.set({ whatsappStatus: s }, { merge: true }); },
            appendLog: async (s) => {
              await db.collection("logs").add({
                type: "whatsapp_connection",
                tenant_id: tenantId,
                timestamp: new Date().toISOString(),
                status: s,
                instance: instanceName,
              });
            },
          },
          state,
        );
      }
    }

    return res.status(200).json({ ok: true, received: true });
  } catch(error) {
    console.error("Webhook processing error:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});
