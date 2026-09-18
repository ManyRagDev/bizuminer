-- Tabela de diretrizes editoriais e configuração do piloto automático por tenant (M4-G/H).
create table if not exists garimpa.editorial_guideline (
  tenant_id text primary key references garimpa.affiliate_account (tenant_id) on delete restrict,
  guideline text not null default '',
  auto_publish boolean not null default false,
  min_score_auto_publish integer not null default 4,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on garimpa.editorial_guideline to garimpa_app;

comment on table garimpa.editorial_guideline is
  'Bússola editorial e preferências de auto-publicação do tenant para calibração de IA.';

insert into garimpa.editorial_guideline (tenant_id, guideline, auto_publish, min_score_auto_publish)
values (
  'local',
  'Foco em utilidades práticas de casa, cozinha, gadgets inteligentes e presentes criativos com alto apelo visual e compra por impulso. Evitar peças industriais, ferramentas secas, insumos de reposição e itens de nicho ultra-específico.',
  false,
  4
)
on conflict (tenant_id) do nothing;
