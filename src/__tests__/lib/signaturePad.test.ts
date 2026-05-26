// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { createElement } from 'react';
import { render, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SignaturePad } from '../../components/SignaturePad';
import { processSignatureAndPdf } from '../../lib/signaturePad';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';

vi.mock('firebase/storage', () => ({
  ref: vi.fn((storage, path) => path),
  uploadString: vi.fn(),
  getDownloadURL: vi.fn().mockResolvedValue('https://mock.url')
}));

vi.mock('../../lib/firebase', () => ({
  storage: {}
}));

const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('SignaturePad and PDF generation', () => {
  let toDataURLMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    toDataURLMock = vi.fn().mockReturnValue(validPng);
    
    // Mock HTMLCanvasElement.prototype.toDataURL
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
    
    // Simula uma assinatura no the canvas
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
    
    expect(ref).toHaveBeenCalledWith(expect.anything(), 'tenants/t1/signatures/os1.png');
    expect(uploadString).toHaveBeenCalledWith('tenants/t1/signatures/os1.png', validPng, 'data_url');
  });

  it('3. PDF gerado → contém signature_url não nulo no documento da OS', async () => {
    const res = await processSignatureAndPdf({
      tenantId: 't1',
      osId: 'os1',
      selectedOs: { client: 'A', address: 'B' },
      signatureData: validPng
    });
    
    expect(res.signature_url).not.toBeNull();
    expect(res.signature_url).toBe('https://mock.url');
  });

  it('4. PDF salvo → path correto: tenants/{tenantId}/contracts/{osId}.pdf', async () => {
    await processSignatureAndPdf({
      tenantId: 't1',
      osId: 'os1',
      selectedOs: { client: 'A', address: 'B' },
      signatureData: validPng
    });
    
    expect(ref).toHaveBeenCalledWith(expect.anything(), 'tenants/t1/contracts/os1.pdf');
    // Ensure uploadString was called for PDF
    expect(uploadString).toHaveBeenCalledWith('tenants/t1/contracts/os1.pdf', expect.stringContaining('data:application/pdf'), 'data_url');
  });

  it('5. Canvas vazio → botão Confirmar bloqueado ou PDF não gerado', async () => {
    // Para testar "PDF não gerado"
    await expect(processSignatureAndPdf({
      tenantId: 't1',
      osId: 'os1',
      selectedOs: { client: 'A', address: 'B' },
      signatureData: '' // Vazio
    })).rejects.toThrow('Canvas vazio: PDF não gerado');
  });

  it('6. Falha no upload → OS não marcada como concluída', async () => {
    (uploadString as any).mockRejectedValueOnce(new Error('Upload error'));

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

    expect(err).toBeDefined();
    expect(err?.message).toBe('Upload error');
    // Em TecnichianAppPage, se isso dá throw, o updateOsStatus chamará o reject antes de atualizar.
    // Garantimos que a Exception é propagada para não marcar a OS como concluída.
  });
});
