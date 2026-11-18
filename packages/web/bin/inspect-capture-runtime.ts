/** Read-only handoff check. Does not install, migrate, dispatch, or contact providers. */
import postgres from "postgres";

const tenants = (process.env.CAPTURE_WORKER_TENANTS ?? "").split(",").map(value => value.trim()).filter(Boolean);
if (!process.env.DATABASE_URL || !tenants.length || tenants.some(value => !/^[a-z0-9._-]{1,64}$/.test(value))) {
  console.error(JSON.stringify({ ready: false, error: "database_and_tenant_allowlist_required" }));
  process.exitCode = 1;
} else {
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 10,
    connection: { application_name: "bizuminer-capture-preflight", default_transaction_read_only: true } });
  try {
    const [runtime] = await sql`select current_setting('server_version') as version,
      r.rolsuper as superuser,r.rolbypassrls as bypassrls,
      to_regclass('garimpa.pauta_source_version') is not null as pauta_version,
      to_regclass('garimpa.pauta_selection_cache') is not null as pauta_cache,
      to_regclass('garimpa.capture_prepared_offer') is not null as preparation,
      to_regprocedure('garimpa.publish_capture_batch(text,uuid,text)') is not null as publication,
      exists(select 1 from pg_trigger where tgname='capture_batch_notify' and not tgisinternal) as durable_signal
      from pg_roles r where r.rolname=current_user`;
    const accounts = [];
    for (const tenant of tenants) {
      accounts.push(await sql.begin("read only", async tx => {
        await tx`select set_config('garimpa.tenant_id',${tenant},true)`;
        const [account] = await tx`select status from garimpa.affiliate_account where tenant_id=${tenant}`;
        const jobs = await tx`select status,metadata#>>'{execution,executor}' as executor,
          metadata#>>'{execution,phase}' as phase,count(*)::int as count
          from garimpa.capture_batch where tenant_id=${tenant} and status='running'
          group by status,metadata#>>'{execution,executor}',metadata#>>'{execution,phase}'`;
        return { tenant, active: account?.status === "active", jobs };
      }));
    }
    const databaseReady = !runtime.superuser && !runtime.bypassrls && runtime.pauta_version && runtime.pauta_cache
      && runtime.preparation && runtime.publication && runtime.durable_signal && accounts.every(account => account.active);
    const configurationReady = process.env.CAPTURE_EXECUTOR === "durable" && Boolean(process.env.CAPTURE_LISTEN_DATABASE_URL);
    const ready = databaseReady && configurationReady;
    console.log(JSON.stringify({ ready, databaseReady, configurationReady, runtime, accounts,
      listenerConfigured: Boolean(process.env.CAPTURE_LISTEN_DATABASE_URL),
      sessionTransportVerified: false,
      note: "Listener connection mode and Auth/Storage require separate environment verification; no jobs were executed." }));
    if (!ready) process.exitCode = 1;
  } catch {
    // Connection errors can contain credentials or endpoint details.
    console.error(JSON.stringify({ ready: false, error: "capture_preflight_failed" }));
    process.exitCode = 1;
  } finally { await sql.end({ timeout: 5 }); }
}
