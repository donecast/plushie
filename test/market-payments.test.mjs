import test from "node:test";
import assert from "node:assert/strict";
import { computeOrderTotals, canMove, releaseDue, feeCents } from "../supabase/functions/market-checkout/rules.mjs";

test("totals: fees on item only; shipping is the real label cost and pays the label, not the seller", () => {
  const t = computeOrderTotals(4000, 600);
  assert.deepEqual(t, {
    item_cents: 4000, shipping_cents: 600, buyer_fee_cents: 200, seller_fee_cents: 200,
    total_cents: 4800, seller_payout_cents: 3800,
  });
});
test("totals: rounding stays integer and the DB checks hold", () => {
  for (const item of [100, 101, 999, 1234, 3333, 1000000]) {
    const t = computeOrderTotals(item, 475);
    assert.ok(Object.values(t).every(Number.isInteger));
    assert.equal(t.total_cents, t.item_cents + t.shipping_cents + t.buyer_fee_cents);
    assert.equal(t.seller_payout_cents, t.item_cents - t.seller_fee_cents);
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
  assert.ok(releaseDue({ status: "delivered", delivered_at: "2026-10-19T00:00:00Z", buyer_confirmed_at: "2026-10-19T01:00:00Z" }, now));
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

import { validateShipping, cleanAddress, pickRates, orderStatusForTracking, easypostParcel } from "../supabase/functions/market-checkout/rules.mjs";

test("shipping setup is validated", () => {
  assert.equal(validateShipping({ preset: "small", weightOz: 12 }, ["usps_ground"]), null);
  assert.match(validateShipping({ preset: "huge", weightOz: 12 }, ["usps_ground"]), /package/);
  assert.match(validateShipping({ preset: "small", weightOz: 0 }, ["usps_ground"]), /weight/);
  assert.match(validateShipping({ preset: "small", weightOz: 12 }, []), /service/);
  assert.match(validateShipping({ preset: "small", weightOz: 12 }, ["pony_express"]), /Unknown/);
  assert.deepEqual(easypostParcel({ preset: "small", weightOz: 12 }), { length: 8, width: 6, height: 4, weight: 12 });
});
test("addresses are cleaned and checked", () => {
  const ok = cleanAddress({ name: " Bat Ty ", street1: "1 Crypt Ln", city: "Salem", state: "ma", zip: "01970" });
  assert.deepEqual(ok.address, { name: "Bat Ty", street1: "1 Crypt Ln", city: "Salem", state: "MA", zip: "01970", country: "US" });
  assert.match(cleanAddress({ name: "x", street1: "y", city: "z", state: "Mass", zip: "01970" }).error, /2-letter/);
  assert.match(cleanAddress({ name: "x", street1: "y", city: "z", state: "MA", zip: "1970" }).error, /ZIP/);
});
test("buyer sees the cheapest rate per allowed service, cheapest first", () => {
  const rates = [
    { id: "r1", carrier: "USPS", service: "Priority", rate: "9.85", delivery_days: 2 },
    { id: "r2", carrier: "USPS", service: "GroundAdvantage", rate: "5.40", delivery_days: 4 },
    { id: "r3", carrier: "USPS", service: "Express", rate: "31.00" },
    { id: "r4", carrier: "FedExDefault", service: "FEDEX_GROUND", rate: "11.20" },
    { id: "r5", carrier: "USPS", service: "GroundAdvantage", rate: "5.10" },
  ];
  const out = pickRates(rates, ["usps_ground", "usps_priority", "fedex_ground"]);
  assert.deepEqual(out.map((o) => [o.rateId, o.cents]), [["r5", 510], ["r1", 985], ["r4", 1120]]);
  assert.equal(pickRates(rates, ["usps_express"])[0].label, "USPS Priority Mail Express");
});
test("tracking statuses move orders forward only on real scans", () => {
  assert.equal(orderStatusForTracking("pre_transit"), null);
  assert.equal(orderStatusForTracking("in_transit"), "shipped");
  assert.equal(orderStatusForTracking("delivered"), "delivered");
  assert.equal(orderStatusForTracking("return_to_sender"), null);
  assert.ok(canMove("paid", "delivered"));
});

import fs from "node:fs";
test("the two shipping.mjs copies are identical", () => {
  assert.equal(
    fs.readFileSync(new URL("../supabase/functions/market-checkout/shipping.mjs", import.meta.url), "utf8"),
    fs.readFileSync(new URL("../supabase/functions/market-listing/shipping.mjs", import.meta.url), "utf8"));
});

import { splitPayout, SELLER_TERMS_VERSION } from "../supabase/functions/market-checkout/rules.mjs";
test("owed seller fees come out of the next payout first", () => {
  assert.deepEqual(splitPayout(3800, 0), { withheld: 0, transfer: 3800 });
  assert.deepEqual(splitPayout(3800, 200), { withheld: 200, transfer: 3600 });
  assert.deepEqual(splitPayout(150, 200), { withheld: 150, transfer: 0 });   // rest carries to the next sale
  assert.deepEqual(splitPayout(3800, -50), { withheld: 0, transfer: 3800 });  // credit never inflates a payout
});
test("seller terms version is mirrored in data.js", () => {
  const dataJs = fs.readFileSync(new URL("../data.js", import.meta.url), "utf8");
  assert.ok(dataJs.includes(`data.SELLER_TERMS_VERSION = '${SELLER_TERMS_VERSION}'`));
});
