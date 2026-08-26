-- 116_tickets_conversation_id.sql
-- Adiciona `conversation_id` em `tickets`, ligando o ticket à conversa real
-- (tabela `conversations`/`messages`) que o pipeline de IA já usa.
--
-- Contexto: `ITicketInput` (apps/api/src/domain/ports/database.port.ts) já
-- declarava `conversation_id` como campo obrigatório há tempos —
-- `escalate.node.ts` já tentava gravá-lo ao criar um ticket de escalação —
-- mas a coluna nunca existiu em `tickets`. O insert (`agent-db.adapter.ts`)
-- não checava erro, então provavelmente falhava calado.
--
-- Sem esse link, a tela de chat do operador (ChatPage.tsx) não tinha como
-- saber qual conversa/thread de mensagens pertence a qual ticket — por isso
-- ela usava colunas fantasma (`ticket_id` em `messages`, que nunca existiu)
-- em vez do vínculo real via `conversation_id`.
--
-- Aditiva e não-destrutiva. `tickets` já tem RLS por tenant (migration 096).

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id);

COMMENT ON COLUMN public.tickets.conversation_id IS
  'Liga o ticket à conversa (tabela conversations/messages) — thread de mensagens que o ChatPage exibe. Criada lazy (getOrCreateConversation) na primeira mensagem se o ticket nasceu sem uma.';
