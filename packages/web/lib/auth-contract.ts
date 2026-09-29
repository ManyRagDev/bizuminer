import { validUserId } from "./member-contract.ts";

/**
 * Contrato de autenticação: regras puras, sem banco nem rede — a camada que
 * os testes cobrem por inteiro (mesmo padrão de member-contract.ts).
 */

/** Roles de aplicação reconhecidas. A autorização real é consultada no
 * banco; nunca vem de user_metadata nem de um valor enviado pelo cliente. */
export const APP_ROLES = ["afiliado"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.includes(value as AppRole);
}

/**
 * `next` do fluxo de login só pode ser caminho interno do próprio site.
 * Rejeita absolutos, protocolos e "//" (anti open-redirect): o Google não
 * deve virar ponte para um terceiro.
 */
export function sanitizeNext(value: unknown, fallback = "/minha-area"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export { validUserId };
