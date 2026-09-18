import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_SECRET = "bizuminer_pauta_hmac_secret_2026";
const TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dias

function getSecret(): string {
  return process.env.JWT_SECRET || DEFAULT_SECRET;
}

/**
 * Cria um token HMAC assinado para acesso direto à /pauta via QR Code no celular
 * sem exigir login interativo do Google na tela pequena.
 */
export function createPautaAuthToken(): string {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_MAX_AGE_SECONDS;
  const payload = JSON.stringify({ role: "admin", exp: expiresAt });
  const b64 = Buffer.from(payload).toString("base64url");
  const hmac = createHmac("sha256", getSecret()).update(b64).digest("base64url");
  return `${b64}.${hmac}`;
}

/**
 * Valida o token HMAC recebido na URL ou no cookie.
 */
export function verifyPautaAuthToken(token: string | null | undefined): boolean {
  if (!token || typeof token !== "string") return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [b64, hmac] = parts;
    if (!b64 || !hmac) return false;

    const expectedHmac = createHmac("sha256", getSecret()).update(b64).digest("base64url");
    if (hmac.length !== expectedHmac.length) return false;
    if (!timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) return false;

    const raw = Buffer.from(b64, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as { role?: string; exp?: number };
    const now = Math.floor(Date.now() / 1000);

    return parsed.role === "admin" && typeof parsed.exp === "number" && parsed.exp > now;
  } catch {
    return false;
  }
}
