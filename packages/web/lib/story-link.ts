import { shareBaseUrl } from "./site-url.ts";
import { shortCodeForSlug } from "./short-link-db.ts";

/**
 * O texto que vai junto do produto no status do WhatsApp.
 *
 * O FORMATO SAIU DE UM TESTE EM CAMPO (29/08/2026), NÃO DE PREFERÊNCIA
 *
 * Colar a URL do produto num status de texto faz o WhatsApp montar o card de
 * preview a partir das tags OG de `/bizu/[slug]` — foto, título, preço e selo,
 * ocupando boa parte da tela. Foi o caminho escolhido em vez de compartilhar
 * uma imagem 1080×1920 pronta: quase o mesmo resultado visual, sem nada de
 * edição manual.
 *
 * Duas consequências desse teste moldam tudo aqui:
 *
 * 1. NÃO repetir dados do produto no texto. O card já mostra título e preço;
 *    legenda que repete a imagem é parede que ninguém lê.
 * 2. A URL PRECISA SER CURTA. O status exibe o texto colado, e a URL longa
 *    saía em duas linhas enormes sob o card. Apagar não dá: remover a URL
 *    derruba o preview junto.
 */

/**
 * Endereço a colar no status. Cunha o código curto na primeira chamada.
 *
 * Sem `https://www.`: o WhatsApp reconhece domínio nu e monta o preview
 * igual, e o prefixo custaria 12 caracteres na exibição — justamente o que
 * estamos tentando economizar.
 */
export async function storyShareUrl(slug: string): Promise<string> {
  const code = await shortCodeForSlug(slug);
  const host = shareBaseUrl().replace(/^https?:\/\//, "").replace(/^www\./, "");
  return `${host}/p/${code}`;
}

/**
 * Texto pronto para colar.
 *
 * A única palavra que acompanha o link é temporal, não descritiva: urgência é
 * o que o card de preview NÃO consegue transmitir sozinho. Tudo o mais que
 * daria para escrever aqui, a imagem já disse melhor.
 */
export async function storyCaption(slug: string): Promise<string> {
  return `acabou rápido → ${await storyShareUrl(slug)}`;
}

/**
 * Endereço mostrado DENTRO da arte de story (`/api/story/[slug]`).
 *
 * Continua sendo o domínio nu, e não o link curto, porque a arte é gerada como
 * imagem: cunhar código ali obrigaria a rota de imagem a escrever no banco a
 * cada renderização, inclusive para robô de preview e recarga de página. A arte
 * é hoje um caminho alternativo ao colar-link; se voltar a ser o principal,
 * vale passar o código já cunhado como parâmetro.
 */
export function storyLinkLabel(): string {
  return shareBaseUrl().replace(/^https?:\/\//, "").replace(/^www\./, "");
}
