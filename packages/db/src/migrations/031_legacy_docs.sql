-- 031_legacy_docs.sql — Plano FIRESTORE-ZERO (FZ-0).
-- Document store JSONB endereçável por path: fallback universal do db-compat para
-- coleções Firestore sem tabela nativa no Supabase (ai_personas, saas_metrics,
-- prompts/versions, subcoleções settings/*, etc). Ver .astrum-progress/PLANO_FIRESTORE_ZERO__CONCLUIDO.md §0.3.

CREATE TABLE IF NOT EXISTS legacy_docs (
  path        TEXT PRIMARY KEY,     -- ex: 'tenants/abc/settings/theme'
  collection  TEXT NOT NULL,        -- última coleção do path: 'settings'
  parent_path TEXT,                 -- 'tenants/abc' (NULL para top-level)
  data        JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Listagem de coleção = todos os docs com o mesmo parent_path + collection
CREATE INDEX IF NOT EXISTS idx_legacy_docs_collection ON legacy_docs (collection, parent_path);
CREATE INDEX IF NOT EXISTS idx_legacy_docs_parent     ON legacy_docs (parent_path);
-- Filtros where() do compat viram operadores JSONB
CREATE INDEX IF NOT EXISTS idx_legacy_docs_data       ON legacy_docs USING gin (data);

-- Acesso apenas via service_role (backend). Sem policy de tenant: o compat serve o
-- backend legado que já roda com credencial administrativa (como o Firestore Admin SDK).
ALTER TABLE legacy_docs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE legacy_docs IS
  'FZ: emulação de document-store para coleções Firestore legadas sem tabela nativa. Meta: esvaziar com o tempo (migrar para tabelas).';
