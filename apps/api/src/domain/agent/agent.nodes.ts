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
import { supabaseAdmin }      from '../../infrastructure/database/supabase.client';

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

export const nodeClassify     = makeNodeClassify({ ai: vercelAIService, logger: infraLogger, db: supabaseAdmin });
export const nodeGuardrails   = makeNodeGuardrails({ guardrails: guardrailsAdapter, logger: infraLogger });
export const nodeDecideSource = makeNodeDecideSource(infraLogger);
export const nodeFetchContext = makeNodeFetchContext({ search: searchAdapter, db: agentDbAdapter, logger: infraLogger });
export const nodeGenerate     = makeNodeGenerate({ ai: vercelAIService, createTools: (t) => new ToolsExecutor(t), logger: infraLogger });
export const nodeValidate     = makeNodeValidate(infraLogger);
export const nodeEscalate     = makeNodeEscalate({ db: agentDbAdapter, logger: infraLogger });
export const nodeBlock        = makeNodeBlock(infraLogger);
export const nodeGradeContext = makeNodeGradeContext({ crag: cragAdapter, logger: infraLogger });
export const nodeRewriteQuery = makeNodeRewriteQuery({ crag: cragAdapter, logger: infraLogger });
export const nodeSelfCheck    = makeNodeSelfCheck({ crag: cragAdapter, logger: infraLogger });