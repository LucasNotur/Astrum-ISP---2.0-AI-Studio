import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { evolutionWebhookRouter } from '../../../src/routes/evolutionWebhook';
import { processMessageJob } from '../../../src/workers/messageWorker';

const { mockAcquireSendSlot, mockGetAIResponse, mockDbGet, mockWhere, mockLimit, mockDoc, mockCollection, mockCollectionGroup, mockUpdate, mockAiProviderChat } = vi.hoisted(() => {
    const mockAcquireSendSlot = vi.fn().mockResolvedValue({ allowed: true });
    const mockGetAIResponse = vi.fn().mockResolvedValue({ message: 'reply' });
    const mockAiProviderChat = vi.fn().mockResolvedValue({ content: 'NEUTRAL' });
    const mockDbGet = vi.fn();
    const mockLimit = vi.fn(() => ({ get: mockDbGet }));
    const mockOrderBy = vi.fn(() => ({ limit: mockLimit, get: mockDbGet }));
    const mockWhere = vi.fn(() => ({ where: mockWhere, limit: mockLimit, orderBy: mockOrderBy, get: mockDbGet }));
    const mockUpdate = vi.fn();
    const mockDoc = vi.fn(() => ({ get: mockDbGet, update: mockUpdate, collection: mockCollection }));
    const mockCollection = vi.fn(() => ({
       where: mockWhere,
       doc: mockDoc,
       add: vi.fn().mockResolvedValue({ id: 'mock-id' }),
       limit: mockLimit,
       orderBy: mockOrderBy,
       get: mockDbGet
    }));
    const mockCollectionGroup = vi.fn(() => ({
       where: mockWhere
    }));
    
    global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({})
    }) as any;

    return { mockAcquireSendSlot, mockGetAIResponse, mockDbGet, mockWhere, mockLimit, mockDoc, mockCollection, mockCollectionGroup, mockUpdate, mockAiProviderChat };
});

vi.mock('../../../src/lib/rateLimiter', () => ({
  acquireSendSlot: mockAcquireSendSlot,
  checkBanSignal: vi.fn(),
  checkDailyLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 100 })
}));

vi.mock('../../../src/lib/dbAdmin', () => ({
  getIntegrationKeys: vi.fn().mockResolvedValue({
      evolutionUrl: 'http://evo',
      evolutionInstance: 'inst',
      evolutionApiKey: 'key'
  }),
  incrementShardedCounter: vi.fn(),
  logSecurityEvent: vi.fn()
}));

vi.mock('../../../src/lib/gemini.server', () => ({
  getAIResponse: mockGetAIResponse,
  startDailyJobMonitoring: vi.fn(),
  callGeminiModel: vi.fn(),
  aiCallTracker: vi.fn(),
  callSuperAdminModel: vi.fn()
}));

vi.mock('../../../src/ai-provider/ai-provider.setup', () => ({
  aiProvider: {
    chat: mockAiProviderChat
  }
}));

