import { mlAutomatedCaptureEnabled } from "./automated-capture.ts";

/**
 * Gate de captura por plataforma, resolvido por slug.
 *
 * Existe para que o painel PARE de perguntar `slug === "mercadolivre" ? ... :
 * slug === "shopee" ? ...`. Aquela cadeia de ternários era exatamente o que
 * M-R5 proíbe ("adicionar marketplace é escrever arquivo novo, não editar o
 * núcleo") — com uma terceira loja ela viraria ilegível e, pior, silenciosa:
 * esquecer um ramo devolve `false` e a plataforma some do painel sem erro.
 *
 * Aqui o esquecimento é explícito: plataforma sem entrada cai no default
 * `false` de um lugar SÓ, documentado, e não de um ternário escondido.
 *
 * Quando a AliExpress for aprovada (M5), a entrada dela entra aqui.
 * Ver `docs/tecnico/plano-multiplataforma.md`.
 */
type CaptureEnvironment = Record<string, string | undefined>;
// This is the installation switch, not account credential readiness. The
// dispatch preflight resolves each account's encrypted credentials separately.
const CAPTURE_GATES: Readonly<Record<string, (env: CaptureEnvironment) => boolean>> = {
  mercadolivre: env => mlAutomatedCaptureEnabled(env),
  shopee: env => env.SHOPEE_CAPTURE_ENABLED === "true",
  aliexpress: env => env.ALIEXPRESS_CAPTURE_ENABLED === "true",
};

/** Falha fechado: plataforma desconhecida é sempre "desligada". */
export function captureEnabled(marketplace: string, env: CaptureEnvironment = process.env): boolean {
  return CAPTURE_GATES[marketplace]?.(env) ?? false;
}

/** Slugs com gate registrado — usado para distinguir "sem gate" de "desligada". */
export function hasCaptureGate(marketplace: string): boolean {
  return marketplace in CAPTURE_GATES;
}
