-- ============================================================
-- Plushie tracker — initial schema
-- Paste this entire file into the Supabase SQL Editor and run.
-- Safe to re-run; uses IF NOT EXISTS / OR REPLACE throughout.
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ─── Enums ─────────────────────────────────────────────────
do $$ begin
  create type membership_role as enum ('owner', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type trade_item_kind as enum ('offering', 'seeking');
exception when duplicate_object then null; end $$;

do $$ begin
  create type trade_status as enum (
    'pending','accepted','rejected','countered','expired','completed','cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type trade_side as enum ('proposer','recipient');
exception when duplicate_object then null; end $$;

do $$ begin
  create type feedback_rating as enum ('good','meh','bad');
exception when duplicate_object then null; end $$;

-- ─── Profiles ──────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique not null,
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-zA-Z0-9_-]{3,20}$')
);

-- ─── Collections ───────────────────────────────────────────
create table if not exists collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My Collection',
  created_at timestamptz not null default now()
);
create index if not exists collections_owner_idx on collections(owner_id);

create table if not exists collection_members (
  collection_id uuid not null references collections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role membership_role not null,
  invited_at timestamptz not null default now(),
  primary key (collection_id, user_id)
);
create index if not exists members_user_idx on collection_members(user_id);

create table if not exists collection_invites (
  token text primary key default encode(gen_random_bytes(16), 'hex'),
  collection_id uuid not null references collections(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  role membership_role not null default 'editor',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  uses_remaining integer
);

-- ─── Membership helpers (used by RLS policies) ─────────────
create or replace function is_member(coll_id uuid)
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from collection_members
    where collection_id = coll_id and user_id = auth.uid()
  );
$$;

create or replace function can_edit(coll_id uuid)
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from collection_members
    where collection_id = coll_id
      and user_id = auth.uid()
      and role in ('owner','editor')
  );
$$;

