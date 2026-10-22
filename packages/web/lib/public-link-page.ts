import {db} from './db.ts';
import {isCampaignLinkCode} from './commerce-contract.ts';
import {isValidShortCode} from './short-code.ts';
import {publicCampaignLink,publicShortLink} from './public-offer-db.ts';

/** Public /p handler after the restricted projection is installed. */
export async function publicLinkPage(code:string,sqlFactory:typeof db=db):Promise<Response> {
 try {
  const campaign=isCampaignLinkCode(code);
  if(!campaign && !isValidShortCode(code)) return new Response('Link não encontrado',{status:404});
  const slug=campaign ? (await publicCampaignLink(code,null,sqlFactory))?.slug : await publicShortLink(code,null,sqlFactory);
  if(!slug) return new Response('Link não encontrado',{status:404});
  return new Response(null,{status:302,headers:{Location:`/bizu/${encodeURIComponent(slug)}${campaign?`?c=${encodeURIComponent(code)}`:''}`,'Cache-Control':'no-store'}});
 } catch {return new Response('Não foi possível verificar o link agora',{status:503});}
}
