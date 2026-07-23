-- =============================================================================
-- 082 — PLANO I (Uber do Técnico) — modelo de dados de operações de campo.
-- Fundação das Fases I-1 (prova: premises/media/events/checklist/materials) e
-- I-2 (rota & km: bases/shifts/locations/route_plans). Segue o padrão de RLS
-- por tenant das migrations 015+ (get_tenant_id()). Idempotente.
-- =============================================================================

-- ─── I-1: Prova do trabalho ──────────────────────────────────────────────────

-- 2.1 Prontuário do endereço do cliente (sobrevive a trocas de plano).
CREATE TABLE IF NOT EXISTS customer_premises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID REFERENCES customers(id),
  address TEXT,
  latitude DOUBLE PRECISION,            -- coordenada CONFIRMADA pelo técnico no local
  longitude DOUBLE PRECISION,
  reference_notes TEXT,                 -- "portão azul, cachorro bravo"
  access_instructions TEXT,
  cto_id UUID REFERENCES network_ctos(id),
  cto_port INTEGER,
  facade_photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_premises_tenant ON customer_premises (tenant_id);
CREATE INDEX IF NOT EXISTS idx_premises_customer ON customer_premises (customer_id);
ALTER TABLE customer_premises ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_own_premises" ON customer_premises;
CREATE POLICY "tenant_own_premises" ON customer_premises USING (tenant_id = get_tenant_id());

-- 2.2 Mídia da OS — a prova do "antes e depois", tipada e georreferenciada.
CREATE TABLE IF NOT EXISTS service_order_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  service_order_id UUID NOT NULL REFERENCES service_orders(id),
  technician_id UUID REFERENCES technicians(id),
  kind TEXT NOT NULL CHECK (kind IN (
    'fachada','antes','depois','equipamento','base_cto',
    'assinatura','documento','serial','outro')),
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  taken_at TIMESTAMPTZ,
  diagnosis_id UUID REFERENCES field_photo_diagnoses(id),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_so_media_os ON service_order_media (service_order_id);
CREATE INDEX IF NOT EXISTS idx_so_media_tenant ON service_order_media (tenant_id);
ALTER TABLE service_order_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_own_so_media" ON service_order_media;
CREATE POLICY "tenant_own_so_media" ON service_order_media USING (tenant_id = get_tenant_id());

