import {
  currentAccount,
  authorizeAccountTransaction,
  releaseAccountTransaction,
} from "./account-scope.ts";
/**
 * Integridade de tenant e contexto de conta (EP-10A / C-01) — helper transacional e validação pura.
 *
 * A barreira real de isolamento vive no banco (migration de integridade e RLS:
 * tenant_id referencia `affiliate_account.tenant_id` e as FKs carregam o tenant).
 * Este módulo é a borda de aplicação: valida o tenant antes de qualquer query e
 * oferece `withAccountDb` e `withTenantDb` com transações reais `sql.begin`,
 * definindo o contexto de execução de forma segura (`set_config(..., true)`).
 */

import type postgres from "postgres";
import { db } from "./db.ts";
import type { AccountContext } from "./account-context.ts";
export type { AccountContext };

/** tenant_id válido: [a-z0-9._-], 1..64. 'local' e slugs de conta passam. */
export function validTenantId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9._-]{1,64}$/.test(value);
}

/** Afirma que dois ids (ex.: produto e observação) pertencem ao mesmo tenant. */
export function assertSameTenant(a: unknown, b: unknown): boolean {
  return validTenantId(a) && validTenantId(b) && a === b;
}

/**
 * Executa `fn` dentro de uma transação real com o contexto de conta explicitamente definido.
 * Abre `sql.begin`, define tenant, actor, request e ator na mesma transação e fecha a conexão no fim.
 * Sem contexto de conta, nenhuma consulta privada deve avançar.
 */
export async function withAccountDb<T>(
  context: AccountContext,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
  sqlFactory: typeof db = db,
): Promise<T> {
  if (!validTenantId(context.tenantId)) throw new Error("tenant inválido");
  if (currentAccount() && currentAccount()!.tenantId !== context.tenantId)
    throw new Error("forbidden_account_scope");
  const sql = sqlFactory();
  try {
    return (await sql.begin(async (tx) => {
      try {
        await authorizeAccountTransaction(tx, context);
        return await fn(tx);
      } finally { releaseAccountTransaction(tx); }
    })) as unknown as T;
  } finally {
    await sql.end();
  }
}

/**
 * Executa `fn` dentro de uma transação real com o contexto de tenant definido para
 * `tenantId` (via `set_config(..., true)`). Usado pelas rotas server-side compatíveis.
 */
export async function withTenantDb<T>(
  tenantId: string,
  fn: (sql: ReturnType<typeof db>) => Promise<T>,
  sqlFactory: typeof db = db,
): Promise<T> {
  if (!validTenantId(tenantId)) throw new Error("tenant inválido");
  const scoped = currentAccount();
  if (scoped && scoped.tenantId !== tenantId)
    throw new Error("forbidden_account_scope");
  if (scoped) return withAccountDb(scoped, fn as any, sqlFactory);
  const sql = sqlFactory();
  try {
    if (typeof (sql as any).begin !== "function") {
      throw new Error("sqlFactory deve suportar transações reais (begin)");
    }
    return (await (sql as any).begin(async (tx: any) => {
      await tx`select set_config('garimpa.tenant_id', ${tenantId}, true)`;
      await tx`select set_config('garimpa.platform_role','',true),set_config('garimpa.membership_role','',true),
        set_config('garimpa.actor_type','worker',true),set_config('garimpa.actor_app_user_id','',true)`;
      return await fn(tx as unknown as ReturnType<typeof db>);
    })) as unknown as T;
  } finally {
    if (typeof (sql as any).end === "function") {
      await (sql as any).end();
    }
  }
}

/**
 * Executa `fn` dentro de uma transação real com contexto de tenant e de usuário comprador
 * definidos (`garimpa.tenant_id` e `garimpa.actor_app_user_id`).
 * Usado pelas operações da área do comprador (favoritos, alertas, relatórios de preço).
 */
export async function withUserDb<T>(
  tenantId: string,
  userId: string,
  fn: (sql: ReturnType<typeof db>) => Promise<T>,
  sqlFactory: typeof db = db,
): Promise<T> {
  if (!validTenantId(tenantId)) throw new Error("tenant inválido");
  const scoped = currentAccount();
  if (scoped && scoped.tenantId !== tenantId)
    throw new Error("forbidden_account_scope");
  const sql = sqlFactory();
  try {
    if (typeof (sql as any).begin !== "function") {
      throw new Error("sqlFactory deve suportar transações reais (begin)");
    }
    return (await (sql as any).begin(async (tx: any) => {
      await tx`select set_config('garimpa.tenant_id', ${tenantId}, true)`;
      await tx`select set_config('garimpa.platform_role','',true),set_config('garimpa.membership_role','',true),
        set_config('garimpa.actor_type','',true)`;
      await tx`select set_config('garimpa.actor_app_user_id', ${userId || ''}, true)`;
      return await fn(tx as unknown as ReturnType<typeof db>);
    })) as unknown as T;
  } finally {
    if (typeof (sql as any).end === "function") {
      await (sql as any).end();
    }
  }
}
