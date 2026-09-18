import { slugForShortCode } from "../../../lib/short-link-db";

/**
 * Link curto de compartilhamento: `/p/<code>` → `/bizu/<slug>`.
 *
 * O DESTINO É A PÁGINA DO PRODUTO, NÃO O `/go`
 *
 * Quem clica precisa cair numa página NOSSA, com as tags OG que montam o card
 * de preview no WhatsApp — o robô do app segue redirects e lê o destino final.
 * Apontar para `/go` faria o preview sair com o card do Mercado Livre, e ainda
 * gravaria um click_event a cada passagem de robô, contaminando a telemetria
 * com tráfego não humano. O `/go` continua sendo o CTA dentro da página, onde
 * o clique é de gente de verdade.
 *
 * A PASTA `/p/` EXISTE PARA NÃO COLIDIR COM ROTA REAL
 *
 * Se os códigos morassem na raiz, um sorteio sairia um dia como `bizu`, `go`,
 * `api` ou `entrar` e sequestraria uma rota do site — e a defesa seria uma
 * lista de palavras proibidas que teria que crescer junto com o site, com
 * alguém esquecendo de atualizar. Dois caracteres compram imunidade permanente.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const slug = await slugForShortCode(code);

  if (!slug) {
    return new Response("Link não encontrado", { status: 404 });
  }

  // 302 e não 301: o mapa código → produto é dado de aplicação, e um 301 fica
  // gravado no navegador de quem clicou. Se um código precisar ser reapontado
  // ou revogado, o 301 tornaria isso impossível para quem já visitou.
  return new Response(null, {
    status: 302,
    headers: { Location: `/bizu/${slug}`, "Cache-Control": "no-store" },
  });
}