-- 2.3 Linha do tempo imutável da OS — fonte de TODA a gestão de tempo.
CREATE TABLE IF NOT EXISTS service_order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  service_order_id UUID NOT NULL REFERENCES service_orders(id),
  technician_id UUID REFERENCES technicians(id),
  event TEXT NOT NULL CHECK (event IN (
    'criada','atribuida','aceita','a_caminho','chegou',
    'iniciada','pausada','retomada','concluida','cancelada','reagendada')),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_so_events_os ON service_order_events (service_order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_so_events_tenant ON service_order_events (tenant_id);
ALTER TABLE service_order_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_own_so_events" ON service_order_events;
CREATE POLICY "tenant_own_so_events" ON service_order_events USING (tenant_id = get_tenant_id());

-- 2.4 Checklist — template por tipo de OS + itens copiados para a OS.
CREATE TABLE IF NOT EXISTS service_order_checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  os_type TEXT NOT NULL,                -- 'instalacao_ftth', 'reparo', 'mudanca_endereco'...
  label TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',    -- [{ key, label, required }]
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_checklist_tpl_tenant ON service_order_checklist_templates (tenant_id, os_type);
ALTER TABLE service_order_checklist_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_own_checklist_tpl" ON service_order_checklist_templates;
CREATE POLICY "tenant_own_checklist_tpl" ON service_order_checklist_templates USING (tenant_id = get_tenant_id());

CREATE TABLE IF NOT EXISTS service_order_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  service_order_id UUID NOT NULL REFERENCES service_orders(id),
  item_key TEXT NOT NULL,
  label TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_checklist_items_os ON service_order_checklist_items (service_order_id);
ALTER TABLE service_order_checklist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_own_checklist_items" ON service_order_checklist_items;
CREATE POLICY "tenant_own_checklist_items" ON service_order_checklist_items USING (tenant_id = get_tenant_id());

-- 2.5 Materiais aplicados na OS (serial via QR scanner da PWA).
CREATE TABLE IF NOT EXISTS service_order_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  service_order_id UUID NOT NULL REFERENCES service_orders(id),
  name TEXT NOT NULL,
  serial_number TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'un',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_so_materials_os ON service_order_materials (service_order_id);
ALTER TABLE service_order_materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_own_so_materials" ON service_order_materials;
CREATE POLICY "tenant_own_so_materials" ON service_order_materials USING (tenant_id = get_tenant_id());

-- ─── I-2: Rota & KM ──────────────────────────────────────────────────────────

-- Base/ponto de partida das rotas.
CREATE TABLE IF NOT EXISTS bases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bases_tenant ON bases (tenant_id);
ALTER TABLE bases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_own_bases" ON bases;
CREATE POLICY "tenant_own_bases" ON bases USING (tenant_id = get_tenant_id());

-- Jornada do técnico (clock-in/out + odômetro para auditoria cruzada com GPS).
CREATE TABLE IF NOT EXISTS technician_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  technician_id UUID NOT NULL REFERENCES technicians(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  start_odometer_km NUMERIC,
  end_odometer_km NUMERIC,
  vehicle TEXT,
  computed_km NUMERIC,                  -- km por GPS (field-km.service)
  base_id UUID REFERENCES bases(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shifts_tech ON technician_shifts (technician_id, started_at);
CREATE INDEX IF NOT EXISTS idx_shifts_tenant ON technician_shifts (tenant_id);
ALTER TABLE technician_shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_own_shifts" ON technician_shifts;
CREATE POLICY "tenant_own_shifts" ON technician_shifts USING (tenant_id = get_tenant_id());

-- Breadcrumbs de GPS (o "carrinho andando no mapa"). Retenção: ver §8 LGPD.
CREATE TABLE IF NOT EXISTS technician_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  technician_id UUID NOT NULL REFERENCES technicians(id),
  shift_id UUID REFERENCES technician_shifts(id),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy_m DOUBLE PRECISION,
  speed_kmh DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tech_loc_shift ON technician_locations (shift_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_tech_loc_tenant ON technician_locations (tenant_id);
ALTER TABLE technician_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_own_tech_loc" ON technician_locations;
CREATE POLICY "tenant_own_tech_loc" ON technician_locations USING (tenant_id = get_tenant_id());

-- Rota do dia (otimizador v1: vizinho-mais-próximo + 2-opt, puro TS).
CREATE TABLE IF NOT EXISTS route_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  technician_id UUID NOT NULL REFERENCES technicians(id),
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'planejada'
    CHECK (status IN ('planejada','em_execucao','concluida','cancelada')),
  total_km_estimated NUMERIC,
  optimized_at TIMESTAMPTZ,
  algorithm TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_route_plans_tech ON route_plans (technician_id, date);
ALTER TABLE route_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_own_route_plans" ON route_plans;
CREATE POLICY "tenant_own_route_plans" ON route_plans USING (tenant_id = get_tenant_id());

CREATE TABLE IF NOT EXISTS route_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  route_plan_id UUID NOT NULL REFERENCES route_plans(id),
  service_order_id UUID NOT NULL REFERENCES service_orders(id),
  position INTEGER NOT NULL,
  eta TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  departed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_route_stops_plan ON route_stops (route_plan_id, position);
ALTER TABLE route_stops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_own_route_stops" ON route_stops;
CREATE POLICY "tenant_own_route_stops" ON route_stops USING (tenant_id = get_tenant_id());

-- ─── 2.8 Extensões em tabelas existentes ─────────────────────────────────────
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS vehicle TEXT;
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS plate TEXT;
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS skills TEXT[] DEFAULT '{}';
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS base_id UUID REFERENCES bases(id);

ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS premise_id UUID REFERENCES customer_premises(id);
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS time_window_start TIMESTAMPTZ;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS time_window_end TIMESTAMPTZ;
