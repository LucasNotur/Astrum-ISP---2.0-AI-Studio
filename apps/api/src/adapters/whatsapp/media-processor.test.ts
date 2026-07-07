import { describe, it, expect, vi } from 'vitest';
import { processInboundMedia, type MediaDeps } from './media-processor.service';

const deps = (over: Partial<MediaDeps> = {}): MediaDeps => ({
  transcribeAudio: vi.fn().mockResolvedValue({ text: 'minha internet caiu' }),
  describeImage: vi.fn().mockResolvedValue('Roteador TP-Link com LED PON vermelho (sem sinal óptico)'),
  storeMedia: vi.fn().mockResolvedValue('r2://bucket/file-1'),
  visionEnabled: true,
  ...over,
});

describe('processInboundMedia — texto', () => {
  it('texto puro passa direto', async () => {
    const r = await processInboundMedia({ textMessage: 'boa tarde' }, 't1', deps());
    expect(r.mediaType).toBe('text');
    expect(r.textForLLM).toBe('boa tarde');
  });
});

describe('processInboundMedia — áudio (F1)', () => {
  it('transcreve e prefixa', async () => {
    const r = await processInboundMedia({ textMessage: '', isAudio: true, audioUrl: 'http://a/x.ogg' }, 't1', deps());
    expect(r.mediaType).toBe('audio');
    expect(r.textForLLM).toBe('[Mensagem de voz transcrita]: minha internet caiu');
  });

  it('fail-open: transcrição falha → pede reenvio em texto', async () => {
    const r = await processInboundMedia(
      { textMessage: '', isAudio: true, audioUrl: 'http://a/x.ogg' },
      't1',
      deps({ transcribeAudio: vi.fn().mockResolvedValue(null) }),
    );
    expect(r.textForLLM).toContain('reenviar em texto');
  });

  it('guarda o áudio no R2 quando há base64', async () => {
    const store = vi.fn().mockResolvedValue('r2://audio/1');
    const r = await processInboundMedia(
      { textMessage: '', isAudio: true, base64Media: 'B64', mediaMimeType: 'audio/ogg' },
      't1',
      deps({ storeMedia: store }),
    );
    expect(store).toHaveBeenCalled();
    expect(r.storedRef).toBe('r2://audio/1');
  });
});

describe('processInboundMedia — imagem (F2)', () => {
  it('gera laudo de visão como extensão do system prompt', async () => {
    const r = await processInboundMedia(
      { textMessage: 'olha meu roteador', isImage: true, imageUrl: 'http://img/1.jpg' },
      't1',
      deps(),
    );
    expect(r.mediaType).toBe('image');
    expect(r.systemPromptExtension).toContain('LED PON vermelho');
    expect(r.textForLLM).toBe('olha meu roteador');
  });

  it('respeita visionEnabled=false (não chama visão)', async () => {
    const describe = vi.fn();
    const r = await processInboundMedia(
      { textMessage: 'foto', isImage: true, imageUrl: 'http://img/1.jpg' },
      't1',
      deps({ visionEnabled: false, describeImage: describe }),
    );
    expect(describe).not.toHaveBeenCalled();
    expect(r.systemPromptExtension).toBeNull();
  });

  it('fail-open: visão falha → segue sem laudo', async () => {
    const r = await processInboundMedia(
      { textMessage: 'foto', isImage: true, imageUrl: 'http://img/1.jpg' },
      't1',
      deps({ describeImage: vi.fn().mockRejectedValue(new Error('vision down')) }),
    );
    expect(r.systemPromptExtension).toBeNull();
    expect(r.textForLLM).toBe('foto');
  });
});

describe('processInboundMedia — documento (F3)', () => {
  it('guarda o documento e referencia no contexto', async () => {
    const r = await processInboundMedia(
      { textMessage: 'comprovante', isDocument: true, base64Media: 'B64', mediaMimeType: 'application/pdf' },
      't1',
      deps({ storeMedia: vi.fn().mockResolvedValue('r2://doc/comprovante.pdf') }),
    );
    expect(r.mediaType).toBe('document');
    expect(r.storedRef).toBe('r2://doc/comprovante.pdf');
    expect(r.systemPromptExtension).toContain('r2://doc/comprovante.pdf');
  });

  // IA-04: OCR de boleto via extractBoleto dep
  it('IA-04: boleto válido → extension com valor, vencimento e linha digitável', async () => {
    const r = await processInboundMedia(
      { textMessage: 'meu boleto', isDocument: true, imageUrl: 'http://img/boleto.png' },
      't1',
      deps({
        extractBoleto: vi.fn().mockResolvedValue({
          is_boleto: true, confidence: 0.95,
          valor_cents: 12050, vencimento: '2026-08-15',
          linha_digitavel: '34191790010104351004791020150008291070026000123',
        }),
      }),
    );
    expect(r.systemPromptExtension).toContain('Boleto anexado');
    expect(r.systemPromptExtension).toContain('R$120.50');
    expect(r.systemPromptExtension).toContain('2026-08-15');
    expect(r.systemPromptExtension).toContain('Compare com as faturas');
  });

  it('IA-04: is_boleto=false → comportamento de documento normal', async () => {
    const r = await processInboundMedia(
      { textMessage: 'contrato', isDocument: true, imageUrl: 'http://img/doc.jpg' },
      't1',
      deps({
        extractBoleto: vi.fn().mockResolvedValue({ is_boleto: false, confidence: 0.98 }),
      }),
    );
    expect(r.systemPromptExtension).toBeNull();
    expect(r.textForLLM).toBe('contrato');
  });

  it('IA-04: dep extractBoleto ausente → comportamento de documento normal', async () => {
    const r = await processInboundMedia(
      { textMessage: 'boleto', isDocument: true, imageUrl: 'http://img/boleto.png' },
      't1',
      deps(),
    );
    expect(r.systemPromptExtension).toBeNull();
  });

  it('IA-04: OCR lança → fail-open (cai para documento normal)', async () => {
    const r = await processInboundMedia(
      { textMessage: 'boleto', isDocument: true, imageUrl: 'http://img/boleto.png' },
      't1',
      deps({ extractBoleto: vi.fn().mockRejectedValue(new Error('OCR down')) }),
    );
    expect(r.systemPromptExtension).toBeNull();
    expect(r.textForLLM).toBe('boleto');
  });
});