vi.mock('../../../src/lib/firebaseAdmin', () => ({
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

vi.mock('../../../../apps/api/src/infrastructure/security/hmac.service', () => ({
  validateWebhookSignature: vi.fn().mockReturnValue(true)
}));

describe('Multi Instance Tests', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockCollection.mockImplementation((path: string) => {
      const getMock = vi.fn().mockResolvedValue({
          empty: false, exists: true, docs: [{ id: 'mock', data: () => ({ avatar: 'pic' }) }],
          data: () => ({ plan: 'PRO', evolution_api_url: 'http://test', evolution_api_key: 'test', bot_default_agent: true, tts_enabled: true })
      });
      
      const docMock = vi.fn(() => ({
         get: getMock,
         update: mockUpdate,
         collection: mockCollection
      }));
      
      const orderByMock = vi.fn(() => ({ limit: vi.fn(() => ({ get: getMock })), get: getMock }));
      const whereMock = vi.fn(() => ({ where: whereMock, limit: vi.fn(() => ({ get: getMock })), orderBy: orderByMock, get: getMock }));
      
      return {
         where: whereMock, doc: docMock, add: vi.fn().mockResolvedValue({ id: 'mock-id' }),
         limit: vi.fn(() => ({ get: getMock })), orderBy: orderByMock, get: getMock
      };
    });
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
        messageData: {},
        payload: {},
        enriched_instance_id: 'inst-vendas',
        enriched_instance_data: { ai_persona_id: 'persona-vendas' }
      }
    };
    
    mockCollection.mockImplementation((path: string) => {
      const getMock = vi.fn().mockResolvedValue({
          empty: false, exists: true, docs: [{ id: 'mock', data: () => ({ avatar: 'pic' }) }],
          data: () => ({ plan: 'PRO', evolution_api_url: 'http://test', evolution_api_key: 'test', bot_default_agent: true })
      });
      if (path === 'customers') {
          getMock.mockResolvedValue({ empty: true, exists: false, docs: [] });
      }
      
      const docMock = vi.fn(() => ({ get: getMock, update: mockUpdate, collection: mockCollection }));
      const orderByMock = vi.fn(() => ({ limit: vi.fn(() => ({ get: getMock })), get: getMock }));
      const whereMock = vi.fn(() => ({ where: whereMock, limit: vi.fn(() => ({ get: getMock })), orderBy: orderByMock, get: getMock }));
      
      return {
         where: whereMock, doc: docMock, add: vi.fn().mockResolvedValue({ id: 'mock-id' }),
         limit: vi.fn(() => ({ get: getMock })), orderBy: orderByMock, get: getMock
      };
    });
    
    await processMessageJob(job as any);
    
    expect(mockGetAIResponse).toHaveBeenCalledWith(
       expect.anything(),
       undefined,
       expect.anything(),
       'tick-1',
       expect.anything(),
       'tenant-multi',
       '5511999999999',
       'persona-vendas'
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
         messageData: {},
         payload: {},
         enriched_instance_id: 'inst-suporte',
         enriched_instance_data: { ai_persona_id: 'persona-suporte' }
       }
     };
     
     await processMessageJob(job as any);
     
     expect(mockGetAIResponse).toHaveBeenCalledWith(
        expect.anything(), undefined, expect.anything(),
        'tick-2', expect.anything(), 'tenant-multi', '5511999999999',
        'persona-suporte'
     );
  });

  it('3. Instância sem persona configurada -> usa persona com is_default=true do tenant', async () => {
    const job = {
      data: {
        tenantId: 'tenant-multi',
        remoteJid: '5511999999999',
        textMessage: 'info',
        messageId: 'msg-3',
        ticketId: 'tick-3',
        messageData: {},
        payload: {},
        enriched_instance_id: 'inst-default',
        enriched_instance_data: {}
      }
    };
    
    await processMessageJob(job as any);
    
    expect(mockGetAIResponse).toHaveBeenCalledWith(
        expect.anything(), undefined, expect.anything(),
        'tick-3', expect.anything(), 'tenant-multi', '5511999999999',
        undefined
     );
  });

  it('4. Instância com department_id -> ticket escalado recebe o department_id correto', async () => {
    mockGetAIResponse.mockResolvedValueOnce({ message: 'reply', category: 'human', shouldEscalate: true });
    
    const job = {
      data: {
        tenantId: 'tenant-multi',
        remoteJid: '5511999999999',
        textMessage: 'falar com humano',
        messageId: 'msg-4',
        ticketId: 'tick-4',
        messageData: {},
        payload: {},
        enriched_instance_id: 'inst-dept',
        enriched_instance_data: { department_id: 'dept-123' }
      }
    };
    
    await processMessageJob(job as any);
    
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        status: 'waiting_queue',
        departmentId: 'dept-123'
    }));
  });

});
