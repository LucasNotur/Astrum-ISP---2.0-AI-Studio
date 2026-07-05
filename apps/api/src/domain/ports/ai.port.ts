export interface IClassifyResult {
  intent: string;
  urgency: string;
  sentiment: string;
}

export interface IStreamResult {
  textStream: AsyncIterable<string>;
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
  ): Promise<IStreamResult>;
}
