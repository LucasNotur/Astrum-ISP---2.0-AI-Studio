import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));
vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn(() => 'mock-model'),
}));
vi.mock('../logging/logger', () => ({
  infraLogger: { info: vi.fn(), warn: vi.fn() },
}));

import { generateObject } from 'ai';
import {
  classifyDocumentType,
  extractByType,
} from './vision.service';

const mockGenerateObject = generateObject as ReturnType<typeof vi.fn>;

describe('vision.service IA-15', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VISION_STRUCTURED_ENABLED = 'true';
  });

  it('classifyDocumentType returns boleto for boleto doc', async () => {
    mockGenerateObject.mockResolvedValue({ object: { doc_type: 'boleto' } });
    const result = await classifyDocumentType('https://img.test/doc.jpg', 't1');
    expect(result).toBe('boleto');
  });

  it('classifyDocumentType returns desconhecido on error', async () => {
    mockGenerateObject.mockRejectedValue(new Error('fail'));
    const result = await classifyDocumentType('https://img.test/doc.jpg', 't1');
    expect(result).toBe('desconhecido');
  });

  it('classifyDocumentType returns desconhecido when flag is off', async () => {
    process.env.VISION_STRUCTURED_ENABLED = 'false';
    const result = await classifyDocumentType('https://img.test/doc.jpg', 't1');
    expect(result).toBe('desconhecido');
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it('extractByType energia returns extraction with confidence', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { distribuidora: 'CEMIG', valor_cents: 15000, kwh: 200, vencimento: '2026-02-01', confidence: 0.92 },
    });
    const result = await extractByType('https://img.test/energia.jpg', 'energia', 't1');
    expect(result.confidence).toBe(0.92);
    expect((result.extraction as any).distribuidora).toBe('CEMIG');
  });

  it('extractByType concorrente returns extraction', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { operadora: 'Vivo', plano: 'Fibra 300', valor_cents: 9990, confidence: 0.88 },
    });
    const result = await extractByType('https://img.test/conc.jpg', 'concorrente', 't1');
    expect(result.confidence).toBe(0.88);
    expect((result.extraction as any).operadora).toBe('Vivo');
  });

  it('extractByType desconhecido returns empty', async () => {
    const result = await extractByType('https://img.test/x.jpg', 'desconhecido', 't1');
    expect(result.confidence).toBe(0);
  });

  it('extractByType boleto delegates to extractBoleto', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { is_boleto: true, confidence: 0.95, valor_cents: 5000, linha_digitavel: '12345678901234567890123456789012345678901234567' },
    });
    const result = await extractByType('https://img.test/bol.jpg', 'boleto', 't1');
    expect(result.confidence).toBe(0.95);
  });
});
