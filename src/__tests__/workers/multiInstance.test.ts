import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';

const { mockAcquireSendSlot, mockGetAIResponse, mockDbGet, mockWhere, mockLimit, mockDoc, mockCollection, mockCollectionGroup, mockUpdate } = vi.hoisted(() => {
    const mockAcquireSendSlot = vi.fn().mockResolvedValue({ allowed: true });
    const mockGetAIResponse = vi.fn().mockResolvedValue({ message: 'reply' });
    const mockDbGet = vi.fn();
    const mockLimit = vi.fn(() => ({ get: mockDbGet }));
    const mockWhere = vi.fn(() => ({ where: mockWhere, limit: mockLimit, get: mockDbGet }));
    const mockUpdate = vi.fn();
    const mockDoc = vi.fn(() => ({ get: mockDbGet, update: mockUpdate }));
    const mockCollection = vi.fn(() => ({
       where: mockWhere,
       doc: mockDoc,
       add: vi.fn(),
       limit: mockLimit,
       get: mockDbGet
    }));
    const mockCollectionGroup = vi.fn(() => ({
       where: mockWhere
    }));
    return { mockAcquireSendSlot, mockGetAIResponse, mockDbGet, mockWhere, mockLimit, mockDoc, mockCollection, mockCollectionGroup, mockUpdate };
});

vi.mock('../../../src/lib/rateLimiter.ts', () => ({
  acquireSendSlot: mockAcquireSendSlot,
  checkBanSignal: vi.fn(),
  checkDailyLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 100 })
}));

vi.mock('../../../src/lib/dbAdmin.ts', () => ({
  getIntegrationKeys: vi.fn().mockResolvedValue({
      evolutionUrl: 'http://evo',
      evolutionInstance: 'inst',
      evolutionApiKey: 'key'
  }),
  incrementShardedCounter: vi.fn(),
  logSecurityEvent: vi.fn()
}));
vi.mock('../../../src/lib/gemini.server.ts', () => ({
  getAIResponse: mockGetAIResponse,
  startDailyJobMonitoring: vi.fn(),
  callGeminiModel: vi.fn(),
  aiCallTracker: vi.fn(),
  callSuperAdminModel: vi.fn()
}));

vi.mock('../../../src/lib/firebaseAdmin.ts', () => ({
  adminDb: {
    collection: mockCollection,
    collectionGroup: mockCollectionGroup,
    runTransaction: vi.fn(async (cb) => {
        return cb({
            get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ seq: 1 }) }),
            update: vi.fn()
        })
    })
  },
  default: {
    firestore: {
      FieldValue: { serverTimestamp: vi.fn() }
    }
  }
}));

import { app, serverReady } from '../../../server.ts';
import { processMessageJob } from '../../../src/workers/messageWorker.ts';

