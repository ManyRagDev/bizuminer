import { readFile } from "node:fs/promises";
const root = new URL("../../", import.meta.url);
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const relation = (value: string) => value.split(".").map(quote).join(".");

/** Synthetic reconstruction from recorded catalogue evidence, never a production backup. */
export async function installObservedBaseline(pg: {exec(query: string): Promise<unknown>}) {
  // Baseline trigger function is part of the real catalogue. The trigger itself
  // is not reconstructed here; existing fixture writers seed curation explicitly.
  const historicalCuration = await readFile(new URL("packages/persistence/supabase/migrations/20260901025640_garimpa_curation.sql", root), "utf8");
  const seed = historicalCuration.match(/create function garimpa\.seed_product_curation\(\)[\s\S]*?\$\$;/)?.[0];
  if (!seed) throw new Error("observed_seed_function_missing");
  const metadata = JSON.parse(await readFile(new URL("docs/implementation/evidencias/schema-observado.json", root), "utf8"));
  const evidence = JSON.parse(await readFile(new URL("docs/implementation/evidencias/policies-view-constraints.json", root), "utf8")).data[0].jsonb_build_object;
  await pg.exec("create role garimpa_app; create role anon; create role authenticated; create role service_role nologin bypassrls; create schema garimpa; create type garimpa.app_role as enum ('comprador','afiliado'); grant usage on schema garimpa to garimpa_app;");
  for (const table of metadata.tables) {
    const columns = table.columns.map((c: any) => {
      const type = c.data_type === "ARRAY" ? "text[]" : c.data_type === "USER-DEFINED" ? `garimpa.${c.format}` : c.data_type;
      return `${quote(c.name)} ${type}${c.options.includes("identity") ? ` generated ${c.identity_generation === "BY DEFAULT" ? "by default" : "always"} as identity` : ""}${c.options.includes("nullable") ? "" : " not null"}${c.default_value ? ` default ${c.default_value}` : ""}`;
    });
    if (table.primary_keys.length) columns.push(`primary key (${table.primary_keys.map(quote).join(",")})`);
    await pg.exec(`create table ${relation(table.name)} (${columns.join(",")});`);
  }
  await pg.exec(seed);
  await pg.exec("revoke all on function garimpa.seed_product_curation() from public; grant execute on function garimpa.seed_product_curation() to garimpa_app;");
  await pg.exec("alter table garimpa.affiliate_monitoring_skip add unique(affiliate_id,marketplace,github_run_id);");
  await pg.exec("grant usage,select on sequence garimpa.affiliate_monitoring_skip_id_seq,garimpa.affiliate_monitoring_policy_event_id_seq,garimpa.curation_event_id_seq to garimpa_app;");
  // Original 20260826200000 extension constraints, not new rollout structures.
  await pg.exec("alter table garimpa.extension_device add unique(token_hash), add unique(pairing_code_hash);");
  const keys = new Map<string, any>();
  for (const table of metadata.tables) for (const fk of table.foreign_key_constraints ?? []) keys.set(fk.name, fk);
  const uniques = new Set<string>();
  for (const fk of keys.values()) {
    const key = `${fk.target_table}:${fk.target_columns.join(",")}`;
    if (!uniques.has(key)) {
      await pg.exec(`alter table ${relation(fk.target_table)} add unique (${fk.target_columns.map(quote).join(",")});`);
      uniques.add(key);
    }
  }
  for (const fk of keys.values()) await pg.exec(`alter table ${relation(fk.source_table)} add constraint ${quote(fk.name)} foreign key (${fk.source_columns.map(quote).join(",")}) references ${relation(fk.target_table)} (${fk.target_columns.map(quote).join(",")});`);
  // Uniqueness used by the existing writers, independently of new migrations.
  await pg.exec("alter table garimpa.publication add unique(slug); alter table garimpa.publication add unique(affiliate_id,product_id,channel); alter table garimpa.product add unique(tenant_id,marketplace,external_id); alter table garimpa.app_user add unique(auth_user_id); alter table garimpa.price_observation add unique(capture_run_id,product_id); alter table garimpa.affiliate_marketplace_config add unique(affiliate_id,marketplace); create unique index if not exists price_observation_device_request_idx on garimpa.price_observation (extension_device_id, client_request_id) where extension_device_id is not null and client_request_id is not null;");
  // Existing member-area uniqueness (20260819181000), needed by login merge.
  await pg.exec("alter table garimpa.favorite add unique(user_id,product_id); alter table garimpa.price_watch add unique(user_id,product_id);");
  const baselineGrants=JSON.parse(await readFile(new URL("docs/implementation/evidencias/execucao-19-baseline-grants.json",root),"utf8")).grants as {table:string;privilege:string}[];
  const baseTables=new Set(metadata.tables.map((t:any)=>t.name));
  for(const grant of baselineGrants){
    if(!["SELECT","INSERT","UPDATE","DELETE","TRUNCATE","REFERENCES","TRIGGER"].includes(grant.privilege))throw new Error("unknown_baseline_privilege");
    if(baseTables.has("garimpa."+grant.table))await pg.exec(`grant ${grant.privilege} on garimpa.${quote(grant.table)} to garimpa_app`);
  }
  // CF-14: app_user_role only has SELECT for garimpa_app in baseline; revoke DML
  await pg.exec("revoke insert, update, delete, truncate, references, trigger on garimpa.app_user_role from garimpa_app;");
  for (const p of evidence.policy_summary) {
    await pg.exec(`alter table garimpa.${quote(p.tablename)} enable row level security; create policy ${quote(p.policyname)} on garimpa.${quote(p.tablename)} for ${p.cmd} to ${p.roles.map(quote).join(",")}${p.qual ? ` using (${p.qual})` : ""}${p.with_check ? ` with check (${p.with_check})` : ""};`);
  }
  await pg.exec(`create view garimpa.curation_queue_facts with(security_invoker=true) as ${evidence.view_definition};`);
  for(const grant of baselineGrants.filter(g=>g.table==="curation_queue_facts"))await pg.exec(`grant ${grant.privilege} on garimpa.curation_queue_facts to garimpa_app`);
  // Independent MCP catalogue reconciliation 31. Preserve existing protections
  // and legacy service_role grants; that role has no USAGE on this schema.
  await pg.exec("alter table garimpa.app_user_role force row level security; grant select,insert,update on garimpa.capture_batch,garimpa.triage_run to service_role;");
  // Apply AFTER reconstructing old relations. These observed defaults affect
  // future A/B objects, and must not manufacture privileges on legacy tables.
  await pg.exec("alter default privileges for role postgres in schema garimpa grant select,insert,update,delete on tables to garimpa_app;");
}
