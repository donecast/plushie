-- ============================================================
-- Plushie tracker — migration 0111: follow up on incomplete sign-ups
-- Paste into Supabase SQL Editor and run. Safe to re-run.
--
-- db/0092 surfaced auth accounts that never became members; db/0093 lets an
-- admin delete one. This adds the other half: FOLLOWING UP. An admin can
-- re-send the sign-in email (done client-side via signInWithOtp — the exact
-- same email a fresh sign-in sends) or email the person directly, and we
-- record each nudge here so the admin table shows "last followed up" and
-- nobody gets pestered twice.
--
-- Also adds admin_incomplete_signups_v2(), which returns auth.users'
-- confirmation_sent_at (the last time Supabase actually handed an email to
-- SMTP for this account) plus the follow-up log summary.
-- ============================================================

create table if not exists signup_followups (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('resend', 'email')),
  sent_by     uuid not null references auth.users(id) on delete set null,
  sent_at     timestamptz not null default now()
);
create index if not exists signup_followups_user_idx on signup_followups (user_id, sent_at desc);
alter table signup_followups enable row level security;
-- No policies on purpose: the table is only ever touched through the
-- SECURITY DEFINER RPCs below, which gate on is_admin().

-- Record one follow-up. Refuses for anyone who already has a profile — a
-- real member is never an "incomplete sign-up".
create or replace function admin_log_signup_followup(target uuid, followup_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'forbidden: admin required';
  end if;
  if target is null then
    raise exception 'target required';
  end if;
  if followup_kind not in ('resend', 'email') then
    raise exception 'unknown follow-up kind %', followup_kind;
  end if;
  if exists (select 1 from profiles where id = target) then
    raise exception 'target % has a profile — not an incomplete sign-up', target;
  end if;
  if not exists (select 1 from auth.users where id = target) then
    raise exception 'target % is not an auth account', target;
  end if;
  insert into signup_followups (user_id, kind, sent_by) values (target, followup_kind, auth.uid());
end;
$$;
grant execute on function admin_log_signup_followup(uuid, text) to authenticated;

-- Widened listing. Postgres won't let create-or-replace change a function's
-- return columns, so this is a new _v2 function; the 0092 original stays for
-- any client still on the old bundle.
create or replace function admin_incomplete_signups_v2()
returns table(
  id                    uuid,
  email                 text,
  created_at            timestamptz,
  last_sign_in_at       timestamptz,
  confirmed             boolean,
  confirmation_sent_at  timestamptz,
  last_followup_at      timestamptz,
  last_followup_kind    text,
  followup_count        integer
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    return;
  end if;
  return query
    select
      u.id,
      u.email::text,
      u.created_at,
      u.last_sign_in_at,
      (u.email_confirmed_at is not null) as confirmed,
      u.confirmation_sent_at,
      f.last_at,
      f.last_kind,
      coalesce(f.n, 0)::integer
    from auth.users u
    left join profiles p on p.id = u.id
    left join lateral (
      select max(s.sent_at) as last_at,
             (array_agg(s.kind order by s.sent_at desc))[1] as last_kind,
             count(*)::integer as n
      from signup_followups s where s.user_id = u.id
    ) f on true
    where p.id is null
    order by u.created_at desc;
end;
$$;
grant execute on function admin_incomplete_signups_v2() to authenticated;

do $$ begin raise notice 'signup_followups + admin_log_signup_followup() + admin_incomplete_signups_v2() ready (db/0111 applied).'; end $$;
