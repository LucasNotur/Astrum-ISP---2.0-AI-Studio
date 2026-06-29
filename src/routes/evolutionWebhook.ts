import express from "express";
import { enqueueMessage } from "../lib/queue.ts";
import { adminDb as db } from "../lib/firebaseAdmin.ts";

export const evolutionWebhookRouter = express.Router();

evolutionWebhookRouter.post("/", async (req, res) => {
  try {
    const { validateWebhookSignature } = await import('../../apps/api/src/infrastructure/security/hmac.service.ts');
    const signature = (req.headers['x-hub-signature-256'] || req.headers['x-evolution-signature']) as string ?? '';
    const rawBody = JSON.stringify(req.body);
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
    let tenantQuery = await db.collection("tenants")
      .where("evolutionInstance", "==", instanceName)
      .limit(1)
      .get();

    if (!tenantQuery.empty) {
      tenantId = tenantQuery.docs[0].id;
    } else {
      tenantQuery = await db.collection("tenants")
        .where("evolution_instances", "array-contains", instanceName)
        .limit(1)
        .get();
      if (!tenantQuery.empty) {
        tenantId = tenantQuery.docs[0].id;
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

      // Add to queue
      await enqueueMessage(tenantId, {
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
    } else if (payload.event === "connection.update") {
      const state = payload.data?.state || payload.data?.status;
      if (tenantId !== "local_tenant") {
        await db.collection("tenants").doc(tenantId).collection("integration_keys").doc("default").set({
          whatsappStatus: state
        }, { merge: true });
        
        await db.collection("logs").add({
          type: "whatsapp_connection",
          tenant_id: tenantId,
          timestamp: new Date().toISOString(),
          status: state,
          instance: instanceName
        });
      }
    }

    return res.status(200).json({ ok: true, received: true });
  } catch(error) {
    console.error("Webhook processing error:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});
