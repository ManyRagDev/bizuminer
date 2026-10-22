-- These are pre-existing constraints from the original extension migration.
-- Refuse a different baseline; never create an index in production to hide drift.
do $guard$
declare column_name text;
begin
 foreach column_name in array array['token_hash','pairing_code_hash'] loop
  if not exists(select 1 from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=i.indkey[0]
   where i.indrelid='garimpa.extension_device'::regclass and i.indisunique and i.indisvalid and i.indisready
    and i.indpred is null and i.indexprs is null and i.indnkeyatts=1 and not i.indnullsnotdistinct and a.attname=column_name) then
   raise exception 'extension_unique_hash_required: %',column_name;
  end if;
 end loop;
end $guard$;
