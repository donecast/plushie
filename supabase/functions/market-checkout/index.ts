// market-checkout — every money move in the For Sale market (db/0107).
//
// FLOW. The buyer pays the PLATFORM through Stripe Checkout (a separate
// charge). The seller's share sits on the platform until the buyer confirms
// the item arrived, then it's transferred to the seller's Stripe Express
// account. That's the payout hold; a refund before release needs no transfer
// reversal.
//
// One function, three kinds of caller:
//   • Signed-in users (Authorization: Bearer <user JWT>), body { action, ... }:
//       config         {}                      → { testMode }  are we on sandbox keys?
//       payouts_setup  { returnBase }          → { url }  Stripe onboarding for the seller (Accounts v2)
//       payouts_status {}                      → { ready, detailsSubmitted, ... }
//       payouts_dashboard {}                   → { url }  seller's Stripe Express dashboard
//       quote          { offerId, address }    → { shipmentId, options[] }  live label rates
//       checkout       { offerId, shipmentId, rateId, returnBase } → { url }  Stripe Checkout
//       label_retry    { orderId }                         seller/admin: buy the label again
//       confirm        { orderId }                         buyer: it arrived → seller is paid now
//       report_problem { orderId, note }                   buyer: holds the payout for an admin
//       refund         { orderId, sellerAtFault? }         seller before shipping, or an admin (any time)
//       release        { orderId }                         admin: pay the seller now
//       ship           { orderId, carrier, tracking }      admin-only fallback (no label)
//       health         {}                                  admin: are Stripe/EasyPost/webhooks OK?
//   • Stripe (?hook=stripe) and EasyPost (?hook=easypost). No signing
//     secrets: we re-fetch each event/tracker by id with our own key, so a
//     forged body can't do anything.
//   • The hourly pg_cron job (?cron=release, db/0108 + db/0113). Auth: Bearer
//     SEND_PUSH_KEY. It retries failed labels, re-reads tracking, refunds
//     orders the seller never shipped (5 days), and pays out orders delivered
//     3+ days ago.
//
// MONEY SAFETY. Every refund and payout first claims the order's new status in
// the database (compare-and-swap), THEN moves money with an idempotency key,
// and puts the status back if Stripe says no. Two callers can never both win.
//
// SHIPPING. The buyer enters their address, sees live EasyPost rates for the
// services the seller allows, and pays exactly that rate. After payment we
// buy the label; the seller prints it. Carrier tracking moves the order to
// shipped/delivered.
//
// The function registers its own Stripe + EasyPost webhooks the first time it
// runs, so there are no webhook secrets to copy.
//
// Deploy with JWT verification OFF (Stripe can't send a Supabase JWT); user
// actions check the JWT themselves, same as market-listing does.
// Secrets: STRIPE_SECRET_KEY, EASYPOST_API_KEY (Supabase → Edge Functions → Secrets).
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  canMove, checkoutLineItems, cleanAddress, cleanProblemNote, cleanReturnBase, computeOrderTotals,
  easypostKeyMode, easypostParcel, MAX_LABEL_OVERAGE_CENTS, orderStatusForTracking, pickRates, problemOpen,
  releaseDue, SELLER_TERMS_VERSION, SHIP_DEADLINE_DAYS, shipDeadlinePassed, sessionExpiresAt, splitPayout,
  statusBeforeDispute, stripeForm, stripeKeyMode, trackingNeedsAttention,
} from "./rules.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SECRET_KEY = Deno.env.get("SEND_PUSH_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const EASYPOST_KEY = Deno.env.get("EASYPOST_API_KEY") ?? "";
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.expired",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (status: number, error: string, message: string) => reply(status, { error, message });

class StripeError extends Error {
  constructor(public status: number, public stripe: any) { super(stripe?.error?.message || `Stripe ${status}`); }
}

// Thin Stripe REST client. Idempotency keys make retried money moves safe.
// The API version is pinned: an unpinned call follows the account's default,
// and a Stripe upgrade once broke checkout that way (payment_method_types was
// removed in 2026-09-30.endive). Bump deliberately, then re-run the sandbox
// end-to-end checks.
const STRIPE_V1_VERSION = "2026-09-30.endive";
async function stripe(method: "GET" | "POST", path: string, params?: Record<string, unknown>, idem?: string) {
  const headers: Record<string, string> = { Authorization: `Bearer ${STRIPE_KEY}`, "Stripe-Version": STRIPE_V1_VERSION };
  let url = `https://api.stripe.com/v1/${path}`;
  let body: string | undefined;
  if (params && method === "GET") url += `?${stripeForm(params)}`;
  else if (params) {
    body = stripeForm(params).toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  if (idem) headers["Idempotency-Key"] = idem;
  const res = await fetch(url, { method, headers, body });
  const json = await res.json();
  if (!res.ok) throw new StripeError(res.status, json);
  return json;
}

// Connected accounts use Stripe's Accounts v2 API (JSON, versioned); new
// platforms can't create v1 accounts. Everything else (Checkout, transfers,
// refunds) is v1 and works with v2 account ids.
const STRIPE_V2_VERSION = "2026-09-30.preview";
async function stripeV2(method: "GET" | "POST", path: string, json?: unknown, idem?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${STRIPE_KEY}`,
    "Stripe-Version": STRIPE_V2_VERSION,
  };
  if (json) headers["Content-Type"] = "application/json";
  if (idem) headers["Idempotency-Key"] = idem;
  const res = await fetch(`https://api.stripe.com/v2/${path}`, { method, headers, body: json ? JSON.stringify(json) : undefined });
  const out = await res.json();
  if (!res.ok) throw new StripeError(res.status, out);
  return out;
}
// EasyPost REST (JSON, key as the basic-auth user).
class EasyPostError extends Error {
  constructor(public status: number, public body: any) { super(body?.error?.message || `EasyPost ${status}`); }
}
async function easypost(method: "GET" | "POST", path: string, json?: unknown) {
  const headers: Record<string, string> = { Authorization: `Basic ${btoa(`${EASYPOST_KEY}:`)}` };
  if (json) headers["Content-Type"] = "application/json";
  const res = await fetch(`https://api.easypost.com/v2/${path}`, { method, headers, body: json ? JSON.stringify(json) : undefined });
  const out = await res.json();
  if (!res.ok) throw new EasyPostError(res.status, out);
  return out;
}

// Stripe-hosted onboarding (single-use URL) for a seller's v2 Account.
const onboardingLink = (account: string, base: string) => stripeV2("POST", "core/account_links", {
  account,
  use_case: {
    type: "account_onboarding",
    account_onboarding: {
      refresh_url: `${base}?mkt=payouts_retry#trade`,
      return_url: `${base}?mkt=payouts_done#trade`,
    },
  },
});
const getAccount = (id: string) => stripeV2("GET", `core/accounts/${id}?include=configuration.recipient`);

const db = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });
const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

