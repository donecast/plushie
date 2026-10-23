// Pure rules for the For Sale market — no I/O, so they run under Deno (the
// edge function) and under Node's test runner (test/market-rules.test.mjs).
//
// THE RULE: you may only list something Plushie Dreadfuls is NOT selling at
// the moment you post. If PD later restocks it, an existing listing may stay
// — but only at or below PD's current price. Every price/detail edit re-runs
// the check.

import { validateShipping } from "./shipping.mjs";

// Interpret PD's /products/<handle>.js payload (prices in cents). A null
// product means PD returned 404 — the item isn't on the store at all. With a
// variantId we judge that exact variant; otherwise the product is in stock if
// ANY variant is, at the cheapest in-stock variant's price.
export function judgePdProduct(product, variantId) {
  if (!product) return { state: "not_on_pd", inStock: false, pdPriceCents: null };
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variantId) {
    const v = variants.find((x) => String(x.id) === String(variantId));
    if (!v) return { state: "not_on_pd", inStock: false, pdPriceCents: null };
    return v.available
      ? { state: "in_stock", inStock: true, pdPriceCents: Number(v.price) }
      : { state: "sold_out", inStock: false, pdPriceCents: Number(v.price) };
  }
  const live = variants.filter((v) => v.available);
  if (live.length) {
    return { state: "in_stock", inStock: true, pdPriceCents: Math.min(...live.map((v) => Number(v.price))) };
  }
  const prices = variants.map((v) => Number(v.price)).filter((n) => Number.isFinite(n));
  return { state: "sold_out", inStock: false, pdPriceCents: prices.length ? Math.min(...prices) : null };
}

// Catalog ids for expanded variant cards are '<productId>::<variantId>'.
export function variantIdFromCatalogId(catalogId) {
  if (!catalogId) return null;
  const i = catalogId.indexOf("::");
  return i === -1 ? null : catalogId.slice(i + 2) || null;
}

// New listings are refused outright while PD sells the item. Edits to an
// existing listing are allowed while PD sells it only at or under PD's price.
export function decideListing(mode, check, priceCents) {
  if (!check.inStock) return { ok: true, pdState: check.state };
  if (mode === "create") return { ok: false, code: "PD_IN_STOCK", pdPriceCents: check.pdPriceCents };
  if (priceCents > check.pdPriceCents) return { ok: false, code: "PD_PRICE_CAP", pdPriceCents: check.pdPriceCents };
  return { ok: true, pdState: "in_stock_capped" };
}

export const LIMITS = {
  minPriceCents: 100,
  maxPriceCents: 1_000_000,
  maxShippingCents: 20_000,
  maxNotes: 500,
  minPhotos: 1,
  maxPhotos: 5,
};

// Validate the seller-supplied details. Photo paths must be the seller's own
// uploads in the public 'social' bucket ('<uid>/<file>') so nobody can pass
// off someone else's proof shots. Returns an error string or null.
export function validateDetails(uid, d) {
  const isInt = (n) => typeof n === "number" && Number.isInteger(n);
  if (!isInt(d.priceCents) || d.priceCents < LIMITS.minPriceCents || d.priceCents > LIMITS.maxPriceCents) {
    return "Price must be between $1 and $10,000.";
  }
  // Shipping is a real label bought at checkout: the seller sets the package
  // and the services they'll use, not a price.
  const shipErr = validateShipping(d.parcel, d.services);
  if (shipErr) return shipErr;
  if (d.notes != null && (typeof d.notes !== "string" || d.notes.length > LIMITS.maxNotes)) {
    return `Notes must be under ${LIMITS.maxNotes} characters.`;
  }
  if (!Array.isArray(d.photoPaths) || d.photoPaths.length < LIMITS.minPhotos || d.photoPaths.length > LIMITS.maxPhotos) {
    return "Add 1 to 5 real photos of the item.";
  }
  for (const p of d.photoPaths) {
    if (typeof p !== "string" || !p.startsWith(uid + "/") || p.includes("..")) return "Photos must be your own uploads.";
  }
  return null;
}
