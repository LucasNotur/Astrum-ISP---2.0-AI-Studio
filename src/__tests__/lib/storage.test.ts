import { describe, it, expect, vi, beforeEach } from 'vitest';

// FZ-5: storage agora é Supabase Storage (bucket "uploads")
const mockUpload = vi.fn(async () => ({ data: { path: 'mock' }, error: null }));
const mockRemove = vi.fn(async () => ({ data: null, error: null }));
const mockList = vi.fn(async () => ({ data: [{ name: 'file1.txt' }], error: null }));
const mockGetPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `http://mocked-url.com/${path}` } }));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        remove: mockRemove,
        list: mockList,
        getPublicUrl: mockGetPublicUrl,
      })),
    },
  },
}));

import { uploadTenantFile, downloadTenantFile, deleteTenantFile, listTenantFiles, uploadAttachment } from '../../lib/storage';

describe('Storage Module Tests (Supabase Storage)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('1. uploadTenantFile com tenantId válido → path gerado deve começar com tenants/{tenantId}/', async () => {
        const url = await uploadTenantFile('tenant1', 'docs', 'file.txt', new Blob(['test']));
        expect(mockUpload).toHaveBeenCalledWith('tenants/tenant1/docs/file.txt', expect.anything(), expect.anything());
        expect(url).toBe('http://mocked-url.com/tenants/tenant1/docs/file.txt');
    });

    it('2. uploadTenantFile sem tenantId → deve lançar TENANT_REQUIRED', async () => {
        await expect(uploadTenantFile('', 'docs', 'file.txt', new Blob(['test']))).rejects.toThrow('TENANT_REQUIRED');
    });

    it('3. uploadAttachment sem tenantId e sem prefixo tenants/ → INVALID_STORAGE_PATH', async () => {
        const file = new File(['test'], 'test.txt');
        await expect(uploadAttachment(file, 'public')).rejects.toThrow(/INVALID_STORAGE_PATH/);
    });

    it('4. downloadTenantFile tentando acessar arquivo de outro tenant → deve lançar TENANT_MISMATCH', async () => {
        await expect(downloadTenantFile('tenant1', '..', 'tenant2/file.txt')).rejects.toThrow('TENANT_MISMATCH');
    });

    it('5. listTenantFiles → deve listar do path do tenant especificado', async () => {
        const files = await listTenantFiles('tenant1', 'docs');
        expect(mockList).toHaveBeenCalledWith('tenants/tenant1/docs');
        expect(files.length).toBe(1);
        expect(files[0].url).toContain('tenants/tenant1/docs/file1.txt');
    });

    it('6. deleteTenantFile de arquivo de outro tenant → deve ser bloqueado', async () => {
        await expect(deleteTenantFile('tenant1', '../tenant2', 'file.txt')).rejects.toThrow('TENANT_MISMATCH');
    });

    it('7. deleteTenantFile válido → chama remove com o path correto', async () => {
        await deleteTenantFile('tenant1', 'docs', 'file.txt');
        expect(mockRemove).toHaveBeenCalledWith(['tenants/tenant1/docs/file.txt']);
    });

    it('8. uploadAttachment com tenantId → prefixa tenants/{tenantId}/', async () => {
        const file = new File(['test'], 'test.png');
        const url = await uploadAttachment(file, 'chat', 'tenant9');
        expect(mockUpload).toHaveBeenCalledWith(expect.stringMatching(/^tenants\/tenant9\/chat\//), file);
        expect(url).toContain('tenants/tenant9/chat/');
    });
});
