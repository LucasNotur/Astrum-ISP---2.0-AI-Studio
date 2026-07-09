import { createHash } from 'crypto';
import { infraLogger } from '../logging/logger';

export type EdgeInferenceMode = 'off' | 'shadow';

export function getEdgeMode(): EdgeInferenceMode {
  const val = (process.env.EDGE_INFERENCE_MODE ?? 'off').trim().toLowerCase();
  return val === 'shadow' ? 'shadow' : 'off';
}

export function messageHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32);
}

const INTENT_ENUM = [
  'billing_inquiry', 'support_technical', 'support_billing',
  'cancel_service', 'complaint', 'new_service', 'other',
] as const;

export type Intent = (typeof INTENT_ENUM)[number];

export async function classifyAtEdge(
  message: string,
  _history?: string[],
): Promise<{ intent: Intent; ms: number } | null> {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_AI_API_TOKEN;
  if (!accountId || !apiToken) return null;

  const model = '@cf/meta/llama-3.1-8b-instruct';
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: `Classify the customer message intent as exactly one of: ${INTENT_ENUM.join(', ')}. Return ONLY valid JSON: {"intent":"<value>"}`,
            },
            { role: 'user', content: message },
          ],
        }),
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);

    const data = await res.json() as any;
    const text = data?.result?.response ?? '';
    const match = text.match(/"intent"\s*:\s*"(\w+)"/);
    if (!match) return null;

    const intent = match[1] as string;
    if (!INTENT_ENUM.includes(intent as Intent)) return null;

    return { intent: intent as Intent, ms: Date.now() - start };
  } catch (err) {
    infraLogger.warn({ err: (err as Error).message }, '[edge-classifier] falhou');
    return null;
  }
}
