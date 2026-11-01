import test from 'node:test';
import assert from 'node:assert/strict';
import {offerArtworkFacts} from '../lib/offer-artwork.ts';
test('a arte específica apresenta composição e condições conhecidas',()=>{
  assert.deepEqual(offerArtworkFacts({offerOptionKey:'key',purchaseContents:'1 un. · Um organizador azul',offerConditions:'Cupom CASA10; Pix; frete no checkout'}),
    {contents:'1 un. · Um organizador azul',conditions:'Cupom CASA10; Pix; frete no checkout'});
});
test('condições longas não são omitidas nem cortadas como se estivessem completas',()=>{
  const facts=offerArtworkFacts({offerOptionKey:'key',purchaseContents:'Conteúdo '.repeat(30),offerConditions:'Condição material '.repeat(30)});
  assert.match(facts.contents,/completa.*link/);assert.match(facts.conditions,/Preço sujeito.*condições.*link/);
  assert.deepEqual(offerArtworkFacts({purchaseContents:'legado'}),{contents:null,conditions:null});
});
