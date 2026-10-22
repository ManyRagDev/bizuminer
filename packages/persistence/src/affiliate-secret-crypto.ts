// Server-only shared envelope. Extracted unchanged from web; AES-GCM/AAD compatibility is preserved.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
export const DEFAULT_KEY_VERSION = "v1";

function parseRawKey(rawKey: string | Buffer): Buffer {
  if (Buffer.isBuffer(rawKey)) {
    if (rawKey.length === 32) return rawKey;
    throw new Error(`Chave fornecida possui tamanho inválido (${rawKey.length} bytes, esperado: 32 bytes).`);
  }
  if (typeof rawKey === "string") {
    const hexBuf = Buffer.from(rawKey, "hex");
    if (hexBuf.length === 32) return hexBuf;
    const utf8Buf = Buffer.from(rawKey, "utf8");
    if (utf8Buf.length === 32) return utf8Buf;
    throw new Error(`Chave fornecida possui tamanho inválido (${rawKey.length} caracteres, esperado: 32 bytes UTF-8 ou 64 caracteres hexadecimais).`);
  }
  throw new Error("Chave fornecida deve ser string ou Buffer de 32 bytes.");
}

export function resolveKeyForVersion(
  keyVersion = DEFAULT_KEY_VERSION,
  keyOverride?: string | Buffer,
): Buffer {
  if (keyOverride) {
    return parseRawKey(keyOverride);
  }

  // 1. Verificar variável específica de versão: AFFILIATE_SECRETS_KEY_<VERSION>
  const versionEnvVar = `AFFILIATE_SECRETS_KEY_${keyVersion.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`;
  const versionKey = process.env[versionEnvVar];
  if (versionKey) {
    return parseRawKey(versionKey);
  }

  // 2. Verificar chave mestra padrão
  const masterKey = process.env.AFFILIATE_SECRETS_MASTER_KEY;
  if (masterKey) {
    return parseRawKey(masterKey);
  }

  // 3. Ausência de chave em produção ou sem fallback configurado: INTERROMPER com erro fatal
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    throw new Error(
      "AFFILIATE_SECRETS_MASTER_KEY é obrigatória e deve conter exatamente 32 bytes em ambiente de produção.",
    );
  }

  throw new Error(
    `AFFILIATE_SECRETS_MASTER_KEY não configurada para a versão '${keyVersion}'. Defina uma chave de 32 bytes.`,
  );
}

export function getMasterKey(keyOverride?: string | Buffer): Buffer {
  return resolveKeyForVersion(DEFAULT_KEY_VERSION, keyOverride);
}

function computeAad(tenantId: string, marketplace: string, secretId: string): Buffer {
  return Buffer.from(`${tenantId}:${marketplace}:${secretId}`, "utf8");
}

export interface EncryptedSecretPayload {
  keyVersion: string;
  ciphertext: string;
  nonce: string;
  tag: string;
}

export function encryptSecret(
  plainText: string,
  tenantId: string,
  marketplace: string,
  secretId: string,
  keyVersion = DEFAULT_KEY_VERSION,
  keyOverride?: string | Buffer,
): EncryptedSecretPayload {
  const key = resolveKeyForVersion(keyVersion, keyOverride);
  const nonce = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  const aad = computeAad(tenantId, marketplace, secretId);
  cipher.setAAD(aad);

  let ciphertext = cipher.update(plainText, "utf8", "hex");
  ciphertext += cipher.final("hex");
  const tag = cipher.getAuthTag();

  return {
    keyVersion,
    ciphertext,
    nonce: nonce.toString("hex"),
    tag: tag.toString("hex"),
  };
}

export function decryptSecret(
  payload: EncryptedSecretPayload,
  tenantId: string,
  marketplace: string,
  secretId: string,
  keyOverride?: string | Buffer,
): string {
  const key = resolveKeyForVersion(payload.keyVersion, keyOverride);
  const nonce = Buffer.from(payload.nonce, "hex");
  const tag = Buffer.from(payload.tag, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, nonce);
  const aad = computeAad(tenantId, marketplace, secretId);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);

  let plainText = decipher.update(payload.ciphertext, "hex", "utf8");
  plainText += decipher.final("utf8");
  return plainText;
}

