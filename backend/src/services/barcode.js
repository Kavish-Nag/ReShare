// Looks a barcode (GTIN) up in Open Food Facts. A barcode only identifies the product: expiry dates are not in it.
const FIELDS = 'product_name,generic_name,brands,quantity,categories_tags,allergens_tags,image_front_url';

const CATEGORY_RULES = [
  ['Bakery', /bread|bakery|biscuit|cake|pastr|cookie|bun|croissant|muffin|bagel|donut|doughnut/],
  ['Dairy', /dairies|milk|yogh?urt|cheese|butter|cream|curd/],
  ['Produce', /fruit|vegetable|salad|produce|banana|apple|tomato/],
  ['Meals', /meal|ready|pizza|sandwich|soup|noodle|pasta|burger|rice|curry|sushi|lunch|dish/]
];

export function mapCategory(tags = []) {
  const text = tags.join(' ').toLowerCase();
  return (CATEGORY_RULES.find(([, re]) => re.test(text)) || ['Packaged'])[0];
}

export function cleanAllergens(tags = []) {
  return tags.map(t => t.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ')).filter(Boolean);
}

function fullName(p) {
  const brand = p.brands?.split(',')[0].trim();
  return brand && !p.product_name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${p.product_name}` : p.product_name;
}

export async function lookupBarcode(code) {
  const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`, {
    headers: { 'User-Agent': 'ReShare/1.0 (food-waste marketplace)' },
    signal: AbortSignal.timeout(5000)
  });
  if (response.status === 404) return { found: false };
  if (!response.ok) throw Object.assign(new Error('Product lookup service is unavailable'), { status: 502 });
  const { status, product: p } = await response.json();
  if (status !== 1 || !p?.product_name) return { found: false };
  return {
    found: true,
    name: fullName(p).slice(0, 120),
    category: mapCategory(p.categories_tags),
    description: (p.generic_name || '').slice(0, 2000),
    quantity_text: p.quantity || '',
    allergens: cleanAllergens(p.allergens_tags),
    image_url: p.image_front_url || null
  };
}
