-- 126_ai_performance_logs_observability.sql
-- Telemetria operacional real do agente (AIObservabilityPage.tsx / AIConfigPage.tsx).
-- Achado no PLANO_ACAO_100_OPERACIONAL.md (F1-D): a página lê `ai_performance_logs`
-- esperando escalated/agent/active_flow/step/tool_called/result/input_summary/
-- provider — nenhuma dessas colunas existia (schema real era só custo/qualidade
-- por ticket). Não é rename: são campos operacionais novos, mapeados 1:1 do
-- `finalState` que o LangGraph (`langgraph.service.ts`) já calcula por mensagem
-- mas nunca gravava.
--
-- Aditiva e não-destrutiva. Todas nullable (exceto escalated, default false) —
-- linhas antigas continuam válidas, só sem os campos novos.

ALTER TABLE public.ai_performance_logs
  ADD COLUMN IF NOT EXISTS escalated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agent text,
  ADD COLUMN IF NOT EXISTS active_flow text,
  ADD COLUMN IF NOT EXISTS step text,
  ADD COLUMN IF NOT EXISTS tool_called text,
  ADD COLUMN IF NOT EXISTS result text,
  ADD COLUMN IF NOT EXISTS input_summary text,
  ADD COLUMN IF NOT EXISTS provider text;

ALTER TABLE public.ai_performance_logs
  DROP CONSTRAINT IF EXISTS ai_performance_logs_result_check;
ALTER TABLE public.ai_performance_logs
  ADD CONSTRAINT ai_performance_logs_result_check
  CHECK (result IS NULL OR result IN ('ok', 'fatal'));

COMMENT ON COLUMN public.ai_performance_logs.escalated IS
  'Espelha finalState.requiresHuman do LangGraph — mensagem terminou em escalação humana.';
COMMENT ON COLUMN public.ai_performance_logs.agent IS
  'Subsistema de IA que processou (hoje sempre ''atendimento'' — supervisor multi-agente ainda não está em produção).';
COMMENT ON COLUMN public.ai_performance_logs.active_flow IS
  'finalState.intent classificado (support_technical, billing, etc.) — o "funil" que a mensagem percorreu.';
COMMENT ON COLUMN public.ai_performance_logs.step IS
  'Último nó do grafo LangGraph visitado (finalState.steps[-1]) — onde a mensagem terminou/parou.';
COMMENT ON COLUMN public.ai_performance_logs.tool_called IS
  'Nomes das tools executadas nesta mensagem (finalState.toolsExecuted), separados por vírgula. NULL = nenhuma tool chamada.';
COMMENT ON COLUMN public.ai_performance_logs.result IS
  '''ok'' = grafo completou normalmente; ''fatal'' = exceção não tratada no processMessage (ver catch em langgraph.service.ts).';
COMMENT ON COLUMN public.ai_performance_logs.input_summary IS
  'Prefixo truncado (200 chars) da mensagem do cliente — só para exibição em log operacional, não é o histórico completo.';
COMMENT ON COLUMN public.ai_performance_logs.provider IS
  'Provider do modelo usado (openai/google/anthropic), derivado do nome do model gravado nesta mesma linha.';
