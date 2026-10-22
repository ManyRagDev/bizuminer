import postgres from "postgres";
import { pathToFileURL } from "node:url";

export interface CompatibilityCheck {
  name: string; status: "PASS" | "FAIL"; message: string; details?: unknown;
}
export interface CompatibilityReport {
  timestamp: string; targetHost: string; checks: CompatibilityCheck[]; passed: boolean;
}
const REQUIRED_TABLES = [
  "affiliate_account", "affiliate_membership", "affiliate_secret", "product", "price_observation",
  "analysis_assessment","comparison_review","import_batch","import_row",
  "price_evidence_policy_version", "audience_policy", "audience_policy_version", "opportunity", "domain_event",
  "campaign", "destination", "commercial_kit", "commercial_kit_revision", "kit_validation", "kit_approval",
  "campaign_publication", "campaign_link", "conversion", "conversion_attribution", "commission_entry",
  "operational_cost", "saas_revenue_entry", "dispatch_job", "policy_experiment", "account_entitlement",
  "onboarding_progress", "usage_event",
];

/** Read-only schema and runtime-role preflight. Not an end-to-end certification.
 * The caller must choose the target explicitly; no env-file is loaded here. */
export async function runCompatibilityAudit(connectionUrl?: string, sqlFactory?: () => postgres.Sql): Promise<CompatibilityReport> {
  const checks: CompatibilityCheck[] = [];
  const add = (name: string, ok: boolean, message: string, details?: unknown) => checks.push({ name, status: ok ? "PASS" : "FAIL", message, ...(details === undefined ? {} : { details }) });
  let targetHost = "none";
  const report = (): CompatibilityReport => ({ timestamp: new Date().toISOString(), targetHost, checks, passed: checks.length > 0 && checks.every(c => c.status === "PASS") });
  if (!connectionUrl) {
    add("database_connection", false, "Alvo ausente: forneça a URL explicitamente. Nenhuma verificação foi realizada.");
    return report();
  }
  let sql: postgres.Sql | undefined;
  try {
    const target = new URL(connectionUrl);
    if (!["postgres:", "postgresql:"].includes(target.protocol)) throw new Error("invalid_target");
    targetHost = `${target.hostname}:${target.port || "5432"}${target.pathname}`;
    sql = sqlFactory ? sqlFactory() : postgres(connectionUrl, { max: 1, prepare: false, connect_timeout: 10,
      ssl: ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ? false : "require" });
    await sql.begin("read only", async tx => {
      const [identity] = await tx<{ database: string; role: string; version: string }[]>`select current_database() as database, current_user as role, current_setting('server_version') as version`;
      add("database_connection", true, "Conectado ao alvo declarado.", identity);
      const tables = await tx<{ tablename: string; rowsecurity: boolean; tableowner: string }[]>`select tablename, rowsecurity, tableowner from pg_tables where schemaname='garimpa'`;
      const tableMap = new Map(tables.map(t => [t.tablename, t]));
      const missing = REQUIRED_TABLES.filter(t => !tableMap.has(t));
      add("required_tables", missing.length === 0, missing.length ? "Objetos obrigatórios ausentes." : "Objetos obrigatórios presentes.", missing);
      const columns=await tx<{table_name:string;column_name:string}[]>`select table_name,column_name from information_schema.columns where table_schema='garimpa'`;
      const columnSet=new Set(columns.map(c=>`${c.table_name}.${c.column_name}`));
      const requiredColumns=['affiliate_membership.revoked_at','commercial_kit.current_revision','commercial_kit_revision.content_digest',
       'kit_validation.input_digest','kit_validation.valid_until','kit_approval.validation_id','campaign_link.web_publication_id',
       'conversion.input_digest','commission_entry.input_digest','operational_cost.request_id','operational_cost.input_digest','saas_revenue_entry.input_digest',
       'click_event.campaign_link_id','click_event.campaign_publication_id'];
      const absentColumns=requiredColumns.filter(c=>!columnSet.has(c));
      add('required_columns',absentColumns.length===0,'Colunas dos contratos executados.',absentColumns);
      const functions=await tx<{signature:string;present:boolean}[]>`select signature,to_regprocedure(signature) is not null as present from unnest(array[
        'garimpa.resolve_actor_accounts(text)','garimpa.resolve_actor_identity(text)','garimpa.public_deal_detail(text)',
        'garimpa.public_catalog(text,jsonb)','garimpa.public_campaign_link(text,text)','garimpa.public_monetized_target(text)',
        'garimpa.public_short_link(text,text)','garimpa.public_mint_short_link(text,text,text)',
        'garimpa.record_public_click(text,text,text,text,text)']) signature`;
      add('required_functions',functions.every(f=>f.present),'Fronteiras públicas e bootstrap presentes.',functions.filter(f=>!f.present));
      const exposed=await tx<{signature:string}[]>`select p.oid::regprocedure::text as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='garimpa' and p.prosecdef and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))`;
      add('definer_exposure',exposed.length===0,'Definers comerciais não expostos às roles de API.',exposed);
      const unsecured = tables.filter(t => !t.rowsecurity || t.tableowner === "garimpa_app").map(t => t.tablename);
      add("rls_enabled", unsecured.length === 0, "RLS e ownership das tabelas privadas.", unsecured);
      const policies = await tx<{ tablename: string; policyname: string; qual: string; with_check: string }[]>`
        select tablename,policyname,qual,with_check from pg_policies
        where schemaname='garimpa' and permissive='PERMISSIVE'
          and ('garimpa_app'=any(roles) or 'public'=any(roles))
          and (coalesce(qual,'') in ('true','(true)') or coalesce(with_check,'') in ('true','(true)'))`;
      add("rls_permissive_audit", policies.length === 0, "Nenhuma permissão privada irrestrita para runtime.", policies);
      const foreignKeys = await tx<{ source_table: string; target_table: string; source_columns: string[]; target_columns: string[] }[]>`
        select r.relname as source_table,ref.relname as target_table,
          array(select a.attname::text from unnest(c.conkey) with ordinality k(n,i) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.n order by k.i) as source_columns,
          array(select a.attname::text from unnest(c.confkey) with ordinality k(n,i) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.n order by k.i) as target_columns
        from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace s on s.oid=r.relnamespace
          join pg_class ref on ref.oid=c.confrelid where c.contype='f' and s.nspname='garimpa'`;
      for (const [table,column,parent] of [
        ["conversion_attribution","campaign_publication_id","campaign_publication"],
        ["conversion_attribution","conversion_id","conversion"],["commission_entry","conversion_id","conversion"],["import_row","batch_id","import_batch"],
        ["click_event","campaign_link_id","campaign_link"], ["click_event","campaign_publication_id","campaign_publication"],
        ["dispatch_job","kit_revision_id","commercial_kit_revision"], ["dispatch_job","destination_id","destination"],
        ["commercial_kit_revision","kit_id","commercial_kit"],
      ] as const) {
        const found = foreignKeys.some(k => k.source_table===table && k.target_table===parent && k.source_columns.includes(column) && k.source_columns.includes("tenant_id") && k.target_columns.includes("tenant_id"));
        add(`fk_${table}_${column}`, found, "FK de ownership composta instalada.");
      }
      // The operation below tests the effective runtime role, even if the
      // connection belongs to an administrative inspector. No data is written.
      await tx`set local role garimpa_app`;
      const [role] = await tx<{ role: string; rolsuper: boolean; rolbypassrls: boolean }[]>`select current_user as role,rolsuper,rolbypassrls from pg_roles where rolname=current_user`;
      add("runtime_role", !!role && !role.rolsuper && !role.rolbypassrls, "Role runtime sem bypass.", role);
      await tx`select set_config('garimpa.tenant_id','',true)`;
      if (tableMap.has("campaign")) {
        const [none] = await tx<{ count: string }[]>`select count(*)::text as count from garimpa.campaign`;
        add("runtime_without_context", none?.count === "0", "Consulta privada sem contexto não retorna dados.");
      }
      await tx`select set_config('garimpa.tenant_id','audit_scope',true)`;
      const [guc] = await tx<{ tenant: string }[]>`select current_setting('garimpa.tenant_id',true) as tenant`;
      add("unified_guc_contract", guc?.tenant === "audit_scope", "Contexto definido e lido na mesma transação.");
    });
  } catch {
    // Do not print driver errors which can contain connection strings or data.
    add("audit_execution", false, "Não foi possível completar a auditoria do alvo/role. Verifique conexão e permissões em ambiente autorizado.");
  } finally { if (sql) await sql.end(); }
  return report();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Explicit argument avoids accidentally selecting the production env-file.
  const url = process.argv[2] || process.env.BIZUMINER_AUDIT_DATABASE_URL;
  runCompatibilityAudit(url).then(report => {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.passed ? 0 : 1;
  }).catch(() => { console.error("Auditoria não concluída."); process.exitCode=1; });
}
