-- ─── Consent log ──────────────────────────────────────────
-- Records each user's explicit acceptance of Terms + Privacy by version.
-- One row per (user, version) is enough; we keep history (no upsert) so
-- if a user accepts v1, then later re-accepts v2 after we revise, both
-- rows persist as evidence.

create table if not exists consent_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  accepted_at   timestamptz not null default now(),
  user_agent    text
);

create index if not exists consent_log_user_idx
  on consent_log(user_id, accepted_at desc);

alter table consent_log enable row level security;

drop policy if exists consent_log_read_own on consent_log;
create policy consent_log_read_own on consent_log for select to authenticated
  using (user_id = auth.uid() or is_admin());

drop policy if exists consent_log_insert_own on consent_log;
create policy consent_log_insert_own on consent_log for insert to authenticated
  with check (user_id = auth.uid());

-- No update / delete policies: consent records are append-only.
