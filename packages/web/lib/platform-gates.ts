import { mlAutomatedCaptureEnabled } from "./automated-capture.ts";
import { shopeeCaptureEnabled } from "./shopee-capture.ts";
import { aliexpressCaptureEnabled } from "./aliexpress-capture.ts";

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
const CAPTURE_GATES: Readonly<Record<string, () => boolean>> = {
  mercadolivre: mlAutomatedCaptureEnabled,
  shopee: shopeeCaptureEnabled,
  aliexpress: aliexpressCaptureEnabled,
};

/** Falha fechado: plataforma desconhecida é sempre "desligada". */
export function captureEnabled(marketplace: string): boolean {
  return CAPTURE_GATES[marketplace]?.() ?? false;
}

/** Slugs com gate registrado — usado para distinguir "sem gate" de "desligada". */
export function hasCaptureGate(marketplace: string): boolean {
  return marketplace in CAPTURE_GATES;
}
