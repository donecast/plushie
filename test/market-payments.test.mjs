import test from "node:test";
import assert from "node:assert/strict";
import { computeOrderTotals, canMove, releaseDue, feeCents } from "../supabase/functions/market-checkout/rules.mjs";

test("totals: fees on item only, shipping passes through", () => {
  const t = computeOrderTotals(4000, 600);
  assert.deepEqual(t, {
    item_cents: 4000, shipping_cents: 600, buyer_fee_cents: 200, seller_fee_cents: 200,
    total_cents: 4800, seller_payout_cents: 4400,
  });
});
test("totals: rounding stays integer and the DB checks hold", () => {
  for (const item of [100, 101, 999, 1234, 3333, 1000000]) {
    const t = computeOrderTotals(item, 475);
    assert.ok(Object.values(t).every(Number.isInteger));
    assert.equal(t.total_cents, t.item_cents + t.shipping_cents + t.buyer_fee_cents);
    assert.equal(t.seller_payout_cents, t.item_cents + t.shipping_cents - t.seller_fee_cents);
  }
});
test("totals: rejects bad amounts", () => {
  assert.throws(() => computeOrderTotals(99, 0), /BAD_AMOUNTS/);
  assert.throws(() => computeOrderTotals(1000, -1), /BAD_AMOUNTS/);
  assert.throws(() => computeOrderTotals(10.5, 0), /BAD_AMOUNTS/);
});
test("fee rounding", () => assert.equal(feeCents(1001, 5), 50));
test("state machine", () => {
  assert.ok(canMove("awaiting_payment", "paid"));
  assert.ok(canMove("delivered", "released"));
  assert.ok(!canMove("released", "refunded"));
  assert.ok(!canMove("refunded", "paid"));
  assert.ok(!canMove("awaiting_payment", "released"));
});
test("release needs delivery plus confirm or window", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  assert.ok(!releaseDue({ status: "shipped", delivered_at: null }, now));
  assert.ok(releaseDue({ status: "delivered", delivered_at: "2026-10-19T00:00:00Z", buyer_confirmed: true }, now));
  assert.ok(!releaseDue({ status: "delivered", delivered_at: "2026-10-19T00:00:00Z" }, now));
  assert.ok(releaseDue({ status: "delivered", delivered_at: "2026-10-16T00:00:00Z" }, now));
});

import { stripeForm, cleanReturnBase, checkoutLineItems, sessionExpiresAt, computeOrderTotals as tot } from "../supabase/functions/market-checkout/rules.mjs";

test("stripeForm nests objects and arrays the way Stripe expects", () => {
  const f = stripeForm({ mode: "payment", line_items: [{ quantity: 1, price_data: { unit_amount: 500 } }], metadata: { order_id: "o1" }, skip: null, types: ["card"] });
  assert.equal(f.toString(), "mode=payment&line_items%5B0%5D%5Bquantity%5D=1&line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=500&metadata%5Border_id%5D=o1&types%5B0%5D=card");
});
test("return base keeps origin + path, refuses odd schemes", () => {
  assert.equal(cleanReturnBase("https://plushcrypt.com/?x=1#trade"), "https://plushcrypt.com/");
  assert.equal(cleanReturnBase("http://localhost:8080/index.html"), "http://localhost:8080/index.html");
  assert.equal(cleanReturnBase("capacitor://localhost/"), "capacitor://localhost/");
  assert.equal(cleanReturnBase("javascript:alert(1)"), null);
  assert.equal(cleanReturnBase("http://evil.example/"), null);
  assert.equal(cleanReturnBase("https://a:b@plushcrypt.com/"), null);
});
test("line items add up to the order total", () => {
  const t = tot(4000, 600);
  const items = checkoutLineItems(t, "Jellybun");
  assert.equal(items.reduce((s, i) => s + i.price_data.unit_amount, 0), t.total_cents);
  assert.equal(checkoutLineItems(tot(4000, 0), "x").length, 2);
});
test("session expiry stays inside Stripe's 30 min – 24 h window", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  const s = now.getTime() / 1000;
  assert.equal(sessionExpiresAt("2026-10-20T00:05:00Z", now), s + 31 * 60);
  assert.equal(sessionExpiresAt("2026-10-21T12:00:00Z", now), s + 23.5 * 3600);
  assert.equal(sessionExpiresAt("2026-10-20T06:00:00Z", now), s + 6 * 3600);
});
