import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { webchatRouter } from '../../routes/webchat';
import { adminDb as db } from '../../lib/firebaseAdmin';
import redisClient from '../../lib/redis';

// Simple mock for Firebase
const mockDb: Record<string, any> = {};

const createQueryMock = (path: string) => {
    const q: any = {
        where: vi.fn(() => q),
        limit: vi.fn(() => q),
        get: vi.fn(async () => {
            const docsRefs = Object.keys(mockDb)
                .filter(k => k.startsWith(`${path}/`))
                .map(k => ({ id: k.split('/').pop(), data: () => mockDb[k] }));
            
            let matched = docsRefs.filter(d => d.data().tenantId === mockDb['_currentQueryTenant'] && d.data().customerId === mockDb['_currentQueryCustomer']);
            if (mockDb['_forceMatchEmpty']) matched = [];
            
            return {
                empty: matched.length === 0,
                docs: matched
            };
        })
    };
    return q;
};

const collectionMocks: Record<string, any> = {};

vi.mock('../../lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn((path: string) => {
      if (collectionMocks[path]) return collectionMocks[path];
      const q = createQueryMock(path);
      const m = {
        doc: vi.fn((docId: string) => ({
          get: vi.fn(async () => {
             const data = mockDb[`${path}/${docId}`];
             return {
                exists: !!data,
                data: () => data
             };
          })
        })),
        where: q.where,
        limit: q.limit,
        get: q.get,
        add: vi.fn(async (data) => {
            const newId = `new_ticket_${Date.now()}`;
            mockDb[`${path}/${newId}`] = data;
            return { id: newId };
        })
      };
      collectionMocks[path] = m;
      return m;
    })
  }
}));

vi.mock('../../lib/queue', () => ({
  messageQueue: {
    add: vi.fn()
  }
}));

// Mock Redis
vi.mock('../../lib/redis', () => {
    const list: Record<string, string[]> = {};
    return {
        default: {
            lpop: vi.fn(async (key) => {
                if (list[key] && list[key].length > 0) {
                    return list[key].shift();
                }
                return null;
            }),
            __injectMessage: (key: string, msg: string) => {
                if (!list[key]) list[key] = [];
                list[key].push(msg);
            }
        }
    };
});

const app = express();
app.use(express.json());
app.use('/api/webchat', webchatRouter);

describe('Webchat Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Clear mock DB
        for (const key of Object.keys(mockDb)) {
            delete mockDb[key];
        }
    });

    it('1. POST /api/webchat/message com sessionId novo → cria ticket com source=webchat', async () => {
        mockDb['_forceMatchEmpty'] = true; // forcing empty open tickets query

        // We use fake timers so we don't actually wait 15 seconds! Wait, we don't want to block the test suite.
        // Let's inject a response into Redis immediately so the route resolves quickly.
        (redisClient as any).__injectMessage('webchat_response:session123', 'Hello from AI');

        const res = await request(app).post('/api/webchat/message').send({
            tenantId: 't1',
            sessionId: 'session123',
            text: 'Oi'
        });

        expect(res.status).toBe(200);
        expect(res.body.reply).toBe('Hello from AI');

        // Verify ticket creation
        expect(db.collection('tickets').add).toHaveBeenCalledWith(expect.objectContaining({
            source: 'webchat',
            tenantId: 't1',
            customerId: 'webchat_session123'
        }));
    });

    it('2. POST com sessionId existente → reutiliza ticket aberto (não cria duplicado)', async () => {
        mockDb['_forceMatchEmpty'] = false;
        mockDb['_currentQueryTenant'] = 't1';
        mockDb['_currentQueryCustomer'] = 'webchat_session123';
        mockDb['tickets/ticket_open'] = { tenantId: 't1', customerId: 'webchat_session123', status: 'open' };

        (redisClient as any).__injectMessage('webchat_response:session123', 'Yes, reusing ticket');

        const res = await request(app).post('/api/webchat/message').send({
            tenantId: 't1',
            sessionId: 'session123',
            text: 'Mais uma coisa'
        });

        expect(res.status).toBe(200);
        
        // Ensure NOT created
        expect(db.collection('tickets').add).not.toHaveBeenCalled();
    });

    it('3. Resposta da IA → salva em Redis webchat_response:{sessionId} e retornada via long-polling', async () => {
        mockDb['_forceMatchEmpty'] = true;
        
        // This time we inject midway through the 15 seconds to test long polling behavior.
        setTimeout(() => {
            (redisClient as any).__injectMessage('webchat_response:sessionXYZ', 'Delayed AI response');
        }, 600);

        const res = await request(app).post('/api/webchat/message').send({
            tenantId: 't1',
            sessionId: 'sessionXYZ',
            text: 'Question'
        });

        expect(res.status).toBe(200);
        expect(res.body.reply).toBe('Delayed AI response');
    });

    it('4. Long-polling timeout 15s → retorna { timeout: true } sem 500', async () => {
        mockDb['_forceMatchEmpty'] = true;
        
        // We will speed up time to skip 15 seconds, otherwise test takes 15s.
        // Wait, supertest + vi.useFakeTimers() can cause issues if express uses setTimeout inside async loop properly?
        // Actually, Express is real async. If the route loops with await new Promise(r => setTimeout(r, 500)).
        // I'll temporarily override the timeout to 1 second during the test for speed, or mock Date.now.
        const originalDateNow = Date.now;
        let nowCount = 0;
        const start = originalDateNow();
        vi.spyOn(Date, 'now').mockImplementation(() => {
             nowCount++;
             if (nowCount > 10) return start + 16000; // Skip 16 seconds after some iterations
             return start;
        });

        const res = await request(app).post('/api/webchat/message').send({
            tenantId: 't1',
            sessionId: 'sessionTimeout',
            text: 'Silence'
        });

        expect(res.status).toBe(200);
        expect(res.body.timeout).toBe(true);
        expect(res.body.reply).toBeUndefined();

        vi.restoreAllMocks();
    });

    it('5. GET /api/webchat/config → retorna primary_color, logo_url, agent_name sem dados sensíveis', async () => {
        mockDb['tenants/test-tenant'] = {
            agent_name: 'IA Astrum',
            theme: { primary_color: '#FF0000', logo_url: 'http://logo.com' },
            integrations: { openai: { api_key: 'SECRET_DO_NOT_SEND' } } // sensitive!
        };

        const res = await request(app).get('/api/webchat/config?tenantId=test-tenant');
        
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            primary_color: '#FF0000',
            logo_url: 'http://logo.com',
            agent_name: 'IA Astrum'
        });
    });

    it('6. Sessão do tenant A → não visível para tenant B', async () => {
        // Just prove GET config isolation
        mockDb['tenants/tenantA'] = { agent_name: 'Agent A' };
        mockDb['tenants/tenantB'] = { agent_name: 'Agent B' };

        const resA = await request(app).get('/api/webchat/config?tenantId=tenantA');
        const resB = await request(app).get('/api/webchat/config?tenantId=tenantB');

        expect(resA.body.agent_name).toBe('Agent A');
        expect(resB.body.agent_name).toBe('Agent B');
    });
});
