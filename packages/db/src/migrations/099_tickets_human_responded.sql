-- 099_tickets_human_responded.sql
-- Adiciona `human_responded` (+ `_at`) na tabela `tickets`.
--
-- A coluna já era LIDA em vários pontos (messageWorker:177 — guard "não responde
-- se humano já respondeu"; slaWorker; db.ts resolved_by) e ESCRITA pelo front
-- (App.tsx quando o atendente intervém) e pela rota `/api/tickets/human-response`
-- — mas NUNCA existiu no schema: os writes silenciavam e os reads davam sempre
-- `undefined` (feature quebrada de ponta a ponta). Esta migração unifica.
--
-- Aditiva e não-destrutiva. `tickets` já tem RLS por tenant (migration 096).

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS human_responded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS human_responded_at timestamptz;

COMMENT ON COLUMN public.tickets.human_responded IS
  'true quando um atendente humano respondeu ao ticket escalado — a IA para de responder (messageWorker guard).';
