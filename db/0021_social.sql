-- ============================================================
-- Phase: Social — friends, posts, likes, comments, Top 8.
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
--
-- Design notes
-- ────────────
-- * Friendship is MUTUAL (request → accept), one row per pair. Two
--   people are friends if an 'accepted' row exists in EITHER direction.
-- * "Inner Coffin" (the themed inner-circle) is a DIRECTED overlay: I
--   can place a friend in my inner circle without reciprocity, MySpace
--   "top friends" style. Posts scoped to 'inner' are visible to the
--   people the AUTHOR placed in their inner circle.
-- * Post visibility is an ordered enum: public ⊃ friends (Coven) ⊃
--   inner (Inner Coffin). Enforced in the DB via can_see_post() so the
--   client can never read a row it isn't allowed to.
-- * Social photos live in their own 'social' bucket, readable by any
--   signed-in user (account required to use the app at all). The text
--   of a post is protected by RLS; the image is protected by an
--   unguessable random path. This is a deliberate prototype trade-off
--   — true per-tier image ACLs would need a signing Worker. See the
--   bucket policies at the bottom.
-- ============================================================

create extension if not exists pgcrypto;

-- ─── Enums ─────────────────────────────────────────────────
do $$ begin
  create type friendship_status as enum ('pending', 'accepted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type post_visibility as enum ('public', 'friends', 'inner');
exception when duplicate_object then null; end $$;

-- ─── Profile additions (bio + avatar) ──────────────────────
alter table profiles add column if not exists bio text;
alter table profiles add column if not exists avatar_path text;

-- ─── Friendships ───────────────────────────────────────────
create table if not exists friendships (
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  constraint no_self_friend check (requester_id <> addressee_id)
);
create index if not exists friendships_addressee_idx on friendships(addressee_id, status);
create index if not exists friendships_requester_idx on friendships(requester_id, status);

-- Inner Coffin: directed, no reciprocity required.
create table if not exists inner_circle (
  owner_id  uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, member_id),
  constraint no_self_inner check (owner_id <> member_id)
);
create index if not exists inner_circle_member_idx on inner_circle(member_id);

-- ─── Relationship helpers (SECURITY DEFINER → bypass RLS so
--     they can be called from inside other tables' policies
--     without recursion) ──────────────────────────────────
create or replace function are_friends(a uuid, b uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from friendships
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b)
        or (requester_id = b and addressee_id = a))
  );
$$;

create or replace function is_inner(owner uuid, member uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from inner_circle
    where owner_id = owner and member_id = member
  );
$$;

-- Can the current user see a post authored by `author` at `vis`?
create or replace function can_see_post(author uuid, vis post_visibility)
returns boolean language sql security definer stable as $$
  select case
    when author = auth.uid() then true
    when vis = 'public'  then true
    when vis = 'friends' then are_friends(author, auth.uid())
    when vis = 'inner'   then is_inner(author, auth.uid())
    else false
  end;
$$;

-- ─── Posts ─────────────────────────────────────────────────
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  body text,
  photo_path text,              -- 'social' bucket path, or null
  catalog_id text,              -- optional: the plush this story is about
  plush_name text,              -- optional denormalized featured plush name
  visibility post_visibility not null default 'friends',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint body_or_photo check (body is not null or photo_path is not null)
);
create index if not exists posts_author_idx on posts(author_id, created_at desc);
create index if not exists posts_created_idx on posts(created_at desc);

