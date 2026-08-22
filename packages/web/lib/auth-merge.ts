import { db } from "./db.ts";
import { validUserId } from "./member-contract.ts";

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

export async function mergeAnonymousIntoAuth(input: MergeInput): Promise<string> {
  const tenantId = input.tenantId ?? "local";
  const sql = db();
  try {
    return await sql.begin(async (tx) => {
      const linkedRows = await tx<{ id: string }[]>`
        select id
        from garimpa.app_user
        where auth_user_id = ${input.authUserId}
        limit 1
      `;
      const linkedId = linkedRows[0]?.id ?? null;

      const anonRows =
        input.bmUid !== null && validUserId(input.bmUid)
          ? await tx<{ id: string; auth_user_id: string | null }[]>`
              select id, auth_user_id
              from garimpa.app_user
              where id = ${input.bmUid}
              limit 1
            `
          : [];
      const anon = anonRows[0] ?? null;

      if (linkedId !== null) {
        await tx`
          update garimpa.app_user
          set display_name = coalesce(${input.displayName}, display_name),
              email = coalesce(${input.email}, email),
              last_seen_at = now()
          where id = ${linkedId}
        `;
        if (anon !== null && anon.id !== linkedId && anon.auth_user_id === null) {
          await tx`
            insert into garimpa.favorite (tenant_id, user_id, product_id)
            select tenant_id, ${linkedId}, product_id
            from garimpa.favorite
            where user_id = ${anon.id}
            on conflict (user_id, product_id) do nothing
          `;
          await tx`
            insert into garimpa.price_watch (id, tenant_id, user_id, product_id, baseline_price_cents, target_price_cents, active, created_at, deactivated_at)
            select gen_random_uuid()::text, tenant_id, ${linkedId}, product_id, baseline_price_cents, target_price_cents, active, created_at, deactivated_at
            from garimpa.price_watch
            where user_id = ${anon.id}
            on conflict (user_id, product_id) do nothing
          `;
          await tx`
            insert into garimpa.buyer_profile (user_id, tenant_id, preferred_categories, price_band, updated_at)
            select ${linkedId}, tenant_id, preferred_categories, price_band, updated_at
            from garimpa.buyer_profile
            where user_id = ${anon.id}
            on conflict (user_id) do nothing
          `;
          await tx`delete from garimpa.app_user where id = ${anon.id}`;
        }
        return linkedId;
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

      const created = await tx<{ id: string }[]>`
        insert into garimpa.app_user (id, tenant_id, auth_user_id, display_name, email)
        values (gen_random_uuid()::text, ${tenantId}, ${input.authUserId}, ${input.displayName}, ${input.email})
        returning id
      `;
      return created[0].id;
    });
  } finally {
    await sql.end();
  }
}