-- ─── Plushies / wishlist / pen counts ──────────────────────
create table if not exists plushies (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections(id) on delete cascade,
  name text not null,
  meaning text,
  catalog_id text,
  catalog_handle text,
  photo_path text,
  date_collected date,
  acquired_how text,
  has_bag boolean not null default false,
  retired boolean not null default false,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plushies_collection_idx on plushies(collection_id);

create table if not exists wishlist (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections(id) on delete cascade,
  name text not null,
  catalog_id text,
  catalog_handle text,
  photo_path text,
  url text,
  out_of_stock boolean not null default false,
  notes text,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wishlist_collection_idx on wishlist(collection_id);

create table if not exists pen_counts (
  collection_id uuid not null references collections(id) on delete cascade,
  pen_id text not null,
  count integer not null check (count >= 0),
  primary key (collection_id, pen_id)
);

-- ─── Trading ───────────────────────────────────────────────
create table if not exists trade_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind trade_item_kind not null,
  name text not null,
  catalog_id text,
  catalog_handle text,
  photo_path text,
  -- Public-readable copy in the 'social' bucket so other collectors can
  -- see the photo when browsing offerings (see migration 0024). photo_path
  -- stays collection-scoped for the owner's own views.
  photo_social_path text,
  notes text,
  quantity integer not null default 1 check (quantity > 0),
  reserved integer not null default 0 check (reserved >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reserved_le_quantity check (reserved <= quantity)
);
create index if not exists trade_items_owner_kind_idx on trade_items(owner_id, kind);

create table if not exists trades (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status trade_status not null default 'pending',
  parent_trade_id uuid references trades(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  responded_at timestamptz,
  proposer_shipped_at timestamptz,
  recipient_shipped_at timestamptz,
  proposer_received_at timestamptz,
  recipient_received_at timestamptz,
  message text,
  constraint not_self_trade check (proposer_id <> recipient_id)
);
create index if not exists trades_recipient_idx on trades(recipient_id, status);
create index if not exists trades_proposer_idx on trades(proposer_id, status);

create table if not exists trade_line_items (
  trade_id uuid not null references trades(id) on delete cascade,
  side trade_side not null,
  trade_item_id uuid not null references trade_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  primary key (trade_id, side, trade_item_id)
);

create table if not exists trade_addresses (
  trade_id uuid not null references trades(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  address text not null,
  created_at timestamptz not null default now(),
  primary key (trade_id, user_id)
);

create table if not exists trade_feedback (
  trade_id uuid not null references trades(id) on delete cascade,
  rater_id uuid not null references auth.users(id) on delete cascade,
  ratee_id uuid not null references auth.users(id) on delete cascade,
  rating feedback_rating not null,
  comment text,
  created_at timestamptz not null default now(),
  primary key (trade_id, rater_id)
);

-- Net score / total counts per user, joined to username
create or replace view user_feedback_summary as
select
  p.id            as user_id,
  p.username,
  coalesce(sum(case when f.rating='good' then 1 else 0 end), 0)::int    as good_count,
  coalesce(sum(case when f.rating='meh'  then 1 else 0 end), 0)::int    as meh_count,
  coalesce(sum(case when f.rating='bad'  then 1 else 0 end), 0)::int    as bad_count,
  coalesce(sum(case when f.rating='good' then 1
                    when f.rating='bad'  then -1 else 0 end), 0)::int  as net_score,
  coalesce(count(f.*), 0)::int                                          as total_count
from profiles p
left join trade_feedback f on f.ratee_id = p.id
group by p.id, p.username;

-- ─── Triggers ──────────────────────────────────────────────
-- On profile insert, auto-create a default collection with the user as owner.
create or replace function ensure_default_collection()
returns trigger language plpgsql security definer as $$
declare c_id uuid;
begin
  insert into collections (owner_id, name)
  values (new.id, new.username || '''s Collection')
  returning id into c_id;
  insert into collection_members (collection_id, user_id, role)
  values (c_id, new.id, 'owner');
  return new;
end $$;

drop trigger if exists on_profile_created on profiles;
create trigger on_profile_created
  after insert on profiles
  for each row execute function ensure_default_collection();

-- ─── Invite acceptance RPC ─────────────────────────────────
create or replace function accept_collection_invite(invite_token text)
returns uuid language plpgsql security definer as $$
declare
  inv record;
begin
  select * into inv from collection_invites where token = invite_token;
  if inv is null then raise exception 'invalid_invite'; end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    raise exception 'invite_expired';
  end if;
  if inv.uses_remaining is not null and inv.uses_remaining <= 0 then
    raise exception 'invite_exhausted';
  end if;

  insert into collection_members (collection_id, user_id, role)
  values (inv.collection_id, auth.uid(), inv.role)
  on conflict (collection_id, user_id) do nothing;

  if inv.uses_remaining is not null then
    update collection_invites
       set uses_remaining = uses_remaining - 1
     where token = invite_token;
  end if;

  return inv.collection_id;
end $$;
grant execute on function accept_collection_invite(text) to authenticated;

-- ─── RLS ───────────────────────────────────────────────────
alter table profiles            enable row level security;
alter table collections         enable row level security;
alter table collection_members  enable row level security;
alter table collection_invites  enable row level security;
alter table plushies            enable row level security;
alter table wishlist            enable row level security;
alter table pen_counts          enable row level security;
alter table trade_items         enable row level security;
alter table trades              enable row level security;
alter table trade_line_items    enable row level security;
alter table trade_addresses     enable row level security;
alter table trade_feedback      enable row level security;

-- profiles
drop policy if exists profiles_read_all     on profiles;
drop policy if exists profiles_insert_self  on profiles;
drop policy if exists profiles_update_self  on profiles;
create policy profiles_read_all     on profiles for select to authenticated using (true);
create policy profiles_insert_self  on profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update_self  on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- collections
drop policy if exists collections_member_read   on collections;
drop policy if exists collections_owner_insert  on collections;
drop policy if exists collections_owner_update  on collections;
drop policy if exists collections_owner_delete  on collections;
create policy collections_member_read   on collections for select to authenticated using (is_member(id));
create policy collections_owner_insert  on collections for insert to authenticated with check (owner_id = auth.uid());
create policy collections_owner_update  on collections for update to authenticated using (owner_id = auth.uid());
create policy collections_owner_delete  on collections for delete to authenticated using (owner_id = auth.uid());

-- collection_members
drop policy if exists members_read   on collection_members;
drop policy if exists members_write  on collection_members;
create policy members_read on collection_members for select to authenticated using (
  user_id = auth.uid()
  or exists (select 1 from collections c where c.id = collection_id and c.owner_id = auth.uid())
);
create policy members_write on collection_members for all to authenticated using (
  exists (select 1 from collections c where c.id = collection_id and c.owner_id = auth.uid())
) with check (
  exists (select 1 from collections c where c.id = collection_id and c.owner_id = auth.uid())
);

-- collection_invites (owners manage; redemption happens via accept_collection_invite RPC)
drop policy if exists invites_owner_all on collection_invites;
create policy invites_owner_all on collection_invites for all to authenticated using (
  exists (select 1 from collections c where c.id = collection_id and c.owner_id = auth.uid())
) with check (
  exists (select 1 from collections c where c.id = collection_id and c.owner_id = auth.uid())
);

-- plushies / wishlist / pen_counts
drop policy if exists plushies_read   on plushies;
drop policy if exists plushies_write  on plushies;
create policy plushies_read  on plushies for select to authenticated using (is_member(collection_id));
create policy plushies_write on plushies for all to authenticated using (can_edit(collection_id)) with check (can_edit(collection_id));

drop policy if exists wishlist_read  on wishlist;
drop policy if exists wishlist_write on wishlist;
create policy wishlist_read  on wishlist for select to authenticated using (is_member(collection_id));
create policy wishlist_write on wishlist for all to authenticated using (can_edit(collection_id)) with check (can_edit(collection_id));

drop policy if exists pen_counts_read  on pen_counts;
drop policy if exists pen_counts_write on pen_counts;
create policy pen_counts_read  on pen_counts for select to authenticated using (is_member(collection_id));
create policy pen_counts_write on pen_counts for all to authenticated using (can_edit(collection_id)) with check (can_edit(collection_id));

-- trade_items (public read for discovery, owner write)
drop policy if exists trade_items_read  on trade_items;
drop policy if exists trade_items_write on trade_items;
create policy trade_items_read  on trade_items for select to authenticated using (true);
create policy trade_items_write on trade_items for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- trades (only the two parties)
drop policy if exists trades_read           on trades;
drop policy if exists trades_proposer_ins   on trades;
drop policy if exists trades_party_update   on trades;
create policy trades_read         on trades for select to authenticated using (proposer_id = auth.uid() or recipient_id = auth.uid());
create policy trades_proposer_ins on trades for insert to authenticated with check (proposer_id = auth.uid());
create policy trades_party_update on trades for update to authenticated
  using     (proposer_id = auth.uid() or recipient_id = auth.uid())
  with check(proposer_id = auth.uid() or recipient_id = auth.uid());

-- trade_line_items
drop policy if exists trade_li_read   on trade_line_items;
drop policy if exists trade_li_write  on trade_line_items;
create policy trade_li_read on trade_line_items for select to authenticated using (
  exists (select 1 from trades t where t.id = trade_id and (t.proposer_id = auth.uid() or t.recipient_id = auth.uid()))
);
create policy trade_li_write on trade_line_items for insert to authenticated with check (
  exists (select 1 from trades t
           where t.id = trade_id
             and t.proposer_id = auth.uid()
             and t.status = 'pending')
);

-- trade_addresses (both parties see, each user writes only their own row)
drop policy if exists trade_addr_read  on trade_addresses;
drop policy if exists trade_addr_write on trade_addresses;
create policy trade_addr_read on trade_addresses for select to authenticated using (
  exists (select 1 from trades t where t.id = trade_id and (t.proposer_id = auth.uid() or t.recipient_id = auth.uid()))
);
create policy trade_addr_write on trade_addresses for all to authenticated
  using     (user_id = auth.uid())
  with check(user_id = auth.uid());

-- trade_feedback (public read for trust display, self-write)
drop policy if exists feedback_read   on trade_feedback;
drop policy if exists feedback_write  on trade_feedback;
create policy feedback_read  on trade_feedback for select to authenticated using (true);
create policy feedback_write on trade_feedback for insert to authenticated with check (rater_id = auth.uid());

-- ─── Storage bucket for photos ─────────────────────────────
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- Paths are <collection_id>/<filename>; the first folder segment is the collection id.
drop policy if exists photos_read   on storage.objects;
drop policy if exists photos_write  on storage.objects;
drop policy if exists photos_delete on storage.objects;
create policy photos_read on storage.objects for select to authenticated using (
  bucket_id = 'photos'
  and is_member( ((storage.foldername(name))[1])::uuid )
);
create policy photos_write on storage.objects for insert to authenticated with check (
  bucket_id = 'photos'
  and can_edit( ((storage.foldername(name))[1])::uuid )
);
create policy photos_delete on storage.objects for delete to authenticated using (
  bucket_id = 'photos'
  and can_edit( ((storage.foldername(name))[1])::uuid )
);
