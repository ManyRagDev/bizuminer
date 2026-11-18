/**
 * Flags server-only (E3/E4). Nenhuma começa com NEXT_PUBLIC_ — não chegam ao
 * bundle do client. Funções puras (env injetável) para teste.
 */

export interface FlagsEnv {
  readonly AFFILIATE_LINKS_V2_ENABLED?: string;
  readonly EXTENSION_CAPTURE_ENABLED?: string;
  readonly [key: string]: string | undefined;
}

/**
 * E3: quando true, o link afiliado é mintado com a credencial do afiliado dono
 * da publicação (resolvida no banco), sem fallback para a tag global. Default
 * false até a casa ter configuração válida de marketplace.
 */
export function affiliateLinksV2Enabled(env: FlagsEnv = process.env): boolean {
  return env.AFFILIATE_LINKS_V2_ENABLED === "true";
}

/** E4: quando true, a borda de captura por dispositivo (extensão) está aberta. */
export function extensionCaptureEnabled(env: FlagsEnv = process.env): boolean {
  return env.EXTENSION_CAPTURE_ENABLED === "true";
}

/** The browser import pilot is enabled by store. Existing ML behavior is unchanged. */
export function extensionBatchMarketplaceEnabled(marketplace: "mercadolivre" | "amazon" | "aliexpress", env: FlagsEnv = process.env) {
  if (marketplace === "mercadolivre") return true;
  if (env.NODE_ENV === "development" && !env.VERCEL) return true;
  return (marketplace === "amazon" ? env.AMAZON_BROWSER_CAPTURE_ENABLED : env.ALIEXPRESS_BROWSER_CAPTURE_ENABLED) === "true";
}

/** Directed recapture requires explicit account and source allowlists. */
export function recaptureTenantEnabled(tenantId:string,env:FlagsEnv=process.env):boolean {
  if(!/^[a-z0-9._-]{1,64}$/.test(tenantId)) return false;
  const configured=(env.RECAPTURE_SCOPE ?? '').split(',').map(value=>value.trim()).filter(Boolean);
  return configured.length>0 && configured.every(value=>/^[a-z0-9._-]{1,64}\/(mercadolivre|amazon|aliexpress)$/.test(value))
    && configured.some(value=>value.startsWith(`${tenantId}/`));
}
export function recaptureMarketplaceEnabled(marketplace:"mercadolivre"|"amazon"|"aliexpress",tenantId:string,env:FlagsEnv=process.env):boolean {
  const configured=(env.RECAPTURE_SCOPE ?? '').split(',').map(value=>value.trim()).filter(Boolean);
  return recaptureTenantEnabled(tenantId,env) && configured.includes(`${tenantId}/${marketplace}`)
    && extensionBatchMarketplaceEnabled(marketplace,env);
}

/** Source activation is narrower than the accounts used for shadow scoring. */
export function shopeeVerificationTenantEnabled(tenantId:string,env:FlagsEnv=process.env):boolean {
  if(env.SHOPEE_VERIFICATION_ENABLED!=='true' || env.CURATION_COMPARISON_ENABLED!=='true'
    || !/^[a-z0-9._-]{1,64}$/.test(tenantId)) return false;
  const sources=(env.SHOPEE_VERIFICATION_TENANTS ?? '').split(',').map(value=>value.trim()).filter(Boolean);
  const comparison=(env.CURATION_COMPARISON_TENANTS ?? '').split(',').map(value=>value.trim()).filter(Boolean);
  const workers=(env.CAPTURE_WORKER_TENANTS ?? '').split(',').map(value=>value.trim()).filter(Boolean);
  return sources.length>0 && sources.every(value=>/^[a-z0-9._-]{1,64}$/.test(value)
    && comparison.includes(value) && workers.includes(value)) && sources.includes(tenantId);
}

export type ExtensionCaptureMode = "manual" | "durable";
/** Manual capture never starts autonomous evaluation. Unknown values close the boundary. */
export function extensionCaptureMode(env: FlagsEnv = process.env): ExtensionCaptureMode | null {
  const value = env.EXTENSION_CAPTURE_MODE;
  return value === undefined ? "manual" : value === "manual" || value === "durable" ? value : null;
}
