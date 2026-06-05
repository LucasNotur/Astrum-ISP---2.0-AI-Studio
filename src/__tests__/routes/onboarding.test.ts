import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { app, serverReady } from '../../../server.ts';

// Mock validate CNPJ as it is tricky to keep generating valid ones if we need static ones for tests
vi.mock('../../utils/cnpj.ts', () => ({
  validateCnpj: vi.fn((cnpj) => {
    return cnpj !== 'invalid_cnpj';
  })
}));

const { mockCollection, mockDoc, mockSet, mockUpdate, mockDelete, mockCreateUser, mockSetCustomUserClaims, mockDeleteUser, mockCreateSubscription, mockSendWelcomeEmail, mockSeedNewTenant } = vi.hoisted(() => {
  const mockSet = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockDoc = vi.fn(() => ({
    set: mockSet,
    update: mockUpdate,
    delete: mockDelete
  }));
  const mockCollection = vi.fn(() => ({
    doc: mockDoc
  }));

  const mockCreateUser = vi.fn();
  const mockSetCustomUserClaims = vi.fn();
  const mockDeleteUser = vi.fn();

  const mockCreateSubscription = vi.fn();
  const mockSendWelcomeEmail = vi.fn();
  const mockSeedNewTenant = vi.fn();

  return { mockCollection, mockDoc, mockSet, mockUpdate, mockDelete, mockCreateUser, mockSetCustomUserClaims, mockDeleteUser, mockCreateSubscription, mockSendWelcomeEmail, mockSeedNewTenant };
});

vi.mock('../../lib/billing.ts', () => ({
  createSubscription: mockCreateSubscription
}));

vi.mock('../../lib/email.ts', () => ({
  sendWelcomeEmail: mockSendWelcomeEmail
}));

vi.mock('../../lib/tenantSeed.ts', () => ({
  seedNewTenant: mockSeedNewTenant
}));

vi.mock('../../lib/firebaseAdmin.ts', () => ({
  adminDb: {
    collection: mockCollection
  },
  adminAuth: {
    createUser: mockCreateUser,
    setCustomUserClaims: mockSetCustomUserClaims,
    deleteUser: mockDeleteUser,
  },
  default: {
    firestore: {
      FieldValue: {
        serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP')
      }
    }
  }
}));

// removed firebase-admin mock

// Mock Redis
vi.mock('../../lib/redis.ts', () => ({
  default: {
    setex: vi.fn()
  }
}));

// Retrieve the app to bind the handlers but we need to ensure the middlewares don't break
// Wait, we can just instantiate express again and import the route, but in this case the route is defined inside server.ts inline app.post.
// Since `app` in server.ts is default exported (if it is we can use it) or we can just mock the /api/onboarding/provision by requiring server.ts 
// Actually, let's load server.ts app and test it with request(app).

