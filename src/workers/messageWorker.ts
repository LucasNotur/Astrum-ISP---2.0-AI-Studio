import { Worker, Job } from "bullmq";
import redis from "../lib/redis";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import path from "path";
import OpenAI from "openai";
import { adminDb as db } from "../lib/firebaseAdmin";
import admin from "../lib/firebaseAdmin";
import { getIntegrationKeys, decryptCpf, incrementShardedCounter } from "../lib/dbAdmin";
import { getAIResponse } from "../lib/gemini.server";
import { sanitizeUserInput } from "../lib/guardrails";
import { logSecurityEvent } from "../lib/audit";
import { deadLetterQueue, setupDLQ } from "../lib/queue";
import { logger } from "../lib/logger";

import { checkBanSignal } from '../lib/rateLimiter.ts';

const processingNumbers = new Map<string, Promise<void>>();

const isMockRedis = !((redis as any).options);

async function safeEvoFetch(url: string, options: any, tenantId: string, instanceId: string) {
  if (redis) {
    const isPaused = await redis.get(`pause_jobs:${instanceId}`);
    if (isPaused) {
      logger.warn('jobs_paused_due_to_ban_risk', { tenant_id: tenantId, data: { instanceId } });
      throw new Error("Instance paused due to ban risk");
    }
    const isBroken = await redis.get(`circuit_breaker:${instanceId}`);
    if (isBroken) {
      throw new Error("Evolution API Connection Temporarily Unavailable (Circuit Breaker Open)");
    }
  }

  let attempt = 0;
  const maxAttempts = 3;
  let lastError: Error | null = null;
  let res: Response | null = null;

  while (attempt < maxAttempts) {
    try {
      res = await fetch(url, options);
      if (res.ok) {
         break;
      } else if (res.status === 429 || res.status >= 500) {
         // Retryable
      } else {
         break; // Non-retryable
      }
    } catch (e: any) {
      lastError = e;
    }
    
    // Backoff
    attempt++;
    if (attempt < maxAttempts) {
      const waitTime = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, waitTime));
    }
  }

  if (!res) {
    // Falha total, talvez abrir circuit breaker
    if (redis) {
       await redis.set(`circuit_breaker:${instanceId}`, "1", "EX", 60); // 1 minuto
    }
    throw lastError || new Error("Failed to fetch Evolution API");
  }

  await checkBanSignal(res, tenantId, instanceId);
  return res;
}

async function sendTyping(remoteJid: string, url: string, instance: string, key: string, tenantId: string = '') {
  try {
    await safeEvoFetch(`${url}/chat/sendPresence/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({ number: remoteJid, options: { presence: "composing", delay: 1500 } }),
    }, tenantId, instance);
  } catch {
    // Falha silenciosa
  }
}

async function sendChunked(text: string, remoteJid: string, url: string, instance: string, key: string, tenantId: string = '') {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  for (const s of sentences) {
    if ((current + s).length > 300 && current.length > 0) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  const evoMsgIds: string[] = [];
  for (const chunk of chunks) {
    await sendTyping(remoteJid, url, instance, key, tenantId);
    await new Promise((r) => setTimeout(r, 800));
    const res = await safeEvoFetch(`${url}/message/sendText/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({ number: remoteJid, text: chunk }),
    }, tenantId, instance);
    try {
      const data = await res.json();
      if (data?.key?.id) evoMsgIds.push(data.key.id);
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 800));
  }
  return evoMsgIds;
}