async function push(target: string, body: string, actor: string | null, tag: string) {
  const { error } = await db.rpc("_push_send", {
    target, p_title: "🦇 The Plush Crypt", p_body: body, p_url: "./#trade",
    p_tag: tag, p_actor: actor, p_kind: "market_order",
  });
  if (error) console.error("push failed", error.message);   // a missed ping never blocks a payment step
}
// Things a person has to look at go to every admin's inbox + phone.
async function alertAdmins(body: string, orderId: string) {
  console.error("ADMIN ALERT", orderId, body);
  const { error } = await db.rpc("_market_alert_admins", { p_body: body, p_tag: `market-admin-${orderId}` });
  if (error) console.error("admin alert failed", error.message);
}
async function handle(uid: string) {
  const { data } = await db.rpc("_push_handle", { uid });
  return (data as string) || "Someone";
}

// Refresh our copy of a seller's Stripe status from a v2 Account (retrieved
// with include=configuration.recipient). "Ready" = Stripe will accept
// transfers to them and pay them out.
async function syncSeller(acct: any) {
  const caps = acct.configuration?.recipient?.capabilities?.stripe_balance ?? {};
  const transfers = caps.stripe_transfers?.status === "active";
  const payouts = caps.payouts?.status === "active";
  const row = {
    charges_enabled: transfers,
    payouts_enabled: payouts,
    // Onboarding submitted = nothing is blocking the transfers capability.
    details_submitted: transfers || (caps.stripe_transfers?.status_details ?? []).length === 0,
    updated_at: new Date().toISOString(),
  };
  await db.from("market_sellers").update(row).eq("stripe_account_id", acct.id);
  return { ...row, transfers };
}
const sellerReady = (s: { payouts_enabled: boolean; transfers: boolean }) => s.payouts_enabled && s.transfers;

async function getOrder(id: unknown) {
  if (typeof id !== "string") return null;
  const { data } = await db.from("market_orders").select("*").eq("id", id).maybeSingle();
  return data;
}

// Move an order only if it's still where we think it is (guards races and
// replayed webhooks). Returns the updated row, or null if it had moved on.
async function moveOrder(order: any, to: string, extra: Record<string, unknown> = {}) {
  if (!canMove(order.status, to)) return null;
  const { data } = await db.from("market_orders")
    .update({ status: to, updated_at: new Date().toISOString(), ...extra })
    .eq("id", order.id).eq("status", order.status).select().maybeSingle();
  return data;
}

// What a seller currently owes (seller fees from cancelled sales, minus what
// has already been withheld). Positive = owed.
async function sellerOwes(sellerId: string) {
  const { data, error } = await db.from("market_seller_ledger").select("amount_cents").eq("seller_id", sellerId);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum: number, r: any) => sum + r.amount_cents, 0);
}

// Pay the seller, minus anything they owe. The amount is fixed ONCE per order
// (payout_withheld_cents) so a retried release always asks Stripe for the same
// transfer. The order is claimed as "released" before any money moves; if the
// transfer fails the claim is undone. The transfer is tied to the buyer's
// charge (source_transaction), so it works even before those funds settle.
async function release(order: any) {
  if (order.status !== "delivered") return null;
  const { data: seller } = await db.from("market_sellers").select("stripe_account_id").eq("user_id", order.seller_id).single();
  let withheld: number | null = order.payout_withheld_cents;
  if (withheld == null) {
    const want = splitPayout(order.seller_payout_cents, await sellerOwes(order.seller_id)).withheld;
    const { data: fixed } = await db.from("market_orders").update({ payout_withheld_cents: want })
      .eq("id", order.id).is("payout_withheld_cents", null).select("payout_withheld_cents").maybeSingle();
    if (fixed) {
      withheld = want;
      if (want > 0) {
        const { error } = await db.from("market_seller_ledger").insert({
          seller_id: order.seller_id, order_id: order.id, amount_cents: -want, kind: "withheld_from_payout",
          note: "Seller fees owed from a cancelled sale",
        });
        if (error && error.code !== "23505") throw new Error(error.message);
      }
    } else {
      withheld = (await getOrder(order.id))?.payout_withheld_cents ?? 0;
    }
  }
  const moved = await moveOrder(order, "released", {
    released_at: new Date().toISOString(),
    ...(problemOpen(order) ? { problem_resolved_at: new Date().toISOString() } : {}),
  });
  if (!moved) return null;
  const amount = order.seller_payout_cents - (withheld ?? 0);
  try {
    await sendPayout(moved, seller.stripe_account_id, amount, withheld ?? 0);
  } catch (e) {
    await db.from("market_orders").update({ status: "delivered", released_at: null, updated_at: new Date().toISOString() })
      .eq("id", order.id).eq("status", "released").is("stripe_transfer_id", null);
    throw e;
  }
  const name = await listingName(order.listing_id);
  await push(order.seller_id, withheld
    ? `💸 ${dollars(amount)} is on its way to your bank for ${name} (${dollars(withheld)} covered seller fees you owed from a cancelled sale)`
    : `💸 ${dollars(amount)} is on its way to your bank for ${name}`, order.buyer_id, `market-order-${order.id}`);
  return moved;
}
async function sendPayout(order: any, account: string, amount: number, withheld: number) {
  if (amount <= 0) return;
  const transfer = await stripe("POST", "transfers", {
    amount,
    currency: "usd",
    destination: account,
    source_transaction: order.stripe_charge_id,
    transfer_group: order.id,
    metadata: { order_id: order.id, withheld_cents: String(withheld) },
  }, `release-${order.id}`);
  const { error } = await db.from("market_orders").update({ stripe_transfer_id: transfer.id }).eq("id", order.id);
  if (error) throw new Error(error.message);
}

