import { redisClient } from '../lib/redis';

export const PROVIDER_PRICES = {
  'openai': { input: 2.50, output: 10.00 }, // per 1M tokens
  'gemini-flash': { input: 0.075, output: 0.30 }, // per 1M tokens
  'anthropic-haiku': { input: 0.25, output: 1.25 }, // per 1M tokens
};

export const THRESHOLDS = {
  PRO: 10.00, // USD
};

export interface FirestoreDB {
  collection(name: string): any;
}

export interface EmailService {
  sendEmail(to: string, subject: string, body: string): Promise<void>;
}

export function calculateCost(provider: string, promptTokens: number, completionTokens: number): number {
  const price = PROVIDER_PRICES[provider as keyof typeof PROVIDER_PRICES];
  if (!price) {
    return 0; // Or throw error
  }
  
  const cost = (promptTokens / 1_000_000) * price.input + (completionTokens / 1_000_000) * price.output;
  
  if (isNaN(cost) || !isFinite(cost)) {
    return 0;
  }
  return cost;
}

export async function accumulateTokenCost(
  tenantId: string, 
  costUsd: number, 
  emailService: EmailService, 
  tenantEmail: string
): Promise<void> {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const key = `token_cost:${tenantId}:${month}`;
  
  const totalCost = await redisClient.incrbyfloat(key, costUsd);
  
  // if previous cost was below threshold and now is above, send email
  if (totalCost - costUsd < THRESHOLDS.PRO && totalCost >= THRESHOLDS.PRO) {
    await emailService.sendEmail(tenantEmail, 'Cost Alert', 'Your usage has exceeded the PRO plan threshold.');
  }
}

export async function syncTokenCosts(tenantIds: string[], db: FirestoreDB, exchangeRate: number): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  for (const tenantId of tenantIds) {
    const key = `token_cost:${tenantId}:${month}`;
    const costStr = await redisClient.get(key);
    
    if (costStr) {
      const costUsd = parseFloat(costStr);
      const costBrl = costUsd * exchangeRate;
      
      const docRef = db.collection('tenant_costs').doc(`${tenantId}_${month}`);
      await docRef.set({
        tenantId,
        month,
        cost_usd: costUsd,
        cost_brl: costBrl
      });
    }
  }
}
