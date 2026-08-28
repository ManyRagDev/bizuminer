-- Publicação e link por afiliado (E3, 26/08/2026).
-- Fecha a atribuição de comissão: a publication passa a saber a qual afiliado
-- pertence, e o slug deixa de ser sintetizado pelas queries (a resolução começa
-- por publication.slug). Slugs legados `ml-<external_id>` continuam válidos e
-- pertencem à casa (backfill para aff_local). NÃO aplicada nesta sessão.

alter table garimpa.publication
  add column if not exists affiliate_id text;

-- Backfill: tudo que existe é da casa.
update garimpa.publication
set affiliate_id = 'aff_local'
where affiliate_id is null;

alter table garimpa.publication
  alter column affiliate_id set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'publication_affiliate_id_fkey' and conrelid = 'garimpa.publication'::regclass) then
    alter table garimpa.publication
      add constraint publication_affiliate_id_fkey
      foreign key (affiliate_id) references garimpa.affiliate_account (id) on delete restrict;
  end if;
end $$;

-- Um produto, num canal, tem no máximo uma publicação por afiliado.
create unique index if not exists publication_affiliate_product_channel_idx
  on garimpa.publication (affiliate_id, product_id, channel);

create index if not exists publication_affiliate_idx
  on garimpa.publication (affiliate_id, channel, published_at desc);

comment on column garimpa.publication.affiliate_id is
  'Afiliado dono da publicação; a comissão do clique é a deste afiliado (nunca a da casa por fallback).';
