-- ============================================================
-- Plushie tracker — migration 0079: polls on posts
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
-- ============================================================
--
-- Facebook-style polls attached to a post. The post BODY is the poll question
-- (FB standard — the text you type is the question); options/votes live in
-- child tables keyed to the post, mirroring how post_likes / post_comments hang
-- off posts. Reads are gated by the same can_see_post(author, visibility) helper
-- (0021), so a poll is exactly as visible as its post.
--
-- Scope:
--   * multi     — allow choosing more than one option ("Allow multiple answers")
--   * allow_add — let anyone who can see the post add an option
--   * closes_at — optional end date; after it, voting is rejected server-side
-- Votes are ANONYMOUS in the product (we show tallies + %, not who voted) — a
-- deliberate departure from Facebook for a small community. The table still
-- stores user_id so a person votes once per option and can change/remove it.

-- ─── Tables ────────────────────────────────────────────────
create table if not exists polls (
  post_id     uuid primary key references posts(id) on delete cascade,
  multi       boolean not null default false,   -- may pick more than one option
  allow_add   boolean not null default false,   -- non-authors may add options
  closes_at   timestamptz,                       -- null = never closes
  created_at  timestamptz not null default now()
);

create table if not exists poll_options (
  id        uuid primary key default gen_random_uuid(),
  post_id   uuid not null references posts(id) on delete cascade,
  label     text not null,
  position  int not null default 0,              -- display order
  added_by  uuid references auth.users(id) on delete set null,  -- who added it (for allow_add / moderation)
  created_at timestamptz not null default now()
);
create index if not exists poll_options_post_idx on poll_options(post_id, position);

-- One row per (option, user): the PK blocks double-voting the SAME option.
-- Single-choice ("one option per poll") is enforced in the data layer — it
-- deletes the voter's other rows for this post before inserting, exactly the
-- swap pattern post_likes uses for reactions. post_id is denormalized so RLS
-- and the single-choice swap don't need a join through poll_options.
create table if not exists poll_votes (
  option_id  uuid not null references poll_options(id) on delete cascade,
  post_id    uuid not null references posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, user_id)
);
create index if not exists poll_votes_post_idx on poll_votes(post_id);

-- ─── RLS ───────────────────────────────────────────────────
alter table polls        enable row level security;
alter table poll_options enable row level security;
alter table poll_votes   enable row level security;

-- polls: readable on any post you can see; only the post author creates/edits it.
drop policy if exists polls_read   on polls;
drop policy if exists polls_insert on polls;
drop policy if exists polls_update on polls;
drop policy if exists polls_delete on polls;
create policy polls_read on polls for select to authenticated using (
  exists (select 1 from posts p where p.id = post_id and can_see_post(p.author_id, p.visibility))
);
create policy polls_insert on polls for insert to authenticated with check (
  exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid())
);
create policy polls_update on polls for update to authenticated using (
  exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid())
) with check (
  exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid())
);
create policy polls_delete on polls for delete to authenticated using (
  exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid())
);

-- poll_options: readable on visible posts. Inserted by the post author, OR by
-- anyone who can see the post when that poll has allow_add. added_by must be me.
drop policy if exists poll_options_read   on poll_options;
drop policy if exists poll_options_insert on poll_options;
drop policy if exists poll_options_delete on poll_options;
create policy poll_options_read on poll_options for select to authenticated using (
  exists (select 1 from posts p where p.id = post_id and can_see_post(p.author_id, p.visibility))
);
create policy poll_options_insert on poll_options for insert to authenticated with check (
  exists (select 1 from posts p where p.id = post_id and (
    p.author_id = auth.uid()
    or (can_see_post(p.author_id, p.visibility)
        and exists (select 1 from polls pl where pl.post_id = poll_options.post_id and pl.allow_add))
  ))
  and (added_by = auth.uid() or added_by is null)
);
-- Post author can prune options (basic moderation of their own poll).
create policy poll_options_delete on poll_options for delete to authenticated using (
  exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid())
);

-- poll_votes: read on visible posts; vote only as myself, only on a poll I can
-- see that hasn't closed; remove my own vote anytime.
drop policy if exists poll_votes_read   on poll_votes;
drop policy if exists poll_votes_insert on poll_votes;
drop policy if exists poll_votes_delete on poll_votes;
create policy poll_votes_read on poll_votes for select to authenticated using (
  exists (select 1 from posts p where p.id = post_id and can_see_post(p.author_id, p.visibility))
);
create policy poll_votes_insert on poll_votes for insert to authenticated with check (
  user_id = auth.uid()
  and exists (select 1 from posts p where p.id = post_id and can_see_post(p.author_id, p.visibility))
  and exists (select 1 from polls pl where pl.post_id = poll_votes.post_id
              and (pl.closes_at is null or pl.closes_at > now()))
  -- the chosen option must belong to this post's poll (no cross-poll voting)
  and exists (select 1 from poll_options o where o.id = poll_votes.option_id and o.post_id = poll_votes.post_id)
);
create policy poll_votes_delete on poll_votes for delete to authenticated using (user_id = auth.uid());

select 'db/0079 applied ✔ — polls, poll_options, poll_votes ready' as status;
