-- Backfill de publicações faltantes (E3, "criação de publicações faltantes").
-- Toda oferta da casa passa a ter publicação estável (slug legado `ml-<external_id>`),
-- necessária para a resolução V2 de `/go` (que começa por publication.slug).
-- Idempotente: não cria onde já existe publicação web do mesmo produto.

insert into garimpa.publication (id, tenant_id, product_id, affiliate_id, channel, slug)
select gen_random_uuid()::text, p.tenant_id, p.id, 'aff_local', 'web', 'ml-' || p.external_id
from garimpa.product p
where p.marketplace = 'mercadolivre'
  and not exists (
    select 1 from garimpa.publication pub
    where pub.product_id = p.id and pub.channel = 'web'
  )
on conflict (slug) do nothing;
