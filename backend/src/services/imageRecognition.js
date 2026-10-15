import { RekognitionClient, DetectLabelsCommand } from '@aws-sdk/client-rekognition';
import { mapCategory } from './barcode.js';

const rekognition = new RekognitionClient({ region: process.env.AWS_REGION || 'ap-south-1' });

// Rekognition also returns broad labels ("Food", "Dish"); a seller wants the specific one ("Banana").
const GENERIC = new Set(['food', 'plant', 'produce', 'dish', 'meal', 'snack', 'cuisine', 'fast food', 'junk food', 'ingredient',
  'vegetarian food', 'beverage', 'drink', 'sweets', 'confectionery', 'dessert', 'lunch', 'brunch', 'breakfast', 'dinner', 'baked goods']);
const FOODISH = /food|fruit|vegetable|produce|bread|bakery|dessert|beverage|drink|meal|dish|snack|cuisine|dairy|cake|pastry|sweets|salad/i;

const names = list => (list || []).map(x => x.Name);
const isFood = l => names(l.Categories).includes('Food and Beverage') || FOODISH.test([l.Name, ...names(l.Parents)].join(' '));

// Turns a Rekognition DetectLabels response into listing fields. Pure, so it is unit-tested without AWS.
export function labelsToProduct(labels = []) {
  const food = labels.filter(isFood).sort((a, b) => b.Confidence - a.Confidence);
  const parents = new Set(food.flatMap(l => names(l.Parents)).map(n => n.toLowerCase()));
  const specific = food.filter(l => !parents.has(l.Name.toLowerCase()) && !GENERIC.has(l.Name.toLowerCase()));
  if (!specific.length) return { found: false };
  const [top, ...rest] = specific;
  const related = rest.slice(0, 3).map(l => l.Name);
  return {
    found: true,
    name: top.Name,
    category: mapCategory(labels.flatMap(l => [l.Name, ...names(l.Parents)])),
    description: related.length ? `${top.Name} (${related.join(', ').toLowerCase()}).` : `${top.Name}.`,
    confidence: Math.round(top.Confidence)
  };
}

export async function identifyFood(bytes) {
  const out = await rekognition.send(new DetectLabelsCommand({ Image: { Bytes: bytes }, MaxLabels: 20, MinConfidence: 70 }));
  return labelsToProduct(out.Labels);
}
