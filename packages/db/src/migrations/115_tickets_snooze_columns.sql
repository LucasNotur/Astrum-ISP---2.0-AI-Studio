-- 115_tickets_snooze_columns.sql
-- Adiciona snoozed_until/snooze_reason/snoozed_by na tabela `tickets`.
--
-- Mesmo padrão da migration 099 (human_responded): as colunas já eram LIDAS
-- e ESCRITAS pelo front (TicketsPage.tsx, ChatPage.tsx — dialog "Adiar/Snooze")
-- e LIDAS pelo snooze.worker.ts (roda a cada minuto em produção) — mas nunca
-- existiram no schema. O worker falhava silenciosamente em todo ciclo e o
-- write do front nunca persistia (feature quebrada de ponta a ponta).
--
-- Aditiva e não-destrutiva. `tickets` já tem RLS por tenant (migration 096).

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz,
  ADD COLUMN IF NOT EXISTS snooze_reason text,
  ADD COLUMN IF NOT EXISTS snoozed_by text;

COMMENT ON COLUMN public.tickets.snoozed_until IS
  'Instante em que o snooze vence — snooze.worker.ts reabre o ticket (status=open) quando passa.';
COMMENT ON COLUMN public.tickets.snoozed_by IS
  'ID (ou nome) do operador que adiou o ticket — texto livre, não FK, para paridade com o legado.';
