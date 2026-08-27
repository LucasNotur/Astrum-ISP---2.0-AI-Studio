-- 118_tickets_closing_reason.sql
-- Adiciona `closing_reason` na tabela `tickets`.
--
-- Mesmo padrão da 115 (snooze) e 116 (conversation_id): a coluna já era LIDA e
-- ESCRITA pelo front (ChatPage.tsx — dialog "Encerrar Atendimento") mas nunca
-- existiu no schema. `confirmClosing` gravava direto via client anônimo do
-- Supabase, que falhava calado (erro não checado) — o motivo de encerramento
-- nunca persistia.
--
-- Aditiva e não-destrutiva. `tickets` já tem RLS por tenant (migration 096).

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS closing_reason text;

COMMENT ON COLUMN public.tickets.closing_reason IS
  'Motivo de encerramento (tabulação) escolhido pelo operador ao resolver o ticket — ChatPage.tsx, dialog "Encerrar Atendimento".';
