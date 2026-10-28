import test from 'node:test';
import assert from 'node:assert/strict';
import { requestFavorite } from '../lib/member-actions.ts';

test('a rejeição de sincronização impede confirmar o coração como salvo', async () => {
  for (const response of [new Response('{"ok":false}', {status: 500}), new Response('{"ok":true,"applied":false}', {status: 200})]) {
    let saved = false;
    await assert.rejects(async () => { await requestFavorite('item', true, async () => response); saved = true; });
    assert.equal(saved, false);
  }
  let saved = false;
  await requestFavorite('item', true, async () => new Response('{"ok":true,"applied":true}', {status: 200}));
  saved = true;
  assert.equal(saved, true);
});
