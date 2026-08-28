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
