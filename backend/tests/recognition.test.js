import test from 'node:test';
import assert from 'node:assert/strict';

// imageRecognition.js imports the AWS SDK at load time; the pure mapper is tested here without it installed locally.
const label = (Name, Confidence, parents = [], cats = ['Food and Beverage']) =>
  ({ Name, Confidence, Parents: parents.map(Name => ({ Name })), Categories: cats.map(Name => ({ Name })) });

let labelsToProduct;
try {
  ({ labelsToProduct } = await import('../src/services/imageRecognition.js'));
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}

test('picks the specific food label and maps its category', { skip: !labelsToProduct && 'AWS SDK not installed locally' }, () => {
  const banana = labelsToProduct([
    label('Food', 99.9), label('Fruit', 99.1, ['Food', 'Plant']), label('Banana', 98.7, ['Fruit', 'Food', 'Plant']), label('Plant', 99, [], ['Plants'])
  ]);
  assert.equal(banana.name, 'Banana');
  assert.equal(banana.category, 'Produce');
  assert.equal(banana.confidence, 99);

  const bread = labelsToProduct([label('Food', 99), label('Bread', 97.2, ['Food']), label('Bun', 90, ['Bread', 'Food'])]);
  assert.equal(bread.name, 'Bun');
  assert.equal(bread.category, 'Bakery');
});

test('says not found for non-food or only generic labels', { skip: !labelsToProduct && 'AWS SDK not installed locally' }, () => {
  assert.equal(labelsToProduct([label('Laptop', 99, [], ['Technology and Computing'])]).found, false);
  assert.equal(labelsToProduct([label('Food', 99.5)]).found, false);
  assert.equal(labelsToProduct([]).found, false);
});
