-- 121_tickets_pipeline_stage.sql
-- Funil de vendas (KanbanBoard.tsx) — decisão do Lucas (2026-08-27): estágios
-- próprios, não derivar de tickets.status. O componente já tem 4 colunas fixas
-- (lead/qualificado/proposta/fechado) sem NENHUMA equivalência com o ciclo de vida
-- de suporte (open/in_progress/resolved/closed) — são conceitos ortogonais no mesmo
-- ticket (um lead em "proposta" pode estar com status 'open' o tempo todo).
--
-- Aditiva e não-destrutiva. CHECK restringe aos 4 valores que a UI realmente usa
-- (KanbanBoard.tsx:9-14); NULL = ainda não entrou no funil de vendas (não é toda
-- linha de `tickets` que representa uma oportunidade comercial).

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS pipeline_stage text;

ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_pipeline_stage_check;
ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_pipeline_stage_check
  CHECK (pipeline_stage IS NULL OR pipeline_stage IN ('lead', 'qualificado', 'proposta', 'fechado'));

COMMENT ON COLUMN public.tickets.pipeline_stage IS
  'Estágio no funil de vendas (KanbanBoard.tsx) — ortogonal a tickets.status (ciclo de vida de suporte). NULL = não é uma oportunidade comercial.';
