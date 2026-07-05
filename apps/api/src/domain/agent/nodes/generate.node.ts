import { AgentState } from '../agent.state';
import { vercelAIService } from '../../../infrastructure/ai/vercel-ai.service';
import { ToolsExecutor } from '../../../infrastructure/ai/tools.executor';
import { infraLogger } from '../../../infrastructure/logging/logger';

export async function nodeGenerate(state: AgentState): Promise<Partial<AgentState>> {
  const { ragContext, dbContext, zepContext, userMessage, tenantId } = state;

  const systemContext = [
    ragContext && `## Documentos Técnicos:\n${ragContext}`,
    dbContext && `## Dados do Cliente:\n${dbContext}`,
    zepContext && `## Histórico:\n${zepContext}`,
  ].filter(Boolean).join('\n\n---\n\n');

  const toolsExecutor = new ToolsExecutor(tenantId);
  const toolsExecuted: AgentState['toolsExecuted'] = [];

  const streamResult = await vercelAIService.streamWithTools(
    [{ role: 'user', content: userMessage }],
    systemContext,
    tenantId,
    async (toolName, args) => {
      const result = await toolsExecutor.execute(toolName, args as Record<string, unknown>);
      toolsExecuted!.push({ name: toolName, args: args as Record<string, unknown>, result });
      return result;
    },
  );

  let fullResponse = '';
  for await (const chunk of streamResult.textStream) {
    fullResponse += chunk;
  }

  infraLogger.info({
    step: 'generate',
    responseLength: fullResponse.length,
    toolsUsed: toolsExecuted.length,
  }, 'Agent: generate');

  return {
    response: fullResponse,
    toolsExecuted,
    steps: [...state.steps, 'generate'],
  };
}