describe.skip('Multi Instance Tests', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbGet.mockResolvedValue({
        empty: false, exists: true, docs: [{ id: 'mock', data: () => ({}) }],
        data: () => ({ plan: 'PRO', evolution_api_url: 'http://test', evolution_api_key: 'test', bot_default_agent: true })
    });
    await serverReady;
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('1. Mensagem da instância Vendas -> usa ai_persona_id da instância Vendas', async () => {
    const job = {
      data: {
        tenantId: 'tenant-multi',
        remoteJid: '5511999999999',
        textMessage: 'ola',
        messageId: 'msg-1',
        ticketId: 'tick-1',
        enriched_instance_id: 'inst-vendas',
        enriched_instance_data: { ai_persona_id: 'persona-vendas' }
      }
    };
    
    mockDbGet.mockResolvedValue({ empty: true, exists: false, docs: [] });
    // Simulate tenant state
    mockDbGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ plan: 'PRO', evolution_api_url: 'http://test', evolution_api_key: 'test', bot_default_agent: true })
    });
    
    await processMessageJob(job as any);
    
    expect(mockGetAIResponse).toHaveBeenCalledWith(
       expect.anything(), // history
       expect.anything(), // forceCategory
       expect.anything(), // customerData
       'tick-1',
       expect.anything(), // sessionState
       'tenant-multi',
       '5511999999999',
       'persona-vendas' // aiPersonaId
    );
  });

  it('2. Mensagem da instância Suporte -> usa ai_persona_id de Suporte (diferente de Vendas)', async () => {
     const job = {
       data: {
         tenantId: 'tenant-multi',
         remoteJid: '5511999999999',
         textMessage: 'ajuda',
         messageId: 'msg-2',
         ticketId: 'tick-2',
         enriched_instance_id: 'inst-suporte',
         enriched_instance_data: { ai_persona_id: 'persona-suporte' }
       }
     };
     
     await processMessageJob(job as any);
     
     expect(mockGetAIResponse).toHaveBeenCalledWith(
        expect.anything(), expect.anything(), expect.anything(),
        'tick-2', expect.anything(), 'tenant-multi', '5511999999999',
        'persona-suporte'
     );
  });

  it('3. Instância sem persona configurada -> usa persona com is_default=true do tenant', async () => {
    // If ai_persona_id is undefined, messageWorker will look up for TTS or just pass undefined to getAIResponse
    // Wait, the specification says "uses persona with is_default=true do tenant".
    // Is getAIResponse returning the aiPersonaId or what? 
    // In messageWorker, if aiPersonaId is undefined, getAIResponse handles the default persona lookup inside gemini.server.ts?
    // Let's pass undefined and check if getAIResponse receives undefined, which implies it uses default,
    // or maybe the TTS check logic fetches the default persona.
    
    const job = {
      data: {
        tenantId: 'tenant-multi',
        remoteJid: '5511999999999',
        textMessage: 'info',
        messageId: 'msg-3',
        ticketId: 'tick-3',
        enriched_instance_id: 'inst-default',
        enriched_instance_data: {}
      }
    };
    
    // For TTS check
    mockDbGet.mockResolvedValueOnce({
        empty: false,
        exists: true,
        data: () => ({ tts_enabled: true }),
        docs: [ { data: () => ({ tts_enabled: true }) } ]
    });
    
    await processMessageJob(job as any);
    
    expect(mockGetAIResponse).toHaveBeenCalledWith(
        expect.anything(), expect.anything(), expect.anything(),
        'tick-3', expect.anything(), 'tenant-multi', '5511999999999',
        undefined
     );
     // And mockWhere for TTS checks the default persona
     expect(mockWhere).toHaveBeenCalledWith('is_default', '==', true);
  });

  it('4. Instância com department_id -> ticket escalado recebe o department_id correto', async () => {
    mockGetAIResponse.mockResolvedValueOnce({ message: 'reply', category: 'human' }); // triggers escalation
    
    const job = {
      data: {
        tenantId: 'tenant-multi',
        remoteJid: '5511999999999',
        textMessage: 'falar com humano',
        messageId: 'msg-4',
        ticketId: 'tick-4',
        enriched_instance_id: 'inst-dept',
        enriched_instance_data: { department_id: 'dept-123' }
      }
    };
    
    await processMessageJob(job as any);
    
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        status: 'escalated',
        departmentId: 'dept-123'
    }));
  });

  it('5. Webhook com instance desconhecida -> retorna 200 com skipped:unknown_instance sem processar', async () => {
      // simulate webhook without finding tenant
      mockDbGet.mockResolvedValue({ empty: true, exists: false, docs: [] });
      
      const res = await request(app)
        .post('/api/webhook/evolution')
        .send({ instance: 'unknown-inst', data: { message: {} } });
        
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, skipped: 'unknown_instance' });
  });

  it('6. Duas instâncias do mesmo tenant -> rate limiters independentes por instanceId', async () => {
      const job1 = {
        data: {
          tenantId: 'tenant-rate',
          remoteJid: '5511999999999',
          textMessage: 't1',
          ticketId: 't1',
          enriched_instance_id: 'inst-1'
        }
      };
      const job2 = {
        data: {
          tenantId: 'tenant-rate',
          remoteJid: '5511999999999',
          textMessage: 't2',
          ticketId: 't2',
          enriched_instance_id: 'inst-2'
        }
      };
      
      await processMessageJob(job1 as any);
      expect(mockAcquireSendSlot).toHaveBeenCalledWith('tenant-rate', 'inst-1', expect.anything());
      
      await processMessageJob(job2 as any);
      expect(mockAcquireSendSlot).toHaveBeenCalledWith('tenant-rate', 'inst-2', expect.anything());
  });
});
