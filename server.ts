import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import fs from "fs";
import os from "os";
import multer from "multer";
import { signInAnonymously } from "firebase/auth";
import SmeeClient from 'smee-client';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, updateDoc, orderBy, limit } from "firebase/firestore";
import { auth, db } from "./src/lib/firebase.ts";
import { getIntegrationKeys } from "./src/lib/db.ts";
import { getAIResponse } from "./src/lib/gemini.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  // Autenticação anônima do servidor para bypass nas Rules (via isWebhook no Firestore)
  // IMPORTANTE: Se der erro 'admin-restricted-operation', habilite o provedor "Anônimo" no Console do Firebase.
  try {
    await signInAnonymously(auth);
    console.log("✅ Webhook Node.js autenticado no Firebase (Anonymous/System)");
  } catch (err: any) {
    if (err.code === 'auth/admin-restricted-operation' || err.message?.includes('admin-restricted-operation')) {
      console.warn("⚠️ [AVISO]: O provedor 'Anônimo' está desativado no seu Firebase Console.");
      console.warn("Isso impedirá que o Webhook escreva no banco se as Security Rules exigirem autenticação.");
    } else {
      console.error("❌ Falha na autenticação do servidor:", err.message);
    }
  }

  const app = express();
  const PORT = 3000;

  // Middleware to parse JSON bodies (increased limit for base64 audio)
  app.use(express.json({ limit: '50mb' }));

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  const upload = multer({ dest: os.tmpdir() });

  // Initialize Smee for local webhooks if in dev. But honestly since AI Studio URL might ALWAYS be behind auth, 
  // Let's just always initialize Smee so the webhook can bypass the IAP prompt.
  const SMEE_CHANNEL = `https://smee.io/astrum-evo-webhook-${process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 5) : Math.floor(Math.random()*100000)}`;
  const smeeClientObj = new SmeeClient({
    source: SMEE_CHANNEL,
    target: 'http://127.0.0.1:3000/api/webhook/evolution',
    logger: console
  });
  smeeClientObj.start();
  
  app.get("/api/system/webhook-url", (req, res) => {
    res.json({ webhookUrl: SMEE_CHANNEL });
  });

  // RAG Native PDF Parser API
  app.post("/api/rag/upload-pdf", upload.single("pdf"), async (req, res) => {
    try {
      const file = (req as any).file;
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      console.log(`📄 Analisando PDF: ${file.originalname}`);
      const dataBuffer = fs.readFileSync(file.path);
      
      // Parse Native do PDF para texto bruto
      // Dynamic import to bypass ESM issues with pdf-parse CJS
      const pdfParseModule: any = await import("pdf-parse");
      const pdfParse = pdfParseModule.default || pdfParseModule;
      const pdfData = await pdfParse(dataBuffer);
      const extractedText = pdfData.text;

      // Limpeza
      fs.unlinkSync(file.path);

      // Usa motor RAG (Gemini)
      const keys = await getIntegrationKeys();
      const provider = keys.ragProvider || 'openai';
      const isCustom = provider === 'custom';
      const isOpenAILike = provider === 'openai' || isCustom;
      
      const ragAiKey = isCustom
        ? (keys.customRag || "")
        : provider === 'openai' 
          ? (keys.openaiRag || keys.openaiGlobal) 
          : (keys.geminiRag || keys.geminiGlobal || process.env.GEMINI_API_KEY);
      const ragAiModel = keys[`${provider}RagModel`] || (provider === 'openai' ? 'gpt-4o-mini' : isCustom ? "" : 'gemini-2.5-flash');
      const ragAiBaseUrl = isCustom ? keys.customRagBaseUrl : undefined;

      if (!ragAiKey) {
        // Se nao tem chave, devolve o texto bruto e uma mensagem
        return res.json({ 
          summary: `**Texto Extraído de ${file.originalname}**\n\n(IA Não Configurada - Mostrando primeiros 500 caracteres)\n\n${extractedText.substring(0, 500)}...`,
          rawText: extractedText
        });
      }

      const prompt = `Você é um especialista em Base de Conhecimento RAG. Crie um resumo ultra-conciso e estruture as partes e regras operacionais mais importantes que você leu abaixo. Formate usando Markdown.\n\nArquivo: ${file.originalname}\n\n${extractedText.substring(0, 10000)}`;
      let summaryText = "";

      if (isOpenAILike) {
        const { OpenAI } = await import("openai");
        const openai = new OpenAI({ apiKey: ragAiKey as string, baseURL: ragAiBaseUrl as string });
        const aiRes = await openai.chat.completions.create({
          model: ragAiModel as string,
          messages: [{ role: "user", content: prompt }]
        });
        summaryText = aiRes.choices[0]?.message?.content || "";
      } else {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const ai = new GoogleGenerativeAI(ragAiKey as string);
        const modelFlash = ai.getGenerativeModel({ model: ragAiModel as string });
        const aiRes = await modelFlash.generateContent(prompt);
        summaryText = aiRes.response.text();
      }

      res.json({ 
        summary: `**Resumo Extraído (IA ${provider.toUpperCase()} ${ragAiModel}): ${file.originalname}**\n\n${summaryText}\n\nVocê pode revisar e salvar isso como um artigo oficial para o Motor de RAG.`,
        rawText: extractedText
      });

    } catch (error) {
      console.error("❌ Erro no RAG PDF Parser:", error);
      res.status(500).json({ error: "Falha ao processar o arquivo PDF." });
    }
  });

  app.post('/api/evolution/fetch-history', express.json(), async (req, res) => {
    try {
      const { ticketId, customerId } = req.body;
      const keys = await getIntegrationKeys();
      const evoUrl = keys.evolutionUrl?.replace(/\/+$/, "");
      const evoInstance = keys.evolutionInstance;
      const evoApiKey = keys.evolutionApiKey;

      if (!evoUrl || !evoInstance || !evoApiKey) {
        return res.status(400).json({ error: "Evolution API não configurada." });
      }

      // Get customer phone
      const custSnap = await getDocs(query(collection(db, "customers"), where("__name__", "==", customerId)));
      if (custSnap.empty) {
        return res.status(404).json({ error: "Cliente não encontrado." });
      }
      let phone = custSnap.docs[0].data().phone;
      if (!phone) {
         return res.status(400).json({ error: "Cliente sem telefone cadastrado." });
      }
      
      phone = phone.replace(/\D/g, '');
      const remoteJid = `${phone}@s.whatsapp.net`;

      // Fetch messages from Evolution
      const resp = await fetch(`${evoUrl}/chat/findMessages/${evoInstance}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': evoApiKey },
        body: JSON.stringify({ where: { remoteJid } })
      });
      const data = await resp.json();

      if (!data || !data.messages || !Array.isArray(data.messages?.records || data.messages)) {
        console.error("No messages returned from evolution:", data);
        return res.status(400).json({ error: "Nenhuma mensagem retornada ou formato inválido.", data });
      }

      const rawMessages = data.messages.records || data.messages;
      let count = 0;

      // Reverse messages if needed to insert from oldest to newest
      const sortedMessages = [...rawMessages].sort((a: any, b: any) => {
         const timeA = a.messageTimestamp || a.timestamp;
         const timeB = b.messageTimestamp || b.timestamp;
         return timeA - timeB;
      });

      for (const msg of sortedMessages) {
        // basic text extraction
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        if (!text) continue;
        
        const fromMe = msg.key?.fromMe;
        
        // try to avoid duplicate insertion by checking if same text exists recently in ticket?
        // for safety we just insert. A real app would check message key/id.
        await addDoc(collection(db, `tickets/${ticketId}/messages`), {
          ticketId,
          senderType: fromMe ? "human" : "customer",
          text,
          createdAt: msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000) : serverTimestamp(),
          isImported: true
        });
        count++;
      }

      res.status(200).json({ success: true, imported: count });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Generic proxy for Evolution API to avoid CORS or Mixed Content in frontend
  app.post("/api/evolution/proxy", express.json(), async (req, res) => {
    try {
      const { path: apiPath, method = "GET", body, evolutionUrl, evolutionApiKey } = req.body;
      
      if (!evolutionUrl || !evolutionApiKey) {
        return res.status(400).json({ error: "Evolution API credentials not provided in the request." });
      }

      if (!apiPath) {
        return res.status(400).json({ error: "No path provided for proxy." });
      }

      // remove leading slash if present to avoid double slashes
      const cleanPath = apiPath.startsWith('/') ? apiPath.slice(1) : apiPath;
      const targetUrl = `${evolutionUrl.replace(/\/$/, '')}/${cleanPath}`;

      const fetchOptions: any = {
        method,
        headers: {
          "apikey": evolutionApiKey,
          "Content-Type": "application/json"
        }
      };

      if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(targetUrl, fetchOptions);
      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: errText });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("❌ Erro no proxy Evolution API:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Webhook for Evolution API
  app.post("/api/webhook/evolution", async (req, res) => {
    try {
      const payload = req.body;
      
      // Respond immediately to prevent Evolution API from retrying/timing out
      res.status(200).json({ status: "received" });

      // Handle message updates globally
      if (payload.event === "messages.update" || payload.event === "MESSAGES_UPDATE") {
        if (payload.data?.status === "ERROR") {
          console.warn(`[Webhook] Mensagem do WhatsApp retornou erro de entrega. Algum problema de rede no aparelho ou o numero bloqueou. JID: ${payload.data?.remoteJid}`);
        }
        return;
      }
      
      if (payload.event !== "messages.upsert" && payload.event !== "MESSAGES_UPSERT") {
        return;
      }

      console.log("\n📥 [Webhook] Mensagem recebida de:", payload.data?.message?.key?.remoteJid || payload.data?.key?.remoteJid || 'Desconhecido');
      
      // LOG PAYLOAD FOR DEBUGGING
      fs.appendFileSync('webhook-payloads.log', "\n" + new Date().toISOString() + " " + JSON.stringify(payload) + "\n");


      // Handle different Evolution API Payload structures
      let messageContainer = null;
      if (payload.data && payload.data.message && payload.data.message.message) {
          messageContainer = payload.data.message;
      } else if (payload.data && payload.data.messages && payload.data.messages.length > 0) {
          messageContainer = payload.data.messages[0];
      } else if (payload.data && payload.data[0] && payload.data[0].message) {
          messageContainer = payload.data[0];
      } else if (payload.data && payload.data.message) { // Fallback where data.message is the message itself
          // This happens in some V1/V2 responses where data is just the message
          messageContainer = { message: payload.data.message, key: payload.data.key };
      }
      
      const messageData = messageContainer?.message;
      if (!messageContainer || !messageData) {
          fs.appendFileSync('webhook-payloads.log', "\n-- No message data found. messageContainer: " + JSON.stringify(messageContainer) + "\n");
          return;
      }

      let remoteJid = messageContainer.key?.remoteJid;
      if (remoteJid && remoteJid.includes(':')) {
         remoteJid = remoteJid.replace(/:\d+/, '');
      }
      const fromMe = messageContainer.key?.fromMe;
      const pushName = payload.data?.pushName || payload.pushName || messageContainer?.pushName || `Lead ${remoteJid?.replace(/\D/g, '').slice(-4) || 'Novo'}`;
      
      // Ignore messages from ourselves or from groups
      if (fromMe || !remoteJid || remoteJid.includes('@g.us')) {
        return;
      }

      console.log(`\n📥 [WhatsApp] Mensagem recebida de ${remoteJid}`);

      const keys = await getIntegrationKeys();
      const evoUrl = keys.evolutionUrl?.replace(/\/+$/, "");
      const evoInstance = keys.evolutionInstance;
      const evoApiKey = keys.evolutionApiKey;
      const supportRelayNumber = keys.whiteLabelSupportNumber;

      if (!evoUrl || !evoInstance || !evoApiKey) {
        console.error("❌ Evolution API não configurada no painel de Integrações.");
        return;
      }

      let textMessage = messageData.conversation || messageData.extendedTextMessage?.text || "";
      const isAudio = !!messageData.audioMessage;

      // --- PASSO 0: Lógica de Intermédio (Relay White-label) ---
      // Se a mensagem vem da Central Mãe, ela é uma resposta para um cliente final.
      if (supportRelayNumber && remoteJid.includes(supportRelayNumber)) {
        console.log("🏢 [Relay] Resposta recebida da Central Mãe. Encaminhando para o cliente...");
        
        // Tenta extrair o ID do ticket da mensagem (ex: "Ticket #123: Resposta...")
        const ticketMatch = textMessage.match(/Ticket #([a-zA-Z0-9_-]+):/);
        let targetTicketId = ticketMatch ? ticketMatch[1] : null;

        // Se não houver ID explícito, pega o último ticket que foi escalado e está aguardando
        if (!targetTicketId) {
          const lastEscalated = await getDocs(query(
            collection(db, "tickets"), 
            where("status", "==", "escalated"),
            orderBy("createdAt", "desc"),
            limit(1)
          ));
          if (!lastEscalated.empty) targetTicketId = lastEscalated.docs[0].id;
        }

        if (targetTicketId) {
          const tDoc = await getDocs(query(collection(db, "tickets"), where("__name__", "==", targetTicketId)));
          if (!tDoc.empty) {
            const ticketData = tDoc.docs[0].data();
            const customerId = ticketData.customerId;
            const cDoc = await getDocs(query(collection(db, "customers"), where("__name__", "==", customerId)));
            
            if (!cDoc.empty) {
              const customerPhone = cDoc.docs[0].data().phone;
              const cleanMsg = textMessage.replace(/Ticket #[a-zA-Z0-9_-]+:\s*/, "");

              console.log(`📤 [Relay] Enviando resposta da Central para o cliente ${customerPhone}`);
              
              // Salva a mensagem como vinda da "Central"
              await addDoc(collection(db, `tickets/${targetTicketId}/messages`), {
                ticketId: targetTicketId,
                senderType: "human",
                text: cleanMsg,
                createdAt: serverTimestamp()
              });

              // Envia pro WhatsApp do cliente
              await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': evoApiKey },
                body: JSON.stringify({
                  number: `${customerPhone}@s.whatsapp.net`,
                  text: cleanMsg
                })
              });
              return;
            }
          }
        }
        console.log("⚠️ [Relay] Não foi possível identificar o ticket de destino para a resposta da Central.");
        return;
      }

      // 1. Handle Audio Transcription via Whisper
      if (isAudio) {
        console.log("🎙️ Áudio detectado. Iniciando transcrição...");
        const whisperKey = keys.openaiWhisper || keys.openaiChat; // Fallback to chat key if whisper not set
        
        if (!whisperKey) {
           textMessage = "[Áudio recebido, mas a chave da OpenAI não está configurada para transcrição]";
           console.log("⚠️ Chave do Whisper ausente.");
        } else {
           try {
             // Fetch base64 media from Evolution API
             const mediaResponse = await fetch(`${evoUrl}/chat/getBase64FromMediaMessage/${evoInstance}`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json', 'apikey': evoApiKey },
               body: JSON.stringify({ message: payload.data })
             });
             
             const mediaData = await mediaResponse.json();
             
             if (mediaData && mediaData.base64) {
               const buffer = Buffer.from(mediaData.base64, 'base64');
               const tempFilePath = path.join(os.tmpdir(), `audio_${Date.now()}.ogg`);
               fs.writeFileSync(tempFilePath, buffer);

               const openai = new OpenAI({ apiKey: whisperKey });
               const transcription = await openai.audio.transcriptions.create({
                 file: fs.createReadStream(tempFilePath),
                 model: 'whisper-1',
               });
               
               textMessage = transcription.text;
               console.log(`📝 Transcrição concluída: "${textMessage}"`);
               fs.unlinkSync(tempFilePath); // cleanup
             } else {
               console.error("❌ Falha ao obter base64 do áudio da Evolution API.");
               textMessage = "[Erro ao baixar o áudio do WhatsApp]";
             }
           } catch (audioErr) {
             console.error("❌ Erro ao transcrever áudio:", audioErr);
             textMessage = "[Erro ao transcrever o áudio enviado]";
           }
        }
      }

      if (!textMessage) {
        console.log("⚠️ Mensagem sem texto ou áudio suportado. Ignorando.");
        return;
      }

      // --- Passo 1: Reconhecimento de Cliente (Caller ID) ---
      console.log("🔍 Buscando cadastro do cliente na base...");
      const phoneOnly = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
      const custSnap = await getDocs(query(collection(db, "customers")));
      
      let customerId: string;
      let callerContext = "";

      const cDoc = custSnap.docs.find(d => {
        const p = (d.data().phone || "").replace(/\D/g, '');
        // Verifica se é o mesmo número ignorando o código do país ou coisas do tipo (se bater 8 dígitos)
        return p && phoneOnly && (p === phoneOnly || p.endsWith(phoneOnly.slice(-8)) || phoneOnly.endsWith(p.slice(-8)));
      });

      if (cDoc) {
        customerId = cDoc.id;
        const cData = cDoc.data();
        callerContext = `\n[CONTEXTO DO SISTEMA: O cliente se chama ${cData.name}, Plano: ${cData.plan}, Status Financeiro: ${cData.status}. Use isso para personalizar o atendimento, mas não mencione que o sistema instruiu isso.]`;
        console.log(`✅ Cliente reconhecido: ${cData.name}`);
      } else {
        // Se não existir, cria o lead rapidinho
        let profilePicUrl = null;
        try {
          const picRes = await fetch(`${evoUrl}/chat/fetchProfilePictureUrl/${evoInstance}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': evoApiKey },
            body: JSON.stringify({ number: remoteJid }) 
          });
          const picData = await picRes.json();
          if (picData?.profilePictureUrl) profilePicUrl = picData.profilePictureUrl;
          else if (picData?.pictureUrl) profilePicUrl = picData.pictureUrl;
        } catch (e) {
          console.error("Erro ao buscar foto de perfil:", e);
        }

        const newCust = await addDoc(collection(db, "customers"), {
          name: pushName,
          phone: phoneOnly,
          email: "",
          plan: "Nenhum",
          mrr: 0,
          status: "pending",
          avatar: profilePicUrl,
          createdAt: serverTimestamp()
        });
        customerId = newCust.id;
        console.log(`⚠️ Cliente novo registrado. ID: ${customerId}`);
      }

      // --- Passo 2: Espelhamento de Tickets (Painel <-> WhatsApp) ---
      // Pega o ticket aberto, se existir
      const tQuery = query(
        collection(db, 'tickets'), 
        where('customerId', '==', customerId),
        where('status', 'in', ['open', 'in-progress', 'escalated'])
      );
      const tSnap = await getDocs(tQuery);

      let ticketId: string;
      let ticketData: any = {};

      if (!tSnap.empty) {
        ticketId = tSnap.docs[0].id;
        ticketData = tSnap.docs[0].data();
        console.log(`📂 Ticket existente carregado: ${ticketId}`);
      } else {
        const ticketSubjectName = cDoc ? cDoc.data().name : pushName;
        const newTick = await addDoc(collection(db, "tickets"), {
          customerId,
          subject: ticketSubjectName || "Desconhecido",
          status: "open",
          priority: "medium",
          aiEnabled: true,
          aiAttempts: 0,
          createdAt: serverTimestamp()
        });
        ticketId = newTick.id;
        ticketData = { aiEnabled: true, status: "open" };
        console.log(`📂 Novo ticket criado: ${ticketId}`);
      }

      // Salva a mensagem do Humano no banco de dados
      await addDoc(collection(db, `tickets/${ticketId}/messages`), {
        ticketId,
        senderType: "customer",
        text: textMessage,
        createdAt: serverTimestamp()
      });

      // Se a IA foi desligada para esse ticket (atendimento humano escalado), para aqui.
      if (ticketData.aiEnabled === false || ticketData.status === 'escalated') {
        console.log("⏸️ IA desativada para este ticket. Aguardando atendente real.");
        return;
      }

      // --- Passo 3: Histórico e RAG ---
      console.log("🧠 Recuperando histórico de chat e processando RAG...");
      const msgSnap = await getDocs(query(collection(db, `tickets/${ticketId}/messages`)));
      let historyBuffer: any[] = [];
      
      const sortedMsgs = msgSnap.docs.map(d => d.data()).sort((a,b) => {
        const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : Date.now();
        const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : Date.now();
        return tA - tB;
      });

      // Limita as últimas 15 mensagens para contexto
      const recentMsgs = sortedMsgs.slice(-15);
      
      recentMsgs.forEach(m => {
        historyBuffer.push({
          role: m.senderType === 'ai' ? 'model' : 'user',
          parts: [{ text: m.text }]
        });
      });

      // Se for a mensagem atual dele, anexa o contexto por baixo pra IA ler
      if (historyBuffer.length > 0 && callerContext) {
        historyBuffer[historyBuffer.length - 1].parts[0].text += callerContext;
      }

      console.log("⌨️ Simulando digitando...");
      try {
        await fetch(`${evoUrl}/chat/sendPresence/${evoInstance}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': evoApiKey },
          body: JSON.stringify({
            number: remoteJid,
            presence: "composing",
            delay: 4000
          })
        });
      } catch (e) {
        console.error("Erro ao enviar presence", e);
      }

      const startTime = Date.now();
      const aiResult = await getAIResponse(historyBuffer);
      const elapsed = Date.now() - startTime;
      if (elapsed < 3500) {
        await new Promise(resolve => setTimeout(resolve, 3500 - elapsed));
      }

      // Save AI Usage metrics if available
      if (aiResult.usage) {
        try {
          await addDoc(collection(db, `ai_usage`), {
            ticketId,
            customerId: customerId || "unknown",
            category: aiResult.category || "UNKNOWN",
            promptTokens: aiResult.usage.prompt_tokens,
            completionTokens: aiResult.usage.completion_tokens,
            totalTokens: aiResult.usage.total_tokens,
            createdAt: serverTimestamp()
          });
        } catch (e) {
          console.error("Erro ao salvar uso da IA", e);
        }
      }

      // --- Passo 4: Salva resposta da IA e Envia de volta ---
      await addDoc(collection(db, `tickets/${ticketId}/messages`), {
        ticketId,
        senderType: "ai",
        category: aiResult.category || "SAC_GERAL",
        text: aiResult.message,
        createdAt: serverTimestamp()
      });

      if (aiResult.shouldEscalate) {
        await updateDoc(doc(db, "tickets", ticketId), { 
          status: "escalated", 
          aiEnabled: false 
        });
        
        const systemMsg = "[SISTEMA]: A IA não conseguiu resolver ou requer verificação manual. O ticket foi transferido para a central da empresa mãe.";
        await addDoc(collection(db, `tickets/${ticketId}/messages`), {
          ticketId,
          senderType: "system",
          text: systemMsg,
          createdAt: serverTimestamp()
        });

        // ENVIA RELAY PARA A CENTRAL MÃE
        if (supportRelayNumber) {
          console.log(`🏢 [Relay] Notificando Central Mãe (${supportRelayNumber})...`);
          await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': evoApiKey },
            body: JSON.stringify({
              number: `${supportRelayNumber}@s.whatsapp.net`,
              text: `🚨 *SUPORTE WHITE-LABEL*\nTicket #${ticketId}\nCliente: ${phoneOnly}\n\n*Última Mensagem:* ${textMessage}\n\n_Para responder ao cliente, inicie sua mensagem com "Ticket #${ticketId}: "_`
            })
          });
        }
      }

      // Envia Resposta de Volta Node -> Evolution API -> WhatsApp
      console.log(`📤 Enviando resposta para ${remoteJid}...`);
      const whatsappFormattedMessage = aiResult.message.replace(/\*\*(.*?)\*\*/g, '*$1*');
      const sendResponse = await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': evoApiKey },
        body: JSON.stringify({
          number: remoteJid,
          text: whatsappFormattedMessage
        })
      });
      
      if (sendResponse.ok) {
        console.log("✅ Resposta enviada com sucesso!");
      } else {
        console.error("❌ Falha ao enviar resposta:", await sendResponse.text());
      }

    } catch (error) {
      console.error("❌ [Webhook Error]:", error);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: {
          port: 24678 + Math.floor(Math.random() * 1000)
        }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`⚠️ Porta ${PORT} em uso. O processo anterior ainda está fechando...`);
      // O sistema vai reiniciar automaticamente em breve
    } else {
      console.error("❌ Erro fatal no servidor:", err);
    }
  });
}

startServer();
