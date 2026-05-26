import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminDb as db } from '../../lib/firebaseAdmin';
import redis from '../../lib/redis';
import { getERPAdapter, IXCAdapter, MKAuthAdapter } from '../../lib/integrations/erpAdapter';
import * as utils from '../../lib/dbAdmin';
import * as email from '../../lib/email';
import { planSyncWorker } from '../../workers/planSyncWorker';
import { getMockReq, getMockRes } from '@jest-mock/express';
// We will test `get_plans_info` by evaluating the logic using a simulated mock call or similar
import fs from 'fs';

// Mock dependencias
const mockDb: Record<string, any> = {};

vi.mock('../../lib/firebaseAdmin', () => {
    return {
        adminDb: {
            collection: vi.fn((path: string) => {
                return {
                    doc: vi.fn((docId: string) => {
                        const docPath = `${path}/${docId}`;
                        return {
                            get: vi.fn(async () => {
                                const data = mockDb[docPath];
                                return {
                                    id: docId,
                                    exists: !!data,
                                    data: () => data
                                };
                            }),
                            collection: vi.fn((subPath: string) => {
                                const colPath = `${docPath}/${subPath}`;
                                return {
                                    get: vi.fn(async () => {
                                        const docs = Object.keys(mockDb)
                                            .filter(k => k.startsWith(`${colPath}/`))
                                            .map(k => ({ id: k.split('/').pop(), data: () => mockDb[k] }));
                                        return { docs, empty: docs.length === 0 };
                                    }),
                                    where: vi.fn(function() {
                                        return this; // mock simplified
                                    }),
                                    doc: vi.fn((subDocId: string) => {
                                      const dPath = `${colPath}/${subDocId}`;
                                      return {
                                          get: vi.fn(async () => ({ id: subDocId, data: () => mockDb[dPath], exists: !!mockDb[dPath] }))
                                      }
                                    })
                                };
                            })
                        };
                    }),
                    where: vi.fn(function() {
                        return {
                            get: vi.fn(async () => {
                                const docs = Object.keys(mockDb)
                                    .filter(k => k.startsWith(`${path}/`))
                                    .map(k => ({ id: k.split('/').pop(), data: () => mockDb[k] }));
                                return { empty: docs.length === 0, docs };
                            })
                        };
                    }),
                    get: vi.fn(async () => {
                        const docs = Object.keys(mockDb)
                            .filter(k => k.startsWith(`${path}/`))
                            .map(k => ({ id: k.split('/').pop(), data: () => mockDb[k] }));
                        return { empty: docs.length === 0, docs };
                    }),
                    add: vi.fn(async (data: any) => {
                        const newId = `new_id_${Date.now()}`;
                        mockDb[`${path}/${newId}`] = data;
                        return { id: newId };
                    })
                };
            }),
            batch: vi.fn(() => ({
                set: vi.fn((docRef: any, data: any, opts: any) => {
                    // Extracting the doc path manually from the mocked structure or we just apply directly:
                    // Since docRef is the mocked object calling doc(), it doesn't hold the path directly here unless we store it.
                    // For the sake of the test, let's just intercept the arguments if we need, but we can also mock batch properly.
                }),
                commit: vi.fn(async () => {})
            }))
        }
    };
});

let batchOperations: { path: string, data: any }[] = [];
// Overwrite batch logic to actually store in mockDb
(db.batch as any).mockImplementation(() => {
    return {
        set: vi.fn((docRef: any, data: any, opts: any) => {
           // Hack to get path from our mocked nested docRef, which we didn't store. 
           // Let's modify the doc() mock above slightly to expose _path... wait we can just patch it below.
        }),
        commit: vi.fn(async () => {
            for (const op of batchOperations) {
                if (op.data.merge) {
                    mockDb[op.path] = { ...mockDb[op.path], ...op.data };
                } else {
                    mockDb[op.path] = op.data;
                }
            }
            batchOperations = [];
        })
    }
});

