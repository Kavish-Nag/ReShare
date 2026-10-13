import test from 'node:test';
import assert from 'node:assert/strict';
import { mapCategory, cleanAllergens } from '../src/services/barcode.js';

test('maps Open Food Facts category tags to ReShare categories', () => {
  assert.equal(mapCategory(['en:breads', 'en:bakery']), 'Bakery');
  assert.equal(mapCategory(['en:dairies', 'en:yogurts']), 'Dairy');
  assert.equal(mapCategory(['en:spreads']), 'Packaged');
  assert.equal(mapCategory(undefined), 'Packaged');
});

test('cleans allergen tags', () => {
  assert.deepEqual(cleanAllergens(['en:milk', 'en:tree-nuts']), ['milk', 'tree nuts']);
});