// Refund the buyer in full. The order is claimed as "refunded" first; if
// Stripe refuses, the claim is undone. A seller who was already paid has that
// transfer reversed first. When the SELLER cancels (or never ships), their
// seller fee is still owed (Seller Agreement): it's recorded and withheld from
// their next payout.
async function refund(order: any, why: string) {
  const moved = await moveOrder(order, "refunded", {
    refunded_at: new Date().toISOString(),
    ...(problemOpen(order) ? { problem_resolved_at: new Date().toISOString() } : {}),
  });
  if (!moved) return null;
  try {
    if (order.stripe_transfer_id) {
      await stripe("POST", `transfers/${order.stripe_transfer_id}/reversals`, { metadata: { order_id: order.id } }, `reverse-${order.id}`);
    }
    await stripe("POST", "refunds", { payment_intent: order.stripe_payment_intent, metadata: { order_id: order.id } }, `refund-${order.id}`);
  } catch (e) {
    const already = e instanceof StripeError && e.stripe?.error?.code === "charge_already_refunded";
    if (!already) {
      await db.from("market_orders").update({ status: order.status, refunded_at: null, updated_at: new Date().toISOString() })
        .eq("id", order.id).eq("status", "refunded");
      throw e;
    }
  }
  // An unused label gets its postage back (only before the carrier scans it).
  if (order.label_url && !order.label_refunded && order.status === "paid") {
    try {
      await easypost("POST", `shipments/${order.easypost_shipment_id}/refund`);
      await db.from("market_orders").update({ label_refunded: true }).eq("id", order.id);
    } catch (e) {
      console.error("label refund failed", order.id, e);
      await alertAdmins(`Couldn't get the postage back for a refunded order's unused label — void it in EasyPost.`, order.id);
    }
  }
  if (why === "seller_cancelled" && order.seller_fee_cents > 0) {
    const { error } = await db.from("market_seller_ledger").insert({
      seller_id: order.seller_id, order_id: order.id, amount_cents: order.seller_fee_cents, kind: "cancel_fee",
      note: "Seller fee on a sale the seller cancelled",
    });
    if (error && error.code !== "23505") console.error("cancel fee not recorded", order.id, error.message);
  }
  // The listing comes down (the seller decides whether to relist) — but only
  // if it's still tied to THIS deal, never one that has moved on to someone else.
  await db.from("market_listings").update({ status: "removed", reserved_offer_id: null, reserved_until: null, updated_at: new Date().toISOString() })
    .eq("id", order.listing_id).eq("reserved_offer_id", order.offer_id).in("status", ["sold", "reserved"]);
  return moved;
}

// Money that arrived for something we can't honour (a stale checkout page, a
// cancelled order): send that payment straight back without touching any order.
async function refundPayment(paymentIntent: string, sessionId: string) {
  await stripe("POST", "refunds", { payment_intent: paymentIntent, metadata: { why: "unmatched_payment" } }, `refund-session-${sessionId}`);
}

async function listingName(listingId: string) {
  const { data } = await db.from("market_listings").select("name").eq("id", listingId).maybeSingle();
  return data?.name || "your item";
}

// ─── Stripe → us ────────────────────────────────────────────────────
async function onStripeEvent(req: Request) {
  let claimed: any;
  try { claimed = await req.json(); } catch { return fail(400, "BODY", "Bad body."); }
  if (typeof claimed?.id !== "string" || !claimed.id.startsWith("evt_")) return fail(400, "BODY", "Not an event.");
  let event: any;
  try {
    event = await stripe("GET", `events/${claimed.id}`);
  } catch {
    return fail(400, "UNKNOWN_EVENT", "Stripe doesn't know this event.");
  }

  // Seen it already? (Stripe retries.) Insert first so two deliveries racing
  // can't both act; on failure we delete the marker so the retry runs again.
  const { error: dupErr } = await db.from("stripe_events").insert({ id: event.id, type: event.type });
  if (dupErr) {
    // Only a primary-key clash means "seen it". Any other failure must make
    // Stripe retry, or a paid order would be lost.
    if (dupErr.code === "23505") return reply(200, { ok: true, duplicate: true });
    console.error("stripe_events insert failed", dupErr.message);
    return fail(500, "DB", "Try again.");
  }

  try {
    const obj = event.data.object;
    const paidEvent = event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded";
    if (paidEvent && obj.payment_status === "paid") {
      await onPaid(obj);
    } else if (event.type === "charge.refunded") {
      // A refund made outside the app (Stripe dashboard). Ours are already recorded.
      const order = await orderByIntent(obj.payment_intent);
      if (order && order.status !== "refunded") {
        if (obj.refunded && await moveOrder(order, "refunded", { refunded_at: new Date().toISOString() })) {
          await alertAdmins(order.stripe_transfer_id
            ? "An order was refunded from the Stripe dashboard AFTER the seller was paid — the seller's transfer was not reversed."
            : "An order was refunded from the Stripe dashboard.", order.id);
        } else if (!obj.refunded) {
          await alertAdmins(`A partial refund (${dollars(obj.amount_refunded)}) was made in the Stripe dashboard. The seller's payout is unchanged.`, order.id);
        }
      }
    } else if (event.type === "charge.dispute.created") {
      const order = await orderByIntent(obj.payment_intent);
      if (order && await moveOrder(order, "disputed")) {
        await alertAdmins(`A buyer's bank opened a card dispute (${obj.reason}). The payout is on hold — respond in Stripe before the deadline.`, order.id);
        await push(order.seller_id, `⚠️ The buyer's bank opened a dispute on ${await listingName(order.listing_id)}. Your payout is on hold while it's reviewed.`, null, `market-order-${order.id}`);
      }
    } else if (event.type === "charge.dispute.closed") {
      const order = await orderByIntent(obj.payment_intent);
      if (order?.status === "disputed") {
        if (obj.status === "won" || obj.status === "warning_closed") {
          await moveOrder(order, statusBeforeDispute(order));
          await alertAdmins("A card dispute was closed in our favour. The order is back on its normal path.", order.id);
        } else if (obj.status === "lost") {
          // The bank took the money back from the platform.
          await moveOrder(order, "refunded", { refunded_at: new Date().toISOString() });
          let reversed = false;
          if (order.stripe_transfer_id) {
            try {
              await stripe("POST", `transfers/${order.stripe_transfer_id}/reversals`, { metadata: { order_id: order.id } }, `reverse-${order.id}`);
              reversed = true;
            } catch (e) { console.error("reversal after lost dispute failed", order.id, e); }
          }
          await alertAdmins(!order.stripe_transfer_id
            ? "A card dispute was LOST. The buyer has their money back; the seller was never paid."
            : reversed ? "A card dispute was LOST. The seller's payout was taken back."
            : "A card dispute was LOST and the seller's payout could NOT be taken back — recover it from the seller.", order.id);
        }
      }
    }
    // checkout.session.expired: nothing to undo — the order stays
    // awaiting_payment and the buyer can start a fresh checkout while the hold lasts.
  } catch (e) {
    await db.from("stripe_events").delete().eq("id", event.id);
    console.error("webhook failed", event.type, e);
    return fail(500, "HANDLER", "Try again.");
  }
  return reply(200, { ok: true });
}

