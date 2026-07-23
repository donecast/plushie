// Regenerate catalog.json — the baked cold-start catalog snapshot the app
// paints from at boot, before the live Shopify refresh lands.
//
// The snapshot's stock flags freeze at generation time, so a months-old file
// boots the app with months-old "Out of Stock" badges (the live refresh
// corrects state.catalog seconds later, but the boot paint reads this file).
// Re-run this whenever the baseline drifts too far, then bump the
// `catalog.json?v=N` buster in app-core.js + app-account.js so clients
// refetch it past the service-worker cache.
//
//   node scripts/refresh-catalog-snapshot.mjs
//
// Output shape matches the original hand-built snapshot: the app's own
// normalized item fields (no body_html/lore — loadCatalog() tolerates their
// absence), one `{ products, count }` wrapper. The available/retired logic
// mirrors normalizeShopifyProduct() in app-core.js — keep them in sync.

import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://plushiedreadfuls.com/products.json?limit=250';
const OUT = path.resolve(new URL('.', import.meta.url).pathname, '..', 'catalog.json');

const all = [];
for (let page = 1; page <= 10; page++) {
  // Shopify's bot filter 403s naked non-browser user agents; send a plain one.
  const r = await fetch(`${BASE}&page=${page}`, { headers: { 'user-agent': 'Mozilla/5.0 (PlushCrypt snapshot refresh)' } });
  if (!r.ok) throw new Error(`page ${page} -> HTTP ${r.status}`);
  const { products = [] } = await r.json();
  if (products.length === 0) break;
  all.push(...products);
  if (products.length < 250) break;
}
if (all.length === 0) throw new Error('live feed returned zero products — refusing to write an empty snapshot');

const items = all.map((p) => {
  const variants = p.variants || [];
  const available = variants.some((v) => v.available);
  const priceNums = variants.map((v) => parseFloat(v.price)).filter((n) => !isNaN(n));
  const tags = p.tags || [];
  const lcTags = tags.map((t) => t.toLowerCase());
  const comingSoon = lcTags.includes('coming soon') || lcTags.includes('tba');
  // Same rule as normalizeShopifyProduct(): explicit 'retired' tag, or a
  // sold-out 'last chance' run (final stock — gone for good once it sells).
  const retired = lcTags.includes('retired')
    || (!available && !comingSoon && lcTags.includes('last chance'));
  return {
    id: String(p.id),
    name: p.title,
    handle: p.handle,
    type: p.product_type || '',
    image: p.images?.[0]?.src || null,
    price: priceNums.length ? Math.min(...priceNums) : null,
    available,
    retired,
    createdAt: p.created_at,
    publishedAt: p.published_at,
    tags,
  };
});

const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
fs.writeFileSync(OUT, JSON.stringify({ products: items, count: items.length }));

const n = (list, f) => list.filter(f).length;
console.log(`wrote ${OUT}`);
console.log(`products: ${prev.products.length} -> ${items.length}`);
console.log(`available: ${n(prev.products, (p) => p.available)} -> ${n(items, (p) => p.available)}`);
console.log(`retired:   ${n(prev.products, (p) => p.retired)} -> ${n(items, (p) => p.retired)}`);
