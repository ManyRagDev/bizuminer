/**
 * CORS da borda de extensão (E4). Nunca `*`. A origem do request deve estar na
 * allowlist explícita (`EXTENSION_ALLOWED_ORIGINS`, separada por vírgula). Em
 * dev a origem do Chrome é `chrome-extension://<id-de-dev>`; em produção é o ID
 * publicado. Hosts da API BizuMiner também entram (para teste via painel).
 */

export function extensionAllowedOrigins(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.EXTENSION_ALLOWED_ORIGINS ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Origem exata é permitida? (sem wildcard, comparação exata, case-sensitive). */
export function isAllowedExtensionOrigin(origin: string | null, env: Record<string, string | undefined> = process.env): boolean {
  if (!origin) return false;
  return extensionAllowedOrigins(env).includes(origin);
}

/** Cabeçalhos CORS quando a origem é permitida; caso contrário, sem ACAO. */
export function extensionCorsHeaders(
  origin: string | null,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (origin && isAllowedExtensionOrigin(origin, env)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