// The order a Stripe charge belongs to. Normally found by the payment intent we
// stored when it was paid; if that hasn't been recorded yet (events can arrive
// out of order), fall back to the order id we stamped on the payment itself.
async function orderByIntent(pi: unknown) {
  if (typeof pi !== "string") return null;
  const { data } = await db.from("market_orders").select("*").eq("stripe_payment_intent", pi).maybeSingle();
  if (data) return data;
  const intent = await stripe("GET", `payment_intents/${pi}`);
  const order = await getOrder(intent.metadata?.order_id);
  if (!order) return null;
  // The order was paid by a DIFFERENT payment: this one is a stray (an
  // out-of-date checkout page we already refunded) and must not touch it.
  if (order.stripe_payment_intent && order.stripe_payment_intent !== pi) return null;
  // Paid at Stripe but not recorded here yet: fail this delivery so Stripe
  // sends the event again once the payment has been recorded.
  if (order.status === "awaiting_payment") {
    const session = order.stripe_session_id ? await stripe("GET", `checkout/sessions/${order.stripe_session_id}`) : null;
    if (session?.payment_intent === pi) throw new Error("payment not recorded yet — retry");
    return null;   // a stray payment on an order that's still waiting for its real one
  }
  return order;
}

async function onPaid(session: any) {
  let order = await getOrder(session.metadata?.order_id);
  if (!order) return;
  // Only the checkout page we last issued, for exactly what the order costs,
  // can pay for it. Anything else (an older page left open with a different
  // shipping choice, a payment that lands after the hold was cancelled) goes
  // straight back to the buyer.
  const sameSession = order.stripe_session_id === session.id;
  if (sameSession && !["awaiting_payment", "paid", "cancelled"].includes(order.status)) return;   // handled long ago
  if (!sameSession || order.total_cents !== session.amount_total || order.status === "cancelled") {
    await refundPayment(session.payment_intent, session.id);
    await push(order.buyer_id, "That checkout page was out of date, so your payment was refunded in full. If the item is still available you can check out again.", null, `market-order-${order.id}`);
    await alertAdmins("A payment arrived on an out-of-date checkout page and was refunded automatically.", order.id);
    return;
  }
  if (order.status === "awaiting_payment") {
    const pi = await stripe("GET", `payment_intents/${session.payment_intent}`);
    // ship_to was set at checkout from the verified EasyPost address.
    order = await moveOrder(order, "paid", {
      stripe_payment_intent: session.payment_intent,
      stripe_charge_id: pi.latest_charge,
      paid_at: new Date().toISOString(),
    }) ?? await getOrder(order.id);
  }
  // From here on every step is safe to repeat, so a retried webhook finishes
  // whatever an earlier attempt didn't.
  if (order.status !== "paid") return;

  // Mark the listing sold — but only if it's still held for THIS deal. If the
  // hold somehow went to someone else, the buyer gets their money back.
  const { data: listing } = await db.from("market_listings").select("id, name, status, reserved_offer_id").eq("id", order.listing_id).single();
  const mine = listing.reserved_offer_id === order.offer_id;
  if (mine && listing.status === "reserved") {
    await db.from("market_listings").update({ status: "sold", updated_at: new Date().toISOString() })
      .eq("id", listing.id).eq("status", "reserved").eq("reserved_offer_id", order.offer_id);
  } else if (!(mine && listing.status === "sold")) {
    await refund(order, "listing_no_longer_held");
    await push(order.buyer_id, "That item was no longer available, so your payment was refunded in full.", null, `market-order-${order.id}`);
    return;
  }
  // Close any other pending offers on it.
  await db.from("market_offers").update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("listing_id", order.listing_id).eq("status", "pending");
  const labelled = await buyLabel(order);
  await push(order.seller_id, labelled
    ? `💰 ${await handle(order.buyer_id)} paid for ${listing.name} — your shipping label is ready to print. Ship within ${SHIP_DEADLINE_DAYS} days.`
    : `💰 ${await handle(order.buyer_id)} paid for ${listing.name} — we're getting your shipping label`, order.buyer_id, `market-order-${order.id}`);
}

