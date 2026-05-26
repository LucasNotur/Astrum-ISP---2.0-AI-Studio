import { adminDb as db } from './firebaseAdmin';
import redisClient from './redis';

export interface EscalationRule {
    priority: number;
    active: boolean;
    condition_type: 'sentiment' | 'keyword' | 'ai_attempts';
    condition_value: string | number;
    action: string;
}

export type EscalationResult = {
    escalated: boolean;
    action?: string;
};

export async function evaluateEscalationRules(
    tenantId: string,
    ticketData: { id: string, customerId?: string },
    context: { text: string, sentiment: string, ai_attempts: number }
): Promise<EscalationResult> {
    let rules: EscalationRule[] | null = null;
    const redisKey = `escalation_rules:${tenantId}`;

    if (redisClient) {
        const cached = await redisClient.get(redisKey);
        if (cached) {
            try {
                rules = JSON.parse(cached);
            } catch (e) {
                // Ignore
            }
        }
    }

    if (!rules) {
        rules = [];
        const rulesSnap = await db.collection(`escalation_rules/${tenantId}/rules`)
            .where('active', '==', true)
            .get();
        if (!rulesSnap.empty) {
            rules = rulesSnap.docs.map(d => d.data() as EscalationRule);
        }
        
        if (redisClient) {
            await redisClient.set(redisKey, JSON.stringify(rules), 'EX', 300);
        }
    }

    rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    for (const rule of rules) {
        if (rule.active === false) continue; // safety check 

        let matched = false;

        if (rule.condition_type === 'sentiment') {
            if (context.sentiment === rule.condition_value) {
                matched = true;
            }
        } else if (rule.condition_type === 'keyword') {
            if (context.text && context.text.toLowerCase().includes(String(rule.condition_value).toLowerCase())) {
                matched = true;
            }
        } else if (rule.condition_type === 'ai_attempts') {
            if (context.ai_attempts >= Number(rule.condition_value)) {
                matched = true;
            }
        }

        if (matched) {
            if (rule.action === 'create_urgent_os') {
                await db.collection("service_orders").add({
                    tenantId,
                    ticketId: ticketData.id,
                    priority: "urgent",
                    status: "open",
                    createdAt: new Date(),
                    description: `Escalated automatically`
                });
            }

            return {
                escalated: true,
                action: rule.action
            };
        }
    }

    return { escalated: false };
}
