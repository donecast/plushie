// Pure money + state rules for For Sale payments. No I/O, so they run under
// Deno (edge functions) and Node's test runner (test/market-payments.test.mjs).
// Keep FEES in sync with data.MARKET_FEES in data.js.

export const FEES = { buyerPct: 5, sellerPct: 5 };
export const feeCents = (cents, pct) => Math.round(cents * pct / 100);

// Everything is integer cents. Shipping is the real carrier rate for a label
// WE buy (EasyPost), so it can't be padded: fees apply to the item price only,
// and the seller's payout is item minus their fee (the shipping money pays for
// the label, not the seller). Settled 2026-10-22.
export function computeOrderTotals(itemCents, shippingCents, fees = FEES) {
  if (![itemCents, shippingCents].every(Number.isInteger) || itemCents < 100 || shippingCents < 0) {
    throw new Error("BAD_AMOUNTS");
  }
  const buyerFee = feeCents(itemCents, fees.buyerPct);
  const sellerFee = feeCents(itemCents, fees.sellerPct);
  return {
    item_cents: itemCents,
    shipping_cents: shippingCents,
    buyer_fee_cents: buyerFee,
    seller_fee_cents: sellerFee,
    total_cents: itemCents + shippingCents + buyerFee,
    seller_payout_cents: itemCents - sellerFee,
  };
}

// Allowed order moves. Anything else is a bug or a replayed event.
const NEXT = {
  awaiting_payment: ["paid", "cancelled"],
  // paid → delivered happens when the carrier's first scan we hear about is
  // already the delivery.
  paid: ["shipped", "delivered", "refunded", "disputed"],
  shipped: ["delivered", "refunded", "disputed"],
  delivered: ["released", "refunded", "disputed"],
  released: ["disputed"],
  disputed: ["refunded", "released"],
  refunded: [],
  cancelled: [],
};
export const canMove = (from, to) => (NEXT[from] || []).includes(to);

// The seller's money is released only when delivery is confirmed AND either
// the buyer confirmed it or the auto-release window has passed.
export function releaseDue(order, now = new Date(), autoDays = 3) {
  if (order.status !== "delivered" || !order.delivered_at) return false;
  if (order.buyer_confirmed_at) return true;
  return now - new Date(order.delivered_at) >= autoDays * 86_400_000;
}

// What a seller owes (from cancelled sales) comes out of their next payout
// first. Returns how much to withhold and how much to actually transfer.
export function splitPayout(payoutCents, owedCents) {
  const withheld = Math.max(0, Math.min(payoutCents, owedCents));
  return { withheld, transfer: payoutCents - withheld };
}

// Stripe's REST API takes form encoding with bracketed nesting:
// { a: { b: [ { c: 1 } ] } } → a[b][0][c]=1. Null/undefined are skipped.
export function stripeForm(obj, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === "object") stripeForm(item, `${key}[${i}]`, out);
        else out.append(`${key}[${i}]`, String(item));
      });
    } else if (typeof v === "object") {
      stripeForm(v, key, out);
    } else {
      out.append(key, String(v));
    }
  }
  return out;
}

// Where Stripe sends the buyer/seller back. The client passes its own origin +
// path (so the app works on plushcrypt.com, previews, localhost and a
// Capacitor scheme); we only refuse things that aren't a plain app URL.
export function cleanReturnBase(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return null; }
  const okProto = u.protocol === "https:" || u.protocol === "capacitor:" ||
    (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"));
  if (!okProto || u.username || u.password) return null;
  return `${u.origin === "null" ? `${u.protocol}//${u.host}` : u.origin}${u.pathname}`;
}

// The line items the buyer sees on Stripe's checkout page.
export function checkoutLineItems(totals, name) {
  const line = (label, cents) => ({
    quantity: 1,
    price_data: { currency: "usd", unit_amount: cents, product_data: { name: label } },
  });
  const items = [line(name, totals.item_cents)];
  if (totals.shipping_cents > 0) items.push(line(totals.shipping_label ? `Shipping: ${totals.shipping_label}` : "Shipping", totals.shipping_cents));
  if (totals.buyer_fee_cents > 0) items.push(line(`Plush Crypt buyer fee (${FEES.buyerPct}%)`, totals.buyer_fee_cents));
  return items;
}

// A Checkout session must expire 30 min – 24 h out. Inside that, it ends when
// the listing's hold ends; a hold that's nearly over still gets the 30-minute
// minimum (the caller extends the hold to cover it).
export function sessionExpiresAt(holdUntil, now = new Date()) {
  const min = now.getTime() + 31 * 60_000;
  const max = now.getTime() + 23.5 * 3_600_000;
  const t = Math.min(max, Math.max(min, new Date(holdUntil).getTime()));
  return Math.floor(t / 1000);
}

// Shipping rules live in ./shipping.mjs — an identical copy sits next to
// market-listing (each function deploys on its own); a test keeps them equal.
export * from "./shipping.mjs";
