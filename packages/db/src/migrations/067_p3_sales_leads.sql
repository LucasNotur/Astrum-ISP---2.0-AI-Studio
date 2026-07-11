-- 067_p3_sales_leads.sql
-- P3 vendas: tabela de funil conversacional de vendas

create table if not exists sales_leads (
  id                          uuid        primary key default gen_random_uuid(),
  tenant_id                   uuid        not null references tenants(id) on delete cascade,
  conversation_id             uuid,       -- vínculo com conversations (sem FK obrigatória)
  stage                       text        not null default 'collecting_address'
    check (stage in (
      'collecting_address', 'checking_viability', 'viability_failed',
      'presenting_plans', 'collecting_data', 'registering',
      'scheduling', 'completed', 'abandoned'
    )),
  -- Endereço e viabilidade
  address                     text,
  viability_raw               jsonb,
  -- Plano selecionado
  selected_plan_id            text,
  selected_plan_name          text,
  selected_plan_price_cents   integer,
  -- Dados pessoais coletados
  full_name                   text,
  cpf                         text,
  email                       text,
  phone                       text,
  -- Referências no ERP
  erp_lead_id                 text,
  erp_customer_id             text,
  installation_order_id       text,
  installation_scheduled_for  timestamptz,
  -- Contrato digital
  contract_status             text        not null default 'not_sent'
    check (contract_status in ('not_sent', 'pending_signature', 'signed', 'failed')),
  contract_url                text,
  contract_provider           text,       -- 'clicksign' | 'd4sign' | 'erp'
  -- Timestamps
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists sales_leads_tenant_idx       on sales_leads(tenant_id);
create index if not exists sales_leads_conv_idx         on sales_leads(conversation_id) where conversation_id is not null;
create index if not exists sales_leads_stage_tenant_idx on sales_leads(tenant_id, stage);

alter table sales_leads enable row level security;

create policy "tenant_isolation_sales_leads"
  on sales_leads for all
  using (tenant_id = (current_setting('app.tenant_id', true))::uuid);

-- updated_at automático (reutiliza a função se já existir de outra migration)
create or replace function set_sales_leads_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sales_leads_updated_at
  before update on sales_leads
  for each row execute procedure set_sales_leads_updated_at();
