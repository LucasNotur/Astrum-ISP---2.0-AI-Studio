import { AgentState } from '../agent.state';
import { IAIPort, IToolsPortFactory } from '../../ports/ai.port';
import { ILoggerPort } from '../../ports/logger.port';
import { findCachedResponse, storeCachedResponse, isEligibleForCache } from '../../../infrastructure/cache/semantic-cache.service';
import { getEnabledTools } from '../../../infrastructure/ai/tool-registry';
import { isLiveTranslationEnabled, LANGUAGE_NAMES, type SupportedLanguage } from '../../../infrastructure/ai/language-detector';
import { compressContext, DEFAULT_BUDGETS, isPromptCompressionEnabled } from '../../../infrastructure/rag/context-compressor';

export function makeNodeGenerate(deps: {
  ai: Pick<IAIPort, 'streamWithTools'>;
  createTools: IToolsPortFactory;
  logger: ILoggerPort;
}) {
  return async function nodeGenerate(state: AgentState): Promise<Partial<AgentState>> {
    const { ragContext, dbContext, zepContext, userMessage, tenantId, intent, dataSource, detectedLanguage } = state;

    // IA-14 — Sufixo do system context quando cliente escreveu em idioma não-pt.
    // Adicionado ANTES do cache semântico (RN4): a resposta cacheada de uma
    // versão sem o sufixo seria a errada; ignoramos cache quando há sufixo.
    const languageSuffix = (
      isLiveTranslationEnabled()
      && detectedLanguage
      && detectedLanguage !== 'pt'
    )
      ? `\n\nIMPORTANTE: o cliente escreveu em ${LANGUAGE_NAMES[detectedLanguage as SupportedLanguage]}. Responda TODO o atendimento nesse idioma.`
      : '';

    // IA-02: Cache semântico — tentar resposta do cache antes de chamar LLM
    if (!languageSuffix && isEligibleForCache({ dataSource, dbContext, toolsExecuted: state.toolsExecuted })) {
      const cached = await findCachedResponse(userMessage, tenantId);
      if (cached) {
        deps.logger.info({
          step: 'generate',
          cacheHit: true,
          score: cached.score.toFixed(4),
        }, 'Agent: generate (cache hit)');
        return {
          response: cached.response,
          steps: [...state.steps, 'generate:cache_hit'],
        };
      }
    }

    // IA-30 — Compressão determinística do systemContext (RAG + DB + Zep).
    // Flag off = byte-a-byte igual ao atual. Flag on = dedup global + budget por seção.
    const compressionEnabled = isPromptCompressionEnabled();
    let baseContext: string;
    if (compressionEnabled) {
      const r = compressContext([
        { label: 'Documentos Técnicos', text: ragContext ?? '', budgetTokens: DEFAULT_BUDGETS.RAG },
        { label: 'Dados do Cliente',    text: dbContext  ?? '', budgetTokens: DEFAULT_BUDGETS.DB  },
        { label: 'Histórico',          text: zepContext ?? '', budgetTokens: DEFAULT_BUDGETS.ZEP },
      ]);
      baseContext = r.text;
      deps.logger.info({
        step: 'generate',
        compression: 'on',
        tokensBefore: r.tokensBefore,
        tokensAfter: r.tokensAfter,
        savedPct: r.savedPct,
        tenantId,
      }, 'Agent: context compression');
    } else {
      baseContext = [
        ragContext && `## Documentos Técnicos:\n${ragContext}`,
        dbContext && `## Dados do Cliente:\n${dbContext}`,
        zepContext && `## Histórico:\n${zepContext}`,
      ].filter(Boolean).join('\n\n---\n\n');
    }

    const systemContext = baseContext + languageSuffix;

    const toolsExecuted: AgentState['toolsExecuted'] = [];
    const tools = deps.createTools(tenantId);

    // IA-02: Cascata de modelos — mini para conversacional, full para raciocínio
    const tier = (intent === 'other' || dataSource === 'none') ? 'mini' : 'full';

    // IA-19: resolver o subconjunto de tools habilitado pelo registry (fail-open).
    const enabledTools = await getEnabledTools(tenantId);
    deps.logger.info(
      { tenantId, toolsOffered: Object.keys(enabledTools).length },
      'Agent: tools resolvidas via registry',
    );

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
      { tier, tools: enabledTools },
    );

    let fullResponse = '';
    for await (const chunk of streamResult.textStream) {
      fullResponse += chunk;
    }

    deps.logger.info({
      step: 'generate',
      responseLength: fullResponse.length,
      toolsUsed: toolsExecuted.length,
      tier,
      language: detectedLanguage,
    }, 'Agent: generate');

    // IA-02: Armazenar resposta no cache semântico (fire-and-forget) — só pt
    if (!languageSuffix && isEligibleForCache({ dataSource, dbContext, toolsExecuted })) {
      storeCachedResponse(userMessage, fullResponse, tenantId).catch(() => {});
    }

    return {
      response: fullResponse,
      toolsExecuted,
      steps: [...state.steps, 'generate'],
    };
  };
}
