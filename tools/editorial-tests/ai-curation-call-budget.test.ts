import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// SQL/privilege regression. Independent-session concurrency is verified on
// native PostgreSQL during deployment; PGlite shares one in-memory session.
const pg = new PGlite();
const fingerprint = "a".repeat(64);
try {
  await pg.exec("create schema garimpa; create role garimpa_app; create role anon; create role authenticated; create role garimpa_public_runtime; grant usage on schema garimpa to garimpa_app;");
  await pg.exec(await readFile(new URL("../../packages/persistence/supabase/migrations/20261114205951_curation_provider_call_limit.sql", import.meta.url), "utf8"));
  await pg.query("insert into garimpa.curation_provider_call_budget(provider,key_fingerprint,max_calls) values('openrouter',$1,20)", [fingerprint]);
  const reserve = (id: string, kind = "legacy", key = fingerprint) => pg.transaction(async tx => {
    await tx.exec("set local role garimpa_app");
    return (await tx.query<{result:string}>("select garimpa.reserve_curation_provider_call($1,$2::uuid,'fixture/model',$3) as result", [key,id,kind])).rows[0]!.result;
  });
  assert.equal(await reserve(randomUUID(), "legacy", "b".repeat(64)), "not_configured");
  const first = randomUUID();
  assert.equal(await reserve(first), "reserved");
  await assert.rejects(reserve(first), /already_reserved/);
  for (let i=1;i<20;i++) assert.equal(await reserve(randomUUID(), i%2 ? "attributes" : "legacy"), "reserved");
  assert.equal(await reserve(randomUUID()), "limit_reached");
  assert.equal(await reserve(randomUUID(), "attributes"), "limit_reached");
  await assert.rejects(pg.transaction(async tx => {await tx.exec("set local role garimpa_app; update garimpa.curation_provider_call_budget set reserved_calls=0");}), /permission denied/);
  const state = (await pg.query<{reserved_calls:number;entries:number}>("select reserved_calls,(select count(*)::int from garimpa.curation_provider_call_reservation) as entries from garimpa.curation_provider_call_budget")).rows[0];
  assert.deepEqual(state,{reserved_calls:20,entries:20});
  const [{exposed}] = (await pg.query<{exposed:boolean}>("select has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('garimpa_public_runtime',p.oid,'execute') as exposed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='garimpa' and p.proname='reserve_curation_provider_call'")).rows;
  assert.equal(exposed,false);
  console.log("PASS: shared 20-call cap, key binding, duplicate denial, no runtime reset, and private command access");
} finally {await pg.close();}
