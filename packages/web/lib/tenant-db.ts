/**
 * Integridade de tenant (E2) — helper transacional e validação pura.
 *
 * A barreira real de isolamento vive no banco (migration `..._tenant_integrity.sql`:
 * tenant_id referencia `affiliate_account.tenant_id` e as FKs carregam o tenant).
 * Este módulo é a borda de aplicação: valida o tenant antes de qualquer query e
 * oferece `withTenantDb` para as rotas que ainda precisam de contexto de tenant
 * transacional (quando a RLS por contexto for ativada em E2-gated).
 *
 * O schema `garimpa` NÃO é consumido pelo Data API (anon/authenticated não têm
 * grant — verificado no banco), então a fronteira segue sendo o servidor; este
 * helper é defesa em profundidade, não a única barreira.
 */

import { db } from "./db.ts";

/** tenant_id válido: [a-z0-9._-], 1..64. 'local' e slugs de conta passam. */
export function validTenantId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9._-]{1,64}$/.test(value);
}

/** Afirma que dois ids (ex.: produto e observação) pertencem ao mesmo tenant. */
export function assertSameTenant(a: unknown, b: unknown): boolean {
  return validTenantId(a) && validTenantId(b) && a === b;
}

/**
 * Executa `fn` dentro de uma transação com o contexto de tenant definido para
 * `tenantId` (via `set_config(..., true)`). Usado pelas rotas server-side que
 * precisam de RLS-por-contexto; as queries atuais continuam passando o tenant
 * explicitamente no `where` (R1/RC3).
 */
export async function withTenantDb<T>(tenantId: string, fn: (sql: ReturnType<typeof db>) => Promise<T>): Promise<T> {
  if (!validTenantId(tenantId)) throw new Error("tenant inválido");
  const sql = db();
  try {
    await sql`select set_config('garimpa.tenant_id', ${tenantId}, true)`;
    return await fn(sql);
  } finally {
    await sql.end();
  }
}