export const processMessageJob = async (job: any) => {
    if (job.name === 'pos_instalacao') {
      const { customerId, tenantId, osId, installedPlan } = job.data;
      
      const last24h = new Date(Date.now() - 86400000);
      const { Timestamp } = await import("firebase-admin/firestore");
      
      const recentSupport = await db.collection('tickets')
        .where('customerId', '==', customerId)
        .get();

      const hasRecentTicket = recentSupport.docs.some(d => {
         const createdAt = d.data().createdAt?.toDate ? d.data().createdAt.toDate() : new Date();
         return createdAt >= last24h;
      });
      
      const templateName = hasRecentTicket ? 'pos_instalacao_com_problema' : 'pos_instalacao_ok';
      
      const customerSnap = await db.collection("customers").doc(customerId).get();
      if (customerSnap.exists) {
        const customer = customerSnap.data() as any;
        if (customer.phone) {
          const keys = await getIntegrationKeys();
          const evoUrl = keys.evolutionUrl?.replace(/\/+$/, "");
          const evoInstance = keys.evolutionInstance;
          const evoApiKey = keys.evolutionApiKey;
          
          const remoteJid = `${String(customer.phone).replace(/\D/g, "")}@s.whatsapp.net`;
          
          let textToSend = hasRecentTicket 
            ? `Oi ${customer.name.split(' ')[0]}! Vi que você entrou em contato com a gente hoje. Sua internet está bem agora? Pode me contar como está o sinal?`
            : `Oi ${customer.name.split(' ')[0]}! Sua internet ${installedPlan} foi instalada ontem. Está funcionando bem? Faça um teste: https://speedtest.net 🚀`;

          if (evoUrl && evoInstance && evoApiKey) {
            await safeEvoFetch(`${evoUrl}/message/sendText/${evoInstance}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evoApiKey },
              body: JSON.stringify({ number: remoteJid, text: textToSend }),
            }, tenantId, evoInstance);
            
            await db.collection("service_orders").doc(osId).update({
              pos_instalacao_sent: true,
              pos_instalacao_sent_at: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        }
      }
      return;
    }

    if (job.name === 'sla_warning') {
      const { ticketId, level, tenantId, customerId } = job.data;
      
      const ticketSnap = await db.collection('tickets').doc(ticketId).get();
      if (!ticketSnap.exists) return;
      const tData = ticketSnap.data() as any;
      
      // Verificar se humano já respondeu — se sim, cancelar
      if (tData.human_responded) return;
      if (tData.status === 'resolved' || tData.status === 'closed') return;

      const customerSnap = await db.collection("customers").doc(customerId).get();
      if (customerSnap.exists) {
        const customer = customerSnap.data() as any;
        if (customer.phone) {
          const keys = await getIntegrationKeys();
          const evoUrl = keys.evolutionUrl?.replace(/\/+$/, "");
          const evoInstance = keys.evolutionInstance;
          const evoApiKey = keys.evolutionApiKey;
          const remoteJid = `${String(customer.phone).replace(/\D/g, "")}@s.whatsapp.net`;
          
          let textToSend = "";
          if (level === 1) {
            textToSend = "Ainda estou verificando sua solicitação com nossa equipe. Em breve um atendente chega! 🙏";
          } else if (level === 2) {
            textToSend = "Pedimos desculpas pela espera. Estou escalando para um supervisor agora. Você será atendido em instantes.";
            // Notificar gerente
            await db.collection("notifications").add({
              title: "ALERTA DE SLA",
              message: `Ticket ${ticketId} sem resposta humana há 15 minutos!`,
              type: "sla_breach",
              ticketId,
              tenantId,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              read: false
            });
          }

          if (textToSend && evoUrl && evoInstance && evoApiKey) {
            await safeEvoFetch(`${evoUrl}/message/sendText/${evoInstance}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evoApiKey },
              body: JSON.stringify({ number: remoteJid, text: textToSend }),
            }, tenantId, evoInstance);
            await db.collection(`tickets/${ticketId}/messages`).add({
              ticketId,
              senderType: "ai",
              text: textToSend,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }
      }
      return;
    }

    if (job.name === 'send_whatsapp_text') {
      const { text, phone, tenantId } = job.data;
      if (phone && text) {
        const keys = await getIntegrationKeys();
        const evoUrl = keys.evolutionUrl?.replace(/\/+$/, "");
        const evoInstance = keys.evolutionInstance;
        const evoApiKey = keys.evolutionApiKey;
        const remoteJid = `${String(phone).replace(/\D/g, "")}@s.whatsapp.net`;
        
        if (evoUrl && evoApiKey && evoInstance) {
          await safeEvoFetch(`${evoUrl}/message/sendText/${evoInstance}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evoApiKey },
              body: JSON.stringify({ number: remoteJid, text }),
          }, tenantId, evoInstance);
        }
      }
      return;
    }

    if (job.name === 'send_csat') {
      const { ticketId, customerId, tenantId, category, resolved_by } = job.data;
      
      const customerSnap = await db.collection("customers").doc(customerId).get();
      if (customerSnap.exists) {
        const cData = customerSnap.data() as any;

        // Enviar CSAT
        const keys = await getIntegrationKeys();
        const evoUrl = keys.evolutionUrl?.replace(/\/+$/, "");
        const evoInstance = keys.evolutionInstance;
        const evoApiKey = keys.evolutionApiKey;
        const remotePhone = `${(cData.phone || "").replace(/\D/g, "")}@s.whatsapp.net`;
        
        const csatText = `De 1 a 5, como você avalia o atendimento? Responda apenas com o número.`;

        if (evoUrl && evoApiKey && evoInstance) {
          await safeEvoFetch(`${evoUrl}/message/sendText/${evoInstance}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evoApiKey },
              body: JSON.stringify({ number: remotePhone, text: csatText }),
            }, tenantId, evoInstance);
          
          await db.collection("tickets").doc(ticketId).update({
            "session_state.awaiting_csat": true,
            "session_state.csat_resolved_by": resolved_by,
            "session_state.csat_category": category,
            "csat_requested_at": admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
      return;
    }

    let { remoteJid, textMessage, messageData, payload, bufferKey, tenantId, isAudio, audioUrl, ticketId, traceId, messageId, enriched_instance_id, enriched_instance_data } = job.data;
    const workerStartTime = Date.now();

    const logCtx = {
      trace_id: traceId,
      tenant_id: tenantId,
      session_id: ticketId,
      phone_last4: remoteJid?.slice(-4)
    };

    if (!tenantId) {
      throw new Error('TENANT_ID_MISSING');
    }
    
    if (messageId && redis) {
      const isRevoked = await redis.exists(`revoked:${messageId}`);
      if (isRevoked) {
        logger.info('message_revoked_skip', { ...logCtx, data: { messageId } });
        return;
      }
    }

    if (redis) {
      const isDegraded = await redis.get('system_degraded');
      if (isDegraded) {
        const keys = await getIntegrationKeys();
        const evoUrl = keys.evolutionUrl?.replace(/\/+$/, "");
        const evoInstance = keys.evolutionInstance;
        const evoApiKey = keys.evolutionApiKey;
        if (evoUrl && evoInstance && evoApiKey && remoteJid) {
           await safeEvoFetch(`${evoUrl}/message/sendText/${evoInstance}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evoApiKey },
              body: JSON.stringify({ number: remoteJid, text: "Estamos com uma instabilidade técnica no momento. Nosso sistema voltará em instantes. Pedimos desculpas! 🙏" }),
            }, tenantId, evoInstance);
        }
        const { enqueueMessage } = await import("../lib/queue");
        await enqueueMessage(tenantId, job.data, { delay: 120000 });
        return;
      }
    }

    await incrementShardedCounter('messages_today', tenantId);
    
    if (isAudio && audioUrl) {
      const { downloadAndTranscribeAudio } = await import("../lib/transcription.ts");
      const result = await downloadAndTranscribeAudio(audioUrl, tenantId);
      if (result && result.text) {
        textMessage = `[Mensagem de voz transcrita]: ${result.text}`;
        logger.info('whisper_transcribed', { ...logCtx, data: { partial: result.text.substring(0, 100) } });
      } else {
        textMessage = '[Cliente tentou enviar um áudio, mas falhou. Peça para ele reenviar em texto.]';
        logger.error('whisper_failed', { ...logCtx, error: result?.error });
      }
    }

    let imageMessageObj = messageData?.imageMessage ? messageData : null;
    
    // Se estiver usando o agregador por buffer:
    if (bufferKey) {
      const redisModule = await import("../lib/redis");
      const r = redisModule.default;
      const bufferStr = await r.get(bufferKey);
      if (bufferStr) {
        const buffer = JSON.parse(bufferStr);
        if (buffer && buffer.length > 0) {
          textMessage = buffer.map((msg: any) => msg.text).filter(Boolean).join("\n");
          // Pegamos os detalhes da ultima mensagem do buffer
          const lastMsg = buffer[buffer.length - 1];
          messageData = lastMsg.messageData;
          payload = lastMsg.payload;
          
          for (const msg of buffer) {
             if (msg.messageData && msg.messageData.imageMessage) {
                 imageMessageObj = msg.messageData;
             }
          }
        }
        await r.del(bufferKey);
      }
      
      // Se não houver nada no buffer, ignora o processamento
      if (!textMessage && !messageData && !payload) {
        return;
      }
    }

    logger.info('worker_started', logCtx);

    if (!remoteJid) {
      logger.warn("missing_remote_jid", { ...logCtx, data: { message: "Missing remoteJid in message data. Skipping." } });
      return;
    }

    const lockKey = `processing_lock:${tenantId}:${remoteJid}`;
    const redisModuleLock = await import("../lib/redis");
    const redisLockClient = redisModuleLock.default;
    const lock = await redisLockClient.set(lockKey, '1', 'EX', 30, 'NX');
    if (!lock) {
      // Outro processamento em andamento para este número
      // Re-enfileirar com delay de 2s
      const { enqueueMessage } = await import("../lib/queue");
      await enqueueMessage(tenantId, job.data, { delay: 2000 });
      return;
    }
    const phoneOnlyLock = remoteJid
      .replace("@s.whatsapp.net", "")
      .replace(/\D/g, "");
    while (processingNumbers.has(phoneOnlyLock)) {
      await processingNumbers.get(phoneOnlyLock);
    }

    let resolveLock: () => void;
    processingNumbers.set(phoneOnlyLock, new Promise((r) => (resolveLock = r)));

    try {
      const isInstagramEvent = payload?.source === 'instagram' || job.data?.source === 'instagram';
      const isFacebookEvent = payload?.source === 'facebook' || job.data?.source === 'facebook';
      const isWebchatEvent = payload?.source === 'webchat' || job.data?.source === 'webchat';
      
      const keys = await getIntegrationKeys();
      const evoUrl = keys.evolutionUrl?.replace(/\/+$/, "");
      const evoInstance = keys.evolutionInstance;
      const evoApiKey = keys.evolutionApiKey;
      const supportRelayNumber = keys.whiteLabelSupportNumber;

      if (!isInstagramEvent && !isFacebookEvent && !isWebchatEvent && (!evoUrl || !evoInstance || !evoApiKey)) {
        throw new Error(
          "Evolution API não configurada no painel de Integrações.",
        );
      }

      // MELHORIA A — Typing indicator
      if (!isInstagramEvent && !isFacebookEvent && !isWebchatEvent && evoUrl && evoInstance && evoApiKey) {
        await sendTyping(remoteJid, evoUrl, evoInstance, evoApiKey);
      }

      const hasAudioObj = !!messageData?.audioMessage;
      let processedTextMessage = textMessage;

      let imageAnalysis = "";
      if (imageMessageObj && !isInstagramEvent && !isFacebookEvent && !isWebchatEvent) {
          try {
             logger.info('image_message_detected', logCtx);
             const base64Res = await safeEvoFetch(`${evoUrl}/chat/getBase64FromMediaMessage/${evoInstance}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: evoApiKey },
                body: JSON.stringify({ message: imageMessageObj })
             }, tenantId, evoInstance);
             
             const base64Data = await base64Res.json();
             if (base64Data && base64Data.base64) {
                 const { aiProvider } = await import("../ai-provider/ai-provider.setup");
                 const analysisRes = await aiProvider.chat("fallback", [
                     { role: 'system', content: 'Você é técnico de telecom. Analise este equipamento: tipo, LEDs (verde/vermelho/apagado), luzes PON/LOS, problemas visíveis. Seja objetivo e conciso. Retorne apenas a análise.' },
                     { role: 'user', content: 'Analise esta imagem.', parts: [{ inlineData: { mimeType: imageMessageObj.imageMessage.mimetype || 'image/jpeg', data: base64Data.base64 } }] }
                 ], tenantId);
                 
                 if (analysisRes && analysisRes.content) {
                     imageAnalysis = `[Análise Automática da Imagem Enviada]: ${analysisRes.content}`;
                     processedTextMessage = processedTextMessage ? `${processedTextMessage}\n\n${imageAnalysis}` : imageAnalysis;
                 }
             }
          } catch(e: any) {
              logger.error("error_processing_image", { ...logCtx, error: e?.message });
          }
      }

      // --- PASSO 0: Lógica de Intermédio (Relay White-label) ---
      if (supportRelayNumber && remoteJid.includes(supportRelayNumber)) {
        logger.info("relay_received", logCtx);
        const ticketMatch = processedTextMessage.match(
          /Ticket #([a-zA-Z0-9_-]+):/,
        );
        let targetTicketId = ticketMatch ? ticketMatch[1] : null;

        if (!targetTicketId) {
          const lastEscalated = await db.collection("tickets")
            .where("status", "==", "escalated")
            .orderBy("createdAt", "desc")
            .limit(1)
            .get();
          if (!lastEscalated.empty) targetTicketId = lastEscalated.docs[0].id;
        }

        if (targetTicketId) {
          const tDoc = await db.collection("tickets").where("__name__", "==", targetTicketId).get();
          if (!tDoc.empty) {
            const ticketData = tDoc.docs[0].data();
            const customerId = ticketData.customerId;
            const cDoc = await db.collection("customers").where("__name__", "==", customerId).get();

            if (!cDoc.empty) {
              const customerPhone = cDoc.docs[0].data().phone;
              const cleanMsg = processedTextMessage.replace(
                /Ticket #[a-zA-Z0-9_-]+:\s*/,
                "",
              );

              logger.info("relay_sent_client", { ...logCtx, phone_last4: customerPhone?.slice(-4) });

              await db.collection(`tickets/${targetTicketId}/messages`).add({
                ticketId: targetTicketId,
                senderType: "human",
                text: cleanMsg,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              });

              await safeEvoFetch(`${evoUrl}/message/sendText/${evoInstance}`, {
              method: "POST",
              headers: {
                  "Content-Type": "application/json",
                  apikey: evoApiKey,
                },
              body: JSON.stringify({
                  number: `${customerPhone}@s.whatsapp.net`,
                  text: cleanMsg,
                }),
            }, tenantId, evoInstance);
              return;
            }
          }
        }
        logger.warn('relay_failed_unidentified', logCtx);
        return;
      }



      // 2. Handle locationMessage via Nominatim reverse geocoding
      if (messageData.locationMessage) {
        const { degreesLatitude, degreesLongitude } = messageData.locationMessage;
        if (degreesLatitude && degreesLongitude) {
          try {
            logger.info('location_detected', { ...logCtx, data: { lat: degreesLatitude, lon: degreesLongitude } });
            const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?lat=${degreesLatitude}&lon=${degreesLongitude}&format=json`;
            const nominatimRes = await fetch(nominatimUrl, {
              headers: { 'User-Agent': 'AstrumApp/1.0 (contact: noturcursos1@gmail.com)' }
            });
            const locationData = await nominatimRes.json();
            const cep = locationData?.address?.postcode;
            if (cep) {
              const formattedCep = cep.replace(/[^0-9]/g, '');
              processedTextMessage = `[Localização enviada via WhatsApp] O CEP detectado é: ${formattedCep}`;
              if (!payload) payload = {};
              payload.location_cep_detected = formattedCep;
              payload.location_lat = degreesLatitude;
              payload.location_lng = degreesLongitude;
            } else {
               processedTextMessage = `[Localização enviada via WhatsApp] Endereço aproximado: ${locationData?.display_name || 'Desconhecido'}`;
               if (!payload) payload = {};
               payload.location_lat = degreesLatitude;
               payload.location_lng = degreesLongitude;
            }
          } catch (locErr: any) {
             logger.error("error_geocoding", { ...logCtx, error: locErr.message });
             processedTextMessage = `[Localização enviada. Latitude: ${degreesLatitude}, Longitude: ${degreesLongitude}]`;
             if (!payload) payload = {};
             payload.location_lat = degreesLatitude;
             payload.location_lng = degreesLongitude;
          }
        }
      }

      // Language translate step (LibreTranslate)
      if (processedTextMessage && processedTextMessage.length > 2 && !hasAudioObj) {
         try {
           const detectReq = await fetch("http://libretranslate:5000/detect", {
               method: "POST",
               body: JSON.stringify({ q: processedTextMessage }),
               headers: { "Content-Type": "application/json"}
           });
           if (detectReq.ok) {
               const detectData = await detectReq.json();
               if (detectData && detectData.length > 0 && detectData[0].language !== "pt") {
                   const trReq = await fetch("http://libretranslate:5000/translate", {
                       method: "POST",
                       body: JSON.stringify({ q: processedTextMessage, source: detectData[0].language, target: "pt" }),
                       headers: { "Content-Type": "application/json"}
                   });
                   if (trReq.ok) {
                       const trData = await trReq.json();
                       if (trData && trData.translatedText) {
                           logger.info("translation_applied", { ...logCtx, original: processedTextMessage });
                           processedTextMessage = trData.translatedText;
                       }
                   }
               }
           }
         } catch(e) {
           // Fallback/Ignore if LibreTranslate is not running
           logger.debug("libretranslate_not_available", logCtx);
         }
      }

      if (!processedTextMessage) {
        logger.info("skipped_unsupported_media", logCtx);
        return;
      }

      const phoneOnly = remoteJid
        .replace("@s.whatsapp.net", "")
        .replace(/\D/g, "");
      const { safeFirestoreGet } = await import("../lib/dbSafe");
      const { data: custSnap, degraded: custDegraded } = await safeFirestoreGet(
        () => db.collection("customers").get(),
        { docs: [] as any[] } as any,
        'customer_lookup'
      );
      if (custDegraded) {
        logger.warn('degraded_customer_lookup', logCtx);
        const { enqueueMessage } = await import("../lib/queue");
        await enqueueMessage(tenantId, job.data, { delay: 120000 });
        return; // Retentativa
      }
      
      const pushName =
        payload.data?.pushName ||
        payload.pushName ||
        `Lead ${remoteJid.replace(/\D/g, "").slice(-4)}`;

      let customerId: string;
      let callerContext = "";

      let cDoc = custSnap.docs.find((d: any) => {
        const p = (d.data().phone || "").replace(/\D/g, "");
        const ig = d.data().instagram_igsid;
        const fb = d.data().facebook_psid;
        const ident = d.data().cpf_cnpj || d.data().identifier;

        if (isInstagramEvent) {
          return ig === phoneOnly || p === phoneOnly;
        }
        if (isFacebookEvent) {
          return fb === phoneOnly || p === phoneOnly;
        }
        if (isWebchatEvent) {
          return ident === phoneOnly || p === phoneOnly || d.data().webchat_id === phoneOnly;
        }

        return (
          p &&
          phoneOnly &&
          (p === phoneOnly ||
            p.endsWith(phoneOnly.slice(-8)) ||
            phoneOnly.endsWith(p.slice(-8)))
        );
      });

      if (cDoc) {
        customerId = cDoc.id;
        const updates: any = {};
        if (isInstagramEvent && cDoc.data().instagram_igsid !== phoneOnly) {
           updates.instagram_igsid = phoneOnly;
        }
        if (isFacebookEvent && cDoc.data().facebook_psid !== phoneOnly) {
           updates.facebook_psid = phoneOnly;
        }
        if (isWebchatEvent && cDoc.data().webchat_id !== phoneOnly) {
           updates.webchat_id = phoneOnly;
        }
        
        if (!cDoc.data().avatar) {
          try {
            let profilePicUrl = null;
            if (!isInstagramEvent && !isFacebookEvent && !isWebchatEvent) {
              const picRes = await safeEvoFetch(
                `${evoUrl}/chat/fetchProfilePictureUrl/${evoInstance}`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    apikey: evoApiKey,
                  },
                  body: JSON.stringify({ number: remoteJid }),
                }, tenantId, evoInstance
              );
              const picData = await picRes.json();
              if (picData?.profilePictureUrl)
                profilePicUrl = picData.profilePictureUrl;
              else if (picData?.pictureUrl) profilePicUrl = picData.pictureUrl;
            }

            if (profilePicUrl) {
              updates.avatar = profilePicUrl;
            }
          } catch (e) {}
        }

        if (Object.keys(updates).length > 0) {
           await db.collection("customers").doc(customerId).update(updates);
        }
      } else {
        let profilePicUrl = null;
        try {
          if (!isInstagramEvent && !isFacebookEvent && !isWebchatEvent) {
            const picRes = await safeEvoFetch(
              `${evoUrl}/chat/fetchProfilePictureUrl/${evoInstance}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  apikey: evoApiKey,
                },
                body: JSON.stringify({ number: remoteJid }),
              }, tenantId, evoInstance
            );
            const picData = await picRes.json();
            if (picData?.profilePictureUrl)
              profilePicUrl = picData.profilePictureUrl;
            else if (picData?.pictureUrl) profilePicUrl = picData.pictureUrl;
          }
        } catch (e) {}

        const newCustParams: any = {
          name: pushName,
          phone: phoneOnly,
          email: "",
          plan: "Prospecto",
          mrr: 0,
          status: "lead",
          avatar: profilePicUrl,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (isInstagramEvent) newCustParams.instagram_igsid = phoneOnly;
        if (isFacebookEvent) newCustParams.facebook_psid = phoneOnly;
        if (isWebchatEvent) newCustParams.webchat_id = phoneOnly;

        const newCust = await db.collection("customers").add(newCustParams);
        customerId = newCust.id;
      }

      let cDataForContext = cDoc
        ? cDoc.data()
        : { name: pushName, plan: "Prospecto", status: "lead" };
      callerContext = `\n[CONTEXTO DO SISTEMA: O cliente se chama ${cDataForContext.name}, Plano: ${cDataForContext.plan}, Status de Assinatura: ${cDataForContext.status === "active" ? "Ativo" : cDataForContext.status === "lead" ? "Novo Contato/Prospecto - NÃO é cliente ainda" : cDataForContext.status}.]`;

      // CSAT Check
      if (processedTextMessage && /^[1-5]$/.test(processedTextMessage.trim())) {

        const csatCheckQ = db.collection("tickets")
          .where("customerId", "==", customerId)
          .orderBy("createdAt", "desc")
          .limit(1);
        const csatSnap = await csatCheckQ.get();
        if (!csatSnap.empty) {
          const lastTicketDoc = csatSnap.docs[0];
          const lastTicketData = lastTicketDoc.data() as any;
          if (lastTicketData.session_state?.awaiting_csat || lastTicketData.csat_requested_at) {
            const score = parseInt(processedTextMessage.trim());
            const tenantIdCheck = lastTicketData.tenantId;
            if (!tenantIdCheck) throw new Error('TENANT_ID_MISSING');
            const tenantId = tenantIdCheck;

            await db.collection('csat_ratings').add({
              ticketId: lastTicketDoc.id,
              customerId: customerId,
              tenantId: tenantId,
              score,
              resolved_by: lastTicketData.session_state?.csat_resolved_by || 'unknown',
              category: lastTicketData.session_state?.csat_category || 'unknown',
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            await db.collection('customers').doc(customerId).update({
              'last_csat_score': score,
              'last_csat_at': admin.firestore.FieldValue.serverTimestamp()
            });

            await db.collection("tickets").doc(lastTicketDoc.id).update({
              "session_state.awaiting_csat": false,
              csat_answered: true,
              status: "closed"
            });

            let responseMsg = score >= 4
              ? 'Obrigado pela avaliação! Fico feliz que pudemos ajudar. Qualquer dúvida, é só chamar.'
              : 'Obrigado pelo feedback. Sinto que não conseguimos resolver da melhor forma. Vou registrar para melhorarmos. Posso te ajudar com mais alguma coisa?';

            if (evoUrl && evoApiKey && evoInstance) {
              await safeEvoFetch(`${evoUrl}/message/sendText/${evoInstance}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evoApiKey },
              body: JSON.stringify({ number: remoteJid, text: responseMsg }),
            }, tenantId, evoInstance);
            }

            if (score <= 2) {
              // Create improvement ticket
              await db.collection("tickets").add({
                customerId,
                tenantId,
                subject: `Baixa Satisfação (CSAT: ${score}) - Melhoria`,
                status: "open",
                priority: "high",
                tags: ["low_csat"],
                aiEnabled: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                description: `O cliente avaliou o último atendimento com nota ${score}. Verifique o ticket original: ${lastTicketDoc.id}`
              });
              
              await db.collection("notifications").add({
                title: "ALERTA DE CSAT BAIXO",
                message: `O cliente ${cDataForContext.name} avaliou o atendimento com nota ${score}! Ticket gerado para melhoria.`,
                type: "low_csat",
                customerId,
                tenantId,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                read: false
              });
            }
            return;
          }
        }
      }

      let ticketData: any = {};
      if (ticketId) {
        const tDocRef = db.collection("tickets").doc(ticketId);
        const { data: tDocSnap, degraded: ticketDegraded } = await safeFirestoreGet(
          () => tDocRef.get(),
          { exists: false } as any,
          'ticket_lookup'
        );
        if (ticketDegraded) {
          logger.warn('degraded_ticket_lookup', { ...logCtx, session_id: ticketId });
          const { enqueueMessage } = await import("../lib/queue");
          await enqueueMessage(tenantId, job.data, { delay: 120000 });
          return;
        }
        if (tDocSnap.exists) {
          ticketData = tDocSnap.data() as any;
          if ((!ticketData.customerId || ticketData.customerId === remoteJid) && customerId) {
            await tDocRef.update({ customerId });
          }
        }
      } else {
        // Fallback robusto se n tiver ticketId no worker (nao deve ocorrer pela mudança no server.ts)
        const tQuery = db.collection("tickets")
          .where("customerId", "==", customerId)
          .where("status", "in", ["open", "in-progress", "escalated"]);
        const tSnap = await tQuery.get();

        const validOpenDocs = [];
        for (const docSnap of tSnap.docs) {
          const tDocData = docSnap.data() as any;
          if (!tDocData.createdAt) {
            validOpenDocs.push(docSnap);
            continue;
          }

          const ageHours =
            (Date.now() -
              (tDocData.createdAt.toMillis
                ? tDocData.createdAt.toMillis()
                : Date.now())) /
            (1000 * 60 * 60);
          if (ageHours > 24) {
            await db.collection("tickets").doc(docSnap.id).update({
              status: "resolved",
              resolvedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Schedule CSAT since ticket was auto-resolved
            fetch("http://localhost:3000/api/jobs/schedule-csat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ticketId: docSnap.id,
                tenantId: tDocData.tenantId,
                customerId,
                category: tDocData.session_state?.agent || 'SAC_GERAL',
                resolved_by: tDocData.human_responded ? 'human' : 'bot'
              })
            }).catch((e: any) => logger.error("csat_schedule_failed", { ...logCtx, error: e.message }));
          } else {
            validOpenDocs.push(docSnap);
          }
        }

        if (validOpenDocs.length > 0) {
          const theDoc = validOpenDocs[0];
          ticketId = theDoc.id;
          ticketData = theDoc.data();
        } else {
          const ticketSubjectName = (cDoc as any) ? (cDoc as any).data().name : pushName;
          
          let isRecidiva = false;
          try {
             const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
             const recentSnap = await db.collection("tickets")
                .where("customerId", "==", customerId)
                .where("tenantId", "==", tenantId)
                .orderBy("createdAt", "desc")
                .limit(5)
                .get();
                
             recentSnap.docs.forEach(doc => {
                 const t = doc.data();
                 if (t.status === "resolved" || t.status === "closed") {
                     const resAt = t.resolvedAt?.toDate?.() || t.createdAt?.toDate?.() || new Date(0);
                     if (resAt > last24h) {
                         isRecidiva = true;
                     }
                 }
             });
          } catch(e) {
             logger.error("error_checking_recidiva", { error: (e as any).message });
          }

          const newTick = await db.collection("tickets").add({
            customerId,
            tenantId,
            subject: ticketSubjectName || "Desconhecido",
            status: "open",
            priority: isRecidiva ? "high" : "medium",
            is_recidiva: isRecidiva,
            aiEnabled: true,
            aiAttempts: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          ticketId = newTick.id;
          ticketData = { aiEnabled: true, status: "open", session_state: { active_flow: "IDLE" } };
        }
      }
      
      // Detecção de Reagendamento (D-1)
      if (processedTextMessage.toLowerCase().includes("reagendar")) {
        const d1Snap = await db.collection("service_orders")
          .where("customer_id", "==", customerId)
          .where("status", "==", "agendada")
          .where("d1_confirmation_sent", "==", true)
          .get();
        if (!d1Snap.empty) {
          const osId = d1Snap.docs[0].id;
          if (ticketData?.session_state?.active_flow !== "REAGENDAMENTO") {
            ticketData.session_state = { active_flow: "REAGENDAMENTO", os_id: osId, agent: "Maria Suporte" };
            await db.collection("tickets").doc(ticketId).update({
              "session_state": ticketData.session_state
            });
            callerContext = `\n[SISTEMA: O cliente respondeu "Reagendar" à mensagem de confirmação de visita. A OS do cliente é ${osId}. Conduza o cancelamento/reagendamento da OS.]\n` + callerContext;
          }
        }
      }

      let detectedSentiment = "NEUTRAL";
      if (processedTextMessage && processedTextMessage.length > 3) {
        try {
          const { aiProvider } = await import("../ai-provider/ai-provider.setup");
          const classRes = await aiProvider.chat(
             "fallback",
             [
               { role: "system", content: "Classifique o sentimento em POSITIVE, NEUTRAL, NEGATIVE, URGENT ou ANGRY. Responda APENAS com uma destas palavras." },
               { role: "user", content: processedTextMessage }
             ],
             tenantId
          );
          if (classRes && classRes.content) {
             const s = classRes.content.trim().toUpperCase().replace(/[^A-Z]/g, '');
             if (["POSITIVE", "NEUTRAL", "NEGATIVE", "URGENT", "ANGRY"].includes(s)) {
                detectedSentiment = s;
             }
          }
        } catch (e: any) {
          logger.error("error_sentiment_classifier", { ...logCtx, error: e?.message });
        }
      }

      if (detectedSentiment === "ANGRY" || detectedSentiment === "URGENT") {
        ticketData.priority = "high";
        await db.collection("tickets").doc(ticketId).update({ priority: "high" });
      }

      await db.collection(`tickets/${ticketId}/messages`).add({
        ticketId,
        tenantId,
        senderType: "customer",
        text: processedTextMessage,
        evoMsgId: messageData?.key?.id || null,
        location_lat: payload?.location_lat || null,
        location_lng: payload?.location_lng || null,
        sentiment: detectedSentiment,
        isAudio: hasAudioObj, // Added to track audio messages
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection("tickets").doc(ticketId).update({
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (job.data.isHistoricalSync) {
        logger.info('historical_sync_saved_no_ai', logCtx);
        return;
      }

      if (ticketData.aiEnabled === false || ticketData.status === "escalated") {
        logger.info("ai_disabled_or_escalated", logCtx);
        return;
      }

      // PARTE A removida: O LLM agora lidará com a detecção de idioma e respostas estrangeiras naturalmente.
      
      const checkText = processedTextMessage ?? '';
      
      const msgSnap = await db.collection(`tickets/${ticketId}/messages`)
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();
      let historyBuffer: any[] = [];

      const sortedMsgs = msgSnap.docs
        .map((d) => d.data())
        .sort((a, b) => {
          const tA = a.createdAt?.toMillis
            ? a.createdAt.toMillis()
            : Date.now();
          const tB = b.createdAt?.toMillis
            ? b.createdAt.toMillis()
            : Date.now();
          return tA - tB;
        });

      const recentMsgs = sortedMsgs.slice(-15);

      recentMsgs.forEach((m) => {
        historyBuffer.push({
          role: m.senderType === "ai" ? "model" : "user",
          parts: [{ text: m.text }],
        });
      });

      if (historyBuffer.length > 0 && callerContext) {
        historyBuffer[historyBuffer.length - 1].parts[0].text += callerContext;
      }

      // We already called sendTyping once, but we can call it again or rely on the LLM processing taking some time.
      try {
        await safeEvoFetch(`${evoUrl}/chat/sendPresence/${evoInstance}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evoApiKey },
              body: JSON.stringify({
            number: remoteJid,
            options: { presence: "composing", delay: 4000 }
          }),
            }, tenantId, evoInstance);
      } catch (e) {}

      const startTime = Date.now();
      const customerDataForAi = {
        id: customerId,
        name: cDoc ? cDoc.data().name : pushName,
        phone: cDoc ? cDoc.data().phone : phoneOnly,
        cpf: cDoc && cDoc.data().cpf ? decryptCpf(cDoc.data().cpf) : undefined,
        address: cDoc ? cDoc.data().address : undefined,
      };

      const sessionState = ticketData.session_state || {};

      if (sessionState.active_flow === 'BLOCKED') {
        const minorMessage = 'Para contratar nossos serviços, é necessário ser maior de 18 anos ou ter um responsável legal presente. Pode pedir para um adulto responsável entrar em contato conosco? 😊';
        try {
          await safeEvoFetch(`${evoUrl}/message/sendText/${evoInstance}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evoApiKey },
              body: JSON.stringify({ number: remoteJid, text: minorMessage }),
            }, tenantId, evoInstance);
        } catch (e) {}
        logger.info('blocked_session_ignored');
        return;
      }
      
      if (payload?.location_cep_detected) {
        sessionState.location_cep_detected = payload.location_cep_detected;
        sessionState.location_source = 'gps';
        await db.collection("tickets").doc(ticketId).update({
          session_state: sessionState
        });
      }

      const aiPersonaId = enriched_instance_data?.ai_persona_id || undefined;
      const departmentId = enriched_instance_data?.department_id || undefined;

      const sanitizeResult = sanitizeUserInput(checkText, tenantId);
      if (!sanitizeResult.safe) {
        logger.warn('jailbreak_attempt', { ...logCtx, data: { reason: sanitizeResult.reason } });
        
        await logSecurityEvent('SECURITY_VIOLATION', {
          tenantId,
          ticketId,
          remoteJid,
          reason: sanitizeResult.reason,
          sanitizedText: sanitizeResult.sanitized,
          rawText: checkText
        });

        if (!isMockRedis) {
          const violationKey = `security_violations:${tenantId}`;
          const currentViolationsStr = await redis.get(violationKey);
          let violationsCount = parseInt(currentViolationsStr || '0', 10);
          violationsCount++;
          
          if (violationsCount === 1) {
             await redis.set(violationKey, violationsCount, 'EX', 3600);
          } else {
             await redis.incr(violationKey);
          }

          if (violationsCount >= 5) {
             await db.collection("notifications").add({
               type: 'SECURITY_ALERT',
               message: `Alerta: ${violationsCount} violações de segurança (jailbreak) detectadas na última hora para sua conta.`,
               read: false,
               tenantId: tenantId,
               createdAt: admin.firestore.FieldValue.serverTimestamp()
             }).catch((e: any) => logger.error("unhandled_promise_rejection", { error: e?.message || String(e) }));
          }
        }

        const safeMessage = "Desculpe, não entendi. Como posso ajudar você hoje?";
        try {
          await safeEvoFetch(`${evoUrl}/message/sendText/${evoInstance}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoApiKey },
            body: JSON.stringify({ number: remoteJid, text: safeMessage }),
          }, tenantId, evoInstance);
        } catch (e) {}

        const fallbackMsgDoc = {
          ticketId,
          tenantId,
          senderType: "ai",
          text: safeMessage,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          syncedToEvo: true,
          failed: false
        };
        await db.collection(`tickets/${ticketId}/messages`).add(fallbackMsgDoc);
        
        return;
      }

      logger.info('orchestrator_called', logCtx);
      const aiResult = await getAIResponse(
        historyBuffer,
        undefined,
        customerDataForAi,
        ticketId,
        sessionState,
        tenantId,
        remoteJid,
        aiPersonaId
      );
      
      if (aiResult) {
        logger.info('agent_called', { ...logCtx, agent: aiResult.category });
        if (aiResult.tools_called && aiResult.tools_called.length > 0) {
          logger.info('tool_called', { ...logCtx, tool: aiResult.tools_called[0] });
        }
        
        if (aiResult.referral_source) {
          try {
            await db.collection("tickets").doc(ticketId).update({
              "session_state.referral_source": aiResult.referral_source
            });
            logger.info('referral_source_recorded', { ...logCtx, data: { source: aiResult.referral_source } });
          } catch(e) { /* ignore */ }
        }
      }

      if (aiResult?.isSpam) {
        logger.info("spam_ignored", { ...logCtx, data: { message: processedTextMessage } });
        return;
      }

      if (aiResult?.isMinor) {
        logger.warn('minor_detected', logCtx);
        const minorMessage = 'Para contratar nossos serviços, é necessário ser maior de 18 anos ou ter um responsável legal presente. Pode pedir para um adulto responsável entrar em contato conosco? 😊';
        
        try {
          await safeEvoFetch(`${evoUrl}/message/sendText/${evoInstance}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evoApiKey },
              body: JSON.stringify({ number: remoteJid, text: minorMessage }),
            }, tenantId, evoInstance);
        } catch (e) {}

        const { logSecurityEvent } = await import("../lib/audit");
        await logSecurityEvent('MINOR_DETECTED', { ticketId, tenantId });

        await db.collection("tickets").doc(ticketId).update({
           "session_state.minor_detected": true,
           "session_state.active_flow": "BLOCKED"
        });
        return;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed < 3500) {
        await new Promise((resolve) => setTimeout(resolve, 3500 - elapsed));
      }

      if (aiResult?.usage) {
        try {
          // just keeping log event, but no console needed
          logger.info('ai_usage', { ...logCtx, data: aiResult.usage });
          await db.collection(`ai_usage`).add({
            ticketId,
            customerId: customerId || "unknown",
            category: aiResult.category || "UNKNOWN",
            promptTokens: aiResult.usage.prompt_tokens,
            completionTokens: aiResult.usage.completion_tokens,
            totalTokens: aiResult.usage.total_tokens,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (e) {}
      }

      const aiMessageRef = await db.collection(`tickets/${ticketId}/messages`).add({
        ticketId,
        senderType: "ai",
        category: aiResult.category || "SAC_GERAL",
        text: aiResult.message,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (traceId) {
        try {
          await db.collection(`tickets/${ticketId}/message_traces`).add({
            trace_id: traceId,
            message_id: messageId || crypto.randomUUID(),
            category: aiResult.category || "UNKNOWN",
            agent: aiResult.session_state_update?.agent || aiResult.category || "UNKNOWN",
            tools_called: aiResult.tools_called || [],
            latency_ms: Date.now() - workerStartTime,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });
        } catch (traceErr: any) {
          logger.error("error_saving_trace", { ...logCtx, error: traceErr.message });
        }
      }

      // --- ESCALATION RULES EVALUATION ---
      try {
        const rulesSnap = await db.collection(`escalation_rules/${tenantId}/rules`).where("active", "==", true).get();
        if (!rulesSnap.empty) {
          const activeRules = rulesSnap.docs.map(d => d.data());
          for (const rule of activeRules) {
            let matched = false;
            
            if (rule.condition_type === "sentiment") {
              if (detectedSentiment === rule.condition_value || aiResult.sentiment === rule.condition_value) {
                matched = true;
              }
            } else if (rule.condition_type === "keyword") {
              if (processedTextMessage && processedTextMessage.toLowerCase().includes(rule.condition_value.toLowerCase())) {
                matched = true;
              }
            } else if (rule.condition_type === "ai_attempts") {
              const ruleAttempts = parseInt(rule.condition_value, 10);
              if (!isNaN(ruleAttempts) && (ticketData.aiAttempts || 0) >= ruleAttempts) {
                matched = true;
              }
            } else if (rule.condition_type === "confidence_score") {
              const conf = parseFloat(rule.condition_value);
              if (!isNaN(conf) && aiResult.confidence !== undefined && aiResult.confidence < conf) {
                matched = true;
              }
            }

            if (matched) {
              logger.info('escalation_rule_matched', { ...logCtx, data: { rule } });
              
              if (rule.action === "escalate_to_human") {
                aiResult.shouldEscalate = true;
              } else if (rule.action === "create_urgent_os") {
                // Mock OS creation
                await db.collection("orders").add({
                  tenantId,
                  customerId,
                  ticketId,
                  status: "open",
                  type: "Urgência - Falta de Sinal",
                  priority: "highest",
                  reason: `Regra automática ativada: ${rule.condition_type}=${rule.condition_value}`,
                  createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                aiResult.shouldEscalate = true;
              } else if (rule.action === "send_alert") {
                 try {
                     const tDocLocal = await db.collection("tenants").doc(tenantId).get();
                     if (tDocLocal.exists) {
                         const adminEmail = tDocLocal.data()?.email || "noturcursos1@gmail.com";
                         const { sendEmail } = await import("../lib/email");
                         await sendEmail(adminEmail, `ALERTA DE SISTEMA: Regra de Escalonamento Ativada`, `O ticket #${ticketId} ativou a regra de ${rule.condition_type}=${rule.condition_value}.`);
                     }
                 } catch (emErr) {
                     console.error("Failed sending generic alert email", emErr);
                 }
              }
            }
          }
        }
      } catch (ruleErr: any) {
        logger.error("error_evaluating_escalation_rules", { ...logCtx, error: ruleErr?.message });
      }
      // ------------------------------------

      if (aiResult.shouldEscalate) {
        const { findBestOperator } = await import("../lib/routingEngine");
        
        let routingResult: any = { operator: null };
        try {
          const ticketObj = {
            id: ticketId,
            department_id: departmentId,
            required_skills: ticketData?.required_skills || []
          };
          routingResult = await findBestOperator(ticketObj, tenantId);
        } catch (err: any) {
             logger.error("error_finding_operator", { ...logCtx, error: err.message });
        }

        const updateData: any = {
          status: "escalated",
          aiEnabled: false,
        };
        if (departmentId) {
          updateData.departmentId = departmentId;
        }

        let systemMsg = "";

        if (routingResult.operator) {
            updateData.assignedOperatorId = routingResult.operator.id;
            updateData.assignedOperatorName = routingResult.operator.name;
            updateData.status = "escalated"; // or open

            systemMsg = `[SISTEMA]: Ticket atribuído ao atendente ${routingResult.operator.name}`;
            
            try {
               const redisModule = await import("../lib/redis");
               const pubClient = redisModule.default;
               if (pubClient) {
                  await pubClient.publish("operator_alerts", JSON.stringify({
                     type: "NEW_TICKET",
                     operatorId: routingResult.operator.id,
                     ticketId
                  }));
               }
               // PUSH: Send FCM Notification
               const opDoc = await db.collection("tenants").doc(tenantId).collection("operators").doc(routingResult.operator.id).get();
               const fcmToken = opDoc.data()?.fcmToken;
               if (fcmToken) {
                  await admin.messaging().send({
                     token: fcmToken,
                     notification: {
                        title: "Novo Atendimento",
                        body: `O ticket #${ticketId.slice(0,5)} foi transferido para você.`
                     },
                     data: { ticketId, type: "NEW_TICKET" }
                  });
                  logger.info("fcm_sent", { operatorId: routingResult.operator.id, ticketId });
               }
            } catch (err: any) {
               console.error("Failed to publish to redis or send FCM", err);
            }
        } else {
            updateData.status = "waiting_queue";
            
            let position = routingResult.queueStatus?.position || 1;
            let etaMinutes = routingResult.queueStatus?.etaMinutes || 3;
            
            updateData.etaMinutes = etaMinutes;
            updateData.queuePosition = position;
            
            systemMsg = `A IA transferiu seu atendimento. Todos os operadores estão ocupados no momento. Você é o Nº ${position} na fila. Tempo estimado: ${etaMinutes} minutos.`;
        }

        await db.collection("tickets").doc(ticketId).update(updateData);

        await db.collection(`tickets/${ticketId}/messages`).add({
          ticketId,
          senderType: "system",
          text: systemMsg,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Also we want to ensure the systemMsg arrives at the user WhatsApp if it's the waiting queue message
        if (!routingResult.operator && aiResult) {
            aiResult.message = (aiResult.message || "") + "\n\n" + systemMsg;
        }

        if (supportRelayNumber) {
          await safeEvoFetch(`${evoUrl}/message/sendText/${evoInstance}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evoApiKey },
              body: JSON.stringify({
              number: `${supportRelayNumber}@s.whatsapp.net`,
              text: `🚨 *SUPORTE WHITE-LABEL*\nTicket #${ticketId}\nCliente: ${phoneOnly}\n\n*Última Mensagem:* ${processedTextMessage}\n\n_Para responder ao cliente, inicie sua mensagem com "Ticket #${ticketId}: "_`,
            }),
            }, tenantId, evoInstance);
        }
      }

      const whatsappFormattedMessage = (aiResult?.message || "").replace(
        /\*\*(.*?)\*\*/g,
        "*$1*",
      );
      
      // Contagem de uso no Redis
      if (redis) {
        const d = new Date();
        const yyyyMm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const key = `msg_count:${tenantId}:${yyyyMm}`;
        await redis.incr(key);
        await redis.expire(key, 2764800); // 32 dias de TTL
      }

      // MELHORIA B — Chunking de resposta longa
      const isInstagram = payload?.source === 'instagram' || job.data?.source === 'instagram';
      const isFacebook = payload?.source === 'facebook' || job.data?.source === 'facebook';
      const isWebchat = payload?.source === 'webchat' || job.data?.source === 'webchat';
      
      if (isWebchat) {
         try {
             const identifier = remoteJid.replace('webchat_', '');
             const responseKey = `webchat_response:${identifier}`;
             await redis.lpush(responseKey, whatsappFormattedMessage);
             await redis.expire(responseKey, 30);
             logger.info("response_sent_webchat_redis", { ...logCtx, data: { chars: whatsappFormattedMessage.length } });
         } catch(e: any) {
             logger.error("webchat_reply_error", { error: e.message });
         }
      } else if (isInstagram || isFacebook) {
          const tenantDoc = await db.collection("tenants").doc(tenantId).get();
          
          let token = null;
          if (isInstagram) {
             token = tenantDoc.data()?.settings?.integrations?.instagram?.page_access_token ||
                     tenantDoc.data()?.integrations?.instagram?.page_access_token ||
                     tenantDoc.data()?.instagram?.page_access_token || 
                     tenantDoc.data()?.instagram?.access_token;
          } else if (isFacebook) {
             token = tenantDoc.data()?.settings?.integrations?.facebook?.page_access_token ||
                     tenantDoc.data()?.integrations?.facebook?.page_access_token ||
                     tenantDoc.data()?.facebook?.page_access_token || 
                     tenantDoc.data()?.facebook?.access_token;
          }

          if (token) {
              const { sendMessage } = await import("../lib/instagramClient.ts");
              await sendMessage(remoteJid, whatsappFormattedMessage, token);
              logger.info(`response_sent_${isInstagram ? 'instagram' : 'facebook'}`, { ...logCtx, data: { chars: whatsappFormattedMessage.length } });
          }
      } else {
        // Audio generation check for WhatsApp
        let audioSent = false;
        try {
           let ttsEnabled = false;
           if (aiPersonaId) {
               const personaDoc = await db.collection("ai_personas").doc(aiPersonaId).get();
               if (personaDoc.exists && personaDoc.data()?.tts_enabled) {
                   ttsEnabled = true;
               }
           } else {
               const defaultPersonaDoc = await db.collection("ai_personas").where("tenant_id", "==", tenantId).where("is_default", "==", true).get();
               if (!defaultPersonaDoc.empty && defaultPersonaDoc.docs[0].data()?.tts_enabled) {
                   ttsEnabled = true;
               }
           }
           
           if (ttsEnabled) {
               const recentCustMsgs = sortedMsgs.filter(m => m.senderType === "customer").slice(-5);
               const audioMsgCount = recentCustMsgs.filter(m => m.isAudio).length;
               if (recentCustMsgs.length > 0 && (audioMsgCount / recentCustMsgs.length) > 0.6) {
                   const openai = new OpenAI();
                   const mp3 = await openai.audio.speech.create({
                       model: "tts-1",
                       voice: "alloy",
                       input: whatsappFormattedMessage.substring(0, 4000), // OpenAI TTS limit
                   });
                   const buffer = Buffer.from(await mp3.arrayBuffer());
                   
                   const { getStorage } = await import("firebase-admin/storage");
                   const bucket = getStorage().bucket();
                   const ttsMessageId = messageId || crypto.randomUUID();
                   const file = bucket.file(`tenants/${tenantId}/tts/${ttsMessageId}.mp3`);
                   
                   await file.save(buffer, { metadata: { contentType: "audio/mpeg" } });
                   await file.makePublic();
                   const audioUrlToSend = file.publicUrl();

                   const audioRes = await safeEvoFetch(
                     `${evoUrl}/message/sendWhatsAppAudio/${evoInstance}`,
                     {
                       method: "POST",
                       headers: { "Content-Type": "application/json", apikey: evoApiKey },
                       body: JSON.stringify({
                         number: remoteJid,
                         audio: audioUrlToSend,
                       }),
                     }, tenantId, evoInstance
                   );
                   
                   if (audioRes.ok) {
                       logger.info("audio_response_sent", { ...logCtx, data: { url: audioUrlToSend } });
                       audioSent = true;
                   } else {
                       logger.error("audio_send_failed", { ...logCtx, error: await audioRes.text() });
                   }
               }
           }
        } catch (audioErr: any) {
           logger.error("audio_generation_error", { ...logCtx, error: audioErr.message });
        }

        if(!audioSent) {
          if (whatsappFormattedMessage.length > 300) {
            const evoIds = await sendChunked(whatsappFormattedMessage, remoteJid, evoUrl, evoInstance, evoApiKey, tenantId);
            if (evoIds.length > 0) {
               await aiMessageRef.update({ evoMsgIds: evoIds });
            }
            logger.info("response_sent", { ...logCtx, data: { chars: whatsappFormattedMessage.length } });
          } else {
            const sendResponse = await safeEvoFetch(
              `${evoUrl}/message/sendText/${evoInstance}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: evoApiKey },
                body: JSON.stringify({
                  number: remoteJid,
                  text: whatsappFormattedMessage,
                }),
              }, tenantId, evoInstance
            );

            if (!sendResponse.ok) {
              logger.error("error_sending_response", { ...logCtx, error: await sendResponse.text() });
              throw new Error("Failed to send message via Evolution API");
            } else {
              logger.info("response_sent", { ...logCtx, data: { chars: whatsappFormattedMessage.length } });
              try {
                 const data = await sendResponse.json();
                 if (data?.key?.id) {
                    await aiMessageRef.update({ evoMsgIds: [data.key.id] });
                 }
              } catch(e) {}
            }
          }
        }
      }
    } catch (innerError: any) {
      logger.error("error_worker_inner", { ...logCtx, error: innerError.message });
      throw innerError; // Make job fail
    } finally {
      resolveLock!();
      processingNumbers.delete(phoneOnlyLock);
      await redis.del(lockKey);
    }
};

export const messageWorker = isMockRedis ? {
  on: (event: string, handler: any) => {
    // Silently register mock listener
  }
} as any : null;

async function startWorkers() {
  if (isMockRedis) {
    import("../lib/queue").then(({ mockQueueEmitter }) => {
       if (mockQueueEmitter) {
           mockQueueEmitter.on("process-message", async (job) => {
               try {
                   await processMessageJob(job);
               } catch (e: any) {
                   logger.error("mock_worker_failed", { error: e.message });
               }
           });
       }
    });
    return;
  }

  try {
    const { adminDb: db } = await import("../lib/firebaseAdmin");
    const tenantsSnap = await db.collection('tenants').where('active', '==', true).get();

    for (const tenant of tenantsSnap.docs) {
      const tenantId = tenant.id;
      const concurrency = tenant.data()?.worker_concurrency ?? 3;

      const worker = new Worker(`messages:${tenantId}`, processMessageJob, {
        connection: redis as any,
        concurrency
      });

      setupDLQ(worker);
      logger.info('worker_started', { tenant_id: tenantId, data: { concurrency } });
    }
  } catch (err: any) {
    logger.error('worker_start_failed', { error: err.message });
  }
}

startWorkers();