// Buy the label the buyer paid for. If a purchase already went through (a
// retry after a half-finished attempt) we adopt that label. If that exact rate
// has gone stale, re-rate and take the same service (the platform absorbs a
// small difference). On failure the error is kept on the order, an admin is
// told the first time, and the hourly job keeps retrying.
async function buyLabel(order: any): Promise<boolean> {
  if (order.label_url) return true;
  try {
    let bought: any;
    try {
      bought = await easypost("POST", `shipments/${order.easypost_shipment_id}/buy`, { rate: { id: order.easypost_rate_id } });
    } catch (e) {
      if (!(e instanceof EasyPostError) || e.status >= 500) throw e;
      const current = await easypost("GET", `shipments/${order.easypost_shipment_id}`);
      if (current.postage_label?.label_url) {
        bought = current;
      } else {
        const rerated = await easypost("POST", `shipments/${order.easypost_shipment_id}/rerate`);
        const same = pickRates(rerated.rates, [order.ship_service])[0];
        if (!same || same.cents > order.shipping_cents + MAX_LABEL_OVERAGE_CENTS) throw e;
        bought = await easypost("POST", `shipments/${order.easypost_shipment_id}/buy`, { rate: { id: same.rateId } });
      }
    }
    const { error } = await db.from("market_orders").update({
      label_url: bought.postage_label?.label_url ?? null,
      tracking_number: bought.tracking_code ?? null,
      tracking_carrier: bought.selected_rate?.carrier ?? null,
      easypost_tracker_id: bought.tracker?.id ?? null,
      tracking_status: bought.tracker?.status ?? "pre_transit",
      label_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", order.id);
    if (error) throw new Error(error.message);
    return !!bought.postage_label?.label_url;
  } catch (e) {
    console.error("label purchase failed", order.id, e);
    const message = String((e as Error).message || e).slice(0, 300);
    await db.from("market_orders").update({ label_error: message }).eq("id", order.id);
    if (!order.label_error) await alertAdmins(`Couldn't buy the shipping label for a paid order: ${message}`, order.id);
    return false;
  }
}

// ─── EasyPost → us (tracking) ───────────────────────────────────────
async function onEasyPostEvent(req: Request) {
  let claimed: any;
  try { claimed = await req.json(); } catch { return fail(400, "BODY", "Bad body."); }
  const trackerId = claimed?.result?.object === "Tracker" ? claimed.result.id : null;
  if (typeof trackerId !== "string" || !trackerId.startsWith("trk_")) return reply(200, { ok: true, ignored: true });
  // Trust only what EasyPost tells us directly.
  let tracker: any;
  try { tracker = await easypost("GET", `trackers/${trackerId}`); } catch { return fail(400, "UNKNOWN_TRACKER", "EasyPost doesn't know this tracker."); }
  const { data: order } = await db.from("market_orders").select("*").eq("easypost_tracker_id", tracker.id).maybeSingle();
  if (!order) return reply(200, { ok: true, ignored: true });
  await applyTracking(order, tracker.status);
  return reply(200, { ok: true });
}

async function applyTracking(order: any, status: string) {
  if (order.tracking_status !== status) {
    await db.from("market_orders").update({ tracking_status: status, updated_at: new Date().toISOString() }).eq("id", order.id);
    order = { ...order, tracking_status: status };
    if (trackingNeedsAttention(status)) {
      await alertAdmins(`The carrier reports "${status.replaceAll("_", " ")}" for an order's package. The payout won't happen on its own — refund the buyer or pay the seller.`, order.id);
    }
  }
  const to = orderStatusForTracking(status);
  const now = new Date().toISOString();
  if (to === "shipped" && order.status === "paid") {
    if (await moveOrder(order, "shipped", { shipped_at: now })) {
      await push(order.buyer_id, `📦 ${await listingName(order.listing_id)} is on its way (${order.tracking_carrier ?? ""} ${order.tracking_number ?? ""}).`, null, `market-order-${order.id}`);
    }
  } else if (to === "delivered" && (order.status === "paid" || order.status === "shipped")) {
    if (await moveOrder(order, "delivered", { delivered_at: now, shipped_at: order.shipped_at ?? now })) {
      await push(order.buyer_id, `📬 ${await listingName(order.listing_id)} was delivered. Something wrong? Tell us within 3 days — otherwise the seller is paid.`, null, `market-order-${order.id}`);
      await push(order.seller_id, `📬 ${await listingName(order.listing_id)} was delivered — you're paid in 3 days unless the buyer reports a problem.`, null, `market-order-${order.id}`);
    }
  }
}

// The hourly job. Each order is handled on its own so one failure can't block
// the rest.
async function sweep() {
  const out = { labels: 0, tracked: 0, unshipped_refunded: 0, released: 0, repaired: 0, failed: 0 };
  const each = async (rows: any[] | null, what: string, fn: (o: any) => Promise<void>) => {
    for (const o of rows ?? []) {
      try { await fn(o); } catch (e) { out.failed++; console.error(`${what} failed`, o.id, e); }
    }
  };

  // 1. Paid orders: get a label if one is missing; refund if the seller never shipped.
  const { data: paid } = await db.from("market_orders").select("*").eq("status", "paid");
  await each(paid, "paid sweep", async (o) => {
    // Finish a payment whose webhook died half-way: the listing must read sold.
    await db.from("market_listings").update({ status: "sold", updated_at: new Date().toISOString() })
      .eq("id", o.listing_id).eq("status", "reserved").eq("reserved_offer_id", o.offer_id);
    if (!o.label_url) {
      if (await buyLabel(o)) {
        out.labels++;
        await push(o.seller_id, `🏷️ Your shipping label for ${await listingName(o.listing_id)} is ready to print.`, null, `market-order-${o.id}`);
        return;
      }
    }
    if (shipDeadlinePassed(o)) {
      // No label through our own fault is never the seller's fee.
      if (await refund(o, o.label_url ? "seller_cancelled" : "label_failed")) {
        out.unshipped_refunded++;
        const name = await listingName(o.listing_id);
        await push(o.buyer_id, `${name} wasn't shipped within ${SHIP_DEADLINE_DAYS} days, so your payment was refunded in full.`, null, `market-order-${o.id}`);
        await push(o.seller_id, o.label_url
          ? `${name} wasn't shipped within ${SHIP_DEADLINE_DAYS} days, so the sale was cancelled and the buyer refunded. Your seller fee still applies.`
          : `The sale of ${name} was cancelled and the buyer refunded because we couldn't get a shipping label. You owe nothing.`, null, `market-order-${o.id}`);
      }
    }
  });

  // 2. Tracking we may have missed (webhooks aren't guaranteed).
  const { data: moving } = await db.from("market_orders").select("*").in("status", ["paid", "shipped"]).not("easypost_tracker_id", "is", null);
  await each(moving, "tracking sweep", async (o) => {
    const tracker = await easypost("GET", `trackers/${o.easypost_tracker_id}`);
    if (tracker.status && tracker.status !== o.tracking_status) { await applyTracking(o, tracker.status); out.tracked++; }
  });

  // 3. Pay out every order whose 3-day window after delivery has passed.
  const { data: delivered } = await db.from("market_orders").select("*").eq("status", "delivered");
  await each(delivered, "auto-release", async (o) => {
    if (releaseDue(o) && await release(o)) out.released++;
  });

  // 4. A payout that was claimed but never sent (the function died mid-way).
  const { data: unsent } = await db.from("market_orders").select("*").eq("status", "released").is("stripe_transfer_id", null);
  await each(unsent, "payout repair", async (o) => {
    const amount = o.seller_payout_cents - (o.payout_withheld_cents ?? 0);
    if (amount <= 0) return;
    const { data: seller } = await db.from("market_sellers").select("stripe_account_id").eq("user_id", o.seller_id).single();
    await sendPayout(o, seller.stripe_account_id, amount, o.payout_withheld_cents ?? 0);
    out.repaired++;
  });
  if (out.failed) console.error("sweep had failures", JSON.stringify(out));
  return out;
}

// Make sure Stripe knows where to send payment events. Idempotent; runs once
// per cold start. Endpoints are told apart by their description.
const HOOK_URL = `${SUPABASE_URL}/functions/v1/market-checkout?hook=stripe`;
let hooksReady: Promise<void> | null = null;
function ensureWebhooks() {
  hooksReady ??= (async () => {
    const existing = (await stripe("GET", "webhook_endpoints", { limit: 100 })).data
      .filter((w: any) => w.url === HOOK_URL && w.status === "enabled");
    // Seller status isn't pushed to us; it's re-read from Stripe on return
    // from onboarding and before every checkout.
    const wanted = [
      { description: "Plush Crypt market: payments", enabled_events: WEBHOOK_EVENTS },
    ];
    for (const w of wanted) {
      const have = existing.find((e: any) => e.description === w.description);
      if (!have) await stripe("POST", "webhook_endpoints", { url: HOOK_URL, ...w });
      else if (w.enabled_events.some((ev) => !have.enabled_events.includes(ev))) {
        await stripe("POST", `webhook_endpoints/${have.id}`, { enabled_events: w.enabled_events });
      }
    }
    const epUrl = `${SUPABASE_URL}/functions/v1/market-checkout?hook=easypost`;
    const epHooks = (await easypost("GET", "webhooks")).webhooks ?? [];
    if (!epHooks.some((h: any) => h.url === epUrl && !h.disabled_at)) {
      await easypost("POST", "webhooks", { webhook: { url: epUrl } });
    }
  })().catch((e) => { hooksReady = null; throw e; });
  return hooksReady;
}

// ─── Users → us ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "METHOD", "POST only.");
  if (!STRIPE_KEY) return fail(503, "NO_STRIPE_KEY", "Payments aren't configured (STRIPE_SECRET_KEY missing).");
  if (!EASYPOST_KEY) return fail(503, "NO_EASYPOST_KEY", "Shipping isn't configured (EASYPOST_API_KEY missing).");

  try {
    const params = new URL(req.url).searchParams;
    if (params.get("cron") === "release") {
      if ((req.headers.get("Authorization") || "") !== `Bearer ${SECRET_KEY}`) return fail(401, "AUTH", "Nope.");
      return reply(200, { ok: true, ...(await sweep()) });
    }
    await ensureWebhooks();
    if (params.get("hook") === "stripe") return await onStripeEvent(req);
    if (params.get("hook") === "easypost") return await onEasyPostEvent(req);
    return await onUser(req);
  } catch (e) {
    if (e instanceof StripeError) {
      console.error("stripe error", e.status, JSON.stringify(e.stripe));
      return fail(502, "STRIPE", e.message);
    }
    if (e instanceof EasyPostError) {
      console.error("easypost error", e.status, JSON.stringify(e.body));
      return fail(502, "SHIPPING", e.message);
    }
    console.error(e);
    return fail(500, "SERVER", String((e as Error).message || e));
  }
});

