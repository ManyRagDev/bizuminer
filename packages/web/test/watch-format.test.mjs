import test from 'node:test';
import assert from 'node:assert/strict';
import { formatWatchMoney, countComparableDrops } from '../lib/watch-format.ts';

test('referências usam a moeda registrada; legado sem moeda nunca vira reais', () => {
  assert.match(formatWatchMoney(1234, 'BRL'), /R\$\s?12,34/);
  assert.match(formatWatchMoney(1234, 'USD'), /US\$\s?12,34/);
  assert.equal(formatWatchMoney(1234, null), '12,34 (moeda não informada)');
});
test('resumo conta somente quedas comparáveis, sem somar moedas', () => {
  assert.equal(countComparableDrops([{baselineCents:100, currentCents:90, comparisonStatus:'comparable'}, {baselineCents:200, currentCents:100, comparisonStatus:'comparable'}, {baselineCents:100, currentCents:80, comparisonStatus:'configuration_changed'}, {baselineCents:100,currentCents:null,comparisonStatus:'unavailable'}, {baselineCents:100,currentCents:100,comparisonStatus:'comparable'}]), 2);
});
