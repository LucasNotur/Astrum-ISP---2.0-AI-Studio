-- SEED DE DESENVOLVIMENTO — apenas ambiente local/staging
-- Execute SOMENTE com NODE_ENV=development

-- Tenant de teste
INSERT INTO tenants (id, name, slug, plan) VALUES
  ('00000000-0000-0000-0000-000000000001', 'ISP Demo', 'isp-demo', 'pro')
ON CONFLICT (slug) DO NOTHING;

-- Usuário admin de teste (senha: Admin@1234)
-- Hash Argon2id de 'Admin@1234' — gere um novo com hashPassword() para produção
INSERT INTO users (id, email, name, role, tenant_id, password_hash) VALUES
  (
    '00000000-0000-0000-0000-000000000002',
    'admin@ispdemo.com',
    'Admin Demo',
    'admin',
    '00000000-0000-0000-0000-000000000001',
    '$argon2id$v=19$m=65536,t=3,p=4$placeholder-hash-gere-com-hashPassword'
  )
ON CONFLICT (email) DO NOTHING;

-- Cliente de teste
INSERT INTO customers (tenant_id, name, email, phone, plan_id, status) VALUES
  ('00000000-0000-0000-0000-000000000001', 'João Silva', 'joao@email.com', '11999990001', '300mb', 'active'),
  ('00000000-0000-0000-0000-000000000001', 'Maria Santos', 'maria@email.com', '11999990002', '100mb', 'suspended')
ON CONFLICT DO NOTHING;

-- Configuração de IA padrão
INSERT INTO ai_configurations (tenant_id, bot_name, personality) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Astro Demo', 'prestativo e técnico')
ON CONFLICT (tenant_id) DO NOTHING;