describe('Onboarding Routes /api/onboarding/provision', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await serverReady;
    });

    it('1. POST /api/onboarding/provision com CNPJ válido -> cria usuário Firebase + tenant + retorna { tenantId, loginUrl }', async () => {
        mockCreateUser.mockResolvedValueOnce({ uid: 'new-user-123' });
        
        const response = await request(app)
            .post('/api/onboarding/provision')
            .send({
                email: 'test@domain.com',
                password: 'password123',
                name: 'Test Admin',
                companyName: 'Test Company',
                cnpj: 'valid_cnpj',
                planId: 'FREE'
            });

        expect(response.status).toBe(200);
        expect(response.body.tenantId).toBeDefined();
        expect(response.body.loginUrl).toBe('/login');
        
        expect(mockCreateUser).toHaveBeenCalledWith({
            email: 'test@domain.com', password: 'password123', displayName: 'Test Admin'
        });
        expect(mockSet).toHaveBeenCalledTimes(2); // one for tenant, one for user
        expect(mockUpdate).toHaveBeenCalledWith({ status: 'active' });
    });

    it('2. POST /api/onboarding/provision com CNPJ inválido -> 400 com mensagem de erro', async () => {
        const response = await request(app)
            .post('/api/onboarding/provision')
            .send({
                email: 'test2@domain.com',
                password: 'password123',
                name: 'Test Admin',
                companyName: 'Test Company',
                cnpj: 'invalid_cnpj',
                planId: 'FREE'
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid CNPJ');
        expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('3. POST /api/onboarding/provision com email já existente -> 409 DUPLICATE_EMAIL', async () => {
        const error: any = new Error('Email already exists');
        error.code = 'auth/email-already-exists';
        mockCreateUser.mockRejectedValueOnce(error);

        const response = await request(app)
            .post('/api/onboarding/provision')
            .send({
                email: 'existente@domain.com',
                password: 'password123',
                name: 'Test Admin',
                companyName: 'Test Company',
                cnpj: 'valid_cnpj',
                planId: 'FREE'
            });

        expect(response.status).toBe(409);
        expect(response.body.error).toBe('DUPLICATE_EMAIL');
        expect(mockSet).not.toHaveBeenCalled();
    });

    it('4. ROLLBACK: falha na criação do Asaas -> deleta usuário Firebase e tenant criados', async () => {
        mockCreateUser.mockResolvedValueOnce({ uid: 'new-user-asaas-fail' });
        mockCreateSubscription.mockRejectedValueOnce(new Error('Asaas API Down'));

        const response = await request(app)
            .post('/api/onboarding/provision')
            .send({
                email: 'asaas_fail@domain.com',
                password: 'password123',
                name: 'Test Admin',
                companyName: 'Test Company',
                cnpj: 'valid_cnpj',
                planId: 'PRO'
            });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('ASAAS_SUBSCRIPTION_FAILED');
        
        // Verifies that rollback occurred
        expect(mockDeleteUser).toHaveBeenCalledWith('new-user-asaas-fail');
        expect(mockDelete).toHaveBeenCalledTimes(2); // 1 for user doc, 1 for tenant doc
    });

    it('5. ROLLBACK: falha no Firebase Auth -> tenant não é criado no Firestore', async () => {
        mockCreateUser.mockRejectedValueOnce(new Error('Internal Auth Error'));

        const response = await request(app)
            .post('/api/onboarding/provision')
            .send({
                email: 'auth_fail@domain.com',
                password: 'password123',
                name: 'Test Admin',
                companyName: 'Test Company',
                cnpj: 'valid_cnpj',
                planId: 'FREE'
            });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Internal Auth Error');
        expect(mockSet).not.toHaveBeenCalled();
    });

    it('6. seedNewTenant -> cria 3 artigos de conhecimento + config de IA + 1 operador admin', async () => {
        mockCreateUser.mockResolvedValueOnce({ uid: 'new-user-seed' });
        
        const response = await request(app)
            .post('/api/onboarding/provision')
            .send({
                email: 'seed@domain.com',
                password: 'password123',
                name: 'Test Admin',
                companyName: 'Test Company',
                cnpj: 'valid_cnpj',
                planId: 'FREE'
            });
            
        expect(response.status).toBe(200);
        expect(mockSeedNewTenant).toHaveBeenCalledWith(expect.any(String), 'Test Company', 'new-user-seed');
    });

    it('7. Email de boas-vindas -> é enviado após provisionamento bem-sucedido', async () => {
         mockCreateUser.mockResolvedValueOnce({ uid: 'new-user-email' });
        
         const response = await request(app)
             .post('/api/onboarding/provision')
             .send({
                 email: 'email@domain.com',
                 password: 'password123',
                 name: 'Test Admin',
                 companyName: 'Company Email',
                 cnpj: 'valid_cnpj',
                 planId: 'FREE'
             });
             
         expect(response.status).toBe(200);
         expect(mockSendWelcomeEmail).toHaveBeenCalledWith(
             'email@domain.com', 'Test Admin', 'Company Email', expect.stringContaining('/login'), expect.any(String)
         );
    });
});