// An accepted offer the caller is the buyer on, still held, with a seller who
// can be paid. Returns { offer, listing } or the Response to send back.
async function loadDeal(uid: string, offerId: unknown): Promise<{ offer: any; listing: any } | Response> {
  const { data: offer } = await db.from("market_offers").select("*").eq("id", typeof offerId === "string" ? offerId : "").maybeSingle();
  if (!offer || offer.buyer_id !== uid) return fail(404, "OFFER", "That deal isn't yours.");
  if (offer.status !== "accepted") return fail(409, "OFFER_NOT_ACCEPTED", "That offer hasn't been accepted.");
  const { data: listing } = await db.from("market_listings").select("*").eq("id", offer.listing_id).single();
  const holdLive = listing.status === "reserved" && listing.reserved_offer_id === offer.id &&
    listing.reserved_until && new Date(listing.reserved_until) > new Date();
  if (!holdLive) return fail(409, "HOLD_ENDED", "The 48-hour hold on this deal has ended.");
  const { data: seller } = await db.from("market_sellers").select("*").eq("user_id", listing.seller_id).maybeSingle();
  const ready = seller ? sellerReady(await syncSeller(await getAccount(seller.stripe_account_id))) : false;
  if (!ready) {
    await push(listing.seller_id, `${await handle(uid)} is trying to pay for ${listing.name} — set up payouts in For Sale so they can`, uid, `market-payouts-${listing.seller_id}`);
    return fail(409, "SELLER_NOT_READY", "The seller hasn't finished setting up payouts yet. We've nudged them.");
  }
  return { offer, listing };
}

