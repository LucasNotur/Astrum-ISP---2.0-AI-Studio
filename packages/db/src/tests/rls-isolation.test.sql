-- Teste de isolamento RLS
-- Execute como usuário de tenant A e confirme que não vê dados do tenant B

-- 1. Inserir dados de dois tenants diferentes (como super_admin)
INSERT INTO tenants (id, name, slug) VALUES
  ('tenant-a-uuid', 'ISP Alpha', 'isp-alpha'),
  ('tenant-b-uuid', 'ISP Beta', 'isp-beta');

INSERT INTO customers (tenant_id, name, phone) VALUES
  ('tenant-a-uuid', 'Cliente A1', '11999991111'),
  ('tenant-b-uuid', 'Cliente B1', '11999992222');

-- 2. Como usuário do tenant A, deve ver APENAS clientes do tenant A
-- Simular: SET LOCAL jwt.claims.sub = 'user-do-tenant-a';
-- SELECT * FROM customers;
-- Resultado esperado: apenas "Cliente A1" — nunca "Cliente B1"

-- 3. Confirmar contagem
SELECT COUNT(*) FROM customers;
-- Como tenant A: deve retornar 1 (não 2)
