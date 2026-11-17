-- ============================================================
-- Plushie tracker — migration 0112: the For Sale on/off switch.
-- Safe to re-run.
-- ============================================================
--
-- Until now market_allowed() hardcoded "admins + redrambler". Opening the
-- market to everyone must not need a code deploy or a migration, so the gate
-- now also says yes when:
--   • app_settings 'feature.market' is true   → open to every member, or
--   • the user has a row in market_testers     → early access for one person.
-- Admins flip both from the Admin panel. market_allowed() stays the ONE gate:
-- RLS, the offer RPCs and both edge functions call it, and the app asks it
-- (rpc) instead of keeping its own copy of the rule.
--
-- Blocked, ghosted and deletion-requested accounts are never allowed.

create table if not exists market_testers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table market_testers enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'market_testers' and policyname = 'market_testers_admin') then
    create policy market_testers_admin on market_testers
      for all to authenticated using (is_admin()) with check (is_admin());
  end if;
end $$;

create or replace function market_allowed(p_uid uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from profiles p
    where p.id = p_uid
      and not p.app_blocked
      and not p.ghosted
      and p.deletion_requested_at is null
      and (
        p.is_admin
        or lower(coalesce(p.username::text, '')) in ('redrambler')
        or exists (select 1 from market_testers t where t.user_id = p.id)
        or coalesce((select s.value = 'true'::jsonb from app_settings s where s.key = 'feature.market'), false)
      )
  );
$$;

-- Confirmation: who can use the market right now.
select
  coalesce((select value::text from app_settings where key = 'feature.market'), 'not set (closed)') as open_to_everyone,
  (select count(*) from market_testers) as early_access_users,
  (select count(*) from profiles p where market_allowed(p.id)) as members_allowed_now;
