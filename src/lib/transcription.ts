import OpenAI, { toFile } from 'openai';

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

    const audioFile = await toFile(Buffer.from(audioBuffer), 'audio.ogg', { type: 'audio/ogg' });

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