create table if not exists post_likes (
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on post_comments(post_id, created_at);

-- Top 8 — a curated, ranked showcase shown on the profile. Denormalized
-- (name + photo copied in) so viewers who aren't collection members can
-- still see it, mirroring how trade_items snapshot their plush data.
create table if not exists top_plushes (
  owner_id uuid not null references auth.users(id) on delete cascade,
  position int not null check (position between 1 and 8),
  plush_name text not null,
  catalog_id text,
  photo_path text,              -- 'social' bucket copy
  primary key (owner_id, position)
);

-- ─── RLS ───────────────────────────────────────────────────
alter table friendships    enable row level security;
alter table inner_circle   enable row level security;
alter table posts          enable row level security;
alter table post_likes     enable row level security;
alter table post_comments  enable row level security;
alter table top_plushes    enable row level security;

-- friendships: either party can see the row. The requester creates it;
-- the addressee flips it to accepted (or it gets deleted on decline).
drop policy if exists friendships_read   on friendships;
drop policy if exists friendships_insert on friendships;
drop policy if exists friendships_update on friendships;
drop policy if exists friendships_delete on friendships;
create policy friendships_read on friendships for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy friendships_insert on friendships for insert to authenticated
  with check (requester_id = auth.uid());
-- Only the addressee can accept; either side can edit their own row's
-- status. We keep it to the addressee for accepts.
create policy friendships_update on friendships for update to authenticated
  using (addressee_id = auth.uid()) with check (addressee_id = auth.uid());
create policy friendships_delete on friendships for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- inner_circle: I manage my own list; the member can see they're in it.
drop policy if exists inner_read  on inner_circle;
drop policy if exists inner_write on inner_circle;
create policy inner_read on inner_circle for select to authenticated
  using (owner_id = auth.uid() or member_id = auth.uid());
create policy inner_write on inner_circle for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- posts: visibility-gated read, author-only write.
drop policy if exists posts_read   on posts;
drop policy if exists posts_insert  on posts;
drop policy if exists posts_update  on posts;
drop policy if exists posts_delete  on posts;
create policy posts_read on posts for select to authenticated
  using (can_see_post(author_id, visibility));
create policy posts_insert on posts for insert to authenticated
  with check (author_id = auth.uid());
create policy posts_update on posts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy posts_delete on posts for delete to authenticated
  using (author_id = auth.uid());

-- likes: visible/insertable only on posts you can see; remove your own.
drop policy if exists likes_read   on post_likes;
drop policy if exists likes_insert on post_likes;
drop policy if exists likes_delete on post_likes;
create policy likes_read on post_likes for select to authenticated using (
  exists (select 1 from posts p where p.id = post_id and can_see_post(p.author_id, p.visibility))
);
create policy likes_insert on post_likes for insert to authenticated with check (
  user_id = auth.uid()
  and exists (select 1 from posts p where p.id = post_id and can_see_post(p.author_id, p.visibility))
);
create policy likes_delete on post_likes for delete to authenticated using (user_id = auth.uid());

-- comments: read on visible posts; author writes; comment author OR
-- post author can delete (basic moderation of your own thread).
drop policy if exists comments_read   on post_comments;
drop policy if exists comments_insert on post_comments;
drop policy if exists comments_delete on post_comments;
create policy comments_read on post_comments for select to authenticated using (
  exists (select 1 from posts p where p.id = post_id and can_see_post(p.author_id, p.visibility))
);
create policy comments_insert on post_comments for insert to authenticated with check (
  author_id = auth.uid()
  and exists (select 1 from posts p where p.id = post_id and can_see_post(p.author_id, p.visibility))
);
create policy comments_delete on post_comments for delete to authenticated using (
  author_id = auth.uid()
  or exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid())
);

-- top_plushes: a public showcase (any signed-in user), owner writes.
drop policy if exists top_read  on top_plushes;
drop policy if exists top_write on top_plushes;
create policy top_read  on top_plushes for select to authenticated using (true);
create policy top_write on top_plushes for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ─── Storage bucket for social photos ──────────────────────
-- Path schema: <author_uuid>/<random>.<ext>. Read by any signed-in
-- user; each user writes/deletes only under their own uuid folder.
insert into storage.buckets (id, name, public)
values ('social', 'social', false)
on conflict (id) do nothing;

drop policy if exists social_read   on storage.objects;
drop policy if exists social_write  on storage.objects;
drop policy if exists social_delete on storage.objects;
create policy social_read on storage.objects for select to authenticated
  using (bucket_id = 'social');
create policy social_write on storage.objects for insert to authenticated
  with check (bucket_id = 'social' and (storage.foldername(name))[1] = auth.uid()::text);
create policy social_delete on storage.objects for delete to authenticated
  using (bucket_id = 'social' and (storage.foldername(name))[1] = auth.uid()::text);
