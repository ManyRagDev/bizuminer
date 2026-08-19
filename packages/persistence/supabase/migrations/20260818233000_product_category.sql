-- M2 — corredores reais da mina. Nulo significa "a captura não sabe".
alter table garimpa.product
  add column if not exists category text;

create index if not exists product_tenant_category_idx
  on garimpa.product (tenant_id, category)
  where category is not null;

comment on column garimpa.product.category is
  'Categoria derivada por regra auditável a partir do título; null quando incerta.';

-- Backfill conservador do catálogo existente. As mesmas palavras-chave são
-- usadas na ingestão; o CASE não atribui categoria quando não há evidência.
update garimpa.product
set category = case
  when title ilike any (array['%notebook%', '%celular%', '%smartwatch%', '%fone%', '%headset%', '%camera%', '%câmera%', '%monitor%', '%tablet%', '%power bank%', '%carregador%', '%playstation%', '%ps5%', '%vr %']) then 'Tecnologia'
  when title ilike any (array['%espelho%', '%pote%', '%cozinha%', '%airfryer%', '%lavadora%', '%organizador%', '%cafeteira%', '%aspirador%', '%travesseiro%', '%luminaria%', '%luminária%']) then 'Casa'
  when title ilike any (array['%bicicleta%', '%spinning%', '%esteira%', '%halter%', '%colchonete%', '%academia%']) then 'Fitness'
  when title ilike any (array['%creatina%', '%whey%', '%hipercalorico%', '%hipercalórico%', '%proteina%', '%proteína%', '%suplemento%']) then 'Suplementos'
  when title ilike any (array['%perfume%', '%colonia%', '%colônia%', '%aparador%', '%barbeador%', '%escova%', '%secador%', '%maquiagem%']) then 'Beleza'
  when title ilike any (array['%furadeira%', '%solda%', '%compressor%', '%parafusadeira%', '%lavadora de alta%', '%pressao%', '%pressão%']) then 'Ferramentas'
  when title ilike any (array['%mochila%', '%bolsa%', '%tenis%', '%tênis%', '%camiseta%', '%jaqueta%']) then 'Moda'
  else null
end
where category is null;
