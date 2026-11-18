-- Amplia limite de itens no cache da pauta para acomodar volume expandido (Track 021)
alter table garimpa.pauta_selection_cache
  drop constraint if exists pauta_selection_cache_offer_count_check,
  add constraint pauta_selection_cache_offer_count_check check (offer_count between 0 and 50);
