-- 0032_comment_social.sql
-- Item 5: make comments more social — threaded replies + emoji reactions.
-- (Tags/@mentions are parsed & linkified client-side, no schema needed.)

-- 1) Replies: a comment can point at a parent comment on the same post.
alter table post_comments
  add column if not exists parent_comment_id uuid
    references post_comments(id) on delete cascade;
create index if not exists post_comments_parent_idx
  on post_comments(parent_comment_id) where parent_comment_id is not null;

-- 2) Reactions: one row per (comment, user, emoji).
create table if not exists comment_reactions (
  comment_id uuid not null references post_comments(id) on delete cascade,
  user_id    uuid not null references auth.users(id)    on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);
create index if not exists comment_reactions_comment_idx on comment_reactions(comment_id);

alter table comment_reactions enable row level security;

-- Visible if you can see the underlying post; you manage only your own rows.
drop policy if exists creact_read   on comment_reactions;
drop policy if exists creact_insert on comment_reactions;
drop policy if exists creact_delete on comment_reactions;
create policy creact_read on comment_reactions for select to authenticated
  using (exists (
    select 1 from post_comments pc
    join posts p on p.id = pc.post_id
    where pc.id = comment_reactions.comment_id
      and can_see_post(p.author_id, p.visibility)
  ));
create policy creact_insert on comment_reactions for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from post_comments pc
    join posts p on p.id = pc.post_id
    where pc.id = comment_reactions.comment_id
      and can_see_post(p.author_id, p.visibility)
  ));
create policy creact_delete on comment_reactions for delete to authenticated
  using (user_id = auth.uid());
