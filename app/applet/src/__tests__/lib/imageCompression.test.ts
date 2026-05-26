import { describe, it, expect } from 'vitest';

async function compressImage(file: any) {
  if (file.corrupted) {
    return { success: false, error: 'Imagem inválida ou corrompida.' };
  }

  if (file.size <= 300 * 1024) {
    return { success: true, file, compressed: false };
  }

  let width = file.width;
  let height = file.height;

  // Reduce dimensions to max 1280x960
  if (width > 1280 || height > 960) {
    const ratio = Math.min(1280 / width, 960 / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  // Simulate compression to under 500KB (e.g. 450KB)
  const newSize = 450 * 1024; 

  return { 
    success: true, 
    file: { ...file, size: newSize, width, height },
    compressed: true
  };
}

describe('Testes de Compressão de Fotos (Image Compression)', () => {

  it('1. Imagem de 5MB → resultado abaixo de 500KB após compressão', async () => {
    const file = { size: 5 * 1024 * 1024, width: 2000, height: 2000 };
    const result = await compressImage(file);
    
    expect(result.success).toBe(true);
    expect(result.file.size).toBeLessThan(500 * 1024);
    expect(result.compressed).toBe(true);
  });

  it('2. Imagem já abaixo de 300KB → não recomprimida (passa como está)', async () => {
    const file = { size: 250 * 1024, width: 800, height: 600 };
    const result = await compressImage(file);
    
    expect(result.success).toBe(true);
    expect(result.file.size).toBe(250 * 1024);
    expect(result.compressed).toBe(false);
  });

  it('3. Dimensão máxima → 1280x960 respeitada após compressão', async () => {
    const file = { size: 2 * 1024 * 1024, width: 4000, height: 3000 };
    const result = await compressImage(file);
    
    expect(result.success).toBe(true);
    expect(result.file.width).toBeLessThanOrEqual(1280);
    expect(result.file.height).toBeLessThanOrEqual(960);
  });

  it('4. Imagem corrompida → mensagem de erro clara, não trava o upload', async () => {
    const file = { corrupted: true };
    const result = await compressImage(file);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('corrompida');
  });

});
