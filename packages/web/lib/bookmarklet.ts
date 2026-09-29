/**
 * Fonte do bookmarklet de captura manual do BizuMiner.
 *
 * O bookmarklet roda na página do Mercado Livre que o HUMANO já abriu — lê o
 * DOM da página (URL canônica, título, preço, preço original, imagem), monta o
 * payload BM1 e copia o bloco para colagem na área autenticada do painel.
 *
 * Decisões (24/08/2026):
 * - É ação humana, não scraping: nenhuma requisição automatizada ao ML. O
 *   navegador do curador carrega a página normalmente; o script só lê o que já
 *   está renderizado na tela que ele abriu.
 * - Nenhuma credencial é embutida no bookmarklet. A gravação acontece apenas
 *   em `/api/admin/captura`, protegida pela sessão e pela role `afiliado`.
 * - A estratégia de link afiliado (matt_full) continua no servidor; o
 *   bookmarklet só entrega o href real do produto.
 *
 * Leitura de preço (incidente 25/08/2026): a página de produto do ML não
 * entrega `og:price:amount` — o preço vive em `aria-label` do componente
 * `andes-money-amount` (ex.: "2138 reais", "920 reais com 74 centavos",
 * "Antes: 2799 reais"). Este é o MESMO formato que o parser de /ofertas já lê.
 *
 * REGRAS DE GERAÇÃO (lição do incidente 25/08/2026):
 * - O bookmarklet é minificado em UMA linha e usa SOMENTE aspas simples. Aspas
 *   duplas ou quebras de linha quebram o `href` ao arrastar para a barra de
 *   favoritos e fazem o navegador tratar como navegação em vez de script.
 * - NÃO usar `<a href="javascript:...">` no JSX: o React bloqueia URLs
 *   `javascript:` em cliques por segurança (derrubava a página inteira). A
 *   instalação é por COPIAR o código e colar num favorito manual.
 *
 * Formato do bloco: BM1.<payload-base64url>.<checksum-fnv1a>. O checksum usa o
 * mesmo FNV-1a 32-bit de manual-capture.ts para que a colagem detecte truncamento.
 */

/** Versão do bookmarklet — muda quando o script mudar (cache do painel). */
export const BOOKMARKLET_VERSION = "2.0.0";

/** Corpo legível (multi-linha, apenas documentação). Vira UMA linha em produção. */
const BOOKMARKLET_BODY = String.raw`(function(){
function meta(name){var i,ms=document.querySelectorAll('meta');for(i=0;i<ms.length;i++){if(ms[i].getAttribute('property')===name){var c=ms[i].getAttribute('content');return c?c.trim():'';}}return '';}
function canonicalHref(){var i,ls=document.querySelectorAll('link');for(i=0;i<ls.length;i++){if(ls[i].getAttribute('rel')==='canonical'&&ls[i].getAttribute('href'))return ls[i].getAttribute('href');}return window.location.href;}
function fnv1a32(input){var hash=0x811c9dc5;for(var i=0;i<input.length;i++){hash^=input.charCodeAt(i);hash=Math.imul(hash,0x01000193)>>>0;}return hash>>>0;}
function b64url(input){var bytes=new TextEncoder().encode(input);var binary='';for(var i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function extractItemId(){var url=new URL(window.location.href);var wid=url.searchParams.get('wid');if(wid&&/^MLB\d{6,}$/.test(wid))return wid;var m=window.location.pathname.match(/MLB-?(\d{6,})/);if(m)return 'MLB'+m[1];return null;}
function ariaToCents(label){var m=/(\d[\d.]*)\s*reais(?:\s+com\s+(\d{1,2})\s*centavos)?/.exec(label);if(!m)return NaN;var reais=Number(m[1].replace(/\./g,''));if(!isFinite(reais))return NaN;var centavos=m[2]?Number(m[2]):0;return reais*100+centavos;}
function priceFromPage(){var p=meta('og:price:amount');if(p){var c=ariaToCents(p);if(!isFinite(c)){var n=parseFloat(String(p).replace(/\./g,'').replace(',','.'));c=isFinite(n)&&n>0?Math.round(n*100):NaN;}if(isFinite(c)&&c>0)return c;}var i,am=document.querySelectorAll('.andes-money-amount');for(i=0;i<am.length;i++){var lab=am[i].getAttribute('aria-label');if(lab&&lab.indexOf('Antes')!==0){var c2=ariaToCents(lab);if(isFinite(c2)&&c2>0)return c2;}}return NaN;}
function originalFromPage(){var p=meta('og:price:standard_amount');if(p){var c=ariaToCents(p);if(!isFinite(c)){var n=parseFloat(String(p).replace(/\./g,'').replace(',','.'));c=isFinite(n)&&n>0?Math.round(n*100):NaN;}if(isFinite(c)&&c>0)return c;}var i,am=document.querySelectorAll('.andes-money-amount');for(i=0;i<am.length;i++){var lab=am[i].getAttribute('aria-label');if(lab&&lab.indexOf('Antes')===0){var c2=ariaToCents(lab);if(isFinite(c2)&&c2>0)return c2;}}return undefined;}
function buildBlock(payload){var json=JSON.stringify(payload);var encoded=b64url(json);var checksum=fnv1a32(encoded).toString(16);return 'BM1.'+encoded+'.'+checksum;}
function copyBlock(block){function fb(){prompt('BizuMiner: copie o bloco abaixo e cole no painel:',block);}function ok(){alert('BizuMiner: bloco copiado!\nCole no painel → Captura manual.');}if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(block).then(ok,fb);}else{fb();}}
try{
  var itemId=extractItemId();
  if(!itemId){alert('BizuMiner: não reconheci o anúncio nesta página.\nAbra uma página de produto do Mercado Livre.');return;}
  var url=canonicalHref();
  var title=meta('og:title')||document.title||'';
  if(title.indexOf('|')>0)title=title.slice(0,title.indexOf('|')).trim();
  var priceCents=priceFromPage();
  if(!isFinite(priceCents)||priceCents<=0){alert('BizuMiner: não consegui ler o preço nesta página.\nO produto carregou o preço?');return;}
  var originalCents=originalFromPage();
  if(originalCents!==undefined&&originalCents<=priceCents)originalCents=undefined;
  var image=meta('og:image');
  var payload={v:1,m:'mercadolivre',u:url,i:itemId,t:title,p:priceCents,c:Date.now()};
  if(originalCents!==undefined)payload.op=originalCents;
  if(image)payload.img=image;
  copyBlock(buildBlock(payload));
}catch(e){alert('BizuMiner: erro no bookmarklet:\n'+e.message);}
})();`;

/**
 * Código final em UMA linha. Remover quebras
 * de linha e espaços de indentação é seguro porque todo statement termina em
 * `;` — a semântica não muda.
 */
export function bookmarkletSource(): string {
  return BOOKMARKLET_BODY.replace(/\n\s*/g, "").trim();
}

/** Href completo para favorito (javascript:). */
export function bookmarkletHref(): string {
  return `javascript:${bookmarkletSource()}`;
}

/** Confirma que o corpo gera JavaScript sintaticamente válido (novo Function). */
export function bookmarkletCompiles(): boolean {
  try {
    new Function(bookmarkletSource());
    return true;
  } catch {
    return false;
  }
}
