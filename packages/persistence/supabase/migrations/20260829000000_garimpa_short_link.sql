-- Link curto de compartilhamento (29/08/2026).
--
-- MOTIVO
--
-- Ao colar a URL do produto num status de WhatsApp, o app renderiza o card de
-- preview (tags OG de `/bizu/[slug]`) E o texto colado. Com a URL longa
-- (`https://www.bizuminer.com.br/bizu/ml-MLB54964804`, 48 caracteres) o texto
-- ocupava duas linhas enormes sob o card — verificado em campo. Apagar o texto
-- não é opção: remover a URL derruba o preview. `bizuminer.com.br/p/x7k2`
-- (23 caracteres) cabe em uma linha.
--
-- APONTA PARA `/bizu/[slug]`, NUNCA PARA `/go/[slug]`
--
-- O robô de preview do WhatsApp SEGUE redirects e lê as tags OG do destino
-- final. Encurtar para `/go` faria o preview sair com o card do Mercado Livre
-- em vez do nosso — e ainda gravaria um click_event a cada visita de robô,
-- sujando a telemetria de cliques com tráfego que não é humano.

create table if not exists garimpa.short_link (
  code       text primary key check (code ~ '^[abcdefghjkmnpqrtuvwxyz2346789]{4}$'),
  tenant_id  text not null,
  -- Slug público do produto (`ml-<external_id>`), o mesmo de `/bizu/[slug]`.
  -- Guardamos o slug e não o product_id porque o destino do link é uma ROTA,
  -- e a rota é composta pelo slug. Assim o redirect resolve sem join.
  slug       text not null,
  created_at timestamptz not null default now()
);

-- Um slug tem NO MÁXIMO um código: a segunda chamada para o mesmo produto
-- reaproveita o código existente em vez de cunhar outro. Sem isto, cada visita
-- à lista de compartilhamento geraria um código novo e o espaço se esgotaria
-- por uso, não por catálogo — e o mesmo produto apareceria com endereços
-- diferentes em status distintos, quebrando a leitura da telemetria.
create unique index if not exists short_link_slug_idx
  on garimpa.short_link (tenant_id, slug);

comment on table garimpa.short_link is
  'Alias curto de URL para compartilhamento (`/p/<code>` → `/bizu/<slug>`). Código sorteado, nunca derivado do produto: derivar não evita colisão (casa dos pombos sobre 29^4 = 707.281 casas), apenas a torna permanente. A colisão de sorteio é absorvida pela chave primária + nova tentativa na aplicação.';

comment on column garimpa.short_link.code is
  'Quatro caracteres do alfabeto sem ambiguidade (sem 0/o, 1/l/i, 5/s, tudo minúsculo) — precisa ser digitável por quem só está VENDO a tela.';

-- Mesma defesa em profundidade das demais tabelas do schema (ver
-- 20260826070000_garimpa_rls_defense.sql): anon/authenticated não têm grant
-- aqui, e o RLS garante default-deny caso alguém conceda por engano.
alter table garimpa.short_link enable row level security;
drop policy if exists short_link_app_access on garimpa.short_link;
create policy short_link_app_access on garimpa.short_link
  for all to garimpa_app using (true) with check (true);

-- RLS libera a LINHA; o grant libera a TABELA. São camadas distintas e a
-- política acima não dispensa este grant — sem ele o app enxerga a tabela e
-- falha com "permission denied" na primeira consulta.
--
-- Sem `delete` e sem `update` de propósito: um código publicado num status não
-- pode ser reapontado nem apagado, porque status não se edita depois. Se um
-- link precisar morrer, isso é operação manual e consciente, não algo que a
-- borda web deva conseguir fazer sozinha.
grant select, insert on garimpa.short_link to garimpa_app;
