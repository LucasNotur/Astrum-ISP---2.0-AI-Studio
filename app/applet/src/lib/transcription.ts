import fs from 'fs';
import path from 'path';

export interface TranscriptionResult {
  text?: string;
  error?: string;
  fallback?: string;
}

export interface TenantContext {
  id: string;
  transcription_enabled: boolean;
}

export interface MessageDocument {
  id: string;
  transcribed_text?: string;
}

export interface FirestoreDB {
  updateMessage(messageId: string, data: Partial<MessageDocument>): Promise<void>;
}

export class TranscriptionService {
  constructor(private db: FirestoreDB) {}
  
  async transcribeAudio(
    tenant: TenantContext,
    audioUrl: string,
    messageId: string
  ): Promise<TranscriptionResult> {
    if (!tenant.transcription_enabled) {
      return { 
        error: 'TRANSCRIPTION_DISABLED', 
        fallback: 'Por favor, digite sua mensagem.' 
      };
    }

    const tempFilePath = path.join('/tmp', `audio_${Date.now()}_${Math.random().toString(36).substring(2, 11)}.ogg`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const downloadRes = await fetch(audioUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!downloadRes.ok) {
        throw new Error(`Download failed with status: ${downloadRes.status}`);
      }

      const buffer = await downloadRes.arrayBuffer();
      fs.writeFileSync(tempFilePath, Buffer.from(buffer));

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        body: 'fake-form-data',
      });

      if (!whisperRes.ok) {
        throw new Error('Whisper API failed');
      }

      const data = await whisperRes.json();

      if (!data || !data.text || data.text.trim() === '') {
         throw new Error('Empty text from Whisper');
      }

      await this.db.updateMessage(messageId, { transcribed_text: data.text });
      
      return { text: data.text };
    } catch (e: any) {
      return {
        error: 'TRANSCRIPTION_FAILED',
        fallback: 'Não consegui transcrever o áudio, poderia digitar?'
      };
    } finally {
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (e) {}
    }
  }
}
