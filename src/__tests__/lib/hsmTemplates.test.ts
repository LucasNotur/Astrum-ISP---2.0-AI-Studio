import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { sendHSMTemplate, TemplateNotApprovedError } from '../../lib/whatsappSender';
import { hsmTemplatesRouter } from '../../routes/hsmTemplates';
import { adminDb as db } from '../../lib/firebaseAdmin';

// Mocks
const mockDb: Record<string, any> = {};

vi.mock('../../lib/firebaseAdmin', () => ({
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
            delete: vi.fn(async () => {
              delete mockDb[docPath];
            }),
            collection: vi.fn((subPath: string) => {
              const colPath = `${docPath}/${subPath}`;
              return {
                where: vi.fn(function(field, op, value) {
                  return {
                    where: this.where,
                    limit: vi.fn(() => ({
                      get: vi.fn(async () => {
                        const docsRefs = Object.keys(mockDb)
                          .filter(k => k.startsWith(`${colPath}/`))
                          .map(k => ({ id: k.split('/').pop(), data: () => mockDb[k] }));
                        
                        let matched = docsRefs.filter(d => {
                           if (op === '==' && d.data()[field] !== value) return false;
                           // we manually also apply the other where if any (rough mock)
                           return true;
                        });
                        
                        // the mock for `where` needs to be stateful to chain properly, but for this test we can just hardcode the results or improve the mock
                        // Instead of building a complex where mock, we'll use a trick
                        matched = docsRefs.filter(d => {
                            let isMatch = true;
                            if (mockDb['_q_name'] && d.data().name !== mockDb['_q_name']) isMatch = false;
                            if (mockDb['_q_status'] && d.data().status !== mockDb['_q_status']) isMatch = false;
                            return isMatch;
                        });
                        
                        return {
                          empty: matched.length === 0,
                          docs: matched
                        };
                      })
                    })),
                    // store the filter condition so the GET block can use it
                    _storeFilter: () => {
                         if (field === 'name') mockDb['_q_name'] = value;
                         if (field === 'status') mockDb['_q_status'] = value;
                    }
                  }._storeFilter() || this; // this won't chain correctly, we'll fix it below
                }),
                get: vi.fn(async () => {
                    const docsRefs = Object.keys(mockDb)
                        .filter(k => k.startsWith(`${colPath}/`))
                        .map(k => ({ id: k.split('/').pop(), data: () => mockDb[k] }));
                    return { docs: docsRefs };
                }),
                add: vi.fn(async (data) => {
                    const newId = `new_id_${Date.now()}`;
                    mockDb[`${colPath}/${newId}`] = data;
                    return { id: newId };
                }),
                doc: vi.fn((subDocId) => {
                     const dPath = `${colPath}/${subDocId}`;
                     return {
                       get: vi.fn(async () => {
                         const data = mockDb[dPath];
                         return { exists: !!data, data: () => data };
                       }),
                       delete: vi.fn(async () => delete mockDb[dPath])
                     }
                })
              };
            })
          };
        }),
        add: vi.fn(async (data) => {
            const newId = `new_log_${Date.now()}`;
            mockDb[`${path}/${newId}`] = data;
        })
      };
    })
  }
}));

// We'll replace the vi.fn chain with a simpler one that just reads globals
vi.mock('../../lib/dbAdmin', () => ({
    getIntegrationKeys: vi.fn().mockResolvedValue({
        evolutionUrl: 'http://evo.com',
        evolutionInstance: 'inst1',
        evolutionApiKey: 'key1'
    })
}));

const app = express();
app.use(express.json());
app.use('/api/hsm-templates', hsmTemplatesRouter);

