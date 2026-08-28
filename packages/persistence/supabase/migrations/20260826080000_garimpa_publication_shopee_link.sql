-- Link de saída pré-gerado (M3, 26/08/2026, plano-multiplataforma.md).
--
-- Shopee (e, depois, AliExpress) proíbe chamar a API de link durante o
-- redirect do /go (latência + rate limit no caminho crítico do usuário).
-- A solução: gerar o shortlink UMA VEZ na criação da publication e persistir
-- aqui. affiliate_url nulo = link ainda não gerado; o /go falha fechado
-- nesse caso (nunca redireciona para a URL crua do produto — perderia a
-- comissão em silêncio).

alter table garimpa.publication
  add column if not exists affiliate_url text,
  add column if not exists affiliate_url_generated_at timestamptz;

comment on column garimpa.publication.affiliate_url is
  'Shortlink de afiliado pré-gerado (Shopee/AliExpress), persistido na criação da publication. O /go redireciona para este valor sem chamar a API do marketplace. Nulo = ainda não gerado (falha fechada no /go).';

comment on column garimpa.publication.affiliate_url_generated_at is
  'Quando affiliate_url foi gerado. Nulo enquanto affiliate_url for nulo.';
