// Shipping rules for the For Sale market (EasyPost labels). Pure, no I/O.
// THIS FILE EXISTS TWICE, byte-identical: supabase/functions/market-checkout/
// and supabase/functions/market-listing/ (each edge function deploys alone).
// test/market-payments.test.mjs fails if they drift — edit both.

// ─── Shipping (EasyPost) ────────────────────────────────────────────
// Services a seller can offer, matched to EasyPost rates by carrier prefix +
// service name (EasyPost's own strings; FedEx shows up as "FedExDefault").
export const SHIP_SERVICES = [
  { key: "usps_ground", label: "USPS Ground Advantage", carrier: "USPS", service: "GroundAdvantage" },
  { key: "usps_priority", label: "USPS Priority Mail", carrier: "USPS", service: "Priority" },
  { key: "usps_express", label: "USPS Priority Mail Express", carrier: "USPS", service: "Express" },
  { key: "fedex_ground", label: "FedEx Ground", carrier: "FEDEX", service: "FEDEX_GROUND" },
];
export const serviceForRate = (rate) =>
  SHIP_SERVICES.find((s) => String(rate.carrier || "").toUpperCase().startsWith(s.carrier) && rate.service === s.service) || null;

// Package presets (inches). Weight is entered separately, in ounces.
export const PARCEL_PRESETS = {
  mailer: { label: "Poly mailer (10×13)", length: 13, width: 10, height: 2 },
  small: { label: "Small box (8×6×4)", length: 8, width: 6, height: 4 },
  medium: { label: "Medium box (12×10×6)", length: 12, width: 10, height: 6 },
  large: { label: "Large box (14×12×10)", length: 14, width: 12, height: 10 },
};

// Seller's package + allowed services, as stored on the listing. Returns an
// error string or null.
export function validateShipping(parcel, services) {
  if (!parcel || !PARCEL_PRESETS[parcel.preset]) return "Pick a package size.";
  if (!Number.isInteger(parcel.weightOz) || parcel.weightOz < 1 || parcel.weightOz > 70 * 16) {
    return "Enter the packed weight (1 oz to 70 lb).";
  }
  if (!Array.isArray(services) || !services.length) return "Pick at least one shipping service.";
  if (services.some((k) => !SHIP_SERVICES.some((s) => s.key === k))) return "Unknown shipping service.";
  return null;
}
export const easypostParcel = (parcel) => {
  const p = PARCEL_PRESETS[parcel.preset];
  return { length: p.length, width: p.width, height: p.height, weight: parcel.weightOz };
};

// A US street address from a form. Returns { address } or { error }.
export function cleanAddress(a) {
  const t = (v, n) => String(v ?? "").trim().slice(0, n);
  const out = {
    name: t(a?.name, 80), street1: t(a?.street1, 100), street2: t(a?.street2, 100),
    city: t(a?.city, 60), state: t(a?.state, 20).toUpperCase(), zip: t(a?.zip, 10), country: "US",
  };
  if (!out.name || !out.street1 || !out.city) return { error: "Fill in name, street and city." };
  if (!/^[A-Z]{2}$/.test(out.state)) return { error: "Use the 2-letter state code (e.g. MA)." };
  if (!/^\d{5}(-\d{4})?$/.test(out.zip)) return { error: "Enter a 5-digit ZIP code." };
  if (!out.street2) delete out.street2;
  return { address: out };
}

// The options a buyer sees: the cheapest rate for each service the seller
// allows, cheapest first.
export function pickRates(rates, allowedKeys) {
  const best = new Map();
  for (const r of rates || []) {
    const svc = serviceForRate(r);
    if (!svc || !allowedKeys.includes(svc.key)) continue;
    const cents = Math.round(Number(r.rate) * 100);
    if (!Number.isFinite(cents) || cents <= 0) continue;
    const prev = best.get(svc.key);
    if (!prev || cents < prev.cents) {
      best.set(svc.key, { rateId: r.id, key: svc.key, label: svc.label, cents, days: r.delivery_days ?? null });
    }
  }
  return [...best.values()].sort((a, b) => a.cents - b.cents);
}

// Carrier tracking status → the order status it implies (null = no move).
export function orderStatusForTracking(status) {
  if (["in_transit", "out_for_delivery", "available_for_pickup"].includes(status)) return "shipped";
  if (status === "delivered") return "delivered";
  return null;
}