async function onUser(req: Request) {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userData?.user) return fail(401, "AUTH", "Sign in again.");
  const user = userData.user;
  const uid = user.id;

  const { data: allowed, error: gateErr } = await db.rpc("market_allowed", { p_uid: uid });
  if (gateErr) return fail(500, "GATE", gateErr.message);
  if (!allowed) return fail(403, "MARKET_NOT_ENABLED", "The market isn't open to your account yet.");

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail(400, "BODY", "Bad request body."); }

  const isAdmin = async () => !!(await db.from("profiles").select("is_admin").eq("id", uid).single()).data?.is_admin;

  switch (body.action) {
    case "config":
      return reply(200, { testMode: stripeKeyMode(STRIPE_KEY) === "test" || easypostKeyMode(EASYPOST_KEY) === "test" });

    case "health": {
      if (!(await isAdmin())) return fail(403, "ADMIN", "Admins only.");
      const check = async (fn: () => Promise<unknown>) => {
        try { await fn(); return { ok: true }; } catch (e) { return { ok: false, message: String((e as Error).message || e).slice(0, 200) }; }
      };
      const [s, ep, hook] = await Promise.all([
        check(() => stripeV2("GET", "core/accounts?limit=1")),
        check(() => easypost("GET", "webhooks")),
        check(async () => {
          const hooks = (await stripe("GET", "webhook_endpoints", { limit: 100 })).data;
          if (!hooks.some((w: any) => w.url === HOOK_URL && w.status === "enabled")) throw new Error("Stripe isn't set to notify us of payments.");
        }),
      ]);
      return reply(200, {
        stripe: { ...s, mode: stripeKeyMode(STRIPE_KEY) },
        easypost: { ...ep, mode: easypostKeyMode(EASYPOST_KEY) },
        webhook: hook,
      });
    }

    case "payouts_setup": {
      const base = cleanReturnBase(body.returnBase);
      if (!base) return fail(400, "RETURN_URL", "Bad return address.");
      const { data: terms } = await db.from("market_seller_terms").select("user_id")
        .eq("user_id", uid).eq("version", SELLER_TERMS_VERSION).maybeSingle();
      if (!terms) return fail(403, "SELLER_TERMS", "Accept the Seller Agreement first.");
      let { data: seller } = await db.from("market_sellers").select("*").eq("user_id", uid).maybeSingle();
      if (!seller) {
        // Marketplace seller: recipient config (receives transfers), Express
        // dashboard, platform carries fees + losses (required for this shape).
        const acct = await stripeV2("POST", "core/accounts", {
          contact_email: user.email,
          display_name: (await handle(uid)).replace(/^@/, "") || "Plush Crypt seller",
          dashboard: "express",
          identity: { country: "us" },
          defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" } },
          configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
          metadata: { user_id: uid },
        }, `acct2-${uid}`);
        const { data: inserted, error } = await db.from("market_sellers")
          .insert({ user_id: uid, stripe_account_id: acct.id }).select().single();
        if (error) return fail(500, "DB", error.message);
        seller = inserted;
      }
      const link = await onboardingLink(seller.stripe_account_id, base);
      return reply(200, { url: link.url });
    }

    case "payouts_status": {
      const { data: seller } = await db.from("market_sellers").select("*").eq("user_id", uid).maybeSingle();
      if (!seller) return reply(200, { started: false, ready: false });
      const s = await syncSeller(await getAccount(seller.stripe_account_id));
      return reply(200, { started: true, ready: sellerReady(s), detailsSubmitted: s.details_submitted });
    }

    case "payouts_dashboard": {
      const { data: seller } = await db.from("market_sellers").select("*").eq("user_id", uid).maybeSingle();
      if (!seller) return fail(404, "NO_PAYOUTS", "Set up payouts first.");
      const link = await stripe("POST", `accounts/${seller.stripe_account_id}/login_links`);
      return reply(200, { url: link.url });
    }

    case "quote": {
      const deal = await loadDeal(uid, body.offerId);
      if (deal instanceof Response) return deal;
      const { offer, listing } = deal;
      const to = cleanAddress(body.address);
      if (to.error) return fail(400, "ADDRESS", to.error);
      const { data: from } = await db.from("market_ship_from").select("*").eq("user_id", listing.seller_id).maybeSingle();
      if (!from || !listing.parcel || !listing.ship_services?.length) {
        return fail(409, "NO_SHIPPING", "The seller hasn't set up shipping for this listing.");
      }
      // Make sure the address is deliverable before showing rates.
      const addr = await easypost("POST", "addresses", { address: to.address, verify: ["delivery"] });
      if (addr.verifications?.delivery && !addr.verifications.delivery.success) {
        const why = addr.verifications.delivery.errors?.[0]?.message;
        return fail(400, "ADDRESS", why ? `We couldn't verify that address: ${why}` : "We couldn't verify that address.");
      }
      const shipment = await easypost("POST", "shipments", { shipment: {
        reference: offer.id,           // checkout only accepts a shipment made for this deal
        from_address: { name: from.name, street1: from.street1, street2: from.street2, city: from.city, state: from.state, zip: from.zip, country: "US" },
        to_address: { id: addr.id },
        parcel: easypostParcel(listing.parcel),
      } });
      const options = pickRates(shipment.rates, listing.ship_services);
      if (!options.length) return fail(409, "NO_RATES", "None of the seller's shipping options can reach that address.");
      return reply(200, { shipmentId: shipment.id, options });
    }

    case "checkout": {
      const base = cleanReturnBase(body.returnBase);
      if (!base) return fail(400, "RETURN_URL", "Bad return address.");
      const deal = await loadDeal(uid, body.offerId);
      if (deal instanceof Response) return deal;
      const { offer, listing } = deal;

      // The rate must come from a shipment we quoted for THIS deal, for a
      // service the seller allows. Price comes from EasyPost, never the client.
      if (typeof body.shipmentId !== "string" || !body.shipmentId.startsWith("shp_")) return fail(400, "SHIPPING", "Pick a shipping option.");
      const shipment = await easypost("GET", `shipments/${body.shipmentId}`);
      if (shipment.reference !== offer.id) return fail(400, "SHIPPING", "That shipping quote isn't for this deal.");
      const choice = pickRates(shipment.rates.filter((r: any) => r.id === body.rateId), listing.ship_services)[0];
      if (!choice) return fail(400, "SHIPPING", "That shipping option isn't available — get rates again.");
      const t = shipment.to_address;
      const shipTo = { name: t.name, line1: t.street1, line2: t.street2, city: t.city, state: t.state, postal_code: t.zip, country: t.country };

      // One live order per deal. A buyer who changes address or service
      // before paying gets the same order with new numbers.
      let { data: order } = await db.from("market_orders").select("*")
        .eq("offer_id", offer.id).not("status", "in", "(cancelled,refunded)").maybeSingle();
      if (order && order.status !== "awaiting_payment") return fail(409, "ALREADY_PAID", "You've already paid for this.");
      if (order?.stripe_session_id) {
        const old = await stripe("GET", `checkout/sessions/${order.stripe_session_id}`);
        if (old.status === "complete") return fail(409, "ALREADY_PAID", "You've already paid — it'll show up in a moment.");
        if (old.status === "open") await stripe("POST", `checkout/sessions/${old.id}/expire`);
      }
      const totals = computeOrderTotals(offer.amount_cents, choice.cents);
      const fields = {
        ...totals, ship_to: shipTo, ship_service: choice.key,
        easypost_shipment_id: shipment.id, easypost_rate_id: choice.rateId,
        stripe_session_id: null, updated_at: new Date().toISOString(),
      };
      if (order) {
        const { data: updated, error } = await db.from("market_orders").update(fields)
          .eq("id", order.id).eq("status", "awaiting_payment").select().single();
        if (error) return fail(500, "DB", error.message);
        order = updated;
      } else {
        const { data: inserted, error } = await db.from("market_orders").insert({
          listing_id: listing.id, offer_id: offer.id, buyer_id: uid, seller_id: listing.seller_id, ...fields,
        }).select().single();
        if (error) return fail(500, "DB", error.message);
        order = inserted;
      }

      const expiresAt = sessionExpiresAt(listing.reserved_until);
      const session = await stripe("POST", "checkout/sessions", {
        mode: "payment",
        // Cards only (incl. Apple/Google Pay). Bank debits take days to clear —
        // longer than the hold on the item — so they're not offered.
        allowed_payment_method_types: ["card"],
        line_items: checkoutLineItems({ ...order, shipping_label: choice.label }, listing.name),
        customer_email: user.email,
        client_reference_id: order.id,
        expires_at: expiresAt,
        metadata: { order_id: order.id },
        payment_intent_data: { transfer_group: order.id, metadata: { order_id: order.id } },
        success_url: `${base}?mkt=paid#trade`,
        cancel_url: `${base}?mkt=pay_cancelled#trade`,
      });
      await db.from("market_orders").update({ stripe_session_id: session.id, updated_at: new Date().toISOString() }).eq("id", order.id);
      // The buyer is mid-payment: keep the hold alive at least as long as the page.
      const pageEnds = new Date((expiresAt + 300) * 1000);
      if (pageEnds > new Date(listing.reserved_until)) {
        await db.from("market_listings").update({ reserved_until: pageEnds.toISOString() }).eq("id", listing.id);
      }
      return reply(200, { url: session.url, orderId: order.id });
    }

    case "label_retry": {
      const order = await getOrder(body.orderId);
      if (!order) return fail(404, "ORDER", "Order not found.");
      if (order.seller_id !== uid && !(await isAdmin())) return fail(403, "ORDER", "Not your order.");
      if (order.status !== "paid") return fail(409, "ORDER_STATE", "This order doesn't need a label.");
      const ok = await buyLabel(order);
      return ok ? reply(200, { ok: true }) : fail(502, "SHIPPING", "The label still couldn't be bought. We've been told and will sort it out.");
    }

    case "ship": {
      // Admin-only fallback for an order that shipped without our label.
      const order = await getOrder(body.orderId);
      if (!order) return fail(404, "ORDER", "Order not found.");
      if (!(await isAdmin())) return fail(403, "ADMIN", "Shipping is marked automatically from the label's tracking.");
      const carrier = String(body.carrier ?? "").trim().slice(0, 40);
      const tracking = String(body.tracking ?? "").trim().slice(0, 80);
      if (!carrier || !tracking) return fail(400, "TRACKING", "Add the carrier and tracking number.");
      const moved = await moveOrder(order, "shipped", {
        tracking_carrier: carrier, tracking_number: tracking, shipped_at: new Date().toISOString(),
      });
      if (!moved) return fail(409, "ORDER_STATE", "This order can't be marked shipped right now.");
      await push(order.buyer_id, `📦 ${await listingName(order.listing_id)} shipped (${carrier} ${tracking}). Tap "It arrived" when you have it.`, uid, `market-order-${order.id}`);
      return reply(200, { ok: true });
    }

    case "confirm": {
      // The buyer says it arrived and it's fine: the seller is paid now. This
      // also closes any problem the buyer had reported.
      let order = await getOrder(body.orderId);
      if (!order || order.buyer_id !== uid) return fail(404, "ORDER", "Order not found.");
      const now = new Date().toISOString();
      if (order.status === "shipped" || order.status === "paid") {
        order = await moveOrder(order, "delivered", { delivered_at: now, shipped_at: order.shipped_at ?? now });
        if (!order) return fail(409, "ORDER_STATE", "This order can't be confirmed right now.");
      }
      if (order.status !== "delivered") return fail(409, "ORDER_STATE", "This order can't be confirmed right now.");
      const stamp: Record<string, string> = {};
      if (!order.buyer_confirmed_at) stamp.buyer_confirmed_at = now;
      if (problemOpen(order)) stamp.problem_resolved_at = now;
      if (Object.keys(stamp).length) {
        const { error } = await db.from("market_orders").update(stamp).eq("id", order.id);
        if (error) return fail(500, "DB", error.message);
        order = { ...order, ...stamp };
      }
      await release(order);
      return reply(200, { ok: true });
    }

    case "report_problem": {
      const order = await getOrder(body.orderId);
      if (!order || order.buyer_id !== uid) return fail(404, "ORDER", "Order not found.");
      if (!["shipped", "delivered"].includes(order.status)) {
        return fail(409, "ORDER_STATE", order.status === "released"
          ? "The seller has already been paid for this order. Message us and we'll help."
          : "You can report a problem once the item has shipped.");
      }
      const cleaned = cleanProblemNote(body.note);
      if (cleaned.error) return fail(400, "INVALID", cleaned.error);
      // Only lands if the order is still unpaid-out, so it can't race a payout.
      const { data: held } = await db.from("market_orders")
        .update({ problem_reported_at: new Date().toISOString(), problem_note: cleaned.note, problem_resolved_at: null, updated_at: new Date().toISOString() })
        .eq("id", order.id).in("status", ["shipped", "delivered"]).select("id").maybeSingle();
      if (!held) return fail(409, "ORDER_STATE", "The seller has already been paid for this order. Message us and we'll help.");
      const name = await listingName(order.listing_id);
      await alertAdmins(`${await handle(uid)} reported a problem with ${name}: "${cleaned.note!.slice(0, 140)}". The payout is on hold until you refund the buyer or pay the seller.`, order.id);
      await push(order.seller_id, `⚠️ The buyer reported a problem with ${name}. Your payout is on hold while we look into it.`, uid, `market-order-${order.id}`);
      return reply(200, { ok: true });
    }

    case "release": {
      // Admin: pay the seller now (settles a reported problem in their favour).
      if (!(await isAdmin())) return fail(403, "ADMIN", "Admins only.");
      let order = await getOrder(body.orderId);
      if (!order) return fail(404, "ORDER", "Order not found.");
      const now = new Date().toISOString();
      if (order.status === "shipped") order = await moveOrder(order, "delivered", { delivered_at: now });
      if (!order || order.status !== "delivered") return fail(409, "ORDER_STATE", "Only a shipped or delivered order can be paid out.");
      const paid = await release(order);
      if (!paid) return fail(409, "ORDER_STATE", "This order was just changed by something else — reload and check it.");
      if (problemOpen(order)) await push(order.buyer_id, `We reviewed the problem you reported with ${await listingName(order.listing_id)} and released the payment to the seller.`, uid, `market-order-${order.id}`);
      return reply(200, { ok: true });
    }

    case "refund": {
      const order = await getOrder(body.orderId);
      if (!order) return fail(404, "ORDER", "Order not found.");
      const admin = await isAdmin();
      const sellerCanRefund = order.seller_id === uid && order.status === "paid";
      const adminCanRefund = admin && canMove(order.status, "refunded");
      if (!sellerCanRefund && !adminCanRefund) return fail(403, "REFUND", "You can't refund this order.");
      // An admin refund only charges the seller's fee when the admin says the
      // seller was at fault (body.sellerAtFault).
      const why = order.seller_id === uid || (adminCanRefund && body.sellerAtFault === true) ? "seller_cancelled" : "admin";
      const done = await refund(order, why);
      if (!done) return fail(409, "ORDER_STATE", "This order was just changed by something else — reload and check it.");
      await push(order.buyer_id, `Your payment for ${await listingName(order.listing_id)} was refunded in full.`, uid, `market-order-${order.id}`);
      if (order.seller_id !== uid) await push(order.seller_id, `The sale of ${await listingName(order.listing_id)} was refunded to the buyer.`, uid, `market-order-${order.id}`);
      return reply(200, { ok: true });
    }

  }
  return fail(400, "ACTION", "Unknown action.");
}