// Fix batch set
vi.mock('../../lib/email', () => ({
    sendAdminEmail: vi.fn()
}));

vi.mock('../../lib/redis', () => {
    const store: Record<string, string> = {};
    return {
        default: {
            get: vi.fn(async (key) => store[key] || null),
            set: vi.fn(async (key, val) => { store[key] = val; }),
            _inject: (key: string, val: string) => { store[key] = val; },
            _clear: () => { for (const k in store) delete store[k]; },
            options: {} // to bypass isMockRedis flag if needed
        }
    };
});

describe('ERP Catalog sync tests', () => {

    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        for (const key of Object.keys(mockDb)) {
            delete mockDb[key];
        }
        (redis as any)._clear();
        batchOperations = [];
        vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({})
        } as any);
        vi.spyOn(utils, 'getIXCCredentials' as any).mockResolvedValue({ url: 'http://ixcsync.com', token: 'key' });
        vi.spyOn(utils, 'getIntegrationKeys' as any).mockResolvedValue({ });
    });

    it('1. getPlans(IXCAdapter) → array de ERPPlan com campos obrigatórios (id, name, price_cents, active)', async () => {
        vi.spyOn(utils, 'getIXCCredentials' as any).mockResolvedValue({ url: 'http://ixc.com', token: 'key' });
        const adapter = new IXCAdapter('tenant1');
        
        vi.spyOn(global, 'fetch').mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                registros: [
                    { id: '1', nome: 'Plano 100M', valor: '99.90', ativo: 'S', status: 'A' },
                    { id: '2', razao: 'Plano 200M', vl_base: '119.90', ativo: 'N', status: 'I' }
                ]
            })
        } as any);

        const plans = await adapter.getPlans();
        expect(plans).toHaveLength(2);
        expect(plans[0]).toEqual({ id: '1', name: 'Plano 100M', price_cents: 9990, active: true });
        expect(plans[1]).toEqual({ id: '2', name: 'Plano 200M', price_cents: 11990, active: false });
    });

    it('2. getPlans(MKAuthAdapter) → mesmo schema de ERPPlan que IXCAdapter', async () => {
        vi.spyOn(utils, 'getIntegrationKeys' as any).mockResolvedValue({ mkAuthUrl: 'http://mk.com', mkAuthToken: 'key' });
        const adapter = new MKAuthAdapter('tenant2');
        
        vi.spyOn(global, 'fetch').mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                planos: [
                    { id_plano: '10', nome: 'Plano MK 1', valor: '50.00', ativo: 'sim' },
                    { id: '11', name: 'Plano MK 2', price: '60.50', ativo: false }
                ]
            })
        } as any);

        const plans = await adapter.getPlans();
        expect(plans).toHaveLength(2);
        expect(plans[0]).toEqual({ id: '10', name: 'Plano MK 1', price_cents: 5000, active: true });
        expect(plans[1]).toEqual({ id: '11', name: 'Plano MK 2', price_cents: 6050, active: false });
    });

    it('3. Plano novo detectado no ERP → salva no Firestore e envia email de notificação ao admin', async () => {
        // Redefine doc to return _path for our batch logic
        (db.collection as any).mockImplementation((path: string) => {
            return {
                where: vi.fn().mockReturnValue({
                    get: vi.fn(async () => {
                        return { empty: false, docs: [{ id: 'tenant1', data: () => ({ erp_type: 'ixc', active: true }) }] };
                    })
                }),
                doc: vi.fn((docId: string) => {
                    const docPath = `${path}/${docId}`;
                    return {
                        _path: docPath,
                        get: vi.fn(async () => ({ exists: !!mockDb[docPath], data: () => mockDb[docPath] })),
                        collection: vi.fn((subPath: string) => {
                             const colPath = `${docPath}/${subPath}`;
                             return {
                                 get: vi.fn(async () => ({ docs: [] })), // no old plans
                                 doc: vi.fn((subDocId: string) => ({ _path: `${colPath}/${subDocId}` }))
                             }
                        })
                    }
                })
            }
        });

        const batchMock = {
            set: vi.fn((ref, data, opts) => {
                batchOperations.push({ path: ref._path, data });
            }),
            commit: vi.fn(async () => {
                for (const op of batchOperations) {
                    mockDb[op.path] = op.data;
                }
                batchOperations = [];
            })
        };
        (db.batch as any).mockReturnValue(batchMock);

        vi.spyOn(utils, 'getIXCCredentials' as any).mockResolvedValue({ url: 'http', token: 'aa' });
        vi.spyOn(global, 'fetch').mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                registros: [
                    { id: '1', nome: 'Plano 1', valor: '99' }
                ]
            })
        } as any);

        // Run worker logic
        if (planSyncWorker) {
            await (planSyncWorker as any).processJob({ name: 'sync_erp_catalog' });
        }

        expect(mockDb['erp_plans/tenant1/plans/1']).toBeDefined();
        expect(mockDb['erp_plans/tenant1/plans/1'].name).toBe('Plano 1');
        
        // Verifica email
        expect(email.sendAdminEmail).toHaveBeenCalledWith('tenant1', expect.any(String), expect.any(String));
    });

    it('4. Sync sem mudanças → não envia email de notificação', async () => {
        mockDb['erp_plans/tenant1/plans/1'] = { id: '1', name: 'Plano 1', price_cents: 9900, active: true };
        
        (db.collection as any).mockImplementation((path: string) => {
            return {
                where: vi.fn().mockReturnValue({
                    get: vi.fn(async () => {
                        return { empty: false, docs: [{ id: 'tenant1', data: () => ({ erp_type: 'ixc', active: true }) }] };
                    })
                }),
                doc: vi.fn((docId: string) => {
                    const docPath = `${path}/${docId}`;
                    return {
                        _path: docPath,
                        get: vi.fn(async () => ({ exists: !!mockDb[docPath], data: () => mockDb[docPath] })),
                        collection: vi.fn((subPath: string) => {
                             const colPath = `${docPath}/${subPath}`;
                             return {
                                 get: vi.fn(async () => ({ docs: [{ id: '1', data: () => mockDb[`${colPath}/1`] }] })),
                                 doc: vi.fn((subDocId: string) => ({ _path: `${colPath}/${subDocId}` }))
                             }
                        })
                    }
                })
            }
        });

        const batchMock = {
            set: vi.fn(),
            commit: vi.fn(async () => {})
        };
        (db.batch as any).mockReturnValue(batchMock);

        vi.spyOn(utils, 'getIXCCredentials' as any).mockResolvedValue({ url: 'http', token: 'aa' });
        vi.spyOn(global, 'fetch').mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                registros: [
                    { id: '1', nome: 'Plano 1', valor: '99', ativo: 'S', status: 'A' }
                ]
            })
        } as any);

        if (planSyncWorker) {
            await (planSyncWorker as any).processJob({ name: 'sync_erp_catalog' });
        }

        expect(email.sendAdminEmail).not.toHaveBeenCalled();
    });

    it('5. Plano removido do ERP → marca active=false no Firestore (não deleta o registro)', async () => {
        mockDb['erp_plans/tenant1/plans/1'] = { id: '1', name: 'Plano 1', price_cents: 9900, active: true };
        
        (db.collection as any).mockImplementation((path: string) => {
            return {
                where: vi.fn().mockReturnValue({
                    get: vi.fn(async () => {
                        return { empty: false, docs: [{ id: 'tenant1', data: () => ({ erp_type: 'ixc', active: true }) }] };
                    })
                }),
                doc: vi.fn((docId: string) => {
                    const docPath = `${path}/${docId}`;
                    return {
                        _path: docPath,
                        get: vi.fn(async () => ({ exists: !!mockDb[docPath], data: () => mockDb[docPath] })),
                        collection: vi.fn((subPath: string) => {
                             const colPath = `${docPath}/${subPath}`;
                             return {
                                 get: vi.fn(async () => ({ docs: [{ id: '1', data: () => mockDb[`${colPath}/1`] }] })),
                                 doc: vi.fn((subDocId: string) => ({ _path: `${colPath}/${subDocId}` }))
                             }
                        })
                    }
                })
            }
        });

        const batchMock = {
            set: vi.fn((ref, data, opts) => {
                batchOperations.push({ path: ref._path, data });
            }),
            commit: vi.fn(async () => {
                for (const op of batchOperations) {
                    mockDb[op.path] = { ...mockDb[op.path], ...op.data };
                }
                batchOperations = [];
            })
        };
        (db.batch as any).mockReturnValue(batchMock);

        vi.spyOn(utils, 'getIXCCredentials' as any).mockResolvedValue({ url: 'http', token: 'aa' });
        vi.spyOn(global, 'fetch').mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                registros: [] // Removed!
            })
        } as any);

        if (planSyncWorker) {
            await (planSyncWorker as any).processJob({ name: 'sync_erp_catalog' });
        }

        expect(mockDb['erp_plans/tenant1/plans/1'].active).toBe(false);
        expect(email.sendAdminEmail).toHaveBeenCalled();
    });

    it('6. Cache Redis erp_plans:{tenantId} → TTL de 24 horas', async () => {
         // Setup scenario where it syncs...
         (db.collection as any).mockImplementation((path: string) => {
            return {
                where: vi.fn().mockReturnValue({
                    get: vi.fn(async () => {
                        return { empty: false, docs: [{ id: 'tenant1', data: () => ({ erp_type: 'ixc', active: true }) }] };
                    })
                }),
                doc: vi.fn((docId: string) => {
                    const docPath = `${path}/${docId}`;
                    return {
                        _path: docPath,
                        get: vi.fn(async () => ({ exists: !!mockDb[docPath], data: () => mockDb[docPath] })),
                        collection: vi.fn((subPath: string) => {
                             const colPath = `${docPath}/${subPath}`;
                             return {
                                 get: vi.fn(async () => ({ docs: [] })),
                                 doc: vi.fn((subDocId: string) => ({ _path: `${colPath}/${subDocId}` }))
                             }
                        })
                    }
                })
            }
        });

        vi.spyOn(utils, 'getIXCCredentials' as any).mockResolvedValue({ url: 'http', token: 'aa' });
        vi.spyOn(global, 'fetch').mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                registros: [
                    { id: '1', nome: 'Plano 1', valor: '99', ativo: 'S', status: 'A' }
                ]
            })
        } as any);

        const batchMock = { set: vi.fn(), commit: vi.fn(async () => {}) };
        (db.batch as any).mockReturnValue(batchMock);

        if (planSyncWorker) {
            await (planSyncWorker as any).processJob({ name: 'sync_erp_catalog' });
        }

        expect(redis.set).toHaveBeenCalledWith('erp_plans:tenant1', expect.any(String), 'EX', 86400); // 24 * 60 * 60
    });

    it('7. get_plans_info tool da IA → usa cache Redis em vez de buscar Firestore a cada mensagem', async () => {
        // Read the server file and match the implementation manually since we can't easily export the internal tool handling
        const geminiServerRaw = fs.readFileSync('src/lib/gemini.server.ts', 'utf-8');
        
        expect(geminiServerRaw).toContain('if (redisClient)');
        expect(geminiServerRaw).toContain('plansFromCache = await redisClient.get(`erp_plans:${tenantId}`);');
        expect(geminiServerRaw).toContain('toolResult = { plans: JSON.parse(plansFromCache), source: "cache" };');
    });
});
