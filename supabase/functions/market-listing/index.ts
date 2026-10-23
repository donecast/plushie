// market-listing — the ONLY writer of For Sale listings (db/0106).
//
// Why a function: the listing rule ("only items Plushie Dreadfuls isn't
// selling right now; if PD restocks, only at or under PD's price") needs a
// live PD check the browser can't be trusted with. This function verifies the
// seller owns the copy, asks PD itself, and writes the listing with a
// privileged key. Clients have no INSERT/UPDATE policy on market_listings.
//
// Deploy (default JWT verification ON — callers are signed-in users):
//   supabase functions deploy market-listing
// Uses SEND_PUSH_KEY (same privileged key send-push uses) or the auto-injected
// SUPABASE_SERVICE_ROLE_KEY. SUPABASE_URL / SUPABASE_ANON_KEY are injected.
//
// Body:
//   { action: 'create', plushieId, priceCents, parcel, services[], notes?, extras?, photoPaths[] }
//   { action: 'update', listingId, priceCents, parcel, services[], notes?, extras?, photoPaths[] }
// parcel = { preset, weightOz }; services = shipping.mjs SHIP_SERVICES keys.
// The seller must have saved a ship-from address (market_ship_from) first.
// 'update' re-runs the PD check and un-pauses a restock-paused listing that
// now passes.
// Errors: { error: CODE, message, pdPriceCents? } with a 4xx/5xx status.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { decideListing, judgePdProduct, validateDetails, variantIdFromCatalogId } from "./rules.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SECRET_KEY = Deno.env.get("SEND_PUSH_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PD_ORIGIN = "https://plushiedreadfuls.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
const fail = (status: number, error: string, message: string, extra: Record<string, unknown> = {}) =>
  reply(status, { error, message, ...extra });

// Ask PD about a product. 404 → null (not on the store). Anything else that
// isn't a clean 200 throws: we never guess "sold out" when PD didn't answer.
async function fetchPdProduct(handle: string) {
  const res = await fetch(`${PD_ORIGIN}/products/${encodeURIComponent(handle)}.js`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`PD answered ${res.status}`);
  return await res.json();
}

