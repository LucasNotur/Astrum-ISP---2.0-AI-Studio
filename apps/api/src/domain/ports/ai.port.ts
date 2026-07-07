export interface IClassifyResult {
  intent: string;
  urgency: string;
  sentiment: string;
}

export interface IStreamResult {
  textStream: AsyncIterable<string>;
  // IA-34: usage do AI SDK v6 — usage = último step, totalUsage = soma (todos steps).
  // Ambos são PromiseLike<{inputTokens, outputTokens, totalTokens}> (campos opcionais).
  // Mantemos opcionais para preservar compat com adapters legados.
  usage?: PromiseLike<{ inputTokens?: number; outputTokens?: number; totalTokens?: number }>;
  totalUsage?: PromiseLike<{ inputTokens?: number; outputTokens?: number; totalTokens?: number }>;
}

export type IToolCallback = (toolName: string, args: unknown) => Promise<unknown>;

export interface IToolsPort {
  execute(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

export type IToolsPortFactory = (tenantId: string) => IToolsPort;

export interface IAIPort {
  classifyIntent(message: string, context: string, tenantId: string): Promise<IClassifyResult>;
  streamWithTools(
    messages: Array<{ role: string; content: string }>,
    systemContext: string,
    tenantId: string,
    onTool: IToolCallback,
    opts?: { tier?: 'mini' | 'full'; tools?: Record<string, { description: string; parameters: any }> },
  ): Promise<IStreamResult>;
}
