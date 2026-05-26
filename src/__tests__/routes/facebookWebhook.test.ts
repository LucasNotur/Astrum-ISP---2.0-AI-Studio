import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import { facebookWebhookRouter } from '../../routes/facebookWebhook';
import { facebookClient } from '../../lib/facebookClient';
import { adminDb } from '../../lib/firebaseAdmin';

// Mock dependencies
vi.mock('../../lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn()
        }))
      }))
    })),
  }
}));

vi.mock('../../lib/queue', () => ({
  messageQueue: {
    add: vi.fn()
  }
}));

// vi.mock('../../lib/facebookClient'); // Do not mock entirely to test it in test 7


const app = express();
app.use(express.json());
app.use('/api/webhook/facebook', facebookWebhookRouter);

describe('Facebook Webhook', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('1. GET /api/webhook/facebook com challenge correto → retorna o challenge', async () => {
        process.env.FACEBOOK_VERIFY_TOKEN = 'secret_token';
        const res = await request(app).get('/api/webhook/facebook?hub.verify_token=secret_token&hub.challenge=1234&hub.mode=subscribe');
        expect(res.status).toBe(200);
        expect(res.text).toBe('1234');
    });

    it('2. GET /api/webhook/facebook com token errado → 403', async () => {
        process.env.FACEBOOK_VERIFY_TOKEN = 'secret_token';
        const res = await request(app).get('/api/webhook/facebook?hub.verify_token=wrong_token&hub.challenge=1234&hub.mode=subscribe');
        expect(res.status).toBe(403);
    });

    it('3. POST com mensagem válida → normaliza payload e enfileira com source=facebook', async () => {
        // Mock tenant resolution
        const { messageQueue } = await import('../../lib/queue');
        const getMock = vi.fn().mockResolvedValue({
            empty: false,
            docs: [{ id: 'tenant_1', data: () => ({ integrations: { facebook: { page_id: 'page_1', page_access_token: 'token_1' } } }) }]
        });
        (adminDb.collection as any).mockImplementation(() => ({ where: () => ({ limit: () => ({ get: getMock }) }) }));

        const payload = {
            object: 'page',
            entry: [{
                id: 'page_1',
                messaging: [{
                    sender: { id: 'sender_1' },
                    recipient: { id: 'page_1' },
                    message: { text: 'Hello' }
                }]
            }]
        };

        const res = await request(app).post('/api/webhook/facebook').send(payload);
        expect(res.status).toBe(200);
        expect(messageQueue.add).toHaveBeenCalledWith(
            "process_message",
            expect.objectContaining({
                tenantId: 'tenant_1',
                from: 'sender_1',
                text: 'Hello',
                source: 'facebook',
            }),
            expect.any(Object)
        );
    });

    it('4. Resposta para source=facebook → usa facebookClient com page_access_token do tenant correto', async () => {
        const facebookClientMock = await import('../../lib/facebookClient');
        const token = 'tenant_specific_token';
        
        const sendSpy = vi.spyOn(facebookClientMock.facebookClient, 'sendMessage').mockResolvedValue('ok' as any);
        await facebookClientMock.facebookClient.sendMessage('sender_1', 'Reply message', token);
        
        expect(sendSpy).toHaveBeenCalledWith('sender_1', 'Reply message', token);
        sendSpy.mockRestore();
    });

    it('5. Página Facebook não configurada no tenant → 200 com skipped:unknown_page', async () => {
        const getMock = vi.fn().mockResolvedValue({ empty: true });
        (adminDb.collection as any).mockImplementation(() => ({ where: () => ({ limit: () => ({ get: getMock }) }) }));

        const payload = {
            object: 'page',
            entry: [{
                id: 'unknown_page',
                messaging: [{
                    sender: { id: 'sender_1' },
                    recipient: { id: 'unknown_page' },
                    message: { text: 'Hello' }
                }]
            }]
        };

        const res = await request(app).post('/api/webhook/facebook').send(payload);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'skipped:unknown_page' });
    });

    it('6. Mensagem echo do próprio bot → ignorada sem processar', async () => {
        const { messageQueue } = await import('../../lib/queue');
        
        const payload = {
            object: 'page',
            entry: [{
                id: 'page_1',
                messaging: [{
                    sender: { id: 'page_1' },
                    recipient: { id: 'sender_1' },
                    message: { is_echo: true, text: 'Hello' }
                }]
            }]
        };

        const res = await request(app).post('/api/webhook/facebook').send(payload);
        expect(res.status).toBe(200);
        expect(messageQueue.add).not.toHaveBeenCalled();
    });

    it('7. facebookClient com token inválido → lança erro sem expor o token nos logs', async () => {
        const { facebookClient } = await import('../../lib/facebookClient');
        
        // Mock fetch to simulate Facebook API error
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: false,
            status: 400,
            json: async () => ({ error: { message: 'Invalid token' } })
        } as any);

        const realToken = 'secret_real_token_123';
        
        let caughtError;
        try {
            await facebookClient.sendMessage('user_1', 'Hello', realToken);
        } catch (e: any) {
            caughtError = e.message;
        }

        expect(caughtError).toBeDefined();
        // The token must NOT be in the error message
        expect(caughtError).not.toContain(realToken);
        expect(caughtError).toContain('***');

        fetchSpy.mockRestore();
    });
});
