// market-checkout — every money move in the For Sale market (db/0107).
//
// FLOW. The buyer pays the PLATFORM through Stripe Checkout (a separate
// charge). The seller's share sits on the platform until the buyer confirms
// the item arrived, then it's transferred to the seller's Stripe Express
// account. That's the payout hold; a refund before release needs no transfer
// reversal.
//
// One function, two kinds of caller:
//   • Signed-in users (Authorization: Bearer <user JWT>), body { action, ... }:
//       payouts_setup  { returnBase }          → { url }  Stripe onboarding for the seller (Accounts v2)
//       payouts_status {}                      → { ready, detailsSubmitted, ... }
//       payouts_dashboard {}                   → { url }  seller's Stripe Express dashboard
//       checkout       { offerId, returnBase } → { url }  Stripe Checkout for an accepted offer
//       ship           { orderId, carrier, tracking }      seller marks it shipped
//       confirm        { orderId }                         buyer: it arrived → seller is paid
//       refund         { orderId }                         seller before shipping, or an admin
//   • Stripe (?hook=stripe). No signing secret: we re-fetch the event from
//     Stripe by id with our own key, so a forged body can't do anything.
//
// The function registers its own Stripe webhook the first time it runs, so
// there's no webhook secret to copy.
//
// Deploy with JWT verification OFF (Stripe can't send a Supabase JWT); user
// actions check the JWT themselves, same as market-listing does.
// Secrets: STRIPE_SECRET_KEY (set in Supabase → Edge Functions → Secrets).
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  canMove, checkoutLineItems, cleanReturnBase, computeOrderTotals, sessionExpiresAt, stripeForm,
} from "./rules.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SECRET_KEY = Deno.env.get("SEND_PUSH_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.expired",
  "charge.refunded",
  "charge.dispute.created",
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
async function stripe(method: "GET" | "POST", path: string, params?: Record<string, unknown>, idem?: string) {
  const headers: Record<string, string> = { Authorization: `Bearer ${STRIPE_KEY}` };
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

// Pay the seller. The transfer is tied to the buyer's charge
// (source_transaction), so it works even before those funds settle.
async function release(order: any) {
  const { data: seller } = await db.from("market_sellers").select("stripe_account_id").eq("user_id", order.seller_id).single();
  const transfer = await stripe("POST", "transfers", {
    amount: order.seller_payout_cents,
    currency: "usd",
    destination: seller.stripe_account_id,
    source_transaction: order.stripe_charge_id,
    transfer_group: order.id,
    metadata: { order_id: order.id },
  }, `release-${order.id}`);
  const moved = await moveOrder(order, "released", {
    stripe_transfer_id: transfer.id, released_at: new Date().toISOString(),
  });
  if (moved) await push(order.seller_id, `💸 ${dollars(order.seller_payout_cents)} is on its way to your bank for ${await listingName(order.listing_id)}`, order.buyer_id, `market-order-${order.id}`);
  return moved;
}

async function refund(order: any, why: string) {
  await stripe("POST", "refunds", {
    payment_intent: order.stripe_payment_intent,
    metadata: { order_id: order.id, why },
  }, `refund-${order.id}`);
  const moved = await moveOrder(order, "refunded", { refunded_at: new Date().toISOString() });
  // The listing comes down: the seller decides whether to relist.
  await db.from("market_listings").update({ status: "removed", reserved_offer_id: null, reserved_until: null, updated_at: new Date().toISOString() })
    .eq("id", order.listing_id).in("status", ["sold", "reserved"]);
  return moved;
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
  // Events that belong to a connected account carry its id; fetch them there.
  const acctHeader = typeof claimed.account === "string" ? claimed.account : null;
  let event: any;
  try {
    event = acctHeader
      ? await fetch(`https://api.stripe.com/v1/events/${claimed.id}`, {
          headers: { Authorization: `Bearer ${STRIPE_KEY}`, "Stripe-Account": acctHeader },
        }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Stripe ${r.status}`))))
      : await stripe("GET", `events/${claimed.id}`);
  } catch {
    return fail(400, "UNKNOWN_EVENT", "Stripe doesn't know this event.");
  }

  // Seen it already? (Stripe retries.) Insert first so two deliveries racing
  // can't both act; on failure we delete the marker so the retry runs again.
  const { error: dupErr } = await db.from("stripe_events").insert({ id: event.id, type: event.type });
  if (dupErr) return reply(200, { ok: true, duplicate: true });

  try {
    const obj = event.data.object;
    if (event.type === "checkout.session.completed" && obj.payment_status === "paid") {
      await onPaid(obj);
    } else if (event.type === "checkout.session.expired") {
      // Nothing to undo: the order stays awaiting_payment and the buyer can
      // start a fresh checkout while the hold lasts.
    } else if (event.type === "charge.refunded") {
      const order = await orderByIntent(obj.payment_intent);
      if (order && obj.refunded && order.status !== "refunded") {
        await moveOrder(order, "refunded", { refunded_at: new Date().toISOString() });
      }
    } else if (event.type === "charge.dispute.created") {
      const order = await orderByIntent(obj.payment_intent);
      if (order) await moveOrder(order, "disputed");
    }
  } catch (e) {
    await db.from("stripe_events").delete().eq("id", event.id);
    console.error("webhook failed", event.type, e);
    return fail(500, "HANDLER", String((e as Error).message || e));
  }
  return reply(200, { ok: true });
}

async function orderByIntent(pi: unknown) {
  if (typeof pi !== "string") return null;
  const { data } = await db.from("market_orders").select("*").eq("stripe_payment_intent", pi).maybeSingle();
  return data;
}

async function onPaid(session: any) {
  const order = await getOrder(session.metadata?.order_id);
  if (!order || order.status !== "awaiting_payment") return;
  const pi = await stripe("GET", `payment_intents/${session.payment_intent}`);
  const ship = session.collected_information?.shipping_details ?? session.shipping_details ?? null;
  const shipTo = ship ? { name: ship.name, ...ship.address } : null;
  const paid = await moveOrder(order, "paid", {
    stripe_session_id: session.id,
    stripe_payment_intent: session.payment_intent,
    stripe_charge_id: pi.latest_charge,
    ship_to: shipTo,
    paid_at: new Date().toISOString(),
  });
  if (!paid) return;

  // Mark the listing sold — but only if it's still held for THIS deal. If the
  // hold somehow went to someone else, the buyer gets their money back.
  const { data: sold } = await db.from("market_listings")
    .update({ status: "sold", updated_at: new Date().toISOString() })
    .eq("id", order.listing_id).eq("status", "reserved").eq("reserved_offer_id", order.offer_id)
    .select("id, name").maybeSingle();
  if (!sold) {
    await refund(paid, "listing_no_longer_held");
    await push(order.buyer_id, "That item was no longer available, so your payment was refunded in full.", null, `market-order-${order.id}`);
    return;
  }
  // Close any other pending offers on it.
  await db.from("market_offers").update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("listing_id", order.listing_id).eq("status", "pending");
  await push(order.seller_id, `💰 ${await handle(order.buyer_id)} paid for ${sold.name} — ship it, then mark it shipped`, order.buyer_id, `market-order-${order.id}`);
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
      if (existing.some((e: any) => e.description === w.description)) continue;
      await stripe("POST", "webhook_endpoints", { url: HOOK_URL, ...w });
    }
  })().catch((e) => { hooksReady = null; throw e; });
  return hooksReady;
}

// ─── Users → us ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "METHOD", "POST only.");
  if (!STRIPE_KEY) return fail(503, "NO_STRIPE_KEY", "Payments aren't configured (STRIPE_SECRET_KEY missing).");

  try {
    // Health checks (no auth, nothing sensitive returned):
    //   ?probe=v2   can our key use Accounts v2?
    //   ?probe=link can we mint an onboarding link for the newest seller? (the
    //               link itself is thrown away) + that seller's capability states
    const probe = new URL(req.url).searchParams.get("probe");
    if (probe) {
      try {
        if (probe === "v2") { await stripeV2("GET", "core/accounts?limit=1"); return reply(200, { ok: true }); }
        if (probe === "link") {
          const { data: s } = await db.from("market_sellers").select("stripe_account_id").order("updated_at", { ascending: false }).limit(1).maybeSingle();
          if (!s) return reply(200, { ok: false, message: "no sellers yet" });
          await onboardingLink(s.stripe_account_id, "https://plushcrypt.com/");
          const caps = (await getAccount(s.stripe_account_id)).configuration?.recipient?.capabilities?.stripe_balance ?? {};
          return reply(200, { ok: true, transfers: caps.stripe_transfers?.status ?? null, payouts: caps.payouts?.status ?? null });
        }
        return reply(400, { ok: false, message: "unknown probe" });
      } catch (e) {
        return reply(200, { ok: false, status: (e as any).status, code: (e as any).stripe?.error?.code, message: (e as Error).message });
      }
    }
    await ensureWebhooks();
    if (new URL(req.url).searchParams.get("hook") === "stripe") return await onStripeEvent(req);
    return await onUser(req);
  } catch (e) {
    if (e instanceof StripeError) {
      console.error("stripe error", e.status, JSON.stringify(e.stripe));
      return fail(502, "STRIPE", e.message);
    }
    console.error(e);
    return fail(500, "SERVER", String((e as Error).message || e));
  }
});

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

  switch (body.action) {
    case "payouts_setup": {
      const base = cleanReturnBase(body.returnBase);
      if (!base) return fail(400, "RETURN_URL", "Bad return address.");
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

    case "checkout": {
      const base = cleanReturnBase(body.returnBase);
      if (!base) return fail(400, "RETURN_URL", "Bad return address.");
      const { data: offer } = await db.from("market_offers").select("*").eq("id", body.offerId ?? "").maybeSingle();
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

      // Reuse the live order for this deal (and its open Checkout page, if any).
      let { data: order } = await db.from("market_orders").select("*")
        .eq("offer_id", offer.id).not("status", "in", "(cancelled,refunded)").maybeSingle();
      if (order && order.status !== "awaiting_payment") return fail(409, "ALREADY_PAID", "You've already paid for this.");
      if (order?.stripe_session_id) {
        const old = await stripe("GET", `checkout/sessions/${order.stripe_session_id}`);
        if (old.status === "open") return reply(200, { url: old.url, orderId: order.id });
        if (old.status === "complete") return fail(409, "ALREADY_PAID", "You've already paid — it'll show up in a moment.");
      }
      if (!order) {
        const totals = computeOrderTotals(offer.amount_cents, listing.shipping_cents);
        const { data: inserted, error } = await db.from("market_orders").insert({
          listing_id: listing.id, offer_id: offer.id, buyer_id: uid, seller_id: listing.seller_id, ...totals,
        }).select().single();
        if (error) return fail(500, "DB", error.message);
        order = inserted;
      }

      const expiresAt = sessionExpiresAt(listing.reserved_until);
      const session = await stripe("POST", "checkout/sessions", {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: checkoutLineItems(order, listing.name),
        shipping_address_collection: { allowed_countries: ["US"] },
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

    case "ship": {
      const order = await getOrder(body.orderId);
      if (!order || order.seller_id !== uid) return fail(404, "ORDER", "Order not found.");
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
      const order = await getOrder(body.orderId);
      if (!order || order.buyer_id !== uid) return fail(404, "ORDER", "Order not found.");
      // Already confirmed but the transfer didn't go through last time: retry it.
      if (order.status === "delivered" && order.buyer_confirmed_at) {
        await release(order);
        return reply(200, { ok: true });
      }
      const now = new Date().toISOString();
      const delivered = await moveOrder(order, "delivered", { delivered_at: now, buyer_confirmed_at: now });
      if (!delivered) return fail(409, "ORDER_STATE", "This order can't be confirmed right now.");
      await release(delivered);
      return reply(200, { ok: true });
    }

    case "refund": {
      const order = await getOrder(body.orderId);
      if (!order) return fail(404, "ORDER", "Order not found.");
      const { data: isAdmin } = await db.from("profiles").select("is_admin").eq("id", uid).single();
      const sellerCanRefund = order.seller_id === uid && order.status === "paid";
      const adminCanRefund = !!isAdmin?.is_admin && canMove(order.status, "refunded");
      if (!sellerCanRefund && !adminCanRefund) return fail(403, "REFUND", "You can't refund this order.");
      await refund(order, order.seller_id === uid ? "seller_cancelled" : "admin");
      await push(order.buyer_id, `Your payment for ${await listingName(order.listing_id)} was refunded in full.`, uid, `market-order-${order.id}`);
      return reply(200, { ok: true });
    }

  }
  return fail(400, "ACTION", "Unknown action.");
}
