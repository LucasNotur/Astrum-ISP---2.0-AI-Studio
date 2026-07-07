/**
 * Barrel de nós do agente — único lugar onde domain importa infrastructure.
 * Os nós são factory functions puras; aqui injetamos as implementações reais.
 */

import { infraLogger }        from '../../infrastructure/logging/logger';
import { vercelAIService }    from '../../infrastructure/ai/vercel-ai.service';
import { ToolsExecutor }      from '../../infrastructure/ai/tools.executor';
import { guardrailsAdapter }  from '../../infrastructure/adapters/guardrails.adapter';
import { searchAdapter }      from '../../infrastructure/adapters/search.adapter';
import { agentDbAdapter }     from '../../infrastructure/adapters/agent-db.adapter';
import { cragAdapter }        from '../../infrastructure/adapters/crag.adapter';
import type { IToolsPort, IToolsPortFactory } from '../ports/ai.port';

import { makeNodeClassify }     from './nodes/classify.node';
import { makeNodeGuardrails }   from './nodes/guardrails.node';
import { makeNodeDecideSource } from './nodes/decide-source.node';
import { makeNodeFetchContext } from './nodes/fetch-context.node';
import { makeNodeGenerate }     from './nodes/generate.node';
import { makeNodeValidate }     from './nodes/validate.node';
import { makeNodeEscalate }     from './nodes/escalate.node';
import { makeNodeBlock }        from './nodes/block.node';
import { makeNodeGradeContext } from './nodes/grade-context.node';
import { makeNodeRewriteQuery } from './nodes/rewrite-query.node';
import { makeNodeSelfCheck }    from './nodes/self-check.node';

// ─── IA-46 — Seam mínima para o replay engine ────────────────────────────────
// `nodeGenerate` é capturado no momento do buildAgentGraph() e não aceita
// parâmetro de factory em runtime. Este override thread-local é a forma
// menos invasiva de injetar um ToolsExecutor alternativo (ex.: dry-run no
// replay) sem reescrever a assinatura do grafo. SEMPRE restaurar com
// setCreateToolsOverride(null) em um try/finally — caso contrário o próximo
// atendimento real roda com o executor do replay.
let _createToolsOverride: IToolsPortFactory | null = null;

export function setCreateToolsOverride(factory: IToolsPortFactory | null): void {
  _createToolsOverride = factory;
}

const defaultCreateTools: IToolsPortFactory = (tenantId) => new ToolsExecutor(tenantId) as unknown as IToolsPort;

export const nodeClassify     = makeNodeClassify({ ai: vercelAIService, logger: infraLogger });
export const nodeGuardrails   = makeNodeGuardrails({ guardrails: guardrailsAdapter, logger: infraLogger });
export const nodeDecideSource = makeNodeDecideSource(infraLogger);
export const nodeFetchContext = makeNodeFetchContext({ search: searchAdapter, db: agentDbAdapter, logger: infraLogger });
export const nodeGenerate     = makeNodeGenerate({
  ai: vercelAIService,
  createTools: (tenantId) => (_createToolsOverride ?? defaultCreateTools)(tenantId),
  logger: infraLogger,
});
export const nodeValidate     = makeNodeValidate(infraLogger);
export const nodeEscalate     = makeNodeEscalate({ db: agentDbAdapter, logger: infraLogger });
export const nodeBlock        = makeNodeBlock(infraLogger);
export const nodeGradeContext = makeNodeGradeContext({ crag: cragAdapter, logger: infraLogger });
export const nodeRewriteQuery = makeNodeRewriteQuery({ crag: cragAdapter, logger: infraLogger });
export const nodeSelfCheck    = makeNodeSelfCheck({ crag: cragAdapter, logger: infraLogger });