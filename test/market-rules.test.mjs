// Rules for the For Sale market (supabase/functions/market-listing/rules.mjs).
// Plain ESM (no TS) so CI's Node 20 can import it; the edge function and this test
// exercise the exact same code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  judgePdProduct, variantIdFromCatalogId, decideListing, validateDetails,
} from '../supabase/functions/market-listing/rules.mjs';

const product = {
  variants: [
    { id: 11, available: false, price: 3499 },
    { id: 22, available: true, price: 4499 },
    { id: 33, available: true, price: 3999 },
  ],
};

test('PD 404 → not on PD', () => {
  assert.deepEqual(judgePdProduct(null, null), { state: 'not_on_pd', inStock: false, pdPriceCents: null });
});

test('product-level: any variant in stock → in stock at cheapest in-stock price', () => {
  assert.deepEqual(judgePdProduct(product, null), { state: 'in_stock', inStock: true, pdPriceCents: 3999 });
});

test('product-level: nothing in stock → sold out', () => {
  const p = { variants: [{ id: 1, available: false, price: 3000 }, { id: 2, available: false, price: 2500 }] };
  assert.deepEqual(judgePdProduct(p, null), { state: 'sold_out', inStock: false, pdPriceCents: 2500 });
});

test('variant-level judges the exact variant', () => {
  assert.equal(judgePdProduct(product, '11').state, 'sold_out');
  assert.deepEqual(judgePdProduct(product, '22'), { state: 'in_stock', inStock: true, pdPriceCents: 4499 });
  assert.equal(judgePdProduct(product, '99').state, 'not_on_pd');
});

test('variant id parsing', () => {
  assert.equal(variantIdFromCatalogId('123::456'), '456');
  assert.equal(variantIdFromCatalogId('123'), null);
  assert.equal(variantIdFromCatalogId(null), null);
});

test('create is refused while PD sells it, at any price', () => {
  const inStock = { state: 'in_stock', inStock: true, pdPriceCents: 3000 };
  assert.deepEqual(decideListing('create', inStock, 1000), { ok: false, code: 'PD_IN_STOCK', pdPriceCents: 3000 });
});

test('update while PD sells it: allowed at/under PD price, refused above', () => {
  const inStock = { state: 'in_stock', inStock: true, pdPriceCents: 3000 };
  assert.deepEqual(decideListing('update', inStock, 3000), { ok: true, pdState: 'in_stock_capped' });
  assert.deepEqual(decideListing('update', inStock, 3001), { ok: false, code: 'PD_PRICE_CAP', pdPriceCents: 3000 });
});

test('sold out / not on PD → any price is fine', () => {
  assert.deepEqual(decideListing('create', { state: 'sold_out', inStock: false, pdPriceCents: 3000 }, 9000),
    { ok: true, pdState: 'sold_out' });
  assert.deepEqual(decideListing('create', { state: 'not_on_pd', inStock: false, pdPriceCents: null }, 9000),
    { ok: true, pdState: 'not_on_pd' });
});

test('details validation', () => {
  const uid = 'u1';
  const ok = { priceCents: 2500, parcel: { preset: 'small', weightOz: 10 }, services: ['usps_ground'], notes: null, photoPaths: ['u1/a.jpg'] };
  assert.equal(validateDetails(uid, ok), null);
  assert.match(validateDetails(uid, { ...ok, priceCents: 99 }), /Price/);
  assert.match(validateDetails(uid, { ...ok, priceCents: 25.5 }), /Price/);
  assert.match(validateDetails(uid, { ...ok, parcel: null }), /package/);
  assert.match(validateDetails(uid, { ...ok, services: [] }), /shipping service/);
  assert.match(validateDetails(uid, { ...ok, photoPaths: [] }), /photos/);
  assert.match(validateDetails(uid, { ...ok, photoPaths: ['u2/a.jpg'] }), /own uploads/);
  assert.match(validateDetails(uid, { ...ok, photoPaths: ['u1/../u2/a.jpg'] }), /own uploads/);
});
