import assert from 'node:assert/strict';
import test from 'node:test';
import { composeRecommendations, recommendationBlockers, defaultChannelPolicy,validateChannelPolicy } from '../lib/recommendation-policy.ts';
import { confirmedOfferEvidence,validateOfferConfirmation,optionDetailPath } from '../lib/offer-option.ts';
import { EDITORIAL_POLICY_VERSION,editorialEvidenceFingerprint } from '../lib/editorial-selection.ts';
const now=new Date('2026-11-01T12:00:00Z');
function candidate(id,level='strong',scorePrice=2500){
 const evidence={version:2,currency:'BRL',priceType:'exact',variantIdentity:{state:'source_verified',key:'unit'},variantLabel:'Uma unidade',packageQuantity:1,packageContents:['Uma unidade']};
 const c={id,title:'Produto '+id,marketplace:'shopee',category:null,productUrl:'https://shopee.com.br/product/1/2',imageUrl:'https://example.test/a.jpg',curationStatus:'approved',lastSeenAt:now.toISOString(),evidenceObservedAt:now.toISOString(),priceCents:scorePrice,currency:'BRL',priceType:'exact',offerEvidence:evidence,offerOptionKey:'a'.repeat(32),offerOptionLabel:'Uma unidade',evidenceFingerprint:'same'};
 c.assessment={id:'a_'+id,policyVersion:EDITORIAL_POLICY_VERSION,createdAt:now.toISOString(),productId:id,evidenceFingerprint:c.evidenceFingerprint,
  dimensions:Object.fromEntries(['audience','utility','value','confidence','clarity'].map(k=>[k,{level,reason:'Dados conferidos'}])),audience:'Público geral',benefit:'Organiza itens do dia a dia',purchaseContents:'Uma unidade',publicRationale:'Uma opção útil para organização do dia a dia.',criticalDoubts:[],maxPriceCents:10000};
 return c;
}
test('home broader than WhatsApp, strength precedes novelty and there is no padding quota',()=>{
 const pool=[candidate('adequate','adequate'),candidate('strong'),candidate('best','exceptional')];
 assert.equal(composeRecommendations(pool,'home',defaultChannelPolicy('home'),[],now).selected.length,3);
 assert.deepEqual(composeRecommendations(pool,'whatsapp',defaultChannelPolicy('whatsapp'),[],now).selected.map(c=>c.id),['best','strong']);
 assert.equal(composeRecommendations([],'stories',defaultChannelPolicy('stories'),[],now).selected.length,0);
});
test('unknown or aggregated price never becomes a direct recommendation just because text is complete',()=>{
 const c=candidate('one');c.priceType='range';c.offerEvidence.priceType='range';c.offerEvidence.priceMinCents=100;c.offerEvidence.priceMaxCents=300;
 assert.ok(recommendationBlockers(c,'whatsapp',now).length);
 c.priceType='exact';c.offerEvidence.priceType='exact';delete c.offerEvidence.priceMaxCents;delete c.offerEvidence.priceMinCents;delete c.offerOptionKey;
 assert.ok(recommendationBlockers(c,'whatsapp',now).some(b=>b.includes('opção')));
});
test('recent exposure cannot be evaded by another variant; same option with a new lower observed price can return',()=>{
 const c=candidate('one'),exposure={productId:'one',optionKey:c.offerOptionKey,priceCents:3000,confirmedAt:'2026-11-01T11:00:00Z'};
 assert.equal(composeRecommendations([c],'whatsapp',defaultChannelPolicy('whatsapp'),[exposure],now).selected.length,1);
 c.offerOptionKey='b'.repeat(32);
 assert.equal(composeRecommendations([c],'whatsapp',defaultChannelPolicy('whatsapp'),[exposure],now).selected.length,0);
 c.offerOptionKey=exposure.optionKey;c.evidenceObservedAt='2026-11-01T10:00:00Z';
 assert.equal(composeRecommendations([c],'whatsapp',defaultChannelPolicy('whatsapp'),[exposure],now).selected.length,0);
});
test('manual set/order is scoped and an empty choice is intentionally empty',()=>{
 const pool=[candidate('a'),candidate('b','exceptional')];
 assert.deepEqual(composeRecommendations(pool,'stories',defaultChannelPolicy('stories'),[],now,['a','b']).selected.map(c=>c.id),['a','b']);
 assert.equal(composeRecommendations(pool,'stories',defaultChannelPolicy('stories'),[],now,[]).selected.length,0);
 assert.equal(validateChannelPolicy({limit:25,repeatHours:72,familyLimit:1}),null);
});
test('explicit confirmation preserves provenance and distinguishes unknown from not applicable',()=>{
 const input={expectedTenantId:'a',productId:'p1',expectedObservationId:'o1',variantKey:'blue',variantLabel:'Azul 20 cm',priceCents:2500,quantity:1,contents:'Um organizador azul',dimensions:'20 cm',sellerId:'loja-1',payment:'NA',coupon:'NA',region:'Brasil',shipping:'Calculado no checkout',confirmation:'Conferi os fatos na loja agora'};
 assert.ok(validateOfferConfirmation(input));assert.equal(validateOfferConfirmation({...input,payment:''}),null);
 const e=confirmedOfferEvidence(input,'shopee','https://shopee.com.br/product/1/2',now);
 assert.equal(e.fieldStates.payment,'not_applicable');assert.equal(e.conditions.payment,undefined);assert.equal(e.fieldStates.region,'observed');
 assert.equal(e.variantIdentity.state,'human_verified');assert.equal(e.source.capturedAt,now.toISOString());
 assert.equal(optionDetailPath('shp-1','a'.repeat(32)),`/oferta/shp-1/${'a'.repeat(32)}`);
});

test('multiple cycles renew by merit and confirmed exposure, preserving rejection despite fresh captures',()=>{
 const pool=Array.from({length:24},(_,i)=>candidate(`p${i}`,i<16?'strong':'adequate'));
 const exposures=[];const seen=new Set();
 for(let day=0;day<14;day++){
  const date=new Date(+now+day*86400000);
  for(const c of pool){c.evidenceObservedAt=date.toISOString();c.lastSeenAt=date.toISOString();}
  if(day===6)pool[0].curationStatus='rejected';
  const result=composeRecommendations(pool,'whatsapp',defaultChannelPolicy('whatsapp'),exposures,date);
  assert.ok(result.selected.length<=12);assert.ok(result.selected.every(c=>c.assessment.dimensions.utility.level==='strong'));
  if(day>=6)assert.ok(result.selected.every(c=>c.id!=='p0'));
  for(const c of result.selected.slice(0,4)){seen.add(c.id);exposures.push({productId:c.id,optionKey:c.offerOptionKey,priceCents:c.priceCents,confirmedAt:date.toISOString()});}
 }
 assert.ok(seen.size>=12);
});
test('confirmed option preview uses the public offer facts instead of private assessment revisions',async()=>{
 const {productPreview}=await import('../lib/product-preview.ts');
 const base={...candidate('one'),sourceTitle:'Produto one'};
 const a=productPreview({...base,benefit:'Benefício editorial',displayTitle:'Título curto',editorialRevisionId:'revision'},now);
 const b=productPreview({...base,benefit:undefined,displayTitle:'Produto one — Uma unidade',editorialRevisionId:undefined},now);
 assert.equal(a.version,b.version);assert.ok(a.path.startsWith('/oferta/'));
 assert.notEqual(a.version,productPreview({...base,priceCents:2000},now).version);
});
