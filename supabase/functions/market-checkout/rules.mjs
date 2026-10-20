// Pure money + state rules for For Sale payments. No I/O, so they run under
// Deno (edge functions) and Node's test runner (test/market-payments.test.mjs).
// Keep FEES in sync with data.MARKET_FEES in data.js.

export const FEES = { buyerPct: 5, sellerPct: 5 };
export const feeCents = (cents, pct) => Math.round(cents * pct / 100);

// Everything is integer cents. Shipping is passed through fee-free; fees apply
// to the agreed item price only.
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
    seller_payout_cents: itemCents + shippingCents - sellerFee,
  };
}

// Allowed order moves. Anything else is a bug or a replayed event.
const NEXT = {
  awaiting_payment: ["paid", "cancelled"],
  paid: ["shipped", "refunded", "disputed"],
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
  if (order.buyer_confirmed) return true;
  return now - new Date(order.delivered_at) >= autoDays * 86_400_000;
}
