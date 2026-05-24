import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadTenantFile, downloadTenantFile, deleteTenantFile, listTenantFiles, uploadAttachment } from '../../lib/storage';
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';

// Mocking the imported module 'firebase/storage' (we mock what's used instead of Supabase client because the internal implementation uses Firebase)
vi.mock('firebase/storage', () => {
    return {
        ref: vi.fn((storage, path) => ({ isRef: true, path })),
        uploadBytes: vi.fn(),
        getDownloadURL: vi.fn().mockResolvedValue('http://mocked-url.com/file'),
        deleteObject: vi.fn(),
        listAll: vi.fn().mockResolvedValue({
            items: [
                { name: 'file1.txt', fullPath: 'tenants/tenant1/docs/file1.txt' }
            ]
        })
    };
});

vi.mock('../../lib/firebase', () => ({
    storage: {}
}));

describe('Storage Module Tests (Isolated)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('1. uploadTenantFile com tenantId válido → path gerado deve começar com tenants/{tenantId}/', async () => {
        const url = await uploadTenantFile('tenant1', 'docs', 'file.txt', new Blob(['test']));
        expect(ref).toHaveBeenCalledWith(expect.anything(), 'tenants/tenant1/docs/file.txt');
        expect(url).toBe('http://mocked-url.com/file');
    });

    it('2. uploadTenantFile sem tenantId → deve lançar TENANT_REQUIRED', async () => {
        await expect(uploadTenantFile('', 'docs', 'file.txt', new Blob(['test']))).rejects.toThrow('TENANT_REQUIRED');
    });

    it('3. uploadTenantFile com path não iniciando em tenants/ → deve rejeitar com INVALID_PATH (via uploadAttachment test)', async () => {
        // Since uploadTenantFile always prefixes internally with 'tenants/', 
        // we test the internal validation for missing tenant prefix via uploadAttachment without tenantId fallback
        const file = new File(['test'], 'test.txt');
        await expect(uploadAttachment(file, 'public')).rejects.toThrow(/INVALID_STORAGE_PATH/);
    });

    it('4. downloadTenantFile tentando acessar arquivo de outro tenant → deve lançar TENANT_MISMATCH', async () => {
        // Attempting path traversal to access a different tenant's folder
        await expect(downloadTenantFile('tenant1', '..', 'tenant2/file.txt')).rejects.toThrow('TENANT_MISMATCH');
    });

    it('5. listTenantFiles → deve retornar APENAS arquivos do tenant especificado', async () => {
        const files = await listTenantFiles('tenant1', 'docs');
        expect(ref).toHaveBeenCalledWith(expect.anything(), 'tenants/tenant1/docs');
        expect(listAll).toHaveBeenCalled();
        expect(files.length).toBe(1);
        expect(files[0].url).toBe('http://mocked-url.com/file');
    });

    it('6. deleteTenantFile de arquivo de outro tenant → deve ser bloqueado', async () => {
        await expect(deleteTenantFile('tenant1', '../tenant2', 'file.txt')).rejects.toThrow('TENANT_MISMATCH');
    });
});
