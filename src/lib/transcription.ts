import OpenAI from 'openai';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { adminDb } from './firebaseAdmin';

export async function transcribeAudio(audioUrl: string, apiKey?: string): Promise<string | null> {
  const currentApiKey = apiKey || process.env.OPENAI_API_KEY || '';
  const openai = new OpenAI({ apiKey: currentApiKey, dangerouslyAllowBrowser: true });

  try {
    let audioBuffer: ArrayBuffer;
    
    // Check if it's base64 or a real URL
    if (audioUrl.startsWith('http')) {
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        throw new Error(`Failed to fetch audio from URL: ${audioResponse.statusText}`);
      }
      audioBuffer = await audioResponse.arrayBuffer();
    } else {
      let base64Data = audioUrl;
      if (audioUrl.startsWith('data:')) {
        base64Data = audioUrl.split(',')[1] || audioUrl;
      }
      const buffer = Buffer.from(base64Data, 'base64');
      audioBuffer = new Uint8Array(buffer).buffer;
    }

    const audioFile = await OpenAI.toFile(Buffer.from(audioBuffer), 'audio.ogg', { type: 'audio/ogg' });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'pt',
      response_format: 'text',
    });

    // OpenAI returns the text directly if response_format is 'text'
    return typeof transcription === 'string' ? transcription : (transcription as any).text;
  } catch (err) {
    console.error('[WHISPER] Transcription failed:', err);
    return null;
  }
}

export async function downloadAndTranscribeAudio(audioUrl: string, tenantId: string) {
  const fallbackMessage = "[Cliente enviou um áudio. A transcrição falhou ou está desativada. Por favor, envie em texto.]"; 
  
  try {
    let apiKey = process.env.OPENAI_API_KEY;
    let provider = 'whisper';
    let enabled = true;
    
    // Check specific transcription settings
    if (tenantId) {
       const transDoc = await adminDb.collection("tenants").doc(tenantId).collection("settings").doc("transcription").get();
       if (transDoc.exists) {
          const transData = transDoc.data();
          enabled = transData?.enabled !== false;
          provider = transData?.provider || 'whisper';
          if (transData?.apiKey) {
            apiKey = transData.apiKey;
          }
       } else {
         // Fallback to legacy
         const tenantDoc = await adminDb.collection("tenants").doc(tenantId).get();
         const data = tenantDoc.data();
         if (data?.openai_api_key) {
            apiKey = data.openai_api_key;
         }
       }
    }

    if (!enabled) {
      return { text: "[Áudio recebido, mas a transcrição de voz está desativada. Por favor, responda o cliente.]" };
    }
    
    if (!apiKey) {
      throw new Error("No transcription API key found");
    }

    // Default OpenAI client
    const openaiOptions: any = { apiKey };
    
    // If Custom, we could set alternative baseURL
    if (provider === 'custom') {
      // Just setting apiKey for now, assuming standard client config override could be done here
    }

    const openai = new OpenAI(openaiOptions);
    const uuid = uuidv4();
    const tmpPath = path.join('/tmp', `${uuid}.ogg`);
    
    // Download with 10s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    let audioBuffer: Buffer;
    
    if (audioUrl.startsWith('http')) {
      const response = await fetch(audioUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to download audio: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuffer);
    } else {
      clearTimeout(timeoutId);
      let base64Data = audioUrl;
      if (audioUrl.startsWith('data:')) {
        base64Data = audioUrl.split(',')[1] || audioUrl;
      }
      audioBuffer = Buffer.from(base64Data, 'base64');
    }

    // Gravar no /tmp/
    await fs.writeFile(tmpPath, audioBuffer);
    
    try {
      const audioReadStream = fsSync.createReadStream(tmpPath);
      
      const transcription = await openai.audio.transcriptions.create({
        file: audioReadStream,
        model: 'whisper-1',
        language: 'pt',
        response_format: 'text'
      });
      
      const text = typeof transcription === 'string' ? transcription : (transcription as any).text;
      return { text };
    } finally {
      // Deletar arquivo independentemente de sucesso
      await fs.unlink(tmpPath).catch(() => {});
    }
    
  } catch (err: any) {
    console.error("[WHISPER] downloadAndTranscribeAudio failed:", err);
    return { 
      error: 'TRANSCRIPTION_FAILED', 
      fallback: fallbackMessage,
      details: err.message
    };
  }
}

