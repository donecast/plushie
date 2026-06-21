-- 0029_coffin_buddies.sql
-- Item 10: rename "Inner Coffin" → "Castle Crew" (label-only — the DB value
-- stays 'inner') and add a new, even-more-restricted tier "Coffin Buddies".
--
-- Tier nesting:  friends  ⊇  Castle Crew (inner_circle)  ⊇  Coffin Buddies
-- Being a Coffin Buddy implies Castle Crew (and friends); Castle Crew does NOT
-- imply Coffin Buddies. Triggers below keep that invariant.

-- 1) New visibility value. Adding an enum value can't be *used* (as a literal)
--    in the same transaction, so can_see_post() below compares vis::text to
--    sidestep that restriction.
alter type post_visibility add value if not exists 'coffin_buddies';

-- 2) Coffin Buddies: directed, no reciprocity required (mirrors inner_circle).
create table if not exists coffin_buddies (
  owner_id  uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, member_id),
  constraint no_self_coffin check (owner_id <> member_id)
);
create index if not exists coffin_buddies_member_idx on coffin_buddies(member_id);

alter table coffin_buddies enable row level security;
drop policy if exists coffin_read  on coffin_buddies;
drop policy if exists coffin_write on coffin_buddies;
create policy coffin_read on coffin_buddies for select to authenticated
  using (owner_id = auth.uid() or member_id = auth.uid());
create policy coffin_write on coffin_buddies for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 3) Membership helper.
create or replace function is_coffin_buddy(owner uuid, member uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from coffin_buddies
    where owner_id = owner and member_id = member
  );
$$;

-- 4) Visibility gate now understands coffin_buddies. Uses vis::text so it's
--    safe to (re)create in the same migration that added the enum value.
create or replace function can_see_post(author uuid, vis post_visibility)
returns boolean language sql security definer stable as $$
  select case
    when author = auth.uid()            then true
    when vis::text = 'public'           then true
    when vis::text = 'friends'          then are_friends(author, auth.uid())
    when vis::text = 'inner'            then is_inner(author, auth.uid())
    when vis::text = 'coffin_buddies'   then is_coffin_buddy(author, auth.uid())
    else false
  end;
$$;

-- 5) Invariants. A Coffin Buddy is always Castle Crew; pulling someone from
--    Castle Crew also pulls them from Coffin Buddies.
create or replace function ensure_castle_on_coffin()
returns trigger language plpgsql as $$
begin
  insert into inner_circle (owner_id, member_id)
  values (new.owner_id, new.member_id)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists trg_coffin_implies_castle on coffin_buddies;
create trigger trg_coffin_implies_castle
  after insert on coffin_buddies
  for each row execute function ensure_castle_on_coffin();

create or replace function cascade_castle_removal()
returns trigger language plpgsql as $$
begin
  delete from coffin_buddies
   where owner_id = old.owner_id and member_id = old.member_id;
  return old;
end;
$$;
drop trigger if exists trg_castle_removal_cascades on inner_circle;
create trigger trg_castle_removal_cascades
  after delete on inner_circle
  for each row execute function cascade_castle_removal();
