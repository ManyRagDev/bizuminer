-- M1-A: evidência de avaliação e vendas informada pelo marketplace.
-- O rótulo original é preservado porque "+10mil vendidos" representa faixa.
alter table garimpa.price_observation
  add column if not exists rating_star double precision,
  add column if not exists sales_label text,
  add column if not exists sales_count integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'price_observation_rating_star_check') then
    alter table garimpa.price_observation add constraint price_observation_rating_star_check
      check (rating_star is null or (rating_star >= 0 and rating_star <= 5));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'price_observation_sales_count_check') then
    alter table garimpa.price_observation add constraint price_observation_sales_count_check
      check (sales_count is null or sales_count >= 0);
  end if;
end $$;
