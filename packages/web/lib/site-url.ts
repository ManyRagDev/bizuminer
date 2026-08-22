/**
 * Endereço-base absoluto do site. Resolve em cascata para que o mesmo código
 * funcione em desenvolvimento local, no deploy provisório da Vercel e no
 * domínio próprio — sem precisar trocar nada no código.
 */

/** Domínio canônico do produto (comprado e no ar em 20/08/2026). */
export const CANONICAL_SITE_URL = "https://www.bizuminer.com.br";

/**
 * Base para meta tags e card OG: cada ambiente aponta para si mesmo, para o
 * preview renderizar no preview e o domínio renderizar no domínio.
 */
export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3100";
}

/**
 * Base para LINKS DE COMPARTILHAMENTO (composer, mensagens): sempre o domínio
 * canônico. Um link que sai num grupo de WhatsApp apontando para um preview
 * ou para o localhost seria quebrado por definição — o ambiente onde o painel
 * roda não é o ambiente onde o comprador clica.
 */
export function shareBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  return CANONICAL_SITE_URL;
}
