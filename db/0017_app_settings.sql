-- ============================================================
-- Plushie tracker — migration 0017: app_settings
-- Paste into Supabase SQL Editor and run.
-- Safe to re-run (uses CREATE IF NOT EXISTS / on conflict).
-- ============================================================

-- Generic key/value bag for admin-toggleable app behavior. First
-- consumer is the user_photo_uploads gate ahead of a paywall; more
-- flags will land here as we add gated features. Values are jsonb so
-- a flag can be a boolean, a number, a list of usernames, etc.
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table app_settings enable row level security;

drop policy if exists app_settings_read on app_settings;
create policy app_settings_read on app_settings for select to authenticated
  using (true);

drop policy if exists app_settings_write on app_settings;
create policy app_settings_write on app_settings for all to authenticated
  using (is_admin()) with check (is_admin());

-- Seed the photo-upload flag as ON so behavior doesn't change the
-- moment this migration lands. Admin flips it OFF when the paywall
-- is ready to gate end-user photo contributions.
insert into app_settings (key, value)
  values ('feature.user_photo_uploads', 'true'::jsonb)
  on conflict (key) do nothing;
