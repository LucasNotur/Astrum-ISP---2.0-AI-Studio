// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { createElement } from 'react';
import { render, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// FZ-5: uploads agora vão para o Supabase Storage via lib/storage.uploadTenantFile
const mockUploadTenantFile = vi.fn(
  async (_tenantId: string, category: string, filename: string) =>
    `https://mock.url/tenants/t1/${category}/${filename}`,
);
vi.mock('../../lib/storage', () => ({
  uploadTenantFile: (...args: any[]) => mockUploadTenantFile(...(args as [string, string, string])),
}));

import { SignaturePad } from '../../components/SignaturePad';
import { processSignatureAndPdf } from '../../lib/signaturePad';

const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('SignaturePad and PDF generation', () => {
  let toDataURLMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    toDataURLMock = vi.fn().mockReturnValue(validPng);

    // data_url → Blob usa fetch; jsdom não implementa fetch de data URLs
    (global.fetch as any) = vi.fn().mockResolvedValue({ blob: async () => new Blob(['x']) });

    window.HTMLCanvasElement.prototype.toDataURL = toDataURLMock;
    window.HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      fillStyle: '',
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      closePath: vi.fn()
    }) as any;
  });

  it('1. SignaturePad confirmado → converte para base64 PNG não vazio', () => {
    let result = '';
    const { getByText } = render(
      createElement(SignaturePad, {
        onConfirm: (base64) => { result = base64; },
        className: ""
      })
    );

    const btn = getByText('Confirmar Assinatura');
    fireEvent.click(btn);

    expect(toDataURLMock).toHaveBeenCalledWith('image/png');
    expect(result).toBe(validPng);
    expect(result).not.toBe('');
  });

  it('2. Upload da assinatura → path correto: tenants/{tenantId}/signatures/{osId}.png', async () => {
    await processSignatureAndPdf({
      tenantId: 't1',
      osId: 'os1',
      selectedOs: { client: 'A', address: 'B' },
      signatureData: validPng
    });

    expect(mockUploadTenantFile).toHaveBeenCalledWith('t1', 'signatures', 'os1.png', expect.anything());
  });

  it('3. PDF gerado → contém signature_url não nulo no documento da OS', async () => {
    const res = await processSignatureAndPdf({
      tenantId: 't1',
      osId: 'os1',
      selectedOs: { client: 'A', address: 'B' },
      signatureData: validPng
    });

    expect(res.signature_url).not.toBeNull();
    expect(res.signature_url).toContain('signatures/os1.png');
  });

  it('4. PDF salvo → path correto: tenants/{tenantId}/contracts/{osId}.pdf', async () => {
    const res = await processSignatureAndPdf({
      tenantId: 't1',
      osId: 'os1',
      selectedOs: { client: 'A', address: 'B' },
      signatureData: validPng
    });

    expect(mockUploadTenantFile).toHaveBeenCalledWith('t1', 'contracts', 'os1.pdf', expect.anything());
    expect(res.contract_url).toContain('contracts/os1.pdf');
  });

  it('5. Canvas vazio → botão Confirmar bloqueado ou PDF não gerado', async () => {
    await expect(processSignatureAndPdf({
      tenantId: 't1',
      osId: 'os1',
      selectedOs: { client: 'A', address: 'B' },
      signatureData: '' // Vazio
    })).rejects.toThrow('Canvas vazio: PDF não gerado');
  });

  it('6. Falha no upload → OS não marcada como concluída', async () => {
    mockUploadTenantFile.mockRejectedValueOnce(new Error('Upload error'));

    let err: Error | null = null;
    try {
      await processSignatureAndPdf({
        tenantId: 't1',
        osId: 'os1',
        selectedOs: { client: 'A', address: 'B' },
        signatureData: validPng
      });
    } catch (e: any) {
      err = e;
    }
    expect(err).not.toBeNull();
    expect(err!.message).toContain('Upload error');
  });
});
