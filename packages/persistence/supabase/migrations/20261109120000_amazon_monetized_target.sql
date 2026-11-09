-- Suporte à monetização de links da Amazon na resolução pública (/go/slug).
-- Monta URL canônica: https://www.amazon.com.br/dp/[ASIN]?tag=[tracking_id]

create or replace function garimpa.public_monetized_target(p_slug text)
 returns table(url text, publication_id text, tenant_id text)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'garimpa'
as $function$
declare
  f record;
  p record;
  c record;
  pair text;
  kept text[] := array[]::text[];
  base text;
  fragment text;
  query text;
begin
  select * into f from garimpa.public_offer_candidates(null, p_slug) where slug = p_slug limit 1;
  if not found then return; end if;

  select pub.*, product.product_url, product.external_id
    into p
    from garimpa.publication pub
    join garimpa.product product
      on product.id = pub.product_id and product.tenant_id = pub.tenant_id
   where pub.id = f.publication_id;

  -- 1. Shopee e AliExpress (links pré-gerados)
  if f.marketplace in ('shopee', 'aliexpress') then
    if p.affiliate_url is null or p.affiliate_url !~ '^https://' then return; end if;
    return query select p.affiliate_url::text, f.publication_id::text, f.tenant_id::text;
    return;
  end if;

  -- 2. Amazon: always use the publication owner's configured tag.
  if f.marketplace = 'amazon' then
    if p.external_id !~ '^[A-Z0-9]{10}$' then return; end if;

    select * into c
      from garimpa.affiliate_marketplace_config
     where affiliate_id = p.affiliate_id
       and marketplace = 'amazon'
       and status = 'active';

    if not found or c.tracking_id is null or btrim(c.tracking_id) !~ '^[A-Za-z0-9_-]{1,80}$' then return; end if;

    return query select (
      'https://www.amazon.com.br/dp/' || garimpa.uri_component(p.external_id) || '?tag=' || garimpa.uri_component(btrim(c.tracking_id))
    )::text, f.publication_id::text, f.tenant_id::text;
    return;
  end if;

  -- 3. Mercado Livre (link cunhado com matt_word/matt_tool)
  if f.marketplace <> 'mercadolivre' or p.product_url !~ '^https://([a-z0-9-]+[.])*mercadolivre[.]com[.]br/' then return; end if;

  select * into c
    from garimpa.affiliate_marketplace_config
   where affiliate_id = p.affiliate_id
     and marketplace = f.marketplace
     and status = 'active';

  if not found or c.tracking_id is null or c.tool_id is null or c.tracking_id = '' or c.tool_id = '' then return; end if;

  base := split_part(split_part(p.product_url, '#', 1), '?', 1);
  fragment := case when position('#' in p.product_url) > 0 then '#' || split_part(p.product_url, '#', 2) else '' end;
  query := case when position('?' in split_part(p.product_url, '#', 1)) > 0 then split_part(split_part(p.product_url, '#', 1), '?', 2) else '' end;

  foreach pair in array string_to_array(query, '&') loop
    if pair <> '' and split_part(pair, '=', 1) not in ('matt_word', 'matt_tool', 'forceInApp') then
      kept := array_append(kept, pair);
    end if;
  end loop;

  kept := kept || array['matt_word=' || garimpa.uri_component(c.tracking_id || '_' || p_slug), 'matt_tool=' || garimpa.uri_component(c.tool_id), 'forceInApp=true'];
  return query select (base || '?' || array_to_string(kept, '&') || fragment)::text, f.publication_id::text, f.tenant_id::text;
end $function$;
