-- Expansão auditável após medir cobertura inicial abaixo da meta de 60%.
-- São famílias de produtos explícitas; os demais continuam sem categoria.
update garimpa.product
set category = case
  when title ilike any (array['%notebook%', '%celular%', '%smartphone%', '%smartwatch%', '%smart tv%', '%tv %', '%televis%', '%fone%', '%headset%', '%camera%', '%câmera%', '%monitor%', '%tablet%', '%power bank%', '%carregador%', '%playstation%', '%ps5%', '%nintendo%', '%console%', '%impressora%', '%processador%', '%vr %']) then 'Tecnologia'
  when title ilike any (array['%espelho%', '%pote%', '%cozinha%', '%airfryer%', '%fritadeira%', '%lavadora%', '%organizador%', '%cafeteira%', '%aspirador%', '%travesseiro%', '%colchao%', '%colchão%', '%chuveiro%', '%ventilador%', '%cooktop%', '%panela%', '%purificador%', '%toalha%', '%varal%', '%ar-condicionado%', '%ar condicionado%', '%luminaria%', '%luminária%']) then 'Casa'
  when title ilike any (array['%creatina%', '%whey%', '%hipercalorico%', '%hipercalórico%', '%proteina%', '%proteína%', '%suplemento%', '%vitamina%', '%magnésio%', '%magnesio%', '%coenzima%', '%nac %', '%pré-treino%', '%pre treino%', '%testo essencial%']) then 'Suplementos'
  else category
end
where category is null;
