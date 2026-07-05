import { AgentState } from '../agent.state';
import { IAIPort, IToolsPortFactory } from '../../ports/ai.port';
import { ILoggerPort } from '../../ports/logger.port';

export function makeNodeGenerate(deps: {
  ai: Pick<IAIPort, 'streamWithTools'>;
  createTools: IToolsPortFactory;
  logger: ILoggerPort;
}) {
  return async function nodeGenerate(state: AgentState): Promise<Partial<AgentState>> {
    const { ragContext, dbContext, zepContext, userMessage, tenantId } = state;

    const systemContext = [
      ragContext && `## Documentos Técnicos:\n${ragContext}`,
      dbContext && `## Dados do Cliente:\n${dbContext}`,
      zepContext && `## Histórico:\n${zepContext}`,
    ].filter(Boolean).join('\n\n---\n\n');

    const toolsExecuted: AgentState['toolsExecuted'] = [];
    const tools = deps.createTools(tenantId);

    const streamResult = await deps.ai.streamWithTools(
      [{ role: 'user', content: userMessage }],
      systemContext,
      tenantId,
      async (toolName, args) => {
        const safeArgs = (args ?? {}) as Record<string, unknown>;
        const result = await tools.execute(toolName, safeArgs);
        toolsExecuted!.push({ name: toolName, args: safeArgs, result });
        return result;
      },
    );

    let fullResponse = '';
    for await (const chunk of streamResult.textStream) {
      fullResponse += chunk;
    }

    deps.logger.info({
      step: 'generate',
      responseLength: fullResponse.length,
      toolsUsed: toolsExecuted.length,
    }, 'Agent: generate');

    return {
      response: fullResponse,
      toolsExecuted,
      steps: [...state.steps, 'generate'],
    };
  };
}
