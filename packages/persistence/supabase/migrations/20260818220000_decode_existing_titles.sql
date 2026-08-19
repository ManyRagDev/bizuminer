-- Limpa entidades HTML que já haviam sido persistidas antes do decoder completo.
-- Não altera preço, evidência ou observed_at.
update garimpa.product
set title = replace(
  replace(
    replace(
      replace(
        replace(
          replace(title, '&amp;', '&'),
          '&quot;', '"'),
        '&#39;', ''''),
      '&#x27;', ''''),
    '&lt;', '<'),
  '&gt;', '>')
where title like '%&amp;%'
   or title like '%&quot;%'
   or title like '%&#39;%'
   or title like '%&#x27;%'
   or title like '%&lt;%'
   or title like '%&gt;%';
