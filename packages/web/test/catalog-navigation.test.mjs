import test from 'node:test';
import assert from 'node:assert/strict';
import { safeCatalogUrl, parseCatalogReturn } from '../lib/catalog-navigation.ts';

test('retorno aceita somente a rota interna do catálogo', () => {
  assert.equal(safeCatalogUrl('/?categoria=Casa&pagina=2'), '/?categoria=Casa&pagina=2');
  for (const url of ['//evil.example/', 'https://evil.example/', '/\\evil.example/', '/admin', 'javascript:alert(1)']) assert.equal(safeCatalogUrl(url), null);
});
test('sessão válida mantém páginas e posição; sessões inválidas expiram', () => {
  const value = {url:'/?categoria=Casa&pagina=2', firstPage:1, lastPage:2, scrollY:800, productSlug:'abc-1', savedAt:1000};
  assert.deepEqual(parseCatalogReturn(JSON.stringify(value), 2000), value);
  assert.equal(parseCatalogReturn(JSON.stringify(value), 2_000_000), null);
  assert.equal(parseCatalogReturn(JSON.stringify({...value,lastPage:1000}), 2000), null);
  assert.equal(parseCatalogReturn('bad', 2000), null);
});
