-- Seed de dados para testes E2E
-- Executar APENAS em ambiente de test/staging

-- Tenant de teste
INSERT INTO tenants (id, name, slug, plan, active)
VALUES ('00000000-0000-0000-0000-000000000001', 'ISP Teste E2E', 'isp-teste', 'pro', true)
ON CONFLICT (slug) DO NOTHING;

-- Admin de teste (senha: TestAdmin@2024)
INSERT INTO users (id, name, email, password_hash, role, tenant_id, active)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'Admin E2E',
  'admin@isp-teste.astrum.dev',
  '$argon2id$v=19$m=65536,t=3,p=4$seed_hash_placeholder',
  'admin',
  '00000000-0000-0000-0000-000000000001',
  true
)
ON CONFLICT (email) DO NOTHING;

-- Operator de teste (senha: TestOp@2024)
INSERT INTO users (id, name, email, password_hash, role, tenant_id, active)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'Operator E2E',
  'operator@isp-teste.astrum.dev',
  '$argon2id$v=19$m=65536,t=3,p=4$seed_hash_placeholder',
  'operator',
  '00000000-0000-0000-0000-000000000001',
  true
)
ON CONFLICT (email) DO NOTHING;
