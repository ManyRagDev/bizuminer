/** Fluxo de "link direto" do composer: página de passagem com contador.
 *  Decisão do dono (20/08/2026): o link compartilhado leva o comprador ao
 *  Mercado Livre sem fricção, mas sem sequestrar o navegador — a página
 *  redireciona sozinha após 3s, e qualquer interação ou o botão "quero ficar
 *  aqui" cancela. A flag de sessão impede o loop do botão voltar: depois do
 *  primeiro redirecionamento, a página não redireciona de novo. */

export const DIRECT_COUNTDOWN_SECONDS = 3;
export const DIRECT_FLAG_PREFIX = "bm_direct_";

/** Chave da flag na sessão: uma por produto (cada link decide sozinho). */
export function flagKey(slug: string): string {
  return `${DIRECT_FLAG_PREFIX}${slug}`;
}

/** Próximo passo do contador: decresce até 0 e para aí. */
export function nextCountdown(current: number): number {
  return Math.max(current - 1, 0);
}

/** O momento de disparar é quando o contador chega a 0. */
export function shouldFire(countdown: number): boolean {
  return countdown <= 0;
}
