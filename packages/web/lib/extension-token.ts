/**
 * Utilidades de token e pareamento da extensão (E4) — puras, sem banco.
 *
 * - Token de dispositivo: `bm_ext_` + 32 bytes aleatórios em base64url, alta
 *   entropia. O bruto só existe no `chrome.storage.local` do dispositivo e no
 *   response do exchange; o banco guarda apenas o SHA-256 (`token_hash`) e um
 *   prefixo para identificação segura em painel/log.
 * - Código de pareamento: 8 caracteres, uso único, 10 min. O banco guarda só o
 *   hash.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const TOKEN_PREFIX = "bm_ext_";
/** Alfabeto sem caracteres ambíguos (0/O, 1/I/L) para código de uso único. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const PAIRING_CODE_LENGTH = 8;

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

/** Gera o token bruto de dispositivo (aparece UMA vez, no exchange). */
export function generateDeviceToken(): string {
  return TOKEN_PREFIX + base64url(randomBytes(32));
}

/** SHA-256 do token bruto — o que vai para o banco. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Prefixo identificável em painel/log (nunca o token completo). */
export function tokenPrefix(token: string): string {
  return token.startsWith(TOKEN_PREFIX) ? token.slice(0, TOKEN_PREFIX.length + 8) : token.slice(0, 8);
}

/** Código de pareamento curto de uso único. */
export function generatePairingCode(): string {
  const bytes = randomBytes(PAIRING_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]!;
  }
  return code;
}

/** Normaliza o código digitado (trim, uppercase, sem espaços). */
export function normalizePairingCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

/** SHA-256 do código — o que vai para o banco. */
export function hashPairingCode(code: string): string {
  return createHash("sha256").update(normalizePairingCode(code), "utf8").digest("hex");
}

/** Comparação em tempo constante (evita timing attack em hash/token). */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
