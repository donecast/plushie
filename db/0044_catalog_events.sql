-- 0044_catalog_events.sql
-- Catalog change feed ("Stirrings"): a snapshot of each store item's salient
-- state, plus an append-only log of transitions (added / restocked / sold out /
-- retired / unretired). The client recomputes the diff after each live catalog
-- refresh and calls sync_catalog_events(); the function compares against the
-- snapshot inside one transaction and writes events — race-safe, because the
-- first caller updates the snapshot so a concurrent caller sees no delta.

create table if not exists catalog_snapshot (
  handle text primary key,
  name text,
  image text,
  available boolean,
  retired boolean,
  price numeric,
  updated_at timestamptz not null default now()
);

create table if not exists catalog_events (
  id uuid primary key default gen_random_uuid(),
  handle text not null,
  name text,
  image text,
  kind text not null,   -- added | restocked | sold_out | retired | unretired
  created_at timestamptz not null default now()
);
create index if not exists catalog_events_created_idx on catalog_events(created_at desc);

alter table catalog_snapshot enable row level security;
alter table catalog_events  enable row level security;
-- Anyone signed in can read the feed. Writes happen only via the SECURITY
-- DEFINER function below (no client INSERT policy on either table).
drop policy if exists catalog_events_read on catalog_events;
create policy catalog_events_read on catalog_events
  for select using (auth.role() = 'authenticated');

-- items: jsonb array of { handle, name, image, available, retired, price }
create or replace function sync_catalog_events(items jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  it jsonb;
  snap catalog_snapshot%rowtype;
  h text; nm text; img text; av boolean; rt boolean; pr numeric;
  n int := 0;
  seeded boolean;
  is_new boolean;
begin
  -- Only emit "added" once the snapshot is seeded, so the first full backfill
  -- doesn't spam the feed with hundreds of "added" events.
  seeded := exists (select 1 from catalog_snapshot limit 1);

  for it in select * from jsonb_array_elements(items)
  loop
    h := it->>'handle';
    if h is null or h = '' then continue; end if;
    nm  := it->>'name';
    img := it->>'image';
    av  := coalesce((it->>'available')::boolean, false);
    rt  := coalesce((it->>'retired')::boolean, false);
    pr  := nullif(it->>'price','')::numeric;

    select * into snap from catalog_snapshot where handle = h for update;
    is_new := not found;

    if is_new then
      if seeded then
        insert into catalog_events(handle, name, image, kind) values (h, nm, img, 'added');
        n := n + 1;
      end if;
    else
      if rt and not coalesce(snap.retired, false) then
        insert into catalog_events(handle, name, image, kind) values (h, nm, img, 'retired'); n := n + 1;
      elsif coalesce(snap.retired, false) and not rt then
        insert into catalog_events(handle, name, image, kind) values (h, nm, img, 'unretired'); n := n + 1;
      end if;
      if not rt then
        if av and not coalesce(snap.available, false) then
          insert into catalog_events(handle, name, image, kind) values (h, nm, img, 'restocked'); n := n + 1;
        elsif coalesce(snap.available, false) and not av then
          insert into catalog_events(handle, name, image, kind) values (h, nm, img, 'sold_out'); n := n + 1;
        end if;
      end if;
    end if;

    insert into catalog_snapshot(handle, name, image, available, retired, price, updated_at)
      values (h, nm, img, av, rt, pr, now())
      on conflict (handle) do update set
        name = excluded.name, image = excluded.image,
        available = excluded.available, retired = excluded.retired,
        price = excluded.price, updated_at = now();
  end loop;
  return n;
end;
$$;

grant execute on function sync_catalog_events(jsonb) to authenticated;
