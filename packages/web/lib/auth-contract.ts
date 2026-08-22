import { validUserId } from "./member-contract.ts";

/**
 * Contrato de autenticação: regras puras, sem banco nem rede — a camada que
 * os testes cobrem por inteiro (mesmo padrão de member-contract.ts).
 */

/** Único e-mail com acesso ao painel /admin. Fallback em código: nada abre
 *  sem este valor no ambiente. */
export const ADMIN_EMAIL_DEFAULT = "emanuel.adm10@gmail.com";

export function adminEmail(): string {
  return (process.env.ADMIN_EMAIL ?? ADMIN_EMAIL_DEFAULT).trim().toLowerCase();
}

/** O e-mail do dono compara normalizado (trim + minúsculas), como toda
 *  comparação de e-mail deve ser — "Emanuel.ADM10@Gmail.com" ≠ dono. */
export function isAdminEmail(value: unknown): value is string {
  return typeof value === "string" && value.trim().toLowerCase() === adminEmail();
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