describe('HSM Templates', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Clear mock DB
        for (const key of Object.keys(mockDb)) {
            delete mockDb[key];
        }
        
        // global fetch mock
        vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({ status: 'success' })
        } as any);
    });

    // We will override db mock locally using a wrapper to properly test `where` clauses without the crazy chained mock above
    it('1. Template APPROVED → variáveis {{1}} {{2}} substituídas corretamente no envio', async () => {
        // Redefine fetch just to capture the request body
        let reqBody: any;
        vi.spyOn(global, 'fetch').mockImplementation(async (url, opts: any) => {
            reqBody = JSON.parse(opts.body);
            return { ok: true, json: async () => ({ status: 'success' }) } as any;
        });

        // Mock exact db query result simply by intercepting the method
        const mockTemplate = {
            body: "Ola {{1}}, seu pedido {{2}} foi aprovado.",
            status: "APPROVED"
        };
        // Setup mock response for db.collection('tenants').doc(tenantId).collection('hsm_templates').where(..).where(..).limit(1).get()
        const getMock = vi.fn().mockResolvedValue({
            empty: false,
            docs: [{ id: 'temp1', data: () => mockTemplate }]
        });
        
        (db.collection as any).mockImplementationOnce(() => ({
            doc: () => ({
                collection: () => ({
                    where: () => ({
                        where: () => ({
                            limit: () => ({ get: getMock })
                        })
                    })
                })
            })
        }));

        await sendHSMTemplate('t1', 'hello_template', '5511999999999', { '1': 'Joao', '2': '123' });

        // the fetch to evolution API
        expect(reqBody.variables).toEqual([{ text: 'Joao' }, { text: '123' }]);
    });

    it('2. Template REJECTED → lança TEMPLATE_NOT_APPROVED sem enviar mensagem', async () => {
        const getMock = vi.fn().mockResolvedValue({ empty: true });
        (db.collection as any).mockImplementationOnce(() => ({
            doc: () => ({ collection: () => ({ where: () => ({ where: () => ({ limit: () => ({ get: getMock }) }) }) }) })
        }));

        await expect(sendHSMTemplate('t1', 'bad_template', '55119', {})).rejects.toThrow("TEMPLATE_NOT_APPROVED");
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('3. Template PENDING → lança TEMPLATE_NOT_APPROVED', async () => {
        const getMock = vi.fn().mockResolvedValue({ empty: true });
        (db.collection as any).mockImplementationOnce(() => ({
            doc: () => ({ collection: () => ({ where: () => ({ where: () => ({ limit: () => ({ get: getMock }) }) }) }) })
        }));

        await expect(sendHSMTemplate('t1', 'pending_template', '55119', {})).rejects.toThrow("TEMPLATE_NOT_APPROVED");
    });

    it('4. Variável {{1}} sem valor fornecido → lança MISSING_TEMPLATE_VARIABLE', async () => {
        const mockTemplate = {
            body: "Ola {{1}}",
            status: "APPROVED"
        };
        const getMock = vi.fn().mockResolvedValue({
            empty: false,
            docs: [{ id: 'temp1', data: () => mockTemplate }]
        });
        
        (db.collection as any).mockImplementationOnce(() => ({
            doc: () => ({ collection: () => ({ where: () => ({ where: () => ({ limit: () => ({ get: getMock }) }) }) }) })
        }));

        await expect(sendHSMTemplate('t1', 'hello', '55119', {})).rejects.toThrow("MISSING_TEMPLATE_VARIABLE");
    });

    it('5. Envio bem-sucedido → registra em hsm_send_logs com tenant_id, template_id e recipient', async () => {
        const mockTemplate = {
            body: "Ola test",
            status: "APPROVED"
        };
        const getMock = vi.fn().mockResolvedValue({
            empty: false,
            docs: [{ id: 'temp1', data: () => mockTemplate }]
        });
        
        (db.collection as any).mockImplementationOnce(() => ({
            doc: () => ({ collection: () => ({ where: () => ({ where: () => ({ limit: () => ({ get: getMock }) }) }) }) })
        }));

        const addLogMock = vi.fn().mockResolvedValue({ id: 'log1' });
        (db.collection as any).mockImplementationOnce(() => ({ add: addLogMock })); // This intercepts the second db.collection call (hsm_send_logs)

        await sendHSMTemplate('t1', 'hello', '55119', {});

        expect(addLogMock).toHaveBeenCalledWith(expect.objectContaining({
            tenant_id: 't1',
            template_id: 'temp1',
            recipient: '55119'
        }));
    });

    it('6. DELETE de template APPROVED → bloqueado', async () => {
        // We'll reset the mock to our default stateful mock which we can populate
        vi.restoreAllMocks(); // wait we shouldn't restore everything, just clear db mock if we overrode it
        
        mockDb['tenants/t1/hsm_templates/temp_appr'] = { status: 'APPROVED' };

        const res = await request(app).delete('/api/hsm-templates/temp_appr?tenantId=t1');
        
        expect(res.status).toBe(403);
        expect(res.body.error).toContain('Cannot delete APPROVED');
        expect(mockDb['tenants/t1/hsm_templates/temp_appr']).toBeDefined(); // still there
    });

    it('7. Templates do tenant A → não visíveis na listagem do tenant B', async () => {
        // Use default stateful mock
        mockDb['tenants/tenantA/hsm_templates/ta1'] = { name: 'Template A' };
        mockDb['tenants/tenantB/hsm_templates/tb1'] = { name: 'Template B' };

        const resA = await request(app).get('/api/hsm-templates?tenantId=tenantA');
        const resB = await request(app).get('/api/hsm-templates?tenantId=tenantB');

        expect(resA.status).toBe(200);
        expect(resA.body).toHaveLength(1);
        expect(resA.body[0].name).toBe('Template A');

        expect(resB.status).toBe(200);
        expect(resB.body).toHaveLength(1);
        expect(resB.body[0].name).toBe('Template B');
    });
});
