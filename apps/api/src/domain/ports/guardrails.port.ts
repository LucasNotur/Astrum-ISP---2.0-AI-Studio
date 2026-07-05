export interface IGuardrailsResult {
  safe: boolean;
  processedText: string;
  blockedReason?: string;
  pii: { detected: boolean; count: number };
  injection: { score: number; patterns: string[] };
  moderation: { flagged: boolean };
  totalLatencyMs: number;
}

export interface IGuardrailsPort {
  run(message: string, options: { tenantId: string }): Promise<IGuardrailsResult>;
}
