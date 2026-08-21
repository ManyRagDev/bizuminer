/**
 * Endereço-base absoluto do site. Resolve em cascata para que o mesmo código
 * funcione em desenvolvimento local, no deploy provisório da Vercel e no
 * domínio próprio quando ele existir — sem precisar trocar nada no código.
 */
export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3100";
}
