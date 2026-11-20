begin;
set local lock_timeout = '5s';

-- Distinguish actual disclosed messages from skipped/rotated candidates.
-- Both are respected by pauta cooling windows, but skip events are distinct for audits.
alter table garimpa.recommendation_exposure
  add column if not exists is_skip boolean not null default false;

commit;
