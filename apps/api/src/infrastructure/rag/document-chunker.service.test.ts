import { describe, it, expect } from 'vitest';
import { chunkDocument, chunkTechnicalManual } from './document-chunker.service';

describe('Document Chunker', () => {
  it('texto vazio retorna array vazio', () => {
    expect(chunkDocument('')).toHaveLength(0);
  });

  it('texto curto retorna chunk único', () => {
    const chunks = chunkDocument('Texto curto de teste', { minChunkSize: 10 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkIndex).toBe(0);
  });

  it('texto longo é dividido em múltiplos chunks', () => {
    const longText = 'A'.repeat(5000);
    const chunks = chunkDocument(longText, { chunkSize: 1000 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('chunks têm overlap — texto da borda aparece em chunks consecutivos', () => {
    const text = 'Parte A. '.repeat(100) + 'Parte B. '.repeat(100);
    const chunks = chunkDocument(text, { chunkSize: 500, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    // O endChar do chunk 0 deve ser maior que o startChar do chunk 1
    expect(chunks[0].endChar).toBeGreaterThan(chunks[1].startChar);
  });

  it('chunks têm estimativa de tokens', () => {
    const chunks = chunkDocument('Texto para testar tokens', { minChunkSize: 10 });
    expect(chunks[0].tokenEstimate).toBeGreaterThan(0);
  });

  it('chunkTechnicalManual preserva seções', () => {
    const manual = `
# Seção 1
Conteúdo da primeira seção.

## Seção 1.1
Sub-conteúdo aqui.

# Seção 2
Conteúdo da segunda seção.
    `.trim();

    const chunks = chunkTechnicalManual(manual);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});
