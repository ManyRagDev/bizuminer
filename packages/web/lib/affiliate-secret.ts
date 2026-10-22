/**
 * Gerenciador e Resolver de Segredos de Afiliados (C-01 / EP-10A).
 *
 * Invariantes de segurança:
 * - Cifrado em repouso com AES-256-GCM, nonce de 12 bytes e tag de autenticação de 16 bytes.
 * - AAD (Additional Authenticated Data) vincula estritamente `tenantId:marketplace:secretId`
 *   ao ciphertext, impedindo transplante de segredo entre contas ou lojas.
 * - Chave mestra de criptografia obtida exclusivamente no servidor (`AFFILIATE_SECRETS_MASTER_KEY`).
 * - Nenhum fallback de segredo de terceiro para o ambiente da casa.
 * - Rotação e revogação auditáveis.
 */

import { encryptSecret, decryptSecret, type EncryptedSecretPayload } from "../../persistence/src/affiliate-secret-crypto.ts";
export * from "../../persistence/src/affiliate-secret-crypto.ts";
import type postgres from "postgres";
import { db } from "./db.ts";

export interface StoreSecretParams {
  tenantId: string;
  marketplace: string;
  secretId: string;
  secretValue: string;
}

/**
 * Armazena ou atualiza de forma idempotente um segredo cifrado para a conta.
 */
export async function storeAffiliateSecret(
  params: StoreSecretParams,
  sql: postgres.Sql | postgres.TransactionSql = db(),
): Promise<{ secretId: string; status: "active" }> {
  const encrypted = encryptSecret(params.secretValue, params.tenantId, params.marketplace, params.secretId);

  await sql`
    insert into garimpa.affiliate_secret (
      tenant_id, marketplace, secret_id, key_version, ciphertext, nonce, tag, status, updated_at
    ) values (
      ${params.tenantId}, ${params.marketplace}, ${params.secretId},
      ${encrypted.keyVersion}, ${encrypted.ciphertext}, ${encrypted.nonce}, ${encrypted.tag},
      'active', now()
    )
    on conflict (tenant_id, marketplace, secret_id) do update set
      key_version = excluded.key_version,
      ciphertext = excluded.ciphertext,
      nonce = excluded.nonce,
      tag = excluded.tag,
      status = 'active',
      updated_at = now()
  `;

  return { secretId: params.secretId, status: "active" };
}

/**
 * Resolve e decifra o segredo ativo exclusivamente para o adapter/worker autorizado.
 * Falha fechada (retorna null) caso inexistente, revogado ou rotacionado.
 */
export async function resolveAffiliateSecret(
  tenantId: string,
  marketplace: string,
  secretId: string,
  sql: postgres.Sql | postgres.TransactionSql = db(),
): Promise<string | null> {
  const rows = await sql<{
    key_version: string;
    ciphertext: string;
    nonce: string;
    tag: string;
    status: string;
  }[]>`
    select key_version, ciphertext, nonce, tag, status
    from garimpa.affiliate_secret
    where tenant_id = ${tenantId}
      and marketplace = ${marketplace}
      and secret_id = ${secretId}
      and status = 'active'
    limit 1
  `;

  const row = rows[0];
  if (!row) return null;

  try {
    return decryptSecret(
      {
        keyVersion: row.key_version,
        ciphertext: row.ciphertext,
        nonce: row.nonce,
        tag: row.tag,
      },
      tenantId,
      marketplace,
      secretId,
    );
  } catch {
    return null;
  }
}

/**
 * Revoga um segredo de conta imediatamente.
 */
export async function revokeAffiliateSecret(
  tenantId: string,
  marketplace: string,
  secretId: string,
  sql: postgres.Sql | postgres.TransactionSql = db(),
): Promise<boolean> {
  const result = await sql`
    update garimpa.affiliate_secret
    set status = 'revoked', updated_at = now()
    where tenant_id = ${tenantId}
      and marketplace = ${marketplace}
      and secret_id = ${secretId}
  `;
  return result.count > 0;
}
