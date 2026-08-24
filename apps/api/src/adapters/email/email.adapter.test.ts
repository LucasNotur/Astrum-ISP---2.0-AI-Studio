import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sendMailMock = vi.fn(async () => ({ messageId: 'msg-1' }));
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));

vi.mock('nodemailer', () => ({
  default: { createTransport: (...args: unknown[]) => createTransportMock(...args) },
  createTransport: (...args: unknown[]) => createTransportMock(...args),
}));

const resolveTenantSmtpConfigMock = vi.fn(async () => null as any);
vi.mock('../../lib/tenant-keys', () => ({
  resolveTenantSmtpConfig: (...args: unknown[]) => resolveTenantSmtpConfigMock(...args),
}));

import { sendEmail } from './email.adapter';

describe('sendEmail — SMTP por tenant (SaaS multi-tenant)', () => {
  const originalEnv = { ...process.env };
  const MESSAGE = { to: 'cliente@isp.com', subject: 'Oi', text: 'corpo' };

  beforeEach(() => {
    vi.clearAllMocks();
    resolveTenantSmtpConfigMock.mockResolvedValue(null);
    delete process.env.SMTP_HOST;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('com tenantId: usa o SMTP configurado pelo próprio tenant', async () => {
    resolveTenantSmtpConfigMock.mockResolvedValue({
      host: 'smtp.tenant.com', port: 465, user: 'contato@tenant.com', pass: 'senha-tenant', from: 'contato@tenant.com',
    });
    const result = await sendEmail(MESSAGE, 'tenant-1');
    expect(resolveTenantSmtpConfigMock).toHaveBeenCalledWith('tenant-1');
    expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.tenant.com', port: 465 }));
    expect(result.status).toBe('sent');
  });

  it('com tenantId mas sem SMTP configurado pelo tenant nem global → failed, sem enviar', async () => {
    resolveTenantSmtpConfigMock.mockResolvedValue(null);
    const result = await sendEmail(MESSAGE, 'tenant-1');
    expect(result).toEqual({ messageId: '', status: 'failed' });
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it('sem tenantId: usa SMTP_* global (job de sistema, sem contexto de tenant)', async () => {
    process.env.SMTP_HOST = 'smtp.astrum.app';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'astrum-user';
    process.env.SMTP_PASS = 'astrum-pass';
    const result = await sendEmail(MESSAGE);
    expect(resolveTenantSmtpConfigMock).not.toHaveBeenCalled();
    expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.astrum.app' }));
    expect(result.status).toBe('sent');
  });

  it('sem tenantId e sem env global → failed, sem enviar', async () => {
    const result = await sendEmail(MESSAGE);
    expect(result).toEqual({ messageId: '', status: 'failed' });
    expect(createTransportMock).not.toHaveBeenCalled();
  });
});
