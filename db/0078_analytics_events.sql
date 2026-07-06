-- ============================================================
-- Plushie tracker — migration 0078: lightweight, first-party analytics.
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
--
-- Why
-- ───
-- Six weeks of features have shipped with no way to tell whether any of
-- them bring people back. The native-app launch is gated (per project
-- notes) on "push wired + retention showing up" — push is wired, but we
-- can't see retention because nothing records it. This is the smallest
-- honest instrument: one append-only event per meaningful action, from
-- which DAU/WAU, D1/D7 return rate, and per-feature engagement all fall
-- out of a SQL query.
--
-- Design notes
-- ────────────
-- * First-party only. No third-party SDK, no cookies, no cross-site
--   anything — the events never leave Supabase. Capacitor-safe: the same
--   table serves 'ios'/'android' rows when the native wrap lands, exactly
--   like push_subscriptions (0037) keeps its transport in a `platform`
--   column.
-- * Append-only. Clients may INSERT their own rows and nothing else — no
--   update, no delete, no read. Reads are for the service role (SQL
--   editor / a future admin dashboard), so one member can never see
--   another's activity. That keeps this privacy-tight by construction.
-- * `props` is a small jsonb bag for event-specific detail (e.g. which
--   tab). Keep it tiny and non-PII — this is for counts, not surveillance.
-- * `session_id` is a per-page-load id the client generates, so funnels
--   ("opened app → viewed trade") can group rows without needing a login
--   event stream.
-- ============================================================

create table if not exists analytics_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  event       text not null,                        -- 'app_open' | 'tab_view' | …
  props       jsonb not null default '{}'::jsonb,   -- small, non-PII event detail
  platform    text not null default 'web',          -- 'web' | future: 'ios' | 'android'
  session_id  text,                                 -- per-load id, for funnels
  created_at  timestamptz not null default now()
);

-- Rollups slice by time, by user (retention cohorts), and by event type.
create index if not exists analytics_events_created_idx      on analytics_events(created_at);
create index if not exists analytics_events_user_created_idx on analytics_events(user_id, created_at);
create index if not exists analytics_events_event_idx        on analytics_events(event, created_at);

alter table analytics_events enable row level security;

-- Insert-own only. No select/update/delete policy exists, so PostgREST
-- denies clients all three — a member can write their own events and read
-- nobody's (their own included). Analytics reads run under the service
-- role, which bypasses RLS. When an in-app admin dashboard is built, add a
-- select policy gated on the same is_moderator/is_admin check the rest of
-- the admin surface uses; until then, query from the SQL editor.
drop policy if exists analytics_insert_own on analytics_events;
create policy analytics_insert_own on analytics_events
  for insert with check (auth.uid() = user_id);
