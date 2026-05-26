import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateEscalationRules } from '../../lib/escalationEngine';
import { adminDb as db } from '../../lib/firebaseAdmin';
import redisClient from '../../lib/redis';

// Mock dependencias
const mockDb: Record<string, any> = {};

vi.mock('../../lib/firebaseAdmin', () => ({
    adminDb: {
        collection: vi.fn((path: string) => {
            return {
                where: vi.fn(function (field, op, value) {
                    return {
                        where: this.where,
                        limit: vi.fn(() => this),
                        get: vi.fn(async () => {
                            const docs = Object.keys(mockDb)
                                .filter(k => k.startsWith(`${path}/`))
                                .map(k => ({ id: k.split('/').pop(), data: () => mockDb[k] }));

                            const matched = docs.filter(d => {
                                if (op === '==' && d.data()[field] !== value) return false;
                                return true;
                            });

                            return {
                                empty: matched.length === 0,
                                docs: matched
                            };
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
        })
    }
}));

vi.mock('../../lib/redis', () => {
    const store: Record<string, string> = {};
    return {
        default: {
            get: vi.fn(async (key) => store[key] || null),
            set: vi.fn(async (key, val) => { store[key] = val; }),
            _inject: (key: string, val: string) => { store[key] = val; },
            _clear: () => { for (const k in store) delete store[k]; }
        }
    };
});

describe('Escalation Engine Rules', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Clear mockDb
        for (const key of Object.keys(mockDb)) {
            delete mockDb[key];
        }
        // Clear Redis
        (redisClient as any)._clear();
    });

    it('1. Regra por sentimento ANGRY → dispara ação escalate_to_human', async () => {
        mockDb['escalation_rules/t1/rules/r1'] = { condition_type: 'sentiment', condition_value: 'ANGRY', action: 'escalate_to_human', priority: 1, active: true };

        const result = await evaluateEscalationRules('t1', { id: 'tk1' }, { text: 'Ola', sentiment: 'ANGRY', ai_attempts: 1 });
        expect(result.escalated).toBe(true);
        expect(result.action).toBe('escalate_to_human');
    });

    it('2. Regra por keyword → mensagem com palavra-chave dispara a ação configurada', async () => {
        mockDb['escalation_rules/t1/rules/r1'] = { condition_type: 'keyword', condition_value: 'PROCON', action: 'legal_escalation', priority: 1, active: true };

        const result = await evaluateEscalationRules('t1', { id: 'tk1' }, { text: 'Vou acionar o procon', sentiment: 'NEUTRAL', ai_attempts: 1 });
        expect(result.escalated).toBe(true);
        expect(result.action).toBe('legal_escalation');
    });

    it('3. Regra por ai_attempts >= 3 → escalonar após 3 tentativas sem resolução', async () => {
        mockDb['escalation_rules/t1/rules/r1'] = { condition_type: 'ai_attempts', condition_value: 3, action: 'escalate_to_human', priority: 1, active: true };

        const r1 = await evaluateEscalationRules('t1', { id: 'tk1' }, { text: 'No logic', sentiment: 'NEUTRAL', ai_attempts: 2 });
        expect(r1.escalated).toBe(false);

        (redisClient as any)._clear(); // clear cache so we hit db again for simplicity

        const r2 = await evaluateEscalationRules('t1', { id: 'tk1' }, { text: 'No logic', sentiment: 'NEUTRAL', ai_attempts: 3 });
        expect(r2.escalated).toBe(true);
        expect(r2.action).toBe('escalate_to_human');
    });

    it('4. Duas regras satisfeitas → dispara APENAS a de maior prioridade (não empilha ações)', async () => {
        mockDb['escalation_rules/t1/rules/low'] = { condition_type: 'sentiment', condition_value: 'ANGRY', action: 'transfer', priority: 10, active: true };
        mockDb['escalation_rules/t1/rules/high'] = { condition_type: 'keyword', condition_value: 'URGENTE', action: 'create_urgent_os', priority: 90, active: true };

        const result = await evaluateEscalationRules('t1', { id: 'tk1' }, { text: 'Isso é URGENTE e estou com raiva', sentiment: 'ANGRY', ai_attempts: 1 });
        expect(result.escalated).toBe(true);
        expect(result.action).toBe('create_urgent_os');
    });

    it('5. Regra inativa (active=false) → nunca disparada mesmo com condição satisfeita', async () => {
        // We bypass the where('active', '==', true) in our query mock by pushing into Redis directly or modifying the query mock handle
        const rules = [
            { condition_type: 'sentiment', condition_value: 'ANGRY', action: 'transfer', priority: 10, active: false }
        ];
        (redisClient as any)._inject('escalation_rules:t1', JSON.stringify(rules));

        const result = await evaluateEscalationRules('t1', { id: 'tk1' }, { text: '', sentiment: 'ANGRY', ai_attempts: 1 });
        expect(result.escalated).toBe(false);
    });

    it('6. Cache Redis de regras → segunda mensagem usa Redis, não busca no Firestore', async () => {
        mockDb['escalation_rules/t1/rules/r1'] = { condition_type: 'ai_attempts', condition_value: 5, action: 'transfer', priority: 1, active: true };

        await evaluateEscalationRules('t1', { id: 'tk1' }, { text: '', sentiment: 'NEUTRAL', ai_attempts: 1 });
        expect(db.collection).toHaveBeenCalled();
        
        vi.clearAllMocks();

        await evaluateEscalationRules('t1', { id: 'tk1' }, { text: '', sentiment: 'NEUTRAL', ai_attempts: 2 });
        expect(db.collection).not.toHaveBeenCalled(); // got from redis!
    });

    it('7. Nenhuma regra satisfeita → retorna { escalated: false }', async () => {
        mockDb['escalation_rules/t1/rules/r1'] = { condition_type: 'ai_attempts', condition_value: 5, action: 'transfer', priority: 1, active: true };

        const result = await evaluateEscalationRules('t1', { id: 'tk1' }, { text: '', sentiment: 'NEUTRAL', ai_attempts: 1 });
        expect(result.escalated).toBe(false);
    });

    it('8. Ação create_urgent_os → OS criada no Firestore com priority=urgent', async () => {
        mockDb['escalation_rules/t1/rules/r1'] = { condition_type: 'sentiment', condition_value: 'ANGRY', action: 'create_urgent_os', priority: 1, active: true };

        const result = await evaluateEscalationRules('t1', { id: 'tk1' }, { text: 'bad', sentiment: 'ANGRY', ai_attempts: 1 });
        expect(result.escalated).toBe(true);
        expect(result.action).toBe('create_urgent_os');

        // Verify service_orders collection
        const hasUrgentOs = Object.keys(mockDb).some(k => k.startsWith('service_orders/') && mockDb[k].priority === 'urgent');
        expect(hasUrgentOs).toBe(true);
    });
});
