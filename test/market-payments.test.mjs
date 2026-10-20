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
