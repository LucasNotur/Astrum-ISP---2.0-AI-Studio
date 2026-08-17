-- 105: histórico de saúde WhatsApp (chip "WhatsApp health tracking", 2026-08-17).
-- Complementa GET /api/v2/whatsapp/health-stats (fotografia ao vivo, whatsapp-health.service.ts)
-- com uma série temporal: um job periódico grava um snapshot por instância, permitindo
-- ver tendência (ex.: ban_signals subindo ao longo do dia) em vez de só o estado atual.
create table whatsapp_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  instance_id text not null,
  ban_signals integer not null default 0,
  is_paused boolean not null default false,
  daily_messages_today integer not null default 0,
  messages_in_queue integer not null default 0,
  risk_level text not null default 'ok' check (risk_level in ('ok', 'warning', 'critical')),
  created_at timestamptz not null default now()
);

create index idx_whatsapp_health_snapshots_lookup
  on whatsapp_health_snapshots (tenant_id, instance_id, created_at desc);

alter table whatsapp_health_snapshots enable row level security;

create policy super_admin_all_whatsapp_health_snapshots
  on whatsapp_health_snapshots for all
  using (is_super_admin());

create policy tenant_own_whatsapp_health_snapshots
  on whatsapp_health_snapshots for select
  using (tenant_id = get_tenant_id());

-- Só o service_role (worker de snapshot) escreve; tenants só leem o próprio histórico.
create policy service_role_insert_whatsapp_health_snapshots
  on whatsapp_health_snapshots for insert
  to service_role
  with check (true);
