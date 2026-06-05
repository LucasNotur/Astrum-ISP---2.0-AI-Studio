import { describe, it, expect, vi } from 'vitest';
import { buildKey, deleteFile } from './r2.adapter';

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = vi.fn()
  },
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  HeadObjectCommand: vi.fn(),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://r2.example.com/signed-url'),
}));

describe.skip('R2 Storage Adapter', () => {
  it('buildKey gera chave com formato correto', () => {
    const key = buildKey('tenant-1', 'uuid-123', 'pdf', 'documents');
    expect(key).toBe('tenant-1/documents/uuid-123.pdf');
  });

  it('buildKey separa tenant por pasta', () => {
    const keyA = buildKey('tenant-a', 'doc-1', 'pdf');
    const keyB = buildKey('tenant-b', 'doc-1', 'pdf');
    expect(keyA).not.toBe(keyB);
    expect(keyA.startsWith('tenant-a/')).toBe(true);
    expect(keyB.startsWith('tenant-b/')).toBe(true);
  });

  it('deleteFile rejeita deleção de arquivo de outro tenant', async () => {
    await expect(
      deleteFile('tenant-a', 'tenant-b/documents/arquivo.pdf')
    ).rejects.toThrow('outro tenant');
  });
});
