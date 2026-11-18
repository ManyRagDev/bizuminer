/** DOM fixtures → shipped extractors → strict server validator. No network. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {collectBrowserOffers} from '../../packages/extension/src/content/page-extractor.ts';
import {extractCard} from '../../packages/extension/src/content/card-extractor.ts';
const require=createRequire(import.meta.url);
const {validateBrowserCapture}=require('../../packages/web/lib/browser-capture-contract.ts');
const requestId='d39b06a6-740c-4bdf-96c5-04a57dab61bb';
function card(href:string){return {textContent:'Produto de teste',querySelector(selector:string){
  if(selector==='a.poly-component__title')return {href,textContent:'Produto de teste'};
  if(selector.startsWith('.poly-price'))return {getAttribute:()=> '68 reais'};
  return null;
},querySelectorAll(){return [];}};}
function extract(urls:string[]){return vm.runInNewContext(`(${collectBrowserOffers.toString()})()`,{
  // tsx may add this name-preserving helper; the production esbuild bundle
  // and Node's strip-types reader do not otherwise depend on a VM global.
  __name:(fn:Function)=>fn,
  URL,URLSearchParams,location:{href:'https://www.mercadolivre.com.br/ofertas?container_id=fixture&promotion_type=lightning#origin=scut'},
  document:{querySelectorAll:()=>urls.map(card)},crypto:{randomUUID:()=>requestId},
});}
const direct='https://produto.mercadolivre.com.br/MLB-1111111111-produto';
for(const suffix of ['?wid=MLB2222222222&tracking=omitido','#wid=MLB2222222222&tracking=omitido','?pdp_filters=item_id%3AMLB2222222222&tracking=omitido']){
  const href=direct+suffix;
  const payload=extract([href]);
  assert.equal(payload.products[0].externalId,'MLB2222222222');
  assert.equal(payload.products[0].productUrl,direct+'?wid=MLB2222222222');
  const normalized=validateBrowserCapture(payload);
  assert.equal(normalized.products.length,1);
  assert.equal(normalized.products[0].externalId,'MLB2222222222');
  const item=extractCard(`<a href="${href.replaceAll('&','&amp;')}" class="poly-component__title">Produto de teste</a><div class="poly-price__current"><span aria-label="68 reais"></span></div>`);
  assert.ok(item);assert.equal(item.productUrl,direct+'?wid=MLB2222222222');
  assert.equal(validateBrowserCapture({...payload,products:[item]}).products.length,1);
  // This is the old lossy canonicalization, not a server allowance: it still
  // fails because it describes a different listing than the observed ID.
  assert.throws(()=>validateBrowserCapture({...payload,products:[{...payload.products[0],productUrl:direct}]}),/identity/);
}
const catalog='https://www.mercadolivre.com.br/produto/p/MLB3333333';
const catalogPayload=extract([catalog+'#wid=MLB2222222222']);
assert.equal(validateBrowserCapture(catalogPayload).products[0].productUrl,catalog+'?wid=MLB2222222222');
assert.throws(()=>validateBrowserCapture({...catalogPayload,products:[{...catalogPayload.products[0],productUrl:catalog}]}),/identity/);
const plain=extract([direct]);assert.equal(plain.products[0].productUrl,direct);assert.equal(validateBrowserCapture(plain).products[0].externalId,'MLB1111111111');
const withMalformed=extract(['not a URL',direct]);assert.equal(withMalformed.products.length,1);assert.equal(withMalformed.ignoredCards,1);
assert.throws(()=>validateBrowserCapture({...plain,products:[{...plain.products[0],productUrl:direct+'?wid=MLB9999999999'}]}),/identity/);
console.log('PASS shipped ML page/card readers preserve explicit listing identity for query/fragment/pdp_filters on direct and catalog URLs; strict mismatches still rejected; no historical DOM assumed');
