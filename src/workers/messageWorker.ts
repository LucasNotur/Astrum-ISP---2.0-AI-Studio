import { Worker, Job } from "bullmq";
import redis from "../lib/redis";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import path from "path";
import OpenAI from "openai";
import {
  getDocs,
  query,
  collection,
  where,
  orderBy,
  limit,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  setDoc,
  getDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { getIntegrationKeys, decryptCpf, incrementShardedCounter } from "../lib/db";
import { getAIResponse } from "../lib/gemini";
import { deadLetterQueue, setupDLQ } from "../lib/queue";
import { logger } from "../lib/logger";

const processingNumbers = new Map<string, Promise<void>>();

const isMockRedis = !((redis as any).options);

async function sendTyping(remoteJid: string, url: string, instance: string, key: string) {
  try {
    await fetch(`${url}/chat/sendPresence/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({ number: remoteJid, options: { presence: "composing", delay: 1500 } }),
    });
  } catch {
    // Falha silenciosa
  }
}

async function sendChunked(text: string, remoteJid: string, url: string, instance: string, key: string) {
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

  for (const chunk of chunks) {
    await sendTyping(remoteJid, url, instance, key);
    await new Promise((r) => setTimeout(r, 800));
    await fetch(`${url}/message/sendText/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({ number: remoteJid, text: chunk }),
    });
    await new Promise((r) => setTimeout(r, 800));
  }
}

