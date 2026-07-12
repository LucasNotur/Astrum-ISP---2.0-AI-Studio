-- 070_d07_ltv_offer.sql
-- D-07 vendedor com LTV: adiciona colunas de oferta calibrada à tabela sales_leads

alter table sales_leads
  add column if not exists source           text default 'whatsapp'
    check (source in ('whatsapp','site','indicacao','anuncio','outro')),
  add column if not exists cto_occupancy_pct smallint
    check (cto_occupancy_pct between 0 and 100),
  add column if not exists estimated_ltv_cents integer,
  add column if not exists offer_tier       text default 'standard'
    check (offer_tier in ('standard','premium','promotional'));

create index if not exists sales_leads_source_idx    on sales_leads(tenant_id, source);
create index if not exists sales_leads_tier_idx      on sales_leads(tenant_id, offer_tier);
