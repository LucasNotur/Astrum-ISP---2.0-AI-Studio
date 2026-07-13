# Plano Firestore-Zero — ✅ CONCLUÍDO (2026-07-03)

**Fonte:** `.astrum-progress/PLANO_FIRESTORE_ZERO__CONCLUIDO.md`

**O que foi:** remoção TOTAL do Firebase/Firestore do código (regra R2). O Supabase
virou o único banco.

**Como (a jogada técnica):** descobriu-se que todo o backend legado passava por um
funil único (`src/lib/firebaseAdmin.ts`). Em vez de reescrever ~50 arquivos gigantes
(messageWorker 1605 linhas, gemini.server 4300 linhas), criou-se a camada
`src/lib/db-compat/` que IMITA a API do Firestore mas grava no Supabase:
- Coleções com tabela própria → roteadas para a tabela nativa.
- Coleções sem tabela → documento JSONB em `legacy_docs`.
- Self-healing: coluna desconhecida vai para o campo `extra` (JSONB).
- Auth: JWT do Supabase verificado em `src/lib/authVerify.ts`.

**Resultado:** firebase e firebase-admin DESINSTALADOS do package.json; 804 testes
verdes sem Firebase; frontend gravando direto no Supabase (db.ts reescrito com as
mesmas assinaturas). Storage → bucket `uploads` do Supabase Storage.

**Pendência operacional herdada:** quem tiver dados reais no Firestore de produção
precisa rodar o backfill (§2 do plano) antes do deploy final.
