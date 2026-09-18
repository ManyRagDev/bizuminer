-- Suporte ao gate global de catálogo por validade da evidência (7 dias).
-- O estado continua derivado de product.last_seen_at; nenhuma linha histórica
-- é apagada ou reclassificada por relógio.

create index if not exists product_tenant_last_seen_only_idx
  on garimpa.product (tenant_id, last_seen_at desc);

comment on index garimpa.product_tenant_last_seen_only_idx is
  'Acelera vitrine e curadoria operacional limitadas por tenant e last_seen_at.';
