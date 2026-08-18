import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted garante que a factory do vi.mock enxergue os mocks (vitest hoista o vi.mock).
const { pdfParseConstructorMock, pdfGetTextMock, pdfDestroyMock } = vi.hoisted(() => ({
  pdfParseConstructorMock: vi.fn(),
  pdfGetTextMock: vi.fn(),
  pdfDestroyMock: vi.fn(),
}));
const { mammothExtractRawTextMock } = vi.hoisted(() => ({
  mammothExtractRawTextMock: vi.fn(),
}));

vi.mock('pdf-parse', () => ({
  PDFParse: class {
    constructor(...args: any[]) {
      pdfParseConstructorMock(...args);
    }
    getText() {
      return pdfGetTextMock();
    }
    destroy() {
      return pdfDestroyMock();
    }
  },
}));
vi.mock('mammoth', () => ({
  default: { extractRawText: mammothExtractRawTextMock },
}));

import { extractText } from './document-extractor.service';

describe('document-extractor.service — extractText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('txt: retorna o buffer decodificado direto', async () => {
    const text = await extractText(Buffer.from('conteúdo de texto puro', 'utf-8'), 'txt');
    expect(text).toBe('conteúdo de texto puro');
  });

  it('md: retorna o buffer decodificado direto', async () => {
    const text = await extractText(Buffer.from('# Título\nmarkdown aqui', 'utf-8'), 'md');
    expect(text).toBe('# Título\nmarkdown aqui');
  });

  it('pdf: instancia PDFParse com o buffer, chama getText() e devolve result.text', async () => {
    pdfGetTextMock.mockResolvedValue({ text: 'texto extraído do pdf' });

    const text = await extractText(Buffer.from('%PDF-1.4 fake', 'utf-8'), 'pdf');

    expect(text).toBe('texto extraído do pdf');
    expect(pdfParseConstructorMock).toHaveBeenCalledTimes(1);
    expect(pdfParseConstructorMock.mock.calls[0][0]).toEqual({ data: expect.any(Buffer) });
    expect(pdfGetTextMock).toHaveBeenCalledTimes(1);
  });

  it('pdf: destroy() é chamado no finally mesmo quando getText() funciona', async () => {
    pdfGetTextMock.mockResolvedValue({ text: 'ok' });

    await extractText(Buffer.from('%PDF-1.4 fake', 'utf-8'), 'pdf');

    expect(pdfDestroyMock).toHaveBeenCalledTimes(1);
  });

  it('pdf: destroy() é chamado no finally mesmo quando getText() lança', async () => {
    pdfGetTextMock.mockRejectedValue(new Error('pdf quebrado'));

    await expect(extractText(Buffer.from('%PDF-1.4 fake', 'utf-8'), 'pdf'))
      .rejects.toThrow('pdf quebrado');
    expect(pdfDestroyMock).toHaveBeenCalledTimes(1);
  });

  it('pdf: result.text vazio/ausente retorna string vazia', async () => {
    pdfGetTextMock.mockResolvedValue({});

    const text = await extractText(Buffer.from('%PDF-1.4 fake', 'utf-8'), 'pdf');
    expect(text).toBe('');
  });

  it('docx: chama extractRawText({buffer}) e retorna result.value', async () => {
    mammothExtractRawTextMock.mockResolvedValue({
      value: 'texto extraído do docx',
      messages: [],
    });

    const buffer = Buffer.from('fake-docx', 'utf-8');
    const text = await extractText(buffer, 'docx');

    expect(text).toBe('texto extraído do docx');
    expect(mammothExtractRawTextMock).toHaveBeenCalledWith({ buffer });
  });

  it('tipo desconhecido lança erro com o tipo na mensagem', async () => {
    await expect(extractText(Buffer.from('x', 'utf-8'), 'xlsx'))
      .rejects.toThrow('Tipo de arquivo não suportado para extração: xlsx');
  });
});
