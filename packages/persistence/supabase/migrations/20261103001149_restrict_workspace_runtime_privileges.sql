-- Production grants CRUD to garimpa_app by default in this schema. Reset the
-- new workspace tables explicitly before granting only their intended actions.
set local lock_timeout='5s';
set local statement_timeout='20s';
revoke all on garimpa.work_draft, garimpa.workspace_settings, garimpa.workspace_rollout from garimpa_app;
grant select,insert,update on garimpa.work_draft, garimpa.workspace_settings to garimpa_app;
grant select on garimpa.workspace_rollout to garimpa_app;
