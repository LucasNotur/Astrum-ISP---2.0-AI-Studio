import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TranscriptionService, FirestoreDB, TenantContext } from '../../../src/lib/transcription';
import fs from 'fs';

const mockDb: import('vitest').Mocked<FirestoreDB> = {
  updateMessage: vi.fn(),
};

global.fetch = vi.fn();

describe('Transcription Tests', () => {
  let service: TranscriptionService;
  
  beforeEach(() => {
    vi.clearAllMocks();
    service = new TranscriptionService(mockDb);
  });

  const tenant: TenantContext = { id: 't1', transcription_enabled: true };

  it('1. URL válida -> retorna texto transcrito não vazio', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'Texto transcrito válido' }) } as unknown as Response);
    
    const result = await service.transcribeAudio(tenant, 'http://valida.com/audio.ogg', 'msg1');
    expect(result.text).toBe('Texto transcrito válido');
    expect(result.error).toBeUndefined();
  });

  it('2. URL inválida (404) -> retorna { error: TRANSCRIPTION_FAILED, fallback: texto padrão }', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({ ok: false, status: 404 } as unknown as Response);

    const result = await service.transcribeAudio(tenant, 'http://invalida.com/audio.ogg', 'msg1');
    expect(result.error).toBe('TRANSCRIPTION_FAILED');
    expect(result.fallback).toBe('Não consegui transcrever o áudio, poderia digitar?');
  });

  it('3. Timeout > 10s -> retorna fallback sem travar o worker', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Timeout'));

    const result = await service.transcribeAudio(tenant, 'http://timeout.com/audio.ogg', 'msg1');
    expect(result.error).toBe('TRANSCRIPTION_FAILED');
    expect(result.fallback).toBe('Não consegui transcrever o áudio, poderia digitar?');
  });

  it('4. Arquivo temporário -> deletado após transcrição (sucesso ou falha)', async () => {
    let createdFile = '';
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation((path) => {
      createdFile = path as string;
      fs.closeSync(fs.openSync(createdFile, 'w'));
    });
    
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'Ok' }) } as unknown as Response);

    await service.transcribeAudio(tenant, 'http://valida.com/audio.ogg', 'msg1');

    expect(createdFile).not.toBe('');
    expect(fs.existsSync(createdFile)).toBe(false);

    writeSpy.mockRestore();
  });

  it('5. Transcrição desativada no tenant -> não chama Whisper API, envia mensagem pedindo texto', async () => {
    const disabledTenant: TenantContext = { id: 't2', transcription_enabled: false };
    const result = await service.transcribeAudio(disabledTenant, 'http://valida.com/audio.ogg', 'msg1');
    
    expect(result.error).toBe('TRANSCRIPTION_DISABLED');
    expect(result.fallback).toBe('Por favor, digite sua mensagem.');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('6. Whisper retorna texto vazio -> tratado como falha, usa fallback', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: '   ' }) } as unknown as Response);

    const result = await service.transcribeAudio(tenant, 'http://valida.com/audio.ogg', 'msg1');
    expect(result.error).toBe('TRANSCRIPTION_FAILED');
  });

  it('7. Transcrição bem-sucedida -> texto salvo no documento da mensagem no Firestore', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'Mensagem falada' }) } as unknown as Response);

    await service.transcribeAudio(tenant, 'http://valida.com/audio.ogg', 'msg2');
    
    expect(mockDb.updateMessage).toHaveBeenCalledWith('msg2', { transcribed_text: 'Mensagem falada' });
  });
});
