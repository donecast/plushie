// send-push — Web Push sender for The Plush Crypt.
//
// This is the server side of the push layer: it reads stored
// push_subscriptions and delivers an encrypted Web Push message that
// reaches the user even when the app is closed. The eventual Capacitor
// wrap reuses this function and the same table; only the delivery
// transport changes (a 'web' row goes out via VAPID here, a future
// 'ios'/'android' device token would go out via APNs/FCM).
//
// Deploy:
//   supabase functions deploy send-push
// Secrets (set once):
//   supabase secrets set VAPID_PUBLIC_KEY=...           # same as config.js
//   supabase secrets set VAPID_PRIVATE_KEY=...          # NEVER commit this
//   supabase secrets set VAPID_SUBJECT=mailto:scott@donecast.com
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Callers:
//   * A signed-in user (Bearer = their access token) — may push only to
//     their own devices, unless they're an admin (profiles.is_admin),
//     who may pass `user_ids` to target others. Used by sendSelfTestPush.
//   * A trusted server caller (Bearer = the service-role key) — may pass
//     `user_ids` freely. This is the path a future DB trigger / restock
//     cron will use to fan out drop alerts.
//
// Body: { user_ids?: string[], title?, body?, url?, tag?, icon? }

import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:Scott@thebsgcompany.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "missing authorization" }, 401);

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch (_) { /* empty body is fine for a bare self-test */ }

  // ── Resolve who we're allowed to push to ──────────────────────────
  const requestedIds = Array.isArray(payload.user_ids)
    ? (payload.user_ids as string[]).filter((x) => typeof x === "string")
    : null;

  let targetIds: string[];
  if (token === SERVICE_ROLE_KEY) {
    // Trusted server caller (cron / DB trigger) — may target anyone.
    if (!requestedIds || requestedIds.length === 0) {
      return json({ error: "user_ids required for service-role calls" }, 400);
    }
    targetIds = requestedIds;
  } else {
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "invalid token" }, 401);
    const callerId = userData.user.id;

    if (requestedIds && requestedIds.length) {
      const { data: prof } = await admin
        .from("profiles").select("is_admin").eq("id", callerId).maybeSingle();
      if (!prof?.is_admin) return json({ error: "forbidden" }, 403);
      targetIds = requestedIds;
    } else {
      targetIds = [callerId];   // default: push to yourself
    }
  }

  // ── Look up subscriptions (service role bypasses RLS) ─────────────
  const { data: subs, error: subErr } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, platform")
    .in("user_id", targetIds)
    .eq("platform", "web");
  if (subErr) return json({ error: subErr.message }, 500);
  if (!subs || subs.length === 0) return json({ sent: 0, failed: 0, removed: 0, note: "no subscriptions" });

  const message = JSON.stringify({
    title: (payload.title as string) || "🦇 The Plush Crypt",
    body: (payload.body as string) || "",
    url: (payload.url as string) || "./",
    tag: (payload.tag as string) || "plush-push",
    icon: (payload.icon as string) || "./icon-192.png",
  });

  let sent = 0, failed = 0, removed = 0;
  const dead: string[] = [];

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        message,
      );
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      // 404/410 mean the subscription is gone for good — prune it.
      if (code === 404 || code === 410) { dead.push(s.id); removed++; }
      else { failed++; console.error("push send failed", code, (err as Error).message); }
    }
  }));

  if (dead.length) {
    await admin.from("push_subscriptions").delete().in("id", dead);
  }

  return json({ sent, failed, removed });
});
