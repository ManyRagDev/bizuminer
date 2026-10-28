-- A reference without verified configuration remains unavailable for comparison.
alter table garimpa.price_watch
  add column baseline_currency text,
  add column baseline_configuration jsonb,
  add column baseline_observed_at timestamptz;