const processMessageJob = async (job: any) => {
    if (job.name === 'pos_instalacao') {
      const { customerId, tenantId, osId, installedPlan } = job.data;
      
      const last24h = new Date(Date.now() - 86400000);
      const Timestamp = (await import("firebase/firestore")).Timestamp;
      
      const recentSupport = await getDocs(
        query(
          collection(db, 'tickets'),
          where('customerId', '==', customerId),
          // Fallback verification since we already query customer ticket:
          // Just check if there's any recent ticket 
        )
      );

      const hasRecentTicket = recentSupport.docs.some(d => {
         const createdAt = d.data().createdAt?.toDate ? d.data().createdAt.toDate() : new Date();
         return createdAt >= last24h;
      });
      
      const templateName = hasRecentTicket ? 'pos_instalacao_com_problema' : 'pos_instalacao_ok';
      
      const customerSnap = await getDocs(query(collection(db, "customers"), where("__name__", "==", customerId)));
      if (!customerSnap.empty) {
        const customer = customerSnap.docs[0].data();
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
            await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evoApiKey },
              body: JSON.stringify({ number: remoteJid, text: textToSend }),
            });
            
            await updateDoc(doc(db, "service_orders", osId), {
              pos_instalacao_sent: true,
              pos_instalacao_sent_at: serverTimestamp()
            });
          }
        }
      }
      return;
    }

    if (job.name === 'sla_warning') {
      const { ticketId, level, tenantId, customerId } = job.data;
      
      const ticketSnap = await getDoc(doc(db, 'tickets', ticketId));
      if (!ticketSnap.exists()) return;
      const tData = ticketSnap.data();
      
      // Verificar se humano já respondeu — se sim, cancelar
      if (tData.human_responded) return;
      if (tData.status === 'resolved' || tData.status === 'closed') return;

      const customerSnap = await getDocs(query(collection(db, "customers"), where("__name__", "==", customerId)));
      if (!customerSnap.empty) {
        const customer = customerSnap.docs[0].data();
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
            await addDoc(collection(db, "notifications"), {
              title: "ALERTA DE SLA",
              message: `Ticket ${ticketId} sem resposta humana há 15 minutos!`,
              type: "sla_breach",
              ticketId,
              tenantId,
              createdAt: serverTimestamp(),
              read: false
            });
          }

          if (textToSend && evoUrl && evoInstance && evoApiKey) {
            await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evoApiKey },
              body: JSON.stringify({ number: remoteJid, text: textToSend }),
            });
            await addDoc(collection(db, `tickets/${ticketId}/messages`), {
              ticketId,
              senderType: "ai",
              text: textToSend,
              createdAt: serverTimestamp(),
            });
          }
        }
      }
      return;
    }

    if (job.name === 'send_csat') {
      const { ticketId, customerId, tenantId, category, resolved_by } = job.data;
      
      const customerSnap = await getDocs(query(collection(db, "customers"), where("__name__", "==", customerId)));
      if (!customerSnap.empty) {
        const cData = customerSnap.docs[0].data();

        // Enviar CSAT
        const keys = await getIntegrationKeys();
        const evoUrl = keys.evolutionUrl?.replace(/\/+$/, "");
        const evoInstance = keys.evolutionInstance;
        const evoApiKey = keys.evolutionApiKey;
        const remotePhone = `${(cData.phone || "").replace(/\D/g, "")}@s.whatsapp.net`;
        
        const csatText = `Olá ${cData.name || 'cliente'}, o seu atendimento foi encerrado. Como você avalia a sua experiência?\n\n1 - ⭐\n2 - ⭐⭐\n3 - ⭐⭐⭐\n4 - ⭐⭐⭐⭐\n5 - ⭐⭐⭐⭐⭐\n\nResponda com um número de 1 a 5.`;

        if (evoUrl && evoApiKey && evoInstance) {
          await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoApiKey },
            body: JSON.stringify({ number: remotePhone, text: csatText }),
          });
          
          await updateDoc(doc(db, "tickets", ticketId), {
            "session_state.awaiting_csat": true,
            "session_state.csat_resolved_by": resolved_by,
            "session_state.csat_category": category,
          });
        }
      }
      return;
    }

    let { remoteJid, textMessage, messageData, payload, bufferKey, tenantId, isAudio, audioUrl, ticketId, traceId, messageId } = job.data;
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
           await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
             method: "POST",
             headers: { "Content-Type": "application/json", apikey: evoApiKey },
             body: JSON.stringify({ number: remoteJid, text: "Estamos com uma instabilidade técnica no momento. Nosso sistema voltará em instantes. Pedimos desculpas! 🙏" }),
           });
        }
        const { enqueueMessage } = await import("../lib/queue");
        await enqueueMessage(tenantId, job.data, { delay: 120000 });
        return;
      }
    }

    await incrementShardedCounter('messages_today', tenantId);
    
    if (isAudio && audioUrl) {
      const { transcribeAudio } = await import("../lib/transcription");
      const transcription = await transcribeAudio(audioUrl);
      if (transcription) {
        textMessage = `[Áudio transcrito]: ${transcription}`;
        logger.info('whisper_transcribed', { ...logCtx, data: { partial: transcription.substring(0, 100) } });
      } else {
        textMessage = '[Cliente enviou um áudio. Não consegui transcrever. Peça ao cliente para digitar.]';
      }
    }

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
      const keys = await getIntegrationKeys();
      const evoUrl = keys.evolutionUrl?.replace(/\/+$/, "");
      const evoInstance = keys.evolutionInstance;
      const evoApiKey = keys.evolutionApiKey;
      const supportRelayNumber = keys.whiteLabelSupportNumber;

      if (!evoUrl || !evoInstance || !evoApiKey) {
        throw new Error(
          "Evolution API não configurada no painel de Integrações.",
        );
      }

      // MELHORIA A — Typing indicator
      await sendTyping(remoteJid, evoUrl, evoInstance, evoApiKey);

      const hasAudioObj = !!messageData?.audioMessage;
      let processedTextMessage = textMessage;

      // --- PASSO 0: Lógica de Intermédio (Relay White-label) ---
      if (supportRelayNumber && remoteJid.includes(supportRelayNumber)) {
        logger.info("relay_received", logCtx);
        const ticketMatch = processedTextMessage.match(
          /Ticket #([a-zA-Z0-9_-]+):/,
        );
        let targetTicketId = ticketMatch ? ticketMatch[1] : null;

        if (!targetTicketId) {
          const lastEscalated = await getDocs(
            query(
              collection(db, "tickets"),
              where("status", "==", "escalated"),
              orderBy("createdAt", "desc"),
              limit(1),
            ),
          );
          if (!lastEscalated.empty) targetTicketId = lastEscalated.docs[0].id;
        }

        if (targetTicketId) {
          const tDoc = await getDocs(
            query(
              collection(db, "tickets"),
              where("__name__", "==", targetTicketId),
            ),
          );
          if (!tDoc.empty) {
            const ticketData = tDoc.docs[0].data();
            const customerId = ticketData.customerId;
            const cDoc = await getDocs(
              query(
                collection(db, "customers"),
                where("__name__", "==", customerId),
              ),
            );

            if (!cDoc.empty) {
              const customerPhone = cDoc.docs[0].data().phone;
              const cleanMsg = processedTextMessage.replace(
                /Ticket #[a-zA-Z0-9_-]+:\s*/,
                "",
              );

              logger.info("relay_sent_client", { ...logCtx, phone_last4: customerPhone?.slice(-4) });

              await addDoc(
                collection(db, `tickets/${targetTicketId}/messages`),
                {
                  ticketId: targetTicketId,
                  senderType: "human",
                  text: cleanMsg,
                  createdAt: serverTimestamp(),
                },
              );

              await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  apikey: evoApiKey,
                },
                body: JSON.stringify({
                  number: `${customerPhone}@s.whatsapp.net`,
                  text: cleanMsg,
                }),
              });
              return;
            }
          }
        }
        logger.warn('relay_failed_unidentified', logCtx);
        return;
      }

      if (isAudio) {
        logger.info('audio_detected', logCtx);
        const whisperKey = keys.openaiWhisper || keys.openaiChat;

        if (!whisperKey) {
          processedTextMessage =
            "[Áudio recebido, mas a chave da OpenAI não está configurada para transcrição]";
          logger.warn('whisper_key_missing', logCtx);
        } else {
          try {
            const mediaResponse = await fetch(
              `${evoUrl}/chat/getBase64FromMediaMessage/${evoInstance}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  apikey: evoApiKey,
                },
                body: JSON.stringify({ message: payload.data }),
              },
            );

            const mediaData = await mediaResponse.json();

            if (mediaData && mediaData.base64) {
              const buffer = Buffer.from(mediaData.base64, "base64");
              const tempFilePath = path.join(
                os.tmpdir(),
                `audio_${Date.now()}.ogg`,
              );
              fs.writeFileSync(tempFilePath, buffer);

              const openai = new OpenAI({ apiKey: whisperKey, dangerouslyAllowBrowser: true });
              const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(tempFilePath),
                model: "whisper-1",
              });

              processedTextMessage = transcription.text;
              logger.info("transcription_completed", { ...logCtx, data: { text: processedTextMessage } });
              fs.unlinkSync(tempFilePath);
            } else {
              throw new Error(
                "Falha ao obter base64 do áudio da Evolution API.",
              );
            }
          } catch (audioErr: any) {
            logger.error('transcription_failed', { ...logCtx, error: audioErr.message });
            processedTextMessage = "[Erro ao transcrever o áudio enviado]";
          }
        }
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
            } else {
               processedTextMessage = `[Localização enviada via WhatsApp] Endereço aproximado: ${locationData?.display_name || 'Desconhecido'}`;
            }
          } catch (locErr: any) {
             logger.error("error_geocoding", { ...logCtx, error: locErr.message });
             processedTextMessage = `[Localização enviada. Latitude: ${degreesLatitude}, Longitude: ${degreesLongitude}]`;
          }
        }
      }

      // 3. Language check (English / Spanish bypass)
      if (processedTextMessage) {
        const lowerMsg = processedTextMessage.toLowerCase().trim();
        const englishRegex = /^(hello|hi\b|hey\b|good morning|good afternoon|good evening|how are you|i want to|can you|please\b|help\b)/;
        const spanishRegex = /^(hola|buenos d[íi]as|buenas tardes|buenas noches|c[óo]mo est[áa]s|quiero|puedes|por favor|ayuda\b)/;
        
        let languageWarning = null;
        if (englishRegex.test(lowerMsg)) {
           languageWarning = "Hello! Our support is currently only available in Portuguese. How can I help you today? / Olá! Nosso atendimento é fornecido exclusivamente em português. Como posso ajudar?";
        } else if (spanishRegex.test(lowerMsg)) {
           languageWarning = "¡Hola! Nuestro soporte actualmente solo está disponible en portugués. ¿En qué te puedo ayudar hoy? / Olá! Nosso atendimento é fornecido exclusivamente em português. Como posso ajudar?";
        }

        if (languageWarning) {
          logger.info("foreign_language_detected", { ...logCtx, data: { warning: languageWarning } });
          await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: evoApiKey,
            },
            body: JSON.stringify({
              number: remoteJid,
              text: languageWarning,
            }),
          });
          return;
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
        () => getDocs(query(collection(db, "customers"))),
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

      const cDoc = custSnap.docs.find((d) => {
        const p = (d.data().phone || "").replace(/\D/g, "");
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
        if (!cDoc.data().avatar) {
          try {
            let profilePicUrl = null;
            const picRes = await fetch(
              `${evoUrl}/chat/fetchProfilePictureUrl/${evoInstance}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  apikey: evoApiKey,
                },
                body: JSON.stringify({ number: remoteJid }),
              },
            );
            const picData = await picRes.json();
            if (picData?.profilePictureUrl)
              profilePicUrl = picData.profilePictureUrl;
            else if (picData?.pictureUrl) profilePicUrl = picData.pictureUrl;

            if (profilePicUrl) {
              await updateDoc(doc(db, "customers", customerId), {
                avatar: profilePicUrl,
              });
            }
          } catch (e) {}
        }
      } else {
        let profilePicUrl = null;
        try {
          const picRes = await fetch(
            `${evoUrl}/chat/fetchProfilePictureUrl/${evoInstance}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: evoApiKey,
              },
              body: JSON.stringify({ number: remoteJid }),
            },
          );
          const picData = await picRes.json();
          if (picData?.profilePictureUrl)
            profilePicUrl = picData.profilePictureUrl;
          else if (picData?.pictureUrl) profilePicUrl = picData.pictureUrl;
        } catch (e) {}

        const newCust = await addDoc(collection(db, "customers"), {
          name: pushName,
          phone: phoneOnly,
          email: "",
          plan: "Prospecto",
          mrr: 0,
          status: "lead",
          avatar: profilePicUrl,
          createdAt: serverTimestamp(),
        });
        customerId = newCust.id;
      }

      let cDataForContext = cDoc
        ? cDoc.data()
        : { name: pushName, plan: "Prospecto", status: "lead" };
      callerContext = `\n[CONTEXTO DO SISTEMA: O cliente se chama ${cDataForContext.name}, Plano: ${cDataForContext.plan}, Status de Assinatura: ${cDataForContext.status === "active" ? "Ativo" : cDataForContext.status === "lead" ? "Novo Contato/Prospecto - NÃO é cliente ainda" : cDataForContext.status}.]`;

      // CSAT Check
      if (processedTextMessage && /^[1-5]$/.test(processedTextMessage.trim())) {
        const { orderBy, limit } = await import("firebase/firestore");
        const csatCheckQ = query(
          collection(db, "tickets"),
          where("customerId", "==", customerId),
          orderBy("createdAt", "desc"),
          limit(1)
        );
        const csatSnap = await getDocs(csatCheckQ);
        if (!csatSnap.empty) {
          const lastTicketDoc = csatSnap.docs[0];
          const lastTicketData = lastTicketDoc.data();
          if (lastTicketData.session_state?.awaiting_csat) {
            const score = parseInt(processedTextMessage.trim());
            const tenantIdCheck = lastTicketData.tenantId;
            if (!tenantIdCheck) throw new Error('TENANT_ID_MISSING');
            const tenantId = tenantIdCheck;

            await addDoc(collection(db, 'csat_ratings'), {
              ticket_id: lastTicketDoc.id,
              customer_id: customerId,
              tenant_id: tenantId,
              score,
              resolved_by: lastTicketData.session_state.csat_resolved_by || 'unknown',
              category: lastTicketData.session_state.csat_category || 'unknown',
              created_at: serverTimestamp()
            });

            await updateDoc(doc(db, 'customers', customerId), {
              'last_csat_score': score,
              'last_csat_at': serverTimestamp()
            });

            await updateDoc(doc(db, "tickets", lastTicketDoc.id), {
              "session_state.awaiting_csat": false
            });

            let responseMsg = score >= 4
              ? 'Obrigado pela avaliação! Fico feliz que pudemos ajudar. Qualquer dúvida, é só chamar.'
              : 'Obrigado pelo feedback. Sinto que não conseguimos resolver da melhor forma. Vou registrar para melhorarmos. Posso te ajudar com mais alguma coisa?';

            if (evoUrl && evoApiKey && evoInstance) {
              await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: evoApiKey },
                body: JSON.stringify({ number: remoteJid, text: responseMsg }),
              });
            }

            if (score <= 2) {
              // Create improvement ticket
              await addDoc(collection(db, "tickets"), {
                customerId,
                tenantId,
                subject: `Baixa Satisfação (CSAT: ${score}) - Melhoria`,
                status: "open",
                priority: "high",
                tags: ["low_csat"],
                aiEnabled: false,
                createdAt: serverTimestamp(),
                description: `O cliente avaliou o último atendimento com nota ${score}. Verifique o ticket original: ${lastTicketDoc.id}`
              });
              
              await addDoc(collection(db, "notifications"), {
                title: "ALERTA DE CSAT BAIXO",
                message: `O cliente ${cDataForContext.name} avaliou o atendimento com nota ${score}! Ticket gerado para melhoria.`,
                type: "low_csat",
                customerId,
                tenantId,
                createdAt: serverTimestamp(),
                read: false
              });
            }
            return;
          }
        }
      }

      let ticketData: any = {};
      if (ticketId) {
        const tDocRef = doc(db, "tickets", ticketId);
        const { data: tDocSnap, degraded: ticketDegraded } = await safeFirestoreGet(
          () => getDoc(tDocRef),
          { exists: () => false } as any,
          'ticket_lookup'
        );
        if (ticketDegraded) {
          logger.warn('degraded_ticket_lookup', { ...logCtx, session_id: ticketId });
          const { enqueueMessage } = await import("../lib/queue");
          await enqueueMessage(tenantId, job.data, { delay: 120000 });
          return;
        }
        if (tDocSnap.exists()) {
          ticketData = tDocSnap.data();
          if (!ticketData.customerId && customerId) {
            await updateDoc(tDocRef, { customerId });
          }
        }
      } else {
        // Fallback robusto se n tiver ticketId no worker (nao deve ocorrer pela mudança no server.ts)
        const tQuery = query(
          collection(db, "tickets"),
          where("customerId", "==", customerId),
          where("status", "in", ["open", "in-progress", "escalated"]),
        );
        const tSnap = await getDocs(tQuery);

        const validOpenDocs = [];
        for (const docSnap of tSnap.docs) {
          const tDocData = docSnap.data();
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
            await updateDoc(doc(db, "tickets", docSnap.id), {
              status: "resolved",
              resolvedAt: serverTimestamp()
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
          const ticketSubjectName = cDoc ? cDoc.data().name : pushName;
          const newTick = await addDoc(collection(db, "tickets"), {
            customerId,
            subject: ticketSubjectName || "Desconhecido",
            status: "open",
            priority: "medium",
            aiEnabled: true,
            aiAttempts: 0,
            createdAt: serverTimestamp(),
          });
          ticketId = newTick.id;
          ticketData = { aiEnabled: true, status: "open", session_state: { active_flow: "IDLE" } };
        }
      }
      
      // Detecção de Reagendamento (D-1)
      if (processedTextMessage.toLowerCase().includes("reagendar")) {
        const d1Query = query(
          collection(db, "service_orders"),
          where("customer_id", "==", customerId),
          where("status", "==", "agendada"),
          where("d1_confirmation_sent", "==", true)
        );
        const d1Snap = await getDocs(d1Query);
        if (!d1Snap.empty) {
          const osId = d1Snap.docs[0].id;
          if (ticketData?.session_state?.active_flow !== "REAGENDAMENTO") {
            ticketData.session_state = { active_flow: "REAGENDAMENTO", os_id: osId, agent: "Maria Suporte" };
            await updateDoc(doc(db, "tickets", ticketId), {
              "session_state": ticketData.session_state
            });
            callerContext = `\n[SISTEMA: O cliente respondeu "Reagendar" à mensagem de confirmação de visita. A OS do cliente é ${osId}. Conduza o cancelamento/reagendamento da OS.]\n` + callerContext;
          }
        }
      }

      await addDoc(collection(db, `tickets/${ticketId}/messages`), {
        ticketId,
        senderType: "customer",
        text: processedTextMessage,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "tickets", ticketId), {
        lastMessageAt: serverTimestamp()
      });

      if (ticketData.aiEnabled === false || ticketData.status === "escalated") {
        logger.info("ai_disabled_or_escalated", logCtx);
        return;
      }

      // PARTE A — Mensagem em idioma estrangeiro
      const checkText = processedTextMessage ?? '';
      const isPortuguese = /[ãõáéíóúâêîôûàèìòùç]/i.test(checkText) || checkText.length < 10;
      const hasSpanish = /\b(hola|gracias|como|está|necesito|quiero|ayuda|internet|servicio)\b/i.test(checkText);
      const hasEnglish = /\b(hello|hi|help|internet|service|need|want|please|thanks)\b/i.test(checkText);

      if (!isPortuguese && (hasSpanish || hasEnglish)) {
        const lang = hasSpanish ? 'espanhol' : 'inglês';
        const escMsg = hasSpanish
          ? 'Hola! Nuestro servicio es en portugués. ¿Puedo conectarte con un agente que te ayude?'
          : 'Hello! Our service is in Portuguese. Can I connect you with an agent who can help you?';

        await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evoApiKey },
          body: JSON.stringify({ number: remoteJid, text: escMsg }),
        });

        await addDoc(collection(db, `tickets/${ticketId}/messages`), {
          ticketId,
          senderType: "ai",
          text: escMsg,
          createdAt: serverTimestamp(),
        });

        await updateDoc(doc(db, "tickets", ticketId), {
          status: "escalated",
          aiEnabled: false,
          escalation_reason: "FOREIGN_LANGUAGE",
          escalation_lang: lang
        });
        return;
      }

      const msgSnap = await getDocs(
        query(
          collection(db, `tickets/${ticketId}/messages`),
          orderBy("createdAt", "desc"),
          limit(50)
        )
      );
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
        await fetch(`${evoUrl}/chat/sendPresence/${evoInstance}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evoApiKey },
          body: JSON.stringify({
            number: remoteJid,
            options: { presence: "composing", delay: 4000 }
          }),
        });
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
          await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoApiKey },
            body: JSON.stringify({ number: remoteJid, text: minorMessage }),
          });
        } catch (e) {}
        logger.info('blocked_session_ignored');
        return;
      }
      
      if (payload?.location_cep_detected) {
        sessionState.location_cep_detected = payload.location_cep_detected;
        sessionState.location_source = 'gps';
        await updateDoc(doc(db, "tickets", ticketId), {
          session_state: sessionState
        });
      }

      logger.info('orchestrator_called', logCtx);
      const aiResult = await getAIResponse(
        historyBuffer,
        undefined,
        customerDataForAi,
        ticketId,
        sessionState,
        tenantId,
        remoteJid
      );
      
      if (aiResult) {
        logger.info('agent_called', { ...logCtx, agent: aiResult.category });
        if (aiResult.tools_called && aiResult.tools_called.length > 0) {
          logger.info('tool_called', { ...logCtx, tool: aiResult.tools_called[0] });
        }
        
        if (aiResult.referral_source) {
          try {
            await updateDoc(doc(db, "tickets", ticketId), {
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
          await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
             method: "POST",
             headers: { "Content-Type": "application/json", apikey: evoApiKey },
             body: JSON.stringify({ number: remoteJid, text: minorMessage }),
          });
        } catch (e) {}

        const { logSecurityEvent } = await import("../lib/audit");
        await logSecurityEvent('MINOR_DETECTED', { ticketId, tenantId });

        await updateDoc(doc(db, "tickets", ticketId), {
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
          await addDoc(collection(db, `ai_usage`), {
            ticketId,
            customerId: customerId || "unknown",
            category: aiResult.category || "UNKNOWN",
            promptTokens: aiResult.usage.prompt_tokens,
            completionTokens: aiResult.usage.completion_tokens,
            totalTokens: aiResult.usage.total_tokens,
            createdAt: serverTimestamp(),
          });
        } catch (e) {}
      }

      await addDoc(collection(db, `tickets/${ticketId}/messages`), {
        ticketId,
        senderType: "ai",
        category: aiResult.category || "SAC_GERAL",
        text: aiResult.message,
        createdAt: serverTimestamp(),
      });

      if (traceId) {
        try {
          await addDoc(collection(db, `tickets/${ticketId}/message_traces`), {
            trace_id: traceId,
            message_id: messageId || crypto.randomUUID(),
            category: aiResult.category,
            agent: aiResult.session_state_update?.agent || aiResult.category,
            tools_called: aiResult.tools_called || [],
            latency_ms: Date.now() - workerStartTime,
            timestamp: serverTimestamp()
          });
        } catch (traceErr: any) {
          logger.error("error_saving_trace", { ...logCtx, error: traceErr.message });
        }
      }

      if (aiResult.shouldEscalate) {
        await updateDoc(doc(db, "tickets", ticketId), {
          status: "escalated",
          aiEnabled: false,
        });

        const systemMsg =
          "[SISTEMA]: A IA não conseguiu resolver ou requer verificação manual. O ticket foi transferido para a central da empresa mãe.";
        await addDoc(collection(db, `tickets/${ticketId}/messages`), {
          ticketId,
          senderType: "system",
          text: systemMsg,
          createdAt: serverTimestamp(),
        });

        if (supportRelayNumber) {
          await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoApiKey },
            body: JSON.stringify({
              number: `${supportRelayNumber}@s.whatsapp.net`,
              text: `🚨 *SUPORTE WHITE-LABEL*\nTicket #${ticketId}\nCliente: ${phoneOnly}\n\n*Última Mensagem:* ${processedTextMessage}\n\n_Para responder ao cliente, inicie sua mensagem com "Ticket #${ticketId}: "_`,
            }),
          });
        }
      }

      const whatsappFormattedMessage = (aiResult?.message || "").replace(
        /\*\*(.*?)\*\*/g,
        "*$1*",
      );
      
      // MELHORIA B — Chunking de resposta longa
      if (whatsappFormattedMessage.length > 300) {
        await sendChunked(whatsappFormattedMessage, remoteJid, evoUrl, evoInstance, evoApiKey);
        logger.info("response_sent", { ...logCtx, data: { chars: whatsappFormattedMessage.length } });
      } else {
        const sendResponse = await fetch(
          `${evoUrl}/message/sendText/${evoInstance}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoApiKey },
            body: JSON.stringify({
              number: remoteJid,
              text: whatsappFormattedMessage,
            }),
          },
        );

        if (!sendResponse.ok) {
          logger.error("error_sending_response", { ...logCtx, error: await sendResponse.text() });
          throw new Error("Failed to send message via Evolution API");
        } else {
          logger.info("response_sent", { ...logCtx, data: { chars: whatsappFormattedMessage.length } });
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
    const { getDocs, collection, where, query } = await import("firebase/firestore");
    const { db } = await import("../lib/firebase");
    const tenantsSnap = await getDocs(query(collection(db, 'tenants'), where('active', '==', true)));

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
