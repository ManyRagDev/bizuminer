begin;
set local lock_timeout='5s';

-- A maintenance role can differ from the owner of the existing public
-- SECURITY DEFINER projections. Those owners need to invoke the new private
-- factual helpers; granting to an API caller would expose the helpers directly.
do $$
declare projection_owner text;
begin
  for projection_owner in
    select distinct pg_get_userbyid(p.proowner)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='garimpa' and p.prosecdef
      and p.proname in ('public_offer_candidates','read_recommendation_edition',
        'read_homepage_edition','public_confirmed_offer')
  loop
    if projection_owner in ('anon','authenticated','garimpa_app','garimpa_public_runtime') then
      raise exception 'public_projection_owner_must_be_private';
    end if;
    execute format('grant execute on function garimpa.current_offer_valid_until(text,text,text),
      garimpa.curation_material_evidence(jsonb),
      garimpa.has_current_curation_assessment(text,text,text),
      garimpa.equivalent_human_veto(text,text,text),
      garimpa.equivalence_group_for_observation(text,text,text) to %I', projection_owner);
  end loop;
end $$;

commit;
