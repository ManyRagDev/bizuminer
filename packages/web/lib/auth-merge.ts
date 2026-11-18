import { db } from "./db.ts";
import { validUserId } from "./member-contract.ts";
import { randomUUID } from "node:crypto";

/**
 * Merge da identidade anônima (cookie bm_uid) na conta Supabase Auth
 * (AL-3, 22/08/2026). Roda no /auth/callback, no primeiro login.
 *
 * A coluna app_user.auth_user_id nasceu em 19/08 exatamente para este dia:
 * o merge é um update, não uma migração de dados. Tudo transacional.
 *
 * Casos:
 *  A — linha do cookie existe, sem conta → vira a conta (zero dado movido);
 *  B — conta já vinculada → só sincroniza nome/e-mail e last_seen;
 *  C — conta E linha do cookie com dados → dados do anônimo reatribuídos à
 *      conta (conflito: o estado da conta vence), linha órfã apagada;
 *  D — nem conta nem cookie → nasce a linha da conta.
 */

export interface MergeInput {
  authUserId: string;
  email: string | null;
  displayName: string | null;
  bmUid: string | null;
  tenantId?: string;
}

export async function mergeAnonymousIntoAuth(input: MergeInput, sqlFactory: typeof db = db): Promise<string> {
  const tenantId = input.tenantId ?? "local";
  if (!/^[a-z0-9._-]{1,64}$/.test(tenantId) || !input.authUserId?.trim())
    throw new Error("invalid_identity_context");
  const sql = sqlFactory();
  try {
    return await sql.begin(async (tx) => {
      // Called only after Supabase getUser() on the server. A commercial
      // membership does not exist yet during login: scope each personal step
      // explicitly instead of bypassing RLS or borrowing an owner's account.
      const scope = async (home: string, actor: string) => {
        await tx`select set_config('garimpa.tenant_id', ${home}, true),
          set_config('garimpa.actor_app_user_id', ${actor}, true),
          set_config('garimpa.membership_role', '', true),
          set_config('garimpa.platform_role', '', true),
          set_config('garimpa.actor_type', 'human', true)`;
      };
      // Serialize repeated callbacks for the same authenticated identity.
      await tx`select pg_advisory_xact_lock(hashtextextended(${input.authUserId}, 0))`;
      const [bootstrap] = await tx<{ ready: boolean }[]>`
        select to_regprocedure('garimpa.resolve_actor_identity(text)') is not null as ready`;
      const linkedRows = bootstrap?.ready
        ? await tx<{ id: string; tenant_id: string }[]>`
            select id, tenant_id from garimpa.resolve_actor_identity(${input.authUserId})`
        : await tx<{ id: string; tenant_id: string }[]>`
            select id, tenant_id from garimpa.app_user where auth_user_id=${input.authUserId} limit 1`;
      const linked = linkedRows[0] ?? null;
      await scope(tenantId, input.bmUid && validUserId(input.bmUid) ? input.bmUid : "");

      const anonRows =
        input.bmUid !== null && validUserId(input.bmUid)
          ? await tx<{ id: string; auth_user_id: string | null }[]>`
              select id, auth_user_id
              from garimpa.app_user
              where id = ${input.bmUid} and tenant_id=${tenantId}
              for update
            `
          : [];
      const anon = anonRows[0] ?? null;

      if (linked !== null) {
        // Personal data has a home tenant. A cookie from another home is left
        // intact; copying it would violate product/user composite ownership.
        const mergeAnon = anon !== null && anon.id !== linked.id &&
          anon.auth_user_id === null && linked.tenant_id === tenantId;
        const [watchColumns] = mergeAnon ? await tx<{ has_option: boolean; has_baseline: boolean }[]>`
          select
            bool_or(a.attname = 'option_key') as has_option,
            bool_or(a.attname = 'baseline_currency') as has_baseline
          from pg_attribute a
          join pg_class c on c.oid = a.attrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'garimpa' and c.relname = 'price_watch'
            and a.attname in ('option_key', 'baseline_currency')
            and not a.attisdropped` : [{ has_option: false, has_baseline: false }];
        const hasWatchOption = watchColumns?.has_option === true;
        const hasWatchBaseline = watchColumns?.has_baseline === true;
        const favorites = mergeAnon ? await tx<{ product_id: string }[]>`
          select product_id from garimpa.favorite where user_id=${anon!.id} and tenant_id=${tenantId}` : [];
        const watches = mergeAnon
          ? (hasWatchOption
            ? await tx<{ product_id: string; baseline_price_cents: number; target_price_cents: number | null; active: boolean; created_at: Date; deactivated_at: Date | null;
                option_key: string | null; baseline_currency: string | null; baseline_configuration: unknown; baseline_observed_at: Date | null }[]>`
                select product_id, baseline_price_cents, target_price_cents, active, created_at, deactivated_at,
                  option_key, baseline_currency, baseline_configuration, baseline_observed_at
                from garimpa.price_watch where user_id=${anon!.id} and tenant_id=${tenantId}`
            : hasWatchBaseline
              ? await tx<{ product_id: string; baseline_price_cents: number; target_price_cents: number | null; active: boolean; created_at: Date; deactivated_at: Date | null;
                  option_key: string | null; baseline_currency: string | null; baseline_configuration: unknown; baseline_observed_at: Date | null }[]>`
                  select product_id, baseline_price_cents, target_price_cents, active, created_at, deactivated_at,
                    null::text as option_key, baseline_currency, baseline_configuration, baseline_observed_at
                  from garimpa.price_watch where user_id=${anon!.id} and tenant_id=${tenantId}`
              : await tx<{ product_id: string; baseline_price_cents: number; target_price_cents: number | null; active: boolean; created_at: Date; deactivated_at: Date | null;
                  option_key: string | null; baseline_currency: string | null; baseline_configuration: unknown; baseline_observed_at: Date | null }[]>`
                  select product_id, baseline_price_cents, target_price_cents, active, created_at, deactivated_at,
                    null::text as option_key, null::text as baseline_currency, null::jsonb as baseline_configuration, null::timestamptz as baseline_observed_at
                  from garimpa.price_watch where user_id=${anon!.id} and tenant_id=${tenantId}`)
          : [];
        const profiles = mergeAnon ? await tx<{ preferred_categories: string[]; price_band: string; updated_at: Date }[]>`
          select preferred_categories, price_band, updated_at from garimpa.buyer_profile
          where user_id=${anon!.id} and tenant_id=${tenantId}` : [];
        await scope(linked.tenant_id, linked.id);
        await tx`
          update garimpa.app_user
          set display_name = coalesce(${input.displayName}, display_name),
              email = coalesce(${input.email}, email),
              last_seen_at = now()
          where id = ${linked.id} and auth_user_id=${input.authUserId}
        `;
        if (mergeAnon) {
          for (const favorite of favorites) {
            await tx`
              insert into garimpa.favorite (tenant_id, user_id, product_id)
              values (${tenantId}, ${linked.id}, ${favorite.product_id})
              on conflict (user_id, product_id) do nothing
            `;
          }
          for (const watch of watches) {
            if (hasWatchOption) {
              await tx`
                insert into garimpa.price_watch (id, tenant_id, user_id, product_id, baseline_price_cents, target_price_cents, active, created_at, deactivated_at,
                  option_key, baseline_currency, baseline_configuration, baseline_observed_at)
                values (gen_random_uuid()::text, ${tenantId}, ${linked.id}, ${watch.product_id},
                  ${watch.baseline_price_cents}, ${watch.target_price_cents}, ${watch.active}, ${watch.created_at}, ${watch.deactivated_at},
                  ${watch.option_key}, ${watch.baseline_currency}, ${watch.baseline_configuration === null ? null : tx.json(watch.baseline_configuration as never)}, ${watch.baseline_observed_at})
                on conflict do nothing
              `;
            } else if (hasWatchBaseline) {
              await tx`
                insert into garimpa.price_watch (id, tenant_id, user_id, product_id, baseline_price_cents, target_price_cents, active, created_at, deactivated_at,
                  baseline_currency, baseline_configuration, baseline_observed_at)
                values (gen_random_uuid()::text, ${tenantId}, ${linked.id}, ${watch.product_id},
                  ${watch.baseline_price_cents}, ${watch.target_price_cents}, ${watch.active}, ${watch.created_at}, ${watch.deactivated_at},
                  ${watch.baseline_currency}, ${watch.baseline_configuration === null ? null : tx.json(watch.baseline_configuration as never)}, ${watch.baseline_observed_at})
                on conflict (user_id, product_id) do nothing
              `;
            } else {
              await tx`
                insert into garimpa.price_watch (id, tenant_id, user_id, product_id, baseline_price_cents, target_price_cents, active, created_at, deactivated_at)
                values (gen_random_uuid()::text, ${tenantId}, ${linked.id}, ${watch.product_id},
                  ${watch.baseline_price_cents}, ${watch.target_price_cents}, ${watch.active}, ${watch.created_at}, ${watch.deactivated_at})
                on conflict (user_id, product_id) do nothing
              `;
            }
          }
          for (const profile of profiles) {
            await tx`
              insert into garimpa.buyer_profile (user_id, tenant_id, preferred_categories, price_band, updated_at)
              values (${linked.id}, ${tenantId}, ${profile.preferred_categories}, ${profile.price_band}, ${profile.updated_at})
              on conflict (user_id) do nothing
            `;
          }
          await scope(tenantId, anon!.id);
          // Remove only the source identity's personal rows after conflict-safe inserts.
          await tx`delete from garimpa.favorite where user_id=${anon!.id} and tenant_id=${tenantId}`;
          await tx`delete from garimpa.price_watch where user_id=${anon!.id} and tenant_id=${tenantId}`;
          await tx`delete from garimpa.buyer_profile where user_id=${anon!.id} and tenant_id=${tenantId}`;
          await tx`delete from garimpa.app_user where id = ${anon!.id} and auth_user_id is null`;
        }
        return linked.id;
      }

      if (anon !== null && anon.auth_user_id === null) {
        await tx`
          update garimpa.app_user
          set auth_user_id = ${input.authUserId},
              display_name = coalesce(${input.displayName}, display_name),
              email = coalesce(${input.email}, email),
              last_seen_at = now()
          where id = ${anon.id}
        `;
        return anon.id;
      }

      const newId = randomUUID();
      await scope(tenantId, newId);
      const created = await tx<{ id: string }[]>`
        insert into garimpa.app_user (id, tenant_id, auth_user_id, display_name, email)
        values (${newId}, ${tenantId}, ${input.authUserId}, ${input.displayName}, ${input.email})
        returning id
      `;
      return created[0].id;
    });
  } finally {
    await sql.end();
  }
}