const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "METHOD", "POST only.");

  // ── Who's calling ──
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userData?.user) return fail(401, "AUTH", "Sign in again.");
  const uid = userData.user.id;

  const db = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });
  const { data: allowed, error: gateErr } = await db.rpc("market_allowed", { p_uid: uid });
  if (gateErr) return fail(500, "GATE", gateErr.message);
  if (!allowed) return fail(403, "MARKET_NOT_ENABLED", "Selling isn't open to your account yet.");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, "BODY", "Bad request body."); }
  const action = body.action;
  if (action !== "create" && action !== "update") return fail(400, "ACTION", "Unknown action.");

  const details = {
    priceCents: body.priceCents,
    parcel: body.parcel && typeof body.parcel === "object"
      ? { preset: (body.parcel as any).preset, weightOz: (body.parcel as any).weightOz }
      : null,
    services: Array.isArray(body.services) ? [...new Set(body.services as string[])] : null,
    notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
    photoPaths: body.photoPaths,
  };
  const invalid = validateDetails(uid, details);
  if (invalid) return fail(400, "INVALID", invalid);
  const { data: shipFrom, error: sfErr } = await db.from("market_ship_from").select("user_id").eq("user_id", uid).maybeSingle();
  if (sfErr) return fail(500, "DB", sfErr.message);
  if (!shipFrom) return fail(400, "NO_SHIP_FROM", "Add the address you'll ship from first.");
  const extras = Array.isArray(body.extras)
    ? (body.extras as { name: unknown; included: unknown }[])
        .filter((e) => typeof e?.name === "string")
        .map((e) => ({ name: String(e.name).slice(0, 80), included: !!e.included }))
        .slice(0, 20)
    : null;

  // ── Resolve what's being sold ──
  let listing: Record<string, any> | null = null;
  let catalogId: string, handle: string | null, name: string, plushieId: string | null;

  if (action === "create") {
    const { data: p, error } = await db.from("plushies")
      .select("id, name, catalog_id, catalog_handle, quantity, collections!inner(owner_id)")
      .eq("id", body.plushieId as string).maybeSingle();
    if (error) return fail(500, "DB", error.message);
    // deno-lint-ignore no-explicit-any
    if (!p || (p as any).collections?.owner_id !== uid) return fail(404, "NOT_OWNED", "That item isn't in your collection.");
    if (!p.catalog_id) return fail(400, "NOT_CATALOG", "Only catalog items can be sold.");
    // One open listing per copy you own.
    const { count, error: cErr } = await db.from("market_listings")
      .select("id", { count: "exact", head: true })
      .eq("plushie_id", p.id).in("status", ["active", "paused", "reserved"]);
    if (cErr) return fail(500, "DB", cErr.message);
    if ((count ?? 0) >= (p.quantity ?? 1)) {
      return fail(409, "ALREADY_LISTED", "Every copy you own of this is already listed.");
    }
    catalogId = p.catalog_id; handle = p.catalog_handle; name = p.name; plushieId = p.id;
  } else {
    const { data: l, error } = await db.from("market_listings").select("*")
      .eq("id", body.listingId as string).maybeSingle();
    if (error) return fail(500, "DB", error.message);
    if (!l || l.seller_id !== uid) return fail(404, "NOT_FOUND", "Listing not found.");
    if (!["active", "paused"].includes(l.status)) {
      return fail(409, "LOCKED", l.status === "reserved"
        ? "A buyer has this on hold — it can't be edited right now."
        : "This listing is closed.");
    }
    listing = l;
    catalogId = l.catalog_id; handle = l.catalog_handle; name = l.name; plushieId = l.plushie_id;
  }

  // ── Ask Plushie Dreadfuls ──
  const variantId = variantIdFromCatalogId(catalogId);
  let check;
  try {
    check = judgePdProduct(handle ? await fetchPdProduct(handle) : null, variantId);
  } catch (err) {
    console.error("PD check failed", handle, err);
    return fail(502, "PD_UNREACHABLE", "Couldn't reach Plushie Dreadfuls to check stock. Try again in a minute.");
  }
  const verdict = decideListing(action, check, details.priceCents as number);
  if (!verdict.ok) {
    return verdict.code === "PD_IN_STOCK"
      ? fail(409, "PD_IN_STOCK", `Plushie Dreadfuls is selling this right now (${dollars(verdict.pdPriceCents)}), so it can't be listed.`, { pdPriceCents: verdict.pdPriceCents })
      : fail(409, "PD_PRICE_CAP", `Plushie Dreadfuls has this in stock at ${dollars(verdict.pdPriceCents)} — price it at or below that.`, { pdPriceCents: verdict.pdPriceCents });
  }

  // ── Write ──
  const photoPaths = details.photoPaths as string[];
  const row = {
    price_cents: details.priceCents,
    shipping_cents: 0,                 // real rate is picked by the buyer at checkout
    parcel: details.parcel,
    ship_services: details.services,
    notes: details.notes,
    extras,
    cover_path: photoPaths[0],
    pd_checked_at: new Date().toISOString(),
    pd_state: verdict.pdState,
    pd_price_cents: check.pdPriceCents,
    updated_at: new Date().toISOString(),
  };

  let listingId: string;
  if (action === "create") {
    const { data: created, error } = await db.from("market_listings").insert({
      ...row,
      seller_id: uid,
      plushie_id: plushieId,
      catalog_id: catalogId,
      catalog_handle: handle,
      pd_variant_id: variantId,
      name,
      status: "active",
    }).select("id").single();
    if (error) return fail(500, "DB", error.message);
    listingId = created.id;
  } else {
    // A passing edit clears any restock pause.
    const { error } = await db.from("market_listings")
      .update({ ...row, status: "active", pause_reason: null, paused_at: null })
      .eq("id", listing!.id).in("status", ["active", "paused"]);
    if (error) return fail(500, "DB", error.message);
    listingId = listing!.id;
    const { error: delErr } = await db.from("market_listing_photos").delete().eq("listing_id", listingId);
    if (delErr) return fail(500, "DB", delErr.message);
  }

  const { error: photoErr } = await db.from("market_listing_photos")
    .insert(photoPaths.map((p, i) => ({ listing_id: listingId, social_path: p, position: i })));
  if (photoErr) {
    // A brand-new listing without its proof photos must not go live.
    if (action === "create") await db.from("market_listings").delete().eq("id", listingId);
    return fail(500, "DB", photoErr.message);
  }

  return reply(200, { id: listingId, pdState: verdict.pdState, pdPriceCents: check.pdPriceCents });
});
